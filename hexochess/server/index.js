// server/index.js
import http from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';

import {
  createBattleState,
  addUnit,
  moveUnit,
  attack,
} from '../shared/battleCore.js';

import {
  makeInitMessage,
  makeStateMessage,
  makeErrorMessage,
} from '../shared/messages.js';

const PORT = 3001;

// ---- game state (authoritative) ----
const state = createBattleState();
let nextUnitId = 1;

// кто каким юнитом управляет
/** @type {Map<string, number>} */
const clientToUnit = new Map();

// держим список сокетов
/** @type {Map<string, import('ws').WebSocket>} */
const clients = new Map();

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
    q: 7,
    r: 3,
    hp: 100,
    atk: 20,
    team: 'enemy',
  });
}

function spawnPlayerUnitFor(clientId) {
  const unitId = nextUnitId++;

  // простая раскладка по стартовым клеткам (чтобы не спавнились в одном месте)
  const idx = unitId - 1;
  const startQ = 2 + (idx % 2);
  const startR = 3 + Math.floor(idx / 2);

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

// ---- server ----
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Hexochess WS server is running\n');
});

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
    handleIntent(clientId, msg, ws);
  });

  ws.on('close', () => {
    clients.delete(clientId);

    // опционально: удаляем юнит отключившегося игрока
    const uid = clientToUnit.get(clientId);
    clientToUnit.delete(clientId);
    if (uid) {
      state.units = state.units.filter(u => u.id !== uid);
      broadcast(makeStateMessage(state));
    }
  });
});

server.listen(PORT, () => {
  console.log(`WS server listening on ws://localhost:${PORT}`);
});
