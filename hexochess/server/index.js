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
} from '../shared/battleCore.js';

import {
  makeInitMessage,
  makeStateMessage,
  makeErrorMessage,
} from '../shared/messages.js';

// ---- game state (authoritative) ----
const state = createBattleState();
let nextUnitId = 1;

// слепок расстановки на момент старта боя (для возврата в prep)
let prepSnapshot = null; // Array of units

// ---- battle timers (GLOBAL, not per connection) ----
let battleTimer = null;
let finishTimeout = null;

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

// ---- SHOP + UNIT CATALOG (MVP) ----
const UNIT_CATALOG = [
  { type: 'Swordsman', cost: 10, hp: 60, atk: 20 },
  { type: 'Archer',   cost: 12, hp: 40, atk: 25 },
  { type: 'Tank',     cost: 18, hp: 120, atk: 12 },
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

function findEnemyUnit() {
  return state.units.find(u => u.team === 'enemy' && u.zone === 'board') ?? null;
}

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

      const target = findClosestOpponent(me);
      if (!target) continue;

      const dist = hexDistance(me.q, me.r, target.q, target.r);

      if (dist <= 1) {
        const res = attack(state, me.id, target.id);
        if (res.success) didSomething = true;
        continue;
      }

      const step = pickBestStepToward(me, target);
      if (!step) continue;

      const moved = moveUnit(state, me.id, step.q, step.r);
      if (moved) didSomething = true;
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

    broadcast(makeStateMessage(state));
    return;
  }

  // обычная установка (слот свободен)
  me.zone = 'bench';
  me.benchSlot = slot;

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
    });

    // ownership: купленный юнит принадлежит этому клиенту
    owned.add(newId);

    // заменяем купленный слот новым оффером
    state.shop.offers[idx] = makeRandomOffer();

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

    if (msg?.type === 'intent' && msg.action === 'startBattle') {
      if (state.phase !== 'prep') {
        ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'Battle can start only from prep')));
        return;
      }
      startBattle();
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
