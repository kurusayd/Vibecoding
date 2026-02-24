import Phaser from 'phaser';
import { hexToPixel, pixelToHex, hexCorners, hexToGroundPixel } from '../game/hex.js';
import { createUnitSystem } from '../game/units.js';
import { WSClient } from '../net/wsClient.js';
import { createFullscreenButton, positionFullscreenButton } from '../game/ui.js';
import { updateHpBar } from '../game/hpbar.js';

import {
  createBattleState,
  KING_XP_COST,
  KING_MAX_LEVEL,
} from '../../shared/battleCore.js';

const GROUND_LIFT_BY_TYPE = {
  Swordsman: 100,
  Crossbowman: 100,
  Knight: 100,
};

const PLAYER_KING_DISPLAY_NAME = 'Devis J. Jones';
const ENEMY_KING_DISPLAY_NAME = 'Enemy King';

const EXTRA_PORTRAIT_ASSETS = [
  { key: 'bot_bishop', path: '/assets/bots/bot_bishop.png' },
  { key: 'bot_knight', path: '/assets/bots/bot_knight.png' },
  { key: 'bot_queen', path: '/assets/bots/bot_queen.png' },
  { key: 'bot_rook', path: '/assets/bots/bot_rook.png' },
  { key: 'king_frog', path: '/assets/kings/king_frog.png' },
  { key: 'king_king', path: '/assets/kings/king_king.png' },
  { key: 'king_princess', path: '/assets/kings/king_princess.png' },
];

const KING_DEBUG_SKINS = [
  { label: 'ЛЯГУШКА', key: 'king_frog' },
  { label: 'ПРИНЦЕССА', key: 'king_princess' },
  { label: 'КОРОЛЬ', key: 'king_king' },
];


const UNIT_ATLAS_DEFS = [
  {
    type: 'Swordsman',
    atlasKey: 'sworman_atlas',
    atlasPath: '/assets/units/swordman/atlas/swordman_atlas',
    idleAnim: 'swordman_idle',
    walkAnim: 'swordman_walk',
    deadAnim: 'swordman_dead',
  },
  {
    type: 'Crossbowman',
    atlasKey: 'crossbowman_atlas',
    atlasPath: '/assets/units/crossbowman/atlas/swordman_atlas',
    idleAnim: 'crossbowman_idle',
    walkAnim: 'crossbowman_walk',
    deadAnim: 'crossbowman_dead',
  },
  {
    type: 'Knight',
    atlasKey: 'knight_atlas',
    atlasPath: '/assets/units/knight/atlas/swordman_atlas',
    idleAnim: 'knight_idle',
    walkAnim: 'knight_walk',
    deadAnim: 'knight_dead',
  },
];

