import Phaser from 'phaser';
import { hexToPixel, pixelToHex, hexCorners, hexToGroundPixel } from '../game/hex.js';
import { createUnitSystem } from '../game/units.js';
import { getUnitArtOffsetXPx, getUnitGroundLiftPx } from '../game/unitVisualConfig.js';
import {
  atlasIdleFrame,
  atlasDeadFrame,
  atlasWalkFrameRegex,
  atlasAttackFrameRegex,
  UNIT_ATLAS_DEFS,
  UNIT_ATLAS_DEF_BY_TYPE,
  UNIT_ANIMS_BY_TYPE,
} from '../game/unitAtlasConfig.js';
import { WSClient } from '../net/wsClient.js';
import { createFullscreenButton, positionFullscreenButton } from '../game/ui.js';
import { updateHpBar } from '../game/hpbar.js';

import { createBattleState, KING_XP_COST, KING_MAX_LEVEL, hexDistance } from '../../shared/battleCore.js';
import { baseIncomeForRound, interestIncome, streakBonus } from '../../shared/economy.js';
import { installBattleSceneDrag } from './battleScene/dragController.js';
import { installBattleSceneShopUi } from './battleScene/shopUi.js';
import { installBattleSceneTestScene } from './battleScene/testScene.js';
import { installBattleSceneDebugUi } from './battleScene/debugUi.js';

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

const SHOP_OFFER_COUNT = 5;
const SHOP_CARD_ART_LIFT_Y = 75; // увеличивай/уменьшай, чтобы поднять/опустить арт в сером блоке карточки
const AUTO_ENTER_TEST_SCENE_ON_BOOT = true; // временно: быстрый вход сразу в test scene
const UI_TEXT = {
  START_GAME: '\u041d\u0410\u0427\u0410\u0422\u042c \u0418\u0413\u0420\u0423',
  TEST_SCENE: '\u0422\u0435\u0441\u0442\u043e\u0432\u0430\u044f \u0441\u0446\u0435\u043d\u0430',
  ROUND: '\u0420\u0430\u0443\u043d\u0434',
  PREP: '\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0430',
  BATTLE: '\u0421\u0440\u0430\u0436\u0435\u043d\u0438\u0435',
  VICTORY: '\u041f\u041e\u0411\u0415\u0414\u0410',
  DEFEAT: '\u041f\u041e\u0420\u0410\u0416\u0415\u041d\u0418\u0415',
  DRAW: '\u041d\u0418\u0427\u042c\u042f',
  COIN_INCOME: '\u0414\u043e\u0445\u043e\u0434 \u0437\u0430 \u0440\u0430\u0443\u043d\u0434',
  WIN_BONUS: '\u0411\u043e\u043d\u0443\u0441 \u0437\u0430 \u043f\u043e\u0431\u0435\u0434\u0443',
  WIN_STREAK_BONUS: '\u0411\u043e\u043d\u0443\u0441 \u0437\u0430 \u0441\u0435\u0440\u0438\u044e \u043f\u043e\u0431\u0435\u0434',
  LOSE_STREAK_BONUS: '\u0411\u043e\u043d\u0443\u0441 \u0437\u0430 \u0441\u0435\u0440\u0438\u044e \u043f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0439',
  EXPECTED_ROUND_INCOME: '\u041e\u0436\u0438\u0434\u0430\u0435\u043c\u044b\u0439 \u0434\u043e\u0445\u043e\u0434 \u0440\u0430\u0443\u043d\u0434\u0430',
  FROM_NEXT_WIN: '(\u0441\u043e \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0439 \u043f\u043e\u0431\u0435\u0434\u043e\u0439)',
  FROM_NEXT_LOSS: '(\u0441\u043e \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0433\u043e \u043f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u044f)',
};

function getUnitShortLabel(type) {
  const t = String(type ?? '').toLowerCase();
  if (t === 'bonesgolem' || t === 'bones_golem') return 'BG';
  if (t === 'crossbowman') return 'C';
  if (t === 'ghost') return 'Gh';
  if (t === 'knight') return 'K';
  if (t === 'lich') return 'L';
  if (t === 'skeleton') return 'Sk';
  if (t === 'skeletonarcher' || t === 'skeleton_archer') return 'SA';
  if (t === 'swordsman' || t === 'swordmen') return 'S';
  if (t === 'vampire') return 'V';
  if (t === 'zombie') return 'Z';
  return '?';
}

function areKingsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ap = a.player ?? {};
  const bp = b.player ?? {};
  const ae = a.enemy ?? {};
  const be = b.enemy ?? {};
  return (
    ap.hp === bp.hp &&
    ap.maxHp === bp.maxHp &&
    ap.coins === bp.coins &&
    ap.level === bp.level &&
    ap.xp === bp.xp &&
    ae.hp === be.hp &&
    ae.maxHp === be.maxHp &&
    ae.coins === be.coins &&
    ae.visible === be.visible &&
    ae.level === be.level &&
    ae.xp === be.xp
  );
}

function areShopOffersEqual(a, b) {
  if (a === b) return true;
  const aa = a?.offers ?? [];
  const bb = b?.offers ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    const x = aa[i];
    const y = bb[i];
    if (x === y) continue;
    if (!x || !y) {
      if (x !== y) return false;
      continue;
    }
    if (
      x.type !== y.type ||
      x.powerType !== y.powerType ||
      x.cost !== y.cost ||
      x.hp !== y.hp ||
      (x.maxHp ?? x.hp) !== (y.maxHp ?? y.hp) ||
      x.atk !== y.atk ||
      x.moveSpeed !== y.moveSpeed ||
      Number(x.attackSpeed ?? 100) !== Number(y.attackSpeed ?? 100)
    ) return false;
  }
  return true;
}

