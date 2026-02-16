// src/net/wsClient.js

import {
  makeMoveIntent,
  makeAttackIntent
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

  sendIntentMove(q, r) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const msg = makeMoveIntent(q, r);
    this.ws.send(JSON.stringify(msg));
  }

  sendIntentAttack(targetId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const msg = makeAttackIntent(targetId);
    this.ws.send(JSON.stringify(msg));
  }
}
