// server/index.js
import http from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  createBattleState,
  addUnit,
  getUnitAt,
  moveUnit,
  attack,
  hexDistance,
  applyKingXp,
} from '../shared/battleCore.js';

import {
  makeInitMessage,
  makeStateMessage,
  makeErrorMessage,
} from '../shared/messages.js';
import { UNIT_CATALOG } from '../shared/unitCatalog.js';
import { baseIncomeForRound, interestIncome, streakBonus, COINS_CAP } from '../shared/economy.js';

// ---- game state (authoritative) ----
const state = createBattleState();
let nextUnitId = 1;

state.battleSecondsLeft = state.battleSecondsLeft ?? 0;

let battleCountdownTimer = null;
const BATTLE_DURATION_SECONDS = 40; // ✅ "Сражение: 40с"

// ---- rounds / prep timer ----
state.round = state.round ?? 1;              // игра стартует с 1 раунда
state.prepSecondsLeft = state.prepSecondsLeft ?? 0;

let prepTimer = null;

// ---- economy / rounds ----
state.winStreak = state.winStreak ?? 0;  // подряд побед
state.loseStreak = state.loseStreak ?? 0; // подряд пораж

// слепок расстановки на момент старта боя (для возврата в prep)
let prepSnapshot = null; // Array of units

// ---- battle timers (GLOBAL, not per connection) ----
let battleTimer = null;
let finishTimeout = null;

function clampCoinsKing(king) {
  king.coins = Math.max(0, Math.min(COINS_CAP, Number(king.coins ?? 0)));
}

function clampPlayerCoins() {
  if (!state?.kings?.player) return;
  const c = Number(state.kings.player.coins ?? 0);
  state.kings.player.coins = Math.max(0, Math.min(COINS_CAP, c));
}

function grantRoundGold(result) {
  // result: 'victory' | 'defeat' | 'draw'
  const king = state.kings.player;

  const round = Number(state.round ?? 1);
  const base = baseIncomeForRound(round);

  const didWin = (result === 'victory');
  const didLose = (result === 'defeat');

  // победа даёт +1 (как в DAC). Ничья = 0.
  const winBonus = didWin ? 1 : 0;

  // стрики
  if (didWin) {
    state.winStreak = (state.winStreak ?? 0) + 1;
    state.loseStreak = 0;
  } else if (didLose) {
    state.loseStreak = (state.loseStreak ?? 0) + 1;
    state.winStreak = 0;
  } else {
    // draw: обычно сбрасывают стрики
    state.winStreak = 0;
    state.loseStreak = 0;
  }

  const streak = didWin
    ? streakBonus(state.winStreak)
    : didLose
      ? streakBonus(state.loseStreak)
      : 0;

  const interest = interestIncome(king.coins);

  king.coins += (base + winBonus + streak + interest);
  clampPlayerCoins();
}

function stopBattleTimers() {
  if (battleTimer) {
    clearInterval(battleTimer);
    battleTimer = null;
  }
  if (finishTimeout) {
    clearTimeout(finishTimeout);
    finishTimeout = null;
  }
  if (battleCountdownTimer) {
    clearInterval(battleCountdownTimer);
    battleCountdownTimer = null;
  }
  state.battleSecondsLeft = 0;
}

function stopPrepTimer() {
  if (prepTimer) {
    clearInterval(prepTimer);
    prepTimer = null;
  }
}

function resetGameToStart() {
  stopBattleTimers();
  stopPrepTimer();

  prepSnapshot = null;
  nextUnitId = 1;

  state.phase = 'prep';
  state.result = null;
  state.units = [];

  state.round = 1;
  state.prepSecondsLeft = 0;
  state.battleSecondsLeft = 0;
  state.winStreak = 0;
  state.loseStreak = 0;

  state.kings = {
    player: { hp: 100, maxHp: 100, coins: 100, level: 1, xp: 0 },
    enemy:  { hp: 100, maxHp: 100, coins: 0, visible: false, level: 1, xp: 0 },
  };

  state.shop = { offers: [] };

  for (const owned of clientToUnits.values()) {
    owned.clear();
  }

  broadcast(makeStateMessage(state));
}

function prepDurationForRound(round) {
  return 40;
}

