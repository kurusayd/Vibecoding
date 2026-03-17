import { makeErrorMessage, makeStateMessage } from '../../shared/messages.js';
import { ALLOW_WITHOUT_UNITS, INTENT_ACTION_HANDLERS } from './intentHandlers/index.js';

function sendError(ws, code, message) {
  ws.send(JSON.stringify(makeErrorMessage(code, message)));
}

export function createIntentHandler(deps) {
  return function handleIntent(clientId, msg, ws) {
    if (!msg || msg.type !== 'intent') return;

    const owned = deps.ensureOwnedUnits(clientId);
    if (!ALLOW_WITHOUT_UNITS.has(msg.action) && owned.size === 0) {
      sendError(ws, 'NO_UNIT', 'No unit assigned to this client');
      return;
    }

    const requestedUnitId = Number(msg.unitId);
    const ctx = {
      ...deps,
      clientId,
      msg,
      ws,
      owned,
      requestedUnitId,
      state: deps.getState(),
      sendError(code, message) {
        sendError(ws, code, message);
      },
      broadcastState() {
        deps.broadcast(makeStateMessage(deps.getState()));
      },
      requireOwnedUnit() {
        if (!Number.isInteger(requestedUnitId) || !owned.has(requestedUnitId)) {
          sendError(ws, 'NOT_OWNER', 'You do not own this unitId');
          return false;
        }
        return true;
      },
    };

    const handler = INTENT_ACTION_HANDLERS[msg.action];
    if (!handler) {
      sendError(ws, 'BAD_INTENT', 'Unknown intent action');
      return;
    }

    handler(ctx);
  };
}
