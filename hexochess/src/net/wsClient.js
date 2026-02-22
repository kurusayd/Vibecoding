// src/net/wsClient.js

import {
  makeStartBattleIntent,
  makeShopBuyIntent,
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
      const msg = JSON.parse(event.data);

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

  sendIntentSetBench(unitId, slot) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'intent', action: 'setBench', unitId, slot }));
  }

  sendIntentSetStart(unitId, q, r) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'intent', action: 'setStart', unitId, q, r }));
  }

  sendIntentStartBattle() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = makeStartBattleIntent();
    this.ws.send(JSON.stringify(msg));
  }

  sendIntentShopBuy(offerIndex) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = makeShopBuyIntent(offerIndex);
    this.ws.send(JSON.stringify(msg));
  }


}