function startPrepCountdown() {
  stopPrepTimer();

  // если уже battle — не стартуем
  if (state.phase !== 'prep') return;

  const duration = prepDurationForRound(Number(state.round ?? 1));
  state.prepSecondsLeft = duration;
  broadcast(makeStateMessage(state));

  prepTimer = setInterval(() => {
    if (state.phase !== 'prep') {
      stopPrepTimer();
      return;
    }

    state.prepSecondsLeft = Math.max(0, Number(state.prepSecondsLeft ?? 0) - 1);
    broadcast(makeStateMessage(state));

    if (state.prepSecondsLeft <= 0) {
      stopPrepTimer();
      startBattle(); // авто-старт боя
    }
  }, 1000);
}


// кто каким юнитом управляет
/** @type {Map<string, Set<number>>} */
const clientToUnits = new Map(); // clientId -> Set(unitIds)

// держим список сокетов
/** @type {Map<string, import('ws').WebSocket>} */
const clients = new Map();

// ---- board limits (должны совпадать с клиентом) ----
const GRID_COLS = 12;
const GRID_ROWS = 8;
const BENCH_SLOTS = 8;

// ---- MERGE (server-authoritative) ----
const MAX_RANK = 3;

// key для группировки "одинаковых"
function mergeKey(u) {
  return `${u.type ?? 'Unknown'}#${u.rank ?? 1}`;
}

// Удаляет юнита из state + из owned set
function removeOwnedUnit(state, owned, unitId) {
  state.units = state.units.filter(u => u.id !== unitId);
  owned.delete(unitId);
}

// Пытаемся смёрджить ВСЕ возможные тройки для owned.
// preferredUnitId — кого апать, если он входит в тройку (удобно: купленный/перетащенный юнит)
function applyMergesForClient(clientId, preferredUnitId = null) {
  const owned = clientToUnits.get(clientId);
  if (!owned || owned.size === 0) return false;

  // В prep можно мерджить все мои юниты (board + bench).
  // Вне prep (идёт бой / экран результата) нельзя "трогать" юнитов на доске,
  // иначе merge конфликтует с возвратом к prepSnapshot после боя.
  const allowBoardUnitsInMerge = (state.phase === 'prep');

  // собираем только моих player-юнитов (ботов не трогаем)
  const myUnits = state.units.filter(u =>
    u.team === 'player' &&
    owned.has(u.id) &&
    (allowBoardUnitsInMerge || u.zone === 'bench')
  );

  let changed = false;

  // loop до тех пор, пока находятся новые мерджи (потому что 3x rank1 → rank2,
  // потом может сложиться 3x rank2 → rank3)
  while (true) {
    // группируем по type+rank
    const groups = new Map(); // key -> array of units
    for (const u of myUnits) {
      const rank = u.rank ?? 1;
      if (rank >= MAX_RANK) continue; // rank3 уже не мерджим
      const k = mergeKey(u);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(u);
    }

    // найдём любую группу с >=3
    let foundKey = null;
    for (const [k, arr] of groups.entries()) {
      if (arr.length >= 3) {
        foundKey = k;
        break;
      }
    }
    if (!foundKey) break;

    const arr = groups.get(foundKey);

    // выбираем базового юнита для апа:
    // 1) приоритет у юнита на поле (zone=board), чтобы ап не "улетал" на скамейку;
    // 2) если юнит с preferredUnitId находится на поле и входит в группу — можно апнуть его;
    // 3) если на поле никого нет — используем preferredUnitId (если есть) или любого.
    let base = null;

    const boardCandidates = arr.filter(u => u.zone === 'board');

    if (boardCandidates.length > 0) {
      if (preferredUnitId != null) {
        base = boardCandidates.find(u => u.id === Number(preferredUnitId)) ?? null;
      }
      if (!base) base = boardCandidates[0];
    } else {
      if (preferredUnitId != null) {
        base = arr.find(u => u.id === Number(preferredUnitId)) ?? null;
      }
      if (!base) base = arr[0];
    }

    // берём ещё 2 любых, кроме base
    const others = arr.filter(u => u.id !== base.id).slice(0, 2);
    if (others.length < 2) break; // на всякий пожарный

    // ✅ апаем base: rank + статы (x2 за каждый переход ранга)
    const oldRank = base.rank ?? 1;
    const newRank = Math.min(MAX_RANK, oldRank + 1);
    base.rank = newRank;

    // множители: x2 на каждый ап ранга (1->2 и 2->3)
    const mult = 2;

    // maxHp
    const oldMaxHp = Number(base.maxHp ?? base.hp ?? 1);
    const newMaxHp = Math.max(1, Math.round(oldMaxHp * mult));
    base.maxHp = newMaxHp;

    // atk
    const oldAtk = Number(base.atk ?? 1);
    const newAtk = Math.max(1, Math.round(oldAtk * mult));
    base.atk = newAtk;

    // hp всегда полное после мерджа
    base.hp = base.maxHp;

    // удаляем двух остальных
    for (const o of others) {
      removeOwnedUnit(state, owned, o.id);
    }

    // обновляем myUnits (т.к. мы удалили юнитов)
    // и оставляем base в массиве (он уже там, просто rank поменялся)
    for (const o of others) {
      const idx = myUnits.findIndex(x => x.id === o.id);
      if (idx !== -1) myUnits.splice(idx, 1);
    }

    changed = true;

    // после первого мерджа preferredUnitId лучше привязать к base,
    // чтобы возможный следующий мердж апал свежий апнутый юнит
    preferredUnitId = base.id;
  }

  return changed;
}