const SHOP_OFFER_COUNT = 5;
const SHOP_CARD_ART_LIFT_Y = 75; // увеличивай/уменьшай, чтобы поднять/опустить арт в сером блоке карточки

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  preload() { //Подгружаем пулл картинок
    this.load.image('battleBg', '/assets/bg.jpg');
    this.load.image('king', '/assets/kings/king_princess.png');
    this.load.image('coin', '/assets/coin.png');
    this.load.image('rank1', '/assets/rank1.png');
    this.load.image('rank2', '/assets/rank2.png');
    this.load.image('rank3', '/assets/rank3.png');
    this.load.image('crownexp', '/assets/crownexp.png');
    this.load.image('updateMarketIcon', '/assets/icons/update_market.png');

    for (const asset of EXTRA_PORTRAIT_ASSETS) {
      this.load.image(asset.key, asset.path);
    }

    // ✅ swordman atlas (png+json)
    for (const def of UNIT_ATLAS_DEFS) {
      this.load.atlas(
        def.atlasKey,
        `${def.atlasPath}.png`,
        `${def.atlasPath}.json`
      );
    }

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
    this.benchGap = 100; // было 120, скамейка на 20px ближе к полю

    this.originX = this.scale.width / 2 - 270;
    this.originY = this.scale.height / 2 - 120;

    // --- KINGS UI (лево/право) ---
    this.kingSize = 190; // меняй только это число для пропорционального размера арта короля
    this.kingWidth = this.kingSize;
    this.kingHeight = this.kingSize;

    // HP bars
    this.kingLeftHpBg = this.add.graphics().setDepth(52);
    this.kingLeftHpFill = this.add.graphics().setDepth(53);

    this.kingRightHpBg = this.add.graphics().setDepth(52);
    this.kingRightHpFill = this.add.graphics().setDepth(53);

    this.kingLeft = this.add.image(0, 0, 'king').setDepth(50);
    this.kingLeft.setDisplaySize(this.kingWidth, this.kingHeight);

    this.kingRight = this.add.image(0, 0, 'king').setDepth(50).setFlipX(true);
    this.kingRight.setDisplaySize(this.kingWidth, this.kingHeight);

    this.localPlayerKingTextureKey = 'king_princess'; // локальный override только для отображения игрока (debug)
    this.kingLeft.setTexture(this.localPlayerKingTextureKey);

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

    const kingNameTextStyle = {
      fontFamily: kingTextStyle.fontFamily,
      fontSize: '15px',
      color: '#ffffff',
    };

    this.kingLeftNameText = this.add.text(0, 0, PLAYER_KING_DISPLAY_NAME, kingNameTextStyle)
      .setDepth(54)
      .setOrigin(0.5, 1)
      .setShadow(0, 0, '#000000', 4, true, true);

    this.kingRightNameText = this.add.text(0, 0, ENEMY_KING_DISPLAY_NAME, kingNameTextStyle)
      .setDepth(54)
      .setOrigin(0.5, 1)
      .setShadow(0, 0, '#000000', 4, true, true)
      .setVisible(false);

    this.kingRightHpText.setVisible(false);



    // enemy king по умолчанию скрыт (покажем в syncKingsUI по фазе)
    this.kingRight.setVisible(false);

    // пробрасываем функции как "методы", чтобы старый код был простым
    this.hexToPixel = (q, r) => hexToPixel(this, q, r);
    this.hexToGroundPixel = (q, r, groundLift = 0) => hexToGroundPixel(this, q, r, groundLift);
    this.pixelToHex = (x, y) => pixelToHex(this, x, y);
    this.hexCorners = (cx, cy) => hexCorners(this, cx, cy);

    this.g = this.add.graphics();

    // units system
    this.unitSys = createUnitSystem(this);

    // ✅ anims: swordman from atlas
    for (const def of UNIT_ATLAS_DEFS) {
      if (!this.anims.exists(def.idleAnim)) {
        this.anims.create({
          key: def.idleAnim,
          frames: [{ key: def.atlasKey, frame: 'psd_animation/idle.png' }],
          frameRate: 1,
          repeat: -1,
        });
      }

      if (!this.anims.exists(def.walkAnim)) {
        const texture = this.textures.get(def.atlasKey);
        const walkFrames = (texture?.getFrameNames?.() ?? [])
          .filter((name) => /^psd_animation\/walk_\d{4}\.png$/.test(name))
          .sort()
          .map((frame) => ({ key: def.atlasKey, frame }));

        this.anims.create({
          key: def.walkAnim,
          frames: walkFrames.length > 0
            ? walkFrames
            : [{ key: def.atlasKey, frame: 'psd_animation/idle.png' }],
          frameRate: 12,
          repeat: -1,
        });
      }

      if (!this.anims.exists(def.deadAnim)) {
        this.anims.create({
          key: def.deadAnim,
          frames: [{ key: def.atlasKey, frame: 'psd_animation/dead.png' }],
          frameRate: 1,
          repeat: -1,
        });
      }
    }

    // drag state
    this.draggingUnitId = null;
    this.dragHover = null; // { zone:'board', q,r } | { zone:'bench', slot }
    this.mergeAbsorbAnimatingIds = new Set(); // visual-only merge animation for disappearing units
    this.mergeBounceAnimatingIds = new Set(); // avoid stacking bounce on the same merge target
    this.pendingMergeTargetBounces = new Map(); // targetId -> { targetCoreUnit, delayMs }

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

    // --- START GAME BUTTON (debug) ---
    this.startGameBtn = this.add.text(this.scale.width / 2, this.scale.height / 2, 'НАЧАТЬ ИГРУ', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '36px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.65)',
      padding: { left: 20, right: 20, top: 14, bottom: 14 },
    })
      .setOrigin(0.5, 0.5)
      .setDepth(20001)
      .setInteractive({ useHandCursor: true });

    this.startGameBtn.on('pointerdown', () => {
      this.ws?.sendIntentStartGame?.();
    });


    this.ws.onInit = (msg) => {
      // сервер прислал начальный state и сказал, каким юнитом ты управляешь
      this.battleState = msg.state;
      this.activeUnitId = msg?.you?.unitId ?? null; // теперь может быть null (старт пустой)

      if (this.battleState?.phase === 'battle' && !this.battleState?.result) this.shopCollapsed = true;
      if (this.battleState?.phase === 'prep' && !this.battleState?.result) this.shopCollapsed = false;

      this.draggingUnitId = null;
      this.dragHover = null;
      this.shadowOverride = null;
      this.renderFromState();
      this.drawGrid();
      this.syncPhaseUI();
      this.syncKingsUI();
      this.syncShopUI();
      this.refreshAllDraggable();
    };

    this.ws.onState = (state) => {
      // сервер прислал обновлённый state после чьего-то хода
      const prevPhase = this.battleState?.phase ?? null;
      const prevResult = this.battleState?.result ?? null;
      const draggedId = this.draggingUnitId;
      const incomingDragged = (state?.units ?? []).find(u => u.id === draggedId);
      const keepBenchDrag =
        !!incomingDragged &&
        incomingDragged.team === 'player' &&
        incomingDragged.zone === 'bench';

      this.battleState = state;

      // На фазовых переходах/показе результата не анимируем UI магазина,
      // иначе кнопки "доезжают" как при ручном закрытии.
      if ((state?.phase ?? null) !== prevPhase || (state?.result ?? null) !== prevResult) {
        this.shopUiSkipNextModeAnimation = true;
      }

      if (state?.phase !== prevPhase) {
        if (state?.phase === 'battle' && !state?.result) this.shopCollapsed = true;
        if (state?.phase === 'prep' && !state?.result) this.shopCollapsed = false;
      }

      if (!keepBenchDrag) this.shadowOverride = null;
      if ((state?.phase !== 'prep' || state?.result) && !keepBenchDrag) {
        this.draggingUnitId = null;
        this.dragHover = null;
      }

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
      const uid = gameObject?.data?.get?.('unitId');
      if (!uid) return;
      const core = (this.battleState?.units ?? []).find(u => u.id === uid);
      if (!core || core.team !== 'player') return;

      const isPrepManage = (this.battleState?.phase === 'prep') && !this.battleState?.result;
      const isBenchManageAnytime = core.zone === 'bench';
      if (!isPrepManage && !isBenchManageAnytime) return;

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
      if (vu?.rankIcon) vu.rankIcon.setVisible(false);
      // ❌ НЕ вызываем updateHpBar тут, он включает видимость обратно

      this.drawGrid();
    });

    this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
      const uid = gameObject?.data?.get?.('unitId');
      if (!uid) return;

      const core = (this.battleState?.units ?? []).find(u => u.id === uid);
      if (!core || core.team !== 'player') return;

      const isPrepManage = (this.battleState?.phase === 'prep') && !this.battleState?.result;
      const isBenchManageAnytime = core.zone === 'bench';
      if (!isPrepManage && !isBenchManageAnytime) return;

      gameObject.setPosition(dragX, dragY);

      const vu = this.unitSys.findUnit(uid);
      if (vu?.sprite) vu.sprite.setPosition(dragX, dragY);

      const lift = GROUND_LIFT_BY_TYPE[core?.type] ?? 0;
      const artY = dragY + this.hexSize - lift;

      if (vu?.art) vu.art.setPosition(dragX, artY);
      if (vu?.label) vu.label.setPosition(dragX, dragY);
      if (vu?.hpBar) vu.hpBar.setVisible(false);
      if (vu?.rankIcon) vu.rankIcon.setVisible(false);

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
      const uid = gameObject?.data?.get?.('unitId');
      const core = uid ? (this.battleState?.units ?? []).find(u => u.id === uid) : null;
      const isPrepManage = (this.battleState?.phase === 'prep') && !this.battleState?.result;
      const isBenchManageAnytime = !!core && core.team === 'player' && core.zone === 'bench';

      // Всегда сбрасываем локальный drag-state, даже если prep уже закончился.
      this.draggingUnitId = null;
      this.dragHover = null;
      this.shadowOverride = null;

      if (!isPrepManage && !isBenchManageAnytime) {
        this.renderFromState();
        this.drawGrid();
        return;
      }

      if (!uid) return;
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
        const lift = GROUND_LIFT_BY_TYPE[core?.type] ?? 0;
        if (vu?.art) vu.art.setPosition(p.x, p.y + this.hexSize - lift);
        if (vu?.label) vu.label.setPosition(p.x, p.y);

        if (vu) {
          vu.label.setPosition(p.x, p.y);
          const lift = GROUND_LIFT_BY_TYPE[core?.type] ?? 0;
          if (vu?.art) vu.art.setPosition(p.x, p.y + this.hexSize - lift);
          // на скамейке hpBar не показываем
          if (vu.hpBar) vu.hpBar.setVisible(false);
          if (vu.rankIcon) {
            vu.rankIcon.setPosition(p.x, Math.round(p.y + this.hexSize * 0.98));
            vu.rankIcon.setVisible(!core.dead);
          }
        }

        this.shadowOverride = { unitId: uid, zone: 'bench', slot };
        this.ws?.sendIntentSetBench(uid, slot); // если у тебя уже с unitId, оставь как есть
        this.drawGrid(); // важно: сразу восстановить тени
        return;
      }

      // Вне prep разрешаем только менеджмент скамейки (bench -> bench).
      if (!isPrepManage) {
        this.shadowOverride = null;
        this.dragHover = null;
        this.renderFromState();
        this.drawGrid();
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
      const lift = GROUND_LIFT_BY_TYPE[core?.type] ?? 0;
      const g = this.hexToGroundPixel(hit.q, hit.r, lift);

      gameObject.setPosition(p.x, p.y);

      const vu = this.unitSys.findUnit(uid);
      if (vu?.sprite) vu.sprite.setPosition(p.x, p.y);
      if (vu?.art) vu.art.setPosition(g.x, g.y);
      if (vu?.label) vu.label.setPosition(p.x, p.y);

      if (vu) {
        vu.label.setPosition(p.x, p.y);
        const isPrepPhase = (this.battleState?.phase === 'prep') && !this.battleState?.result;
        if (vu.hpBar) vu.hpBar.setVisible(!isPrepPhase);
        if (vu.rankIcon) vu.rankIcon.setVisible(true);
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

      if (this.roundText) this.roundText.setPosition(this.scale.width / 2, 10);
      if (this.prepTimerText) this.prepTimerText.setPosition(this.scale.width / 2, 60);

      if (this.resultText) this.resultText.setPosition(this.scale.width / 2, 60);
      if (this.resultText) this.resultText.setWordWrapWidth(Math.min(520, this.scale.width - 40));

      positionFullscreenButton(this);
      this.positionDebugUI?.();
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

    // --- DEBUG UI (top-right button + modal) ---
    this.debugMenuOpen = false;
    this.debugKingMenuOpen = false;
    this.debugCanStartBattle = false;
    this.debugKingSkinButtons = [];

    this.debugBtn = this.add.text(this.scale.width - 14, 14, 'Debug', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { left: 10, right: 10, top: 6, bottom: 6 },
    })
      .setOrigin(1, 0)
      .setDepth(10020)
      .setInteractive({ useHandCursor: true });

    this.debugBtn.on('pointerdown', (pointer) => {
      pointer?.event?.stopPropagation?.();
      this.toggleDebugMenu();
    });

    this.debugModal = this.add.container(0, 0)
      .setDepth(10030)
      .setScrollFactor(0)
      .setVisible(false);

    this.debugModalBg = this.add.rectangle(0, 0, 180, 164, 0x111111, 0.94)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x666666, 0.95);

    this.debugModalTitle = this.add.text(90, 12, 'DEBUG', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.battleBtn = this.add.text(90, 44, 'БОЙ', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.55)',
      padding: { left: 18, right: 18, top: 8, bottom: 8 },
    })
    .setOrigin(0.5, 0)
    .setDepth(10031)
    .setInteractive({ useHandCursor: true });
    this.debugExitBtn = this.add.text(90, 120, '\u0412\u042b\u0425\u041e\u0414', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: 'rgba(120,0,0,0.65)',
      padding: { left: 14, right: 14, top: 8, bottom: 8 },
    })
      .setOrigin(0.5, 0)
      .setDepth(10031)
      .setInteractive({ useHandCursor: true });
    this.debugKingBtn = this.add.text(90, 82, '\u041a\u041e\u0420\u041e\u041b\u042c', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,60,110,0.65)',
      padding: { left: 12, right: 12, top: 8, bottom: 8 },
    })
      .setOrigin(0.5, 0)
      .setDepth(10031)
      .setInteractive({ useHandCursor: true });
    this.debugModalHit = this.add.zone(0, 0, 180, 164)
      .setOrigin(0, 0)
      .setInteractive();
    this.debugModalHit.on('pointerdown', (pointer) => {
      pointer?.event?.stopPropagation?.();
    });
    this.debugModal.add([
      this.debugModalHit,
      this.debugModalBg,
      this.debugModalTitle,
      this.battleBtn,
      this.debugKingBtn,
      this.debugExitBtn,
    ]);
    // --- DEBUG KING MODAL (local player king skin only) ---
    this.debugKingModal = this.add.container(0, 0)
      .setDepth(10030)
      .setScrollFactor(0)
      .setVisible(false);
    this.debugKingModalBg = this.add.rectangle(0, 0, 220, 168, 0x111111, 0.94)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x666666, 0.95);
    this.debugKingModalTitle = this.add.text(110, 12, 'KING (LOCAL)', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.debugKingModalHit = this.add.zone(0, 0, 220, 168)
      .setOrigin(0, 0)
      .setInteractive();
    this.debugKingModalHit.on('pointerdown', (pointer) => {
      pointer?.event?.stopPropagation?.();
    });
    this.debugKingModal.add([
      this.debugKingModalHit,
      this.debugKingModalBg,
      this.debugKingModalTitle,
    ]);
    KING_DEBUG_SKINS.forEach((skin, idx) => {
      const btn = this.add.text(110, 42 + idx * 38, skin.label, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '17px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.55)',
        padding: { left: 12, right: 12, top: 7, bottom: 7 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        this.applyLocalPlayerKingTexture?.(skin.key);
        this.syncDebugUI?.();
      });
      btn._kingTextureKey = skin.key;
      this.debugKingSkinButtons.push(btn);
      this.debugKingModal.add(btn);
    });
    // --- ROUND + TIMER (top center) ---
    this.roundText = this.add.text(this.scale.width / 2, 10, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '34px',
      fontStyle: 'bold',        // ✅ жирный
      color: '#ffffff',
    })
      .setOrigin(0.5, 0)
      .setDepth(9999)
      .setStroke('#888888', 3)  // ✅ серая обводка
      .setShadow(0, 0, '#000000', 2, true, true); // лёгкая мягкая тень

    this.prepTimerText = this.add.text(this.scale.width / 2, 60, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '20px',
      color: '#ffffff',      // без fontStyle
    })
      .setOrigin(0.5, 0)
      .setDepth(9999)
      .setStroke('#777777', 2)
      .setShadow(0, 0, '#000000', 2, true, true);

    this.battleBtn.on('pointerdown', () => {
      this.ws?.sendIntentStartBattle();
      this.hideDebugMenu?.();
    });

    this.debugKingBtn.on('pointerdown', (pointer) => {
      pointer?.event?.stopPropagation?.();
      this.debugKingMenuOpen = !this.debugKingMenuOpen;
      this.syncDebugUI?.();
    });

    this.debugExitBtn.on('pointerdown', () => {
      this.ws?.sendIntentResetGame?.();
      this.hideDebugMenu?.();
    });

    this.resultText = this.add.text(this.scale.width / 2, 60, '', { // на месте таймера
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '28px', // чуть меньше, чтобы не перекрывало UI
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: Math.min(520, this.scale.width - 40), useAdvancedWrap: true }, // будет расти вниз
    })
    .setOrigin(0.5, 0)  // ✅ верхняя граница текста фиксирована по y=48
    .setDepth(9999)
    .setVisible(false);

    this.positionDebugUI();
    this.syncDebugUI();

    // --- SHOP UI (cards) ---
    this.shopCards = [];
    this.shopCollapsed = false;
    this.shopRefreshBusy = false;
    this.shopRefreshUnlockTimer = null;
    this.shopCardLayout = {
      width: 132,
      height: 188,
      gap: 10,
      bottomMargin: 10,
    };

    for (let i = 0; i < SHOP_OFFER_COUNT; i++) {
      this.shopCards.push(this.createShopCard(i));
    }

    this.shopToggleBtn = this.add.text(0, 0, 'X', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.65)',
      padding: { left: 8, right: 8, top: 5, bottom: 5 },
    })
      .setOrigin(0.5, 0.5)
      .setDepth(10000)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.shopToggleBtn.on('pointerdown', () => {
      this.shopCollapsed = true;
      this.syncShopUI();
    });

    this.shopRefreshBtn = this.add.container(0, 0)
      .setDepth(10000)
      .setScrollFactor(0);

    this.shopRefreshBtnBody = this.add.container(30, 0);

    this.shopRefreshBtnBg = this.add.rectangle(0, 0, 60, 64, 0x463700, 0.78)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(1, 0x8f7a33, 0.75);

    this.shopRefreshBtnIcon = this.add.image(0, -12, 'updateMarketIcon')
      .setOrigin(0.5, 0.5)
      .setDisplaySize(36, 36);

    this.shopRefreshBtnCoin = this.add.image(-8, 18, 'coin')
      .setOrigin(0.5, 0.5)
      .setDisplaySize(14, 14);

    this.shopRefreshBtnCost = this.add.text(4, 18, '2', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '17px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    this.shopRefreshBtnBody.add([
      this.shopRefreshBtnBg,
      this.shopRefreshBtnIcon,
      this.shopRefreshBtnCoin,
      this.shopRefreshBtnCost,
    ]);
    this.shopRefreshBtn.add(this.shopRefreshBtnBody);

    this.shopRefreshBtn.setSize(60, 64);
    this.shopRefreshBtnHit = this.add.zone(30, 0, 60, 64)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });
    this.shopRefreshBtn.add(this.shopRefreshBtnHit);

    this.shopRefreshBtnHit.on('pointerdown', () => {
      if (this.shopRefreshBusy) return;

      this.shopRefreshBusy = true;
      this.syncShopUI();
      this.playPressFeedback?.(this.shopRefreshBtnBody, { scaleTo: 0.96, duration: 70 });
      this.playShopRefreshTilesAnimation?.();
      this.ws?.sendIntentShopRefresh?.();

      try { this.shopRefreshUnlockTimer?.remove?.(false); } catch {}
      this.shopRefreshUnlockTimer = this.time.delayedCall(420, () => {
        this.shopRefreshBusy = false;
        this.shopRefreshUnlockTimer = null;
        this.syncShopUI();
      });
    });

    this.shopOpenBtn = this.add.text(0, 0, 'МАГАЗИН', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.72)',
      padding: { left: 12, right: 12, top: 7, bottom: 7 },
    })
      .setOrigin(0.5, 0.5)
      .setDepth(10000)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.shopOpenBtn.on('pointerdown', () => {
      this.shopCollapsed = !this.shopCollapsed;
      this.syncShopUI();
      this.playPressFeedback?.(this.shopOpenBtn, { scaleTo: 0.96, duration: 70 });
    });

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

  positionDebugUI() {
    if (this.debugBtn) {
      this.debugBtn.setPosition(this.scale.width - 14, 14);
    }

    if (this.debugModal) {
      const modalW = this.debugModalBg?.width ?? 180;
      const x = this.scale.width - modalW - 14;
      const y = 48;
      this.debugModal.setPosition(x, y);
    }

    if (this.debugKingModal) {
      const mainX = this.debugModal?.x ?? (this.scale.width - (this.debugModalBg?.width ?? 180) - 14);
      const mainY = this.debugModal?.y ?? 48;
      const kingModalW = this.debugKingModalBg?.width ?? 220;
      const kingModalH = this.debugKingModalBg?.height ?? 168;
      const gap = 8;

      let x = mainX - kingModalW - gap;
      let y = mainY;

      if (x < 8) {
        x = mainX;
        y = mainY + (this.debugModalBg?.height ?? 164) + gap;
      }

      if (y + kingModalH > this.scale.height - 8) {
        y = Math.max(8, this.scale.height - kingModalH - 8);
      }

      this.debugKingModal.setPosition(x, y);
    }
  }

  showDebugMenu() {
    this.debugMenuOpen = true;
    this.syncDebugUI();
  }

  hideDebugMenu() {
    this.debugMenuOpen = false;
    this.debugKingMenuOpen = false;
    this.syncDebugUI();
  }

  toggleDebugMenu() {
    this.debugMenuOpen = !this.debugMenuOpen;
    if (!this.debugMenuOpen) this.debugKingMenuOpen = false;
    this.syncDebugUI();
  }

  syncDebugUI() {
    if (this.debugBtn) this.debugBtn.setVisible(true);
    if (this.debugModal) this.debugModal.setVisible(!!this.debugMenuOpen);
    if (this.debugKingModal) this.debugKingModal.setVisible(!!this.debugMenuOpen && !!this.debugKingMenuOpen);

    const canBattle = !!this.debugCanStartBattle;

    if (this.battleBtn) {
      this.battleBtn.setVisible(!!this.debugMenuOpen);
      if (this.battleBtn.input) this.battleBtn.input.enabled = canBattle;
      this.battleBtn.setAlpha(canBattle ? 1 : 0.4);
    }

    if (this.debugExitBtn) {
      this.debugExitBtn.setVisible(!!this.debugMenuOpen);
    }

    if (this.debugKingBtn) {
      this.debugKingBtn.setVisible(!!this.debugMenuOpen);
      this.debugKingBtn.setAlpha(this.debugKingMenuOpen ? 1 : 0.9);
    }

    for (const btn of (this.debugKingSkinButtons ?? [])) {
      const active = btn?._kingTextureKey === this.localPlayerKingTextureKey;
      btn?.setVisible?.(!!this.debugMenuOpen && !!this.debugKingMenuOpen);
      btn?.setAlpha?.(active ? 1 : 0.85);
      if (btn?.setStyle) {
        btn.setStyle({
          backgroundColor: active ? 'rgba(0,90,40,0.75)' : 'rgba(0,0,0,0.55)',
        });
      }
    }
  }

  applyLocalPlayerKingTexture(textureKey) {
    if (!textureKey || !this.textures?.exists?.(textureKey)) return;

    this.localPlayerKingTextureKey = textureKey;

    if (this.kingLeft) {
      this.kingLeft.setTexture(textureKey);
      this.kingLeft.setDisplaySize(this.kingWidth, this.kingHeight);
    }
  }


  createShopCard(index) {
    const layout = this.shopCardLayout ?? { width: 132, height: 188 };
    const w = layout.width;
    const h = layout.height;
    const top = -h / 2;

    const card = {
      index,
      width: w,
      height: h,
      enabled: false,
      hovered: false,
      pressed: false,
    };

    const container = this.add.container(0, 0)
      .setDepth(9999)
      .setScrollFactor(0);

    const shadow = this.add.rectangle(4, 5, w, h, 0x000000, 0.35).setOrigin(0.5, 0.5);
    const bg = this.add.rectangle(0, 0, w, h, 0xf6edd7, 0.97).setOrigin(0.5, 0.5);
    const border = this.add.rectangle(0, 0, w, h)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(2, 0xb58a3c, 1);

    const artPanel = this.add.rectangle(0, top + 55, w - 14, 86, 0x1b1b1b, 0.92)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(1, 0x6f5d3a, 0.85);

    const divider1 = this.add.rectangle(0, top + 98, w - 16, 1, 0x6f5d3a, 0.55).setOrigin(0.5, 0.5);
    const divider2 = this.add.rectangle(0, top + 126, w - 16, 1, 0x6f5d3a, 0.40).setOrigin(0.5, 0.5);
    const divider3 = this.add.rectangle(0, top + 151, w - 16, 1, 0x6f5d3a, 0.35).setOrigin(0.5, 0.5);

    const previewSprite = this.add.sprite(
      0,
      (artPanel.y + artPanel.height / 2) - SHOP_CARD_ART_LIFT_Y,
      'sworman_atlas',
      'psd_animation/idle.png'
    )
      .setOrigin(0.5, 1)
      .setScale(0.68);

    const previewFallback = this.add.text(0, top + 52, '?', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '34px',
      color: '#f0d9a0',
    }).setOrigin(0.5, 0.5).setVisible(false);

    const nameText = this.add.text(0, top + 104, '...', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '14px',
      color: '#17130d',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: w - 16, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    const typeText = this.add.text(0, top + 132, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '13px',
      color: '#4f3f25',
      align: 'center',
      wordWrap: { width: w - 16, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    const costText = this.add.text(0, top + 157, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '13px',
      color: '#7c5b00',
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5, 0);

    const hit = this.add.zone(0, 0, w, h)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    card.container = container;
    card.shadow = shadow;
    card.bg = bg;
    card.border = border;
    card.artPanel = artPanel;
    card.previewSprite = previewSprite;
    card.previewFallback = previewFallback;
    card.nameText = nameText;
    card.typeText = typeText;
    card.costText = costText;
    card.hit = hit;

    card.refreshVisual = () => {
      const enabled = !!card.enabled;
      const hovered = enabled && !!card.hovered;
      const pressed = enabled && !!card.pressed;

      const fill = enabled
        ? (pressed ? 0xe4d6b8 : hovered ? 0xfcf4e4 : 0xf6edd7)
        : 0xaea79b;
      const fillAlpha = enabled ? 0.97 : 0.62;
      const borderColor = enabled ? (hovered ? 0xe1b754 : 0xb58a3c) : 0x7f786b;

      card.bg.setFillStyle(fill, fillAlpha);
      card.border.setStrokeStyle(2, borderColor, 1);
      card.artPanel.setAlpha(enabled ? 1 : 0.55);
      card.container.setScale(pressed ? 0.985 : 1);
      card.previewSprite.setAlpha(enabled ? 1 : 0.55);
      card.previewFallback.setAlpha(enabled ? 1 : 0.55);
      card.nameText.setAlpha(enabled ? 1 : 0.75);
      card.typeText.setAlpha(enabled ? 1 : 0.75);
      card.costText.setAlpha(enabled ? 1 : 0.75);

      if (card.hit?.input) {
        card.hit.input.enabled = enabled;
        card.hit.input.cursor = enabled ? 'pointer' : 'default';
      }
    };

    hit.on('pointerover', () => {
      card.hovered = true;
      card.refreshVisual();
    });
    hit.on('pointerout', () => {
      card.hovered = false;
      card.pressed = false;
      card.refreshVisual();
    });
    hit.on('pointerdown', () => {
      if (!card.enabled) return;
      card.pressed = true;
      card.refreshVisual();
      this.ws?.sendIntentShopBuy?.(index);
    });
    hit.on('pointerup', () => {
      card.pressed = false;
      card.refreshVisual();
    });

    container.add([
      shadow,
      bg,
      artPanel,
      previewSprite,
      previewFallback,
      divider1,
      nameText,
      divider2,
      typeText,
      divider3,
      costText,
      border,
      hit,
    ]);

    card.refreshVisual();
    return card;
  }

  positionShop() {
    if (!this.shopCards?.length) return;

    const layout = this.shopCardLayout ?? { width: 132, height: 188, gap: 10, bottomMargin: 10 };
    const totalW = this.shopCards.length * layout.width + (this.shopCards.length - 1) * layout.gap;
    let x = this.scale.width / 2 - totalW / 2 + layout.width / 2;
    const y = this.scale.height - layout.bottomMargin - layout.height / 2;

    for (const card of this.shopCards) {
      card.container?.setPosition(x, y);
      x += layout.width + layout.gap;
    }

    if (this.shopToggleBtn) {
      const rightEdge = this.scale.width / 2 + totalW / 2;
      const btnX = rightEdge + 18;
      const btnY = y - layout.height / 2 + 16;
      this.shopToggleBtn.setPosition(btnX, btnY);

      if (this.shopRefreshBtn) {
        const xHalfW = (this.shopToggleBtn.width ?? this.shopToggleBtn.displayWidth ?? 0) / 2;
        const refreshHalfH = (this.shopRefreshBtn.height ?? this.shopRefreshBtn.displayHeight ?? 0) / 2;
        const tileBottomY = y + layout.height / 2;
        const refreshY = tileBottomY - refreshHalfH; // выравниваем по нижнему краю тайлов
        const leftEdgeX = btnX - xHalfW;
        this.shopRefreshBtn.setPosition(leftEdgeX, refreshY); // у контейнера локальная точка = левый край по X
      }
    }

    if (this.shopOpenBtn) {
      const view = this.scale.getViewPort();
      const btnW = this.shopOpenBtn.width ?? this.shopOpenBtn.displayWidth ?? 0;
      const btnH = this.shopOpenBtn.height ?? this.shopOpenBtn.displayHeight ?? 0;
      this.shopOpenBtn.setPosition(
        view.x + view.width - 12 - btnW / 2,
        view.y + view.height - 12 - btnH / 2,
      );
    }
  }

  stopShopUiTweens() {
    for (const card of (this.shopCards ?? [])) {
      if (card?.container) this.tweens.killTweensOf(card.container);
    }
    if (this.shopToggleBtn) this.tweens.killTweensOf(this.shopToggleBtn);
    if (this.shopRefreshBtn) this.tweens.killTweensOf(this.shopRefreshBtn);
    if (this.shopRefreshBtnBody) this.tweens.killTweensOf(this.shopRefreshBtnBody);
    if (this.shopOpenBtn) this.tweens.killTweensOf(this.shopOpenBtn);
  }

  setShopCardsVisual(open, { immediate = false } = {}) {
    const cards = this.shopCards ?? [];
    const slide = 18;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const c = card?.container;
      if (!c) continue;

      const baseX = c.x;
      const baseY = c.y;
      c._shopBaseX = baseX;
      c._shopBaseY = baseY;

      this.tweens.killTweensOf(c);

      if (open) {
        c.setVisible(true);

        if (immediate) {
          c.setAlpha(1);
          c.setPosition(baseX, baseY);
        } else {
          c.setAlpha(Math.min(Number(c.alpha ?? 1), 0.01));
          c.setPosition(baseX, baseY + slide);
          this.tweens.add({
            targets: c,
            alpha: 1,
            x: baseX,
            y: baseY,
            duration: 170,
            delay: i * 16,
            ease: 'Cubic.Out',
          });
        }
        continue;
      }

      if (immediate) {
        c.setAlpha(0);
        c.setPosition(baseX, baseY + slide);
        c.setVisible(false);
      } else {
        c.setVisible(true);
        this.tweens.add({
          targets: c,
          alpha: 0,
          y: baseY + slide,
          duration: 130,
          delay: Math.max(0, (cards.length - 1 - i)) * 10,
          ease: 'Cubic.In',
          onComplete: () => {
            if (this.shopUiMode !== 'open') c.setVisible(false);
          },
        });
      }
    }
  }

  isShopButtonExpectedVisible(btn) {
    if (!btn) return false;
    const mode = this.shopUiMode ?? 'hidden';

    if (btn === this.shopToggleBtn) return mode === 'open';
    if (btn === this.shopRefreshBtn) return mode === 'open';
    if (btn === this.shopOpenBtn) return mode === 'collapsed' || mode === 'open';

    return false;
  }

  playShopRefreshTilesAnimation() {
    if (this.shopUiMode !== 'open') return;

    const cards = this.shopCards ?? [];
    const slide = 18;
    const outDuration = 95;
    const inDuration = 140;
    const stagger = 14;
    const reopenDelay = 70;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const c = card?.container;
      if (!c || !c.visible) continue;

      const baseX = c.x;
      const baseY = c.y;
      c._shopBaseX = baseX;
      c._shopBaseY = baseY;

      this.tweens.killTweensOf(c);
      c.setVisible(true);

      this.tweens.add({
        targets: c,
        alpha: 0,
        y: baseY + slide,
        duration: outDuration,
        delay: i * stagger,
        ease: 'Cubic.In',
        onComplete: () => {
          if (this.shopUiMode !== 'open') return;

          c.setPosition(baseX, baseY + slide);

          this.tweens.add({
            targets: c,
            alpha: 1,
            x: baseX,
            y: baseY,
            duration: inDuration,
            delay: reopenDelay,
            ease: 'Cubic.Out',
          });
        },
      });
    }
  }

  setShopButtonVisual(btn, visible, { immediate = false, slideY = 8 } = {}) {
    if (!btn) return;

    const baseX = btn.x;
    const baseY = btn.y;
    btn._shopBaseX = baseX;
    btn._shopBaseY = baseY;

    this.tweens.killTweensOf(btn);

    if (btn.input) btn.input.enabled = visible;

    if (visible) {
      btn.setVisible(true);

      if (immediate) {
        btn.setAlpha(1);
        btn.setPosition(baseX, baseY);
        return;
      }

      btn.setAlpha(Math.min(Number(btn.alpha ?? 1), 0.01));
      btn.setPosition(baseX, baseY + slideY);
      this.tweens.add({
        targets: btn,
        alpha: 1,
        x: baseX,
        y: baseY,
        duration: 150,
        ease: 'Cubic.Out',
      });
      return;
    }

    if (immediate) {
      btn.setAlpha(0);
      btn.setPosition(baseX, baseY + slideY);
      btn.setVisible(false);
      return;
    }

    btn.setVisible(true);
    this.tweens.add({
      targets: btn,
      alpha: 0,
      y: baseY + slideY,
      duration: 110,
      ease: 'Cubic.In',
      onComplete: () => {
        if (!this.isShopButtonExpectedVisible(btn)) btn.setVisible(false);
      },
    });
  }

  playPressFeedback(target, { scaleTo = 0.96, duration = 70 } = {}) {
    if (!target) return;

    this.tweens.killTweensOf(target);
    target.setScale(1, 1);

    this.tweens.add({
      targets: target,
      scaleX: scaleTo,
      scaleY: scaleTo,
      duration,
      ease: 'Quad.Out',
      yoyo: true,
    });
  }

  applyShopUiMode(mode, { animate = true } = {}) {
    const immediate = !animate;

    if (this.shopToggleBtn) {
      this.shopToggleBtn.setText('X');
      this.shopToggleBtn.setStyle({ backgroundColor: 'rgba(0,0,0,0.65)' });
    }

    if (mode === 'open') {
      this.setShopCardsVisual(true, { immediate });
      this.setShopButtonVisual(this.shopToggleBtn, true, { immediate, slideY: 6 });
      this.setShopButtonVisual(this.shopRefreshBtn, true, { immediate, slideY: 6 });
      // Кнопка "МАГАЗИН" теперь всегда на месте (в open/collapsed), без анимации "булькания".
      this.setShopButtonVisual(this.shopOpenBtn, true, { immediate: true, slideY: 10 });
      return;
    }

    if (mode === 'collapsed') {
      this.setShopCardsVisual(false, { immediate });
      this.setShopButtonVisual(this.shopToggleBtn, false, { immediate, slideY: 6 });
      this.setShopButtonVisual(this.shopRefreshBtn, false, { immediate, slideY: 6 });
      this.setShopButtonVisual(this.shopOpenBtn, true, { immediate: true, slideY: 10 });
      return;
    }

    // hidden (например result screen)
    this.setShopCardsVisual(false, { immediate });
    this.setShopButtonVisual(this.shopToggleBtn, false, { immediate, slideY: 6 });
    this.setShopButtonVisual(this.shopRefreshBtn, false, { immediate, slideY: 6 });
    this.setShopButtonVisual(this.shopOpenBtn, false, { immediate: true, slideY: 10 });
  }

  syncShopUI() {
    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;
    const show = (phase === 'prep' || phase === 'battle');
    const mode = !show ? 'hidden' : (this.shopCollapsed ? 'collapsed' : 'open');

    this.positionShop();

    if (this.shopUiMode !== mode) {
      const firstApply = (this.shopUiMode == null);
      const skipAnim = !!this.shopUiSkipNextModeAnimation;
      this.shopUiSkipNextModeAnimation = false;
      this.shopUiMode = mode;
      this.applyShopUiMode(mode, { animate: !firstApply && !skipAnim });
    }

    if (this.shopOpenBtn) {
      const isActive = (mode === 'open');
      this.shopOpenBtn.setStyle({
        backgroundColor: isActive ? 'rgba(110,95,20,0.82)' : 'rgba(0,0,0,0.72)',
        color: isActive ? '#ffe08a' : '#ffffff',
      });
      this.shopOpenBtn.setAlpha(isActive ? 1 : 0.94);
    }

    if (!show) return;

    const refreshCost = 2;
    const coins = Number(this.battleState?.kings?.player?.coins ?? 0);
    const canRefreshShop = (mode === 'open') && coins >= refreshCost && !this.shopRefreshBusy;
    if (this.shopRefreshBtn) {
      this.shopRefreshBtnBg?.setFillStyle(canRefreshShop ? 0x463700 : 0x4b4b4b, canRefreshShop ? 0.78 : 0.75);
      this.shopRefreshBtnBg?.setStrokeStyle(1, canRefreshShop ? 0x8f7a33 : 0x787878, 0.75);
      this.shopRefreshBtnCost?.setAlpha(canRefreshShop ? 1 : 0.82);
      this.shopRefreshBtnIcon?.setAlpha(canRefreshShop ? 1 : 0.72);
      this.shopRefreshBtnCoin?.setAlpha(canRefreshShop ? 1 : 0.72);
      if (this.shopRefreshBtnHit?.input) this.shopRefreshBtnHit.input.enabled = canRefreshShop;
      this.shopRefreshBtn.setAlpha(canRefreshShop ? 1 : 0.78);
    }

    const offers = this.battleState?.shop?.offers ?? [];

    for (let i = 0; i < (this.shopCards?.length ?? 0); i++) {
      const card = this.shopCards[i];
      if (!card) continue;

      const o = offers[i] ?? null;
      if (!o) {
        card.enabled = false;
        card.nameText.setText('Пусто');
        card.typeText.setText('—');
        card.costText.setText('');
        card.previewSprite.setVisible(false);
        card.previewFallback.setText('…').setVisible(true);
        card.refreshVisual();
        continue;
      }

      card.enabled = true;
      card.nameText.setText(String(o.type ?? 'Unknown'));
      card.typeText.setText(String(o.powerType ?? '—'));
      card.costText.setText(`${Number(o.cost ?? 0)} золота`);

      const atlasDef = UNIT_ATLAS_DEFS.find((def) => def.type === o.type) ?? null;
      if (atlasDef && this.textures.exists(atlasDef.atlasKey)) {
        card.previewSprite.setVisible(true);
        card.previewFallback.setVisible(false);
        card.previewSprite.setTexture(atlasDef.atlasKey, 'psd_animation/idle.png');

        const frame = card.previewSprite.frame;
        const fw = frame?.realWidth ?? frame?.width ?? 256;
        const fh = frame?.realHeight ?? frame?.height ?? 256;
        const panelW = card.artPanel?.width ?? (card.width - 14);
        const panelH = card.artPanel?.height ?? 86;
        const targetW = (panelW - 10) * 1.84; // примерно x2 от предыдущего лимита
        const targetH = (panelH - 6) * 1.96;  // примерно x2 от предыдущего лимита
        const scale = Math.max(0.12, Math.min(targetW / fw, targetH / fh));
        card.previewSprite.setScale(scale);

        if (this.anims.exists(atlasDef.idleAnim)) {
          card.previewSprite.play(atlasDef.idleAnim, true);
        }
      } else {
        card.previewSprite.setVisible(false);
        card.previewFallback.setText(String(o.type ?? '?').slice(0, 1).toUpperCase()).setVisible(true);
      }

      card.refreshVisual();
    }

  }

  positionCoinsHUD() {
    if (!this.kingLeftCoinIcon || !this.kingLeftCoinText || !this.kingLevelContainer) return;

    const view = this.scale.getViewPort();

    // базовая линия по Y — как у кнопки "Бой"
    const btnTop = this.debugBtn
      ? (this.debugBtn.y - (this.debugBtn.height ?? this.debugBtn.displayHeight ?? 0) * (this.debugBtn.originY ?? 0.5))
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

    const kingUiLiftPx = 35; // поднимает ВЕСЬ блок короля (арт + HP + имя), т.к. HP/имя привязаны к kingSprite.y
    const midY = (minY + maxY) / 2 - 40 - kingUiLiftPx; // подняли выше

    const pad = 30;
    const halfW = this.kingWidth / 2;
    const halfH = this.kingHeight / 2;

    const rawLeftX = minX - halfW - pad - 100;   // левый король ещё левее
    const rawRightX = maxX + halfW + pad - 40;   // правый король левее

    // Защита от обрезания при увеличении kingSize: держим королей внутри экрана.
    const view = this.scale.getViewPort();
    const screenPad = 12;
    const leftKingOverflowPx = 30; // можно увести левого короля за левый край (пустота в арте)
    const rightKingOverflowPx = leftKingOverflowPx; // зеркально для правого короля
    const minKingCenterX = view.x + halfW + screenPad - leftKingOverflowPx;
    const maxKingCenterX = view.x + view.width - halfW - screenPad + rightKingOverflowPx;

    const leftX = Phaser.Math.Clamp(rawLeftX, minKingCenterX, maxKingCenterX);
    const rightX = Phaser.Math.Clamp(rawRightX, minKingCenterX, maxKingCenterX);

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
    this.syncRoundUI();
    this.drawKingHpBars();
  }

  syncRoundUI() {
    if (!this.roundText || !this.prepTimerText) return;

    const round = Number(this.battleState?.round ?? 1);
    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;

    if (result) {
      this.prepTimerText?.setVisible(false);
      return;
    }

    this.roundText.setText(`Раунд ${round}`);

    // таймер показываем только в prep и пока нет результата
    const isPrep = (phase === 'prep') && (result == null);
    const isBattle = (phase === 'battle') && (result == null);

    if (isPrep) {
      const t = Number(this.battleState?.prepSecondsLeft ?? 0);
      const ss = String(Math.max(0, Math.min(59, t))).padStart(2, '0');
      this.prepTimerText.setVisible(true);
      this.prepTimerText.setText(`Подготовка: ${ss}с`);
    } else if (isBattle) {
      const t = Number(this.battleState?.battleSecondsLeft ?? 0);
      const ss = String(Math.max(0, Math.min(59, t))).padStart(2, '0');
      this.prepTimerText.setVisible(true);
      this.prepTimerText.setText(`Сражение: ${ss}с`);
    } else {
      this.prepTimerText.setVisible(false);
    }

    // Кнопка "Начать игру" видна только в предстарте:
    // round 1, фаза prep, нет активных таймеров и нет результата.
    if (this.startGameBtn) {
      const phase = this.battleState?.phase ?? 'prep';
      const result = this.battleState?.result ?? null;
      const round = Number(this.battleState?.round ?? 1);
      const prepLeft = Number(this.battleState?.prepSecondsLeft ?? 0);
      const battleLeft = Number(this.battleState?.battleSecondsLeft ?? 0);

      const started =
        round !== 1 ||
        phase !== 'prep' ||
        result != null ||
        prepLeft > 0 ||
        battleLeft > 0;

      this.startGameBtn.setVisible(!started);
    }
  }

  drawKingHpBars() {
    const kings = this.battleState?.kings;
    if (!kings) return;

    const barWidth = 95;
    const barHeight = 14;
    const kingHpBarDownPx = 10; // опускает HP-бар (и имя над ним) у обоих королей

    const drawBar = (kingSprite, hpBg, hpFill, kingData) => {
      if (!kingSprite || !kingData) return;

      const x = kingSprite.x - barWidth / 2;
      const y = kingSprite.y - this.kingHeight / 2 - 26 + kingHpBarDownPx;

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

      // имя короля над полоской HP
      const kingNameText = (kingSprite === this.kingLeft) ? this.kingLeftNameText : this.kingRightNameText;
      if (kingNameText) {
        kingNameText.setPosition(kingSprite.x, y - 4);
        kingNameText.setVisible(true);
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
      this.kingRightNameText?.setVisible(false);
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
    const barDx = -2; // +2px вправо только бар
    const x = (iconW / 2) - overlap + gap + barDx;
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

  getUnitScreenAnchor(coreUnitLike, fallbackVu = null) {
    if (!coreUnitLike && !fallbackVu) return null;

    const type = coreUnitLike?.type ?? fallbackVu?.type ?? null;
    const lift = GROUND_LIFT_BY_TYPE[type] ?? 0;

    if ((coreUnitLike?.zone === 'bench') || (!coreUnitLike && fallbackVu)) {
      const slot = Number.isInteger(coreUnitLike?.benchSlot)
        ? coreUnitLike.benchSlot
        : (Number.isInteger(fallbackVu?.benchSlot) ? fallbackVu.benchSlot : null);

      if (slot != null) {
        const p = this.benchSlotToScreen(slot);
        return { x: p.x, y: p.y, artX: p.x, artY: p.y + this.hexSize - lift };
      }
    }

    if (coreUnitLike && coreUnitLike.zone === 'board') {
      const p = this.hexToPixel(coreUnitLike.q, coreUnitLike.r);
      const g = this.hexToGroundPixel(coreUnitLike.q, coreUnitLike.r, lift);
      return { x: p.x, y: p.y, artX: g.x, artY: g.y };
    }

    if (fallbackVu?.sprite) {
      const x = fallbackVu.sprite.x;
      const y = fallbackVu.sprite.y;
      return { x, y, artX: x, artY: y + this.hexSize - lift };
    }

    return null;
  }

  playMergeAbsorbAnimation(donorVu, targetCoreUnit, delayMs = 0) {
    if (!donorVu || !donorVu.id || this.mergeAbsorbAnimatingIds?.has(donorVu.id)) return;

    const target = this.getUnitScreenAnchor(targetCoreUnit);
    if (!target) return;

    this.mergeAbsorbAnimatingIds.add(donorVu.id);

    this.playMergeTargetBounce?.(targetCoreUnit, delayMs);

    // visual-only: hide overlays, leave idle anim as-is
    donorVu.hpBar?.setVisible(false);
    donorVu.rankIcon?.setVisible(false);
    if (donorVu.dragHandle?.input) donorVu.dragHandle.input.enabled = false;

    const centerTargets = [donorVu.sprite, donorVu.dragHandle, donorVu.label].filter(Boolean);
    const fadeTargets = [donorVu.sprite, donorVu.label, donorVu.art].filter(Boolean);

    const duration = 250;
    const ease = 'Cubic.In';

    if (donorVu.art) {
      this.tweens.add({
        targets: donorVu.art,
        x: target.artX,
        y: target.artY,
        alpha: 0.25,
        scaleX: (donorVu.art.scaleX ?? 1) * 0.8,
        scaleY: (donorVu.art.scaleY ?? 1) * 0.8,
        duration,
        delay: delayMs,
        ease,
      });
    }

    if (centerTargets.length > 0) {
      this.tweens.add({
        targets: centerTargets,
        x: target.x,
        y: target.y,
        alpha: 0.2,
        duration,
        delay: delayMs,
        ease,
        onComplete: () => {
          this.mergeAbsorbAnimatingIds?.delete?.(donorVu.id);
          if (this.unitSys.findUnit(donorVu.id)) {
            this.unitSys.destroyUnit(donorVu.id);
          }
        },
      });
    } else {
      this.time.delayedCall(delayMs + duration, () => {
        this.mergeAbsorbAnimatingIds?.delete?.(donorVu.id);
        if (this.unitSys.findUnit(donorVu.id)) {
          this.unitSys.destroyUnit(donorVu.id);
        }
      });
    }

    if (fadeTargets.length > 0) {
      this.tweens.add({
        targets: fadeTargets,
        alpha: 0.2,
        duration,
        delay: delayMs,
        ease,
      });
    }
  }

  playMergeTargetBounce(targetCoreUnit, delayMs = 0) {
    if (!targetCoreUnit?.id) return;
    if (this.mergeBounceAnimatingIds?.has(targetCoreUnit.id)) return;

    const targetVu = this.unitSys?.findUnit?.(targetCoreUnit.id);
    if (!targetVu) {
      const prev = this.pendingMergeTargetBounces?.get?.(targetCoreUnit.id);
      const prevDelay = Number(prev?.delayMs ?? Infinity);
      const nextDelay = Math.min(prevDelay, Number(delayMs ?? 0));
      this.pendingMergeTargetBounces?.set?.(targetCoreUnit.id, {
        targetCoreUnit: { ...targetCoreUnit },
        delayMs: Number.isFinite(nextDelay) ? nextDelay : 0,
      });
      return;
    }

    const art = targetVu.art ?? null;
    const centerTargets = [targetVu.sprite, targetVu.label].filter(Boolean);
    const rankIcon = targetVu.rankIcon ?? null;

    this.mergeBounceAnimatingIds.add(targetCoreUnit.id);

    const artScaleX = art?.scaleX ?? 1;
    const artScaleY = art?.scaleY ?? 1;
    const spriteScaleX = targetVu.sprite?.scaleX ?? 1;
    const spriteScaleY = targetVu.sprite?.scaleY ?? 1;
    const labelScaleX = targetVu.label?.scaleX ?? 1;
    const labelScaleY = targetVu.label?.scaleY ?? 1;
    const rankScaleX = rankIcon?.scaleX ?? 1;
    const rankScaleY = rankIcon?.scaleY ?? 1;

    const up = 1.18; //изменить размер бануса при повышении ранга
    const upMs = 150; //Изменить скорость анимации баунса при повышении ранга
    if (art) {
      this.tweens.add({
        targets: art,
        scaleX: artScaleX * up,
        scaleY: artScaleY * up,
        duration: upMs,
        delay: delayMs,
        ease: 'Quad.Out',
        yoyo: true,
        hold: 15,
        onComplete: () => {
          if (art.active) {
            art.setScale(artScaleX, artScaleY);
          }
          this.mergeBounceAnimatingIds?.delete?.(targetCoreUnit.id);
        },
      });
      return;
    }

    const allTargets = [...centerTargets, rankIcon].filter(Boolean);
    if (allTargets.length === 0) {
      this.mergeBounceAnimatingIds?.delete?.(targetCoreUnit.id);
      return;
    }

    const bounceObject = (obj, sx, sy, onDone = null) => {
      if (!obj) return;
      this.tweens.add({
        targets: obj,
        scaleX: sx * up,
        scaleY: sy * up,
        duration: upMs,
        delay: delayMs,
        ease: 'Quad.Out',
        yoyo: true,
        hold: 15,
        onComplete: () => {
          if (obj.active) obj.setScale(sx, sy);
          onDone?.();
        },
      });
    };

    let pending = 0;
    const doneOne = () => {
      pending -= 1;
      if (pending <= 0) this.mergeBounceAnimatingIds?.delete?.(targetCoreUnit.id);
    };

    if (targetVu.sprite) {
      pending += 1;
      bounceObject(targetVu.sprite, spriteScaleX, spriteScaleY, doneOne);
    }
    if (targetVu.label) {
      pending += 1;
      bounceObject(targetVu.label, labelScaleX, labelScaleY, doneOne);
    }
    if (rankIcon) {
      pending += 1;
      bounceObject(rankIcon, rankScaleX, rankScaleY, doneOne);
    }

    if (pending === 0) {
      this.mergeBounceAnimatingIds?.delete?.(targetCoreUnit.id);
    }
  }

  flushPendingMergeTargetBounces() {
    if (!this.pendingMergeTargetBounces?.size) return;

    for (const [targetId, payload] of this.pendingMergeTargetBounces.entries()) {
      const targetVu = this.unitSys?.findUnit?.(targetId);
      if (!targetVu) continue;

      this.pendingMergeTargetBounces.delete(targetId);
      this.playMergeTargetBounce(payload?.targetCoreUnit ?? { id: targetId }, payload?.delayMs ?? 0);
    }
  }

  detectAndAnimateClientMerges(visibleUnits) {
    if (!this.unitSys?.state?.units?.length) return;

    const visibleById = new Map(visibleUnits.map(u => [u.id, u]));
    const currentVisuals = this.unitSys.state.units.slice();
    const visualById = new Map(currentVisuals.map(vu => [vu.id, vu]));

    const missingPool = currentVisuals.filter(vu => !visibleById.has(vu.id) && !this.mergeAbsorbAnimatingIds?.has(vu.id));
    if (missingPool.length < 2) return;

    const reserved = new Set();

    for (const targetCore of visibleUnits) {
      const existingVu = visualById.get(targetCore.id);
      if (!existingVu) continue;

      const oldRank = Number(existingVu.rank ?? 1);
      const newRank = Number(targetCore.rank ?? oldRank);
      if (!(newRank > oldRank)) continue;

      const candidates = missingPool.filter(vu =>
        !reserved.has(vu.id) &&
        vu.team === targetCore.team &&
        vu.type === targetCore.type &&
        Number(vu.rank ?? 1) === oldRank
      );

      if (candidates.length < 2) continue;

      const targetPos = this.getUnitScreenAnchor(targetCore, existingVu);
      if (!targetPos) continue;

      candidates.sort((a, b) => {
        const da = Phaser.Math.Distance.Between(a.sprite?.x ?? 0, a.sprite?.y ?? 0, targetPos.x, targetPos.y);
        const db = Phaser.Math.Distance.Between(b.sprite?.x ?? 0, b.sprite?.y ?? 0, targetPos.x, targetPos.y);
        return da - db;
      });

      const donors = candidates.slice(0, 2);
      donors.forEach((vu, idx) => {
        reserved.add(vu.id);
        this.playMergeAbsorbAnimation(vu, targetCore, idx * 40);
      });
    }
  }

  findLikelyMergeTargetForMissingVisual(donorVu, visibleUnits) {
    if (!donorVu || !visibleUnits?.length) return null;

    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;
    if (!(phase === 'prep' && !result)) return null; // merge happens in prep

    const donorRank = Number(donorVu.rank ?? 1);
    const donorType = donorVu.type ?? null;
    const donorTeam = donorVu.team ?? null;
    if (!donorType || !donorTeam) return null;

    const donorX = donorVu.sprite?.x ?? 0;
    const donorY = donorVu.sprite?.y ?? 0;

    let best = null;
    let bestDist = Infinity;

    for (const u of visibleUnits) {
      if (u.team !== donorTeam) continue;
      if (u.type !== donorType) continue;
      if (Number(u.rank ?? 1) <= donorRank) continue; // target must be upgraded rank

      const targetVu = this.unitSys.findUnit(u.id);
      const targetPos = this.getUnitScreenAnchor(u, targetVu);
      if (!targetPos) continue;

      const d = Phaser.Math.Distance.Between(donorX, donorY, targetPos.x, targetPos.y);
      if (d < bestDist) {
        bestDist = d;
        best = u;
      }
    }

    return best;
  }

  renderFromState() {
    // 1) кого оставляем
    const phase = this.battleState?.phase ?? 'prep';

    // в prep скрываем enemy, в battle показываем всех
    const visibleUnits = (this.battleState?.units ?? []).filter(u => {
      if (phase === 'prep' && u.team === 'enemy') return false;
      return true;
    });

    // Visual-only merge effect: before deleting vanished units, animate 2 donors flying into upgraded unit.
    this.detectAndAnimateClientMerges(visibleUnits);

    const aliveIds = new Set(visibleUnits.map(u => u.id));

    // 2) удалить тех, кого нет в core state
    for (const vu of this.unitSys.state.units.slice()) {
      if (!aliveIds.has(vu.id)) {
        if (this.mergeAbsorbAnimatingIds?.has(vu.id)) continue;

        const mergeTarget = this.findLikelyMergeTargetForMissingVisual(vu, visibleUnits);
        if (mergeTarget) {
          this.playMergeAbsorbAnimation(vu, mergeTarget);
          continue;
        }

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
              u.type === 'Crossbowman' ? 'C' :
              u.type === 'Knight' ? 'K' :
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
              u.type === 'Crossbowman' ? 'C' :
              u.type === 'Knight' ? 'K' :
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

        // Скамейка доступна всегда, поле — только в prep.
        const canDrag =
          (u.team === 'player') &&
          ((u.zone === 'bench') || ((this.battleState?.phase === 'prep') && !this.battleState?.result));
        this.setSpriteDraggable(created.dragHandle, canDrag);

        // если сервер сказал "bench" — сразу переставим на скамейку
        if (u.zone === 'bench') {
          const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
          const p = this.benchSlotToScreen(slot);

          created.sprite.setPosition(p.x, p.y);
          created.label?.setPosition(p.x, p.y);
          created.dragHandle?.setPosition(p.x, p.y);
          const lift = GROUND_LIFT_BY_TYPE[u.type] ?? 0;
          created.art?.setPosition(p.x, p.y + this.hexSize - lift);

          // на скамейке hpBar не показываем
          if (created.hpBar) created.hpBar.setVisible(false);
          if (created.rankIcon) created.rankIcon.setVisible(!u.dead);
          if (created) updateHpBar(this, created);
        }

        this.unitSys.setUnitDead?.(u.id, !!u.dead);

        continue;
      }

      // ---- UPDATE ----
      // Пока тащим юнита со скамейки (например во время battle-tick'ов), не снапаем его обратно state-апдейтами.
      if (u.id === this.draggingUnitId && u.team === 'player' && u.zone === 'bench') {
        const vuDrag = this.unitSys.findUnit(u.id);
        if (vuDrag?.dragHandle) this.setSpriteDraggable(vuDrag.dragHandle, true);
        continue;
      }

      // позиция: доска или скамейка
      if (u.zone === 'bench') {
        const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
        const p = this.benchSlotToScreen(slot);

        const vu = this.unitSys.findUnit(u.id);
        if (vu?.sprite) vu.sprite.setPosition(p.x, p.y);
        if (vu?.dragHandle) vu.dragHandle.setPosition(p.x, p.y);
        const lift = GROUND_LIFT_BY_TYPE[u.type] ?? 0;
        if (vu?.art) vu.art.setPosition(p.x, p.y + this.hexSize - lift);
        if (vu?.label) vu.label.setPosition(p.x, p.y);

        if (vu?.hpBar) vu.hpBar.setVisible(false);
        if (vu?.rankIcon) vu.rankIcon.setVisible(!u.dead);
      } else {
        const result = this.battleState?.result ?? null;
        // серверный tick в бою сейчас 450мс
        const MOVE_TWEEN_MS = 380; // чуть меньше, чтобы успевал “доехать” до следующего снапшота
        const tweenMs = (phase === 'battle' && !result) ? MOVE_TWEEN_MS : 0;
        this.unitSys.setUnitPos(u.id, u.q, u.r, { tweenMs });

        // На доске показываем HP только вне prep (в prep скрываем по запросу).
        const vu = this.unitSys.findUnit(u.id);
        if (vu?.hpBar) vu.hpBar.setVisible(phase !== 'prep');
        if (vu?.rankIcon) vu.rankIcon.setVisible((phase === 'prep') && !u.dead);
      }

      const vuRank = this.unitSys.findUnit(u.id);
      if (vuRank) vuRank.rank = u.rank ?? 1;

      // HP
      this.unitSys.setUnitHp(u.id, u.hp, u.maxHp ?? existing.maxHp);
      this.unitSys.setUnitDead?.(u.id, !!u.dead);

      // draggable всем юнитам игрока в prep + обновление буквы
      const vu = this.unitSys.findUnit(u.id);

      if (vu?.label) {
        const t = String(u.type ?? '').toLowerCase();
        const ch =
          (t === 'crossbowman') ? 'C' :
          (t === 'knight') ? 'K' :
          (t === 'swordsman' || t === 'swordmen') ? 'S' :
          '?';
        vu.label.setText(ch);
      }

      if (vu?.dragHandle) {
        const canDrag =
          (u.team === 'player') &&
          ((u.zone === 'bench') || ((this.battleState?.phase === 'prep') && !this.battleState?.result));

        this.setSpriteDraggable(vu.dragHandle, canDrag);
      }

    }

    // ✅ sync swordsman anim by phase/zone
    const result = this.battleState?.result ?? null;
    const animByType = {
      Swordsman: { idle: 'swordman_idle', walk: 'swordman_walk', dead: 'swordman_dead' },
      Crossbowman: { idle: 'crossbowman_idle', walk: 'crossbowman_walk', dead: 'crossbowman_dead' },
      Knight: { idle: 'knight_idle', walk: 'knight_walk', dead: 'knight_dead' },
    };

    for (const u of (this.battleState?.units ?? [])) {
      // в prep враги скрыты, но это не важно — просто синкаем тех, кто есть
      const vu = this.unitSys.findUnit(u.id);
      if (!vu?.art) continue;

      const animDef = animByType[u.type];
      if (!animDef) continue;

      const wantWalk = (phase === 'battle') && !result && (u.zone === 'board') && !u.dead;
      const animKey = u.dead ? animDef.dead : (wantWalk ? animDef.walk : animDef.idle);

      // не дёргаем play каждый тик/рендер если уже играет то же самое
      if (vu.art.anims?.getName?.() === animKey) continue;

      if (this.anims.exists(animKey)) {
        vu.art.play(animKey);
      }
    }

    this.flushPendingMergeTargetBounces();
  }


  syncPhaseUI() {
    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;

    // если есть результат — показываем текст и прячем кнопку
    if (result) {
      this.debugCanStartBattle = false;
      this.syncDebugUI?.();

      // ✅ таймер скрываем, результат показываем вместо него
      this.prepTimerText?.setVisible(false);
      this.resultText?.setVisible(true);

      let text = '';
      let fill = '#ffffff';
      let stroke = '#666666';

      if (result === 'victory') {
        text = 'ПОБЕДА';
        fill = '#f5c542';      // золотистый
        stroke = '#c89b1e';    // характерная золотая обводка
      }
      else if (result === 'defeat') {
        text = 'ПОРАЖЕНИЕ';
        fill = '#ff6fa8';      // розовый
        stroke = '#7a002f';    // бордовая обводка
      }
      else if (result === 'draw') {
        text = 'НИЧЬЯ';
        fill = '#dddddd';
        stroke = '#777777';
      }

      this.resultText
        ?.setText(text)
        .setFontStyle('bold')
        .setColor(fill)
        .setStroke(stroke, 4)
        .setShadow(0, 0, '#000000', 3, true, true);
      this.resultText?.setVisible(true);
      
      return;
    }

    // результата нет
    this.resultText?.setVisible(false);

    // debug-кнопка "Бой" доступна только в prep (сама живёт в модалке)
    this.debugCanStartBattle = (phase === 'prep');
    this.syncDebugUI?.();

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
      if (u.dead) continue;

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
        ((u.zone === 'bench') || ((phase === 'prep') && !result));

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


