import Phaser from 'phaser';
import { hexToPixel, pixelToHex, hexCorners, hexDistance } from '../game/hex.js';
import { createUnitSystem } from '../game/units.js';
import { createFullscreenButton, positionFullscreenButton } from '../game/ui.js';
import { attackIfPossible } from '../game/combat.js';

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  preload() {
    this.load.image('battleBg', '/assets/bg.jpg');
    }

  create() {
    this.cameras.main.setBackgroundColor('#1e1e1e');

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
    this.unitSys.spawnUnitOnBoard(4, 3, { label: 'A', color: 0xff7777, team: 'player' });
    this.activeUnit = this.unitSys.state.units[0];

    this.unitSys.spawnUnitOnBoard(7, 3, { label: 'E', color: 0x66ccff, team: 'enemy' });

    this.resizeBackground(); //Вызываем арт БГ

    // UI
    createFullscreenButton(this);
    positionFullscreenButton(this);
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

  onPointerDown(pointer) {
    const x = pointer.worldX;
    const y = pointer.worldY;

    const hit = this.tryPickBoard(x, y);
    if (hit) {
      this.selected = { area: 'board', ...hit };

      const targetUnit = this.unitSys.getUnitAt(hit.q, hit.r);

      // атака по врагу
      if (targetUnit && this.activeUnit && targetUnit.team === 'enemy') {
        const did = attackIfPossible(this, this.activeUnit, targetUnit, hexDistance);
        if (did && targetUnit.hp <= 0) {
          this.unitSys.removeUnit(targetUnit);
        }
        this.drawGrid();
        return;
      }

      // перемещение на пустую
      if (!targetUnit && this.activeUnit) {
        this.unitSys.moveUnit(this.activeUnit, hit.q, hit.r);
      }

      this.drawGrid();
      return;
    }

    const benchHit = this.tryPickBench(x, y);
    if (benchHit) {
      this.selected = { area: 'bench', ...benchHit };
      this.drawGrid();
    }
  }
}
