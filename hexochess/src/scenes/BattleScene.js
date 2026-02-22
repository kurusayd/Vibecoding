import Phaser from 'phaser';
import { hexToPixel, pixelToHex, hexCorners } from '../game/hex.js';
import { createUnitSystem } from '../game/units.js';
import { WSClient } from '../net/wsClient.js';
import { createFullscreenButton, positionFullscreenButton } from '../game/ui.js';
import { updateHpBar } from '../game/hpbar.js';

import {
  createBattleState,
  KING_XP_COST,
  KING_MAX_LEVEL,
} from '../../shared/battleCore.js';


export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  preload() { //Подгружаем пулл картинок
    this.load.image('battleBg', '/assets/bg.jpg');
    this.load.image('king', '/assets/king.png');
    this.load.image('coin', '/assets/coin.png');
    this.load.image('rank1', '/assets/rank1.png');
    this.load.image('rank2', '/assets/rank2.png');
    this.load.image('rank3', '/assets/rank3.png');
    this.load.image('crownexp', '/assets/crownexp.png');

    // ✅ swordman atlas (png+json)
    this.load.atlas(
      'sworman_atlas',
      '/assets/units/swordman/atlas/swordman_atlas.png',
      '/assets/units/swordman/atlas/swordman_atlas.json'
    );

    // дебаг загрузки: покажет ключ и URL, который не смог загрузиться
    this.load.on('loaderror', (file) => {
      console.error('[LOAD ERROR]', file?.key, file?.src);
    });
  }

  create() {
    this.cameras.main.setBackgroundColor('#1e1e1e');
    this.battleState = createBattleState();   // core state (пока пустой, ждём сервер)
    this.kingXpCost = KING_XP_COST;
    this.kingMaxLevel = KING_MAX_LEVEL;

    // фон
    this.bg = this.add.image(0, 0, 'battleBg')
    .setOrigin(0)
    .setDepth(-1000);

    // --- HEX SETTINGS ---
    this.hexSize = 44; //размер гекса
    this.gridCols = 12;
    this.gridRows = 8;

    this.benchRows = this.gridRows;
    this.benchGap = 120;

    this.originX = this.scale.width / 2 - 270;
    this.originY = this.scale.height / 2 - 120;

    // --- KINGS UI (лево/право) ---
    this.kingWidth = 160;
    this.kingHeight = 160;

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
      fontSize: '21px',
      color: '#ffffff',
    };

    // --- COINS UI (coin icon + progress bar) ---
    this.coinSize = 28;
    this.coinMax = 100; // ✅ максимальное кол-во монет

    this.coinContainer = this.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(9998);

    this.kingLeftCoinIcon = this.add.image(0, 0, 'coin')
      .setDisplaySize(this.coinSize, this.coinSize)
      .setOrigin(0.5, 0.5);

    this.coinBarBg = this.add.graphics();
    this.coinBarFill = this.add.graphics();

    this.kingLeftCoinText = this.add.text(0, 0, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',        // ✅ как у lv. 1
      color: '#ffffff',
    })
      .setOrigin(0.5, 0.5)
      .setShadow(0, 0, '#000000', 4, true, true);

    // порядок как у XP: bg -> fill -> icon -> text
    this.coinContainer.add([
      this.coinBarBg,
      this.coinBarFill,
      this.kingLeftCoinIcon,
      this.kingLeftCoinText,
    ]);

    // --- COIN INFO POPUP (hit zone) ---
    this.coinInfoOpen = false;

    // интерактивная зона на весь блок монет (иконка + бар)
    this.coinHit = this.add.zone(0, 0, 230, 44)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    this.coinContainer.add(this.coinHit);

    this.coinHit.on('pointerdown', (pointer) => {
      pointer?.event?.stopPropagation?.();

      // переключаем попап
      if (this.coinInfoOpen) {
        this.hideCoinInfoPopup();
      } else {
        this.showCoinInfoPopup();
      }
    });

    // --- KING LEVEL UI (crown + xp bar) ---
    this.kingLevelExpanded = false;

    this.kingLevelContainer = this.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(9998);

    this.kingLevelIcon = this.add.image(0, 0, 'crownexp')
      .setDisplaySize(30, 30)
      .setOrigin(0.5, 0.5);
    this.kingLevelIcon.y = -3; // чуть поднять саму корону

    this.kingLevelBarBg = this.add.graphics();
    this.kingLevelBarFill = this.add.graphics();

    this.kingLevelText = this.add.text(0, 0, 'lv. 1', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5, 0.5);

    this.kingLevelXpText = this.add.text(0, 0, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '18px',          // было 14px → делаем крупнее
      color: '#ffffff',
    })
      .setOrigin(0.5, 0)
      .setVisible(false)
      .setStroke('#000000', 2)   // было 4 → делаем тонкую аккуратную обводку
      .setShadow(0, 0, '#000000', 2, true, true); // лёгкая мягкая тень

    // интерактивная зона на всю конструкцию
    this.kingLevelHit = this.add.zone(0, 0, 200, 44)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    this.kingLevelHit.on('pointerdown', (pointer) => {
      // (не обязательно, но полезно) чтобы DOM-эвент не улетал дальше
      pointer?.event?.stopPropagation?.();

      this.kingLevelExpanded = !this.kingLevelExpanded;
      this.kingLevelXpText?.setVisible(this.kingLevelExpanded);

      // важно: пересчитать hit-зону/позиции текста, потому что drawKingXpBar зависит от Expanded
      this.syncKingsUI();
    });

    // ✅ любой тап в любом месте закрывает Exp и поп ап с инфой о золоте (если тап не по этому блоку)
    this.input.on('pointerdown', (pointer, currentlyOver) => {
      const over = currentlyOver || [];

      const overLevel = this.kingLevelHit && over.includes(this.kingLevelHit);

      const overCoins = this.coinHit && over.includes(this.coinHit);
      const overCoinPopup = this.coinPopupHit && over.includes(this.coinPopupHit); // ✅ важно

      // закрытие Exp
      if (!overLevel && this.kingLevelExpanded) {
        this.kingLevelExpanded = false;
        this.kingLevelXpText?.setVisible(false);
        this.positionCoinsHUD();
      }

      // закрытие попапа золота: закрываем только если тап НЕ по блоку золота и НЕ по самому попапу
      if (!overCoins && !overCoinPopup && this.coinInfoOpen) {
        this.hideCoinInfoPopup();
      }
    });

    // собираем в контейнер (порядок важен: bg -> fill -> text -> xpText -> hit)
    this.kingLevelContainer.add([
      this.kingLevelBarBg,
      this.kingLevelBarFill,
      this.kingLevelIcon,
      this.kingLevelText,
      this.kingLevelXpText,
      this.kingLevelHit,
    ]);

    const hpTextStyle = { //вставляем текст НР бара короля поверх полоски
      fontFamily: kingTextStyle.fontFamily,
      fontSize: '16px',
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

    // units system
    this.unitSys = createUnitSystem(this);

    // ✅ anims: swordman from atlas
    if (!this.anims.exists('swordman_idle')) {
      // idle — 1 кадр (можно просто держать как анимацию, чтобы единообразно play())
      this.anims.create({
        key: 'swordman_idle',
        frames: [{ key: 'sworman_atlas', frame: 'psd_animation/idle.png' }], // <-- имя кадра в json
        frameRate: 1,
        repeat: -1,
      });
    }

    if (!this.anims.exists('swordman_walk')) {
      this.anims.create({
        key: 'swordman_walk',
        frames: this.anims.generateFrameNames('sworman_atlas', {
          prefix: 'psd_animation/walk_',
          start: 1,
          end: 20,
          zeroPad: 4,
          suffix: '.png',
        }),
        frameRate: 12,
        repeat: -1,
      });
    }

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
      this.refreshAllDraggable();
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
      this.refreshAllDraggable();
    };

    this.ws.onError = (err) => {
      console.warn('Server error:', err?.code, err?.message || err);

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
      if (vu) updateHpBar(this, vu);

      this.drawGrid();
    });

    this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
      if (this.battleState?.phase !== 'prep') return;

      const uid = gameObject?.data?.get?.('unitId');
      if (!uid) return;

      const core = (this.battleState?.units ?? []).find(u => u.id === uid);
      if (!core || core.team !== 'player') return;

      gameObject.setPosition(dragX, dragY);

      const vu = this.unitSys.findUnit(uid);
      if (vu?.sprite) vu.sprite.setPosition(dragX, dragY);
      if (vu?.art) vu.art.setPosition(dragX, dragY);
      if (vu?.label) vu.label.setPosition(dragX, dragY);

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
        if (vu?.sprite) vu.sprite.setPosition(p.x, p.y);
        if (vu?.art) vu.art.setPosition(p.x, p.y);
        if (vu?.label) vu.label.setPosition(p.x, p.y);

        if (vu) {
          vu.label.setPosition(p.x, p.y);
          if (vu?.art) vu.art.setPosition(p.x, p.y);
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
      if (vu?.sprite) vu.sprite.setPosition(p.x, p.y);
      if (vu?.art) vu.art.setPosition(p.x, p.y);
      if (vu?.label) vu.label.setPosition(p.x, p.y);

      if (vu) {
        vu.label.setPosition(p.x, p.y);
        if (vu.hpBar) vu.hpBar.setVisible(true);
        this.unitSys.setUnitPos(uid, hit.q, hit.r);
      }

      this.shadowOverride = { unitId: uid, zone: 'board', q: hit.q, r: hit.r };
      this.ws?.sendIntentSetStart(uid, hit.q, hit.r);
      this.drawGrid();
    });

    // resize
    this.scale.on('resize', () => {
      // если браузер/фуллскрин дёрнул resize в момент каких-то pointer events —
      // лучше сбросить локальные рисовалки тени
      this.dragHover = null;
      this.draggingUnitId = null;
      this.shadowOverride = null;

      this.layout();
      this.drawGrid();

      if (this.battleBtn) this.battleBtn.setPosition(this.scale.width / 2, 14);
      if (this.resultText) this.resultText.setPosition(this.scale.width / 2, 16);

      positionFullscreenButton(this);
      this.positionShop();
      this.positionCoinsHUD();
    });

    this.layout();
    this.drawGrid();

    this.resizeBackground(); //Вызываем арт БГ

    // UI
    createFullscreenButton(this);
    positionFullscreenButton(this);
    this.positionCoinsHUD();

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

    const designW = 1280;
    const designH = 720;

    const scaleX = designW / this.bg.width;
    const scaleY = designH / this.bg.height;

    const scale = Math.max(scaleX, scaleY);

    this.bg.setScale(scale);
  }

  layout() {
    this.resizeBackground();

    this.originX = this.scale.width / 2 - 380;
    this.originY = this.scale.height / 2 - 180;

    // ВАЖНО: позиции юнитов пересчитываем от core-state (zone board/bench),
    // а не из unitSys.q/r, иначе bench улетает при resize.
    this.renderFromState();

    this.positionKings();
    this.drawKingHpBars(); // чтобы бары не остались в старых координатах
    this.positionCoinsHUD();
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

  positionCoinsHUD() {
    if (!this.kingLeftCoinIcon || !this.kingLeftCoinText || !this.kingLevelContainer) return;

    const view = this.scale.getViewPort();

    // базовая линия по Y — как у кнопки "Бой"
    const btnTop = this.battleBtn
      ? (this.battleBtn.y - (this.battleBtn.height ?? this.battleBtn.displayHeight ?? 0) * (this.battleBtn.originY ?? 0.5))
      : (view.y + 14);

    // базовый X — левый край поля
    const p0 = this.hexToPixel(0, 0);
    const baseX = Math.max(view.x + 8, p0.x - this.hexSize);

    // 1) сначала ставим блок опыта (корона+бар) сверху
    const xpY = btnTop + 14; // верхняя строка HUD (подбери если надо)
    // выравниваем левый край XP-блока (левый край короны) по baseX,
    // как и левый край иконки монет
    const crownW = this.kingLevelIcon?.displayWidth ?? 30;
    this.kingLevelContainer.setPosition(baseX + crownW / 2, xpY);

    // 2) монеты — ПОД блоком опыта (теперь это контейнер с баром)
    const iconW = this.kingLeftCoinIcon.displayWidth || this.coinSize;
    const coinY = xpY + 32;

    // левый край иконки = baseX, значит центр иконки = baseX + iconW/2
    this.coinContainer.setPosition(baseX + iconW / 2, coinY);
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

    const leftX = minX - halfW - pad - 100;   // левый король ещё левее на 70px;
    const rightX = maxX + halfW + pad - 40;  // правый король левее на 20px;

    this.kingLeft.setPosition(leftX, midY);
    this.kingRight.setPosition(rightX, midY);
  }

  syncKingsUI() {
    const kings = this.battleState?.kings;

    const p = kings?.player ?? { hp: 100, maxHp: 100, coins: 0 };

    const rawCoins = Number(p.coins ?? 0);

    // ✅ показываем реальные монеты (чтобы было видно, что тратятся)
    this.kingLeftCoinText?.setText(String(rawCoins));

    // ✅ прогресс-бар: “копилка на 100”
    // если хочешь именно "от 0 до 100 и сброс", используем остаток
    const maxCoins = this.coinMax ?? 100;
    const barCoins = Phaser.Math.Clamp(rawCoins, 0, maxCoins); // ✅ 100 => полный бар
    this.drawCoinBar?.(barCoins, maxCoins);

    const lvl = Number(p.level ?? 1);
    const xp = Number(p.xp ?? 0);

    // сколько нужно до следующего уровня (берём с shared через импорт)
    const need = (lvl >= this.kingMaxLevel) ? 0 : (this.kingXpCost?.[lvl] ?? 0); // см. пункт 6 ниже

    if (this.kingLevelText) this.kingLevelText.setText(`lv. ${lvl}`);

    if (this.kingLevelXpText) {
      this.kingLevelXpText.setText(`Exp: ${xp} / ${need || 0}`);
      this.kingLevelXpText.setVisible(this.kingLevelExpanded);
    }

    this.drawKingXpBar?.(lvl, xp, need);
    this.positionCoinsHUD();

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

    const barWidth = 95;
    const barHeight = 14;

    const drawBar = (kingSprite, hpBg, hpFill, kingData) => {
      if (!kingSprite || !kingData) return;

      const x = kingSprite.x - barWidth / 2;
      const y = kingSprite.y - this.kingHeight / 2 - 26;

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

  drawKingXpBar(level, xp, need) {
    if (!this.kingLevelBarBg || !this.kingLevelBarFill) return;

    const w = 170;     // длиннее
    const h = 18;      // чуть толще

    const iconW = this.kingLevelIcon?.displayWidth ?? 30;

    // хотим, чтобы корона чуть налезала на бар
    const overlap = 10; // насколько бар заходит под корону
    const gap = 2;

    // старт бара: немного "под" корону
    const x = (iconW / 2) - overlap + gap;
    const y = -h / 2;

    this.kingLevelBarBg.clear();
    this.kingLevelBarFill.clear();

    // --- Тонкая фиолетовая обводка ---
    this.kingLevelBarBg.lineStyle(1, 0x5c3c9c, 1); // тонкая, тёмно-фиолетовая
    this.kingLevelBarBg.strokeRoundedRect(x, y, w, h, 6);

    // --- Фон ---
    this.kingLevelBarBg.fillStyle(0x2a2a2a, 1);
    this.kingLevelBarBg.fillRoundedRect(x + 1, y + 1, w - 2, h - 2, 5);

    // fill (фиолетовый)
    const ratio = (need > 0) ? Phaser.Math.Clamp(xp / need, 0, 1) : 1;
    this.kingLevelBarFill.fillStyle(0x8a2be2, 0.95);
    this.kingLevelBarFill.fillRoundedRect(x + 1, y + 1, (w - 2) * ratio, h - 2, 5);

    // позиция текста lv поверх бара (центр бара)
    const cx = x + w / 2;
    const cy = y + h / 2;
    this.kingLevelText.setPosition(cx, cy);

    // Exp рисуем СПРАВА от конца бара, с отступом
    const expGap = 10;
    this.kingLevelXpText.setOrigin(0, 0.5);
    this.kingLevelXpText.setPosition(x + w + expGap, cy);

    const hitH = this.kingLevelExpanded ? 44 : 44; // Exp теперь в одну линию, высота не растёт
    const extraRight = this.kingLevelExpanded ? (this.kingLevelXpText.width + 16) : 0;

    // ширина: иконка (половина слева) + бар + Exp справа + запас
    const hitW = (iconW / 2) + w + 16 + extraRight;

    // центр зоны сдвигаем вправо, если Exp видим (потому что он справа)
    const hitCx = cx + (extraRight / 2);
    const hitCy = 0;

    this.kingLevelHit.setPosition(hitCx, hitCy);
    this.kingLevelHit.setSize(hitW, hitH);
  }

  drawCoinBar(coins, maxCoins) {
    if (!this.coinBarBg || !this.coinBarFill) return;

    // ✅ идентичные размеры как у XP-бара
    const w = 170;
    const h = 18;

    const iconW = this.kingLeftCoinIcon?.displayWidth ?? 28;

    // такие же параметры "налезания"
    const overlap = 10;
    const gap = 2;

    // старт бара: немного под иконку
    const x = (iconW / 2) - overlap + gap;
    const y = -h / 2;

    this.coinBarBg.clear();
    this.coinBarFill.clear();

    // --- Стильная обводка (оранжево-коричневая) ---
    this.coinBarBg.lineStyle(1, 0x9a5a00, 1);
    this.coinBarBg.strokeRoundedRect(x, y, w, h, 6);

    // --- Фон ---
    this.coinBarBg.fillStyle(0x2a2a2a, 1);
    this.coinBarBg.fillRoundedRect(x + 1, y + 1, w - 2, h - 2, 5);

    // --- Fill (жёлто-оранжевый) ---
    const ratio = (maxCoins > 0) ? Phaser.Math.Clamp(coins / maxCoins, 0, 1) : 1;
    this.coinBarFill.fillStyle(0xffb000, 0.95); // ближе к оранжевому под монету
    this.coinBarFill.fillRoundedRect(x + 1, y + 1, (w - 2) * ratio, h - 2, 5);

    // текст по центру бара (как lv. у XP)
    const cx = x + w / 2;
    const cy = y + h / 2;
    this.kingLeftCoinText.setPosition(cx, cy);

    // обновим hit-зону под фактическую ширину блока
    if (this.coinHit) {
      const hitH = 44;
      const hitW = (iconW / 2) + w + 16; // иконка + бар + запас
      const cx = x + w / 2;
      this.coinHit.setPosition(cx, 0);
      this.coinHit.setSize(hitW, hitH);
    }
  }

  setSpriteDraggable(sprite, enabled) {
    if (!sprite || !sprite.active) return;

    if (enabled) {
      this.input.setDraggable(sprite, true);
      if (sprite.input) sprite.input.enabled = true;
    } else {
      this.input.setDraggable(sprite, false);
      if (sprite.input) sprite.input.enabled = false;
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
            type: u.type,
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
            rank: u.rank ?? 1,
            atk: u.atk,
          });
        } else {
          created = this.unitSys.spawnUnitOnBoard(u.q, u.r, {
            id: u.id,
            type: u.type,
            label: (
              u.type === 'Archer' ? 'A' :
              u.type === 'Tank' ? 'T' :
              u.type === 'Swordsman' ? 'S' :
              '?'
            ),
            color: u.team === 'enemy' ? 0x66ccff : 0xff7777,
            team: u.team,
            hp: u.hp,
            rank: u.rank ?? 1,
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

        created.dragHandle.setDataEnabled();
        created.dragHandle.data.set('unitId', created.id);

        // drag разрешаем всем юнитам игрока в prep
        const canDrag = (u.team === 'player') && (this.battleState?.phase === 'prep') && !this.battleState?.result;
        this.setSpriteDraggable(created.dragHandle, canDrag);

        // если сервер сказал "bench" — сразу переставим на скамейку
        if (u.zone === 'bench') {
          const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
          const p = this.benchSlotToScreen(slot);

          created.sprite.setPosition(p.x, p.y);
          created.label?.setPosition(p.x, p.y);
          created.dragHandle?.setPosition(p.x, p.y);
          created.art?.setPosition(p.x, p.y);

          // на скамейке hpBar не показываем
          if (created.hpBar) created.hpBar.setVisible(false);
          if (created) updateHpBar(this, created);
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
        if (vu?.dragHandle) vu.dragHandle.setPosition(p.x, p.y);
        if (vu?.art) vu.art.setPosition(p.x, p.y);
        if (vu?.label) vu.label.setPosition(p.x, p.y);

        if (vu?.hpBar) vu.hpBar.setVisible(false);
      } else {
        const result = this.battleState?.result ?? null;
        // серверный tick в бою сейчас 450мс
        const MOVE_TWEEN_MS = 380; // чуть меньше, чтобы успевал “доехать” до следующего снапшота
        const tweenMs = (phase === 'battle' && !result) ? MOVE_TWEEN_MS : 0;
        this.unitSys.setUnitPos(u.id, u.q, u.r, { tweenMs });

        // на доске hpBar показываем обратно (если был скрыт)
        const vu = this.unitSys.findUnit(u.id);
        if (vu?.hpBar) vu.hpBar.setVisible(true);
      }

      const vuRank = this.unitSys.findUnit(u.id);
      if (vuRank) vuRank.rank = u.rank ?? 1;

      // HP
      this.unitSys.setUnitHp(u.id, u.hp, u.maxHp ?? existing.maxHp);

      // draggable всем юнитам игрока в prep + обновление буквы
      const vu = this.unitSys.findUnit(u.id);

      if (vu?.label) {
        const t = String(u.type ?? '').toLowerCase();
        const ch =
          (t === 'archer') ? 'A' :
          (t === 'tank') ? 'T' :
          (t === 'swordsman' || t === 'swordmen') ? 'S' :
          '?';
        vu.label.setText(ch);
      }

      if (vu?.dragHandle) {
        const canDrag =
          (u.team === 'player') &&
          (this.battleState?.phase === 'prep') &&
          !this.battleState?.result;

        this.setSpriteDraggable(vu.dragHandle, canDrag);
      }

    }

    // ✅ sync swordsman anim by phase/zone
    const result = this.battleState?.result ?? null;

    for (const u of (this.battleState?.units ?? [])) {
      // в prep враги скрыты, но это не важно — просто синкаем тех, кто есть
      const vu = this.unitSys.findUnit(u.id);
      if (!vu?.art) continue;

      if (u.type !== 'Swordsman') continue;

      const wantWalk = (phase === 'battle') && !result && (u.zone === 'board');
      const animKey = wantWalk ? 'swordman_walk' : 'swordman_idle';

      // не дёргаем play каждый тик/рендер если уже играет то же самое
      if (vu.art.anims?.getName?.() === animKey) continue;

      if (this.anims.exists(animKey)) {
        vu.art.play(animKey);
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

    // поле — рисуем ТОЛЬКО в prep
    if (this.battleState?.phase === 'prep') {

      const visibleCols = 6;

      for (let row = 0; row < this.gridRows; row++) {
        for (let col = 0; col < visibleCols; col++) {
          const q = col - Math.floor(row / 2);
          const r = row;
          const p = this.hexToPixel(q, r);
          this.drawHex(p.x, p.y, 0xffffff, 0.35);
        }
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
        // ✅ в prep не рисуем тени в скрытых колонках
        if (this.battleState?.phase === 'prep') {
          const col = u.q + Math.floor(u.r / 2);
          if (col >= 6) continue;
        }

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

    // ✅ В prep разрешаем только первые 6 колонок
    if (this.battleState?.phase === 'prep' && col >= 6) return null;

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

  refreshAllDraggable() {
    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;

    for (const u of (this.battleState?.units ?? [])) {
      const vu = this.unitSys.findUnit(u.id);
      if (!vu?.dragHandle) continue;

      const canDrag =
        (u.team === 'player') &&
        (phase === 'prep') &&
        !result;

      this.setSpriteDraggable(vu.dragHandle, canDrag);
    }
  }

  showCoinInfoPopup() {
    if (this.coinInfoOpen) return;
    this.coinInfoOpen = true;

    // --- математика (как на сервере) ---
    const round = Number(this.battleState?.round ?? 1);
    const winStreak = Number(this.battleState?.winStreak ?? 0);
    const loseStreak = Number(this.battleState?.loseStreak ?? 0);

    const coinsNow = Number(this.battleState?.kings?.player?.coins ?? 0);

    const baseIncomeForRound = (r) => {
      if (r <= 1) return 1;
      if (r === 2) return 2;
      if (r === 3) return 3;
      if (r === 4) return 4;
      return 5; // 5+
    };

    const interestIncome = (coins) => Math.min(5, Math.floor(coins / 10));

    const streakBonus = (streakCount) => {
      if (streakCount >= 7) return 3;
      if (streakCount >= 5) return 2;
      if (streakCount >= 3) return 1;
      return 0;
    };

    const base = baseIncomeForRound(round);
    const interest = interestIncome(coinsNow);
    const winBonus = 1; // показываем всегда

    // если сейчас уже идёт серия побед — бонус по текущей длине
    // если серии ещё нет, но следующая победа начнёт бонус (со следующей 3-й) — покажем "будет +1"
    const willWinStreakCount = (winStreak > 0) ? winStreak : 0;
    const nextWinStreakCount = willWinStreakCount + 1;
    const winStreakShown =
      (winStreak >= 3) ? streakBonus(winStreak)
      : (winStreak === 2) ? streakBonus(3) // следующая победа даст бонус
      : 0;

    // аналогично для поражений
    const willLoseStreakCount = (loseStreak > 0) ? loseStreak : 0;
    const nextLoseStreakCount = willLoseStreakCount + 1;
    const loseStreakShown =
      (loseStreak >= 3) ? streakBonus(loseStreak)
      : (loseStreak === 2) ? streakBonus(3)
      : 0;

    // "ожидаемый" итог: если сейчас идёт win-streak или мы на пороге win-streak (2 подряд),
    // считаем по победному сценарию. Если идёт lose-streak/порог — по поражению.
    // Иначе — просто base+interest+winBonus.
    let expected = base + interest + winBonus;

    if (winStreak >= 2) {
      // ожидаем победу и учёт win streak (текущий или начнётся)
      const effectiveWinStreak = (winStreak >= 3) ? streakBonus(winStreak) : streakBonus(3);
      expected = base + interest + winBonus + effectiveWinStreak;
    } else if (loseStreak >= 2) {
      // ожидаем поражение и учёт lose streak (текущий или начнётся)
      const effectiveLoseStreak = (loseStreak >= 3) ? streakBonus(loseStreak) : streakBonus(3);
      expected = base + interest + effectiveLoseStreak;
    }

    // --- позиционирование тултипа под блоком золота ---
    // coinContainer стоит в HUD (scrollFactor 0), поэтому bounds корректны
    const b = this.coinContainer.getBounds();
    const padding = 10;
    const popupW = 320;
    const lineH = 18;

    const lines = [];
    lines.push(`Доход за раунд: +${base + interest}`);
    lines.push(`Бонус за победу: +${winBonus}`);

    // показываем win streak, если он начнётся со следующей победой (2 подряд) ИЛИ уже идёт (>=3)
    if (winStreak >= 2) {
      const txt = (winStreak >= 3)
        ? `Бонус за серию побед: +${streakBonus(winStreak)}`
        : `Бонус за серию побед: +${streakBonus(3)} (со следующей победой)`;
      lines.push(txt);
    }

    // показываем lose streak аналогично
    if (loseStreak >= 2) {
      const txt = (loseStreak >= 3)
        ? `Бонус за серию поражений: +${streakBonus(loseStreak)}`
        : `Бонус за серию поражений: +${streakBonus(3)} (со следующего поражения)`;
      lines.push(txt);
    }

    lines.push(`Ожидаемый доход раунда: +${expected}`);

    const popupH = padding * 2 + lines.length * lineH + 8;

    // контейнер (без затемнения экрана)
    this.coinPopup = this.add.container(0, 0).setDepth(20000).setScrollFactor(0);

    // фон тултипа
    const bg = this.add.rectangle(0, 0, popupW, popupH, 0x0b0b0b, 0.88)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffb000, 0.95);

    // текст
    const text = this.add.text(0, 0, lines.join('\n'), {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '14px',
      color: '#ffffff',
      lineSpacing: 6,
      wordWrap: { width: popupW - padding * 2 },
    }).setOrigin(0, 0);

    text.setPosition(padding, padding);

    // хит-зона тултипа, чтобы клик по нему не закрывал сразу (будем учитывать в currentlyOver)
    this.coinPopupHit = this.add.zone(0, 0, popupW, popupH)
      .setOrigin(0, 0)
      .setInteractive();

    this.coinPopup.add([bg, text, this.coinPopupHit]);

    // позиция: под золотом, выровнять по левому краю блока золота
    let px = b.left;
    let py = b.bottom + 6;

    // чтобы не вылезало за экран справа
    const viewW = this.scale.width;
    if (px + popupW > viewW - 8) px = Math.max(8, viewW - 8 - popupW);

    this.coinPopup.setPosition(px, py);
  }

  hideCoinInfoPopup() {
    if (!this.coinInfoOpen) return;
    this.coinInfoOpen = false;

    if (this.coinPopup) {
      this.coinPopup.destroy(true);
      this.coinPopup = null;
    }
    this.coinPopupHit = null;
  }

  update(time, delta) {
    this.unitSys.update(delta / 1000);
  }

}