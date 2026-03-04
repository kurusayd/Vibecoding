// src/net/wsClient.js

import {
  makeStartBattleIntent,
  makeSetBenchIntent,
  makeSetStartIntent,
  makeStartGameIntent,
  makeBuyXpIntent,
  makeDebugAddGold100Intent,
  makeDebugAddLevelIntent,
  makeDebugSetShopUnitIntent,
  makeShopBuyIntent,
  makeShopRefreshIntent,
  makeResetGameIntent,
  makeRemoveUnitIntent,
} from '../../shared/messages.js';

export class WSClient {
  constructor(url) {
    this.url = url;
    this.ws = null;

    // коллбеки
    this.onInit = null;
    this.onState = null;
    this.onError = null;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WS connected');
    };

    this.ws.onmessage = (event) => {
      let msg = null;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        console.warn('WS bad JSON message', err);
        return;
      }

      if (msg.type === 'init') {
        if (this.onInit) {
          this.onInit(msg);
        }
      }

      if (msg.type === 'state') {
        if (this.onState) {
          this.onState(msg.state);
        }
      }

      if (msg.type === 'error') {
        if (this.onError) {
          this.onError(msg);
        }
      }
    };

    this.ws.onclose = () => {
      console.log('WS disconnected');
    };

    this.ws.onerror = (err) => {
      console.error('WS error', err);
    };
  }

  close() {
    if (!this.ws) return;
    try { this.ws.close(); } catch {}
    this.ws = null;
  }

  sendIntent(intent) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(intent));
    return true;
  }

  sendIntentSetBench(unitId, slot) {
    return this.sendIntent(makeSetBenchIntent(unitId, slot));
  }

  sendIntentSetStart(unitId, q, r) {
    return this.sendIntent(makeSetStartIntent(unitId, q, r));
  }

  sendIntentStartBattle() {
    return this.sendIntent(makeStartBattleIntent());
  }

  sendIntentStartGame() {
    return this.sendIntent(makeStartGameIntent());
  }

  sendIntentBuyXp() {
    return this.sendIntent(makeBuyXpIntent());
  }

  sendIntentDebugAddGold100() {
    return this.sendIntent(makeDebugAddGold100Intent());
  }

  sendIntentDebugAddLevel() {
    return this.sendIntent(makeDebugAddLevelIntent());
  }

  sendIntentDebugSetShopUnit(unitType) {
    return this.sendIntent(makeDebugSetShopUnitIntent(unitType));
  }

  sendIntentShopBuy(offerIndex) {
    return this.sendIntent(makeShopBuyIntent(offerIndex));
  }

  sendIntentShopRefresh() {
    return this.sendIntent(makeShopRefreshIntent());
  }

  sendIntentResetGame() {
    return this.sendIntent(makeResetGameIntent());
  }

  sendIntentRemoveUnit(unitId) {
    return this.sendIntent(makeRemoveUnitIntent(unitId));
  }


}