// ✅ helper: случайное целое [0..n-1]
function randInt(n) {
  return Math.floor(Math.random() * n);
}

// ---- SHOP + UNIT CATALOG (MVP) ----
// цена строго по "силе" (шахматному типу)
const COST_BY_POWER_TYPE = {
  'Пешка': 1,
  'Конь': 2,
  'Слон': 3,
  'Ладья': 4,
  'Ферзь': 5,
};

const SHOP_OFFER_COUNT = 5;

function makeRandomOffer() {
  const base = UNIT_CATALOG.length
    ? UNIT_CATALOG[randInt(UNIT_CATALOG.length)]
    : { type: 'Swordsman', powerType: 'Пешка', hp: 60, atk: 20, moveSpeed: 2.6, attackSpeed: 100 };

  const cost = COST_BY_POWER_TYPE[base.powerType] ?? 1;

  return {
    type: base.type,
    powerType: base.powerType,
    cost,
    hp: base.hp,
    maxHp: base.hp,
    atk: base.atk,
    moveSpeed: base.moveSpeed,
    attackSpeed: base.attackSpeed ?? 100,
  };
}

function generateShopOffers() {
  state.shop = state.shop ?? { offers: [] };
  state.shop.offers = [];
  for (let i = 0; i < SHOP_OFFER_COUNT; i++) state.shop.offers.push(makeRandomOffer());
}

function findFirstFreeBenchSlot() {
  for (let slot = 0; slot < BENCH_SLOTS; slot++) {
    if (!getUnitInBenchSlot(slot)) return slot;
  }
  return null;
}

function findFirstFreeBoardCell() {
  for (let r = 0; r < GRID_ROWS; r++) {
    // В prep игроку разрешена только "своя" половина поля (как на клиенте: первые 6 колонок).
    const maxPlayerPrepCols = Math.min(GRID_COLS, 6);
    for (let col = 0; col < maxPlayerPrepCols; col++) {
      const q = col - Math.floor(r / 2);
      if (!isInsideBoard(q, r)) continue;
      if (getUnitAt(state, q, r)) continue;
      return { q, r };
    }
  }
  return null;
}

// ---- BOT ARMY (MVP) ----
function clearEnemyUnits() {
  state.units = state.units.filter(u => u.team !== 'enemy');
}

function spawnBotArmy() {
  clearEnemyUnits();

  // фикс-армия бота (пока хардкод)
  const botUnits = [
    { q: 6, r: 5, type: 'Swordsman' },
    { q: 7, r: 5, type: 'Swordsman' },
    { q: 6, r: 6, type: 'Crossbowman' },
    { q: 7, r: 6, type: 'Crossbowman' },
    { q: 8, r: 6, type: 'Knight'      },
  ];

  for (const b of botUnits) {
    // safety: если клетка занята или вне поля — просто пропускаем
    if (!isInsideBoard(b.q, b.r)) continue;
    if (getUnitAt(state, b.q, b.r)) continue;

    const base = UNIT_CATALOG.find(x => x.type === b.type) ?? UNIT_CATALOG[0];
    addUnit(state, {
      id: nextUnitId++,
      q: b.q,
      r: b.r,
      hp: base.hp,
      maxHp: base.hp,
      atk: base.atk,
      team: 'enemy',
      type: base.type,
      powerType: base.powerType,
      rank: 1,
      zone: 'board',
      benchSlot: null,
      moveSpeed: base.moveSpeed,
      attackSpeed: base.attackSpeed ?? 100,
    });
  }
}


