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

// кто каким юнитом управляет
/** @type {Map<string, number>} */
const clientToUnit = new Map();

// держим список сокетов
/** @type {Map<string, import('ws').WebSocket>} */
const clients = new Map();

// ---- board limits (должны совпадать с клиентом) ----
const GRID_COLS = 12;
const GRID_ROWS = 8;

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
  return state.units.find(u => u.team === 'enemy') ?? null;
}

function findUnitById(id) {
  return state.units.find(u => u.id === id) ?? null;
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
  const hasEnemy = state.units.some(u => u.team === 'enemy');
  if (hasEnemy) return;

  addUnit(state, {
    id: 999,
    q: 6,
    r: 5,
    hp: 100,
    atk: 20,
    team: 'enemy',
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
  });

  clientToUnit.set(clientId, unitId);
  return unitId;
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
    console.log('CONNECT', clientId);
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

  // --- battle loop (per-connection timer handle) ---
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

  function computeResult() {
    const hasPlayer = state.units.some(u => u.team === 'player');
    const hasEnemy = state.units.some(u => u.team === 'enemy');

    if (hasPlayer && !hasEnemy) return 'victory';
    if (!hasPlayer && hasEnemy) return 'defeat';
    if (!hasPlayer && !hasEnemy) return 'draw';

    return null; // бой ещё не закончен
  }

  function resetToPrep() {
    // вернуться в подготовку: сброс фаз/результата
    state.phase = 'prep';
    state.result = null;

    // на этом этапе можно:
    // - ресетать позиции
    // - пересоздавать врага
    // мы пока делаем минимально: гарантируем врага если его нет
    ensureDefaultEnemy();

    broadcast(makeStateMessage(state));
  }

  function finishBattle(result) {
    stopBattleTimers();

    state.phase = 'prep'; // ФАЗА боя заканчивается, но результат показываем
    state.result = result;

    broadcast(makeStateMessage(state));

    // через 3 секунды сброс обратно в prep (и убрать надпись)
    finishTimeout = setTimeout(() => {
      resetToPrep();
    }, 3000);
  }

  function startBattle() {
    // не стартуем повторно
    if (state.phase === 'battle') return;

    // перейти в бой
    state.phase = 'battle';
    state.result = null;
    broadcast(makeStateMessage(state));

    const tickMs = 450;

    battleTimer = setInterval(() => {
      // если уже не бой — не делаем ничего
      if (state.phase !== 'battle') return;

      const me = findUnitById(unitId);
      const enemy = findEnemyUnit();

      // если кто-то исчез — проверяем результат
      const resNow = computeResult();
      if (resNow) {
        finishBattle(resNow);
        return;
      }

      // защита от пустого enemy (вдруг)
      if (!me || !enemy) return;

      const dist = hexDistance(me.q, me.r, enemy.q, enemy.r);

      // рядом — удар
      if (dist <= 1) {
        const res = attack(state, me.id, enemy.id);
        if (res.success) {
          broadcast(makeStateMessage(state));
        }

        const resAfter = computeResult();
        if (resAfter) {
          finishBattle(resAfter);
        }
        return;
      }

      // шаг к врагу
      const step = pickBestStepToward(me, enemy);
      if (!step) return;

      const moved = moveUnit(state, me.id, step.q, step.r);
      if (moved) broadcast(makeStateMessage(state));

      const resAfterMove = computeResult();
      if (resAfterMove) finishBattle(resAfterMove);
    }, tickMs);
  }

  ws.on('message', (raw) => {
    let msg = null;
    try {
        msg = JSON.parse(raw.toString());
    } catch {
    ws.send(JSON.stringify(makeErrorMessage('BAD_JSON', 'Cannot parse JSON')));
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
    stopBattleTimers();
    clearInterval(timer);
    clients.delete(clientId);
    console.log('CLOSE', clientId);

    // опционально: удаляем юнит отключившегося игрока
    const uid = clientToUnit.get(clientId);
    clientToUnit.delete(clientId);

    if (uid) {
      state.units = state.units.filter(u => u.id !== uid);
      broadcast(makeStateMessage(state));
    }
  });
});

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
