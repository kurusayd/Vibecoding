import Phaser from 'phaser';
import { hexToPixel, pixelToHex, hexCorners } from '../game/hex.js';
import { createUnitSystem } from '../game/units.js';
import { createFullscreenButton, positionFullscreenButton } from '../game/ui.js';
import {
  createBattleState,
  addUnit,
  getUnitAt as coreGetUnitAt,
  moveUnit as coreMoveUnit,
  attack as coreAttack,
  hexDistance
} from '../game/battleCore.js';


export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  preload() {
    this.load.image('battleBg', '/assets/bg.jpg');
    }

  create() {
    this.cameras.main.setBackgroundColor('#1e1e1e');
    this.battleState = createBattleState();
    this.nextUnitId = 1;

    // фон
    this.bg = this.add.image(0, 0, 'battleBg')
    .setOrigin(0)
    .setDepth(-1000);

    // --- HEX SETTINGS ---
    this.hexSize = 34;
    this.gridCols = 12;
    this.gridRows = 8;

    this.benchRows = this.gridRows;
    this.benchGap = 130;

    this.originX = this.scale.width / 2 - 260;
    this.originY = this.scale.height / 2 - 160;

    // пробрасываем функции как "методы", чтобы старый код был простым
    this.hexToPixel = (q, r) => hexToPixel(this, q, r);
    this.pixelToHex = (x, y) => pixelToHex(this, x, y);
    this.hexCorners = (cx, cy) => hexCorners(this, cx, cy);

    this.g = this.add.graphics();
    this.selected = null;

    // units system
    this.unitSys = createUnitSystem(this);

    // input
    this.input.on('pointerdown', (p) => this.onPointerDown(p));

    // resize
    this.scale.on('resize', () => {
      this.layout();
      this.drawGrid();
      positionFullscreenButton(this);
    });

    this.layout();
    this.drawGrid();

    // spawn test units
    const playerId = this.nextUnitId++;
    addUnit(this.battleState, {
      id: playerId,
      q: 4,
      r: 3,
      hp: 100,
      atk: 25,
      team: 'player'
    });

    this.activeUnitId = playerId;

    const enemyId = this.nextUnitId++;
    addUnit(this.battleState, {
      id: enemyId,
      q: 7,
      r: 3,
      hp: 100,
      atk: 20,
      team: 'enemy'
    });

    this.resizeBackground(); //Вызываем арт БГ

    // UI
    createFullscreenButton(this);
    positionFullscreenButton(this);

    this.renderFromState();
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

    this.originX = this.scale.width / 2 - 260;
    this.originY = this.scale.height / 2 - 160;

    this.unitSys.relayoutUnits();
  }

  renderFromState() {
    // 1) Индекс текущих визуальных юнитов по id
    const byId = new Map();
    for (const vu of this.unitSys.state.units) {
      byId.set(vu.id, vu);
    }

    // 2) Помечаем кого надо удалить
    const aliveIds = new Set(this.battleState.units.map(u => u.id));

    // удалить тех, кого нет в core state
    for (const vu of this.unitSys.state.units.slice()) {
      if (!aliveIds.has(vu.id)) {
        this.unitSys.destroyUnit(vu.id);
      }
    }

    // 3) Создать новых и обновить существующих
    for (const u of this.battleState.units) {
      const existing = byId.get(u.id);

      if (!existing) {
        // создать нового
        this.unitSys.spawnUnitOnBoard(u.q, u.r, {
          id: u.id,                    // ВАЖНО: прокидываем id
          label: u.team === 'player' ? 'P' : 'E',
          color: u.team === 'enemy' ? 0x66ccff : 0xff7777,
          team: u.team,
          hp: u.hp,
          maxHp: u.maxHp ?? u.hp,
          atk: u.atk
        });
      } else {
        // обновить позицию
        this.unitSys.setUnitPos(u.id, u.q, u.r);

        // обновить HP (запускает анимацию)
        this.unitSys.setUnitHp(u.id, u.hp, u.maxHp ?? existing.maxHp);
      }
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
    const dt = delta / 1000;
    this.unitSys.update(delta / 1000);
  }


  onPointerDown(pointer) {
    const x = pointer.worldX;
    const y = pointer.worldY;

    const hit = this.tryPickBoard(x, y);
    if (!hit) return;

    const targetCore = coreGetUnitAt(this.battleState, hit.q, hit.r);

    // атака
    if (targetCore && this.activeUnitId) {
      const result = coreAttack(this.battleState, this.activeUnitId, targetCore.id);
      if (result.success) {
        this.renderFromState();
        this.drawGrid();
        return;
      }
    }

    // движение
    if (!targetCore && this.activeUnitId) {
      const moved = coreMoveUnit(this.battleState, this.activeUnitId, hit.q, hit.r);
      if (moved) this.renderFromState();
    }

    this.selected = { area: 'board', ...hit };
    this.drawGrid();
  }

}