// axial (q,r) -> "col" как на клиенте: col = q + floor(r/2)
function isInsideBoard(q, r) {
  if (r < 0 || r >= GRID_ROWS) return false;
  const col = q + Math.floor(r / 2);
  return col >= 0 && col < GRID_COLS;
}

const NEIGHBORS = [
  { dq: 1, dr: 0 },
  { dq: 1, dr: -1 },
  { dq: 0, dr: -1 },
  { dq: -1, dr: 0 },
  { dq: -1, dr: 1 },
  { dq: 0, dr: 1 },
];

function findClosestOpponent(attacker) {
  if (!attacker || attacker.dead) return null;
  const opponentTeam = attacker.team === 'player' ? 'enemy' : 'player';

  let best = null;
  let bestDist = Infinity;

  for (const u of state.units) {
    if (u.zone !== 'board') continue;
    if (u.dead) continue;
    if (u.team !== opponentTeam) continue;

    const d = hexDistance(attacker.q, attacker.r, u.q, u.r);
    if (d < bestDist) {
      bestDist = d;
      best = u;
    }
  }

  return best;
}

function findUnitById(id) {
  return state.units.find(u => u.id === id) ?? null;
}

function getUnitInBenchSlot(slot) {
  return state.units.find(u => u.zone === 'bench' && u.benchSlot === slot) ?? null;
}

function pickBestStepToward(attacker, target) {
  let best = null;
  let bestDist = Infinity;

  for (const n of NEIGHBORS) {
    const nq = attacker.q + n.dq;
    const nr = attacker.r + n.dr;

    if (!isInsideBoard(nq, nr)) continue;
    if (getUnitAt(state, nq, nr)) continue;

    const d = hexDistance(nq, nr, target.q, target.r);
    if (d < bestDist) {
      bestDist = d;
      best = { q: nq, r: nr };
    }
  }

  return best;
}

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of clients.values()) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function spawnPlayerUnitFor(clientId) {
  // старт игры: пусто. юниты появляются только через магазин.
  // ownership set создаём заранее, чтобы shopBuy мог добавлять туда новые unitId.
  if (!clientToUnits.get(clientId)) clientToUnits.set(clientId, new Set());
  return null;
}


function computeResult() {
  const hasPlayer = state.units.some(u => u.team === 'player' && u.zone === 'board' && !u.dead);
  const hasEnemy = state.units.some(u => u.team === 'enemy' && u.zone === 'board' && !u.dead);

  // смерть короля = конец
  const pKing = state.kings?.player;
  const eKing = state.kings?.enemy;

  if (pKing && pKing.hp <= 0) return 'defeat';
  if (eKing && eKing.visible && eKing.hp <= 0) return 'victory';

  if (hasPlayer && !hasEnemy) return 'victory';
  if (!hasPlayer && hasEnemy) return 'defeat';
  if (!hasPlayer && !hasEnemy) return 'draw';
  return null;
}

function resetToPrep() {
  // Auto Chess rule: +1 XP each round (win/lose doesn’t matter)
  applyKingXp(state.kings.player, 1);

  // следующий раунд начинается в prep
  state.round = Number(state.round ?? 1) + 1;

  // GOLD: начисляем золото за прошедший бой
  // state.result в этот момент ещё содержит 'victory/defeat/draw'
  grantRoundGold(state.result);
  state.phase = 'prep';
  state.result = null;

  // enemy king скрыт в prep
  if (state.kings?.enemy) state.kings.enemy.visible = false;

  // Сохраняем покупки во время result-screen: они появляются на bench и должны пережить resetToPrep().
  const snapshotUnits = Array.isArray(prepSnapshot) ? prepSnapshot : [];
  const snapshotIds = new Set(snapshotUnits.map(u => u.id));
  const extraBenchBoughtDuringResult = (state.units ?? [])
    .filter(u => u.team === 'player' && u.zone === 'bench' && !snapshotIds.has(u.id))
    .map(u => ({ ...u }));

  state.units = [
    ...snapshotUnits.map(u => ({ ...u })),
    ...extraBenchBoughtDuringResult,
  ];

  // Сразу после возврата в prep пересчитываем merge для всех игроков:
  // это покрывает кейс "докупил 3-го во время боя/экрана результата",
  // когда новый юнит на bench должен слиться с двумя юнитами на board.
  for (const clientId of clientToUnits.keys()) {
    applyMergesForClient(clientId);
  }

  // каждый prep — новый магазин
  generateShopOffers();

  broadcast(makeStateMessage(state));
  startPrepCountdown();
}

