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
    this.load.image('king', '/assets/king.png');
    this.load.image('coin', '/assets/coin.png');
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

    // --- KINGS UI (лево/право) ---
    this.kingWidth = 120;
    this.kingHeight = 120;

    // HP bars
    this.kingLeftHpBg = this.add.graphics().setDepth(52);
    this.kingLeftHpFill = this.add.graphics().setDepth(53);

    this.kingRightHpBg = this.add.graphics().setDepth(52);
    this.kingRightHpFill = this.add.graphics().setDepth(53);

    this.kingLeft = this.add.image(0, 0, 'king').setDepth(50);
    this.kingLeft.setDisplaySize(this.kingWidth, this.kingHeight);

    this.kingRight = this.add.image(0, 0, 'king').setDepth(50).setFlipX(true);
    this.kingRight.setDisplaySize(this.kingWidth, this.kingHeight);

    const kingTextStyle = {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#ffffff',
    };

    // --- COINS UI ---
    this.coinSize = 20;

    // левый
    this.kingLeftCoinIcon = this.add.image(0, 0, 'coin')
      .setDisplaySize(this.coinSize, this.coinSize)
      .setDepth(51);

    this.kingLeftCoinText = this.add.text(0, 0, '', kingTextStyle)
      .setDepth(51)
      .setOrigin(0, 0.5);

    // правый
    this.kingRightCoinIcon = this.add.image(0, 0, 'coin')
      .setDisplaySize(this.coinSize, this.coinSize)
      .setDepth(51);

    this.kingRightCoinText = this.add.text(0, 0, '', kingTextStyle)
      .setDepth(51)
      .setOrigin(0, 0.5);

    // врагу монеты скрываем
    this.kingRightCoinIcon.setVisible(false);
    this.kingRightCoinText.setVisible(false);


    const hpTextStyle = { //вставляем текст НР бара короля поверх полоски
      fontFamily: kingTextStyle.fontFamily,
      fontSize: '12px',
      color: '#ffffff',
    };

    this.kingLeftHpText = this.add.text(0, 0, '', hpTextStyle)
      .setDepth(54)
      .setOrigin(0.5, 0.5)
      .setShadow(0, 0, '#000000', 4, true, true);

    this.kingRightHpText = this.add.text(0, 0, '', hpTextStyle)
      .setDepth(54)
      .setOrigin(0.5, 0.5)
      .setShadow(0, 0, '#000000', 4, true, true);

    this.kingRightHpText.setVisible(false);



    // enemy king по умолчанию скрыт (покажем в syncKingsUI по фазе)
    this.kingRight.setVisible(false);

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
    this.dragHover = null; // { zone:'board', q,r } | { zone:'bench', slot }

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
      this.activeUnitId = msg?.you?.unitId ?? null; // теперь может быть null (старт пустой)

      this.renderFromState();
      this.drawGrid();
      this.syncPhaseUI();
      this.syncKingsUI();
      this.syncShopUI();
    };

    this.ws.onState = (state) => {
      // сервер прислал обновлённый state после чьего-то хода
      this.battleState = state;
      this.shadowOverride = null;

      this.renderFromState();
      this.drawGrid();
      this.syncPhaseUI();
      this.syncKingsUI();
      this.syncShopUI();
    };

    this.ws.onError = (err) => {
      console.warn('Server error:', err);

      if (err?.code === 'OCCUPIED' || err?.code === 'MOVE_DENIED' || err?.code === 'NOT_OWNER') {
        this.shadowOverride = null;
        this.dragHover = null;
        this.draggingUnitId = null;
        this.renderFromState();
        this.drawGrid();
      }
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
      const core = (this.battleState?.units ?? []).find(u => u.id === uid);
      if (!core || core.team !== 'player') return;

      this.draggingUnitId = uid;

      // при поднятии сразу выставляем "куда целимся", чтобы не было мигания
      const hitBench = this.tryPickBench(pointer.worldX, pointer.worldY);
      if (hitBench) {
        this.dragHover = { zone: 'bench', slot: hitBench.row };
      } else {
        const hitBoard = this.tryPickBoard(pointer.worldX, pointer.worldY);
        this.dragHover = hitBoard ? { zone: 'board', q: hitBoard.q, r: hitBoard.r } : null;
      }

      // сбрасываем override только если он относится к этому же юниту
      if (this.shadowOverride?.unitId === uid) this.shadowOverride = null;

      const vu = this.unitSys.findUnit(uid);
      if (vu?.hpBar) vu.hpBar.setVisible(false);

      this.drawGrid();
    });

    this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
      if (this.battleState?.phase !== 'prep') return;

      const uid = gameObject?.data?.get?.('unitId');
      if (!uid) return;

      const core = (this.battleState?.units ?? []).find(u => u.id === uid);
      if (!core || core.team !== 'player') return;


      gameObject.setPosition(dragX, dragY);

      // подсветка клетки под курсором
      const hitBench = this.tryPickBench(pointer.worldX, pointer.worldY);
      if (hitBench) {
        this.dragHover = { zone: 'bench', slot: hitBench.row };
      } else {
        const hitBoard = this.tryPickBoard(pointer.worldX, pointer.worldY);
        // важно: если курсор вне валидных клеток — НЕ гасим hover, оставляем последний валидный
        if (hitBoard) this.dragHover = { zone: 'board', q: hitBoard.q, r: hitBoard.r };
      }

      this.drawGrid();

      const vu = this.unitSys.findUnit(uid);

      if (vu) {
        vu.label.setPosition(dragX, dragY);
        // НЕ relayoutUnits() — он возвращает в гекс и ломает drag
      }
      
    });

    this.input.on('dragend', (pointer, gameObject) => {
      if (this.battleState?.phase !== 'prep') return;

      const uid = gameObject?.data?.get?.('unitId');
      if (!uid) return;

      const core = (this.battleState?.units ?? []).find(u => u.id === uid);
      if (!core || core.team !== 'player') return;

       // больше не тащим — можно снова рисовать "занято" тень
      this.draggingUnitId = null;
      this.dragHover = null;
      this.shadowOverride = null; // локальная позиция тени для моего юнита до прихода state

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

        this.shadowOverride = { unitId: uid, zone: 'bench', slot };
        this.ws?.sendIntentSetBench(uid, slot); // если у тебя уже с unitId, оставь как есть
        this.drawGrid(); // важно: сразу восстановить тени
        return;
      }

      // 2) иначе — обычная доска
      const hit = this.tryPickBoard(pointer.worldX, pointer.worldY);
      if (!hit) {
        // откат по authoritative state + восстановить тени
        this.shadowOverride = null;
        this.dragHover = null;
        this.renderFromState();
        this.drawGrid();
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

      this.shadowOverride = { unitId: uid, zone: 'board', q: hit.q, r: hit.r };
      this.ws?.sendIntentSetStart(uid, hit.q, hit.r);
      this.drawGrid();
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
      this.positionShop();
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

    // --- SHOP UI (5 offers) ---
    this.shopButtons = [];
    const shopStyle = {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.55)',
      padding: { left: 10, right: 10, top: 6, bottom: 6 },
    };

    const startX = this.scale.width / 2;
    const startY = this.scale.height - 70;
    const gap = 8;

    for (let i = 0; i < 5; i++) {
      const t = this.add.text(0, 0, `(${i}) ...`, shopStyle)
        .setDepth(9999)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });

      t.on('pointerdown', () => {
        this.ws?.sendIntentShopBuy?.(i);
      });

      this.shopButtons.push(t);
    }

    this.positionShop();
    this.syncShopUI();

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

    this.positionKings();
  }

  positionShop() {
    if (!this.shopButtons?.length) return;

    const startY = this.scale.height - 70;
    const totalW = this.shopButtons.reduce((sum, b) => sum + b.width, 0) + (this.shopButtons.length - 1) * 8;
    let x = this.scale.width / 2 - totalW / 2;

    for (let i = 0; i < this.shopButtons.length; i++) {
      const b = this.shopButtons[i];
      b.setPosition(x + b.width / 2, startY);
      x += b.width + 8;
    }
  }

  syncShopUI() {
    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;

    const show = (phase === 'prep') && !result;

    for (const b of (this.shopButtons ?? [])) b.setVisible(show);
    if (!show) return;

    const offers = this.battleState?.shop?.offers ?? [];
    for (let i = 0; i < (this.shopButtons?.length ?? 0); i++) {
      const o = offers[i];
      const txt = o
        ? `${o.type}  ${o.cost}💰  HP:${o.hp} ATK:${o.atk}`
        : '...';
      this.shopButtons[i].setText(txt);
    }

    // после смены текста ширины меняются — перепозиционируем
    this.positionShop();
  }


  positionKings() {
    if (!this.kingLeft || !this.kingRight) return;

    // считаем bounds поля через центры гексов
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (let r = 0; r < this.gridRows; r++) {
      for (let col = 0; col < this.gridCols; col++) {
        const q = col - Math.floor(r / 2);
        const p = this.hexToPixel(q, r);
        if (!p) continue;

        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return;

    const midY = (minY + maxY) / 2 - 40; // подняли выше

    const pad = 30;
    const halfW = this.kingWidth / 2;
    const halfH = this.kingHeight / 2;

    const leftX = minX - halfW - pad - 70;   // левый король ещё левее на 70px;
    const rightX = maxX + halfW + pad - 20;  // правый король левее на 20px;

    this.kingLeft.setPosition(leftX, midY);
    this.kingRight.setPosition(rightX, midY);

    // внизу оставляем только Coins (HP будет поверх бара)
    const coinY = midY + halfH + 14;

    // левый
    this.kingLeftCoinIcon.setPosition(leftX - 15, coinY);
    this.kingLeftCoinText.setPosition(leftX, coinY);

    // правый
    this.kingRightCoinIcon.setPosition(rightX - 15, coinY);
    this.kingRightCoinText.setPosition(rightX, coinY);


  }

  syncKingsUI() {
    const kings = this.battleState?.kings;

    const p = kings?.player ?? { hp: 100, maxHp: 100, coins: 0 };
    this.kingLeftCoinText?.setText(`x ${p.coins}`);

    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;

    const e = kings?.enemy ?? { hp: 100, maxHp: 100, coins: 0, visible: false };

    // считаем "всё ещё battle", пока показывается результат
    const isBattleView = (phase === 'battle') || (result != null);

    const showEnemy = isBattleView && (e.visible !== false);


    this.kingRight?.setVisible(showEnemy);

    this.drawKingHpBars();
  }

  drawKingHpBars() {
    const kings = this.battleState?.kings;
    if (!kings) return;

    const barWidth = 70;
    const barHeight = 10;

    const drawBar = (kingSprite, hpBg, hpFill, kingData) => {
      if (!kingSprite || !kingData) return;

      const x = kingSprite.x - barWidth / 2;
      const y = kingSprite.y - this.kingHeight / 2 - 20;

      hpBg.clear();
      hpFill.clear();

      hpBg.fillStyle(0x222222, 1);
      hpBg.fillRect(x, y, barWidth, barHeight);

      const ratio = Phaser.Math.Clamp(
        kingData.hp / kingData.maxHp,
        0,
        1
      );

      hpFill.fillStyle(0x00ff00, 1);
      hpFill.fillRect(x, y, barWidth * ratio, barHeight);

      // текст HP поверх полоски
      const hpText = (kingSprite === this.kingLeft) ? this.kingLeftHpText : this.kingRightHpText;
      if (hpText) {
        hpText.setPosition(kingSprite.x, y + barHeight / 2);
        hpText.setText(`${kingData.hp}/${kingData.maxHp}`);
        hpText.setVisible(true);
      }

    };

    drawBar(this.kingLeft, this.kingLeftHpBg, this.kingLeftHpFill, kings.player);

    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;

    const isBattleView = (phase === 'battle') || (result != null);
    const showEnemy = isBattleView && kings.enemy?.visible !== false;

    if (showEnemy) {
      drawBar(this.kingRight, this.kingRightHpBg, this.kingRightHpFill, kings.enemy);
    } else {
      this.kingRightHpBg.clear();
      this.kingRightHpFill.clear();
      this.kingRightHpText?.setVisible(false);
    }
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
    const phase = this.battleState?.phase ?? 'prep';

    // в prep скрываем enemy, в battle показываем всех
    const visibleUnits = (this.battleState?.units ?? []).filter(u => {
      if (phase === 'prep' && u.team === 'enemy') return false;
      return true;
    });

    const aliveIds = new Set(visibleUnits.map(u => u.id));

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
    for (const u of visibleUnits) {
      const existing = byId.get(u.id);

      // ---- CREATE ----
      if (!existing) {
        // создаём как раньше (на доске), это нужно для твоей текущей unitSys
        let created = null;

        if (u.zone === 'bench') {
          const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
          const p = this.benchSlotToScreen(slot);

          created = this.unitSys.spawnUnitAtScreen(p.x, p.y, {
            id: u.id,
            label: (
              u.type === 'Archer' ? 'A' :
              u.type === 'Tank' ? 'T' :
              u.type === 'Swordsman' ? 'S' :
              '?'
            ),
            color: u.team === 'enemy' ? 0x66ccff : 0xff7777,
            team: u.team,
            hp: u.hp,
            maxHp: u.maxHp ?? u.hp,
            atk: u.atk,
          });
        } else {
          created = this.unitSys.spawnUnitOnBoard(u.q, u.r, {
            id: u.id,
            label: (
              u.type === 'Archer' ? 'A' :
              u.type === 'Tank' ? 'T' :
              u.type === 'Swordsman' ? 'S' :
              '?'
            ),
            color: u.team === 'enemy' ? 0x66ccff : 0xff7777,
            team: u.team,
            hp: u.hp,
            maxHp: u.maxHp ?? u.hp,
            atk: u.atk,
          });
        }


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

        // drag разрешаем всем юнитам игрока в prep
        const canDrag = (u.team === 'player') && (this.battleState?.phase === 'prep') && !this.battleState?.result;
        this.setSpriteDraggable(created.sprite, canDrag);

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

      // draggable всем юнитам игрока в prep
      const vu2 = this.unitSys.findUnit(u.id);
      const vuLabel = this.unitSys.findUnit(u.id);
      if (vuLabel?.label) {
        const t = String(u.type ?? '').toLowerCase();
        const ch =
          (t === 'archer') ? 'A' :
          (t === 'tank') ? 'T' :
          (t === 'swordsman' || t === 'swordmen') ? 'S' :
          '?';
        vuLabel.label.setText(ch);
      }

      if (vu2?.sprite) {
        const canDrag = (u.team === 'player') && (this.battleState?.phase === 'prep') && !this.battleState?.result;
        this.setSpriteDraggable(vu2.sprite, canDrag);
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

    // drag управляется в renderFromState(): всем player-юнитам в prep
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

  drawHexFilled(cx, cy, fillColor = 0x000000, fillAlpha = 0.25) {
    const pts = this.hexCorners(cx, cy);
    this.g.fillStyle(fillColor, fillAlpha);
    this.g.beginPath();
    this.g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.g.lineTo(pts[i].x, pts[i].y);
    this.g.closePath();
    this.g.fillPath();
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

    // затемнение занятых гексов (доска + скамейка)
    for (const u of (this.battleState?.units ?? [])) {
      // в prep врагов не затемняем (они скрыты)
      if (this.battleState?.phase === 'prep' && u.team === 'enemy') continue;

      // если это юнит, который сейчас тащим — не рисуем старую "занятую" тень
      if (this.draggingUnitId != null && u.id === this.draggingUnitId) continue;

      // если для этого юнита есть локальный override — тень рисуем по override, а не по battleState
      if (this.shadowOverride && u.id === this.shadowOverride.unitId) {
        if (this.shadowOverride.zone === 'board') {
          const p = this.hexToPixel(this.shadowOverride.q, this.shadowOverride.r);
          this.drawHexFilled(p.x, p.y, 0x000000, 0.35);
        } else if (this.shadowOverride.zone === 'bench') {
          const p = this.benchSlotToScreen(this.shadowOverride.slot);
          this.drawHexFilled(p.x, p.y, 0x000000, 0.35);
        }
        continue;
      }

      if (u.zone === 'board') {
        const p = this.hexToPixel(u.q, u.r);
        this.drawHexFilled(p.x, p.y, 0x000000, 0.35);
        continue;
      }

      if (u.zone === 'bench') {
        const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
        const p = this.benchSlotToScreen(slot);
        this.drawHexFilled(p.x, p.y, 0x000000, 0.35);
        continue;
      }
    }

    // тень под курсором во время drag (куда кладём)
    if (this.dragHover && this.battleState?.phase === 'prep' && !this.battleState?.result) {
      if (this.dragHover.zone === 'board') {
        const p = this.hexToPixel(this.dragHover.q, this.dragHover.r);
        this.drawHexFilled(p.x, p.y, 0x000000, 0.55);
      } else if (this.dragHover.zone === 'bench') {
        const p = this.benchSlotToScreen(this.dragHover.slot);
        this.drawHexFilled(p.x, p.y, 0x000000, 0.55);
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