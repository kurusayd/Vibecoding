// shared/messages.js

// ===== Типы сообщений от сервера к клиенту =====

// Сервер сообщает клиенту начальное состояние игры
export function makeInitMessage({ clientId, unitId, state }) {
  return {
    type: 'init',
    you: {
      clientId,
      unitId
    },
    state
  };
}

// Сервер сообщает обновлённое состояние игры
export function makeStateMessage(state) {
  return {
    type: 'state',
    state
  };
}

// Сервер сообщает об ошибке
export function makeErrorMessage(code, message) {
  return {
    type: 'error',
    code,
    message
  };
}


// ===== Типы сообщений от клиента к серверу =====

// Клиент хочет походить
export function makeMoveIntent(unitId, q, r) {
  return { type: 'intent', action: 'move', unitId, q, r };
}

// Клиент хочет атаковать
export function makeAttackIntent(targetId) {
  return {
    type: 'intent',
    action: 'attack',
    targetId
  };
}

// Клиент просит начать бой
export function makeStartBattleIntent() {
  return {
    type: 'intent',
    action: 'startBattle',
  };
}

// Клиент просит выставить стартовую позицию юнита (только в prep)
export function makeSetStartIntent(unitId, q, r) {
  return { type: 'intent', action: 'setStart', unitId, q, r };
}

export function makeSetBenchIntent(unitId, slot) {
  return { type: 'intent', action: 'setBench', unitId, slot };
}

export function makeShopBuyIntent(offerIndex) {
  return { type: 'intent', action: 'shopBuy', offerIndex };
}