function areUnitsEqual(a, b) {
  if (a === b) return true;
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    const x = aa[i];
    const y = bb[i];
    if (!x || !y) return false;
    if (
      x.id !== y.id ||
      x.q !== y.q || x.r !== y.r ||
      x.zone !== y.zone ||
      x.benchSlot !== y.benchSlot ||
      x.team !== y.team ||
      x.type !== y.type ||
      x.rank !== y.rank ||
      Number(x.attackSpeed ?? 100) !== Number(y.attackSpeed ?? 100) ||
      x.hp !== y.hp ||
      (x.maxHp ?? x.hp) !== (y.maxHp ?? y.hp) ||
      Number(x.attackSeq ?? 0) !== Number(y.attackSeq ?? 0) ||
      x.dead !== y.dead
    ) return false;
  }
  return true;
}

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  preload() { //Подгружаем пулл картинок
    this.load.image('battleBg', '/assets/bg.jpg');
    this.load.image('king', '/assets/kings/king_princess.png');
    this.load.image('coin', '/assets/icons/Coin.png');
    this.load.image('rank1', '/assets/icons/rank1.png');
    this.load.image('rank2', '/assets/icons/rank2.png');
    this.load.image('rank3', '/assets/icons/rank3.png');
    this.load.image('crownexp', '/assets/crownexp.png');
    this.load.image('updateMarketIcon', '/assets/icons/update_market.png');

    for (const asset of EXTRA_PORTRAIT_ASSETS) {
      this.load.image(asset.key, asset.path);
    }

    this.load.atlas(
      'unitPortraitsAtlas',
      '/assets/units/portraits/portraits.png',
      '/assets/units/portraits/portraits.json',
    );

    // ? swordman atlas (png+json)
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
    this.coreUnitsById = new Map();
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

    // --- COINS UI (coin icon + "x N") ---
    this.coinSize = 40;
    this.coinMax = 100; // ? максимальное кол-во монет
    this.coinHudTextReserveW = 42; // резерв ширины под число монет (чтобы иконка не ездила при 99/100)

    this.coinContainer = this.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(9998);

    this.kingLeftCoinIcon = this.add.image(0, 0, 'coin')
      .setDisplaySize(this.coinSize, this.coinSize)
      .setOrigin(0.5, 0.5);

    this.kingLeftCoinText = this.add.text(0, 0, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffd85a',
    })
      .setOrigin(0, 0.5)
      .setStroke('#b35a00', 3)
      .setShadow(0, 0, '#000000', 4, true, true);
    this.kingLeftCoinText.setPosition((this.coinSize / 2) + 8, 0);

    this.kingLeftCoinMaxText = this.add.text(0, 0, 'Max', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#ffe69a',
    })
      .setOrigin(0.5, 0.5)
      .setStroke('#9a5a00', 2)
      .setShadow(0, 0, '#000000', 2, true, true)
      .setVisible(false);
    this.kingLeftCoinMaxText.setPosition((this.coinSize / 2) + 8, 12);

    // компактный блок: icon -> text
    this.coinContainer.add([
      this.kingLeftCoinIcon,
      this.kingLeftCoinText,
      this.kingLeftCoinMaxText,
    ]);

    // --- COIN INFO POPUP (hit zone) ---
    this.coinInfoOpen = false;

    // интерактивная зона на весь блок монет (иконка + текст)
    this.coinHit = this.add.zone(0, 0, 110, 44)
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

    this.kingLevelIconScale = 0.17;
    this.kingLevelTextOffsetX = 0; // ручная подстройка номера уровня по X внутри короны
    this.kingLevelTextOffsetY = 3; // ручная подстройка номера уровня по Y внутри короны
    this.kingLevelTextDoubleDigitOffsetX = -1; // авто-сдвиг по X для уровней > 9 (подкрути тут)
    this.kingLevelIcon = this.add.image(0, 0, 'crownexp')
      .setScale(this.kingLevelIconScale)
      .setOrigin(0.5, 0.5);
    this.kingLevelIcon.y = -3; // чуть поднять саму корону

    this.kingLevelBarBg = this.add.graphics();
    this.kingLevelBarFill = this.add.graphics();

    this.kingLevelText = this.add.text(0, 0, '1', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#f2e8ff',
      fontStyle: 'bold',
    })
      .setOrigin(0.5, 0.5)
      .setStroke('#43256e', 3)
      .setShadow(0, 0, '#1d102f', 2, true, true);

    this.kingLevelXpText = this.add.text(0, 0, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '18px',          // было 14px > делаем крупнее
      color: '#f2e8ff',
      fontStyle: 'bold',
    })
      .setOrigin(0.5, 0)
      .setVisible(false)
      .setStroke('#43256e', 3)
      .setShadow(0, 0, '#1d102f', 2, true, true);

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

    // ? любой тап в любом месте закрывает Exp и поп ап с инфой о золоте (если тап не по этому блоку)
    this.input.on('pointerdown', (pointer, currentlyOver) => {
      const over = currentlyOver || [];

      const overLevel = this.kingLevelHit && over.includes(this.kingLevelHit);

      const overCoins = this.coinHit && over.includes(this.coinHit);
      const overCoinPopup = this.coinPopupHit && over.includes(this.coinPopupHit); // ? важно

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

    this.gStatic = this.add.graphics().setDepth(0);
    this.gDynamic = this.add.graphics().setDepth(1);
    this.g = this.gDynamic; // совместимость со старым кодом drawHex/drawHexFilled
    this.gridStaticDirty = true;
    this.cachedPrepBoardHexCenters = [];
    this.cachedBoardHexCenters = [];
    this.cachedBenchHexCenters = [];
    this.cachedBenchSlotScreen = [];

    // units system
    this.unitSys = createUnitSystem(this);

    // ? anims: swordman from atlas
    for (const def of UNIT_ATLAS_DEFS) {
      if (!this.anims.exists(def.idleAnim)) {
        this.anims.create({
          key: def.idleAnim,
          frames: [{ key: def.atlasKey, frame: atlasIdleFrame(def) }],
          frameRate: 1,
          repeat: -1,
        });
      }

      if (!this.anims.exists(def.walkAnim)) {
        const texture = this.textures.get(def.atlasKey);
        const walkFrames = (texture?.getFrameNames?.() ?? [])
          .filter((name) => atlasWalkFrameRegex(def).test(name))
          .sort()
          .map((frame) => ({ key: def.atlasKey, frame }));

        this.anims.create({
          key: def.walkAnim,
          frames: walkFrames.length > 0
            ? walkFrames
            : [{ key: def.atlasKey, frame: atlasIdleFrame(def) }],
          frameRate: 12,
          repeat: -1,
        });
      }

      if (!this.anims.exists(def.attackAnim)) {
        const texture = this.textures.get(def.atlasKey);
        const attackFrames = (texture?.getFrameNames?.() ?? [])
          .filter((name) => atlasAttackFrameRegex(def).test(name))
          .sort()
          .map((frame) => ({ key: def.atlasKey, frame }));

        this.anims.create({
          key: def.attackAnim,
          frames: attackFrames.length > 0
            ? attackFrames
            : [{ key: def.atlasKey, frame: atlasIdleFrame(def) }],
          frameRate: 12,
          repeat: 0,
        });
      }

      if (!this.anims.exists(def.deadAnim)) {
        this.anims.create({
          key: def.deadAnim,
          frames: [{ key: def.atlasKey, frame: atlasDeadFrame(def) }],
          frameRate: 1,
          repeat: -1,
        });
      }
    }

    this.mergeAbsorbAnimatingIds = new Set(); // visual-only merge animation for disappearing units
    this.mergeBounceAnimatingIds = new Set(); // avoid stacking bounce on the same merge target
    this.pendingMergeTargetBounces = new Map(); // targetId -> { targetCoreUnit, delayMs }
    this.pendingAttackAnimIds = new Set();
    this.initDragState();

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
    this.startGameBtn = this.add.text(this.scale.width / 2, this.scale.height / 2, UI_TEXT.START_GAME, {
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
      if (this.testSceneActive) {
        this.testSceneQueuedLiveState = msg?.state ?? null;
        this.activeUnitId = msg?.you?.unitId ?? null;
        return;
      }

      // сервер прислал начальный state и сказал, каким юнитом ты управляешь
      this.battleState = msg.state;
      this.activeUnitId = msg?.you?.unitId ?? null; // теперь может быть null (старт пустой)

      if (this.battleState?.phase === 'battle' && !this.battleState?.result) this.shopCollapsed = true;
      if (this.battleState?.phase === 'prep' && !this.battleState?.result) this.shopCollapsed = false;
      this.draggingUnitId = null;
      this.dragBoardHover = null;
      this.dragBenchHoverSlot = null;

      this.renderFromState();
      this.drawGrid();
      this.syncPhaseUI();
      this.syncKingsUI();
      this.syncShopUI();
      this.refreshAllDraggable();
    };

    this.ws.onState = (state) => {
      if (this.testSceneActive) {
        this.testSceneQueuedLiveState = state;
        return;
      }
      // сервер прислал обновлённый state после чьего-то хода
      const prevState = this.battleState;
      const prevPhase = this.battleState?.phase ?? null;
      const prevResult = this.battleState?.result ?? null;
      this.battleState = state;

      const phaseChanged = (state?.phase ?? null) !== prevPhase;
      const resultChanged = (state?.result ?? null) !== prevResult;
      const phaseUiChanged =
        phaseChanged ||
        resultChanged ||
        Boolean(prevState?.gameStarted) !== Boolean(state?.gameStarted) ||
        Number(prevState?.round ?? 0) !== Number(state?.round ?? 0) ||
        Number(prevState?.prepSecondsLeft ?? 0) !== Number(state?.prepSecondsLeft ?? 0) ||
        Number(prevState?.battleSecondsLeft ?? 0) !== Number(state?.battleSecondsLeft ?? 0);
      const unitsChanged = !areUnitsEqual(prevState?.units, state?.units);
      const pendingAttackAnimIds = new Set();
      const prevUnitsById = new Map((prevState?.units ?? []).map((u) => [u.id, u]));
      for (const u of (state?.units ?? [])) {
        const prev = prevUnitsById.get(u.id);
        if (!prev) continue;
        const prevAttackSeq = Number(prev.attackSeq ?? 0);
        const nextAttackSeq = Number(u.attackSeq ?? 0);
        if (nextAttackSeq > prevAttackSeq) pendingAttackAnimIds.add(u.id);
      }
      this.pendingAttackAnimIds = pendingAttackAnimIds;
      const kingsChanged = !areKingsEqual(prevState?.kings, state?.kings);
      const shopChanged = !areShopOffersEqual(prevState?.shop, state?.shop);

      // На смене только result (без смены фазы) не анимируем UI магазина,
      // чтобы кнопки не "доезжали" как при ручном закрытии.
      // На смене фазы prep<->battle анимацию оставляем.
      if (!phaseChanged && resultChanged) {
        this.shopUiSkipNextModeAnimation = true;
      }

      if (phaseChanged) {
        if (state?.phase === 'battle' && !state?.result) this.shopCollapsed = true;
        if (state?.phase === 'prep' && !state?.result) this.shopCollapsed = false;
        this.gridStaticDirty = true;
        if (state?.phase !== 'prep' || state?.result) {
          this.draggingUnitId = null;
          this.dragBoardHover = null;
          this.dragBenchHoverSlot = null;
        }
      }

      // Если атака была прервана сменой фазы/результата, animationcomplete может не прийти,
      // и флаг атаки залипнет до следующего боя. Сбрасываем такие локальные флаги здесь.
      if (phaseChanged || resultChanged) {
        for (const vu of (this.unitSys?.state?.units ?? [])) {
          vu._attackAnimPlaying = false;
          vu._attackAnimForceReplay = false;
        }
        this.pendingAttackAnimIds?.clear?.();
      }

      let gridDynamicNeedsRedraw = false;

      const needRender = (unitsChanged || phaseChanged || resultChanged);
      const needGrid = (needRender || gridDynamicNeedsRedraw);
      const needPhaseUi = phaseUiChanged;
      const needKingsUi = phaseUiChanged || kingsChanged;
      const needShopUi = phaseChanged || resultChanged || kingsChanged || shopChanged;
      const needRefreshDraggable = (unitsChanged || phaseChanged || resultChanged);

      if (needRender) this.renderFromState();
      if (needGrid) this.drawGrid();
      if (needPhaseUi) this.syncPhaseUI();
      if (needKingsUi) this.syncKingsUI();
      if (needShopUi) this.syncShopUI();
      if (needRefreshDraggable) this.refreshAllDraggable();
      this.syncDebugUI?.();
    };

    this.ws.onError = (err) => {
      if (this.testSceneActive) return;
      console.warn('Server error:', err?.code, err?.message || err);

      if (err?.code === 'OCCUPIED' || err?.code === 'MOVE_DENIED' || err?.code === 'NOT_OWNER') {
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
    this.bindDragHandlers();

    // resize
    this.scale.on('resize', () => {
      this.draggingUnitId = null;
      this.dragBoardHover = null;
      this.dragBenchHoverSlot = null;
      this.layout();
      this.drawGrid();

      if (this.roundText) this.roundText.setPosition(this.scale.width / 2, 10);
      if (this.prepTimerText) this.prepTimerText.setPosition(this.scale.width / 2, 56);

      if (this.resultText) this.resultText.setPosition(this.scale.width / 2, 56);
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

    // Debug and test-scene UI are installed by a dedicated UI module.
    this.initDebugUi?.();
    // --- ROUND + TIMER (top center) ---
    this.roundText = this.add.text(this.scale.width / 2, 10, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '34px',
      fontStyle: 'bold',        // ? жирный
      color: '#ffffff',
    })
      .setOrigin(0.5, 0)
      .setDepth(9999)
      .setStroke('#888888', 3)  // ? серая обводка
      .setShadow(0, 0, '#000000', 2, true, true); // лёгкая мягкая тень

    this.prepTimerText = this.add.text(this.scale.width / 2, 56, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '20px',
      color: '#ffffff',      // без fontStyle
    })
      .setOrigin(0.5, 0)
      .setDepth(9999)
      .setStroke('#777777', 2)
      .setShadow(0, 0, '#000000', 2, true, true);

    this.resultText = this.add.text(this.scale.width / 2, 56, '', { // на месте таймера (под "Раунд")
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '28px', // чуть меньше, чтобы не перекрывало UI
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: Math.min(520, this.scale.width - 40), useAdvancedWrap: true }, // будет расти вниз
    })
    .setOrigin(0.5, 0)  // ? верхняя граница текста фиксирована по y=48
    .setDepth(9999)
    .setVisible(false);

    this.positionDebugUI?.();
    this.syncDebugUI?.();

    // --- SHOP UI (cards) ---
    this.shopOfferCount = SHOP_OFFER_COUNT;
    this.shopCardArtLiftY = SHOP_CARD_ART_LIFT_Y;
    this.shopUnitAtlasDefByType = UNIT_ATLAS_DEF_BY_TYPE;
    this.shopAtlasIdleFrame = atlasIdleFrame;
    this.initShopUI();

    if (AUTO_ENTER_TEST_SCENE_ON_BOOT) {
      this.enterTestScene?.();
    }

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
    this.rebuildGridCaches();
    this.gridStaticDirty = true;

    // ВАЖНО: позиции юнитов пересчитываем от core-state (zone board/bench),
    // а не из unitSys.q/r, иначе bench улетает при resize.
    this.renderFromState();

    this.positionKings();
    this.drawKingHpBars(); // чтобы бары не остались в старых координатах
    this.positionCoinsHUD();
  }

  applyLocalPlayerKingTexture(textureKey) {
    if (!textureKey || !this.textures?.exists?.(textureKey)) return;

    this.localPlayerKingTextureKey = textureKey;

    if (this.kingLeft) {
      this.kingLeft.setTexture(textureKey);
      this.kingLeft.setDisplaySize(this.kingWidth, this.kingHeight);
    }
  }


  playUnitFeedbackBounce(vu, { scaleMul = 1.06, duration = 80 } = {}) {
    if (!vu) return;

    const targets = [vu.sprite, vu.art, vu.label, vu.rankIcon].filter((obj) => obj?.active);
    for (const obj of targets) {
      const baseScaleX = Number(obj.scaleX ?? 1);
      const baseScaleY = Number(obj.scaleY ?? 1);

      this.tweens.killTweensOf(obj);
      if (obj.scaleX !== baseScaleX || obj.scaleY !== baseScaleY) {
        obj.setScale(baseScaleX, baseScaleY);
      }

      this.tweens.add({
        targets: obj,
        scaleX: baseScaleX * scaleMul,
        scaleY: baseScaleY * scaleMul,
        duration,
        ease: 'Quad.Out',
        yoyo: true,
        onComplete: () => {
          if (obj?.active) obj.setScale(baseScaleX, baseScaleY);
        },
      });
    }
  }

  positionCoinsHUD() {
    if (!this.kingLeftCoinIcon || !this.kingLeftCoinText || !this.kingLevelContainer) return;

    const view = this.scale.getViewPort();

    // HUD left-side anchors to a fixed top line, not to debug buttons.
    // Otherwise swapping/moving Debug/Rating buttons shifts XP/coins unexpectedly.
    const btnTop = view.y + 14;

    // базовый X — левый край поля
    const p0 = this.hexToPixel(0, 0);
    const baseX = Math.max(view.x + 8, p0.x - this.hexSize);

    // 1) сначала ставим блок опыта (корона+бар) сверху
    const xpY = btnTop + 14; // верхняя строка HUD (подбери если надо)
    // выравниваем левый край XP-блока (левый край короны) по baseX,
    // как и левый край иконки монет
    const crownW = this.kingLevelIcon?.displayWidth ?? 30;
    this.kingLevelContainer.setPosition(baseX + crownW / 2, xpY);

    // 2) монеты — слева от блока опыта короля
    const iconW = this.kingLeftCoinIcon.displayWidth || this.coinSize;
    // Держим иконку монет на фиксированном месте относительно XP-блока.
    // Не используем текущую ширину текста (99/100), иначе иконка "ездит".
    const coinTextReserveW = Number(this.coinHudTextReserveW ?? 42); // подкрути при желании
    const coinGap = 8;
    const coinBlockW = iconW + coinGap + coinTextReserveW;
    const coinsToXpGap = 14;
    const xpLeftX = baseX;
    const coinLeftX = Math.max(view.x + 8, xpLeftX - coinsToXpGap - coinBlockW);
    const coinY = xpY;

    // coinContainer anchored by icon center
    this.coinContainer.setPosition(Math.round(coinLeftX + iconW / 2), coinY);
  }

  positionKings() {
    if (!this.kingLeft || !this.kingRight) return;

    // считаем bounds поля через центры гексов
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    const cells = this.cachedBoardHexCenters?.length ? this.cachedBoardHexCenters : null;
    if (cells) {
      for (const p of cells) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    } else {
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

    this.syncCoinHudCompact?.(rawCoins);

    const lvl = Number(p.level ?? 1);
    const xp = Number(p.xp ?? 0);

    // сколько нужно до следующего уровня (берём с shared через импорт)
    const need = (lvl >= this.kingMaxLevel) ? 0 : (this.kingXpCost?.[lvl] ?? 0); // см. пункт 6 ниже

    if (this.kingLevelText) this.kingLevelText.setText(`${lvl}`);

    if (this.kingLevelXpText) {
      this.kingLevelXpText.setText(need > 0 ? `Exp: ${xp} / ${need}` : 'Max');
      this.kingLevelXpText.setVisible(this.kingLevelExpanded);
    }

    this.drawKingXpBar?.(lvl, xp, need);
    this.positionCoinsHUD();

    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;

    const e = kings?.enemy ?? { hp: 100, maxHp: 100, coins: 0, visible: false };
    const enemyVisualKey = String(e.visualKey ?? 'king');
    if (this.kingRight && this.textures?.exists?.(enemyVisualKey) && this.kingRight.texture?.key !== enemyVisualKey) {
      this.kingRight.setTexture(enemyVisualKey);
      this.kingRight.setDisplaySize(this.kingWidth, this.kingHeight);
    }
    const enemyDisplayName = String(e.name ?? ENEMY_KING_DISPLAY_NAME);
    this.kingRightNameText?.setText(enemyDisplayName);

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

    this.roundText.setText(this.testSceneActive ? UI_TEXT.TEST_SCENE : `${UI_TEXT.ROUND} ${round}`);

    // таймер показываем только в prep и пока нет результата
    const isPrep = (phase === 'prep') && (result == null);
    const isBattle = (phase === 'battle') && (result == null);

    if (isPrep) {
      const t = Number(this.battleState?.prepSecondsLeft ?? 0);
      if (t > 0) {
        const ss = String(Math.max(0, Math.min(59, t))).padStart(2, '0');
        this.prepTimerText.setVisible(true);
        this.prepTimerText.setText(`${UI_TEXT.PREP}: ${ss}с`);
      } else {
        this.prepTimerText.setVisible(false);
      }
    } else if (isBattle) {
      const t = Number(this.battleState?.battleSecondsLeft ?? 0);
      const ss = String(Math.max(0, Math.min(59, t))).padStart(2, '0');
      this.prepTimerText.setVisible(true);
      this.prepTimerText.setText(`${UI_TEXT.BATTLE}: ${ss}с`);
    } else {
      this.prepTimerText.setVisible(false);
    }

    // Кнопка "Начать игру" видна только в предстарте:
    // round 1, фаза prep, нет активных таймеров и нет результата.
    if (this.startGameBtn) {
      if (this.testSceneActive) {
        this.startGameBtn.setVisible(false);
        this.positionDebugUI?.();
        return;
      }

      const phase = this.battleState?.phase ?? 'prep';
      const result = this.battleState?.result ?? null;
      const round = Number(this.battleState?.round ?? 1);
      const prepLeft = Number(this.battleState?.prepSecondsLeft ?? 0);
      const battleLeft = Number(this.battleState?.battleSecondsLeft ?? 0);

      const started = Boolean(this.battleState?.gameStarted) ||
        round !== 1 ||
        phase !== 'prep' ||
        result != null ||
        prepLeft > 0 ||
        battleLeft > 0;

      this.startGameBtn.setVisible(!started);
    }

    // Кнопка "БОЙ" позиционируется относительно фактической ширины roundText.
    // После смены текста (например, "Раунд 1" -> "Раунд 2") перепривязываем debug UI сразу,
    // чтобы не ждать resize/fullscreen события.
    this.positionDebugUI?.();
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

    // центр бара (нужен для exp-текста и hitbox)
    const cx = x + w / 2;
    const cy = y + h / 2;
    const doubleDigitOffsetX = Number(level > 9 ? (this.kingLevelTextDoubleDigitOffsetX ?? 0) : 0);
    const crownTextX = Number(this.kingLevelIcon?.x ?? 0) + Number(this.kingLevelTextOffsetX ?? 0) + doubleDigitOffsetX;
    const crownTextY = Number(this.kingLevelIcon?.y ?? 0) + Number(this.kingLevelTextOffsetY ?? 0);
    this.kingLevelText.setPosition(crownTextX, crownTextY);

    // Exp рисуем ПОВЕРХ полоски (в центре), когда блок раскрыт
    this.kingLevelXpText.setOrigin(0.5, 0.5);
    this.kingLevelXpText.setPosition(cx, cy);

    const hitH = 44;

    // ширина: иконка (половина слева) + бар + запас
    const hitW = (iconW / 2) + w + 16;

    // Exp теперь поверх бара, поэтому центр hit-зоны не смещаем
    const hitCx = cx;
    const hitCy = 0;

    this.kingLevelHit.setPosition(hitCx, hitCy);
    this.kingLevelHit.setSize(hitW, hitH);
  }

  drawCoinBar(coins, maxCoins) {
    if (!this.coinBarBg || !this.coinBarFill) return;

    // ? идентичные размеры как у XP-бара
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

  syncCoinHudCompact(coins) {
    if (!this.kingLeftCoinIcon || !this.kingLeftCoinText) return;

    const rawCoins = Math.max(0, Number(coins ?? 0));
    this.kingLeftCoinText.setText(`${rawCoins}`);

    const iconW = this.kingLeftCoinIcon?.displayWidth ?? this.coinSize ?? 28;
    const textGap = 8;
    const textX = (iconW / 2) + textGap;
    const isAtCoinMax = rawCoins >= Number(this.coinMax ?? 100);
    const textW = Number(this.kingLeftCoinText.width ?? 0);
    this.kingLeftCoinText.setPosition(textX, 0);
    if (this.kingLeftCoinMaxText) {
      this.kingLeftCoinMaxText.setVisible(isAtCoinMax);
      this.kingLeftCoinMaxText.setPosition(textX + (textW / 2), 14);
    }

    if (this.coinHit) {
      const left = -(iconW / 2);
      const right = textX + textW;
      const padX = 8;
      const hitW = Math.max(64, Math.ceil((right - left) + padX * 2));
      const hitH = isAtCoinMax ? 52 : 44;
      const hitCx = Math.round((left + right) / 2);
      this.coinHit.setPosition(hitCx, isAtCoinMax ? 4 : 0);
      this.coinHit.setSize(hitW, hitH);
    }
  }

  getUnitScreenAnchor(coreUnitLike, fallbackVu = null) {
    if (!coreUnitLike && !fallbackVu) return null;

    const type = coreUnitLike?.type ?? fallbackVu?.type ?? null;
    const lift = getUnitGroundLiftPx(type);

    if ((coreUnitLike?.zone === 'bench') || (!coreUnitLike && fallbackVu)) {
      const slot = Number.isInteger(coreUnitLike?.benchSlot)
        ? coreUnitLike.benchSlot
        : (Number.isInteger(fallbackVu?.benchSlot) ? fallbackVu.benchSlot : null);

      if (slot != null) {
        const p = this.benchSlotToScreen(slot);
        return { x: p.x, y: p.y, artX: p.x + getUnitArtOffsetXPx(type), artY: p.y + this.hexSize - lift };
      }
    }

    if (coreUnitLike && coreUnitLike.zone === 'board') {
      const p = this.hexToPixel(coreUnitLike.q, coreUnitLike.r);
      const g = this.hexToGroundPixel(coreUnitLike.q, coreUnitLike.r, lift);
      return { x: p.x, y: p.y, artX: g.x + getUnitArtOffsetXPx(type), artY: g.y };
    }

    if (fallbackVu?.sprite) {
      const x = fallbackVu.sprite.x;
      const y = fallbackVu.sprite.y;
      return { x, y, artX: x + getUnitArtOffsetXPx(type), artY: y + this.hexSize - lift };
    }

    return null;
  }

  setUnitVisualFacingTowardX(vu, targetX) {
    if (!vu?.art?.active) return;

    const currentX = Number(vu.art.x ?? vu.sprite?.x ?? 0);
    const dx = Number(targetX) - currentX;
    if (!Number.isFinite(dx) || Math.abs(dx) < 1) return;

    // Атласы в текущем проекте по умолчанию смотрят вправо.
    vu.art.setFlipX(dx < 0);
  }

  faceUnitVisualTowardCoreUnit(vu, targetCoreUnit) {
    if (!vu || !targetCoreUnit) return;
    const targetPos = this.getUnitScreenAnchor(targetCoreUnit);
    if (!targetPos) return;
    this.setUnitVisualFacingTowardX(vu, targetPos.artX ?? targetPos.x);
  }

  findClosestOpponentForFacing(sourceCoreUnit) {
    if (!sourceCoreUnit || sourceCoreUnit.dead || sourceCoreUnit.zone !== 'board') return null;
    const enemyTeam = sourceCoreUnit.team === 'player' ? 'enemy' : 'player';

    let best = null;
    let bestDist = Infinity;

    for (const u of (this.battleState?.units ?? [])) {
      if (!u || u.dead) continue;
      if (u.zone !== 'board') continue;
      if (u.team !== enemyTeam) continue;

      const d = hexDistance(sourceCoreUnit.q, sourceCoreUnit.r, u.q, u.r);
      if (d < bestDist) {
        bestDist = d;
        best = u;
      }
    }

    return best;
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
    this.coreUnitsById = new Map((this.battleState?.units ?? []).map((u) => [u.id, u]));

    // 1) кого оставляем
    const phase = this.battleState?.phase ?? 'prep';

    // в обычном prep скрываем enemy, в test scene prep показываем всех
    const visibleUnits = [];
    const aliveIds = new Set();
    for (const u of (this.battleState?.units ?? [])) {
      if (!this.testSceneActive && phase === 'prep' && u.team === 'enemy') continue;
      visibleUnits.push(u);
      aliveIds.add(u.id);
    }

    // Visual-only merge effect: before deleting vanished units, animate 2 donors flying into upgraded unit.
    this.detectAndAnimateClientMerges(visibleUnits);

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
    // Локальный occupied иногда рассинхронизируется после сложных переходов (bench/board/result/test).
    // Перед CREATE-проходом пересобираем его из текущих визуалов на доске, чтобы не получать ложный "occupied".
    if (this.unitSys?.state) {
      this.unitSys.state.occupied = new Set(
        (this.unitSys.state.units ?? [])
          .filter((vu) =>
            vu &&
            aliveIds.has(vu.id) &&
            vu.zone === 'board' &&
            Number.isFinite(vu.q) &&
            Number.isFinite(vu.r)
          )
          .map((vu) => `${vu.q},${vu.r}`)
      );
    }

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
            label: getUnitShortLabel(u.type),
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
            label: getUnitShortLabel(u.type),
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

        // если сервер сказал "bench" — сразу переставим на скамейку
        if (u.zone === 'bench') {
          const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
          const p = this.benchSlotToScreen(slot);

          // Визуал ушёл с доски на bench: освобождаем его старую клетку в локальном occupied,
          // иначе следующие спавны/создания визуалов на этой клетке могут падать с "occupied".
          if (created.zone === 'board') {
            this.unitSys.state.occupied?.delete?.(`${created.q},${created.r}`);
          }
          created.zone = 'bench';
          created.benchSlot = slot;

          created.sprite.setPosition(p.x, p.y);
          created.label?.setPosition(p.x, p.y);
          created.dragHandle?.setPosition(p.x, p.y);
          const lift = getUnitGroundLiftPx(u.type);
          created.art?.setPosition(p.x + getUnitArtOffsetXPx(u.type), p.y + this.hexSize - lift);

          // на скамейке hpBar не показываем
          if (created.hpBar) created.hpBar.setVisible(false);
          if (created.rankIcon) created.rankIcon.setVisible(!u.dead);
          if (created) updateHpBar(this, created);
        } else {
          created.zone = 'board';
          created.benchSlot = null;
          // Новый юнит может появиться сразу на поле из магазина в prep:
          // сразу выставляем корректную видимость hp/rank, чтобы не мигал HP-бар.
          if (created.hpBar) created.hpBar.setVisible(phase !== 'prep');
          if (created.rankIcon) created.rankIcon.setVisible((phase === 'prep') && !u.dead);
          updateHpBar(this, created);
        }

        byId.set(created.id, created);
        this.unitSys.setUnitDead?.(u.id, !!u.dead);

        // Фидбэк покупки: новый купленный юнит появляется на скамейке с лёгким bounce.
        if (u.team === 'player' && u.zone === 'bench' && !u.dead) {
          this.playUnitFeedbackBounce?.(created, { scaleMul: 1.06, duration: 90 });
        }

        continue;
      }

      // ---- UPDATE ----
      const vu = existing;

      // Пока юнит в локальном drag, не пересаживаем его визуал из state.
      if (this.draggingUnitId != null && String(u.id) === String(this.draggingUnitId)) {
        continue;
      }

      // позиция: доска или скамейка
      if (u.zone === 'bench') {
        const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
        const p = this.benchSlotToScreen(slot);

        if (vu.zone === 'board') {
          this.unitSys.state.occupied?.delete?.(`${vu.q},${vu.r}`);
        }
        vu.zone = 'bench';
        vu.benchSlot = slot;

        if (vu?.sprite) vu.sprite.setPosition(p.x, p.y);
        if (vu?.dragHandle) vu.dragHandle.setPosition(p.x, p.y);
        const lift = getUnitGroundLiftPx(u.type);
        if (vu?.art) vu.art.setPosition(p.x + getUnitArtOffsetXPx(u.type), p.y + this.hexSize - lift);
        if (vu?.label) vu.label.setPosition(p.x, p.y);

        if (vu?.hpBar) vu.hpBar.setVisible(false);
        if (vu?.rankIcon) vu.rankIcon.setVisible(!u.dead);
      } else {
        const result = this.battleState?.result ?? null;
        // серверный tick в бою сейчас 450мс
        const MOVE_TWEEN_MS = 380; // чуть меньше, чтобы успевал “доехать” до следующего снапшота
        const tweenMs = (phase === 'battle' && !result) ? MOVE_TWEEN_MS : 0;
        if (vu) {
          vu.zone = 'board';
          vu.benchSlot = null;
        }
        const didBoardCellChange =
          Number(vu?.q) !== Number(u.q) ||
          Number(vu?.r) !== Number(u.r);
        const shouldFaceMoveDirection = didBoardCellChange && !!vu?.art && tweenMs > 0;
        if (shouldFaceMoveDirection) {
          const lift = getUnitGroundLiftPx(u.type);
          const targetGround = this.hexToGroundPixel(u.q, u.r, lift);
          this.setUnitVisualFacingTowardX(vu, targetGround.x);
        }
        this.unitSys.setUnitPos(u.id, u.q, u.r, { tweenMs });

        // На доске показываем HP только вне prep (в prep скрываем по запросу).
        if (vu?.hpBar) vu.hpBar.setVisible(phase !== 'prep');
        if (vu?.rankIcon) vu.rankIcon.setVisible((phase === 'prep') && !u.dead);
      }

      if (vu) vu.rank = u.rank ?? 1;

      // HP
      this.unitSys.setUnitHp(u.id, u.hp, u.maxHp ?? existing.maxHp);
      this.unitSys.setUnitDead?.(u.id, !!u.dead);

      // draggable всем юнитам игрока в prep + обновление буквы
      if (vu?.label) {
        vu.label.setText(getUnitShortLabel(u.type));
      }

    }

    // ? sync unit anims by phase/zone (+ attack pulses from server attackSeq)
    const result = this.battleState?.result ?? null;
    if (this.pendingAttackAnimIds?.size) {
      for (const id of this.pendingAttackAnimIds) {
        const vu = byId.get(id);
        if (!vu?.art) continue;
        const attackerCore = (this.battleState?.units ?? []).find((x) => x.id === id) ?? null;
        const targetCore = this.findClosestOpponentForFacing(attackerCore);
        this.faceUnitVisualTowardCoreUnit(vu, targetCore);
        vu._attackAnimPlaying = true;
        vu._attackAnimForceReplay = true;
      }
      this.pendingAttackAnimIds.clear();
    }

    for (const u of (this.battleState?.units ?? [])) {
      // в prep враги скрыты, но это не важно — просто синкаем тех, кто есть
      const vu = byId.get(u.id);
      if (!vu?.art) continue;
      if (this.draggingUnitId != null && String(u.id) === String(this.draggingUnitId)) continue;
      const animDef = UNIT_ANIMS_BY_TYPE[u.type];
      if (!animDef) continue;

      // Вне активного боя возвращаем базовый разворот спрайта:
      // player смотрит вправо, enemy — влево.
      if ((phase !== 'battle') || !!result) {
        vu.art.setFlipX(u.team === 'enemy');
      }

      const wantWalk =
        (phase === 'battle') &&
        !result &&
        (u.zone === 'board') &&
        !u.dead &&
        !!vu._moveTween;
      const wantAttack =
        !u.dead &&
        (phase === 'battle') &&
        !result &&
        (u.zone === 'board') &&
        this.anims.exists(animDef.attack) &&
        !!vu._attackAnimPlaying;
      const animKey = u.dead ? animDef.dead : (wantAttack ? animDef.attack : (wantWalk ? animDef.walk : animDef.idle));
      const forceReplayAttack = wantAttack && !!vu._attackAnimForceReplay;

      // не дёргаем play каждый тик/рендер если уже играет то же самое
      if (!forceReplayAttack && vu.art.anims?.getName?.() === animKey) continue;

      if (this.anims.exists(animKey)) {
        vu.art.play(animKey, true);
        if (forceReplayAttack) {
          vu._attackAnimForceReplay = false;
          vu.art.once(`animationcomplete-${animDef.attack}`, (anim) => {
            if (!vu?.art?.active) return;
            if (anim?.key !== animDef.attack) return;
            vu._attackAnimPlaying = false;
            vu._attackAnimForceReplay = false;

            // Между state-снапшотами (особенно в test scene) renderFromState может не вызываться,
            // поэтому вручную возвращаем юнита в idle/walk сразу после завершения атаки.
            const latest = (this.battleState?.units ?? []).find((x) => x.id === u.id);
            if (!latest || latest.dead) return;

            const latestPhase = this.battleState?.phase ?? 'prep';
            const latestResult = this.battleState?.result ?? null;
            const shouldWalk =
              (latestPhase === 'battle') &&
              !latestResult &&
              (latest.zone === 'board') &&
              !!vu._moveTween;

            const fallbackAnimKey = shouldWalk ? animDef.walk : animDef.idle;
            if (!this.anims.exists(fallbackAnimKey)) return;
            if (vu.art.anims?.getName?.() === fallbackAnimKey) return;
            vu.art.play(fallbackAnimKey, true);
          });
        }
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

      // ? таймер скрываем, результат показываем вместо него
      this.prepTimerText?.setVisible(false);
      this.resultText?.setVisible(true);

      let text = '';
      let fill = '#ffffff';
      let stroke = '#666666';

      if (result === 'victory') {
        text = UI_TEXT.VICTORY;
        fill = '#f5c542';      // золотистый
        stroke = '#c89b1e';    // характерная золотая обводка
      }
      else if (result === 'defeat') {
        text = UI_TEXT.DEFEAT;
        fill = '#ff6fa8';      // розовый
        stroke = '#7a002f';    // бордовая обводка
      }
      else if (result === 'draw') {
        text = UI_TEXT.DRAW;
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
    this.positionDebugUI?.();

    // drag управляется в renderFromState(): всем player-юнитам в prep
  }

  // ===== Drawing =====
  rebuildGridCaches() {
    const allBoard = [];
    const prepBoard = [];

    for (let row = 0; row < this.gridRows; row++) {
      for (let col = 0; col < this.gridCols; col++) {
        const q = col - Math.floor(row / 2);
        const r = row;
        const p = this.hexToPixel(q, r);
        const entry = { q, r, row, col, x: p.x, y: p.y };
        allBoard.push(entry);
        if (col < 6) prepBoard.push(entry);
      }
    }

    const leftTop = this.hexToPixel(0 - Math.floor(0 / 2), 0);
    const benchOriginX = leftTop.x - this.benchGap;
    const dx = (this.originX - benchOriginX);

    const benchCells = [];
    const benchSlots = [];
    for (let row = 0; row < this.benchRows; row++) {
      const q = 0 - Math.floor(row / 2);
      const r = row;
      const p = this.hexToPixel(q, r);
      const bx = p.x - dx;
      const by = p.y;
      const entry = { row, col: 0, x: bx, y: by };
      benchCells.push(entry);
      benchSlots[row] = { x: bx, y: by };
    }

    this.cachedBoardHexCenters = allBoard;
    this.cachedPrepBoardHexCenters = prepBoard;
    this.cachedBenchHexCenters = benchCells;
    this.cachedBenchSlotScreen = benchSlots;
  }

  drawHexOn(g, cx, cy, lineColor = 0xffffff, alpha = 0.5) {
    const pts = this.hexCorners(cx, cy);
    g.lineStyle(1, lineColor, alpha);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.strokePath();
  }

  drawHex(cx, cy, lineColor = 0xffffff, alpha = 0.5) {
    this.drawHexOn(this.gDynamic, cx, cy, lineColor, alpha);
  }

  drawHexFilledOn(g, cx, cy, fillColor = 0x000000, fillAlpha = 0.25) {
    const pts = this.hexCorners(cx, cy);
    g.fillStyle(fillColor, fillAlpha);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
    g.fillPath();
  }

  drawHexFilled(cx, cy, fillColor = 0x000000, fillAlpha = 0.25) {
    this.drawHexFilledOn(this.gDynamic, cx, cy, fillColor, fillAlpha);
  }

  drawGridStatic() {
    const g = this.gStatic ?? this.g;
    g.clear();

    if (this.battleState?.phase === 'prep') {
      const prepCells = this.testSceneActive ? (this.cachedBoardHexCenters ?? []) : (this.cachedPrepBoardHexCenters ?? []);
      for (const cell of prepCells) {
        this.drawHexOn(g, cell.x, cell.y, 0xffffff, 0.35);
      }
    }

    for (const cell of (this.cachedBenchHexCenters ?? [])) {
      this.drawHexOn(g, cell.x, cell.y, 0xffcc66, 0.45);
    }

    this.gridStaticDirty = false;
  }

  drawGridDynamic() {
    const g = this.gDynamic ?? this.g;
    g.clear();

    // затемнение занятых гексов (доска + скамейка)
    for (const u of (this.battleState?.units ?? [])) {
      // в prep врагов не затемняем (они скрыты)
      if (!this.testSceneActive && this.battleState?.phase === 'prep' && u.team === 'enemy') continue;
      if (u.dead) continue;

      if (u.zone === 'board') {
        // ? в prep не рисуем тени в скрытых колонках
        if (!this.testSceneActive && this.battleState?.phase === 'prep') {
          const col = u.q + Math.floor(u.r / 2);
          if (col >= 6) continue;
        }

        const p = this.hexToPixel(u.q, u.r);
        this.drawHexFilledOn(g, p.x, p.y, 0x000000, 0.35);
        continue;
      }

      if (u.zone === 'bench') {
        const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
        const p = this.benchSlotToScreen(slot);
        this.drawHexFilledOn(g, p.x, p.y, 0x000000, 0.35);
        continue;
      }
    }

    if (this.dragBoardHover && this.battleState?.phase === 'prep' && !this.battleState?.result) {
      const p = this.hexToPixel(this.dragBoardHover.q, this.dragBoardHover.r);
      this.drawHexFilledOn(g, p.x, p.y, 0x000000, 0.55);
      this.drawHexOn(g, p.x, p.y, 0xffffff, 0.85);
    }
    if (Number.isInteger(this.dragBenchHoverSlot) && this.battleState?.phase === 'prep' && !this.battleState?.result) {
      const p = this.benchSlotToScreen(this.dragBenchHoverSlot);
      this.drawHexFilledOn(g, p.x, p.y, 0x000000, 0.55);
      this.drawHexOn(g, p.x, p.y, 0xffcc66, 0.95);
    }

    // выделение
    if (this.selected?.area === 'board') {
      const p = this.hexToPixel(this.selected.q, this.selected.r);
      this.drawHexOn(g, p.x, p.y, 0x00ffcc, 1.0);
    }

    if (this.selected?.area === 'bench') {
      const { x, y } = this.selected.screen;
      this.drawHexOn(g, x, y, 0xffcc66, 1.0);
    }
  }

  drawGrid() {
    if (this.gridStaticDirty) this.drawGridStatic();
    this.drawGridDynamic();
  }

  benchSlotToScreen(slot) {
    const cached = this.cachedBenchSlotScreen?.[slot];
    if (cached) return cached;

    const leftTop = this.hexToPixel(0 - Math.floor(0 / 2), 0);
    const benchOriginX = leftTop.x - this.benchGap;
    const dx = (this.originX - benchOriginX);
    const row = slot; // слот = ряд (0..7)
    const p = this.hexToPixel(0 - Math.floor(row / 2), row);
    return { x: p.x - dx, y: p.y };
  }

  showCoinInfoPopup() {
    if (this.coinInfoOpen) return;
    this.coinInfoOpen = true;

    // --- математика (как на сервере) ---
    const round = Number(this.battleState?.round ?? 1);
    const winStreak = Number(this.battleState?.winStreak ?? 0);
    const loseStreak = Number(this.battleState?.loseStreak ?? 0);

    const coinsNow = Number(this.battleState?.kings?.player?.coins ?? 0);

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
    lines.push(`${UI_TEXT.COIN_INCOME}: +${base + interest}`);
    lines.push(`${UI_TEXT.WIN_BONUS}: +${winBonus}`);

    // показываем win streak, если он начнётся со следующей победой (2 подряд) ИЛИ уже идёт (>=3)
    if (winStreak >= 2) {
      const txt = (winStreak >= 3)
        ? `${UI_TEXT.WIN_STREAK_BONUS}: +${streakBonus(winStreak)}`
        : `${UI_TEXT.WIN_STREAK_BONUS}: +${streakBonus(3)} ${UI_TEXT.FROM_NEXT_WIN}`;
      lines.push(txt);
    }

    // показываем lose streak аналогично
    if (loseStreak >= 2) {
      const txt = (loseStreak >= 3)
        ? `${UI_TEXT.LOSE_STREAK_BONUS}: +${streakBonus(loseStreak)}`
        : `${UI_TEXT.LOSE_STREAK_BONUS}: +${streakBonus(3)} ${UI_TEXT.FROM_NEXT_LOSS}`;
      lines.push(txt);
    }

    lines.push(`${UI_TEXT.EXPECTED_ROUND_INCOME}: +${expected}`);

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

installBattleSceneDrag(BattleScene);
installBattleSceneShopUi(BattleScene);
installBattleSceneTestScene(BattleScene);
installBattleSceneDebugUi(BattleScene);


