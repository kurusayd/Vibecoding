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
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';

    // локально WS на 3001, в проде WS на том же домене (потому что сервер раздаёт dist)
    const wsHost = isLocal ? `${location.hostname}:3001` : location.host;

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
    });

    this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
      if (this.battleState?.phase !== 'prep') return;
      const uid = gameObject?.data?.get?.('unitId');
      if (!uid || uid !== this.activeUnitId) return;

      // двигаем кружок прямо за мышкой
      gameObject.setPosition(dragX, dragY);

      // двигаем текст и hpbar вместе
      const vu = this.unitSys.findUnit(uid);
      if (vu) {
        vu.label.setPosition(dragX, dragY);
        // hpbar обновится через updateHpBar внутри unitSys.setUnitPos,
        // но тут у нас "временное", так что просто дернем relayout для бара:
        this.unitSys.relayoutUnits();
      }
    });

    this.input.on('dragend', (pointer, gameObject) => {
      const uid = gameObject?.data?.get?.('unitId');
      if (!uid || uid !== this.activeUnitId) return;

      this.draggingUnitId = null;

      // куда отпустили: ближайший гекс на поле
      const hit = this.tryPickBoard(pointer.worldX, pointer.worldY);
      if (!hit) {
        // если отпустили мимо поля — вернуть на место из state (сервер пришлёт, но лучше сразу)
        this.renderFromState();
        return;
      }

      // отправляем серверу "поставь старт сюда"
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

  setCircleDraggable(circle, enabled) {
    if (!circle || !circle.active) return;

    if (enabled) {
      // ВКЛ: сначала делаем интерактивным (создаст circle.input), потом draggable
      circle.setInteractive({ useHandCursor: true });
      this.input.setDraggable(circle, true);
    } else {
      // ВЫКЛ: если circle никогда не был interactive, circle.input === null
      // значит setDraggable трогать нельзя — оно упадёт
      if (circle.input) {
        this.input.setDraggable(circle, false);
        circle.disableInteractive();
      }
    }
  }

  renderFromState() {
    // 2) Помечаем кого надо удалить
    const aliveIds = new Set(this.battleState.units.map(u => u.id));

    // удалить тех, кого нет в core state
    for (const vu of this.unitSys.state.units.slice()) {
      if (!aliveIds.has(vu.id)) {
        this.unitSys.destroyUnit(vu.id);
      }
    }

    // индекс визуальных юнитов по id (после удаления)
    const byId = new Map();
    for (const vu of this.unitSys.state.units) {
      byId.set(vu.id, vu);
    }

    // 3) Создать новых и обновить существующих
    for (const u of this.battleState.units) {
      const existing = byId.get(u.id);

      if (!existing) {
        // создать нового
        const created = this.unitSys.spawnUnitOnBoard(u.q, u.r, {
          id: u.id,
          label: u.team === 'player' ? 'P' : 'E',
          color: u.team === 'enemy' ? 0x66ccff : 0xff7777,
          team: u.team,
          hp: u.hp,
          maxHp: u.maxHp ?? u.hp,
          atk: u.atk
        });

        if (!created) {
          console.warn('FAILED SPAWN VISUAL', {
            id: u.id,
            team: u.team,
            q: u.q,
            r: u.r,
            reason: 'cell occupied or invalid',
          });
          continue;
        }

        if (created) {
          // пометим gameObject, чтобы в drag handler понять чей это юнит
          created.circle.setDataEnabled();
          created.circle.data.set('unitId', created.id);

          const isMine = (this.activeUnitId != null) && (u.id === this.activeUnitId);
          const canDrag = isMine && (this.battleState?.phase === 'prep') && !this.battleState?.result;

          if (isMine) {
            this.setCircleDraggable(created.circle, canDrag);
          }

        };
      } else {
        // обновить позицию
        this.unitSys.setUnitPos(u.id, u.q, u.r);

        // обновить HP (запускает анимацию)
        this.unitSys.setUnitHp(u.id, u.hp, u.maxHp ?? existing.maxHp);

        const vu = this.unitSys.findUnit(u.id);
        if (vu?.circle) {
          const isMine = (this.activeUnitId != null) && (u.id === this.activeUnitId);
          const canDrag = isMine && (this.battleState?.phase === 'prep') && !this.battleState?.result;

          if (isMine) {
            this.setCircleDraggable(vu.circle, canDrag);
          }
        }
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
    if (me?.circle) {
      const canDrag = (phase === 'prep') && !result;
      this.setCircleDraggable(me.circle, canDrag);
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
    console.log('INTENT', targetCore ? 'attack' : 'move', targetCore ? targetCore.id : [hit.q, hit.r]);

    // Если кликнули по юниту — это intent "attack"
    if (targetCore) {
      console.log('INTENT attack targetId=', targetCore.id);
      this.ws.sendIntentAttack(targetCore.id);
      return;
    }

    // Если кликнули по пустой клетке — intent "move"
    this.ws.sendIntentMove(hit.q, hit.r);


    this.selected = { area: 'board', ...hit };
    this.drawGrid();
  }

}