function finishBattle(result) {
  stopBattleTimers();

  // показываем результат, остаёмся в battle-view до resetToPrep()
  state.phase = 'battle';
  state.result = result;


  broadcast(makeStateMessage(state));

  finishTimeout = setTimeout(() => {
    resetToPrep();
  }, 3000);
}

function startBattle() {
  stopPrepTimer();
  if (state.phase === 'battle') return;

  // 1) Всегда сохраняем актуальную расстановку игрока перед любым исходом старта боя
  // (в том числе перед instant defeat, если на доске пусто)
  prepSnapshot = state.units
    .filter(u => u.team === 'player')
    .map(u => ({ ...u }));

  // 2) Если на доске нет игроков — мгновенное поражение
  const hasPlayersOnBoard = state.units.some(u => u.team === 'player' && u.zone === 'board');
  if (!hasPlayersOnBoard) {
    finishBattle('defeat');
    return;
  }

  // дальше обычный старт боя...
  state.phase = 'battle';
  state.result = null;

  // --- battle countdown (для UI + ничья по таймауту) ---
  // сбрасываем и запускаем 40 секунд
  state.battleSecondsLeft = BATTLE_DURATION_SECONDS;
  broadcast(makeStateMessage(state));

  if (battleCountdownTimer) {
    clearInterval(battleCountdownTimer);
    battleCountdownTimer = null;
  }

  battleCountdownTimer = setInterval(() => {
    if (state.phase !== 'battle') {
      clearInterval(battleCountdownTimer);
      battleCountdownTimer = null;
      return;
    }

    state.battleSecondsLeft = Math.max(0, Number(state.battleSecondsLeft ?? 0) - 1);
    broadcast(makeStateMessage(state));

    if (state.battleSecondsLeft <= 0) {
      // бой не закончился, а время вышло → ничья
      clearInterval(battleCountdownTimer);
      battleCountdownTimer = null;

      // важно: остановить текущие battle-таймеры/петли (если у тебя там интервалы тика)
      stopBattleTimers();

      finishBattle('draw');
    }
  }, 1000);

  // спавним армию бота только на старт боя
  spawnBotArmy();

  // enemy king появляется только в бою
  if (state.kings?.enemy) state.kings.enemy.visible = true;
  broadcast(makeStateMessage(state));

  const tickMs = 450;

  battleTimer = setInterval(() => {
    if (state.phase !== 'battle') return;

    const resNow = computeResult();
    if (resNow) {
      finishBattle(resNow);
      return;
    }

    let didSomething = false;

    // ходят все юниты на доске (player + enemy)
    const actors = state.units
      .filter(u => u.zone === 'board' && !u.dead && (u.team === 'player' || u.team === 'enemy'))
      .slice()
      .sort((a, b) => a.id - b.id);

    for (const a of actors) {
      const me = findUnitById(a.id);
      if (!me) continue;

      // ✅ NEW: кулдаун движения/действия
      me.moveCdMs = Math.max(0, (me.moveCdMs ?? 0) - tickMs);
      if (me.moveCdMs > 0) continue;

      const target = findClosestOpponent(me);
      if (!target) continue;

      const dist = hexDistance(me.q, me.r, target.q, target.r);

      if (dist <= 1) {
        const res = attack(state, me.id, target.id);
        if (res.success) {
          didSomething = true;
          me.attackSeq = Number(me.attackSeq ?? 0) + 1;

          // ✅ атака тоже "занимает время", но теперь по attackSpeed (100 = 1 атака/сек)
          const atkSpd = Math.max(1, Number(me.attackSpeed ?? 100));
          const atkCdMs = Math.max(120, Math.round(100000 / atkSpd));
          me.moveCdMs = atkCdMs;
        }
        continue;
      }

      const step = pickBestStepToward(me, target);
      if (!step) continue;

      const moved = moveUnit(state, me.id, step.q, step.r);
      if (moved) {
        didSomething = true;

        // ✅ NEW: длительность шага зависит от скорости
        const spd = Number(me.moveSpeed ?? 2.0);
        const stepMs = Math.max(120, Math.round(1000 / spd));
        me.moveCdMs = stepMs;
      }
    }

    if (didSomething) {
      broadcast(makeStateMessage(state));
    }

    const resAfter = computeResult();
    if (resAfter) finishBattle(resAfter);

  }, tickMs);
}

