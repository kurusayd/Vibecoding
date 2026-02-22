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

// ---- game state (authoritative) ----
const state = createBattleState();
let nextUnitId = 1;

// ---- economy / rounds ----
state.round = state.round ?? 1;          // 1..N
state.winStreak = state.winStreak ?? 0;  // подряд побед
state.loseStreak = state.loseStreak ?? 0; // подряд пораж

// слепок расстановки на момент старта боя (для возврата в prep)
let prepSnapshot = null; // Array of units

// ---- battle timers (GLOBAL, not per connection) ----
let battleTimer = null;
let finishTimeout = null;

const BASE_INCOME_AFTER_R5 = 5;
const INTEREST_STEP = 10;
const INTEREST_CAP = 5;     // classic: максимум +5
const COINS_CAP = 100;      // твой кап

function clampCoinsKing(king) {
  king.coins = Math.max(0, Math.min(COINS_CAP, Number(king.coins ?? 0)));
}

// round: 1..N
function baseIncomeForRound(round) {
  if (round <= 1) return 1;
  if (round === 2) return 2;
  if (round === 3) return 3;
  if (round === 4) return 4;
  return BASE_INCOME_AFTER_R5; // 5+
}

function interestIncome(coins) {
  // +1 за каждые 10, кап 5
  return Math.min(INTEREST_CAP, Math.floor(coins / INTEREST_STEP));
}

