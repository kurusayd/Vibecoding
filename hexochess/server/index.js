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
/** @type {Map<string, number>} */
const clientToUnit = new Map();

// держим список сокетов
/** @type {Map<string, import('ws').WebSocket>} */
const clients = new Map();

// ---- board limits (должны совпадать с клиентом) ----
const GRID_COLS = 12;
const GRID_ROWS = 8;
const BENCH_SLOTS = 8;

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

function ensureDefaultEnemy() {
  const hasEnemy = state.units.some(u => u.team === 'enemy' && u.zone === 'board');
  if (hasEnemy) return;

  addUnit(state, {
    id: 999,
    q: 6,
    r: 5,
    hp: 100,
    atk: 20,
    team: 'enemy',
    zone: 'board',
    benchSlot: null,
  });
}

function spawnPlayerUnitFor(clientId) {
  const unitId = nextUnitId++;

  // простая раскладка по стартовым клеткам (чтобы не спавнились в одном месте)
  const idx = unitId - 1;
  const startR = 0;
  const startQ = 0; // всегда самый левый верхний

  addUnit(state, {
    id: unitId,
    q: startQ,
    r: startR,
    hp: 100,
    atk: 25,
    team: 'player',
    zone: 'board',
    benchSlot: null,
  });

  clientToUnit.set(clientId, unitId);
  return unitId;
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
  } else {
    ensureDefaultEnemy();
  }

  broadcast(makeStateMessage(state));
}

function finishBattle(result) {
  stopBattleTimers();

  // показываем результат, но возвращаем в prep после таймера
  state.phase = 'prep';
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
  prepSnapshot = state.units.map(u => ({ ...u }));

  state.phase = 'battle';
  state.result = null;
  // enemy king появляется только в бою
  if (state.kings?.enemy) state.kings.enemy.visible = true;
  broadcast(makeStateMessage(state));

  const tickMs = 450;

  battleTimer = setInterval(() => {
    if (state.phase !== 'battle') return;

    ensureDefaultEnemy();

    const resNow = computeResult();
    if (resNow) {
      finishBattle(resNow);
      return;
    }

    const enemy = findEnemyUnit();
    if (!enemy) return;

    const players = state.units.filter(u => u.team === 'player' && u.zone === 'board');

    let didSomething = false;

    for (const me of players) {
      // если кто-то исчез
      if (!findUnitById(me.id)) continue;

      const dist = hexDistance(me.q, me.r, enemy.q, enemy.r);

      if (dist <= 1) {
        const res = attack(state, me.id, enemy.id);
        if (res.success) didSomething = true;
        continue;
      }

      const step = pickBestStepToward(me, enemy);
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
  const unitId = clientToUnit.get(clientId);
  if (!unitId) {
    ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'No unit assigned to this client')));
    return;
  }

  if (!msg || msg.type !== 'intent') return;

  if (msg.action === 'startBattle') {
    // стартует только из prep
    if (state.phase !== 'prep') {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'Battle can start only from prep')));
      return;
    }
    startBattle();
    return;
  }


  if (msg.action === 'move') {
    // move разрешён только если юнит уже на доске
    const me = findUnitById(unitId);
    if (!me) {
      ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'Unit not found')));
      return;
    }

    if (me.zone !== 'board') {
      ws.send(JSON.stringify(makeErrorMessage('MOVE_DENIED', 'Unit is on bench')));
      return;
    }

    const ok = moveUnit(state, unitId, msg.q, msg.r);
    if (!ok) {
      ws.send(JSON.stringify(makeErrorMessage('MOVE_DENIED', 'Move is not allowed')));
      return;
    }

    broadcast(makeStateMessage(state));
    return;
  }


  if (msg.action === 'attack') {
    const res = attack(state, unitId, msg.targetId);
    if (!res.success) {
      ws.send(JSON.stringify(makeErrorMessage('ATTACK_DENIED', 'Attack is not allowed')));
      return;
    }
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

  // чтобы в игре всегда был хоть кто-то для удара
  ensureDefaultEnemy();

  // выдаём юнит этому клиенту
  const unitId = spawnPlayerUnitFor(clientId);

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


    // --- setBench: разрешено только в prep ---
    if (msg?.type === 'intent' && msg.action === 'setBench') {
      if (state.phase !== 'prep') {
        ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'setBench allowed only in prep')));
        return;
      }

      const unitId = clientToUnit.get(clientId);
      if (!unitId) {
        ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'No unit assigned to this client')));
        return;
      }

      const slot = Number(msg.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= BENCH_SLOTS) {
        ws.send(JSON.stringify(makeErrorMessage('BAD_ARGS', 'slot must be integer 0..7')));
        return;
      }

      const me = findUnitById(unitId);
      if (!me) {
        ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'Unit not found')));
        return;
      }

      const occupied = getUnitInBenchSlot(slot);
      if (occupied && occupied.id !== unitId) {
        ws.send(JSON.stringify(makeErrorMessage('OCCUPIED', 'Bench slot occupied')));
        return;
      }

      me.zone = 'bench';
      me.benchSlot = slot;

      broadcast(makeStateMessage(state));
      return;
    }


    // --- setStart: разрешено только в prep ---
    if (msg?.type === 'intent' && msg.action === 'setStart') {
      if (state.phase !== 'prep') {
        ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'setStart allowed only in prep')));
        return;
      }

      const unitId = clientToUnit.get(clientId);
      if (!unitId) {
        ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'No unit assigned to this client')));
        return;
      }

      const q = Number(msg.q);
      const r = Number(msg.r);

      if (!Number.isFinite(q) || !Number.isFinite(r)) {
        ws.send(JSON.stringify(makeErrorMessage('BAD_ARGS', 'q/r must be numbers')));
        return;
      }

      if (!isInsideBoard(q, r)) {
        ws.send(JSON.stringify(makeErrorMessage('OUT_OF_BOUNDS', 'Cell is outside board')));
        return;
      }

      const occupied = getUnitAt(state, q, r);
      if (occupied && occupied.id !== unitId) {
        ws.send(JSON.stringify(makeErrorMessage('OCCUPIED', 'Cell is occupied')));
        return;
      }

      const me = findUnitById(unitId);
      if (!me) {
        ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'Unit not found')));
        return;
      }

      // setStart = явное выставление на поле (если был на скамейке — снимаем)
      me.zone = 'board';
      me.benchSlot = null;

      // применяем: переносим своего юнита
      const ok = moveUnit(state, unitId, q, r);
      if (!ok) {
        ws.send(JSON.stringify(makeErrorMessage('MOVE_DENIED', 'Cannot set start there')));
        return;
      }

      broadcast(makeStateMessage(state));
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
    
    const uid = clientToUnit.get(clientId);
    clientToUnit.delete(clientId);

    if (uid) {
      state.units = state.units.filter(u => u.id !== uid);
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