function handleIntent(clientId, msg, ws) {
  if (!msg || msg.type !== 'intent') return;

  const owned = clientToUnits.get(clientId) ?? new Set();
  if (!clientToUnits.get(clientId)) clientToUnits.set(clientId, owned);

  // разрешаем "системные" intents даже если у клиента пока нет юнитов
  const ALLOW_WITHOUT_UNITS = new Set(['shopBuy', 'shopRefresh', 'startGame', 'startBattle', 'buyXp', 'resetGame']);
  if (!ALLOW_WITHOUT_UNITS.has(msg.action) && owned.size === 0) {
    ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'No unit assigned to this client')));
    return;
  }

  const requestedUnitId = Number(msg.unitId);
  const requireOwnedUnit = () => {
    if (!Number.isInteger(requestedUnitId) || !owned.has(requestedUnitId)) {
      ws.send(JSON.stringify(makeErrorMessage('NOT_OWNER', 'You do not own this unitId')));
      return false;
    }
    return true;
  };

  if (msg.action === 'startGame') {
    // стартуем только если сейчас prep и таймер не идёт
    const isPreStart =
      state.phase === 'prep' &&
      !state.result &&
      Number(state.round ?? 1) === 1 &&
      Number(state.prepSecondsLeft ?? 0) === 0 &&
      Number(state.battleSecondsLeft ?? 0) === 0 &&
      !prepTimer &&
      !battleTimer &&
      !finishTimeout;

    if (!isPreStart) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'startGame allowed only before round start')));
      return;
    }

    // стартуем строго с 1-го раунда
    state.round = 1;
    state.winStreak = 0;
    state.loseStreak = 0;
    state.result = null;
    state.prepSecondsLeft = 0;

    // магазин на старт
    generateShopOffers();

    broadcast(makeStateMessage(state));
    startPrepCountdown();
    return;
  }

  if (msg.action === 'startBattle') {
    // стартует только из prep
    if (state.phase !== 'prep') {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'Battle can start only from prep')));
      return;
    }
    startBattle();
    return;
  }

  if (msg.action === 'resetGame') {
    resetGameToStart();
    return;
  }

  if (msg.action === 'setBench') {
    if (!requireOwnedUnit()) return;

    const slot = Number(msg.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= BENCH_SLOTS) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_ARGS', 'slot must be integer 0..7')));
      return;
    }

    const me = findUnitById(requestedUnitId);
    if (!me) {
      ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'Unit not found')));
      return;
    }

    // Скамейка доступна всегда, но вне prep разрешаем только менеджмент юнитов,
    // которые УЖЕ стоят на скамейке (bench -> bench, включая swap).
    if (state.phase !== 'prep' && me.zone !== 'bench') {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'Only bench units can be managed outside prep')));
      return;
    }

    // запоминаем откуда пришёл
    const prev = {
        zone: me.zone,
        q: me.q,
        r: me.r,
        benchSlot: me.benchSlot,
    };

    const occupied = getUnitInBenchSlot(slot);
    if (occupied && occupied.id !== requestedUnitId) {
      // ✅ swap только если занято МОИМ юнитом
      if (occupied.team !== 'player' || !owned.has(occupied.id)) {
        ws.send(JSON.stringify(makeErrorMessage('OCCUPIED', 'Bench slot occupied')));
        return;
      }

      // me -> target bench slot
      me.zone = 'bench';
      me.benchSlot = slot;

      // occupied -> old place of me
      if (prev.zone === 'bench') {
        occupied.zone = 'bench';
        occupied.benchSlot = prev.benchSlot;
      } else {
        occupied.zone = 'board';
        occupied.benchSlot = null;
        occupied.q = prev.q;
        occupied.r = prev.r;
      }

      // ✅ MERGE: предпочитаем юнит, который двигали
      applyMergesForClient(clientId, requestedUnitId);

      broadcast(makeStateMessage(state));
      return;
    }

    // обычная установка (слот свободен)
    me.zone = 'bench';
    me.benchSlot = slot;

    applyMergesForClient(clientId, requestedUnitId);
    broadcast(makeStateMessage(state));
    return;

  }

  if (msg.action === 'setStart') {
    if (state.phase !== 'prep') {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'setStart allowed only in prep')));
      return;
    }
    if (!requireOwnedUnit()) return;

    const q = Number(msg.q);
    const r = Number(msg.r);

    if (!Number.isFinite(q) || !Number.isFinite(r) || !Number.isInteger(q) || !Number.isInteger(r)) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_ARGS', 'q/r must be integers')));
      return;
    }

    if (!isInsideBoard(q, r)) {
      ws.send(JSON.stringify(makeErrorMessage('OUT_OF_BOUNDS', 'Cell is outside board')));
      return;
    }

    // В prep игрок может ставить юнитов только на свою половину поля (первые 6 колонок).
    // Это дублирует ограничение клиента, но должно проверяться и на сервере.
    if (state.phase === 'prep') {
      const col = q + Math.floor(r / 2);
      const maxPlayerPrepCols = Math.min(GRID_COLS, 6);
      if (col < 0 || col >= maxPlayerPrepCols) {
        ws.send(JSON.stringify(makeErrorMessage('OUT_OF_PREP_ZONE', 'Cell is outside player prep zone')));
        return;
      }
    }

    const me = findUnitById(requestedUnitId);
    if (!me) {
      ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'Unit not found')));
      return;
    }

    // запоминаем откуда юнит пришёл (чтобы было куда "вытолкнуть" второго)
    const prev = {
      zone: me.zone,
      q: me.q,
      r: me.r,
      benchSlot: me.benchSlot,
    };

    const occupied = getUnitAt(state, q, r);
    if (occupied && occupied.id !== requestedUnitId) {
      // ✅ swap только если занято МОИМ юнитом
      if (occupied.team !== 'player' || !owned.has(occupied.id)) {
        ws.send(JSON.stringify(makeErrorMessage('OCCUPIED', 'Cell is occupied')));
        return;
      }

      // me -> target cell
      me.zone = 'board';
      me.benchSlot = null;
      me.q = q;
      me.r = r;

      // occupied -> old place of me
      if (prev.zone === 'board') {
        occupied.zone = 'board';
        occupied.benchSlot = null;
        occupied.q = prev.q;
        occupied.r = prev.r;
      } else {
        // me был на bench → occupied уезжает на его слот
        occupied.zone = 'bench';
        occupied.benchSlot = prev.benchSlot;
      }

      applyMergesForClient(clientId, requestedUnitId);

      broadcast(makeStateMessage(state));
      return;
    }

    // обычная установка (клетка свободна)
    me.zone = 'board';
    me.benchSlot = null;

    const ok = moveUnit(state, requestedUnitId, q, r);
    if (!ok) {
      ws.send(JSON.stringify(makeErrorMessage('MOVE_DENIED', 'Cannot set start there')));
      return;
    }

    applyMergesForClient(clientId, requestedUnitId);

    broadcast(makeStateMessage(state));
    return;
  }

  if (msg.action === 'buyXp') {
    if (state.phase !== 'prep' || state.result) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'buyXp allowed only in prep (no result)')));
      return;
    }

    const COST = 5;
    const GAIN = 4;

    const coins = state.kings?.player?.coins ?? 0;
    if (coins < COST) {
      ws.send(JSON.stringify(makeErrorMessage('NO_COINS', 'Not enough coins for XP')));
      return;
    }

    state.kings.player.coins -= COST;
    applyKingXp(state.kings.player, GAIN);

    clampPlayerCoins();
    broadcast(makeStateMessage(state));
    return;
  }

  if (msg.action === 'shopRefresh') {
    const canRefreshShop = (state.phase === 'prep' || state.phase === 'battle');
    if (!canRefreshShop) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'shopRefresh allowed only in prep/battle')));
      return;
    }

    const REFRESH_COST = 2;
    const coins = Number(state.kings?.player?.coins ?? 0);
    if (coins < REFRESH_COST) {
      ws.send(JSON.stringify(makeErrorMessage('NO_COINS', 'Not enough coins to refresh shop')));
      return;
    }

    state.kings.player.coins -= REFRESH_COST;
    clampPlayerCoins();
    generateShopOffers();
    broadcast(makeStateMessage(state));
    return;
  }

  if (msg.action === 'shopBuy') {
    const canBuyFromShop = (state.phase === 'prep' || state.phase === 'battle');
    if (!canBuyFromShop) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'shopBuy allowed only in prep/battle')));
      return;
    }

    const idx = Number(msg.offerIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= SHOP_OFFER_COUNT) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_ARGS', `offerIndex must be 0..${SHOP_OFFER_COUNT - 1}`)));
      return;
    }

    const offer = state.shop?.offers?.[idx];
    if (!offer) {
      ws.send(JSON.stringify(makeErrorMessage('NO_OFFER', 'Offer not found')));
      return;
    }

    const coins = state.kings?.player?.coins ?? 0;
    if (coins < offer.cost) {
      ws.send(JSON.stringify(makeErrorMessage('NO_COINS', 'Not enough coins')));
      return;
    }

    const canPlaceOnBoardNow = (state.phase === 'prep') && !state.result;
    const freeBoardCell = canPlaceOnBoardNow ? findFirstFreeBoardCell() : null;
    const freeSlot = freeBoardCell ? null : findFirstFreeBenchSlot();
    if (!freeBoardCell && freeSlot == null) {
      ws.send(JSON.stringify(makeErrorMessage('NO_SPACE', 'No free board cell or bench slot')));
      return;
    }

    // списываем монеты
    state.kings.player.coins -= offer.cost;
    clampPlayerCoins();

    // создаём купленного юнита: сначала на поле (если сейчас можно), иначе на bench
    const newId = nextUnitId++;
    addUnit(state, {
      id: newId,
      q: freeBoardCell?.q ?? 0,
      r: freeBoardCell?.r ?? 0,
      hp: offer.hp,
      maxHp: offer.maxHp ?? offer.hp,
      atk: offer.atk,
      team: 'player',
      type: offer.type,
      powerType: offer.powerType,
      rank: 1,
      zone: freeBoardCell ? 'board' : 'bench',
      benchSlot: freeBoardCell ? null : freeSlot,
      moveSpeed: offer.moveSpeed,
      attackSpeed: offer.attackSpeed ?? 100,
    });

    // ownership: купленный юнит принадлежит этому клиенту
    owned.add(newId);

    // заменяем купленный слот новым оффером
    state.shop.offers[idx] = null;

    // ✅ MERGE: пробуем смёрджить, предпочитаем только что купленного
    applyMergesForClient(clientId, newId);

    broadcast(makeStateMessage(state));
    return;
  }

  ws.send(JSON.stringify(makeErrorMessage('BAD_INTENT', 'Unknown intent action')));

}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// раздаём Vite build
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// SPA fallback (чтобы обновление страницы не давало 404)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ---- server ----
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const clientId = crypto.randomUUID();
  clients.set(clientId, ws);

  // выдаём юнит этому клиенту
  const unitId = spawnPlayerUnitFor(clientId);

  if (!state.shop?.offers || state.shop.offers.length !== SHOP_OFFER_COUNT) {
    generateShopOffers();
  }

  // init только подключившемуся
  ws.send(JSON.stringify(makeInitMessage({
    clientId,
    unitId,
    state,
  })));

  // и обновлённый state всем (чтобы все видели нового игрока)
  broadcast(makeStateMessage(state));

  ws.on('message', (raw) => {
    let msg = null;
    try {
        msg = JSON.parse(raw.toString());
    } catch {
    ws.send(JSON.stringify(makeErrorMessage('BAD_JSON', 'Cannot parse JSON')));
        return;
    }

    handleIntent(clientId, msg, ws);
  });

  ws.on('close', () => {
    clients.delete(clientId);
    
    const owned = clientToUnits.get(clientId);
    clientToUnits.delete(clientId);

    if (owned && owned.size > 0) {
      state.units = state.units.filter(u => !owned.has(u.id));
      broadcast(makeStateMessage(state));
    }

    // если никого не осталось — можно остановить таймеры
    const hasPlayers = state.units.some(u => u.team === 'player');
    if (!hasPlayers) {
      stopBattleTimers();
      stopPrepTimer();
      state.phase = 'prep';
      state.result = null;
      state.prepSecondsLeft = 0;
    }
  });

});

const PORT = Number(process.env.PORT || 3001);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