function streakBonus(streakCount) {
  // 0-2:0, 3-4:+1, 5-6:+2, 7+:+3
  if (streakCount >= 7) return 3;
  if (streakCount >= 5) return 2;
  if (streakCount >= 3) return 1;
  return 0;
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

  // следующий раунд
  state.round = round + 1;
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

  // собираем только моих player-юнитов (ботов не трогаем)
  const myUnits = state.units.filter(u => u.team === 'player' && owned.has(u.id));

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

    // выбираем тройку
    // если preferredUnitId есть и входит в группу — апаем его
    let base = null;
    if (preferredUnitId != null) {
      base = arr.find(u => u.id === Number(preferredUnitId)) ?? null;
    }
    if (!base) base = arr[0];

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

// ---- SHOP + UNIT CATALOG (MVP) ----
const UNIT_CATALOG = [
  { type: 'Swordsman', cost: 10, hp: 60,  atk: 20, moveSpeed: 2.6 },
  { type: 'Archer',    cost: 12, hp: 40,  atk: 25, moveSpeed: 2.3 },
  { type: 'Tank',      cost: 18, hp: 120, atk: 12, moveSpeed: 1.6 },
];

function randInt(n) {
  return Math.floor(Math.random() * n);
}

function makeRandomOffer() {
  const base = UNIT_CATALOG[randInt(UNIT_CATALOG.length)];
  return {
    type: base.type,
    cost: base.cost,
    hp: base.hp,
    maxHp: base.hp,
    atk: base.atk,
    moveSpeed: base.moveSpeed,
  };
}

function generateShopOffers() {
  state.shop = state.shop ?? { offers: [] };
  state.shop.offers = [];
  for (let i = 0; i < 5; i++) state.shop.offers.push(makeRandomOffer());
}

function findFirstFreeBenchSlot() {
  for (let slot = 0; slot < BENCH_SLOTS; slot++) {
    if (!getUnitInBenchSlot(slot)) return slot;
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
    { q: 6, r: 6, type: 'Archer'   },
    { q: 7, r: 6, type: 'Archer'   },
    { q: 8, r: 6, type: 'Tank'     },
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
      rank: 1,
      zone: 'board',
      benchSlot: null,
      moveSpeed: base.moveSpeed,
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
  const opponentTeam = attacker.team === 'player' ? 'enemy' : 'player';

  let best = null;
  let bestDist = Infinity;

  for (const u of state.units) {
    if (u.zone !== 'board') continue;
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
  const hasPlayer = state.units.some(u => u.team === 'player' && u.zone === 'board');
  const hasEnemy = state.units.some(u => u.team === 'enemy' && u.zone === 'board');

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
  // ✅ Auto Chess rule: +1 XP each round (win/lose doesn’t matter)
  applyKingXp(state.kings.player, 1);

  // ✅ GOLD: начисляем золото за прошедший бой
  // state.result в этот момент ещё содержит 'victory/defeat/draw'
  grantRoundGold(state.result);
  state.phase = 'prep';
  state.result = null;

  // enemy king скрыт в prep
  if (state.kings?.enemy) state.kings.enemy.visible = false;

  if (prepSnapshot && prepSnapshot.length > 0) {
    state.units = prepSnapshot.map(u => ({ ...u }));
  }

  // каждый prep — новый магазин
  generateShopOffers();

  broadcast(makeStateMessage(state));
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
  if (state.phase === 'battle') return;

  // 1) если на доске нет игроков — мгновенное поражение (НЕ меняем фазу на battle)
  const hasPlayersOnBoard = state.units.some(u => u.team === 'player' && u.zone === 'board');
  if (!hasPlayersOnBoard) {
    // показываем результат, остаёмся в prep
    finishBattle('defeat');
    return;
  }

  // 2) только теперь сохраняем snapshot и стартуем бой
  // snapshot только игрока (бота спавним в battle и не тащим обратно в prep)
  prepSnapshot = state.units
    .filter(u => u.team === 'player')
    .map(u => ({ ...u }));


  state.phase = 'battle';
  state.result = null;

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
      .filter(u => u.zone === 'board' && (u.team === 'player' || u.team === 'enemy'))
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

          // ✅ атака тоже "занимает время"
          const spd = Number(me.moveSpeed ?? 2.0);
          const stepMs = Math.max(120, Math.round(1000 / spd));
          me.moveCdMs = stepMs;
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

  // shopBuy разрешаем даже когда owned пустой
  if (msg.action !== 'shopBuy' && owned.size === 0) {
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

  if (msg.action === 'startBattle') {
    // стартует только из prep
    if (state.phase !== 'prep') {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'Battle can start only from prep')));
      return;
    }
    startBattle();
    return;
  }

  if (msg.action === 'setBench') {
    if (state.phase !== 'prep') {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'setBench allowed only in prep')));
      return;
    }
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

  if (msg.action === 'move') {
    if (!requireOwnedUnit()) return;

    const me = findUnitById(requestedUnitId);
    if (!me) {
      ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'Unit not found')));
      return;
    }

    if (me.zone !== 'board') {
      ws.send(JSON.stringify(makeErrorMessage('MOVE_DENIED', 'Unit is on bench'))); // оставим правило
      return;
    }

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

    const ok = moveUnit(state, requestedUnitId, q, r);
    if (!ok) {
      ws.send(JSON.stringify(makeErrorMessage('MOVE_DENIED', 'Move is not allowed')));
      return;
    }

    broadcast(makeStateMessage(state));
    return;
  }

  if (msg.action === 'attack') {
    if (!requireOwnedUnit()) return;

    const res = attack(state, requestedUnitId, msg.targetId);
    if (!res.success) {
      ws.send(JSON.stringify(makeErrorMessage('ATTACK_DENIED', 'Attack is not allowed')));
      return;
    }
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

  if (msg.action === 'shopBuy') {
    if (state.phase !== 'prep' || state.result) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'shopBuy allowed only in prep (no result)')));
      return;
    }

    const idx = Number(msg.offerIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= 5) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_ARGS', 'offerIndex must be 0..4')));
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

    const freeSlot = findFirstFreeBenchSlot();
    if (freeSlot == null) {
      ws.send(JSON.stringify(makeErrorMessage('BENCH_FULL', 'No free bench slot')));
      return;
    }

    // списываем монеты
    state.kings.player.coins -= offer.cost;
    clampPlayerCoins();

    // создаём купленного юнита на bench
    const newId = nextUnitId++;
    addUnit(state, {
      id: newId,
      q: 0,
      r: 0,
      hp: offer.hp,
      maxHp: offer.maxHp ?? offer.hp,
      atk: offer.atk,
      team: 'player',
      type: offer.type, 
      rank: 1,
      zone: 'bench',
      benchSlot: freeSlot,
      moveSpeed: offer.moveSpeed,
    });

    // ownership: купленный юнит принадлежит этому клиенту
    owned.add(newId);

    // заменяем купленный слот новым оффером
    state.shop.offers[idx] = makeRandomOffer();

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

  if (!state.shop?.offers || state.shop.offers.length !== 5) {
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
      state.phase = 'prep';
      state.result = null;
    }
  });

});

const PORT = Number(process.env.PORT || 3001);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
