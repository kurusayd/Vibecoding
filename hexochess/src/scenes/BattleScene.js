import Phaser from 'phaser';
import { hexToPixel, pixelToHex, hexCorners } from '../game/hex.js';
import { createUnitSystem } from '../game/units.js';
import { WSClient } from '../net/wsClient.js';
import { createFullscreenButton, positionFullscreenButton } from '../game/ui.js';
import {
  createBattleState,
  getUnitAt as coreGetUnitAt
} from '../../shared/battleCore.js';


export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  preload() {
    this.load.image('battleBg', '/assets/bg.jpg');
  }

  create() {
    this.cameras.main.setBackgroundColor('#1e1e1e');
    this.battleState = createBattleState();   // core state (пока пустой, ждём сервер)

    // фон
    this.bg = this.add.image(0, 0, 'battleBg')
    .setOrigin(0)
    .setDepth(-1000);

    // --- HEX SETTINGS ---
    this.hexSize = 32; //размер гекса
    this.gridCols = 12;
    this.gridRows = 8;

    this.benchRows = this.gridRows;
    this.benchGap = 90;

    this.originX = this.scale.width / 2 - 270;
    this.originY = this.scale.height / 2 - 120;

    // пробрасываем функции как "методы", чтобы старый код был простым
    this.hexToPixel = (q, r) => hexToPixel(this, q, r);
    this.pixelToHex = (x, y) => pixelToHex(this, x, y);
    this.hexCorners = (cx, cy) => hexCorners(this, cx, cy);

    this.g = this.add.graphics();
    this.selected = null;

    // units system
    this.unitSys = createUnitSystem(this);

    // drag state
    this.draggingUnitId = null;

    // --- SERVER CONNECTION ---
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';

    const WS_PORT = import.meta.env.VITE_WS_PORT || '3001';
    const ENV_HOST = import.meta.env.VITE_WS_HOST;

    // если открыто через localhost — всегда ходим WS на localhost
    const isLocalhost =
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    const WS_HOST = isLocalhost ? 'localhost' : (ENV_HOST || location.hostname);

    const wsHost = import.meta.env.DEV
      ? `${WS_HOST}:${WS_PORT}`
      : location.host;

    const wsUrl = `${wsProto}://${wsHost}`;
    this.ws = new WSClient(wsUrl);


    this.ws.onInit = (msg) => {
      // сервер прислал начальный state и сказал, каким юнитом ты управляешь
      this.battleState = msg.state;
      this.activeUnitId = msg.you.unitId;

      this.renderFromState();
      this.drawGrid();
      this.syncPhaseUI();
    };

    this.ws.onState = (state) => {
      // сервер прислал обновлённый state после чьего-то хода
      this.battleState = state;

      this.renderFromState();
      this.drawGrid();
      this.syncPhaseUI();
    };

    this.ws.onError = (err) => {
      console.warn('Server error:', err);
    };

    this.ws.connect();

    this.events.once('shutdown', () => {
      this.ws?.close();
    });

    this.events.once('destroy', () => {
      this.ws?.close();
    });

    // --- DRAG HANDLERS ---
    this.input.on('dragstart', (pointer, gameObject) => {
      if (this.battleState?.phase !== 'prep') return;
      const uid = gameObject?.data?.get?.('unitId');
      if (!uid) return;
      if (uid !== this.activeUnitId) return;

      this.draggingUnitId = uid;

      const vu = this.unitSys.findUnit(uid);
      if (vu?.hpBar) vu.hpBar.setVisible(false);
    });

    this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
      if (this.battleState?.phase !== 'prep') return;

      const uid = gameObject?.data?.get?.('unitId');
      if (!uid || uid !== this.activeUnitId) return;

      gameObject.setPosition(dragX, dragY);

      const vu = this.unitSys.findUnit(uid);

      if (vu) {
        vu.label.setPosition(dragX, dragY);
        // НЕ relayoutUnits() — он возвращает в гекс и ломает drag
      }
      
    });

    this.input.on('dragend', (pointer, gameObject) => {
      if (this.battleState?.phase !== 'prep') return;

      const uid = gameObject?.data?.get?.('unitId');
      if (!uid || uid !== this.activeUnitId) return;

      // 1) сначала проверяем скамейку
      const hitBench = this.tryPickBench(pointer.worldX, pointer.worldY);
      if (hitBench) {
        const slot = hitBench.row; // 0..7

        const p = this.benchSlotToScreen(slot);
        gameObject.setPosition(p.x, p.y);

        const vu = this.unitSys.findUnit(uid);
        if (vu) {
          vu.label.setPosition(p.x, p.y);
          // на скамейке hpBar не показываем
          if (vu.hpBar) vu.hpBar.setVisible(false);
        }
        
        this.ws?.sendIntentSetBench(slot);
        return;
      }

      // 2) иначе — обычная доска
      const hit = this.tryPickBoard(pointer.worldX, pointer.worldY);
      if (!hit) {
        this.renderFromState();
        return;
      }

      const p = this.hexToPixel(hit.q, hit.r);
      gameObject.setPosition(p.x, p.y);

      const vu = this.unitSys.findUnit(uid);
      if (vu) {
        vu.label.setPosition(p.x, p.y);
        if (vu.hpBar) vu.hpBar.setVisible(true);
        this.unitSys.setUnitPos(uid, hit.q, hit.r);
      }

      this.ws?.sendIntentSetStart(hit.q, hit.r);
    });



    // input - пока что убрали, чтобы автоматизировать боёвку
    //this.input.on('pointerdown', (p) => this.onPointerDown(p));

    // resize
    this.scale.on('resize', () => {
      this.layout();
      this.drawGrid();

      if (this.battleBtn) this.battleBtn.setPosition(this.scale.width / 2, 14);
      if (this.resultText) this.resultText.setPosition(this.scale.width / 2, 16);

      positionFullscreenButton(this);
    });

    this.layout();
    this.drawGrid();

    this.resizeBackground(); //Вызываем арт БГ

    // UI
    createFullscreenButton(this);
    positionFullscreenButton(this);

    // --- TOP CENTER UI ---
    this.battleBtn = this.add.text(this.scale.width / 2, 14, 'БОЙ', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '22px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.55)',
      padding: { left: 14, right: 14, top: 8, bottom: 8 },
    })
    .setOrigin(0.5, 0)
    .setDepth(9999)
    .setInteractive({ useHandCursor: true });

    this.battleBtn.on('pointerdown', () => {
      this.ws?.sendIntentStartBattle();
    });

    this.resultText = this.add.text(this.scale.width / 2, 16, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '34px',
      color: '#ffffff',
    })
    .setOrigin(0.5, 0)
    .setDepth(9999)
    .setVisible(false);


    this.renderFromState();  // отрисуем то что есть (пока пусто)
  }

  resizeBackground() {
    if (!this.bg) return;

    const designW = 960;
    const designH = 540;

    const scaleX = designW / this.bg.width;
    const scaleY = designH / this.bg.height;

    const scale = Math.max(scaleX, scaleY);

    this.bg.setScale(scale);
  }

  layout() {
    this.resizeBackground();

    this.originX = this.scale.width / 2 - 270;
    this.originY = this.scale.height / 2 - 120;

    this.unitSys.relayoutUnits();
  }

  setSpriteDraggable(sprite, enabled) {
    if (!sprite || !sprite.active) return;

    if (enabled) {
      sprite.setInteractive({ useHandCursor: true });
      this.input.setDraggable(sprite, true);
    } else {
      // выключаем только если есть input (иначе Phaser может упасть)
      if (sprite.input) {
        this.input.setDraggable(sprite, false);
        sprite.disableInteractive();
      }
    }
  }

  renderFromState() {
    // 1) кого оставляем
    const aliveIds = new Set((this.battleState?.units ?? []).map(u => u.id));

    // 2) удалить тех, кого нет в core state
    for (const vu of this.unitSys.state.units.slice()) {
      if (!aliveIds.has(vu.id)) {
        this.unitSys.destroyUnit(vu.id);
      }
    }

    // 3) индекс визуальных юнитов по id (после удаления)
    const byId = new Map();
    for (const vu of this.unitSys.state.units) {
      byId.set(vu.id, vu);
    }

    // 4) создать новых и обновить существующих
    for (const u of (this.battleState?.units ?? [])) {
      const existing = byId.get(u.id);

      // ---- CREATE ----
      if (!existing) {
        // создаём как раньше (на доске), это нужно для твоей текущей unitSys
        const created = this.unitSys.spawnUnitOnBoard(u.q, u.r, {
          id: u.id,
          label: u.team === 'player' ? 'P' : 'E',
          color: u.team === 'enemy' ? 0x66ccff : 0xff7777,
          team: u.team,
          hp: u.hp,
          maxHp: u.maxHp ?? u.hp,
          atk: u.atk,
        });

        if (!created) {
          console.warn('FAILED SPAWN VISUAL', {
            id: u.id,
            team: u.team,
            q: u.q,
            r: u.r,
            zone: u.zone,
            benchSlot: u.benchSlot,
            reason: 'cell occupied or invalid',
          });
          continue;
        }

        created.sprite.setDataEnabled();
        created.sprite.data.set('unitId', created.id);

        // если этот юнит мой — включаем drag по фазе
        const isMine = (this.activeUnitId != null) && (u.id === this.activeUnitId);
        const canDrag = isMine && (this.battleState?.phase === 'prep') && !this.battleState?.result;
        if (isMine) this.setSpriteDraggable(created.sprite, canDrag);

        // если сервер сказал "bench" — сразу переставим на скамейку
        if (u.zone === 'bench') {
          const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
          const p = this.benchSlotToScreen(slot);

          created.sprite.setPosition(p.x, p.y);
          created.label?.setPosition(p.x, p.y);

          // на скамейке hpBar не показываем
          if (created.hpBar) created.hpBar.setVisible(false);
        }

        continue;
      }

      // ---- UPDATE ----
      // позиция: доска или скамейка
      if (u.zone === 'bench') {
        const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
        const p = this.benchSlotToScreen(slot);

        const vu = this.unitSys.findUnit(u.id);
        if (vu?.sprite) vu.sprite.setPosition(p.x, p.y);
        if (vu?.label) vu.label.setPosition(p.x, p.y);

        // на скамейке hpBar не показываем
        if (vu?.hpBar) vu.hpBar.setVisible(false);
      } else {
        this.unitSys.setUnitPos(u.id, u.q, u.r);

        // на доске hpBar показываем обратно (если был скрыт)
        const vu = this.unitSys.findUnit(u.id);
        if (vu?.hpBar) vu.hpBar.setVisible(true);
      }

      // HP
      this.unitSys.setUnitHp(u.id, u.hp, u.maxHp ?? existing.maxHp);

      // draggable (только мой)
      const vu2 = this.unitSys.findUnit(u.id);
      if (vu2?.sprite) {
        const isMine = (this.activeUnitId != null) && (u.id === this.activeUnitId);
        const canDrag = isMine && (this.battleState?.phase === 'prep') && !this.battleState?.result;
        if (isMine) this.setSpriteDraggable(vu2.sprite, canDrag);
      }
    }
  }


  syncPhaseUI() {
    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;

    // если есть результат — показываем текст и прячем кнопку
    if (result) {
      this.battleBtn?.setVisible(false);

      const map = {
        victory: 'Победа',
        defeat: 'Поражение',
        draw: 'Ничья',
      };

      this.resultText?.setText(map[result] ?? String(result));
      this.resultText?.setVisible(true);
      return;
    }

    // результата нет
    this.resultText?.setVisible(false);

    // в prep показываем кнопку, в battle — прячем
    if (phase === 'prep') {
      this.battleBtn?.setVisible(true);
    } else {
      this.battleBtn?.setVisible(false);
    }

    // включить/выключить drag для моего юнита по фазе
    const me = this.unitSys.findUnit(this.activeUnitId);
    if (me?.sprite) {
      const canDrag = (phase === 'prep') && !result;
      this.setSpriteDraggable(me.sprite, canDrag);
    }
  }

  // ===== Drawing =====
  drawHex(cx, cy, lineColor = 0xffffff, alpha = 0.5) {
    const pts = this.hexCorners(cx, cy);
    this.g.lineStyle(1, lineColor, alpha);
    this.g.beginPath();
    this.g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.g.lineTo(pts[i].x, pts[i].y);
    this.g.closePath();
    this.g.strokePath();
  }

  drawGrid() {
    this.g.clear();

    // поле
    for (let row = 0; row < this.gridRows; row++) {
      for (let col = 0; col < this.gridCols; col++) {
        const q = col - Math.floor(row / 2);
        const r = row;
        const p = this.hexToPixel(q, r);
        this.drawHex(p.x, p.y, 0xffffff, 0.35);
      }
    }

    // скамья слева
    const leftTop = this.hexToPixel(0 - Math.floor(0 / 2), 0);
    const benchOriginX = leftTop.x - this.benchGap;

    for (let row = 0; row < this.benchRows; row++) {
      const q = 0 - Math.floor(row / 2);
      const r = row;

      const p = this.hexToPixel(q, r);
      const bx = p.x - (this.originX - benchOriginX);
      const by = p.y;

      this.drawHex(bx, by, 0xffcc66, 0.45);
    }

    // выделение
    if (this.selected?.area === 'board') {
      const p = this.hexToPixel(this.selected.q, this.selected.r);
      this.drawHex(p.x, p.y, 0x00ffcc, 1.0);
    }

    if (this.selected?.area === 'bench') {
      const { x, y } = this.selected.screen;
      this.drawHex(x, y, 0xffcc66, 1.0);
    }
  }

  // ===== Picking =====
  tryPickBoard(x, y) {
    const { q, r } = this.pixelToHex(x, y);
    const row = r;
    const col = q + Math.floor(row / 2);

    if (row < 0 || row >= this.gridRows) return null;
    if (col < 0 || col >= this.gridCols) return null;

    return { q, r, row, col };
  }

  benchSlotToScreen(slot) {
    const leftTop = this.hexToPixel(0 - Math.floor(0 / 2), 0);
    const benchOriginX = leftTop.x - this.benchGap;

    const dx = (this.originX - benchOriginX);

    const row = slot; // слот = ряд (0..7)
    const p = this.hexToPixel(0 - Math.floor(row / 2), row);

    const bx = p.x - dx;
    const by = p.y;

    return { x: bx, y: by };
  }

  tryPickBench(x, y) {
    const leftTop = this.hexToPixel(0 - Math.floor(0 / 2), 0);
    const benchOriginX = leftTop.x - this.benchGap;

    const dx = (this.originX - benchOriginX);
    const { q, r } = this.pixelToHex(x + dx, y);

    const row = r;
    const col = q + Math.floor(row / 2);

    if (row < 0 || row >= this.benchRows) return null;
    if (col !== 0) return null;

    const p = this.hexToPixel(0 - Math.floor(row / 2), row);
    const bx = p.x - dx;
    const by = p.y;

    return { row, col: 0, screen: { x: bx, y: by } };
  }

  update(time, delta) {
    this.unitSys.update(delta / 1000);
  }


  onPointerDown(pointer) {
    const x = pointer.worldX;
    const y = pointer.worldY;

    const hit = this.tryPickBoard(x, y);
    if (!hit) return;

    const targetCore = coreGetUnitAt(this.battleState, hit.q, hit.r);

    // НЕТ activeUnitId или ещё нет ws — ничего не делаем
    if (!this.activeUnitId || !this.ws) return;
    
    // Если кликнули по юниту — это intent "attack"
    if (targetCore) {
      this.ws.sendIntentAttack(targetCore.id);
      return;
    }

    // Если кликнули по пустой клетке — intent "move"
    this.ws.sendIntentMove(hit.q, hit.r);


    this.selected = { area: 'board', ...hit };
    this.drawGrid();
  }

}