import Phaser from 'phaser';
import { hexToPixel, pixelToHex, hexCorners, hexToGroundPixel } from '../game/hex.js';
import { createUnitSystem } from '../game/units.js';
import { boardDepth } from '../game/depthOrder.js';
import { getKingHpBarOffsetXPx, getKingHpBarOffsetYPx, getKingOffsetXPx, getKingOffsetYPx, getKingShadowConfig, getKingSizePx } from '../game/kingVisualConfig.js';
import { getUnitArtOffsetXPx, getUnitFootShadowConfig, getUnitGroundLiftPx } from '../game/unitVisualConfig.js';
import {
  atlasFramePrefix,
  atlasIdleFrame,
  atlasDeadFrame,
  atlasIdleAttackFrame,
  atlasSkillFrame,
  atlasWalkFirstFrame,
  atlasWalkFallbackFrame,
  atlasWalkFrameRegex,
  atlasAttackFallbackFrame,
  atlasAttackFrameRegex,
  atlasSpellFrameRegex,
  UNIT_ATLAS_DEFS,
  UNIT_ATLAS_DEF_BY_TYPE,
  UNIT_ANIMS_BY_TYPE,
} from '../game/unitAtlasConfig.js';
import { getPreparedAttackConfig } from '../../shared/preparedAttackConfig.js';
import { STEP_MOVE_TRAVEL_MS, getStepMoveWaitMs } from '../../shared/stepMovementConfig.js';
import { WSClient } from '../net/wsClient.js';
import { createFullscreenButton, positionFullscreenButton } from '../game/ui.js';
import { updateHpBar } from '../game/hpbar.js';

import { createBattleState, KING_XP_COST, KING_MAX_LEVEL, hexDistance } from '../../shared/battleCore.js';
import { installBattleSceneDrag } from './battleScene/dragController.js';
import { installBattleSceneShopUi } from './battleScene/shopUi.js';
import { installBattleSceneTestScene } from './battleScene/testScene.js';
import { installBattleSceneDebugUi } from './battleScene/debugUi.js';
import { installBattleSceneKingDamageFx } from './battleScene/kingDamageFx.js';
import { installBattleSceneKingHudUi } from './battleScene/kingHudUi.js';
import { installBattleSceneStateSync } from './battleScene/stateSync.js';
import { installBattleSceneLifecycle } from './battleScene/lifecycle.js';
import {
  PLAYER_KING_DISPLAY_NAME,
  ENEMY_KING_DISPLAY_NAME,
  UI_TEXT,
  ABILITY_KIND_LABEL,
  ABILITY_DESC_BY_KEY,
} from './battleScene/battleText.js';
import { getUnitCellSpanX, getBoardCellsForUnit } from './battleScene/unitFootprint.js';

const EXTRA_PORTRAIT_ASSETS = [
  { key: 'black_knight', path: '/assets/kings/black_knight.png' },
  { key: 'black_pawn', path: '/assets/kings/black_pawn.png' },
  { key: 'white_knight', path: '/assets/kings/white_knight.png' },
  { key: 'white_pawn', path: '/assets/kings/white_pawn.png' },
  { key: 'king_frog', path: '/assets/kings/king_frog.png' },
  { key: 'king_king', path: '/assets/kings/king_king.png' },
  { key: 'king_princess', path: '/assets/kings/king_princess.png' },
];

const SHOP_OFFER_COUNT = 5;
const SHOP_CARD_ART_LIFT_Y = 75; // увеличивай/уменьшай, чтобы поднять/опустить арт в сером блоке карточки
const AUTO_ENTER_TEST_SCENE_ON_BOOT = false; // обычный старт: live battle scene
const USE_SERVER_BATTLE_REPLAY = true; // постепенный переход: клиент проигрывает precomputed battleReplay от сервера
const KNIGHT_CHARGE_MOVE_ANIM = 'knight_charge_move';
const KING_XP_BUY_GAIN = 4;
const KING_XP_BUY_COST = 4;
const KING_UI = {
  hpBar: {
    width: 95,
    height: 10,
    radius: 6,
    yOffset: 10,
    bgColor: 0x1c1c1c,
    bgAlpha: 0.96,
    lagColor: 0xc29b4a,
    lagAlpha: 1,
    fillColor: 0x76c56f,
    fillAlpha: 0.95,
    frameColor: 0x5a5a5a,
    frameAlpha: 0.85,
    pixelFrameColor: 0x4a4a4a,
    pixelFrameAlpha: 0.82,
    highlightColor: 0xffffff,
    highlightAlpha: 0.14,
  },
  hpLagSpeed: 18,
};
const KING_XP_BAR_UI = {
  width: 138,            // ширина XP-бара
  height: 14,            // высота XP-бара
  radius: 6,             // скругление
  xOffset: -3,            // смещение бара по X (влево/вправо)
  yOffset: 5,            // смещение бара по Y (вверх/вниз)
  fillColor: 0xc9a7ff,   // светло-фиолетовая заливка
  fillAlpha: 0.95,
};

const INFO_PORTRAIT_ATLAS_KEY = 'unitPortraitsAtlas';
const INFO_PORTRAIT_FRAME_PREFIX = 'ALL PORTRAITS/PREPEARE for Atlas/';
const INFO_PORTRAIT_TYPE_ALIASES = {
  Swordsman: 'swordman',
};

const UNIT_INFO_MODAL_MIN_W = 280;
const UNIT_INFO_MODAL_MAX_W = 440;
const UNIT_INFO_MODAL_H = 286;
const INFO_FIGURE_ICON_BY_POWER_TYPE = {
  'Пешка': 'figure_pawn_shine',
  'Конь': 'figure_knight_shine',
  'Слон': 'figure_bishop_shine',
  'Ладья': 'figure_rook_shine',
  'Ферзь': 'figure_queen_shine',
  PAWN: 'figure_pawn_shine',
  KNIGHT: 'figure_knight_shine',
  BISHOP: 'figure_bishop_shine',
  ROOK: 'figure_rook_shine',
  QUEEN: 'figure_queen_shine',
};
const MISS_HINT_TEXT = 'miss';
const MISS_HINT_RISE_PX = 34;
const MISS_HINT_DURATION_MS = 520;
const MISS_HINT_THROTTLE_MS = 200;
const COUNTER_HINT_TEXT = 'COUNTER';
const COUNTER_HINT_RISE_PX = 28;
const COUNTER_HINT_DURATION_MS = 560;
const COUNTER_HINT_POP_IN_MS = 120;
const COUNTER_HINT_SETTLE_MS = 90;
const COUNTER_HINT_START_SCALE = 0.72;
const COUNTER_HINT_PEAK_SCALE = 1.14;
const SWORDSMAN_COUNTER_WINDOW_DEFAULT_MS = 500;
const CROSSBOWMAN_TRAIL_ALPHA = 0.18;
const CROSSBOWMAN_TRAIL_WIDTH_PX = 6;
const CROSSBOWMAN_TRAIL_MAX_LENGTH_PX = 144;
const ILLUSION_ART_ALPHA = 0.8;
const ILLUSION_MASK_ALPHA = 0.26;
const ILLUSION_MASK_COLOR = 0x5fa8ff;
const TRASH_ICON_CLOSED_KEY = 'trash_close';
const TRASH_ICON_OPEN_KEY = 'trash_open';
const TRASH_ICON_SCALE = 0.33;
const TRASH_ICON_OFFSET_X_PX = -10; // pixel offset from left king center (X)
const TRASH_ICON_OFFSET_Y_PX = 220; // pixel offset from bottom edge of left king (Y)
const TRASH_ICON_DEPTH = 1700;
const TRASH_ICON_ALPHA_CLOSED = 0.9;
const TRASH_ICON_ALPHA_OPEN = 1.0;
const TRASH_COIN_BURST_COUNT = 14;
const TRASH_COIN_BURST_FLIGHT_MS_MIN = 300;
const TRASH_COIN_BURST_FLIGHT_MS_MAX = 420;
const TRASH_COIN_BURST_SCALE_START = 0.11;
const TRASH_COIN_BURST_SCALE_END = 0.035;
const TRASH_COIN_BURST_ALPHA = 0.95;
const WORM_SWALLOW_ABILITY_KEY = 'worm_swallow';
const SWORDSMAN_COUNTER_ABILITY_KEY = 'swordsman_counter';
const SWORDSMAN_COUNTER_SKILL_DEFAULT_MS = 300;
const UNIT_RECEIVE_DAMAGE_FRAME_MS = 300;
const UNIT_DAMAGE_FLASH_COLOR = 0xff5c5c;
const UNIT_DAMAGE_FLASH_ALPHA = 0.22;
const UNIT_DAMAGE_FLASH_IN_MS = 36;
const UNIT_DAMAGE_FLASH_OUT_MS = 84;
const UNIT_ATTACK_IMPACT_PULSE_SCALE_MUL = 1.1;
const UNIT_ATTACK_IMPACT_PULSE_GROW_MS = 70;
const UNIT_ATTACK_IMPACT_PULSE_SHRINK_MS = 90;
const UNIT_ATTACK_FRONTMOST_HIT_MS = 220;
const UNIT_ART_DEPTH_LIVE = 1040;
const UNIT_ART_DEPTH_DEAD = 990;
const WORM_FAT_ANIMS = {
  idle: 'worm_fat_idle',
  walk: 'worm_fat_walk',
  attack: 'worm_fat_attack',
  dead: 'worm_fat_dead',
};
const KING_RENDER_DEPTH_BASE = 1550;
const KING_SHADOW_DEPTH = KING_RENDER_DEPTH_BASE - 8;
const KING_SHADOW_ALPHA = 0.58;
const KING_SHADOW_STROKE_ALPHA = 0.28;
const KING_SHADOW_COLOR = 0x000000;
const BENCH_FOREGROUND_START_SLOT = 4; // 5th slot from top (0-based)
const BENCH_DEPTH_SLOT_STEP = 6;
const BENCH_DEPTH_BACKGROUND_BASE = KING_RENDER_DEPTH_BASE - 40;
const BENCH_DEPTH_FOREGROUND_BASE = KING_RENDER_DEPTH_BASE + 10;
const BENCH_HEX_PIN_TEXTURE_KEY = 'bench_hex_pin_grass_1';
const BENCH_HEX_PIN_CONFIG = {
  // Tune `pin1.png` here for all bench hexes:
  // - sizePx: overall image size
  // - offsetXPx: move left/right
  // - offsetYPx: move up/down
  enabled: true,
  applyToAllSlots: true,
  slot: 0,
  sizePx: 96,
  offsetXPx: -2,
  offsetYPx: 2,
  depth: 0.5,
  alpha: 1,
};
const BENCH_UNIT_VISUAL_OFFSET_Y_PX = -13; // Tune all bench unit visuals here: negative = raise units above bench hexes
const SCENE_LOAD_INTRO_TOTAL_MS = 3000;
const SCENE_LOAD_INTRO_PLAYER_KING_DELAY_MS = 0;
const SCENE_LOAD_INTRO_PLAYER_KING_TOTAL_MS = 476;
const SCENE_LOAD_INTRO_PINS_START_DELAY_MS = SCENE_LOAD_INTRO_PLAYER_KING_TOTAL_MS + 44;
const SCENE_LOAD_INTRO_PIN_DROP_MS = 220;
const SCENE_LOAD_INTRO_PIN_BOUNCE_MS = 80;
const SCENE_LOAD_INTRO_PIN_STAGGER_MS = 70;
const SCENE_LOAD_INTRO_TRASH_REVEAL_GAP_MS = 60;
const SCENE_LOAD_INTRO_TRASH_DROP_MS = 220;
const SCENE_LOAD_INTRO_TRASH_BOUNCE_MS = 80;
const SCENE_LOAD_INTRO_SHOP_REVEAL_GAP_MS = 80;
const SCENE_LOAD_INTRO_HUD_REVEAL_DELAY_MS = 260;
const SCENE_LOAD_INTRO_HUD_FADE_MS = 220;
// Bench depth invariant:
// - slots 1..4 (0..3) must stay BELOW king
// - slots 5..8 (4..7) must stay ABOVE king
// - inside each group lower slot index renders below higher one (vertical painter order)

const UNIT_FUN_LINES_BY_TYPE = {
  SkeletonArcher: ['Нанимался "тихим", но гремит костями на весь ряд.', 'Стреляет метко, жалуется громко.'],
  Vampire: ['Пьет кровь, но налоги не пьет.', 'Ночной KPI всегда выше дневного.'],
  Angel: ['Летает быстро, но совесть все равно догоняет.', 'Баффает мораль одним присутствием.'],
  Devil: ['Улыбается вежливо, планирует агрессивно.', 'Подписывает сделки огнем.'],
  Knight: ['Занимает две клетки, чтобы эго тоже поместилось.', 'Влетает в бой как начальник в понедельник: громко и не по графику.'],
  NagaSiren: ['Смотрит спокойно, но в ближнем бою спорить не любит.', 'Шипит редко, попадает стабильно.'],
  default: ['В бою серьезный, вне боя делает вид, что так и задумано.', 'Если победил, значит это был "план".'],
};

// When adding a new unit VFX, always verify both facing cases:
// 1) the unit turning via art.flipX
// 2) the same unit rendered on the mirrored enemy side, including X offsets
const UNIT_FRAME_BOUND_VFX_DEFS = [
  {
    key: 'swordman_hit',
    unitType: 'Swordsman',
    atlasKey: 'hit_vfx_swordman_atlas',
    atlasPath: '/assets/units/human/swordman/vfx/hit_vfx_swordman_atlas',
    animKey: 'swordman_hit_vfx',
    firstFrame: 'hit/hit0001.png',
    frameRegex: /^hit\/hit\d{4}\.png$/,
    frameRate: 18,
    depthOffset: 0.15,
    getTriggerFrameName() {
      const atlasDef = UNIT_ATLAS_DEF_BY_TYPE?.Swordsman ?? null;
      return atlasDef ? atlasAttackFallbackFrame(atlasDef) : 'psd_anim/hit.png';
    },
  },
  {
    key: 'swordman_skill',
    unitType: 'Swordsman',
    atlasKey: 'skill_vfx_swordman_atlas',
    atlasPath: '/assets/units/human/swordman/vfx/skill_vfx_swordman_atlas',
    animKey: 'swordman_skill_vfx',
    firstFrame: 'skill/skill0001.png',
    frameRegex: /^skill\/skill\d{4}\.png$/,
    frameRate: 18,
    depthOffset: 0.16,
    offsetXPx: 61,
    getTriggerFrameName() {
      const atlasDef = UNIT_ATLAS_DEF_BY_TYPE?.Swordsman ?? null;
      return atlasDef ? atlasSkillFrame(atlasDef) : 'psd_anim/skill.png';
    },
  },
];

const UNIT_FRAME_BOUND_VFX_DEFS_BY_TYPE = UNIT_FRAME_BOUND_VFX_DEFS.reduce((acc, def) => {
  const key = String(def.unitType ?? '');
  if (!key) return acc;
  if (!acc[key]) acc[key] = [];
  acc[key].push(def);
  return acc;
}, {});

function unitTypeToInfoPortraitName(type) {
  const raw = String(type ?? '').trim();
  if (!raw) return '';
  if (INFO_PORTRAIT_TYPE_ALIASES[raw]) return INFO_PORTRAIT_TYPE_ALIASES[raw];
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function infoPortraitFrameForUnitType(type) {
  const name = unitTypeToInfoPortraitName(type);
  if (!name) return '';
  return `${INFO_PORTRAIT_FRAME_PREFIX}${name}.png`;
}

function getUnitShortLabel(type) {
  const t = String(type ?? '').toLowerCase();
  if (t === 'bonesgolem' || t === 'bones_golem') return 'BG';
  if (t === 'crusader') return 'Cr';
  if (t === 'crossbowman') return 'C';
  if (t === 'angel') return 'A';
  if (t === 'devil') return 'D';
  if (t === 'ghost') return 'Gh';
  if (t === 'headless') return 'Hd';
  if (t === 'incub') return 'In';
  if (t === 'knight') return 'K';
  if (t === 'lich') return 'L';
  if (t === 'monk') return 'M';
  if (t === 'nagasiren' || t === 'naga_siren') return 'NS';
  if (t === 'priest') return 'P';
  if (t === 'simpleskeleton' || t === 'simple_skeleton') return 'SS';
  if (t === 'skeleton') return 'Sk';
  if (t === 'skeletonarcher' || t === 'skeleton_archer') return 'SA';
  if (t === 'succub') return 'Su';
  if (t === 'swordsman' || t === 'swordmen') return 'S';
  if (t === 'undertaker') return 'U';
  if (t === 'vampire') return 'V';
  if (t === 'worm') return 'W';
  if (t === 'zombie') return 'Z';
  return '?';
}

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  init(data) {
    this.autoStartRequested = Boolean(data?.autoStart);
    this.autoStartSent = false;
    this.openTestSceneRequested = Boolean(data?.openTestScene);
  }

  getUnitRuntimeKey(unitLikeOrId) {
    const rawId = (unitLikeOrId && typeof unitLikeOrId === 'object')
      ? unitLikeOrId.id
      : unitLikeOrId;
    if (rawId == null) return null;
    return String(rawId);
  }

  createUnitRuntimeState() {
    return {
      _attackAnimPlaying: false,
      _attackAnimForceReplay: false,
      _castAnimPlaying: false,
      _castAnimForceReplay: false,
      _skillFrameUntilMs: 0,
      _counterRecoveryUntilMs: 0,
      _damageFrameUntilMs: 0,
      _preparedAttackCycleUntilMs: 0,
      _preparedAttackPoseUntilMs: 0,
      _preparedAttackIdleAttack2FromMs: 0,
      _preparedAttackIdleAttack2Active: false,
      _preparedAttackFrameUntilMs: 0,
      _timedSkillFrameActive: false,
      _timedCounterRecoveryActive: false,
      _timedDamageFrameActive: false,
      _staticWalkFrameActive: false,
      _abilityCdStartAtMs: null,
      _abilityCdReadyAtMs: null,
      _abilityCdDurationMs: null,
      _abilityCdReplayAnchorMs: null,
      _abilityCdUiEnabled: false,
      _abilityCdReadyFxArmed: false,
      _abilityCdReadyFxPlayed: false,
      _abilityCdReadyFlashUntilMs: 0,
      _abilityCdLastRenderedFill: null,
      _abilityCastStartAtMs: null,
      _abilityCastEndAtMs: null,
      _abilityCastStartFill: null,
      _replayMoveTweenMs: null,
      _replayMoveAbilityKey: null,
      _replayMoveFromQ: null,
      _replayMoveFromR: null,
      _replayMoveStartAtMs: null,
      _replayMoveEndAtMs: null,
      _preparedAttackIntervalMs: 0,
      _preparedAttackHitDelayMs: 0,
      _preparedAttackHoldMs: 0,
    };
  }

  getUnitRuntime(unitLikeOrId, { create = true } = {}) {
    const key = this.getUnitRuntimeKey(unitLikeOrId);
    if (key == null) return null;
    if (!(this.unitRuntimeById instanceof Map)) this.unitRuntimeById = new Map();
    let runtime = this.unitRuntimeById.get(key) ?? null;
    if (!runtime && create) {
      runtime = this.createUnitRuntimeState();
      this.unitRuntimeById.set(key, runtime);
    }
    return runtime;
  }

  attachUnitRuntime(vu, unitLikeOrId = null) {
    if (!vu) return null;
    const runtime = this.getUnitRuntime(unitLikeOrId ?? vu?.id);
    if (runtime) vu.runtime = runtime;
    return runtime;
  }

  clearUnitRuntime(unitLikeOrId) {
    const key = this.getUnitRuntimeKey(unitLikeOrId);
    if (key == null) return;
    this.unitRuntimeById?.delete?.(key);
  }

  pruneUnitRuntime(aliveUnitIds = []) {
    if (!(this.unitRuntimeById instanceof Map)) return;
    const aliveKeys = new Set((aliveUnitIds ?? []).map((id) => String(id)));
    for (const key of this.unitRuntimeById.keys()) {
      if (!aliveKeys.has(key)) this.unitRuntimeById.delete(key);
    }
  }

  rebuildCoreUnitIndex() {
    this.coreUnitsById = new Map(
      (this.battleState?.units ?? []).map((u) => [String(u?.id), u])
    );
    return this.coreUnitsById;
  }

  getCoreUnitById(unitLikeOrId) {
    const key = this.getUnitRuntimeKey(unitLikeOrId);
    if (key == null) return null;
    return this.coreUnitsById?.get?.(key) ?? null;
  }

  preload() { //Подгружаем пулл картинок
    this.load.image('battleBg', '/assets/bg/grass.png');
    this.load.image('king', '/assets/kings/king_princess.png');
    this.load.image('coin', '/assets/icons/Coin.png');
    this.load.image('bookExp', '/assets/icons/BookExp.png');
    this.load.image('unit', '/assets/icons/unit.png');
    this.load.image('figure_pawn', '/assets/icons/figures/pawn.png');
    this.load.image('figure_knight', '/assets/icons/figures/knight.png');
    this.load.image('figure_bishop', '/assets/icons/figures/bishop.png');
    this.load.image('figure_rook', '/assets/icons/figures/rook.png');
    this.load.image('figure_queen', '/assets/icons/figures/queen.png');
    this.load.image('figure_pawn_shine', '/assets/icons/figures/pawn_shine.png');
    this.load.image('figure_knight_shine', '/assets/icons/figures/knight_shine.png');
    this.load.image('figure_bishop_shine', '/assets/icons/figures/bishop_shine.png');
    this.load.image('figure_rook_shine', '/assets/icons/figures/rook_shine.png');
    this.load.image('figure_queen_shine', '/assets/icons/figures/queen_shine.png');
    this.load.image('rank1', '/assets/icons/rank1.png');
    this.load.image('rank2', '/assets/icons/rank2.png');
    this.load.image('rank3', '/assets/icons/rank3.png');
    this.load.image('particleStar', '/assets/particles/particle_star.png');
    this.load.image('crownexp', '/assets/icons/crownexp.png');
    this.load.image('updateMarketIcon', '/assets/shop/update_market.png');
    this.load.image('lock_open', '/assets/shop/lock_open.png');
    this.load.image('lock_close', '/assets/shop/lock_close.png');
    this.load.image('shop_dice', '/assets/shop/dice.png');
    this.load.image('shop_card_power_pawn', '/assets/shop/pawn.png');
    this.load.image('shop_card_power_knight', '/assets/shop/knight.png');
    this.load.image('shop_card_power_bishop', '/assets/shop/bishop.png');
    this.load.image('shop_card_power_rook', '/assets/shop/rook2.png');
    this.load.image('shop_card_power_queen', '/assets/shop/queen.png');
    this.load.image('shop_rook_card_back', '/assets/shop/rook_back.png');
    this.load.image('shop_rook_card', '/assets/shop/rook.png');
    this.load.image('broken_arrow', '/assets/icons/broken_arrow.png');
    this.load.image(TRASH_ICON_CLOSED_KEY, '/assets/icons/trash/trash_close.png');
    this.load.image(TRASH_ICON_OPEN_KEY, '/assets/icons/trash/trash_open.png');
    this.load.image('projectile_bone', '/assets/projectiles/bone.png');
    this.load.image('projectile_bolt', '/assets/projectiles/bolt.png');
    this.load.image('shop_portrait_bones_golem', '/assets/units/undead/bones_golem/bonny_portrait.png');
    this.load.image('shop_portrait_ghost', '/assets/units/undead/ghost/ghost_portrait.png');
    this.load.image('shop_portrait_angel', '/assets/units/gods/angel/angel_portrait.png');
    this.load.image('shop_portrait_crossbowman', '/assets/units/human/crossbowman/crossbowman_portrait.png');
    this.load.image('shop_portrait_crusader', '/assets/units/human/crusader/crusader_portrait.png');
    this.load.image('shop_portrait_devil', '/assets/units/demons/devil/devis_portrait.png');
    this.load.image('shop_portrait_headless', '/assets/units/undead/headless/headless_portrait.png');
    this.load.image('shop_portrait_incub', '/assets/units/demons/incub/incub_portrait.png');
    this.load.image('shop_portrait_knight', '/assets/units/human/knight/knight_portrait.png');
    this.load.image('shop_portrait_lich', '/assets/units/undead/lich/lich_portrait.png');
    this.load.image('shop_portrait_monk', '/assets/units/lizard/monk/monk_portrait.png');
    this.load.image('shop_portrait_priest', '/assets/units/human/priest/priest_portrait.png');
    this.load.image('shop_portrait_skeleton', '/assets/units/undead/skeleton/skeleton_portrait.png');
    this.load.image('shop_portrait_skeleton_archer', '/assets/units/undead/skeleton_archer/sarcher_portrait.png');
    this.load.image('shop_portrait_siren', '/assets/units/lizard/siren/siren_portrait.png');
    this.load.image('shop_portrait_succub', '/assets/units/demons/succub/succub_portrait.png');
    this.load.image('shop_portrait_swordman', '/assets/units/human/swordman/swordman_portrait.png');
    this.load.image('shop_portrait_undertaker', '/assets/units/undead/undertaker/undertaker_portrait.png');
    this.load.image('shop_portrait_vampire', '/assets/units/undead/vampire/vampire_portrait.png');
    this.load.image('shop_portrait_worm', '/assets/units/undead/worm/worm_portrait.png');
    this.load.image('shop_portrait_zombie', '/assets/units/undead/zombie/zombie_portrait.png');
    this.load.image(BENCH_HEX_PIN_TEXTURE_KEY, '/assets/bench/grass/pin1.png');

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
    for (const def of UNIT_FRAME_BOUND_VFX_DEFS) {
      this.load.atlas(
        def.atlasKey,
        `${def.atlasPath}.png`,
        `${def.atlasPath}.json`,
      );
    }

    // дебаг загрузки: покажет ключ и URL, который не смог загрузиться
    this._loadErrorHandler = (file) => {
      console.error('[LOAD ERROR]', file?.key, file?.src);
    };
    this.load.on('loaderror', this._loadErrorHandler);
  }

  create() {
    this.cameras.main.setBackgroundColor('#1e1e1e');
    this.battleState = createBattleState();   // core state (пока пустой, ждём сервер)
    this.serverReplayPlayback = {
      active: false,
      token: 0,
      timers: [],
    };
    this.lockedPlayerBoardUnitCount = null;
    this.lastHandledServerAutoSellFxNonce = null;
    this.lastHandledServerAutoBenchFxNonce = null;
    this.pendingServerAutoSellFxIds = new Set();
    this.entryAutoBenchAnimatingIds = new Set();
    this.entryEnemyKingVisible = false;
    this.entryEnemyKingUiVisible = false;
    this.entryEnemyKingUiRevealPlayed = false;
    this.entryEnemyUnitsVisible = true;
    this.entryEnemyUnitsUiVisible = false;
    this.entryEnemyUnitsUiRevealPlayed = false;
    this.entryRevealTimers = [];
    this.trashRemoveAnimatingIds = new Set();
    this.coreUnitsById = new Map();
    this.unitRuntimeById = new Map();
    this.kingXpCost = KING_XP_COST;
    this.kingMaxLevel = KING_MAX_LEVEL;
    this.kingUi = KING_UI;
    this.kingXpBarUi = KING_XP_BAR_UI;
    this.kingXpBuyCost = KING_XP_BUY_COST;
    this.enemyKingDisplayName = ENEMY_KING_DISPLAY_NAME;
    this.uiText = UI_TEXT;
    this.useServerBattleReplay = USE_SERVER_BATTLE_REPLAY;
    this.sceneLoadIntroPlayed = false;
    this.sceneLoadIntroActive = true;
    this.sceneLoadIntroPlayerKingUiVisible = false;
    this.sceneLoadIntroHudVisible = false;
    this.sceneLoadIntroShopVisible = false;
    this.sceneLoadIntroTrashVisible = false;
    this.sceneLoadIntroGridVisible = false;
    this.sceneLoadIntroTimers = [];
    this.sceneLoadIntroPinRevealStartedSlots = new Set();
    this.sceneLoadIntroPinRevealCompletedSlots = new Set();

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

    const leftKingShadowCfg = getKingShadowConfig(this.localPlayerKingTextureKey ?? 'king_princess', {
      mirrorX: this.shouldMirrorKingVisualX?.('player', this.localPlayerKingTextureKey ?? 'king_princess'),
    });
    const rightKingShadowCfg = getKingShadowConfig('king_princess', {
      mirrorX: this.shouldMirrorKingVisualX?.('enemy', 'king_princess'),
    });

    // HP bars
    this.kingLeftHpBg = this.add.graphics().setDepth(KING_RENDER_DEPTH_BASE + 2);
    this.kingLeftHpLagFill = this.add.graphics().setDepth(KING_RENDER_DEPTH_BASE + 3);
    this.kingLeftHpFill = this.add.graphics().setDepth(KING_RENDER_DEPTH_BASE + 3);

    this.kingRightHpBg = this.add.graphics().setDepth(KING_RENDER_DEPTH_BASE + 2);
    this.kingRightHpLagFill = this.add.graphics().setDepth(KING_RENDER_DEPTH_BASE + 3);
    this.kingRightHpFill = this.add.graphics().setDepth(KING_RENDER_DEPTH_BASE + 3);

    // king hp animation state: instant value + delayed lag value (like unit hp bars)
    this.kingHpAnim = {
      player: { instant: null, lag: null },
      enemy: { instant: null, lag: null },
    };
    this.kingHpLock = { player: null, enemy: null };
    this.kingDamageFxToken = 0;

    this.kingLeftShadow = this.add.ellipse(0, 0, leftKingShadowCfg.widthPx, leftKingShadowCfg.heightPx, KING_SHADOW_COLOR, KING_SHADOW_ALPHA)
      .setStrokeStyle(3, KING_SHADOW_COLOR, KING_SHADOW_STROKE_ALPHA)
      .setDepth(KING_SHADOW_DEPTH);
    this.kingRightShadow = this.add.ellipse(0, 0, rightKingShadowCfg.widthPx, rightKingShadowCfg.heightPx, KING_SHADOW_COLOR, KING_SHADOW_ALPHA)
      .setStrokeStyle(3, KING_SHADOW_COLOR, KING_SHADOW_STROKE_ALPHA)
      .setDepth(KING_SHADOW_DEPTH);

    this.kingLeft = this.add.image(0, 0, 'king').setDepth(KING_RENDER_DEPTH_BASE);
    this.kingLeft.setDisplaySize(this.kingWidth, this.kingHeight);

    this.kingRight = this.add.image(0, 0, 'king').setDepth(KING_RENDER_DEPTH_BASE).setFlipX(true);
    this.kingRight.setDisplaySize(this.kingWidth, this.kingHeight);

    this.localPlayerKingTextureKey = 'king_princess'; // локальный override только для отображения игрока (debug)
    this.kingLeft.setTexture(this.localPlayerKingTextureKey);
    this.syncKingVisualConfig?.();
    this.kingLeft.setVisible(false).setAlpha(0);
    this.kingLeftShadow?.setVisible(false)?.setAlpha?.(0);

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
      .setShadow(0, 0, '#000000', 2, true, true);
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
    this.kingHpExpanded = {
      player: false,
      enemy: false,
    };

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
    this._hudOutsideTapHandler = (pointer, currentlyOver) => {
      const over = currentlyOver || [];

      const overLevel = this.kingLevelHit && over.includes(this.kingLevelHit);
      const overPlayerHp = this.kingLeftHpHit && over.includes(this.kingLeftHpHit);
      const overEnemyHp = this.kingRightHpHit && over.includes(this.kingRightHpHit);

      const overCoins = this.coinHit && over.includes(this.coinHit);
      const overCoinPopup = this.coinPopupHit && over.includes(this.coinPopupHit); // ? важно

      // закрытие Exp
      if (!overLevel && this.kingLevelExpanded) {
        this.kingLevelExpanded = false;
        this.kingLevelXpText?.setVisible(false);
        this.positionCoinsHUD();
      }

      if (!overPlayerHp && !overEnemyHp) {
        if (this.kingHpExpanded?.player) this.kingHpExpanded.player = false;
        if (this.kingHpExpanded?.enemy) this.kingHpExpanded.enemy = false;
        this.kingLeftHpText?.setVisible(false);
        this.kingRightHpText?.setVisible(false);
      }

      // закрытие попапа золота: закрываем только если тап НЕ по блоку золота и НЕ по самому попапу
      if (!overCoins && !overCoinPopup && this.coinInfoOpen) {
        this.hideCoinInfoPopup();
      }
    };
    this.input.on('pointerdown', this._hudOutsideTapHandler);

    // собираем в контейнер (порядок важен: bg -> fill -> text -> xpText -> hit)
    this.kingLevelContainer.add([
      this.kingLevelBarBg,
      this.kingLevelBarFill,
      this.kingLevelIcon,
      this.kingLevelText,
      this.kingLevelXpText,
      this.kingLevelHit,
    ]);

    // --- BUY XP BUTTON (+4 EXP for 4 gold) ---
    this.kingXpBuyBtn = this.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(9998);

    this.kingXpBuyBtnIcon = this.add.image(0, 0, 'bookExp')
      .setDisplaySize(50, 50)
      .setOrigin(0.5, 0.5);
    this.kingXpBuyBtnTopText = this.add.text(0, -31, `+${KING_XP_BUY_GAIN} EXP`, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '10px',
      color: '#fff0cf',
      fontStyle: 'bold',
    })
      .setOrigin(0.5, 0.5)
      .setShadow(0, 0, '#000000', 2, true, true);
    const xpBuyCostGroupX = 11;
    const xpBuyCostGroupY = 30;
    const xpBuyCostGroupScale = 1.5;
    const xpBuyCostCoinSize = 14;
    const xpBuyCostBlurCenterX = -8;
    this.kingXpBuyBtnCostBlurSoft = this.add.graphics();
    const xpBuyBlurW = 30;
    const xpBuyBlurH = 16;
    const xpBuyBlurLeft = xpBuyCostBlurCenterX - 15;
    const xpBuyBlurTop = -8;
    const xpBuyBlurSteps = 6;
    const xpBuyBlurEdgeAlpha = 0.03;
    const xpBuyBlurCenterAlpha = 0.05;
    const xpBuyBlurRadius = 7;
    for (let i = 0; i < xpBuyBlurSteps; i++) {
      const tNorm = xpBuyBlurSteps <= 1 ? 1 : (i / (xpBuyBlurSteps - 1));
      const alpha = Phaser.Math.Linear(xpBuyBlurEdgeAlpha, xpBuyBlurCenterAlpha, tNorm * tNorm);
      const inset = Math.floor((1 - tNorm) * Math.min(xpBuyBlurSteps - 1, Math.floor(Math.min(xpBuyBlurW, xpBuyBlurH) * 0.25)));
      const w = Math.max(1, xpBuyBlurW - inset * 2);
      const h = Math.max(1, xpBuyBlurH - inset * 2);
      const x = xpBuyBlurLeft + inset;
      const y = xpBuyBlurTop + inset;
      const radius = Math.max(1, xpBuyBlurRadius - Math.floor(inset * 0.5));
      this.kingXpBuyBtnCostBlurSoft.fillStyle(0x000000, alpha);
      this.kingXpBuyBtnCostBlurSoft.fillRoundedRect(x, y, w, h, radius);
    }
    this.kingXpBuyBtnCoin = this.add.image(-13, 0, 'coin')
      .setDisplaySize(xpBuyCostCoinSize, xpBuyCostCoinSize)
      .setOrigin(0.5, 0.5);
    this.kingXpBuyBtnCostText = this.add.text(-2, 0, `${KING_XP_BUY_COST}`, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '12px',
      color: '#ffd85a',
      fontStyle: 'bold',
    })
      .setOrigin(0, 0.5)
      .setStroke('#b35a00', 2)
      .setShadow(0, 0, '#000000', 2, true, true);
    this.kingXpBuyBtnCostGroup = this.add.container(xpBuyCostGroupX, xpBuyCostGroupY, [
      this.kingXpBuyBtnCostBlurSoft,
      this.kingXpBuyBtnCoin,
      this.kingXpBuyBtnCostText,
    ])
      .setScale(xpBuyCostGroupScale);
    this.kingXpBuyBtnHit = this.add.zone(0, 0, 62, 62)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });
    this.kingXpBuyBtnHit.on('pointerdown', (pointer) => {
      pointer?.event?.stopPropagation?.();
      const isPrepPhase = !this.testSceneActive && this.battleState?.phase === 'prep' && !this.battleState?.result;
      const canLevel = Number(this.battleState?.kings?.player?.level ?? 1) < Number(this.kingMaxLevel ?? KING_MAX_LEVEL);
      if (!isPrepPhase || !canLevel) return;
      if (this.kingXpBuyBtnIcon) {
        this.tweens.killTweensOf(this.kingXpBuyBtnIcon);
        const baseScaleX = this.kingXpBuyBtnIcon.scaleX;
        const baseScaleY = this.kingXpBuyBtnIcon.scaleY;
        this.kingXpBuyBtnIcon.setScale(baseScaleX, baseScaleY);
        this.tweens.add({
          targets: this.kingXpBuyBtnIcon,
          scaleX: baseScaleX * 0.96,
          scaleY: baseScaleY * 0.96,
          duration: 70,
          yoyo: true,
          ease: 'Quad.Out',
        });
      }
      const hasCoins = Number(this.battleState?.kings?.player?.coins ?? 0) >= KING_XP_BUY_COST;
      if (!hasCoins) {
        this.showKingXpBuyInsufficientHint?.();
        return;
      }
      this.ws?.sendIntentBuyXp?.();
    });
    this.kingXpBuyBtn.add([
      this.kingXpBuyBtnIcon,
      this.kingXpBuyBtnTopText,
      this.kingXpBuyBtnCostGroup,
      this.kingXpBuyBtnHit,
    ]);

    // --- UNIT CAP HUD (icon + current/max units on board) ---
    this.kingUnitCapHud = this.add.container(0, 0)
      .setScrollFactor(0)
      .setDepth(9998);
    this.kingUnitCapIcon = this.add.image(0, 0, 'unit')
      .setDisplaySize(50, 50)
      .setOrigin(0.5, 0.5);

    const unitCapTextGroupY = 30;
    const unitCapTextGroupScale = 1.5;
    this.kingUnitCapTextBg = this.add.graphics();
    this.kingUnitCapCurrentText = this.add.text(0, 0, '1', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
      .setOrigin(1, 0.5)
      .setStroke('#6e6e6e', 2)
      .setShadow(0, 0, '#000000', 2, true, true);
    this.kingUnitCapSlashMaxText = this.add.text(0, 0, '\u2009/\u20091', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
      .setOrigin(0, 0.5)
      .setStroke('#6e6e6e', 2)
      .setShadow(0, 0, '#000000', 2, true, true);
    this.kingUnitCapTextGroup = this.add.container(0, unitCapTextGroupY, [
      this.kingUnitCapTextBg,
      this.kingUnitCapCurrentText,
      this.kingUnitCapSlashMaxText,
    ]).setScale(unitCapTextGroupScale);
    this.kingUnitCapHud.add([
      this.kingUnitCapIcon,
      this.kingUnitCapTextGroup,
    ]);
    this.kingXpBuyHintText = this.add.text(0, 0, 'Не хватает', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '24px',
      color: '#ffd7d7',
      fontStyle: 'bold',
    })
      .setOrigin(0, 0.5)
      .setShadow(0, 0, '#000000', 6, true, true);
    this.kingXpBuyHintCoin = this.add.image(0, 0, 'coin')
      .setDisplaySize(24, 24)
      .setOrigin(0.5, 0.5);

    const xpBuyHintGap = 10;
    const xpBuyHintTextW = Number(this.kingXpBuyHintText.width ?? 0);
    const xpBuyHintCoinW = Number(this.kingXpBuyHintCoin.displayWidth ?? 24);
    const xpBuyHintTotalW = xpBuyHintTextW + xpBuyHintGap + xpBuyHintCoinW;
    const xpBuyHintLeftX = -xpBuyHintTotalW / 2;
    this.kingXpBuyHintText.setPosition(xpBuyHintLeftX, 0);
    this.kingXpBuyHintCoin.setPosition(xpBuyHintLeftX + xpBuyHintTextW + xpBuyHintGap + xpBuyHintCoinW / 2, 0);
    this.kingXpBuyHint = this.add.container(0, 44, [
      this.kingXpBuyHintText,
      this.kingXpBuyHintCoin,
    ])
      .setVisible(false)
      .setAlpha(0);
    this.kingXpBuyBtn.add(this.kingXpBuyHint);

    this.showKingXpBuyInsufficientHint = () => {
      if (!this.kingXpBuyHint) return;
      this.tweens.killTweensOf(this.kingXpBuyHint);
      this.kingXpBuyHint.setVisible(true).setAlpha(1).setY(44);
      this.tweens.add({
        targets: this.kingXpBuyHint,
        y: 50,
        alpha: 0,
        duration: 850,
        ease: 'Quad.Out',
        onComplete: () => {
          this.kingXpBuyHint?.setVisible(false).setY(44);
        },
      });
    };

    const hpTextStyle = { //вставляем текст НР бара короля поверх полоски
      fontFamily: 'CormorantSC-Bold, CormorantSC-SemiBold, CormorantSC-Regular, Georgia, serif',
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
    };

    this.kingLeftHpText = this.add.text(0, 0, '', hpTextStyle)
      .setDepth(KING_RENDER_DEPTH_BASE + 4)
      .setOrigin(1, 0.5)
      .setStroke('#5a5a5a', 2)
      .setShadow(0, 0, '#000000', 2, true, true)
      .setVisible(false);

    this.kingRightHpText = this.add.text(0, 0, '', hpTextStyle)
      .setDepth(KING_RENDER_DEPTH_BASE + 4)
      .setOrigin(1, 0.5)
      .setStroke('#5a5a5a', 2)
      .setShadow(0, 0, '#000000', 2, true, true)
      .setVisible(false);

    this.kingLeftHpHit = this.add.zone(0, 0, 1, 1)
      .setDepth(KING_RENDER_DEPTH_BASE + 5)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.kingLeftHpHit.on('pointerdown', (pointer) => {
      pointer?.event?.stopPropagation?.();
      const next = !Boolean(this.kingHpExpanded?.player);
      this.kingHpExpanded.player = next;
      this.kingLeftHpText?.setVisible(next);
      this.drawKingHpBars?.();
    });

    this.kingRightHpHit = this.add.zone(0, 0, 1, 1)
      .setDepth(KING_RENDER_DEPTH_BASE + 5)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.kingRightHpHit.on('pointerdown', (pointer) => {
      pointer?.event?.stopPropagation?.();
      const next = !Boolean(this.kingHpExpanded?.enemy);
      this.kingHpExpanded.enemy = next;
      this.kingRightHpText?.setVisible(next);
      this.drawKingHpBars?.();
    });

    const kingNameTextStyle = {
      fontFamily: 'CormorantSC-SemiBold, CormorantSC-Regular, Georgia, serif',
      fontSize: '15px',
      color: '#ffffff',
      fontStyle: 'bold',
    };

    this.kingLeftNameText = this.add.text(0, 0, PLAYER_KING_DISPLAY_NAME, kingNameTextStyle)
      .setDepth(KING_RENDER_DEPTH_BASE + 4)
      .setOrigin(0, 1)
      .setStroke('#5a5a5a', 1)
      .setVisible(false);

    this.kingRightNameText = this.add.text(0, 0, ENEMY_KING_DISPLAY_NAME, kingNameTextStyle)
      .setDepth(KING_RENDER_DEPTH_BASE + 4)
      .setOrigin(0, 1)
      .setStroke('#5a5a5a', 1)
      .setVisible(false);
    this.kingRightShadow.setVisible(false);



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
    this.benchHexPinSprites = [];
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
        const walkFallbackFrame = atlasWalkFallbackFrame(def);
        const hasWalkFallbackFrame = !!texture?.has?.(walkFallbackFrame);

        this.anims.create({
          key: def.walkAnim,
          frames: walkFrames.length > 0
            ? walkFrames
            : (hasWalkFallbackFrame
              ? [{ key: def.atlasKey, frame: walkFallbackFrame }]
              : [{ key: def.atlasKey, frame: atlasIdleFrame(def) }]),
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
        const attackFallbackFrame = atlasAttackFallbackFrame(def);
        const hasAttackFallbackFrame = !!texture?.has?.(attackFallbackFrame);

        this.anims.create({
          key: def.attackAnim,
          frames: attackFrames.length > 0
            ? attackFrames
            : (hasAttackFallbackFrame
              ? [{ key: def.atlasKey, frame: attackFallbackFrame }]
              : [{ key: def.atlasKey, frame: atlasIdleFrame(def) }]),
          frameRate: 12,
          repeat: 0,
        });
      }

      if (def.spellAnim && !this.anims.exists(def.spellAnim)) {
        const texture = this.textures.get(def.atlasKey);
        const spellFrames = (texture?.getFrameNames?.() ?? [])
          .filter((name) => atlasSpellFrameRegex(def).test(name))
          .sort()
          .map((frame) => ({ key: def.atlasKey, frame }));

        if (spellFrames.length > 0) {
          this.anims.create({
            key: def.spellAnim,
            frames: spellFrames,
            frameRate: 12,
            repeat: def.loopSpellAnim === true ? -1 : 0,
          });
        }
      }

      if (def.type === 'Knight' && !this.anims.exists(KNIGHT_CHARGE_MOVE_ANIM)) {
        const texture = this.textures.get(def.atlasKey);
        const moveSkillFrames = (texture?.getFrameNames?.() ?? [])
          .filter((name) => /^psd_anim\/skill\d{4}\.png$/.test(name))
          .sort()
          .map((frame) => ({ key: def.atlasKey, frame }));

        if (moveSkillFrames.length > 0) {
          this.anims.create({
            key: KNIGHT_CHARGE_MOVE_ANIM,
            frames: moveSkillFrames,
            frameRate: 14,
            repeat: -1,
          });
        }
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

    for (const def of UNIT_FRAME_BOUND_VFX_DEFS) {
      if (this.anims.exists(def.animKey)) continue;
      const texture = this.textures.get(def.atlasKey);
      const frames = (texture?.getFrameNames?.() ?? [])
        .filter((name) => def.frameRegex.test(name))
        .sort()
        .map((frame) => ({ key: def.atlasKey, frame }));
      if (frames.length <= 0) continue;
      this.anims.create({
        key: def.animKey,
        frames,
        frameRate: Number(def.frameRate ?? 18),
        repeat: 0,
      });
    }

    this.mergeAbsorbAnimatingIds = new Set(); // visual-only merge animation for disappearing units
    this.mergeBounceAnimatingIds = new Set(); // avoid stacking bounce on the same merge target
    this.pendingMergeTargetBounces = new Map(); // targetId -> { targetCoreUnit, delayMs }
    this.pendingAttackAnimIds = new Set();
    this.pendingAbilityCastAnimIds = new Set();
    this.pendingRangedBeamFx = [];
    this.rangePenaltyIcons = [];
    this.rangePenaltyIconsUsed = 0;
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

    let soloMatchId = null;
    try {
      soloMatchId = localStorage.getItem('hexochess_match_id');
      if (!soloMatchId) {
        soloMatchId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        localStorage.setItem('hexochess_match_id', soloMatchId);
      }
    } catch {
      soloMatchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    const wsUrl = `${wsProto}://${wsHost}?matchId=${encodeURIComponent(soloMatchId)}`;
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

    if (this.autoStartRequested) this.startGameBtn.setVisible(false);

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
      this.hoverPickupCell = null;

      this.renderFromState();
      this.drawGrid();
      this.syncPhaseUI();
      this.syncKingsUI();
      this.syncShopUI();
      this.refreshAllDraggable();
      this.maybeStartServerBattleReplayPlayback?.(this.battleState, { force: true });

      if (this.autoStartRequested && !this.autoStartSent) {
        this.autoStartSent = true;
        this.ws?.sendIntentStartGame?.();
      }
      if (this.openTestSceneRequested) {
        this.openTestSceneRequested = false;
        this.enterTestScene?.();
      }
    };

    this.ws.onState = (state) => this.handleServerState?.(state);
    this.ws.onTestBattleReplay = (msg) => this.handleTestSceneServerBattleReplay?.(msg);
    this.ws.onError = (err) => this.handleServerError?.(err);


    this.ws.connect();

    this.bindSceneLifecycleHandlers?.();
    this.initUnitInfoUi?.();
    this.bindDragHandlers();
    // Important for tap-vs-drag UX:
    // small pointer jitter should stay a click (open unit info), not start drag immediately.
    this.input.dragDistanceThreshold = 14;

    this.layout();
    this.drawGrid();

    this.resizeBackground(); //Вызываем арт БГ

    // UI
    createFullscreenButton(this);
    positionFullscreenButton(this);
    this.positionCoinsHUD();
    this.initTrashUi();
    this.positionTrashUi();

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
    this.maybeStartSceneLoadIntro?.();
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
    this.positionTrashUi();
  }

  initTrashUi() {
    if (this.trashIcon?.scene?.sys) return;
    this.trashIcon = this.add.image(0, 0, TRASH_ICON_CLOSED_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(TRASH_ICON_DEPTH)
      .setScale(TRASH_ICON_SCALE)
      .setAlpha(TRASH_ICON_ALPHA_CLOSED);
    this.updateTrashVisual(false);
  }

  positionTrashUi() {
    if (!this.trashIcon) return;
    if (this.kingLeft?.active) {
      this.trashIcon.setPosition(
        this.kingLeft.x + TRASH_ICON_OFFSET_X_PX,
        this.kingLeft.y + (this.kingHeight * 0.5) + TRASH_ICON_OFFSET_Y_PX
      );
      return;
    }

    // Fallback for very early lifecycle moments before king init.
    this.trashIcon.setPosition(
      90 + TRASH_ICON_OFFSET_X_PX,
      this.scale.height - 90 + TRASH_ICON_OFFSET_Y_PX
    );
  }

  updateTrashVisual(isOpen = false) {
    if (!this.trashIcon) return;
    const open = Boolean(isOpen);
    this.trashIcon.setTexture(open ? TRASH_ICON_OPEN_KEY : TRASH_ICON_CLOSED_KEY);
    this.trashIcon.setAlpha(open ? TRASH_ICON_ALPHA_OPEN : TRASH_ICON_ALPHA_CLOSED);
  }

  isPointerOverTrash(worldX, worldY) {
    if (!this.trashIcon?.active) return false;
    const b = this.trashIcon.getBounds?.();
    if (!b) return false;
    return b.contains(worldX, worldY);
  }

  playTrashRemoveFx(unitId, onComplete = null) {
    this.trashRemoveAnimatingIds = this.trashRemoveAnimatingIds ?? new Set();
    this.trashRemoveAnimatingIds.add(unitId);

    const finish = () => {
      this.trashRemoveAnimatingIds?.delete?.(unitId);
      if (typeof onComplete === 'function') onComplete();
    };

    const vu = this.unitSys?.findUnit?.(unitId);
    if (!vu || !vu.sprite?.active) {
      finish();
      return;
    }

    const tx = Number(this.trashIcon?.x ?? vu.sprite.x ?? 0);
    const ty = Number(this.trashIcon?.y ?? vu.sprite.y ?? 0);
    const targets = [
      vu.sprite,
      vu.art,
      vu.label,
    ].filter((obj) => obj?.active);

    // Never animate helpers to trash: they may be re-shown by state sync in battle phase.
    vu.footShadow?.setVisible(false);
    vu.hpBar?.setVisible(false);
    vu.rankIcon?.setVisible(false);

    if (targets.length <= 0) {
      finish();
      return;
    }

    for (const obj of targets) {
      this.tweens.killTweensOf(obj);
      obj.setDepth?.(Math.max(Number(obj.depth ?? 0), TRASH_ICON_DEPTH + 2));
    }

    this.tweens.add({
      targets,
      x: tx,
      y: ty,
      alpha: 0,
      scaleX: 0.08,
      scaleY: 0.08,
      ease: 'Cubic.In',
      duration: 170,
      onComplete: finish,
    });
  }

  playTrashCoinBurstFx() {
    if (!this.textures?.exists?.('coin')) return;
    const tx = Number(this.trashIcon?.x ?? NaN);
    const ty = Number(this.trashIcon?.y ?? NaN);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
    for (let i = 0; i < TRASH_COIN_BURST_COUNT; i++) {
      const coin = this.add.image(tx, ty, 'coin')
        .setDepth(TRASH_ICON_DEPTH + 3)
        .setScale(TRASH_COIN_BURST_SCALE_START)
        .setAlpha(TRASH_COIN_BURST_ALPHA)
        .setAngle(Phaser.Math.Between(0, 360));

      const landingX = tx + Phaser.Math.Between(-115, 115);
      const landingY = ty + Phaser.Math.Between(35, 70);
      const arcHeight = Phaser.Math.Between(35, 92);
      const flightMs = Phaser.Math.Between(TRASH_COIN_BURST_FLIGHT_MS_MIN, TRASH_COIN_BURST_FLIGHT_MS_MAX);
      const spin = Phaser.Math.Between(-420, 420);

      const arcProxy = { t: 0 };
      this.tweens.add({
        targets: arcProxy,
        t: 1,
        duration: flightMs,
        ease: 'Cubic.Out',
        onUpdate: () => {
          if (!coin.active) return;
          const t = Phaser.Math.Clamp(Number(arcProxy.t ?? 0), 0, 1);
          const x = Phaser.Math.Linear(tx, landingX, t);
          const baseY = Phaser.Math.Linear(ty, landingY, t);
          const arcY = arcHeight * 4 * t * (1 - t);
          coin.setPosition(x, baseY - arcY);
          coin.setAngle(Number(coin.angle ?? 0) + (spin / Math.max(1, flightMs)) * this.game.loop.delta);
        },
        onComplete: () => {
          if (!coin.active) return;
          const bounceH = Phaser.Math.Between(10, 24);
          const bounceDx = Phaser.Math.Between(-12, 12);
          const bounceUpMs = Phaser.Math.Between(55, 85);
          const flyToKingMs = Phaser.Math.Between(260, 360);

          this.tweens.add({
            targets: coin,
            x: landingX + bounceDx,
            y: landingY - bounceH,
            duration: bounceUpMs,
            ease: 'Quad.Out',
            onComplete: () => {
              if (!coin.active) return;
              const kingX = Number(this.kingLeft?.x ?? (this.scale?.width ?? 0) * 0.18);
              const kingY = Number(this.kingLeft?.y ?? (this.scale?.height ?? 0) * 0.72);
              const targetX = kingX + Phaser.Math.Between(-16, 16);
              const targetY = kingY + Phaser.Math.Between(22, 52);
              this.tweens.add({
                targets: coin,
                x: targetX,
                y: targetY,
                alpha: 0,
                scaleX: TRASH_COIN_BURST_SCALE_END,
                scaleY: TRASH_COIN_BURST_SCALE_END,
                duration: flyToKingMs,
                ease: 'Linear',
                onComplete: () => coin.destroy(),
              });
            },
          });
        },
      });
    }
  }

  playServerAutoSellFx(unitIds = []) {
    const ids = Array.isArray(unitIds) ? unitIds.map((id) => Number(id)).filter(Number.isFinite) : [];
    if (ids.length <= 0) return;
    this.pendingServerAutoSellFxIds = this.pendingServerAutoSellFxIds ?? new Set();
    for (const id of ids) this.pendingServerAutoSellFxIds.add(id);

    ids.forEach((unitId, idx) => {
      this.time.delayedCall(idx * 45, () => {
        const vu = this.unitSys?.findUnit?.(unitId);
        if (!vu?.sprite?.active) return;
        this.playTrashCoinBurstFx?.();
        this.playTrashRemoveFx?.(unitId, () => {
          this.unitSys?.destroyUnit?.(unitId);
          this.pendingServerAutoSellFxIds?.delete?.(unitId);
        });
      });
    });
  }

  playEntryAutoBenchArc(vu, coreUnit) {
    if (!vu || !coreUnit) return;
    const slot = Number.isInteger(coreUnit?.benchSlot) ? coreUnit.benchSlot : 0;
    const p = this.getBenchUnitScreen(slot);
    const lift = getUnitGroundLiftPx(coreUnit.type);
    const shadowCfg = getUnitFootShadowConfig(coreUnit.type);

    const startCenter = {
      x: Number(vu?.sprite?.x ?? 0),
      y: Number(vu?.sprite?.y ?? 0),
    };
    const endCenter = {
      x: Number(p.x ?? startCenter.x),
      y: Number(p.y ?? startCenter.y),
    };
    const startArt = {
      x: Number(vu?.art?.x ?? startCenter.x),
      y: Number(vu?.art?.y ?? (startCenter.y + this.hexSize - lift)),
    };
    const endArt = {
      x: Number(p.x + getUnitArtOffsetXPx(coreUnit.type, coreUnit.team)),
      y: Number(p.y + this.hexSize - lift),
    };
    const startShadow = {
      x: Number(vu?.footShadow?.x ?? (startCenter.x + shadowCfg.offsetXPx)),
      y: Number(vu?.footShadow?.y ?? (startCenter.y + shadowCfg.offsetYPx)),
    };
    const endShadow = {
      x: Number(p.x + shadowCfg.offsetXPx),
      y: Number(p.y + shadowCfg.offsetYPx),
    };

    const arcH = Math.max(28, Math.min(74, Math.abs(endCenter.x - startCenter.x) * 0.18 + 28));
    const arcProxy = { t: 0 };
    vu._entryBenchAnimating = true;

    if (vu?.hpBar) vu.hpBar.setVisible(false);
    if (vu?.rankIcon) vu.rankIcon.setVisible(!coreUnit.dead);

    const updateArc = () => {
      const t = Phaser.Math.Clamp(Number(arcProxy.t ?? 0), 0, 1);
      const arcY = arcH * 4 * t * (1 - t);

      const cx = Phaser.Math.Linear(startCenter.x, endCenter.x, t);
      const cy = Phaser.Math.Linear(startCenter.y, endCenter.y, t) - arcY;
      vu?.sprite?.setPosition?.(cx, cy);
      vu?.dragHandle?.setPosition?.(cx, cy);
      vu?.label?.setPosition?.(cx, cy);

      const ax = Phaser.Math.Linear(startArt.x, endArt.x, t);
      const ay = Phaser.Math.Linear(startArt.y, endArt.y, t) - arcY;
      vu?.art?.setPosition?.(ax, ay);

      const sx = Phaser.Math.Linear(startShadow.x, endShadow.x, t);
      const sy = Phaser.Math.Linear(startShadow.y, endShadow.y, t) - arcY * 0.6;
      vu?.footShadow?.setPosition?.(sx, sy);
      if (!coreUnit.dead) vu?.footShadow?.setVisible?.(true);
      updateHpBar(this, vu);
    };

    this.tweens.killTweensOf(arcProxy);
    this.tweens.add({
      targets: arcProxy,
      t: 1,
      duration: 500,
      ease: 'Sine.Out',
      onUpdate: updateArc,
      onComplete: () => {
        vu._entryBenchAnimating = false;
        this.entryAutoBenchAnimatingIds?.delete?.(coreUnit.id);
        updateArc();
      },
    });
  }

  clearEntryRevealTimers() {
    for (const t of (this.entryRevealTimers ?? [])) {
      try { t?.remove?.(false); } catch {}
    }
    this.entryRevealTimers = [];
  }

  stopBattleEntryReveal() {
    this.clearEntryRevealTimers();
    this.entryEnemyKingVisible = false;
    this.entryEnemyKingUiVisible = false;
    this.entryEnemyKingUiRevealPlayed = false;
    this.entryEnemyUnitsVisible = true;
    this.entryEnemyUnitsUiVisible = false;
    this.entryEnemyUnitsUiRevealPlayed = false;
  }

  clearSceneLoadIntroTimers() {
    for (const t of (this.sceneLoadIntroTimers ?? [])) {
      try { t?.remove?.(false); } catch {}
    }
    this.sceneLoadIntroTimers = [];
  }

  stopSceneLoadIntro() {
    this.clearSceneLoadIntroTimers();
    this.sceneLoadIntroActive = false;
    this.tweens.killTweensOf(this.kingLeft);
    this.tweens.killTweensOf(this.kingLeftShadow);
    this.tweens.killTweensOf(this.trashIcon);
    this.tweens.killTweensOf(this.gStatic);
    this.tweens.killTweensOf(this.gDynamic);
    for (const sprite of (this.benchHexPinSprites ?? [])) {
      this.tweens.killTweensOf(sprite);
    }
  }

  setSceneLoadIntroInputLocked(locked) {
    if (this.input) this.input.enabled = !locked;
  }

  finishSceneLoadIntro() {
    this.stopSceneLoadIntro();
    this.sceneLoadIntroPlayed = true;
    this.sceneLoadIntroHudVisible = true;
    this.sceneLoadIntroShopVisible = true;
    this.sceneLoadIntroTrashVisible = true;
    this.sceneLoadIntroGridVisible = true;
    this.sceneLoadIntroPlayerKingUiVisible = true;
    this.sceneLoadIntroPinRevealStartedSlots = new Set();
    this.sceneLoadIntroPinRevealCompletedSlots = new Set(
      Array.from({ length: Number(this.benchRows ?? 0) }, (_, idx) => idx)
        .filter((slot) => this.isBenchHexPinSlot(slot))
    );
    this.applyKingVisualConfigFor?.('player');
    this.positionKings?.();
    if (this.kingLeft?.active) {
      const baseScaleX = Number(this.kingLeft.scaleX ?? 1);
      const baseScaleY = Number(this.kingLeft.scaleY ?? 1);
      this.kingLeft
        .setVisible(true)
        .setAlpha(1)
        .setScale(baseScaleX, baseScaleY);
    }
    if (this.kingLeftShadow?.active) {
      this.kingLeftShadow
        .setVisible(true)
        .setAlpha(KING_SHADOW_ALPHA)
        .setScale(1, 1);
    }
    this.kingLeftNameText?.setVisible(true);
    this.trashIcon?.setVisible(true)?.setAlpha?.(TRASH_ICON_ALPHA_CLOSED);
    this.gStatic?.setVisible(true)?.setAlpha?.(1);
    this.gDynamic?.setVisible(true)?.setAlpha?.(1);
    this.setSceneLoadIntroInputLocked(false);
    this.syncBenchHexPinSprites?.();
    this.syncShopUI?.();
    this.syncPhaseUI?.();
    this.syncKingsUI?.();
    this.drawGrid?.();
    this.drawKingHpBars?.();
  }

  maybeStartSceneLoadIntro() {
    if (this.testSceneActive) return;
    if (this.sceneLoadIntroPlayed || (this.sceneLoadIntroTimers?.length ?? 0) > 0) return;

    this.sceneLoadIntroActive = true;
    this.sceneLoadIntroPlayerKingUiVisible = false;
    this.sceneLoadIntroHudVisible = false;
    this.sceneLoadIntroShopVisible = false;
    this.sceneLoadIntroTrashVisible = false;
    this.sceneLoadIntroGridVisible = false;
    this.sceneLoadIntroPinRevealStartedSlots?.clear?.();
    this.sceneLoadIntroPinRevealCompletedSlots?.clear?.();
    this.kingLeft?.setVisible(false)?.setAlpha?.(0);
    this.kingLeftShadow?.setVisible(false)?.setAlpha?.(0);
    this.kingLeftNameText?.setVisible(false);
    this.trashIcon?.setVisible(false)?.setAlpha?.(0);
    this.gStatic?.setVisible(false)?.setAlpha?.(0);
    this.gDynamic?.setVisible(false)?.setAlpha?.(0);
    this.setSceneLoadIntroInputLocked(true);
    this.syncBenchHexPinSprites?.();
    this.syncShopUI?.();
    this.syncPhaseUI?.();
    this.syncKingsUI?.();
    this.drawKingHpBars?.();

    const revealSlots = Array.from({ length: Number(this.benchRows ?? 0) }, (_, idx) => idx)
      .filter((slot) => this.isBenchHexPinSlot(slot));
    const pinBounceTotalMs = SCENE_LOAD_INTRO_PIN_BOUNCE_MS * 2;
    const pinsEndMs = revealSlots.length > 0
      ? (SCENE_LOAD_INTRO_PINS_START_DELAY_MS
        + Math.max(0, revealSlots.length - 1) * SCENE_LOAD_INTRO_PIN_STAGGER_MS
        + SCENE_LOAD_INTRO_PIN_DROP_MS
        + pinBounceTotalMs)
      : SCENE_LOAD_INTRO_PINS_START_DELAY_MS;
    const trashStartMs = pinsEndMs + SCENE_LOAD_INTRO_TRASH_REVEAL_GAP_MS;
    const trashEndMs = trashStartMs + SCENE_LOAD_INTRO_TRASH_DROP_MS + (SCENE_LOAD_INTRO_TRASH_BOUNCE_MS * 2);
    const shopStartMs = trashEndMs + SCENE_LOAD_INTRO_SHOP_REVEAL_GAP_MS;
    const hudStartMs = Math.min(
      SCENE_LOAD_INTRO_TOTAL_MS - SCENE_LOAD_INTRO_HUD_FADE_MS,
      shopStartMs + SCENE_LOAD_INTRO_HUD_REVEAL_DELAY_MS
    );

    const kingTimer = this.time.delayedCall(SCENE_LOAD_INTRO_PLAYER_KING_DELAY_MS, () => {
      this.playPlayerKingRevealTween?.();
    });
    const pinsTimer = this.time.delayedCall(SCENE_LOAD_INTRO_PINS_START_DELAY_MS, () => {
      this.playSceneLoadBenchPinsReveal?.();
    });
    const trashTimer = this.time.delayedCall(trashStartMs, () => {
      this.playSceneLoadTrashReveal?.();
    });
    const shopTimer = this.time.delayedCall(shopStartMs, () => {
      this.sceneLoadIntroTrashVisible = true;
      this.sceneLoadIntroShopVisible = true;
      this.shopCollapsed = false;
      this.syncShopUI?.();
    });
    const hudTimer = this.time.delayedCall(hudStartMs, () => {
      this.playSceneLoadHudReveal?.();
    });
    const finishTimer = this.time.delayedCall(SCENE_LOAD_INTRO_TOTAL_MS, () => {
      this.finishSceneLoadIntro?.();
    });
    this.sceneLoadIntroTimers.push(kingTimer, pinsTimer, trashTimer, shopTimer, hudTimer, finishTimer);
  }

  playPlayerKingRevealTween() {
    if (!this.kingLeft?.active) return null;
    this.tweens.killTweensOf(this.kingLeft);
    this.tweens.killTweensOf(this.kingLeftShadow);
    this.applyKingVisualConfigFor?.('player');
    this.positionKings?.();
    const baseScaleX = Number(this.kingLeft.scaleX ?? 1);
    const baseScaleY = Number(this.kingLeft.scaleY ?? 1);
    const targetX = Number(this.kingLeft.x ?? 0);
    const targetY = Number(this.kingLeft.y ?? 0);
    const playerVisualKey = this.getPlayerKingVisualKey?.();
    const playerShadowCfg = getKingShadowConfig(playerVisualKey, {
      mirrorX: this.shouldMirrorKingVisualX?.('player', playerVisualKey),
    });
    const startY = targetY - 140;
    const bounceY = targetY - 18;
    this.kingLeft
      .setVisible(true)
      .setPosition(targetX, startY)
      .setAlpha(0)
      .setScale(baseScaleX * 0.9, baseScaleY * 0.9);
    this.kingLeftShadow
      ?.setVisible(true)
      ?.setPosition(targetX + playerShadowCfg.offsetXPx, targetY + playerShadowCfg.offsetYPx)
      ?.setAlpha(0)
      ?.setScale(0.92, 0.92);
    this.tweens.add({
      targets: this.kingLeftShadow,
      alpha: KING_SHADOW_ALPHA,
      scaleX: 1,
      scaleY: 1,
      ease: 'Quad.Out',
      duration: 220,
    });
    this.tweens.add({
      targets: this.kingLeft,
      y: targetY,
      alpha: 1,
      scaleX: baseScaleX,
      scaleY: baseScaleY,
      ease: 'Quad.In',
      duration: 392,
      onComplete: () => {
        if (!this.kingLeft?.active) return;
        this.tweens.add({
          targets: this.kingLeft,
          y: bounceY,
          ease: 'Quad.Out',
          duration: 84,
          yoyo: true,
        });
      },
    });
    return this.kingLeft;
  }

  playSceneLoadBenchPinsReveal() {
    const revealSlots = Array.from({ length: Number(this.benchRows ?? 0) }, (_, idx) => idx)
      .filter((slot) => this.isBenchHexPinSlot(slot));

    if (revealSlots.length <= 0) {
      return;
    }

    revealSlots.forEach((slot, idx) => {
      const sprite = this.benchHexPinSprites?.[slot];
      if (!sprite?.active) return;

      this.sceneLoadIntroPinRevealStartedSlots?.add?.(slot);
      this.tweens.killTweensOf(sprite);

      const targetX = Number(sprite.x ?? 0);
      const targetY = Number(sprite.y ?? 0);
      const startY = targetY - 110;
      const bounceY = targetY - 10;
      const baseScaleX = Number(sprite.scaleX ?? 1);
      const baseScaleY = Number(sprite.scaleY ?? 1);

      sprite
        .setVisible(true)
        .setAlpha(0)
        .setPosition(targetX, startY)
        .setScale(baseScaleX * 0.92, baseScaleY * 0.92);

      this.tweens.add({
        targets: sprite,
        alpha: 1,
        y: targetY,
        scaleX: baseScaleX,
        scaleY: baseScaleY,
        ease: 'Quad.In',
        duration: SCENE_LOAD_INTRO_PIN_DROP_MS,
        delay: Math.round(idx * SCENE_LOAD_INTRO_PIN_STAGGER_MS),
        onComplete: () => {
          if (!sprite?.active) return;
          this.tweens.add({
            targets: sprite,
            y: bounceY,
            ease: 'Quad.Out',
            duration: SCENE_LOAD_INTRO_PIN_BOUNCE_MS,
            yoyo: true,
            onComplete: () => {
              this.sceneLoadIntroPinRevealCompletedSlots?.add?.(slot);
            },
          });
        },
      });
    });
  }

  playSceneLoadTrashReveal() {
    if (!this.trashIcon?.active) return null;
    this.positionTrashUi?.();
    this.updateTrashVisual?.(false);
    this.sceneLoadIntroTrashVisible = true;
    this.tweens.killTweensOf(this.trashIcon);
    const targetX = Number(this.trashIcon.x ?? 0);
    const targetY = Number(this.trashIcon.y ?? 0);
    const startY = targetY - 110;
    const bounceY = targetY - 10;
    const baseScaleX = Number(this.trashIcon.scaleX ?? 1);
    const baseScaleY = Number(this.trashIcon.scaleY ?? 1);
    this.trashIcon
      .setVisible(true)
      .setAlpha(0)
      .setPosition(targetX, startY)
      .setScale(baseScaleX * 0.92, baseScaleY * 0.92);
    this.tweens.add({
      targets: this.trashIcon,
      alpha: TRASH_ICON_ALPHA_CLOSED,
      y: targetY,
      scaleX: baseScaleX,
      scaleY: baseScaleY,
      ease: 'Quad.In',
      duration: SCENE_LOAD_INTRO_TRASH_DROP_MS,
      onComplete: () => {
        if (!this.trashIcon?.active) return;
        this.tweens.add({
          targets: this.trashIcon,
          y: bounceY,
          ease: 'Quad.Out',
          duration: SCENE_LOAD_INTRO_TRASH_BOUNCE_MS,
          yoyo: true,
        });
      },
    });
    return this.trashIcon;
  }

  playSceneLoadHudReveal() {
    this.sceneLoadIntroHudVisible = true;
    this.sceneLoadIntroGridVisible = true;
    this.sceneLoadIntroPlayerKingUiVisible = true;
    this.gStatic?.setVisible(true);
    this.gDynamic?.setVisible(true);
    this.syncPhaseUI?.();
    this.syncKingsUI?.();
    this.drawGrid?.();

    const hudTargets = [
      this.coinContainer,
      this.kingLevelContainer,
      this.kingXpBuyBtn,
      this.kingUnitCapHud,
      this.roundText,
      this.prepTimerText,
      this.resultText,
      this.gStatic,
      this.gDynamic,
      this.kingLeftHpBg,
      this.kingLeftHpLagFill,
      this.kingLeftHpFill,
      this.kingLeftNameText,
    ].filter((x) => x?.active && x.visible !== false);

    for (const target of hudTargets) {
      this.tweens.killTweensOf(target);
      target.setAlpha(0);
      this.tweens.add({
        targets: target,
        alpha: 1,
        duration: SCENE_LOAD_INTRO_HUD_FADE_MS,
        ease: 'Quad.Out',
      });
    }
  }

  playEnemyKingRevealTween() {
    if (!this.kingRight?.active) return null;
    this.tweens.killTweensOf(this.kingRight);
    this.tweens.killTweensOf(this.kingRightShadow);
    this.applyKingVisualConfigFor?.('enemy');
    const baseScaleX = Number(this.kingRight.scaleX ?? 1);
    const baseScaleY = Number(this.kingRight.scaleY ?? 1);
    const targetX = Number(this.kingRight.x ?? 0);
    const targetY = Number(this.kingRight.y ?? 0);
    const enemyVisualKey = this.getEnemyKingVisualKey?.();
    const enemyShadowCfg = getKingShadowConfig(enemyVisualKey, {
      mirrorX: this.shouldMirrorKingVisualX?.('enemy', enemyVisualKey),
    });
    const startY = targetY - 140;
    const bounceY = targetY - 18;
    this.kingRight
      .setVisible(true)
      .setPosition(targetX, startY)
      .setAlpha(0)
      .setScale(baseScaleX * 0.9, baseScaleY * 0.9);
    this.kingRightShadow
      ?.setVisible(true)
      ?.setPosition(targetX + enemyShadowCfg.offsetXPx, targetY + enemyShadowCfg.offsetYPx)
      ?.setAlpha(0)
      ?.setScale(0.92, 0.92);
    this.tweens.add({
      targets: this.kingRightShadow,
      alpha: KING_SHADOW_ALPHA,
      scaleX: 1,
      scaleY: 1,
      ease: 'Quad.Out',
      duration: 220,
    });
    this.tweens.add({
      targets: this.kingRight,
      y: targetY,
      alpha: 1,
      scaleX: baseScaleX,
      scaleY: baseScaleY,
      ease: 'Quad.In',
      duration: 392,
      onComplete: () => {
        if (!this.kingRight?.active) return;
        this.tweens.add({
          targets: this.kingRight,
          y: bounceY,
          ease: 'Quad.Out',
          duration: 84,
          yoyo: true,
        });
      },
    });
    return this.kingRight;
  }

  startBattleEntryReveal() {
    this.clearEntryRevealTimers();
    this.entryEnemyKingVisible = false;
    this.entryEnemyKingUiVisible = false;
    this.entryEnemyKingUiRevealPlayed = false;
    this.entryEnemyUnitsVisible = false;
    this.entryEnemyUnitsUiVisible = false;
    this.entryEnemyUnitsUiRevealPlayed = false;
    this.syncKingsUI?.();
    this.renderFromState?.();
    this.drawGrid?.();

    const kingTimer = this.time.delayedCall(0, () => {
      this.entryEnemyKingVisible = true;
      this.syncKingsUI?.();
      this.playEnemyKingRevealTween?.();
    });
    const kingUiTimer = this.time.delayedCall(700, () => {
      if (this.kingHpAnim?.enemy) {
        this.kingHpAnim.enemy.instant = null;
        this.kingHpAnim.enemy.lag = null;
      }
      if (this.kingHpLock) this.kingHpLock.enemy = null;
      this.entryEnemyKingUiVisible = true;
      this.syncKingsUI?.();
      this.playEntryEnemyKingUiRevealFx?.();
    });
    const armyTimer = this.time.delayedCall(1000, () => {
      this.entryEnemyUnitsVisible = true;
      this.renderFromState?.();
      this.animateEntryEnemyArmyReveal?.();
      this.drawGrid?.();
    });
    const armyUiTimer = this.time.delayedCall(3000, () => {
      this.entryEnemyUnitsUiVisible = true;
      this.renderFromState?.();
      this.playEntryEnemyArmyUiRevealFx?.();
      this.drawGrid?.();
    });
    this.entryRevealTimers.push(kingTimer, kingUiTimer, armyTimer, armyUiTimer);
  }

  playEntryEnemyKingUiRevealFx() {
    if (this.entryEnemyKingUiRevealPlayed) return;
    this.entryEnemyKingUiRevealPlayed = true;

    const hpParts = [this.kingRightHpBg, this.kingRightHpLagFill, this.kingRightHpFill].filter((x) => x?.active);
    for (const part of hpParts) {
      this.tweens.killTweensOf(part);
      part.setAlpha(0);
      this.tweens.add({
        targets: part,
        alpha: 1,
        duration: 120,
        ease: 'Quad.Out',
      });
    }

    const nameText = this.kingRightNameText;
    if (nameText?.active) {
      this.tweens.killTweensOf(nameText);
      nameText.setAlpha(0);
      this.tweens.add({
        targets: nameText,
        alpha: 1,
        delay: 120,
        duration: 110,
        ease: 'Quad.Out',
      });
    }
  }

  playEntryEnemyArmyUiRevealFx() {
    if (this.entryEnemyUnitsUiRevealPlayed) return;
    this.entryEnemyUnitsUiRevealPlayed = true;

    const enemyVisuals = (this.unitSys?.state?.units ?? [])
      .filter((vu) => {
        const core = this.getCoreUnitById?.(vu.id);
        return core?.team === 'enemy' && core?.zone === 'board' && !core?.dead;
      })
      .sort((a, b) => {
        const ar = Number(this.getCoreUnitById?.(a.id)?.r ?? a.r ?? 0);
        const br = Number(this.getCoreUnitById?.(b.id)?.r ?? b.r ?? 0);
        if (ar !== br) return br - ar;
        const aq = Number(this.getCoreUnitById?.(a.id)?.q ?? a.q ?? 0);
        const bq = Number(this.getCoreUnitById?.(b.id)?.q ?? b.q ?? 0);
        return aq - bq;
      });

    const staggerMs = 45;
    const fadeMs = 120;
    enemyVisuals.forEach((vu, idx) => {
      const hpGraphics = vu?.hpBar;
      if (!hpGraphics?.active) return;
      this.tweens.killTweensOf(hpGraphics);
      hpGraphics.setAlpha(0);
      this.tweens.add({
        targets: hpGraphics,
        alpha: 1,
        delay: idx * staggerMs,
        duration: fadeMs,
        ease: 'Quad.Out',
      });
    });
  }

  animateEntryEnemyArmyReveal() {
    const enemyVisuals = (this.unitSys?.state?.units ?? [])
      .filter((vu) => {
        const core = this.getCoreUnitById?.(vu.id);
        return core?.team === 'enemy' && core?.zone === 'board' && !core?.dead;
      })
      .sort((a, b) => {
        const ar = Number(this.getCoreUnitById?.(a.id)?.r ?? a.r ?? 0);
        const br = Number(this.getCoreUnitById?.(b.id)?.r ?? b.r ?? 0);
        if (ar !== br) return br - ar; // bottom -> top
        const aq = Number(this.getCoreUnitById?.(a.id)?.q ?? a.q ?? 0);
        const bq = Number(this.getCoreUnitById?.(b.id)?.q ?? b.q ?? 0);
        return aq - bq;
      });

    // Spread enemy unit reveals across first 1.5s of the 2s entry army window.
    // Last 0.5s stays calm for readability.
    const revealWindowMs = 1500;
    const dropMs = 240;
    const bounceMs = 80;
    const totalPerUnitMs = dropMs + bounceMs;
    const maxDelayMs = Math.max(0, revealWindowMs - totalPerUnitMs);
    const count = Math.max(1, enemyVisuals.length);
    const delayStepMs = (count > 1) ? (maxDelayMs / (count - 1)) : 0;
    enemyVisuals.forEach((vu, idx) => {
      const items = [vu.sprite, vu.art, vu.label, vu.footShadow, vu.rankIcon].filter((x) => x?.active);
      for (const item of items) {
        this.tweens.killTweensOf(item);
        const targetY = Number(item.y ?? 0);
        const startY = targetY - 90;
        const bounceY = targetY - 10;
        const baseScaleX = Number(item.scaleX ?? 1);
        const baseScaleY = Number(item.scaleY ?? 1);
        item.setAlpha(0);
        item.setY(startY);
        item.setScale(baseScaleX * 0.9, baseScaleY * 0.9);
        this.tweens.add({
          targets: item,
          alpha: 1,
          y: targetY,
          scaleX: baseScaleX,
          scaleY: baseScaleY,
          ease: 'Quad.In',
          duration: dropMs,
          delay: Math.round(idx * delayStepMs),
          onComplete: () => {
            if (!item?.active) return;
            this.tweens.add({
              targets: item,
              y: bounceY,
              ease: 'Quad.Out',
              duration: bounceMs,
              yoyo: true,
            });
          },
        });
      }
    });
  }

  applyBenchDepthForVisual(vu, slotRaw) {
    const slotRawNum = Number.isInteger(slotRaw) ? slotRaw : 0;
    const slot = Phaser.Math.Clamp(slotRawNum, 0, 7);
    const isForeground = slot >= BENCH_FOREGROUND_START_SLOT;
    const layerBase = isForeground ? BENCH_DEPTH_FOREGROUND_BASE : BENCH_DEPTH_BACKGROUND_BASE;
    // Keep vertical painter order on bench inside each layer:
    // lower slots (bigger index) render above upper ones, while
    // slots 1-4 stay below king and 5-8 stay above king.
    const layerSlot = isForeground ? (slot - BENCH_FOREGROUND_START_SLOT) : slot;
    const base = layerBase + (layerSlot * BENCH_DEPTH_SLOT_STEP);

    // Keep stable local ordering inside bench layer.
    vu?.footShadow?.setDepth?.(base + 1);
    vu?.sprite?.setDepth?.(base + 2);
    vu?.art?.setDepth?.(base + 3);
    vu?.label?.setDepth?.(base + 4);
    vu?.rankIcon?.setDepth?.(base + 5);
    vu?.hpBar?.setDepth?.(base + 6);
    vu?.dragHandle?.setDepth?.(base + 7);
  }

  getPlayerKingVisualKey() {
    return String(this.localPlayerKingTextureKey ?? this.kingLeft?.texture?.key ?? 'king_princess');
  }

  getEnemyKingVisualKey() {
    return String(this.battleState?.kings?.enemy?.visualKey ?? this.kingRight?.texture?.key ?? 'king_princess');
  }

  getKingVisualKeyForSprite(kingSprite) {
    return kingSprite === this.kingRight
      ? this.getEnemyKingVisualKey()
      : this.getPlayerKingVisualKey();
  }

  shouldMirrorKingVisualX(side, visualKey) {
    return side === 'enemy';
  }

  getKingAnchor(side) {
    const isEnemy = side === 'enemy';
    const sprite = isEnemy ? this.kingRight : this.kingLeft;
    const anchor = this.kingAnchors?.[side];
    return {
      x: Number(anchor?.x ?? sprite?.x ?? 0),
      y: Number(anchor?.y ?? sprite?.y ?? 0),
    };
  }

  getEnemyKingArtDepth() {
    const rowAbove = Math.max(0, Number(this.gridRows ?? 8) - 4); // r=4 for 8-row board
    const rowBelow = Math.max(rowAbove, Number(this.gridRows ?? 8) - 3); // r=5 for 8-row board
    const aboveDepth = boardDepth(UNIT_ART_DEPTH_LIVE, 0, rowAbove);
    const belowDepth = boardDepth(UNIT_ART_DEPTH_LIVE, 0, rowBelow);
    return (aboveDepth + belowDepth) / 2;
  }

  syncKingDepths() {
    if (this.kingLeft) this.kingLeft.setDepth(KING_RENDER_DEPTH_BASE);
    if (this.kingLeftShadow) this.kingLeftShadow.setDepth(KING_SHADOW_DEPTH);

    const enemyKingDepth = this.getEnemyKingArtDepth();
    if (this.kingRight) this.kingRight.setDepth(enemyKingDepth);
    if (this.kingRightShadow) this.kingRightShadow.setDepth(enemyKingDepth - 8);
  }

  applyKingVisualConfigFor(side) {
    const isEnemy = side === 'enemy';
    const sprite = isEnemy ? this.kingRight : this.kingLeft;
    const shadow = isEnemy ? this.kingRightShadow : this.kingLeftShadow;
    if (!sprite) return;

    const visualKey = isEnemy ? this.getEnemyKingVisualKey() : this.getPlayerKingVisualKey();
    const sizePx = getKingSizePx(visualKey);
    const shadowCfg = getKingShadowConfig(visualKey, {
      mirrorX: this.shouldMirrorKingVisualX?.(side, visualKey),
    });

    sprite.setDisplaySize(sizePx, sizePx);
    if (shadow) {
      shadow.setSize?.(shadowCfg.widthPx, shadowCfg.heightPx);
      shadow.setDisplaySize?.(shadowCfg.widthPx, shadowCfg.heightPx);
      shadow.setStrokeStyle(3, KING_SHADOW_COLOR, KING_SHADOW_STROKE_ALPHA);
    }
  }

  syncKingVisualConfig() {
    this.applyKingVisualConfigFor('player');
    this.applyKingVisualConfigFor('enemy');
    this.syncKingDepths?.();
  }

  applyLocalPlayerKingTexture(textureKey) {
    if (!textureKey || !this.textures?.exists?.(textureKey)) return;

    this.localPlayerKingTextureKey = textureKey;

    if (this.kingLeft) {
      this.kingLeft.setTexture(textureKey);
    }
    this.syncKingVisualConfig?.();
    this.positionKings?.();
    this.drawKingHpBars?.();
  }


  playUnitFeedbackBounce(vu, { scaleMul = 1.06, duration = 80 } = {}) {
    if (!vu) return;

    const targets = [vu.sprite, vu.art, vu.label, vu.rankIcon].filter((obj) => obj?.active);
    for (const obj of targets) {
      const dragBaseX = (obj === vu.art) ? Number(vu?._dragPickupArtScale?.x) : NaN;
      const dragBaseY = (obj === vu.art) ? Number(vu?._dragPickupArtScale?.y) : NaN;
      const storedBaseX = Number(obj.getData?.('__bounceBaseScaleX'));
      const storedBaseY = Number(obj.getData?.('__bounceBaseScaleY'));
      const baseScaleX = Number.isFinite(dragBaseX)
        ? dragBaseX
        : (Number.isFinite(storedBaseX) ? storedBaseX : Number(obj.scaleX ?? 1));
      const baseScaleY = Number.isFinite(dragBaseY)
        ? dragBaseY
        : (Number.isFinite(storedBaseY) ? storedBaseY : Number(obj.scaleY ?? 1));

      obj.setData?.('__bounceBaseScaleX', baseScaleX);
      obj.setData?.('__bounceBaseScaleY', baseScaleY);

      this.tweens.killTweensOf(obj);
      if (Math.abs((obj.scaleX ?? 1) - baseScaleX) > 1e-6 || Math.abs((obj.scaleY ?? 1) - baseScaleY) > 1e-6) {
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

  playUnitAttackImpactPulse(vu, {
    scaleMul = UNIT_ATTACK_IMPACT_PULSE_SCALE_MUL,
    growMs = UNIT_ATTACK_IMPACT_PULSE_GROW_MS,
    shrinkMs = UNIT_ATTACK_IMPACT_PULSE_SHRINK_MS,
  } = {}) {
    if (!vu) return;

    const targets = [vu.art, vu.artOverlay, vu.sprite].filter((obj) => obj?.active);
    for (const obj of targets) {
      const storedBaseX = Number(obj.getData?.('__attackPulseBaseScaleX'));
      const storedBaseY = Number(obj.getData?.('__attackPulseBaseScaleY'));
      const baseScaleX = Number.isFinite(storedBaseX) ? storedBaseX : Number(obj.scaleX ?? 1);
      const baseScaleY = Number.isFinite(storedBaseY) ? storedBaseY : Number(obj.scaleY ?? 1);

      obj.setData?.('__attackPulseBaseScaleX', baseScaleX);
      obj.setData?.('__attackPulseBaseScaleY', baseScaleY);

      this.tweens.killTweensOf(obj);
      if (Math.abs((obj.scaleX ?? 1) - baseScaleX) > 1e-6 || Math.abs((obj.scaleY ?? 1) - baseScaleY) > 1e-6) {
        obj.setScale(baseScaleX, baseScaleY);
      }

      this.tweens.add({
        targets: obj,
        scaleX: baseScaleX * scaleMul,
        scaleY: baseScaleY * scaleMul,
        duration: growMs,
        ease: 'Quad.Out',
        yoyo: true,
        hold: Math.max(0, Number(shrinkMs ?? 0)),
        onComplete: () => {
          if (obj?.active) obj.setScale(baseScaleX, baseScaleY);
        },
      });
    }
  }

  scheduleUnitAttackImpactPulse(coreUnitLike, delayMs = 0) {
    if (!coreUnitLike) return;
    const unitId = Number(coreUnitLike.id ?? NaN);
    if (!Number.isFinite(unitId)) return;

    this.time.delayedCall(Math.max(0, Number(delayMs ?? 0)), () => {
      const latestCore = this.getCoreUnitById?.(unitId);
      if (!latestCore || latestCore.dead) return;
      const vu = this.unitSys?.findUnit?.(unitId);
      if (!vu) return;
      this.playUnitAttackImpactPulse(vu);
    });
  }

  getBoardUnitArtDepth(coreUnitLike) {
    if (!coreUnitLike || coreUnitLike.zone !== 'board') return NaN;
    const base = coreUnitLike.dead ? UNIT_ART_DEPTH_DEAD : UNIT_ART_DEPTH_LIVE;
    return boardDepth(base, Number(coreUnitLike.q ?? 0), Number(coreUnitLike.r ?? 0));
  }

  canBringAttackerFrontOnHit(attackerCore, targetCore) {
    if (!attackerCore || !targetCore) return false;
    if (attackerCore.dead || targetCore.dead) return false;
    if (attackerCore.zone !== 'board' || targetCore.zone !== 'board') return false;

    const attackerCells = getBoardCellsForUnit(attackerCore);
    const targetCells = getBoardCellsForUnit(targetCore);
    if (!attackerCells.length || !targetCells.length) return false;

    const attackerRows = new Set(attackerCells.map((c) => Number(c.r)));
    const targetRows = new Set(targetCells.map((c) => Number(c.r)));
    if (attackerRows.size !== 1 || targetRows.size !== 1) return false;

    const attackerRow = Number(attackerCells[0]?.r ?? NaN);
    const targetRow = Number(targetCells[0]?.r ?? NaN);
    if (attackerRow !== targetRow) return false;

    const attackerRightQ = Math.max(...attackerCells.map((c) => Number(c.q)));
    const targetLeftQ = Math.min(...targetCells.map((c) => Number(c.q)));
    return targetLeftQ - attackerRightQ === 1;
  }

  bringUnitFrontOnHit(attackerCore, targetCore, durationMs = UNIT_ATTACK_FRONTMOST_HIT_MS) {
    if (!this.canBringAttackerFrontOnHit?.(attackerCore, targetCore)) return;

    const attackerId = Number(attackerCore?.id ?? NaN);
    if (!Number.isFinite(attackerId)) return;

    const vu = this.unitSys?.findUnit?.(attackerId);
    const targetVu = this.unitSys?.findUnit?.(targetCore?.id);
    if (!vu?.art?.active || !targetVu?.art?.active) return;

    const frontDepth = Math.max(
      Number(targetVu.art.depth ?? this.getBoardUnitArtDepth(targetCore)),
      Number(vu.art.depth ?? this.getBoardUnitArtDepth(attackerCore)),
    ) + 1;

    vu._frontHitDepthToken = Number(vu._frontHitDepthToken ?? 0) + 1;
    const token = Number(vu._frontHitDepthToken);

    vu.art.setDepth(frontDepth);
    if (vu.artOverlay?.active) vu.artOverlay.setDepth(frontDepth + 0.1);

    this.time.delayedCall(Math.max(0, Number(durationMs ?? 0)), () => {
      const latestVu = this.unitSys?.findUnit?.(attackerId);
      const latestCore = this.getCoreUnitById?.(attackerId);
      if (!latestVu?.art?.active || !latestCore || latestCore.dead || latestCore.zone !== 'board') return;
      if (Number(latestVu._frontHitDepthToken ?? 0) !== token) return;

      const baseDepth = this.getBoardUnitArtDepth(latestCore);
      if (!Number.isFinite(baseDepth)) return;
      latestVu.art.setDepth(baseDepth);
      if (latestVu.artOverlay?.active) latestVu.artOverlay.setDepth(baseDepth + 0.1);
    });
  }

  positionKings() {
    if (!this.kingLeft || !this.kingRight) return;
    this.syncKingVisualConfig?.();

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

    const kingUiLiftPx = 35; // поднимает базовый anchor блока короля (арт + HP + имя)
    const midY = (minY + maxY) / 2 - 40 - kingUiLiftPx; // подняли выше
    const enemyKingRowOffsetY = Number(this.hexSize ?? 44) * 1.5; // опускаем врага на один ряд гекса ниже игрока

    const leftVisualKey = this.getPlayerKingVisualKey?.();
    const rightVisualKey = this.getEnemyKingVisualKey?.();
    const leftShadowCfg = getKingShadowConfig(leftVisualKey, {
      mirrorX: this.shouldMirrorKingVisualX?.('player', leftVisualKey),
    });
    const rightShadowCfg = getKingShadowConfig(rightVisualKey, {
      mirrorX: this.shouldMirrorKingVisualX?.('enemy', rightVisualKey),
    });
    const pad = 30;
    const anchorHalfW = Number(this.kingSize ?? this.kingWidth ?? 190) / 2;

    const rawLeftAnchorX = minX - anchorHalfW - pad - 100;
    const rawRightAnchorX = maxX + anchorHalfW + pad - 40;

    // Держим anchor блока внутри экрана, но сам арт можно уводить offset-ом за край.
    const view = this.scale.getViewPort();
    const screenPad = 12;
    const leftKingOverflowPx = 30;
    const rightKingOverflowPx = leftKingOverflowPx;
    const minLeftKingAnchorX = view.x + anchorHalfW + screenPad - leftKingOverflowPx;
    const maxLeftKingAnchorX = view.x + view.width - anchorHalfW - screenPad + rightKingOverflowPx;
    const minRightKingAnchorX = view.x + anchorHalfW + screenPad - leftKingOverflowPx;
    const maxRightKingAnchorX = view.x + view.width - anchorHalfW - screenPad + rightKingOverflowPx;

    const leftAnchorX = Phaser.Math.Clamp(rawLeftAnchorX, minLeftKingAnchorX, maxLeftKingAnchorX);
    const rightAnchorX = Phaser.Math.Clamp(rawRightAnchorX, minRightKingAnchorX, maxRightKingAnchorX);
    const leftX = leftAnchorX + getKingOffsetXPx(leftVisualKey, {
      mirrorX: this.shouldMirrorKingVisualX('player', leftVisualKey),
    });
    const rightX = rightAnchorX + getKingOffsetXPx(rightVisualKey, {
      mirrorX: this.shouldMirrorKingVisualX('enemy', rightVisualKey),
    });
    const leftAnchorY = midY;
    const rightAnchorY = midY + enemyKingRowOffsetY;
    const leftY = leftAnchorY + getKingOffsetYPx(leftVisualKey);
    const rightY = rightAnchorY + getKingOffsetYPx(rightVisualKey);

    this.kingAnchors = {
      player: { x: leftAnchorX, y: leftAnchorY },
      enemy: { x: rightAnchorX, y: rightAnchorY },
    };

    this.kingLeft.setPosition(leftX, leftY);
    this.kingRight.setPosition(rightX, rightY);
    this.kingLeftShadow?.setPosition(leftX + leftShadowCfg.offsetXPx, leftY + leftShadowCfg.offsetYPx);
    this.kingRightShadow?.setPosition(rightX + rightShadowCfg.offsetXPx, rightY + rightShadowCfg.offsetYPx);
    this.drawKingHpBars?.();
  }

  syncRoundUI() {
    if (!this.roundText || !this.prepTimerText) return;

    const showTopHud = !this.sceneLoadIntroActive || !!this.sceneLoadIntroHudVisible;
    if (!showTopHud) {
      this.roundText?.setVisible(false);
      this.prepTimerText?.setVisible(false);
      this.resultText?.setVisible(false);
      this.startGameBtn?.setVisible(false);
      return;
    }

    const round = Number(this.battleState?.round ?? 1);
    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;

    if (result) {
      this.prepTimerText?.setVisible(false);
      return;
    }

    this.roundText.setText(this.testSceneActive ? UI_TEXT.TEST_SCENE : `${UI_TEXT.ROUND} ${round}`);
    this.roundText.setVisible(true);

    // timer line under round title
    const isPrep = (phase === 'prep') && (result == null);
    const isEntry = (phase === 'entry') && (result == null);
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
    } else if (isEntry) {
      const t = Number(this.battleState?.entrySecondsLeft ?? 0);
      const ss = String(Math.max(0, Math.min(59, t))).padStart(2, '0');
      this.prepTimerText.setVisible(true);
      this.prepTimerText.setText(`${ss}с`);
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
        this.autoStartRequested ||
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

    const barWidth = KING_UI.hpBar.width;
    const barHeight = KING_UI.hpBar.height;
    const barRadius = KING_UI.hpBar.radius;
    const kingHpBarDownPx = KING_UI.hpBar.yOffset; // опускает HP-бар (и имя над ним) у обоих королей

    const drawBar = (side, kingSprite, hpBg, hpLagFill, hpFill, kingData) => {
      if (!kingSprite || !kingData) return;
      const maxHp = Math.max(1, Number(kingData.maxHp ?? 1));
      const lockRaw = this.kingHpLock?.[side];
      const lockHp = lockRaw == null ? NaN : Number(lockRaw);
      const targetHpRaw = Number.isFinite(lockHp) ? lockHp : Number(kingData.hp ?? maxHp);
      const targetHp = Phaser.Math.Clamp(targetHpRaw, 0, maxHp);
      const anim = this.kingHpAnim?.[side];
      if (anim) {
        if (anim.instant == null || anim.lag == null) {
          anim.instant = targetHp;
          anim.lag = targetHp;
        } else if (targetHp > anim.instant) {
          // heal/sync: snap both only on real hp gain
          anim.instant = targetHp;
          anim.lag = targetHp;
        } else {
          // damage: drop instant immediately, lag catches up in update()
          anim.instant = targetHp;
          if (anim.lag < anim.instant) anim.lag = anim.instant;
        }
      }

      const kingVisualKey = this.getKingVisualKeyForSprite?.(kingSprite);
      const kingAnchor = this.getKingAnchor(side);
      const kingAnchorHalfHeight = Number(this.kingHeight ?? this.kingSize ?? kingSprite.displayHeight ?? 190) / 2;
      const kingHpBarOffsetXPx = getKingHpBarOffsetXPx(kingVisualKey, {
        mirrorX: this.shouldMirrorKingVisualX(side, kingVisualKey),
      });
      const kingHpBarOffsetPx = getKingHpBarOffsetYPx(kingVisualKey);
      const x = kingAnchor.x - barWidth / 2 + kingHpBarOffsetXPx;
      const y = kingAnchor.y - kingAnchorHalfHeight - 26 + kingHpBarDownPx + kingHpBarOffsetPx;

      hpBg.clear();
      hpLagFill.clear();
      hpFill.clear();

      hpBg.fillStyle(KING_UI.hpBar.bgColor, KING_UI.hpBar.bgAlpha);
      hpBg.fillRoundedRect(x, y, barWidth, barHeight, barRadius);

      const hpInstant = anim ? anim.instant : targetHp;
      const hpLag = anim ? anim.lag : targetHp;
      const lagRatio = Phaser.Math.Clamp(hpLag / maxHp, 0, 1);
      const ratio = Phaser.Math.Clamp(hpInstant / maxHp, 0, 1);
      const lagW = barWidth * lagRatio;
      const fillW = barWidth * ratio;

      hpLagFill.fillStyle(KING_UI.hpBar.lagColor, KING_UI.hpBar.lagAlpha);
      hpLagFill.fillRoundedRect(x, y, lagW, barHeight, barRadius);

      hpFill.fillStyle(KING_UI.hpBar.fillColor, KING_UI.hpBar.fillAlpha);
      hpFill.fillRoundedRect(x, y, fillW, barHeight, barRadius);

      // subtle top highlight for a cleaner "royal" look
      if (fillW > 3) {
        hpFill.fillStyle(KING_UI.hpBar.highlightColor, KING_UI.hpBar.highlightAlpha);
        hpFill.fillRect(x + 1, y + 1, fillW - 2, 1);
      }

      // thin frame to separate bar from the king portrait
      hpBg.lineStyle(1, KING_UI.hpBar.frameColor, KING_UI.hpBar.frameAlpha);
      hpBg.strokeRoundedRect(x, y, barWidth, barHeight, barRadius);
      hpBg.lineStyle(1, KING_UI.hpBar.pixelFrameColor, KING_UI.hpBar.pixelFrameAlpha);
      hpBg.strokeRoundedRect(x - 1, y - 1, barWidth + 2, barHeight + 2, barRadius);

      // Numeric HP text hidden by design: HP is shown only via bar (details in Rating).
      const hpText = (kingSprite === this.kingLeft) ? this.kingLeftHpText : this.kingRightHpText;
      const hpSide = (kingSprite === this.kingLeft) ? 'player' : 'enemy';
      hpText?.setText(`${Math.round(targetHp)}`);
      hpText?.setPosition(x + barWidth - 4, y + (barHeight / 2) + 2);
      hpText?.setVisible(Boolean(this.kingHpExpanded?.[hpSide]));

      const hpHit = (kingSprite === this.kingLeft) ? this.kingLeftHpHit : this.kingRightHpHit;
      hpHit?.setPosition(x - 6, y - 6);
      hpHit?.setSize(barWidth + 12, barHeight + 12);
      hpHit?.setVisible(true);

      // имя короля над полоской HP
      const kingNameText = (kingSprite === this.kingLeft) ? this.kingLeftNameText : this.kingRightNameText;
      if (kingNameText) {
        kingNameText.setPosition(x, y - 4);
        kingNameText.setVisible(true);
      }

    };

    drawBar('player', this.kingLeft, this.kingLeftHpBg, this.kingLeftHpLagFill, this.kingLeftHpFill, kings.player);
    if (!this.sceneLoadIntroPlayerKingUiVisible) {
      this.kingLeftHpBg.clear();
      this.kingLeftHpLagFill.clear();
      this.kingLeftHpFill.clear();
      this.kingLeftHpText?.setVisible(false);
      this.kingLeftHpHit?.setVisible(false);
      this.kingLeftNameText?.setVisible(false);
    }
    this.kingLeftShadow?.setVisible?.(this.kingLeft?.visible !== false);
    this.kingLeftShadow?.setAlpha?.(this.kingLeft?.visible === false ? 0 : KING_SHADOW_ALPHA);

    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;

    const isBattleView = (phase === 'battle') || (result != null);
    const isEntryEnemyKingUi = (phase === 'entry') && !!this.entryEnemyKingUiVisible;
    const isTestSceneEnemyKingUi = !!this.testSceneActive && !!this.testSceneEnemyKingUiVisible;
    const showEnemy = (isBattleView || isEntryEnemyKingUi || isTestSceneEnemyKingUi) && kings.enemy?.visible !== false;

    if (showEnemy) {
      drawBar('enemy', this.kingRight, this.kingRightHpBg, this.kingRightHpLagFill, this.kingRightHpFill, kings.enemy);
      this.kingRightShadow?.setVisible?.(this.kingRight?.visible !== false);
      if ((this.kingRight?.alpha ?? 1) > 0) this.kingRightShadow?.setAlpha?.(KING_SHADOW_ALPHA);
    } else {
      this.kingRightHpBg.clear();
      this.kingRightHpLagFill.clear();
      this.kingRightHpFill.clear();
      this.kingRightHpText?.setVisible(false);
      this.kingRightHpHit?.setVisible(false);
      this.kingRightNameText?.setVisible(false);
      this.kingRightShadow?.setVisible?.(false);
    }
  }

  stopServerBattleReplayPlayback() {
    if (!this.serverReplayPlayback) return;
    this.serverReplayPlayback.active = false;
    this.serverReplayPlayback.token = Number(this.serverReplayPlayback.token ?? 0) + 1;
    for (const t of (this.serverReplayPlayback.timers ?? [])) {
      try { t?.remove?.(false); } catch {}
    }
    this.serverReplayPlayback.timers = [];
  }

  startServerBattleReplayPlayback(replay, battleStartState, opts = {}) {
    const allowTestScene = opts?.allowTestScene === true;
    const onComplete = typeof opts?.onComplete === 'function' ? opts.onComplete : null;
    if (!USE_SERVER_BATTLE_REPLAY || !replay) return;
    if (this.testSceneActive && !allowTestScene) return;
    if (!Array.isArray(replay.events)) return;

    this.stopServerBattleReplayPlayback();
    const token = Number(this.serverReplayPlayback?.token ?? 0) + 1;
    this.serverReplayPlayback = { active: true, token, timers: [], startTimeMs: Number(this.time?.now ?? 0), allowTestScene, onComplete };

    // Start from the server-provided battle snapshot and animate locally by replay events.
    this.battleState = {
      ...this.battleState,
      ...battleStartState,
      units: (battleStartState?.units ?? []).map((u) => ({ ...u })),
    };
    this.pendingAttackAnimIds = new Set();
    this.pendingAbilityCastAnimIds = new Set();
    this.pendingRangedBeamFx = [];
    for (const vu of (this.unitSys?.state?.units ?? [])) {
      const runtime = this.attachUnitRuntime(vu, vu.id);
      if (!runtime) continue;
      runtime._abilityCdStartAtMs = null;
      runtime._abilityCdReadyAtMs = null;
      runtime._abilityCdDurationMs = null;
      runtime._abilityCdReplayAnchorMs = null;
      runtime._abilityCdUiEnabled = false;
      runtime._abilityCdReadyFxArmed = false;
      runtime._abilityCdReadyFxPlayed = false;
      runtime._abilityCdReadyFlashUntilMs = 0;
      runtime._abilityCastStartAtMs = null;
      runtime._abilityCastEndAtMs = null;
      runtime._abilityCastStartFill = null;
    }
    this.renderFromState();
    this.drawGrid();
    this.syncKingsUI();
    this.refreshAllDraggable();

    const grouped = new Map();
    for (const ev of (replay.events ?? [])) {
      const t = (ev?.type === 'move')
        ? Math.max(0, Number(ev?.tStart ?? ev?.t ?? 0))
        : Math.max(0, Number(ev?.t ?? 0));
      if (!grouped.has(t)) grouped.set(t, []);
      grouped.get(t).push(ev);
    }

    const applyAtTime = (eventsAtT) => {
      if (!this.serverReplayPlayback?.active || this.serverReplayPlayback.token !== token) return;
      if (!Array.isArray(eventsAtT) || eventsAtT.length === 0) return;

      const pendingAttack = new Set();
      for (const ev of eventsAtT) {
        this.applyServerBattleReplayEvent?.(ev, pendingAttack);
      }

      this.pendingAttackAnimIds = pendingAttack;
      this.renderFromState();
      this.flushPendingRangedBeamFx?.();
      this.drawGrid();
      this.syncKingsUI();
    };

    for (const [t, eventsAtT] of grouped.entries()) {
      const timer = this.time.delayedCall(t, () => applyAtTime(eventsAtT));
      this.serverReplayPlayback.timers.push(timer);
    }

    if (onComplete) {
      const completeDelayMs = Math.max(0, Number(replay?.durationMs ?? 0)) + 10;
      const completeTimer = this.time.delayedCall(completeDelayMs, () => {
        if (!this.serverReplayPlayback?.active || this.serverReplayPlayback.token !== token) return;
        try {
          onComplete(replay, battleStartState);
        } finally {
          this.stopServerBattleReplayPlayback();
        }
      });
      this.serverReplayPlayback.timers.push(completeTimer);
      return;
    }

    // Do not auto-disable playback at replay end:
    // keep replay board state authoritative until server leaves battle phase.
  }

  maybeStartServerBattleReplayPlayback(rawServerState, { force = false } = {}) {
    if (!USE_SERVER_BATTLE_REPLAY || this.testSceneActive) return;
    const s = rawServerState ?? this.battleState;
    if (!s || s.phase !== 'battle' || s.result) return;
    const replay = s.battleReplay ?? null;
    if (!replay?.events) return;

    const replayKey = JSON.stringify({
      phase: s.phase,
      round: Number(s.round ?? 0),
      result: s.result ?? null,
      events: Array.isArray(replay.events) ? replay.events.length : 0,
      durationMs: Number(replay.durationMs ?? 0),
    });

    if (!force && this.serverReplayPlayback?.active && this.serverReplayPlayback?.replayKey === replayKey) {
      return;
    }
    if (!force && this.serverReplayPlayback?.lastReplayKey === replayKey && this.serverReplayPlayback?.active) {
      return;
    }

    this.startServerBattleReplayPlayback(replay, s);
    if (this.serverReplayPlayback) {
      this.serverReplayPlayback.replayKey = replayKey;
      this.serverReplayPlayback.lastReplayKey = replayKey;
    }
  }

  applyServerBattleReplayEvent(ev, pendingAttackAnimIds = null) {
    if (!ev || !this.battleState) return;
    const units = this.battleState.units ?? [];
    const byId = new Map(units.map((u) => [u.id, u]));

    if (ev.type === 'move') {
      const u = byId.get(ev.unitId);
      if (!u || u.dead) return;
      const runtime = this.getUnitRuntime(u.id);
      const fromQ = Number.isFinite(Number(ev.fromQ)) ? Number(ev.fromQ) : Number(u.q);
      const fromR = Number.isFinite(Number(ev.fromR)) ? Number(ev.fromR) : Number(u.r);
      const moveStartRelMs = Math.max(0, Number(ev?.tStart ?? ev?.t ?? 0));
      const tweenMs = Number(ev.durationMs ?? NaN);
      if (Number.isFinite(tweenMs) && tweenMs > 0) {
        runtime._replayMoveTweenMs = tweenMs;
        runtime._replayMoveAbilityKey = ev.abilityKey ?? null;
        const replayStartMs = Number(this.serverReplayPlayback?.startTimeMs ?? this.time?.now ?? 0);
        runtime._replayMoveFromQ = fromQ;
        runtime._replayMoveFromR = fromR;
        runtime._replayMoveStartAtMs = replayStartMs + moveStartRelMs;
        runtime._replayMoveEndAtMs = replayStartMs + moveStartRelMs + tweenMs;
      }
      u.q = Number(ev.q ?? u.q);
      u.r = Number(ev.r ?? u.r);
      u.zone = 'board';
      if (String(ev.abilityKey ?? '') === 'knight_charge') {
        this.restartUnitAbilityCooldownUi?.(u);
      }
      return;
    }

    if (ev.type === 'attack') {
      const attacker = byId.get(ev.attackerId);
      const target = byId.get(ev.targetId);
      const attackerRuntime = attacker ? this.getUnitRuntime(attacker.id) : null;
      if (attacker) {
        attacker.attackSeq = Number(ev.attackSeq ?? (Number(attacker.attackSeq ?? 0) + 1));
        attackerRuntime._preparedAttackIntervalMs = Math.max(0, Number(ev.preparedAttackIntervalMs ?? 0));
        attackerRuntime._preparedAttackHitDelayMs = Math.max(0, Number(ev.preparedAttackHitDelayMs ?? 0));
        attackerRuntime._preparedAttackHoldMs = Math.max(0, Number(ev.preparedAttackHoldMs ?? 0));
        if (!(getPreparedAttackConfig(attacker.type) && !Boolean(ev?.isRanged))) {
          if (pendingAttackAnimIds) pendingAttackAnimIds.add(attacker.id);
        }
        const preparedAttackCfg = getPreparedAttackConfig(attacker.type);
        const pulseDelayMs = Boolean(ev?.isRanged)
          ? 0
          : Math.max(0, Number(preparedAttackCfg ? (ev.preparedAttackHitDelayMs ?? attackerRuntime._preparedAttackHitDelayMs ?? 0) : 0));
        this.scheduleUnitAttackImpactPulse?.(attacker, pulseDelayMs);
      }
      if (attacker && getPreparedAttackConfig(attacker.type) && !Boolean(ev?.isRanged)) {
        const vu = this.unitSys?.findUnit?.(attacker.id);
        const runtime = this.attachUnitRuntime(vu, attacker.id);
        if (vu) {
          const nowMs = Number(this.time?.now ?? 0);
          const hitDelayMs = Math.max(0, Number(ev.preparedAttackHitDelayMs ?? attackerRuntime._preparedAttackHitDelayMs ?? 0));
          const attackHoldMs = Math.max(0, Number(ev.preparedAttackHoldMs ?? attackerRuntime._preparedAttackHoldMs ?? 0));
          runtime._preparedAttackCycleUntilMs = nowMs + Math.max(0, Number(ev.preparedAttackIntervalMs ?? attackerRuntime._preparedAttackIntervalMs ?? 0));
          runtime._preparedAttackPoseUntilMs = nowMs + hitDelayMs;
          runtime._preparedAttackIdleAttack2FromMs = nowMs + hitDelayMs + attackHoldMs;
          runtime._preparedAttackIdleAttack2Active = false;
          runtime._preparedAttackFrameUntilMs = 0;
        }
      }
        if (attacker && target) {
          if (Boolean(ev?.isRanged) === true) {
            const isCrossbowmanShot = this.isCrossbowmanLineShotUnit?.(attacker) === true;
            this.pendingRangedBeamFx = this.pendingRangedBeamFx ?? [];
            this.pendingRangedBeamFx.push({
              attackerId: attacker.id,
              targetId: target.id,
              targetQ: isCrossbowmanShot ? Number(ev.projectileTargetQ ?? target.q ?? 0) : null,
              targetR: isCrossbowmanShot ? Number(ev.projectileTargetR ?? target.r ?? 0) : null,
              projectileTravelMs: Number(ev.projectileTravelMs ?? 0),
              projectileTravelMsTotal: Number(ev.projectileTravelMsTotal ?? ev.projectileTravelMs ?? 0),
              projectilePierce: Boolean(ev.projectilePierce),
              forceStraight: Boolean(ev.projectileForceStraight) || isCrossbowmanShot,
              textureKey: isCrossbowmanShot ? 'projectile_bolt' : undefined,
              dist: Number(ev.dist ?? NaN),
              attackRangeFullDamage: Number(ev.attackRangeFullDamage ?? NaN),
            });
          }
        }
      return;
    }

    if (ev.type === 'damage') {
      const attacker = byId.get(ev.attackerId);
      const target = byId.get(ev.targetId);
      if (attacker && getPreparedAttackConfig(attacker.type) && !Boolean(ev.skipPreparedAttackVisual)) {
        const vu = this.unitSys?.findUnit?.(attacker.id);
        const attackerRuntime = this.attachUnitRuntime(vu, attacker.id);
        if (vu) {
          if (target) this.faceUnitVisualTowardCoreUnit(vu, target);
          attackerRuntime._preparedAttackPoseUntilMs = 0;
          attackerRuntime._preparedAttackFrameUntilMs = Number(this.time?.now ?? 0) + Math.max(0, Number(attackerRuntime._preparedAttackHoldMs ?? 400));
        }
      }
      if (attacker && target) {
        this.bringUnitFrontOnHit?.(attacker, target);
      }
      if (target) {
        if (Number.isFinite(Number(ev.targetMaxHp))) target.maxHp = Number(ev.targetMaxHp);
        if (Number.isFinite(Number(ev.targetHp))) target.hp = Number(ev.targetHp);
        if (ev.killed) {
          target.hp = 0;
          target.dead = true;
        }
      }
      if (target && !target.dead) {
        const vu = this.unitSys?.findUnit?.(target.id);
        const targetRuntime = this.attachUnitRuntime(vu, target.id);
        const damageFrame = this.getUnitDamageStaticFrame?.(target);
        const nowMs = Number(this.time?.now ?? 0);
        const skillFrameActive = Number(targetRuntime?._skillFrameUntilMs ?? 0) > nowMs;
        const attackFrameActive = Number(targetRuntime?._preparedAttackFrameUntilMs ?? 0) > nowMs;
        if (vu) this.playUnitDamageFlash?.(vu);
        if (vu && damageFrame && !skillFrameActive && !attackFrameActive) {
          targetRuntime._damageFrameUntilMs = nowMs + UNIT_RECEIVE_DAMAGE_FRAME_MS;
        }
      }
      const chainTargetId = Number(ev?.chainTargetId ?? NaN);
      const chainFromTargetId = Number(ev?.chainFromTargetId ?? ev?.targetId ?? NaN);
      if (Number.isFinite(chainTargetId) && Number.isFinite(chainFromTargetId)) {
        this.pendingRangedBeamFx = this.pendingRangedBeamFx ?? [];
        this.pendingRangedBeamFx.push({
          attackerId: chainFromTargetId,
          targetId: chainTargetId,
          projectileTravelMs: Number(ev?.chainTravelMs ?? 0),
          forceStraight: true,
          spinClockwise: true,
          textureKey: 'projectile_bone',
          dist: 1,
          attackRangeFullDamage: 1,
        });
      }
      return;
    }

    if (ev.type === 'ability_cast') {
      const caster = byId.get(ev.casterId);
      if (caster) {
        const abilityKey = String(ev?.abilityKey ?? '');
        if (abilityKey === SWORDSMAN_COUNTER_ABILITY_KEY) {
          const vu = this.unitSys?.findUnit?.(caster.id);
          const runtime = this.attachUnitRuntime(vu, caster.id);
          const target = byId.get(ev.targetId);
          const skillFrame = this.getUnitSkillStaticFrame(caster);
          const preparedAttackFrames = this.getPreparedAttackStaticFrames(caster);
          const nowMs = Number(this.time?.now ?? 0);
          if (vu && skillFrame) {
            if (target) this.faceUnitVisualTowardCoreUnit(vu, target);
            runtime._skillFrameUntilMs = nowMs + Math.max(0, Number(ev.displayMs ?? SWORDSMAN_COUNTER_SKILL_DEFAULT_MS));
          }
          if (vu && preparedAttackFrames) {
            runtime._counterRecoveryUntilMs = nowMs + Math.max(0, Number(ev.windowMs ?? SWORDSMAN_COUNTER_WINDOW_DEFAULT_MS));
          }
          this.scheduleUnitAttackImpactPulse?.(caster, 0);
          this.showCombatCounterHint?.(caster);
          return;
        }

        const castTimeMs = Math.max(0, Number(ev.castTimeMs ?? 0));
        if (castTimeMs > 0 && this.pendingAbilityCastAnimIds) this.pendingAbilityCastAnimIds.add(caster.id);
        this.startUnitAbilityCastUi?.(caster, castTimeMs);

        if (abilityKey === 'undertaker_active' || abilityKey === WORM_SWALLOW_ABILITY_KEY || abilityKey === 'siren_mirror_image') {
          const replayToken = Number(this.serverReplayPlayback?.token ?? 0);
          if (castTimeMs <= 0) {
            this.restartUnitAbilityCooldownUi?.(caster);
          } else {
            const t = this.time.delayedCall(castTimeMs, () => {
              if (!this.serverReplayPlayback?.active) return;
              if (Number(this.serverReplayPlayback?.token ?? -1) !== replayToken) return;
              const latestCaster = this.getCoreUnitById?.(caster.id);
              if (!latestCaster || latestCaster.dead) return;
              this.restartUnitAbilityCooldownUi?.(latestCaster);
            });
            this.serverReplayPlayback?.timers?.push?.(t);
          }
        }
      }
      return;
    }

    if (ev.type === 'worm_swallow') {
      const worm = byId.get(ev.wormId);
      const target = byId.get(ev.targetId);
      if (worm) {
        worm.wormSwallowedUnitId = Number(ev.targetId ?? worm.wormSwallowedUnitId ?? 0);
      }
      if (target) {
        target.zone = 'swallowed';
        target.benchSlot = null;
        target.dead = false;
        if (Number.isFinite(Number(ev.targetHp))) target.hp = Number(ev.targetHp);
        if (Number.isFinite(Number(ev.targetMaxHp))) target.maxHp = Number(ev.targetMaxHp);
      }
      return;
    }

    if (ev.type === 'worm_digest') {
      const worm = byId.get(ev.wormId);
      const target = byId.get(ev.targetId);
      if (worm) worm.wormSwallowedUnitId = null;
      if (target) {
        target.hp = 0;
        target.dead = true;
        target.zone = 'swallowed';
        target.benchSlot = null;
      }
      return;
    }

    if (ev.type === 'worm_release') {
      const worm = byId.get(ev.wormId);
      const target = byId.get(ev.targetId);
      if (worm) worm.wormSwallowedUnitId = null;
      if (target) {
        target.zone = 'board';
        target.benchSlot = null;
        target.dead = false;
        if (Number.isFinite(Number(ev.q))) target.q = Number(ev.q);
        if (Number.isFinite(Number(ev.r))) target.r = Number(ev.r);
        if (Number.isFinite(Number(ev.maxHp))) target.maxHp = Number(ev.maxHp);
        if (Number.isFinite(Number(ev.hp))) target.hp = Number(ev.hp);
      }
      return;
    }

    if (ev.type === 'spawn') {
      const spawned = ev?.unit ?? null;
      if (!spawned || !Number.isFinite(Number(spawned.id))) return;
      if (String(ev?.sourceAbilityKey ?? '') === 'siren_mirror_image') {
        const sourceUnit = byId.get(ev.sourceId);
        const sourceVu = sourceUnit ? this.unitSys?.findUnit?.(sourceUnit.id) : null;
        const sourceRuntime = sourceVu ? this.attachUnitRuntime(sourceVu, sourceUnit?.id) : null;
        if (sourceRuntime) {
          sourceRuntime._abilityCastStartAtMs = null;
          sourceRuntime._abilityCastEndAtMs = null;
          sourceRuntime._abilityCastStartFill = null;
          sourceRuntime._castAnimPlaying = false;
          sourceRuntime._castAnimForceReplay = false;
        }
      }
      const existing = byId.get(spawned.id);
      if (existing) {
        Object.assign(existing, spawned, { zone: 'board', dead: Boolean(spawned.dead ?? false) });
      } else {
        if (this.battleState?.units && Array.isArray(this.battleState.units)) {
          this.battleState.units.push({
            id: Number(spawned.id),
            q: Number(spawned.q ?? 0),
            r: Number(spawned.r ?? 0),
            hp: Number(spawned.hp ?? 1),
            maxHp: Number(spawned.maxHp ?? spawned.hp ?? 1),
            atk: Number(spawned.atk ?? 1),
            team: spawned.team ?? 'enemy',
            rank: Number(spawned.rank ?? 1),
            type: spawned.type ?? null,
            powerType: spawned.powerType ?? null,
            zone: 'board',
            benchSlot: null,
            attackSpeed: Number(spawned.attackSpeed ?? 1),
            moveSpeed: Number(spawned.moveSpeed ?? 1),
            projectileSpeed: Number(spawned.projectileSpeed ?? 0),
            attackRangeMax: Number(spawned.attackRangeMax ?? 1),
            attackRangeFullDamage: Number(spawned.attackRangeFullDamage ?? 1),
            attackMode: String(spawned.attackMode ?? 'melee'),
            accuracy: Number(spawned.accuracy ?? 0.8),
            abilityType: String(spawned.abilityType ?? 'none'),
            abilityKey: spawned.abilityKey ?? null,
            abilityCooldown: Number(spawned.abilityCooldown ?? 0),
            cellSpanX: Math.max(1, Math.floor(Number(spawned.cellSpanX ?? 1))),
            isIllusion: Boolean(spawned.isIllusion ?? false),
            attackSeq: Number(spawned.attackSeq ?? 0),
            dead: Boolean(spawned.dead ?? false),
          });
        }
      }
      return;
    }

    if (ev.type === 'miss') {
      const attacker = byId.get(ev.attackerId);
      const target = byId.get(ev.targetId);
      if (attacker && getPreparedAttackConfig(attacker.type) && !Boolean(ev.skipPreparedAttackVisual)) {
        const vu = this.unitSys?.findUnit?.(attacker.id);
        const attackerRuntime = this.attachUnitRuntime(vu, attacker.id);
        if (attackerRuntime) {
          if (target) this.faceUnitVisualTowardCoreUnit(vu, target);
          attackerRuntime._preparedAttackPoseUntilMs = 0;
          attackerRuntime._preparedAttackFrameUntilMs = Number(this.time?.now ?? 0) + Math.max(0, Number(attackerRuntime._preparedAttackHoldMs ?? 400));
        }
      }
      if (target) {
        this.showCombatMissHint(target);
        const targetType = String(target.type ?? '').toLowerCase();
        const isGhostMiss = targetType === 'ghost' || String(target.abilityKey ?? '') === 'ghost_evasion';
        if (isGhostMiss) this.playGhostMissFadeFx(target);
      }
      return;
    }
  }

  getUnitVisualCenter(coreUnitLike, fallbackVu = null) {
    const vu = fallbackVu ?? this.unitSys?.findUnit?.(coreUnitLike?.id);
    if (vu?.art?.active) {
      const b = vu.art.getBounds?.();
      if (b) return { x: b.centerX, y: b.centerY };
      return { x: Number(vu.art.x ?? 0), y: Number(vu.art.y ?? 0) };
    }
    if (vu?.sprite?.active) {
      return { x: Number(vu.sprite.x ?? 0), y: Number(vu.sprite.y ?? 0) };
    }

    const anchor = this.getUnitScreenAnchor(coreUnitLike, fallbackVu);
    if (anchor) return { x: Number(anchor.artX ?? anchor.x ?? 0), y: Number(anchor.artY ?? anchor.y ?? 0) };
    return null;
  }

  getBoardCellVisualCenter(q, r) {
    const p = this.hexToPixel(Number(q), Number(r));
    return p ? { x: Number(p.x ?? 0), y: Number(p.y ?? 0) } : null;
  }

  getUnitBoardCellVisualCenter(coreUnitLike) {
    if (!coreUnitLike) return null;
    return this.getBoardCellVisualCenter(Number(coreUnitLike.q ?? 0), Number(coreUnitLike.r ?? 0));
  }

  getRangedProjectileTextureKey(attackerCore, fx = null) {
    if (fx?.textureKey) return String(fx.textureKey);
    if (this.isCrossbowmanLineShotUnit?.(attackerCore)) return 'projectile_bolt';
    const t = String(attackerCore?.type ?? '').toLowerCase();
    if (t === 'skeletonarcher' || t === 'skeleton_archer') return 'projectile_bone';
    if (t === 'crossbowman' || t === 'crossbow') return 'projectile_bolt';
    return null;
  }

  getProjectileRotationOffset(textureKey) {
    const key = String(textureKey ?? '');
    if (key === 'projectile_bolt') return Math.PI;
    return 0;
  }

  hasExplicitProjectileTargetCell(fx = null) {
    return fx?.targetQ != null
      && fx?.targetR != null
      && Number.isFinite(Number(fx.targetQ))
      && Number.isFinite(Number(fx.targetR));
  }

  getCrossbowmanVisualProjectileDurationMs(attackerCore, fx, start, initialTarget, lockedStraightTo) {
    if (!attackerCore || !fx || !start || !initialTarget || !lockedStraightTo) return null;
    const projectileSpeed = Math.max(0, Number(attackerCore.projectileSpeed ?? 0));
    if (!(projectileSpeed > 0)) return null;

    const targetQ = Number.isFinite(Number(fx?.targetQ)) ? Number(fx.targetQ) : Number(attackerCore.q ?? 0);
    const targetR = Number.isFinite(Number(fx?.targetR)) ? Number(fx.targetR) : Number(attackerCore.r ?? 0);
    const targetHexDist = Math.max(1, hexDistance(
      Number(attackerCore.q ?? 0),
      Number(attackerCore.r ?? 0),
      targetQ,
      targetR,
    ));
    const targetPixelDist = Phaser.Math.Distance.Between(start.x, start.y, initialTarget.x, initialTarget.y);
    if (!(targetPixelDist > 1e-3)) return null;

    const pixelsPerHex = targetPixelDist / targetHexDist;
    if (!(pixelsPerHex > 1e-3)) return null;

    const totalPixelDist = Phaser.Math.Distance.Between(start.x, start.y, lockedStraightTo.x, lockedStraightTo.y);
    if (!(totalPixelDist > 1e-3)) return null;

    return Math.max(120, (totalPixelDist / (projectileSpeed * pixelsPerHex)) * 1000);
  }

  createCrossbowmanBoltTrail() {
    const trail = this.add.rectangle(0, 0, CROSSBOWMAN_TRAIL_MAX_LENGTH_PX, CROSSBOWMAN_TRAIL_WIDTH_PX, 0xf7e7bf, CROSSBOWMAN_TRAIL_ALPHA)
      .setDepth(1604)
      .setOrigin(1, 0.5)
      .setVisible(false);
    return trail;
  }

  playRangedProjectileFx(attackerCore, targetCore, fx = null) {
    if (!attackerCore || !targetCore) return false;
    const textureKey = this.getRangedProjectileTextureKey(attackerCore, fx);
    if (!textureKey || !this.textures?.exists?.(textureKey)) return false;

    const isCrossbowmanShot = this.isCrossbowmanLineShotUnit?.(attackerCore) === true;
    const attackerBoardCenter = this.getUnitBoardCellVisualCenter(attackerCore);
    const attackerVisualCenter = this.getUnitVisualCenter(attackerCore);
    const crossbowmanLiftY = isCrossbowmanShot && attackerBoardCenter && attackerVisualCenter
      ? Number(attackerVisualCenter.y) - Number(attackerBoardCenter.y)
      : 0;
    const applyCrossbowmanLift = (point) => {
      if (!point) return null;
      if (!isCrossbowmanShot) return point;
      return {
        x: Number(point.x ?? 0),
        y: Number(point.y ?? 0) + crossbowmanLiftY,
      };
    };
    const start = isCrossbowmanShot
      ? (attackerVisualCenter ?? attackerBoardCenter)
      : attackerVisualCenter;
    if (!start) return false;
    const shouldFlyStraight = Boolean(fx?.forceStraight) || isCrossbowmanShot;
    const initialTargetRaw = this.hasExplicitProjectileTargetCell?.(fx)
      ? this.getBoardCellVisualCenter(Number(fx.targetQ), Number(fx.targetR))
      : this.getUnitVisualCenter(targetCore);
    const initialTarget = applyCrossbowmanLift(initialTargetRaw);
    if (!initialTarget) return false;
    const lockedStraightTo = (() => {
      if (!shouldFlyStraight) return null;
      if (!fx?.projectilePierce) return { x: initialTarget.x, y: initialTarget.y };

      const dx = initialTarget.x - start.x;
      const dy = initialTarget.y - start.y;
      const len = Math.hypot(dx, dy);
      if (len <= 1e-3) return { x: initialTarget.x, y: initialTarget.y };
      const ux = dx / len;
      const uy = dy / len;
      const extra = Math.max(this.scale.width, this.scale.height) * 1.25;
      return {
        x: start.x + (ux * (len + extra)),
        y: start.y + (uy * (len + extra)),
      };
    })();
    const durationMs = isCrossbowmanShot
      ? (
        this.getCrossbowmanVisualProjectileDurationMs?.(
          attackerCore,
          fx,
          start,
          initialTarget,
          lockedStraightTo ?? initialTarget,
        )
        ?? Math.max(60, Number(fx?.projectileTravelMsTotal ?? fx?.projectileTravelMs ?? 0))
      )
      : Math.max(60, Number(fx?.projectileTravelMsTotal ?? fx?.projectileTravelMs ?? 0));

    const sprite = this.add.image(start.x, start.y, textureKey).setDepth(1605);
    sprite.setScale(0.48);
    const spinClockwise = Boolean(fx?.spinClockwise);
    const rotationOffset = Number(this.getProjectileRotationOffset?.(textureKey) ?? 0);
    const boltTrail = isCrossbowmanShot && !spinClockwise
      ? this.createCrossbowmanBoltTrail?.()
      : null;
    if (spinClockwise) {
      const rotationsPerSecond = 4.5;
      const deltaAngle = 360 * rotationsPerSecond * (durationMs / 1000);
      this.tweens.add({
        targets: sprite,
        angle: `+=${deltaAngle}`,
        duration: durationMs,
        ease: 'Linear',
      });
    }

    const drive = { t: 0 };
    this.tweens.add({
      targets: drive,
      t: 1,
      duration: durationMs,
      ease: 'Linear',
      onUpdate: () => {
        const liveTarget = (this.battleState?.units ?? []).find((u) => u.id === targetCore.id) ?? targetCore;
        const targetCenter = shouldFlyStraight
          ? null
          : (
            applyCrossbowmanLift(
              (this.hasExplicitProjectileTargetCell?.(fx)
                ? this.getBoardCellVisualCenter(Number(fx.targetQ), Number(fx.targetR))
                : null)
              ?? this.getUnitVisualCenter(liveTarget)
              ?? this.getUnitVisualCenter(targetCore)
            )
          );
        const to = shouldFlyStraight ? lockedStraightTo : targetCenter;
        if (!to) return;

        const t = Phaser.Math.Clamp(drive.t, 0, 1);
        let nx = 0;
        let ny = 0;
        let dx = 0;
        let dy = 0;

        if (shouldFlyStraight) {
          nx = Phaser.Math.Linear(start.x, to.x, t);
          ny = Phaser.Math.Linear(start.y, to.y, t);
          dx = to.x - start.x;
          dy = to.y - start.y;
        } else {
          const distPx = Phaser.Math.Distance.Between(start.x, start.y, to.x, to.y);
          const arcLift = Math.max(54, Math.min(270, distPx * 0.66));
          const cx = (start.x + to.x) * 0.5;
          const cy = ((start.y + to.y) * 0.5) - arcLift;
          const omt = 1 - t;

          nx = (omt * omt * start.x) + (2 * omt * t * cx) + (t * t * to.x);
          ny = (omt * omt * start.y) + (2 * omt * t * cy) + (t * t * to.y);
          dx = (2 * omt * (cx - start.x)) + (2 * t * (to.x - cx));
          dy = (2 * omt * (cy - start.y)) + (2 * t * (to.y - cy));
        }
        sprite.setPosition(nx, ny);

        if (!spinClockwise) {
          sprite.setRotation(Math.atan2(dy, dx) + rotationOffset);
        }

        if (boltTrail?.active) {
          const trailLen = Math.min(CROSSBOWMAN_TRAIL_MAX_LENGTH_PX, Math.hypot(dx, dy) * 0.22);
          boltTrail.setVisible(trailLen > 2);
          const dirLen = Math.hypot(dx, dy);
          const ux = dirLen > 1e-3 ? dx / dirLen : 1;
          const uy = dirLen > 1e-3 ? dy / dirLen : 0;
          const tailOffset = 20;
          const normalX = -uy;
          const normalY = ux;
          const lateralOffset = 4;
          boltTrail.setPosition(
            nx - (ux * tailOffset) + (normalX * lateralOffset),
            ny - (uy * tailOffset) + (normalY * lateralOffset),
          );
          boltTrail.setRotation(Math.atan2(dy, dx));
          boltTrail.width = trailLen;
          boltTrail.height = CROSSBOWMAN_TRAIL_WIDTH_PX;
        }
      },
      onComplete: () => {
        sprite.destroy();
        if (boltTrail?.active) {
          this.tweens.add({
            targets: boltTrail,
            alpha: 0,
            duration: 90,
            ease: 'Quad.Out',
            onComplete: () => boltTrail.destroy(),
          });
        }
      },
    });
    return true;
  }

  playRangedBeamFx(attackerCore, targetCore, fx = null) {
    if (!attackerCore || !targetCore) return;

    const from = this.getUnitVisualCenter(attackerCore);
    const to = this.getUnitVisualCenter(targetCore);
    if (!from || !to) return;
    const durationMs = Math.max(90, Number(fx?.projectileTravelMs ?? 0));

    const beam = this.add.graphics().setDepth(1600);
    beam.lineStyle(6, 0x6ecfff, 0.30);
    beam.beginPath();
    beam.moveTo(from.x, from.y);
    beam.lineTo(to.x, to.y);
    beam.strokePath();
    beam.lineStyle(2, 0xe8f9ff, 0.95);
    beam.beginPath();
    beam.moveTo(from.x, from.y);
    beam.lineTo(to.x, to.y);
    beam.strokePath();

    const hit = this.add.circle(to.x, to.y, 5, 0xcdf5ff, 0.95).setDepth(1601);

    this.tweens.add({
      targets: beam,
      alpha: 0,
      duration: durationMs,
      ease: 'Quad.Out',
      onComplete: () => beam.destroy(),
    });
    this.tweens.add({
      targets: hit,
      alpha: 0,
      scale: 1.7,
      duration: Math.max(80, Math.min(180, Math.floor(durationMs * 0.8))),
      ease: 'Quad.Out',
      onComplete: () => hit.destroy(),
    });
  }

  flushPendingRangedBeamFx() {
    const queue = this.pendingRangedBeamFx ?? [];
    if (!Array.isArray(queue) || queue.length === 0) return;

    for (const fx of queue) {
      const attackerCore = this.getCoreUnitById?.(fx?.attackerId);
      const targetCore = this.getCoreUnitById?.(fx?.targetId);
      if (!attackerCore || !targetCore) continue;
      const projectileRendered = this.playRangedProjectileFx(attackerCore, targetCore, fx);
      if (!projectileRendered) this.playRangedBeamFx(attackerCore, targetCore, fx);
    }
    this.pendingRangedBeamFx = [];
  }

  syncUnitAbilityCooldownUi(coreUnitLike, visualUnit) {
    const core = coreUnitLike ?? null;
    const vu = visualUnit ?? this.unitSys?.findUnit?.(core?.id);
    if (!core || !vu) return;
    const runtime = this.attachUnitRuntime(vu, core);
    if (!runtime) return;

    const hasCooldownAbility =
      String(core.abilityType ?? 'none') === 'active' ||
      this.isWormSwallowAbilityCore?.(core);
    const cooldownSec = Math.max(0, Number(core.abilityCooldown ?? 0));
    const cooldownMs = cooldownSec * 1000;
    if (!hasCooldownAbility || cooldownMs <= 0) {
      runtime._abilityCdStartAtMs = null;
      runtime._abilityCdReadyAtMs = null;
      runtime._abilityCdDurationMs = null;
      runtime._abilityCdReplayAnchorMs = null;
      runtime._abilityCdUiEnabled = false;
      runtime._abilityCdReadyFxArmed = false;
      runtime._abilityCdReadyFxPlayed = false;
      runtime._abilityCdReadyFlashUntilMs = 0;
      runtime._abilityCastStartAtMs = null;
      runtime._abilityCastEndAtMs = null;
      runtime._abilityCastStartFill = null;
      return;
    }

    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;
    const wormDigestingNow =
      this.isWormSwallowAbilityCore?.(core) &&
      Number.isFinite(Number(core.wormSwallowedUnitId ?? NaN));
    const canShowEntryEnemyAbilityUi =
      phase === 'entry' &&
      !result &&
      core.team === 'enemy' &&
      !!this.entryEnemyUnitsUiVisible;
    runtime._abilityCdUiEnabled =
      ((phase === 'battle' && !result) || canShowEntryEnemyAbilityUi) &&
      core.zone === 'board' &&
      !core.dead &&
      (!this.isWormSwallowAbilityCore?.(core) || wormDigestingNow);
    runtime._abilityCdDurationMs = cooldownMs;

    const nowMs = Number(this.time?.now ?? 0);
    const replayStartMs = Number(this.serverReplayPlayback?.startTimeMs ?? nowMs);
    const nextAbilityAtRelMs = Number(core.nextAbilityAt ?? NaN);
    const replayActive = Boolean(this.serverReplayPlayback?.active) && phase === 'battle' && !result;
    const startAtMs = Number(runtime._abilityCdStartAtMs ?? NaN);
    const readyAtMs = Number(runtime._abilityCdReadyAtMs ?? NaN);
    const hasValidWindow = Number.isFinite(startAtMs) && Number.isFinite(readyAtMs) && readyAtMs > startAtMs;
    const sameReplayAnchor = Number(runtime._abilityCdReplayAnchorMs ?? NaN) === replayStartMs;

    if (replayActive) {
      // In replay mode do not continuously override cooldown from core.nextAbilityAt:
      // snapshots/events may carry stale/static values. Initialize once and then restart on replay cast events.
      if (!hasValidWindow || !sameReplayAnchor) {
        const wormReadyNow =
          this.isWormSwallowAbilityCore?.(core) &&
          (!Number.isFinite(nextAbilityAtRelMs) || nextAbilityAtRelMs <= 0);
        const initialReadyAtMs =
          wormReadyNow
            ? replayStartMs
            : (Number.isFinite(nextAbilityAtRelMs) && nextAbilityAtRelMs > 0)
            ? (replayStartMs + nextAbilityAtRelMs)
            : (replayStartMs + cooldownMs);
        runtime._abilityCdReadyAtMs = initialReadyAtMs;
        runtime._abilityCdStartAtMs = initialReadyAtMs - cooldownMs;
        runtime._abilityCdReplayAnchorMs = replayStartMs;
      }
      return;
    }

    // Non-replay authoritative updates: allow server-provided nextAbilityAt to drive UI.
    if (Number.isFinite(nextAbilityAtRelMs) && nextAbilityAtRelMs > 0) {
      runtime._abilityCdReadyAtMs = nowMs + nextAbilityAtRelMs;
      runtime._abilityCdStartAtMs = runtime._abilityCdReadyAtMs - cooldownMs;
      runtime._abilityCdReplayAnchorMs = null;
    } else if (!hasValidWindow) {
      if (this.isWormSwallowAbilityCore?.(core)) {
        runtime._abilityCdReadyAtMs = nowMs;
        runtime._abilityCdStartAtMs = nowMs - cooldownMs;
      } else {
        runtime._abilityCdReadyAtMs = nowMs + cooldownMs;
        runtime._abilityCdStartAtMs = nowMs;
      }
      runtime._abilityCdReplayAnchorMs = null;
    }
  }

  isWormSwallowAbilityCore(core) {
    if (!core) return false;
    return String(core.abilityType ?? 'none') === 'passive'
      && String(core.abilityKey ?? '') === WORM_SWALLOW_ABILITY_KEY;
  }

  isWormFatCore(core) {
    if (!core) return false;
    if (String(core.type ?? '') !== 'Worm') return false;
    const swallowedId = Number(core.wormSwallowedUnitId ?? NaN);
    return Number.isFinite(swallowedId) && swallowedId > 0;
  }

  restartUnitAbilityCooldownUi(coreUnitLike) {
    const core = coreUnitLike ?? null;
    const vu = this.unitSys?.findUnit?.(core?.id);
    if (!core || !vu) return;
    const runtime = this.attachUnitRuntime(vu, core);
    if (!runtime) return;
    const cooldownSec = Math.max(0, Number(core.abilityCooldown ?? 0));
    const cooldownMs = cooldownSec * 1000;
    const hasCooldownAbility =
      String(core.abilityType ?? 'none') === 'active' ||
      this.isWormSwallowAbilityCore?.(core);
    if (!hasCooldownAbility || cooldownMs <= 0) return;
    const nowMs = Number(this.time?.now ?? 0);
    runtime._abilityCdDurationMs = cooldownMs;
    runtime._abilityCdStartAtMs = nowMs;
    runtime._abilityCdReadyAtMs = nowMs + cooldownMs;
    runtime._abilityCdReplayAnchorMs = Number(this.serverReplayPlayback?.startTimeMs ?? nowMs);
    runtime._abilityCdUiEnabled = true;
    runtime._abilityCdReadyFxArmed = false;
    runtime._abilityCdReadyFxPlayed = false;
    runtime._abilityCdReadyFlashUntilMs = 0;
    runtime._abilityCastStartAtMs = null;
    runtime._abilityCastEndAtMs = null;
    runtime._abilityCastStartFill = null;
    runtime._castAnimPlaying = false;
    runtime._castAnimForceReplay = false;
  }

  startUnitAbilityCastUi(coreUnitLike, castTimeMsRaw = 0) {
    const core = coreUnitLike ?? null;
    const vu = this.unitSys?.findUnit?.(core?.id);
    if (!core || !vu) return;
    const runtime = this.attachUnitRuntime(vu, core);
    if (!runtime) return;
    const cooldownSec = Math.max(0, Number(core.abilityCooldown ?? 0));
    const cooldownMs = cooldownSec * 1000;
    if (String(core.abilityType ?? 'none') !== 'active' || cooldownMs <= 0) return;
    const castTimeMs = Math.max(0, Number(castTimeMsRaw ?? 0));
    if (castTimeMs <= 0) return;

    const nowMs = Number(this.time?.now ?? 0);
    const startAtMs = Number(runtime._abilityCdStartAtMs ?? NaN);
    const readyAtMs = Number(runtime._abilityCdReadyAtMs ?? NaN);
    let currentFill = 1;
    if (Number.isFinite(startAtMs) && Number.isFinite(readyAtMs) && readyAtMs > startAtMs) {
      currentFill = Phaser.Math.Clamp((nowMs - startAtMs) / (readyAtMs - startAtMs), 0, 1);
    }

    runtime._abilityCastStartAtMs = nowMs;
    runtime._abilityCastEndAtMs = nowMs + castTimeMs;
    runtime._abilityCastStartFill = currentFill;
  }

  getAbilityCooldownFillForUnit(unitLike) {
    const unitId = unitLike?.id ?? null;
    if (unitId == null) return NaN;
    const core = this.getCoreUnitById?.(unitId);
    const vu = this.unitSys?.findUnit?.(unitId);
    if (!core || !vu) return NaN;
    const runtime = this.attachUnitRuntime(vu, unitId);
    if (!runtime) return NaN;

    const hasCooldownAbility =
      String(core.abilityType ?? 'none') === 'active' ||
      this.isWormSwallowAbilityCore?.(core);
    const cooldownSec = Math.max(0, Number(core.abilityCooldown ?? 0));
    const cooldownMs = cooldownSec * 1000;
    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;
    if (!hasCooldownAbility || cooldownMs <= 0) return NaN;
    const canShowEntryEnemyAbilityUi =
      phase === 'entry' &&
      !result &&
      core.team === 'enemy' &&
      !!this.entryEnemyUnitsUiVisible;
    if ((phase !== 'battle' && !canShowEntryEnemyAbilityUi) || !!result || core.zone !== 'board' || core.dead) return NaN;
    if (this.isWormSwallowAbilityCore?.(core) && !Number.isFinite(Number(core.wormSwallowedUnitId ?? NaN))) return NaN;

    const nowMs = Number(this.time?.now ?? 0);
    const castStartAtMs = Number(runtime._abilityCastStartAtMs ?? NaN);
    const castEndAtMs = Number(runtime._abilityCastEndAtMs ?? NaN);
    if (Number.isFinite(castStartAtMs) && Number.isFinite(castEndAtMs) && castEndAtMs > castStartAtMs) {
      if (nowMs < castEndAtMs) {
        const castT = Phaser.Math.Clamp((nowMs - castStartAtMs) / (castEndAtMs - castStartAtMs), 0, 1);
        const startFill = Phaser.Math.Clamp(Number(runtime._abilityCastStartFill ?? 1), 0, 1);
        return Phaser.Math.Clamp(startFill * (1 - castT), 0, 1);
      }
      runtime._abilityCastStartAtMs = null;
      runtime._abilityCastEndAtMs = null;
      runtime._abilityCastStartFill = null;
    }

    const startAtMs = Number(runtime._abilityCdStartAtMs ?? NaN);
    const readyAtMs = Number(runtime._abilityCdReadyAtMs ?? NaN);
    if (!Number.isFinite(startAtMs) || !Number.isFinite(readyAtMs) || readyAtMs <= startAtMs) return 1;
    return Phaser.Math.Clamp((nowMs - startAtMs) / (readyAtMs - startAtMs), 0, 1);
  }

  showCombatMissHint(coreUnitLike) {
    if (!coreUnitLike) return;
    const unitId = Number(coreUnitLike?.id ?? NaN);
    const nowMs = Number(this.time?.now ?? 0);
    this.missHintLastShownAtByUnitId = this.missHintLastShownAtByUnitId ?? new Map();
    if (Number.isFinite(unitId)) {
      const lastShownAt = Number(this.missHintLastShownAtByUnitId.get(unitId) ?? -Infinity);
      if ((nowMs - lastShownAt) < MISS_HINT_THROTTLE_MS) return;
      this.missHintLastShownAtByUnitId.set(unitId, nowMs);
    }
    const vu = this.unitSys?.findUnit?.(coreUnitLike?.id);
    const hasHpBarAnchor =
      Number.isFinite(Number(vu?._hpBarCenterX)) &&
      Number.isFinite(Number(vu?._hpBarTopY));
    const pos = hasHpBarAnchor
      ? { x: Number(vu._hpBarCenterX), y: Number(vu._hpBarTopY) }
      : this.getUnitVisualCenter(coreUnitLike);
    if (!pos) return;
    const t = this.add.text(pos.x, hasHpBarAnchor ? (pos.y - 2) : (pos.y - 46), MISS_HINT_TEXT, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#fff8ea',
      fontStyle: 'bold',
    })
      .setOrigin(0.5, 1)
      .setDepth(2600)
      .setAlpha(0)
      .setScale(COUNTER_HINT_START_SCALE)
      .setShadow(0, 0, '#000000', 6, true, true);

    this.tweens.add({
      targets: t,
      alpha: 1,
      scaleX: COUNTER_HINT_PEAK_SCALE,
      scaleY: COUNTER_HINT_PEAK_SCALE,
      duration: COUNTER_HINT_POP_IN_MS,
      ease: 'Back.Out',
      onComplete: () => {
        if (!t?.scene?.sys) return;
        this.tweens.add({
          targets: t,
          scaleX: 1,
          scaleY: 1,
          duration: COUNTER_HINT_SETTLE_MS,
          ease: 'Sine.Out',
          onComplete: () => {
            if (!t?.scene?.sys) return;
            this.tweens.add({
              targets: t,
              y: t.y - MISS_HINT_RISE_PX,
              alpha: 0,
              duration: MISS_HINT_DURATION_MS,
              ease: 'Sine.In',
              onComplete: () => t.destroy(),
            });
          },
        });
      },
    });
  }

  showCombatCounterHint(coreUnitLike) {
    if (!coreUnitLike) return;
    const vu = this.unitSys?.findUnit?.(coreUnitLike?.id);
    const hasHpBarAnchor =
      Number.isFinite(Number(vu?._hpBarCenterX)) &&
      Number.isFinite(Number(vu?._hpBarTopY));
    const pos = hasHpBarAnchor
      ? { x: Number(vu._hpBarCenterX), y: Number(vu._hpBarTopY) }
      : this.getUnitVisualCenter(coreUnitLike);
    if (!pos) return;
    const t = this.add.text(pos.x, hasHpBarAnchor ? (pos.y - 2) : (pos.y - 52), COUNTER_HINT_TEXT, {
      fontFamily: 'CormorantSC-Bold, CormorantSC-SemiBold, CormorantSC-Regular, Georgia, serif',
      fontSize: '14px',
      color: '#fff1c4',
      fontStyle: 'bold',
      stroke: '#6a5a3a',
      strokeThickness: 1,
    })
      .setOrigin(0.5, 1)
      .setDepth(2602)
      .setAlpha(0)
      .setScale(COUNTER_HINT_START_SCALE)
      .setShadow(0, 1, '#000000', 6, true, true);

    this.tweens.add({
      targets: t,
      alpha: 1,
      scaleX: COUNTER_HINT_PEAK_SCALE,
      scaleY: COUNTER_HINT_PEAK_SCALE,
      duration: COUNTER_HINT_POP_IN_MS,
      ease: 'Back.Out',
      onComplete: () => {
        if (!t?.scene?.sys) return;
        this.tweens.add({
          targets: t,
          scaleX: 1,
          scaleY: 1,
          duration: COUNTER_HINT_SETTLE_MS,
          ease: 'Sine.Out',
          onComplete: () => {
            if (!t?.scene?.sys) return;
            this.tweens.add({
              targets: t,
              y: t.y - COUNTER_HINT_RISE_PX,
              alpha: 0,
              duration: COUNTER_HINT_DURATION_MS,
              ease: 'Sine.In',
              onComplete: () => t.destroy(),
            });
          },
        });
      },
    });
  }

  playGhostMissFadeFx(coreUnitLike) {
    if (!coreUnitLike) return;
    const vu = this.unitSys?.findUnit?.(coreUnitLike.id);
    const targetVisual = vu?.art?.active ? vu.art : (vu?.sprite?.active ? vu.sprite : null);
    if (!targetVisual) return;

    // Visual-only ghost feel: pulse only alpha and do not interrupt move tweens (x/y).
    if (vu?._ghostMissAlphaTween) {
      try { vu._ghostMissAlphaTween.stop(); } catch {}
      vu._ghostMissAlphaTween = null;
    }
    targetVisual.setAlpha(1);
    vu._ghostMissAlphaTween = this.tweens.add({
      targets: targetVisual,
      alpha: 0.34,
      duration: 120,
      yoyo: true,
      ease: 'Sine.Out',
      onComplete: () => {
        if (vu) vu._ghostMissAlphaTween = null;
        if (targetVisual?.scene?.sys) targetVisual.setAlpha(1);
      },
    });
  }

  getReplayCombatHexForUnit(coreUnitLike, nowMs = Number(this.time?.now ?? 0)) {
    if (!coreUnitLike || coreUnitLike.zone !== 'board') return null;

    const toQ = Number(coreUnitLike.q);
    const toR = Number(coreUnitLike.r);
    const startAt = Number(coreUnitLike._replayMoveStartAtMs ?? NaN);
    const endAt = Number(coreUnitLike._replayMoveEndAtMs ?? NaN);
    const fromQ = Number(coreUnitLike._replayMoveFromQ ?? toQ);
    const fromR = Number(coreUnitLike._replayMoveFromR ?? toR);

    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) {
      return { q: toQ, r: toR };
    }
    if (nowMs + 1e-6 < startAt) {
      return { q: fromQ, r: fromR };
    }
    if (nowMs + 1e-6 >= endAt) {
      return { q: toQ, r: toR };
    }

    const progress = (nowMs - startAt) / Math.max(1, endAt - startAt);
    return progress < 0.5 ? { q: fromQ, r: fromR } : { q: toQ, r: toR };
  }

  getUnitScreenAnchor(coreUnitLike, fallbackVu = null) {
    if (!coreUnitLike && !fallbackVu) return null;

    const type = coreUnitLike?.type ?? fallbackVu?.type ?? null;
    const team = coreUnitLike?.team ?? fallbackVu?.team ?? null;
    const span = getUnitCellSpanX(coreUnitLike ?? fallbackVu);
    const artOffsetX = span > 1
      ? getUnitArtOffsetXPx(type, false)
      : getUnitArtOffsetXPx(type, team);
    const lift = getUnitGroundLiftPx(type);

    if ((coreUnitLike?.zone === 'bench') || (!coreUnitLike && fallbackVu)) {
      const slot = Number.isInteger(coreUnitLike?.benchSlot)
        ? coreUnitLike.benchSlot
        : (Number.isInteger(fallbackVu?.benchSlot) ? fallbackVu.benchSlot : null);

      if (slot != null) {
        const p = this.benchSlotToScreen(slot);
        return { x: p.x, y: p.y, artX: p.x + artOffsetX, artY: p.y + this.hexSize - lift };
      }
    }

    if (coreUnitLike && coreUnitLike.zone === 'board') {
      const p = this.hexToPixel(coreUnitLike.q, coreUnitLike.r);
      const g = this.hexToGroundPixel(coreUnitLike.q, coreUnitLike.r, lift);
      return { x: p.x, y: p.y, artX: g.x + artOffsetX, artY: g.y };
    }

    if (fallbackVu?.sprite) {
      const x = fallbackVu.sprite.x;
      const y = fallbackVu.sprite.y;
      return { x, y, artX: x + artOffsetX, artY: y + this.hexSize - lift };
    }

    return null;
  }

  onUnitVisualMoveComplete(unitLike) {
    const vu = this.unitSys?.findUnit?.(unitLike?.id);
    if (!vu?.art?.active) return;
    const runtime = this.attachUnitRuntime(vu, unitLike?.id);
    if (!runtime) return;

    const latest = this.getCoreUnitById?.(unitLike?.id);
    if (!latest || latest.dead || latest.zone !== 'board') return;
    if (runtime._attackAnimPlaying || runtime._castAnimPlaying || vu._moveTween) return;

    const wormFatActive =
      this.isWormFatCore?.(latest) &&
      this.anims.exists(WORM_FAT_ANIMS.idle);
    const animDef = wormFatActive
      ? WORM_FAT_ANIMS
      : UNIT_ANIMS_BY_TYPE[latest.type];
    if (!animDef || !this.anims.exists(animDef.idle)) return;

    runtime._staticWalkFrameActive = false;
    vu.art.play(animDef.idle, true);
  }

  getPreparedAttackStaticFrames(coreUnitLike) {
    const atlasCfg = UNIT_ATLAS_DEF_BY_TYPE[String(coreUnitLike?.type ?? '')] ?? null;
    const preparedCfg = getPreparedAttackConfig(coreUnitLike?.type);
    if (!atlasCfg || !preparedCfg) return null;
    const texture = this.textures?.get?.(atlasCfg.atlasKey);
    const idleAttackFrame = texture?.has?.(atlasIdleAttackFrame(atlasCfg))
      ? atlasIdleAttackFrame(atlasCfg)
      : (texture?.has?.(atlasIdleFrame(atlasCfg)) ? atlasIdleFrame(atlasCfg) : null);
    const attackFrame = atlasAttackFallbackFrame(atlasCfg);
    if (!idleAttackFrame || !texture?.has?.(attackFrame)) return null;
    return {
      atlasCfg,
      idleAttackFrame,
      attackFrame,
      config: preparedCfg,
    };
  }

  getUnitSkillStaticFrame(coreUnitLike) {
    const atlasCfg = UNIT_ATLAS_DEF_BY_TYPE[String(coreUnitLike?.type ?? '')] ?? null;
    if (!atlasCfg) return null;
    const texture = this.textures?.get?.(atlasCfg.atlasKey);
    const skillFrame = atlasSkillFrame(atlasCfg);
    if (!texture?.has?.(skillFrame)) return null;
    return { atlasCfg, skillFrame };
  }

  getUnitDamageStaticFrame(coreUnitLike) {
    const atlasCfg = UNIT_ATLAS_DEF_BY_TYPE[String(coreUnitLike?.type ?? '')] ?? null;
    if (!atlasCfg) return null;
    const texture = this.textures?.get?.(atlasCfg.atlasKey);
    const prefix = atlasFramePrefix(atlasCfg);
    const damageFrame = prefix ? `${prefix}/dmg.png` : 'dmg.png';
    if (!texture?.has?.(damageFrame)) return null;
    return { atlasCfg, damageFrame };
  }

  applyUnitStaticArtFrame(vu, atlasKey, frameName) {
    if (!vu?.art?.active || !atlasKey || !frameName) return;
    vu.art.anims?.stop?.();
    if (vu.art.texture?.key !== atlasKey) {
      vu.art.setTexture(atlasKey, frameName);
    } else if (vu.art.frame?.name !== frameName) {
      vu.art.setFrame(frameName);
    }
    if (vu.artOverlay?.active) {
      vu.artOverlay.setTexture(atlasKey, frameName);
      vu.artOverlay.setPosition(Number(vu.art.x ?? 0), Number(vu.art.y ?? 0));
      vu.artOverlay.setScale(Number(vu.art.scaleX ?? 1), Number(vu.art.scaleY ?? 1));
      vu.artOverlay.setFlipX(Boolean(vu.art.flipX));
      vu.artOverlay.setAngle(Number(vu.art.angle ?? 0));
      vu.artOverlay.setOrigin(Number(vu.art.originX ?? 0.5), Number(vu.art.originY ?? 1));
      vu.artOverlay.setDepth(Number(vu.art.depth ?? 0) + 0.1);
    }
  }

  refreshPreparedAttackPoseFrames(nowMs = Number(this.time?.now ?? 0)) {
    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;
    if (phase !== 'battle' || result) return;
    for (const core of (this.battleState?.units ?? [])) {
      if (!core || core.dead || core.zone !== 'board') continue;
      const preparedAttackFrames = this.getPreparedAttackStaticFrames(core);
      if (!preparedAttackFrames) continue;

      const vu = this.unitSys?.findUnit?.(core.id);
      if (!vu?.art?.active) continue;
      const runtime = this.attachUnitRuntime(vu, core.id);
      if (!runtime) continue;
      if (vu._moveTween || runtime._castAnimPlaying || vu._deathPrepActive) continue;
      if (Number(runtime._skillFrameUntilMs ?? 0) > nowMs) continue;
      const damageFrameInfo = this.getUnitDamageStaticFrame(core);
      const attackActive = Number(runtime._preparedAttackFrameUntilMs ?? 0) > nowMs;
      const damageActive =
        !!damageFrameInfo &&
        Number(runtime._damageFrameUntilMs ?? 0) > nowMs &&
        !attackActive;
      if (damageActive) {
        this.applyUnitStaticArtFrame(vu, damageFrameInfo.atlasCfg.atlasKey, damageFrameInfo.damageFrame);
        continue;
      }
      if (Number(runtime._counterRecoveryUntilMs ?? 0) > nowMs) {
        this.applyUnitStaticArtFrame(vu, preparedAttackFrames.atlasCfg.atlasKey, preparedAttackFrames.idleAttackFrame);
        continue;
      }
      const cycleActive = Number(runtime._preparedAttackCycleUntilMs ?? 0) > nowMs;
      const idleAttack2Active =
        cycleActive &&
        Number(runtime._preparedAttackIdleAttack2FromMs ?? Infinity) <= nowMs;
      if (!cycleActive && !attackActive) continue;

      const targetFrame = attackActive
        ? preparedAttackFrames.attackFrame
        : preparedAttackFrames.idleAttackFrame;
      runtime._preparedAttackIdleAttack2Active = idleAttack2Active;
      this.applyUnitStaticArtFrame(vu, preparedAttackFrames.atlasCfg.atlasKey, targetFrame);
    }
  }

  syncTimedBattleVisualTransitions(nowMs = Number(this.time?.now ?? 0)) {
    const phase = this.battleState?.phase ?? 'prep';
    const result = this.battleState?.result ?? null;
    if (phase !== 'battle' || result) return;
      let needsRenderSync = false;

    for (const core of (this.battleState?.units ?? [])) {
      if (!core || core.dead || core.zone !== 'board') continue;
      const vu = this.unitSys?.findUnit?.(core.id);
      if (!vu?.art?.active) continue;
      const runtime = this.attachUnitRuntime(vu, core.id);
      if (!runtime) continue;

      const skillActive = Number(runtime._skillFrameUntilMs ?? 0) > nowMs;
      const attackFrameActive = Number(runtime._preparedAttackFrameUntilMs ?? 0) > nowMs;
      const damageFrameInfo = this.getUnitDamageStaticFrame(core);
      const damageActive =
        !!damageFrameInfo &&
        Number(runtime._damageFrameUntilMs ?? 0) > nowMs &&
        !skillActive &&
        !attackFrameActive;
      const counterRecoveryActive =
        Number(runtime._counterRecoveryUntilMs ?? 0) > nowMs &&
        !skillActive;

      if (Boolean(runtime._timedSkillFrameActive) !== skillActive) {
        runtime._timedSkillFrameActive = skillActive;
        needsRenderSync = true;
      }
      if (Boolean(runtime._timedCounterRecoveryActive) !== counterRecoveryActive) {
        runtime._timedCounterRecoveryActive = counterRecoveryActive;
        needsRenderSync = true;
      }
      if (Boolean(runtime._timedDamageFrameActive) !== damageActive) {
        runtime._timedDamageFrameActive = damageActive;
        needsRenderSync = true;
      }
    }

    if (needsRenderSync) this.renderFromState();
  }

  getKnightMirroredAnchorShiftPx(unitLike, q, r, mirrored) {
    if (!unitLike || String(unitLike.type ?? '') !== 'Knight') return 0;
    if (!mirrored) return 0;
    const span = getUnitCellSpanX(unitLike);
    if (span <= 1) return 0;
    const lift = getUnitGroundLiftPx(unitLike.type);
    const anchorGround = this.hexToGroundPixel(q, r, lift);
    const leftGround = this.hexToGroundPixel(q - (span - 1), r, lift);
    return Number(anchorGround?.x ?? 0) - Number(leftGround?.x ?? 0);
  }

  getUnitArtWorldXByFacing(unitLike, q, r, mirrored) {
    const lift = getUnitGroundLiftPx(unitLike?.type);
    const g = this.hexToGroundPixel(q, r, lift);
    return Number(g?.x ?? 0)
      + getUnitArtOffsetXPx(unitLike?.type, mirrored)
      - this.getKnightMirroredAnchorShiftPx(unitLike, q, r, mirrored);
  }

  getUnitArtScreenXByFacing(unitLike, centerX, mirrored) {
    return Number(centerX ?? 0) + getUnitArtOffsetXPx(unitLike?.type, mirrored);
  }

  ensureIllusionArtOverlay(vu) {
    if (!vu?.art?.active) return null;
    if (vu.artOverlay?.active) return vu.artOverlay;
    const overlay = this.add.sprite(
      Number(vu.art.x ?? 0),
      Number(vu.art.y ?? 0),
      vu.art.texture?.key ?? '__MISSING',
      vu.art.frame?.name ?? undefined,
    )
      .setOrigin(Number(vu.art.originX ?? 0.5), Number(vu.art.originY ?? 1))
      .setScale(Number(vu.art.scaleX ?? 1), Number(vu.art.scaleY ?? 1))
      .setFlipX(Boolean(vu.art.flipX))
      .setDepth(Number(vu.art.depth ?? 0) + 0.1)
      .setTintFill(ILLUSION_MASK_COLOR)
      .setAlpha(ILLUSION_MASK_ALPHA);
    vu.artOverlay = overlay;
    return overlay;
  }

  ensureUnitDamageFlashOverlay(vu) {
    if (!vu?.art?.active) return null;
    const existing = this.unitSys?.getManagedOverlay?.(vu.id ?? vu, 'damage_flash');
    if (existing?.active) return existing;
    const overlay = this.add.sprite(
      Number(vu.art.x ?? 0),
      Number(vu.art.y ?? 0),
      vu.art.texture?.key ?? '__MISSING',
      vu.art.frame?.name ?? undefined,
    )
      .setOrigin(Number(vu.art.originX ?? 0.5), Number(vu.art.originY ?? 1))
      .setScale(Number(vu.art.scaleX ?? 1), Number(vu.art.scaleY ?? 1))
      .setFlipX(Boolean(vu.art.flipX))
      .setDepth(Number(vu.art.depth ?? 0) + 0.2)
      .setTintFill(UNIT_DAMAGE_FLASH_COLOR)
      .setAlpha(0)
      .setVisible(false);
    vu.damageFlashOverlay = overlay;
    this.unitSys?.registerManagedOverlay?.(vu.id ?? vu, 'damage_flash', overlay, {
      copyArtFrame: true,
      depthOffset: 0.2,
      hideWhenArtHidden: true,
    });
    return overlay;
  }

  ensureUnitFrameBoundVfxOverlay(vu, def) {
    if (!vu?.art?.active) return null;
    if (!def) return null;
    const overlayKey = `frame_bound_vfx:${def.key}`;
    const existing = this.unitSys?.getManagedOverlay?.(vu.id ?? vu, overlayKey);
    if (existing?.active) return existing;
    const overlay = this.add.sprite(
      Number(vu.art.x ?? 0),
      Number(vu.art.y ?? 0),
      def.atlasKey,
      def.firstFrame,
    )
      .setOrigin(Number(vu.art.originX ?? 0.5), Number(vu.art.originY ?? 1))
      .setScale(Number(vu.art.scaleX ?? 1), Number(vu.art.scaleY ?? 1))
      .setFlipX(Boolean(vu.art.flipX))
      .setDepth(Number(vu.art.depth ?? 0) + Number(def.depthOffset ?? 0))
      .setVisible(false);
    overlay.on?.('animationcomplete', () => {
      if (!overlay?.active) return;
      overlay.setVisible(false);
    });
    if (!(vu._frameBoundVfxOverlays instanceof Map)) vu._frameBoundVfxOverlays = new Map();
    vu._frameBoundVfxOverlays.set(def.key, overlay);
    this.unitSys?.registerManagedOverlay?.(vu.id ?? vu, overlayKey, overlay, {
      depthOffset: Number(def.depthOffset ?? 0),
      offsetXPx: Number(def.offsetXPx ?? 0),
      offsetYPx: Number(def.offsetYPx ?? 0),
      mirrorOffsetX: def.mirrorOffsetX !== false,
      hideWhenArtHidden: true,
    });
    return overlay;
  }

  playUnitDamageFlash(vu) {
    if (!vu?.art?.active) return null;
    const overlay = this.ensureUnitDamageFlashOverlay(vu);
    if (!overlay?.active) return null;

    this.tweens.killTweensOf(overlay);
    overlay
      .setVisible(Boolean(vu.art.visible))
      .setTintFill(UNIT_DAMAGE_FLASH_COLOR)
      .setAlpha(0);

    this.tweens.add({
      targets: overlay,
      alpha: UNIT_DAMAGE_FLASH_ALPHA,
      duration: UNIT_DAMAGE_FLASH_IN_MS,
      ease: 'Quad.Out',
      onComplete: () => {
        if (!overlay?.active) return;
        this.tweens.add({
          targets: overlay,
          alpha: 0,
          duration: UNIT_DAMAGE_FLASH_OUT_MS,
          ease: 'Quad.In',
          onComplete: () => {
            if (!overlay?.active) return;
            overlay.setAlpha(0).setVisible(false);
          },
        });
      },
    });

    return overlay;
  }

  getUnitFrameBoundVfxOverlay(vu, def) {
    if (!vu || !def) return null;
    return vu._frameBoundVfxOverlays?.get?.(def.key) ?? null;
  }

  startUnitFrameBoundVfx(vu, def) {
    if (!vu?.art?.active || !def || !this.anims.exists(def.animKey)) return null;
    const overlay = this.ensureUnitFrameBoundVfxOverlay(vu, def);
    if (!overlay?.active) return null;
    if (!(vu._activeFrameBoundVfxKeys instanceof Set)) vu._activeFrameBoundVfxKeys = new Set();
    if (vu._activeFrameBoundVfxKeys.has(def.key)) return overlay;

    vu._activeFrameBoundVfxKeys.add(def.key);
    overlay
      .setVisible(Boolean(vu.art.visible))
      .setAlpha(1)
      .play(def.animKey, true);
    return overlay;
  }

  stopUnitFrameBoundVfx(vu, def) {
    if (!vu || !def) return;
    vu._activeFrameBoundVfxKeys?.delete?.(def.key);
    const overlay = this.getUnitFrameBoundVfxOverlay(vu, def);
    if (!overlay?.active) return;
    overlay.anims?.stop?.();
    overlay.setVisible(false);
  }

  syncUnitFrameBoundVfxState(_nowMs = Number(this.time?.now ?? 0)) {
    for (const core of (this.battleState?.units ?? [])) {
      const defs = UNIT_FRAME_BOUND_VFX_DEFS_BY_TYPE[String(core?.type ?? '')] ?? null;
      if (!defs?.length) continue;
      const vu = this.unitSys?.findUnit?.(core?.id);
      if (!vu) continue;
      const currentFrameName = String(vu.art?.frame?.name ?? '');
      for (const def of defs) {
        const triggerFrameName = String(def.getTriggerFrameName?.(this, core, vu) ?? '');
        if (currentFrameName && currentFrameName === triggerFrameName) {
          this.startUnitFrameBoundVfx?.(vu, def);
        } else {
          this.stopUnitFrameBoundVfx?.(vu, def);
        }
      }
    }
  }

  applyIllusionVisualState(coreUnit, vu) {
    if (!vu) return;
    const isIllusion = Boolean(coreUnit?.isIllusion);

    if (!vu.art?.active) {
      vu.artOverlay?.destroy?.();
      vu.artOverlay = null;
      return;
    }

    vu.art.setAlpha(isIllusion ? ILLUSION_ART_ALPHA : 1);

    if (!isIllusion) {
      vu.artOverlay?.destroy?.();
      vu.artOverlay = null;
      return;
    }

    const overlay = this.ensureIllusionArtOverlay(vu);
    if (!overlay) return;
    overlay
      .setVisible(Boolean(vu.art.visible))
      .setTintFill(ILLUSION_MASK_COLOR)
      .setAlpha(ILLUSION_MASK_ALPHA);
  }

  setUnitVisualFacingTowardX(vu, targetX) {
    if (!vu?.art?.active) return;

    // Determine facing by logical unit center, not art offset.
    // For large units art can be heavily shifted, which can zero-out dx on some moves.
    const currentX = Number(vu.sprite?.x ?? vu.art.x ?? 0);
    const dx = Number(targetX) - currentX;
    if (!Number.isFinite(dx) || Math.abs(dx) < 1) return;

    // Atlases are authored facing right by default.
    // Keep facing + horizontal art offset in sync, otherwise mirrored turns "slide" sideways.
    const mirrored = dx < 0;
    if (vu._artMoveTween) {
      try { vu._artMoveTween.stop(); } catch {}
      vu._artMoveTween = null;
    }
    vu._artFacingMirrored = mirrored;
    vu.art.setFlipX(mirrored);
    if (vu.artOverlay?.active) vu.artOverlay.setFlipX(mirrored);

    if (Number.isFinite(vu.q) && Number.isFinite(vu.r)) {
      vu.art.setX(this.getUnitArtWorldXByFacing(vu, vu.q, vu.r, mirrored));
      if (vu.artOverlay?.active) vu.artOverlay.setX(vu.art.x);
    }
  }

  faceUnitVisualTowardCoreUnit(vu, targetCoreUnit) {
    if (!vu || !targetCoreUnit) return;
    const targetPos = this.getUnitScreenAnchor(targetCoreUnit);
    if (!targetPos) return;
    this.setUnitVisualFacingTowardX(vu, targetPos.x);
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

  findLikelyMergeTargetForMissingVisual(donorVu, visibleUnits, visualById = null) {
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
      if (Number(u.rank ?? 1) <= donorRank) continue; // target must be higher rank than donor

      const targetVu = visualById?.get?.(u.id) ?? this.unitSys.findUnit(u.id);
      const nextRank = Number(u.rank ?? 1);
      // Existing visual target: it must really rank-up in this tick.
      // New visual target (no targetVu yet): allow only direct rank step (r -> r+1),
      // which is the real merge target for this donor.
      if (targetVu) {
        const prevRank = Number(targetVu.rank ?? 1);
        if (!(nextRank > prevRank)) continue;
      } else {
        if (nextRank !== donorRank + 1) continue;
      }
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

  bindUnitHoverGlow(vu) {
    const handle = vu?.dragHandle;
    if (!handle) return;
    handle.setDataEnabled?.();
    if (handle.data?.get?.('hoverGlowBound')) return;
    handle.data?.set?.('hoverGlowBound', true);

    handle.on('pointerover', () => {
      if (this.draggingUnitId != null) return;
      if (this.battleState?.phase === 'battle') return;
      if (!handle.input?.enabled) return;

      const unitId = handle.data?.get?.('unitId');
      if (unitId == null) return;
      const core = this.getCoreUnitById?.(unitId);
      if (!core || core.dead) return;

      if (core.zone === 'board') {
        this.hoverPickupCell = { area: 'board', q: core.q, r: core.r, unitId: core.id };
      } else if (core.zone === 'bench') {
        const slot = Number.isInteger(core.benchSlot) ? core.benchSlot : 0;
        this.hoverPickupCell = { area: 'bench', slot, unitId: core.id };
      } else {
        this.hoverPickupCell = null;
      }
      this.drawGrid();
    });

    handle.on('pointerout', () => {
      const unitId = handle.data?.get?.('unitId');
      if (this.hoverPickupCell?.unitId != null && String(this.hoverPickupCell.unitId) !== String(unitId)) return;
      this.hoverPickupCell = null;
      this.drawGrid();
    });

    handle.on('pointerup', (pointer) => {
      if (!pointer) return;
      if (this.draggingUnitId != null) return;
      const suppressUntil = Number(this._unitInfoSuppressUntil ?? 0);
      const nowMs = Number(this.time?.now ?? 0);
      if (nowMs < suppressUntil) return;

      const moved = Phaser.Math.Distance.Between(
        Number(pointer.downX ?? pointer.worldX ?? 0),
        Number(pointer.downY ?? pointer.worldY ?? 0),
        Number(pointer.worldX ?? 0),
        Number(pointer.worldY ?? 0)
      );
      if (moved > 8) return;

      const unitId = handle.data?.get?.('unitId');
      if (unitId == null) return;
      const core = this.getCoreUnitById?.(unitId);
      if (!core || core.dead) return;
      this.toggleUnitInfoForUnit?.(core);
    });
  }

  initUnitInfoUi() {
    this.unitInfoVisible = false;
    this.unitInfoUnitId = null;

    const modal = this.add.container(0, 0)
      .setDepth(15020)
      .setScrollFactor(0)
      .setVisible(false);

    const w = UNIT_INFO_MODAL_MIN_W;
    const h = UNIT_INFO_MODAL_H;
    const shadow = this.add.rectangle(4, 6, w, h, 0x000000, 0.38).setOrigin(0.5, 0.5);
    const bg = this.add.rectangle(0, 0, w, h, 0x1f1410, 0.95).setOrigin(0.5, 0.5).setStrokeStyle(2, 0xc18a42, 0.95);
    const portraitPanel = this.add.rectangle(-86, -82, 116, 116, 0x0f0f0f, 0.9).setOrigin(0.5, 0.5).setStrokeStyle(1, 0x6f5d3a, 0.9);
    const portrait = this.add.image(-86, -82, INFO_PORTRAIT_ATLAS_KEY, '')
      .setOrigin(0.5, 0.5)
      .setDisplaySize(108, 108)
      .setVisible(false);
    const portraitRankIcon = this.add.image(-86, -26, 'rank1')
      .setOrigin(0.5, 1)
      .setScale(0.24)
      .setVisible(false);
    const portraitFallback = this.add.text(-86, -82, '?', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '42px',
      color: '#f3dba5',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    const title = this.add.text(-18, -130, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '18px',
      color: '#ffe7b6',
      fontStyle: 'bold',
      wordWrap: { width: 180, useAdvancedWrap: true },
    }).setOrigin(0, 0);
    const titleFigureIcon = this.add.image(-18, -120, 'figure_pawn_shine')
      .setOrigin(0.5, 0.5)
      .setDisplaySize(20, 20)
      .setVisible(false);

    const stats = this.add.text(-18, -106, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '14px',
      color: '#f2efe9',
      lineSpacing: 2,
      wordWrap: { width: 190, useAdvancedWrap: true },
    }).setOrigin(0, 0);

    const raceUnderPortrait = this.add.text(-86, 0, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '12px',
      color: '#d9c3a2',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 116, useAdvancedWrap: true },
    }).setOrigin(0.5, 0.5);

    const abilityKind = this.add.text(-132, 10, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '13px',
      color: '#ffcf84',
      fontStyle: 'bold',
    }).setOrigin(0, 0);

    const abilityDesc = this.add.text(-132, 30, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '13px',
      color: '#f2efe9',
      wordWrap: { width: 262, useAdvancedWrap: true },
      lineSpacing: 1,
    }).setOrigin(0, 0);

    const funLine1 = this.add.text(-132, 210, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '12px',
      color: '#d9c3a2',
      fontStyle: 'italic',
      wordWrap: { width: 262, useAdvancedWrap: true },
    }).setOrigin(0, 0);

    const funLine2 = this.add.text(-132, 228, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '12px',
      color: '#cfb38a',
      fontStyle: 'italic',
      wordWrap: { width: 262, useAdvancedWrap: true },
    }).setOrigin(0, 0);

    const hit = this.add.zone(0, 0, w, h).setOrigin(0.5, 0.5).setInteractive();
    modal.add([shadow, bg, portraitPanel, portrait, portraitFallback, portraitRankIcon, raceUnderPortrait, title, titleFigureIcon, stats, abilityKind, abilityDesc, funLine1, funLine2, hit]);

    this.unitInfoModal = modal;
    this.unitInfoModalBg = bg;
    this.unitInfoModalShadow = shadow;
    this.unitInfoHit = hit;
    this.unitInfoPortrait = portrait;
    this.unitInfoPortraitRankIcon = portraitRankIcon;
    this.unitInfoPortraitFallback = portraitFallback;
    this.unitInfoTitle = title;
    this.unitInfoTitleFigureIcon = titleFigureIcon;
    this.unitInfoStats = stats;
    this.unitInfoRaceUnderPortrait = raceUnderPortrait;
    this.unitInfoAbilityKind = abilityKind;
    this.unitInfoAbilityDesc = abilityDesc;
    this.unitInfoFunLine1 = funLine1;
    this.unitInfoFunLine2 = funLine2;

    this._unitInfoOutsideTapHandler = (_pointer, currentlyOver) => {
      if (!this.unitInfoVisible) return;
      const over = currentlyOver || [];
      const overModal = this.unitInfoHit && over.includes(this.unitInfoHit);
      if (!overModal) this.hideUnitInfoModal?.();
    };
    this.input.on('pointerdown', this._unitInfoOutsideTapHandler);
  }

  updateUnitInfoModalAdaptiveSize(hasFigureIcon = false) {
    const modal = this.unitInfoModal;
    const bg = this.unitInfoModalBg;
    const shadow = this.unitInfoModalShadow;
    const hit = this.unitInfoHit;
    const title = this.unitInfoTitle;
    if (!modal || !bg || !shadow || !hit || !title) return;

    const minHalfW = Math.floor(UNIT_INFO_MODAL_MIN_W / 2);
    const maxHalfW = Math.floor(UNIT_INFO_MODAL_MAX_W / 2);
    const titleX = Number(title.x ?? -18);
    const titleW = Number(title.width ?? 0);
    const iconExtra = hasFigureIcon ? 24 : 0;
    const rightNeed = Math.ceil(titleX + titleW + iconExtra + 16);
    const leftNeed = 146; // keeps left portrait + text paddings safe
    const nextHalfW = Phaser.Math.Clamp(Math.max(minHalfW, rightNeed, leftNeed), minHalfW, maxHalfW);
    const nextW = nextHalfW * 2;

    bg.setSize(nextW, UNIT_INFO_MODAL_H);
    shadow.setSize(nextW, UNIT_INFO_MODAL_H);
    hit.setSize(nextW, UNIT_INFO_MODAL_H);
    this.unitInfoModalHalfW = nextHalfW;
    this.unitInfoModalHalfH = Math.floor(UNIT_INFO_MODAL_H / 2);
  }

  getUnitAbilityInfo(core) {
    const abilityType = String(core?.abilityType ?? 'none');
    const abilityKey = String(core?.abilityKey ?? '');
    const kind = ABILITY_KIND_LABEL[abilityType] ?? ABILITY_KIND_LABEL.none;
    const desc = ABILITY_DESC_BY_KEY[abilityKey] ?? (abilityType === 'none' ? 'У этого юнита пока нет способности.' : 'Описание способности пока не добавлено.');
    return { kind, desc };
  }

  getUnitFunLines(type) {
    const lines = UNIT_FUN_LINES_BY_TYPE[type] ?? UNIT_FUN_LINES_BY_TYPE.default;
    return [String(lines?.[0] ?? ''), String(lines?.[1] ?? '')];
  }

  positionUnitInfoModalNearCore(core) {
    if (!this.unitInfoModal || !core) return;
    const vu = this.unitSys?.findUnit?.(core.id);
    const bounds = vu?.art?.active
      ? vu.art.getBounds?.()
      : (vu?.sprite?.active ? vu.sprite.getBounds?.() : null);
    const anchor = this.getUnitScreenAnchor(core) ?? { x: this.scale.width * 0.5, y: this.scale.height * 0.5 };
    const halfW = Number(this.unitInfoModalHalfW ?? 140);
    const halfH = Number(this.unitInfoModalHalfH ?? 143);
    const margin = 14;
    const rightEdge = Number(bounds?.right ?? (anchor.x ?? this.scale.width * 0.5) + this.hexSize);
    const leftEdge = Number(bounds?.left ?? (anchor.x ?? this.scale.width * 0.5) - this.hexSize);
    let x = rightEdge + halfW; // modal left edge touches unit right edge
    let y = Number(bounds?.centerY ?? anchor.y ?? this.scale.height * 0.5) - 10;
    const minX = halfW + margin;
    const maxX = this.scale.width - halfW - margin;
    const minY = halfH + margin;
    const maxY = this.scale.height - halfH - margin;
    // If it doesn't fit on the right, attach it to the unit's left edge.
    if (x > maxX) {
      x = leftEdge - halfW; // modal right edge touches unit left edge
    }
    x = Phaser.Math.Clamp(x, minX, maxX);
    y = Phaser.Math.Clamp(y, minY, maxY);
    this.unitInfoModal.setPosition(x, y);
  }

  showUnitInfoModal(core) {
    if (!core || !this.unitInfoModal) return;
    this.collapseShopUi?.();
    this.hoverPickupCell = null;
    this.selected = null;
    this.unitInfoUnitId = core.id;
    this.unitInfoVisible = true;

    const ability = this.getUnitAbilityInfo(core);
    const [fun1, fun2] = this.getUnitFunLines(core.type);
    const hp = Number(core.hp ?? 0);
    const maxHp = Number(core.maxHp ?? hp);
    const atk = Number(core.atk ?? 0);
    const atkSpd = Number(core.attackSpeed ?? 1);
    const moveSpd = Number(core.moveSpeed ?? 1);
    const moveWaitMs = getStepMoveWaitMs(moveSpd);
    const rangeMax = Number(core.attackRangeMax ?? 1);
    const rangeFull = Number(core.attackRangeFullDamage ?? rangeMax);
    const projectileSpeed = Number(core.projectileSpeed ?? 0);
    const accuracy = Math.max(0, Math.min(1, Number(core.accuracy ?? 0.8)));
    const isMelee = rangeMax <= 1;
    const isLongRanged = rangeMax > 2;
    const abilityCooldown = Math.max(0, Number(core.abilityCooldown ?? 0));

    this.unitInfoTitle?.setText(String(core.type ?? 'UNKNOWN').toUpperCase());
    const powerTypeKey = String(core.powerType ?? '').trim();
    const figureIconKey = INFO_FIGURE_ICON_BY_POWER_TYPE[powerTypeKey] ?? null;
    const hasFigureIcon = !!(this.unitInfoTitleFigureIcon && figureIconKey && this.textures?.exists?.(figureIconKey));
    this.updateUnitInfoModalAdaptiveSize?.(hasFigureIcon);
    if (hasFigureIcon) {
      const titleX = Number(this.unitInfoTitle?.x ?? -18);
      const titleY = Number(this.unitInfoTitle?.y ?? -130);
      const titleW = Number(this.unitInfoTitle?.width ?? 0);
      const titleH = Number(this.unitInfoTitle?.height ?? 0);
      const iconHalfH = Math.max(0, Number(this.unitInfoTitleFigureIcon?.displayHeight ?? 20) * 0.5);
      const iconX = titleX + titleW + 14;
      const iconY = titleY + titleH - iconHalfH - 3;
      this.unitInfoTitleFigureIcon
        .setTexture(figureIconKey)
        .setPosition(iconX, iconY)
        .setVisible(true);
    } else {
      this.unitInfoTitleFigureIcon?.setVisible(false);
    }
    const statsLines = [
      `HP: ${hp}/${maxHp}`,
      `ATK: ${atk}`,
      `ATK SPD: ${atkSpd.toFixed(2)}/s`,
      `MOVE WAIT: ${moveWaitMs} ms`,
      `ACCURACY: ${Math.round(accuracy * 100)}%`,
      isMelee ? 'RANGE: MELEE' : (isLongRanged ? `RANGE: ${rangeFull}` : `RANGE: ${rangeMax}`),
    ];
    if (!isMelee) {
      if (!isLongRanged) {
        statsLines.push(`FULL DMG RANGE: ${rangeFull}`);
      }
      statsLines.push(`PROJECTILE SPD: ${projectileSpeed.toFixed(2)}`);
    }
    if (String(core.abilityType ?? 'none') === 'active' && abilityCooldown > 0) {
      statsLines.push(`ABILITY CD: ${abilityCooldown.toFixed(1)}s`);
    }
    this.unitInfoStats?.setText(statsLines.join('\n'));
    this.unitInfoRaceUnderPortrait?.setText(String(core.race ?? '-').toUpperCase());
    this.unitInfoAbilityKind?.setText(`[${ability.kind}]`);
    this.unitInfoAbilityDesc?.setText(ability.desc);
    this.unitInfoFunLine1?.setText(fun1);
    this.unitInfoFunLine2?.setText(fun2);

    // Dynamic vertical flow: stats -> ability -> fun lines.
    const statsX = Number(this.unitInfoStats?.x ?? -18);
    const statsY = Number(this.unitInfoStats?.y ?? -106);
    const statsH = Number(this.unitInfoStats?.height ?? 0);
    const abilityKindY = statsY + statsH + 10;
    const abilityDescY = abilityKindY + Number(this.unitInfoAbilityKind?.height ?? 14) + 4;
    const abilityDescH = Number(this.unitInfoAbilityDesc?.height ?? 0);
    const fun1Y = abilityDescY + abilityDescH + 10;
    const fun2Y = fun1Y + Number(this.unitInfoFunLine1?.height ?? 14) + 2;

    this.unitInfoAbilityKind?.setPosition(-132, abilityKindY);
    this.unitInfoAbilityDesc?.setPosition(-132, abilityDescY);
    this.unitInfoFunLine1?.setPosition(-132, fun1Y);
    this.unitInfoFunLine2?.setPosition(-132, fun2Y);

    const frame = infoPortraitFrameForUnitType(core.type);
    if (frame && this.textures?.exists?.(INFO_PORTRAIT_ATLAS_KEY) && this.textures.get(INFO_PORTRAIT_ATLAS_KEY)?.has?.(frame)) {
      this.unitInfoPortrait?.setTexture(INFO_PORTRAIT_ATLAS_KEY, frame);
      this.unitInfoPortrait?.setVisible(true);
      this.unitInfoPortraitFallback?.setVisible(false);
    } else {
      this.unitInfoPortrait?.setVisible(false);
      this.unitInfoPortraitFallback?.setVisible(true);
    }

    const rank = Math.max(1, Math.min(3, Number(core.rank ?? 1)));
    const rankKey = `rank${rank}`;
    if (this.unitInfoPortraitRankIcon && this.textures?.exists?.(rankKey)) {
      this.unitInfoPortraitRankIcon.setTexture(rankKey).setVisible(true);
    } else {
      this.unitInfoPortraitRankIcon?.setVisible(false);
    }

    this.positionUnitInfoModalNearCore(core);
    this.unitInfoModal.setVisible(true);
  }

  hideUnitInfoModal() {
    this.unitInfoVisible = false;
    this.unitInfoUnitId = null;
    this.unitInfoModal?.setVisible(false);
  }

  toggleUnitInfoForUnit(core) {
    if (!core) return;
    if (this.unitInfoVisible && String(this.unitInfoUnitId) === String(core.id)) {
      this.hideUnitInfoModal?.();
      return;
    }
    this.showUnitInfoModal?.(core);
  }

  collectVisibleUnitsForRender(phase) {
    const visibleUnits = [];
    const aliveIds = new Set();
    for (const u of (this.battleState?.units ?? [])) {
      if (u.zone === 'swallowed') continue;
      if (!this.testSceneActive && phase === 'prep' && u.team === 'enemy') continue;
      if (!this.testSceneActive && phase === 'entry' && u.team === 'enemy' && !this.entryEnemyUnitsVisible) continue;
      visibleUnits.push(u);
      aliveIds.add(u.id);
    }
    return { visibleUnits, aliveIds };
  }

  reconcileVisualUnits(visibleUnits, aliveIds, currentVisualById) {
    for (const vu of this.unitSys.state.units.slice()) {
      if (!aliveIds.has(vu.id)) {
        const pendingAutoSellFx = this.pendingServerAutoSellFxIds?.has?.(Number(vu.id));
        if (pendingAutoSellFx && !this.trashRemoveAnimatingIds?.has?.(vu.id)) {
          this.playTrashCoinBurstFx?.();
          this.playTrashRemoveFx?.(vu.id, () => {
            this.unitSys?.destroyUnit?.(vu.id);
            this.clearUnitRuntime?.(vu.id);
            this.pendingServerAutoSellFxIds?.delete?.(Number(vu.id));
          });
          continue;
        }
        if (this.trashRemoveAnimatingIds?.has?.(vu.id)) continue;
        if (this.mergeAbsorbAnimatingIds?.has(vu.id)) continue;

        const mergeTarget = this.findLikelyMergeTargetForMissingVisual(vu, visibleUnits, currentVisualById);
        if (mergeTarget) {
          this.playMergeAbsorbAnimation(vu, mergeTarget);
          continue;
        }

        this.unitSys.destroyUnit(vu.id);
        this.clearUnitRuntime?.(vu.id);
      }
    }

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
          .flatMap((vu) => getBoardCellsForUnit(vu).map((c) => `${c.q},${c.r}`))
      );
    }

    return new Map((this.unitSys?.state?.units ?? []).map((vu) => [vu.id, vu]));
  }

  syncBattleVisualFrame(nowMs) {
    this.syncTimedBattleVisualTransitions?.(nowMs);
    this.refreshPreparedAttackPoseFrames?.(nowMs);
    this.syncUnitFrameBoundVfxState?.(nowMs);
  }

  syncPendingBattleActionAnimations(byId) {
    if (this.pendingAttackAnimIds?.size) {
      for (const id of this.pendingAttackAnimIds) {
        const vu = byId.get(id);
        if (!vu?.art) continue;
        const runtime = this.attachUnitRuntime(vu, id);
        const attackerCore = this.getCoreUnitById?.(id);
        if (attackerCore && attackerCore.zone === 'board' && !attackerCore.dead) {
          this.unitSys.setUnitPos(attackerCore.id, attackerCore.q, attackerCore.r, { tweenMs: 0 });
        }
        const targetCore = this.findClosestOpponentForFacing(attackerCore);
        this.faceUnitVisualTowardCoreUnit(vu, targetCore);
        runtime._attackAnimPlaying = true;
        runtime._attackAnimForceReplay = true;
      }
      this.pendingAttackAnimIds.clear();
    }

    if (this.pendingAbilityCastAnimIds?.size) {
      for (const id of this.pendingAbilityCastAnimIds) {
        const vu = byId.get(id);
        if (!vu?.art) continue;
        const runtime = this.attachUnitRuntime(vu, id);
        const casterCore = this.getCoreUnitById?.(id);
        if (casterCore && casterCore.zone === 'board' && !casterCore.dead) {
          this.unitSys.setUnitPos(casterCore.id, casterCore.q, casterCore.r, { tweenMs: 0 });
        }
        const targetCore = this.findClosestOpponentForFacing(casterCore);
        this.faceUnitVisualTowardCoreUnit(vu, targetCore);
        runtime._castAnimPlaying = true;
        runtime._castAnimForceReplay = true;
      }
      this.pendingAbilityCastAnimIds.clear();
    }
  }

  syncVisualUnitAnimationState(phase, byId) {
    const result = this.battleState?.result ?? null;
    this.syncPendingBattleActionAnimations(byId);

    for (const u of (this.battleState?.units ?? [])) {
      const vu = byId.get(u.id);
      if (!vu?.art) continue;
      const runtime = this.attachUnitRuntime(vu, u.id);
      if (!runtime) continue;
      if (this.draggingUnitId != null && String(u.id) === String(this.draggingUnitId)) continue;
      const wormFatActive =
        this.isWormFatCore?.(u) &&
        this.anims.exists(WORM_FAT_ANIMS.idle);
      const animDef = wormFatActive
        ? WORM_FAT_ANIMS
        : UNIT_ANIMS_BY_TYPE[u.type];
      if (!animDef) continue;

      if ((phase !== 'battle') || !!result) {
        const baseMirrored = (u.team === 'enemy');
        vu._artFacingMirrored = baseMirrored;
        vu.art.setFlipX(baseMirrored);
        if (vu.artOverlay?.active) vu.artOverlay.setFlipX(baseMirrored);
        if (result) {
          runtime._skillFrameUntilMs = 0;
          runtime._counterRecoveryUntilMs = 0;
          runtime._damageFrameUntilMs = 0;
          runtime._preparedAttackCycleUntilMs = 0;
          runtime._preparedAttackPoseUntilMs = 0;
          runtime._preparedAttackIdleAttack2FromMs = 0;
          runtime._preparedAttackIdleAttack2Active = false;
          runtime._preparedAttackFrameUntilMs = 0;
        }
        if (u.zone === 'board' && Number.isFinite(vu.q) && Number.isFinite(vu.r)) {
          vu.art.setX(this.getUnitArtWorldXByFacing(vu, vu.q, vu.r, baseMirrored));
          if (vu.artOverlay?.active) vu.artOverlay.setX(vu.art.x);
        } else {
          vu.art.setX(this.getUnitArtScreenXByFacing(vu, vu.sprite?.x, baseMirrored));
          if (vu.artOverlay?.active) vu.artOverlay.setX(vu.art.x);
        }
      }

      const castAnimEndAtMs = Number(runtime._abilityCastEndAtMs ?? NaN);
      if (runtime._castAnimPlaying && Number.isFinite(castAnimEndAtMs) && Number(this.time?.now ?? 0) >= castAnimEndAtMs) {
        runtime._castAnimPlaying = false;
        runtime._castAnimForceReplay = false;
      }

      const wantWalk =
        (phase === 'battle') &&
        !result &&
        (u.zone === 'board') &&
        !u.dead &&
        !!vu._moveTween;
      if (!vu._moveTween && runtime._replayMoveAbilityKey != null) {
        runtime._replayMoveAbilityKey = null;
      }
      const wantKnightChargeMove =
        wantWalk &&
        String(runtime._replayMoveAbilityKey ?? '') === 'knight_charge' &&
        this.anims.exists(KNIGHT_CHARGE_MOVE_ANIM);
      const wantAttack =
        !u.dead &&
        this.anims.exists(animDef.attack) &&
        !!runtime._attackAnimPlaying;
      const wantCast =
        !u.dead &&
        !!animDef.spell &&
        this.anims.exists(animDef.spell) &&
        !!runtime._castAnimPlaying;
      const skillFrameInfo = this.getUnitSkillStaticFrame(u);
      const damageFrameInfo = this.getUnitDamageStaticFrame(u);
      const preparedAttackFrames = this.getPreparedAttackStaticFrames(u);
      const preparedAttackCycleUntilMs = Number(runtime._preparedAttackCycleUntilMs ?? 0);
      const preparedAttackIdleAttack2FromMs = Number(runtime._preparedAttackIdleAttack2FromMs ?? Infinity);
      const preparedAttackFrameUntilMs = Number(runtime._preparedAttackFrameUntilMs ?? 0);
      const preparedAttackFrameActive =
        !!preparedAttackFrames &&
        preparedAttackFrameUntilMs > Number(this.time?.now ?? 0);
      const damageFrameActive =
        !!damageFrameInfo &&
        Number(runtime._damageFrameUntilMs ?? 0) > Number(this.time?.now ?? 0) &&
        !preparedAttackFrameActive;
      const preparedAttackIdleAttack2Active =
        !!preparedAttackFrames &&
        !preparedAttackFrameActive &&
        preparedAttackCycleUntilMs > Number(this.time?.now ?? 0) &&
        preparedAttackIdleAttack2FromMs <= Number(this.time?.now ?? 0);
      const isPreparedAttackFrameShown = !!(
        preparedAttackFrames &&
        (
          vu.art?.frame?.name === preparedAttackFrames.idleAttackFrame ||
          vu.art?.frame?.name === preparedAttackFrames.attackFrame
        )
      );
      const isSkillFrameShown = !!(
        skillFrameInfo &&
        vu.art?.frame?.name === skillFrameInfo.skillFrame
      );
      const atlasFrameType = wormFatActive ? 'WormFat' : u.type;
      const atlasCfgForFrames = UNIT_ATLAS_DEF_BY_TYPE[atlasFrameType] ?? UNIT_ATLAS_DEF_BY_TYPE[u.type] ?? null;
      const staticWalkFrame = atlasCfgForFrames
        ? (
          this.textures?.get?.(atlasCfgForFrames.atlasKey)?.has?.(atlasWalkFirstFrame(atlasCfgForFrames))
            ? atlasWalkFirstFrame(atlasCfgForFrames)
            : atlasWalkFallbackFrame(atlasCfgForFrames)
        )
        : null;
      const deathPrepActive = Boolean(vu._deathPrepActive) && Number(vu._deathPrepUntilMs ?? 0) > Number(this.time?.now ?? 0);
      if (deathPrepActive) continue;
      const wantsSkillFrame =
        !!skillFrameInfo &&
        Number(runtime._skillFrameUntilMs ?? 0) > Number(this.time?.now ?? 0) &&
        (phase === 'battle') &&
        !result &&
        (u.zone === 'board') &&
        !u.dead;
      if (wantsSkillFrame) {
        runtime._staticWalkFrameActive = false;
        this.applyUnitStaticArtFrame(vu, skillFrameInfo.atlasCfg.atlasKey, skillFrameInfo.skillFrame);
        continue;
      }
      const wantsDamageFrame =
        !!damageFrameInfo &&
        damageFrameActive &&
        (phase === 'battle') &&
        !result &&
        (u.zone === 'board') &&
        !u.dead;
      if (wantsDamageFrame) {
        runtime._staticWalkFrameActive = false;
        this.applyUnitStaticArtFrame(vu, damageFrameInfo.atlasCfg.atlasKey, damageFrameInfo.damageFrame);
        continue;
      }
      const wantsCounterRecoveryIdle =
        !!preparedAttackFrames &&
        Number(runtime._counterRecoveryUntilMs ?? 0) > Number(this.time?.now ?? 0) &&
        Number(runtime._skillFrameUntilMs ?? 0) < Number(this.time?.now ?? 0) &&
        (phase === 'battle') &&
        !result &&
        (u.zone === 'board') &&
        !u.dead;
      if (wantsCounterRecoveryIdle) {
        runtime._staticWalkFrameActive = false;
        this.applyUnitStaticArtFrame(vu, preparedAttackFrames.atlasCfg.atlasKey, preparedAttackFrames.idleAttackFrame);
        continue;
      }
      const wantsPreparedAttackReadyIdle =
        !!preparedAttackFrames &&
        (phase === 'battle') &&
        !result &&
        (u.zone === 'board') &&
        !u.dead &&
        !wantWalk &&
        !wantKnightChargeMove &&
        !wantCast &&
        !wantAttack &&
        (isPreparedAttackFrameShown || isSkillFrameShown);
      if (wantsPreparedAttackReadyIdle) {
        runtime._staticWalkFrameActive = false;
        this.applyUnitStaticArtFrame(vu, preparedAttackFrames.atlasCfg.atlasKey, preparedAttackFrames.idleAttackFrame);
        continue;
      }
      const wantsPreparedAttackPose =
        !!preparedAttackFrames &&
        (preparedAttackCycleUntilMs > Number(this.time?.now ?? 0) || preparedAttackFrameActive) &&
        (phase === 'battle') &&
        !result &&
        (u.zone === 'board') &&
        !u.dead &&
        !wantWalk &&
        !wantKnightChargeMove &&
        !wantCast;
      if (wantsPreparedAttackPose) {
        const targetFrame = preparedAttackFrameActive
          ? preparedAttackFrames.attackFrame
          : preparedAttackFrames.idleAttackFrame;
        runtime._staticWalkFrameActive = false;
        runtime._preparedAttackIdleAttack2Active = preparedAttackIdleAttack2Active;
        this.applyUnitStaticArtFrame(vu, preparedAttackFrames.atlasCfg.atlasKey, targetFrame);
        continue;
      }
      const isStaticWalkFrameShown = !!(staticWalkFrame && vu.art?.frame?.name === staticWalkFrame);
      const wantStaticWalkFrame = wantWalk && !wantKnightChargeMove && !wantAttack && !wantCast;
      if (wantStaticWalkFrame && atlasCfgForFrames && vu.art?.active) {
        runtime._staticWalkFrameActive = true;
        vu.art.anims?.stop?.();
        if (vu.art.texture?.key !== atlasCfgForFrames.atlasKey) {
          vu.art.setTexture(atlasCfgForFrames.atlasKey, staticWalkFrame);
        } else if (vu.art.frame?.name !== staticWalkFrame) {
          vu.art.setFrame(staticWalkFrame);
        }
        if (vu.artOverlay?.active) {
          vu.artOverlay.setTexture(atlasCfgForFrames.atlasKey, staticWalkFrame);
          vu.artOverlay.setPosition(Number(vu.art.x ?? 0), Number(vu.art.y ?? 0));
          vu.artOverlay.setScale(Number(vu.art.scaleX ?? 1), Number(vu.art.scaleY ?? 1));
          vu.artOverlay.setFlipX(Boolean(vu.art.flipX));
          vu.artOverlay.setAngle(Number(vu.art.angle ?? 0));
          vu.artOverlay.setOrigin(Number(vu.art.originX ?? 0.5), Number(vu.art.originY ?? 1));
          vu.artOverlay.setDepth(Number(vu.art.depth ?? 0) + 0.1);
        }
        continue;
      }
      if (runtime._staticWalkFrameActive) runtime._staticWalkFrameActive = false;
      const animKey = u.dead
        ? animDef.dead
        : (wantCast ? animDef.spell : (wantAttack ? animDef.attack : (wantKnightChargeMove ? KNIGHT_CHARGE_MOVE_ANIM : animDef.idle)));
      const forceReplayCast = wantCast && !!runtime._castAnimForceReplay;
      const forceReplayAttack = wantAttack && !!runtime._attackAnimForceReplay;

      if (
        !runtime._staticWalkFrameActive &&
        !forceReplayCast &&
        !forceReplayAttack &&
        vu.art.anims?.getName?.() === animKey &&
        !(animKey === animDef.idle && (isStaticWalkFrameShown || isPreparedAttackFrameShown || isSkillFrameShown))
      ) continue;

      if (this.anims.exists(animKey)) {
        vu.art.play(animKey, true);
        if (forceReplayCast) {
          runtime._castAnimForceReplay = false;
          const loopingCastAnim = UNIT_ATLAS_DEF_BY_TYPE[u.type]?.loopSpellAnim === true;
          if (!loopingCastAnim) {
            vu.art.once(`animationcomplete-${animDef.spell}`, (anim) => {
              if (!vu?.art?.active) return;
              if (anim?.key !== animDef.spell) return;
              const latestRuntime = this.attachUnitRuntime(vu, u.id);
              latestRuntime._castAnimPlaying = false;
              latestRuntime._castAnimForceReplay = false;

              const latest = this.getCoreUnitById?.(u.id);
              if (!latest || latest.dead) return;

              const latestPhase = this.battleState?.phase ?? 'prep';
              const latestResult = this.battleState?.result ?? null;
              const shouldWalk =
                (latestPhase === 'battle') &&
                !latestResult &&
                (latest.zone === 'board') &&
                !!vu._moveTween;

              if (shouldWalk && atlasCfgForFrames) {
                latestRuntime._staticWalkFrameActive = true;
                vu.art.anims?.stop?.();
                vu.art.setTexture(atlasCfgForFrames.atlasKey, staticWalkFrame);
                if (vu.artOverlay?.active) vu.artOverlay.setTexture(atlasCfgForFrames.atlasKey, staticWalkFrame);
                return;
              }

              const fallbackAnimKey = animDef.idle;
              if (!this.anims.exists(fallbackAnimKey)) return;
              if (!latestRuntime._staticWalkFrameActive && vu.art.anims?.getName?.() === fallbackAnimKey) return;
              latestRuntime._staticWalkFrameActive = false;
              vu.art.play(fallbackAnimKey, true);
            });
          }
        }
        if (forceReplayAttack) {
          runtime._attackAnimForceReplay = false;
          vu.art.once(`animationcomplete-${animDef.attack}`, (anim) => {
            if (!vu?.art?.active) return;
            if (anim?.key !== animDef.attack) return;
            const latestRuntime = this.attachUnitRuntime(vu, u.id);
            latestRuntime._attackAnimPlaying = false;
            latestRuntime._attackAnimForceReplay = false;

            const latest = this.getCoreUnitById?.(u.id);
            if (!latest || latest.dead) return;

            const latestPhase = this.battleState?.phase ?? 'prep';
            const latestResult = this.battleState?.result ?? null;
            const shouldWalk =
              (latestPhase === 'battle') &&
              !latestResult &&
              (latest.zone === 'board') &&
              !!vu._moveTween;

            if (shouldWalk && atlasCfgForFrames) {
              latestRuntime._staticWalkFrameActive = true;
              vu.art.anims?.stop?.();
              vu.art.setTexture(atlasCfgForFrames.atlasKey, staticWalkFrame);
              if (vu.artOverlay?.active) vu.artOverlay.setTexture(atlasCfgForFrames.atlasKey, staticWalkFrame);
              return;
            }

            const fallbackAnimKey = animDef.idle;
            if (!this.anims.exists(fallbackAnimKey)) return;
            if (!latestRuntime._staticWalkFrameActive && vu.art.anims?.getName?.() === fallbackAnimKey) return;
            latestRuntime._staticWalkFrameActive = false;
            vu.art.play(fallbackAnimKey, true);
          });
        }
      }
    }

    this.flushPendingMergeTargetBounces();
  }

  syncVisualUnitPlacementAndState(visibleUnits, phase, byId) {
    for (const u of visibleUnits) {
      if (this.trashRemoveAnimatingIds?.has?.(u.id)) continue;
      const existing = byId.get(u.id);

      if (!existing) {
        let created = null;

        if (u.zone === 'bench') {
          const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
          const p = this.getBenchUnitScreen(slot);

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
            cellSpanX: u.cellSpanX,
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
            cellSpanX: u.cellSpanX,
          });
        }

        if (!created) {
          const fallbackPos = this.hexToPixel(u.q, u.r);
          created = this.unitSys.spawnUnitAtScreen(fallbackPos.x, fallbackPos.y, {
            id: u.id,
            type: u.type,
            label: getUnitShortLabel(u.type),
            color: u.team === 'enemy' ? 0x66ccff : 0xff7777,
            team: u.team,
            hp: u.hp,
            rank: u.rank ?? 1,
            maxHp: u.maxHp ?? u.hp,
            atk: u.atk,
            cellSpanX: u.cellSpanX,
          });
          if (created && u.zone === 'board') {
            created.zone = 'board';
            created.benchSlot = null;
            this.unitSys.setUnitPos(created.id, u.q, u.r, { tweenMs: 0 });
          }
          if (!created) {
            console.warn('FAILED SPAWN VISUAL', {
              id: u.id,
              team: u.team,
              q: u.q,
              r: u.r,
              zone: u.zone,
              benchSlot: u.benchSlot,
              reason: 'cell occupied or invalid (fallback failed)',
            });
            continue;
          }
        }

        created.dragHandle.setDataEnabled();
        created.dragHandle.data.set('unitId', created.id);
        this.attachUnitRuntime?.(created, u.id);
        this.bindUnitHoverGlow(created);
        if (u.zone === 'bench') {
          const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
          const p = this.getBenchUnitScreen(slot);

          if (created.zone === 'board') {
            for (const c of getBoardCellsForUnit(created)) {
              this.unitSys.state.occupied?.delete?.(`${c.q},${c.r}`);
            }
          }
          created.zone = 'bench';
          created.benchSlot = slot;

          created.sprite.setPosition(p.x, p.y);
          created.label?.setPosition(p.x, p.y);
          created.dragHandle?.setPosition(p.x, p.y);
          const lift = getUnitGroundLiftPx(u.type);
          created.art?.setPosition(p.x + getUnitArtOffsetXPx(u.type, u.team), p.y + this.hexSize - lift);
          if (created.footShadow) {
            const shadowCfg = getUnitFootShadowConfig(u.type);
            created.footShadow.setPosition(p.x + shadowCfg.offsetXPx, p.y + shadowCfg.offsetYPx);
          }

          if (created.hpBar) created.hpBar.setVisible(false);
          if (created.rankIcon) created.rankIcon.setVisible(!u.dead);
          if (created.footShadow) created.footShadow.setVisible(!u.dead);
          this.applyBenchDepthForVisual?.(created, slot);
          if (created) updateHpBar(this, created);
        } else {
          created.zone = 'board';
          created.benchSlot = null;
          const canShowEntryEnemyUnitUi =
            phase !== 'entry' ||
            u.team !== 'enemy' ||
            !!this.entryEnemyUnitsUiVisible;
          if (created.hpBar) created.hpBar.setVisible((phase !== 'prep') && canShowEntryEnemyUnitUi && !u.dead);
          if (created.rankIcon) created.rankIcon.setVisible((phase === 'prep') && !u.dead);
          updateHpBar(this, created);
        }

        byId.set(created.id, created);
        this.applyIllusionVisualState(u, created);
        this.unitSys.setUnitDead?.(u.id, !!u.dead);
        if (u.zone === 'bench') {
          const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
          this.applyBenchDepthForVisual?.(created, slot);
        }

        if (u.team === 'player' && (u.zone === 'bench' || u.zone === 'board') && !u.dead) {
          this.playUnitFeedbackBounce?.(created, { scaleMul: 1.06, duration: 90 });
        }

        this.syncUnitAbilityCooldownUi?.(u, created);
        continue;
      }

      const vu = existing;
      const runtime = this.attachUnitRuntime?.(vu, u.id);
      vu.cellSpanX = getUnitCellSpanX(u);
      this.bindUnitHoverGlow(vu);
      const prevZone = vu?.zone;
      const prevBenchSlot = Number(vu?.benchSlot);
      const prevQ = Number(vu?.q);
      const prevR = Number(vu?.r);

      if (this.draggingUnitId != null && String(u.id) === String(this.draggingUnitId)) {
        continue;
      }

      if (u.zone === 'bench') {
        const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
        const p = this.getBenchUnitScreen(slot);
        const isEntryAutoBenchFx =
          !this.testSceneActive &&
          phase === 'entry' &&
          u.team === 'player' &&
          this.entryAutoBenchAnimatingIds?.has?.(u.id);

        if (vu.zone === 'board') {
          for (const c of getBoardCellsForUnit(vu)) {
            this.unitSys.state.occupied?.delete?.(`${c.q},${c.r}`);
          }
        }
        vu.zone = 'bench';
        vu.benchSlot = slot;

        if (isEntryAutoBenchFx && prevZone === 'board' && !vu._entryBenchAnimating) {
          this.playEntryAutoBenchArc?.(vu, u);
        } else if (!vu._entryBenchAnimating) {
          if (vu?.sprite) vu.sprite.setPosition(p.x, p.y);
          if (vu?.dragHandle) vu.dragHandle.setPosition(p.x, p.y);
          const lift = getUnitGroundLiftPx(u.type);
          if (vu?.art) vu.art.setPosition(p.x + getUnitArtOffsetXPx(u.type, u.team), p.y + this.hexSize - lift);
          if (vu?.footShadow) {
            const shadowCfg = getUnitFootShadowConfig(u.type);
            vu.footShadow.setPosition(p.x + shadowCfg.offsetXPx, p.y + shadowCfg.offsetYPx);
          }
          if (vu?.label) vu.label.setPosition(p.x, p.y);
        }

        if (vu?.hpBar) vu.hpBar.setVisible(false);
        if (vu?.footShadow) vu.footShadow.setVisible(!u.dead);
        if (vu?.rankIcon) vu.rankIcon.setVisible(!u.dead);
        this.applyBenchDepthForVisual?.(vu, slot);
        const benchPlacementChanged = prevZone !== 'bench' || prevBenchSlot !== Number(slot);
        if (benchPlacementChanged && u.team === 'player' && !u.dead) {
          this.playUnitFeedbackBounce?.(vu, { scaleMul: 1.06, duration: 90 });
        }
      } else {
        const result = this.battleState?.result ?? null;
        const MOVE_TWEEN_MS = STEP_MOVE_TRAVEL_MS;
        const replayMoveTweenMs = Number(runtime?._replayMoveTweenMs ?? NaN);
        const moveTweenMs = (Number.isFinite(replayMoveTweenMs) && replayMoveTweenMs > 0)
          ? replayMoveTweenMs
          : MOVE_TWEEN_MS;
        const tweenMs = (phase === 'battle' && !result) ? moveTweenMs : 0;
        if (Number.isFinite(replayMoveTweenMs)) runtime._replayMoveTweenMs = null;
        vu.zone = 'board';
        vu.benchSlot = null;
        const didBoardCellChange =
          prevQ !== Number(u.q) ||
          prevR !== Number(u.r);
        const shouldFaceMoveDirection = didBoardCellChange && !!vu?.art && tweenMs > 0;
        if (shouldFaceMoveDirection) {
          const lift = getUnitGroundLiftPx(u.type);
          const targetGround = this.hexToGroundPixel(u.q, u.r, lift);
          this.setUnitVisualFacingTowardX(vu, targetGround.x);
        }
        this.unitSys.setUnitPos(u.id, u.q, u.r, { tweenMs });

        const canShowEntryEnemyUnitUi =
          phase !== 'entry' ||
          u.team !== 'enemy' ||
          !!this.entryEnemyUnitsUiVisible;
        if (vu?.hpBar) vu.hpBar.setVisible((phase !== 'prep') && canShowEntryEnemyUnitUi && !u.dead);
        if (vu?.rankIcon) vu.rankIcon.setVisible((phase === 'prep') && !u.dead);
        const fromBenchToBoard = prevZone === 'bench';
        const shouldBounceOnPlace =
          (didBoardCellChange || fromBenchToBoard) &&
          phase === 'prep' &&
          u.team === 'player' &&
          !u.dead;
        if (shouldBounceOnPlace) {
          this.playUnitFeedbackBounce?.(vu, { scaleMul: 1.06, duration: 90 });
        }
      }

      vu.rank = u.rank ?? 1;
      this.applyIllusionVisualState(u, vu);
      this.syncUnitAbilityCooldownUi?.(u, vu);
      this.unitSys.setUnitHp(u.id, u.hp, u.maxHp ?? existing.maxHp);
      this.unitSys.setUnitDead?.(u.id, !!u.dead);
      if (u.zone === 'bench') {
        const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
        this.applyBenchDepthForVisual?.(vu, slot);
      }
      if (vu?.label) {
        vu.label.setText(getUnitShortLabel(u.type));
      }
    }
  }

  renderFromState() {
    this.rebuildCoreUnitIndex?.();
    const currentVisualById = new Map((this.unitSys?.state?.units ?? []).map((vu) => [vu.id, vu]));
    const phase = this.battleState?.phase ?? 'prep';
    const { visibleUnits, aliveIds } = this.collectVisibleUnitsForRender(phase);
    if (this.unitInfoVisible) {
      const infoUnit = visibleUnits.find((u) => String(u.id) === String(this.unitInfoUnitId));
      if (!infoUnit || infoUnit.dead) {
        this.hideUnitInfoModal?.();
      } else {
        const modalX = Number(this.unitInfoModal?.x ?? NaN);
        const modalY = Number(this.unitInfoModal?.y ?? NaN);
        this.showUnitInfoModal?.(infoUnit);
        if (Number.isFinite(modalX) && Number.isFinite(modalY)) {
          this.unitInfoModal?.setPosition(modalX, modalY);
        }
      }
    }

    this.detectAndAnimateClientMerges(visibleUnits);
    const byId = this.reconcileVisualUnits(visibleUnits, aliveIds, currentVisualById);
    this.syncVisualUnitPlacementAndState(visibleUnits, phase, byId);
    this.syncVisualUnitAnimationState(phase, byId);
    this.pruneUnitRuntime?.((this.unitSys?.state?.units ?? []).map((vu) => vu.id));
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
    this.syncBenchHexPinSprites();
  }

  isBenchHexPinSlot(slot) {
    if (!BENCH_HEX_PIN_CONFIG.enabled) return false;
    if (BENCH_HEX_PIN_CONFIG.applyToAllSlots) {
      return Number.isInteger(Number(slot))
        && Number(slot) >= 0
        && Number(slot) < Number(this.benchRows ?? 0);
    }
    return Number(slot) === Number(BENCH_HEX_PIN_CONFIG.slot);
  }

  syncBenchHexPinSprites() {
    const cfg = BENCH_HEX_PIN_CONFIG;
    const maxSlots = Math.max(
      Number(this.benchRows ?? 0),
      Number(this.benchHexPinSprites?.length ?? 0)
    );

    for (let slot = 0; slot < maxSlots; slot += 1) {
      let sprite = this.benchHexPinSprites?.[slot] ?? null;
      if (!sprite?.active) {
        sprite = this.add.image(0, 0, BENCH_HEX_PIN_TEXTURE_KEY)
          .setOrigin(0.5, 0.5)
          .setDepth(cfg.depth)
          .setVisible(false);
        this.benchHexPinSprites[slot] = sprite;
      }

      const shouldShow = this.isBenchHexPinSlot(slot);
      const screen = shouldShow ? this.benchSlotToScreen(slot) : null;
      if (!screen) {
        sprite.setVisible(false);
        continue;
      }

      const targetSizePx = Math.max(1, Number(cfg.sizePx ?? 96));
      const sourceWidthPx = Math.max(1, Number(sprite.width ?? 1));
      const scale = targetSizePx / sourceWidthPx;
      const targetX = screen.x + Number(cfg.offsetXPx ?? 0);
      const targetY = screen.y + Number(cfg.offsetYPx ?? 0);

      if (!this.sceneLoadIntroPlayed && this.isBenchHexPinSlot(slot)) {
        if (this.sceneLoadIntroPinRevealCompletedSlots?.has?.(slot)) {
          sprite
            .setPosition(targetX, targetY)
            .setScale(scale)
            .setDepth(Number(cfg.depth ?? 0.5))
            .setAlpha(Number(cfg.alpha ?? 1))
            .setVisible(Boolean(cfg.enabled && shouldShow));
          continue;
        }

        if (this.sceneLoadIntroPinRevealStartedSlots?.has?.(slot)) {
          continue;
        }

        sprite
          .setPosition(targetX, targetY)
          .setScale(scale)
          .setDepth(Number(cfg.depth ?? 0.5))
          .setAlpha(0)
          .setVisible(false);
        continue;
      }

      sprite
        .setPosition(targetX, targetY)
        .setScale(scale)
        .setDepth(Number(cfg.depth ?? 0.5))
        .setAlpha(Number(cfg.alpha ?? 1))
        .setVisible(Boolean(cfg.enabled && shouldShow));
    }
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

  resetRangePenaltyIcons() {
    this.rangePenaltyIconsUsed = 0;
    for (const icon of (this.rangePenaltyIcons ?? [])) {
      if (icon?.active) icon.setVisible(false);
    }
  }

  drawRangePenaltyIconAt(x, y) {
    if (!this.textures?.exists?.('broken_arrow')) return;
    this.rangePenaltyIcons = this.rangePenaltyIcons ?? [];
    let icon = this.rangePenaltyIcons[this.rangePenaltyIconsUsed];
    if (!icon || !icon.active) {
      icon = this.add.image(0, 0, 'broken_arrow')
        .setOrigin(0.5, 0.5)
        .setDepth(2)
        .setScale(0.45)
        .setAlpha(0.4);
      this.rangePenaltyIcons[this.rangePenaltyIconsUsed] = icon;
    }
    icon.setPosition(x, y);
    icon.setVisible(true);
    this.rangePenaltyIconsUsed += 1;
  }

  drawHexGlowOn(g, cx, cy) {
    const pts = this.hexCorners(cx, cy);
    const stroke = (width, color, alpha) => {
      g.lineStyle(width, color, alpha);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.strokePath();
    };

    // Soft gold fantasy glow around hex border.
    stroke(5, 0xf0c36a, 0.18);
    stroke(3, 0xf5cf7a, 0.36);
    stroke(2, 0xffe2a0, 0.66);
    stroke(1, 0xfff4cd, 0.95);
  }

  isCrossbowmanLineShotUnit(unitLike) {
    return !!unitLike
      && String(unitLike.abilityType ?? 'none') === 'passive'
      && String(unitLike.abilityKey ?? '') === 'crossbowman_line_shot';
  }

  isHexOnLineFrom(originQ, originR, targetQ, targetR) {
    const dr = Number(targetR) - Number(originR);
    return dr === 0;
  }

  drawFootprintGlowOn(g, cells = []) {
    const occupied = new Set((cells ?? []).map((c) => `${Number(c.q)},${Number(c.r)}`));
    if (occupied.size <= 0) return;

    const dirs = [
      { dq: 1, dr: 0 },   // east
      { dq: 1, dr: -1 },  // north-east
      { dq: 0, dr: -1 },  // north-west
      { dq: -1, dr: 0 },  // west
      { dq: -1, dr: 1 },  // south-west
      { dq: 0, dr: 1 },   // south-east
    ];

    const strokeOuterEdges = (width, color, alpha) => {
      g.lineStyle(width, color, alpha);
      for (const c of cells) {
        const q = Number(c.q);
        const r = Number(c.r);
        const center = this.hexToPixel(q, r);
        const pts = this.hexCorners(center.x, center.y);

        for (let i = 0; i < 6; i++) {
          const n = dirs[i];
          const nk = `${q + n.dq},${r + n.dr}`;
          if (occupied.has(nk)) continue; // inner shared edge: skip

          const a = pts[i];
          const b = pts[(i + 1) % 6];
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.strokePath();
        }
      }
    };

    // Same palette as drawHexGlowOn, but only on external contour.
    strokeOuterEdges(5, 0xf0c36a, 0.18);
    strokeOuterEdges(3, 0xf5cf7a, 0.36);
    strokeOuterEdges(2, 0xffe2a0, 0.66);
    strokeOuterEdges(1, 0xfff4cd, 0.95);
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

    for (const [slot, cell] of (this.cachedBenchHexCenters ?? []).entries()) {
      if (this.isBenchHexPinSlot(slot)) continue;
      this.drawHexOn(g, cell.x, cell.y, 0xffcc66, 0.45);
    }

    this.syncBenchHexPinSprites();

    this.gridStaticDirty = false;
  }

  drawGridDynamic() {
    const g = this.gDynamic ?? this.g;
    g.clear();
    this.resetRangePenaltyIcons?.();
    const isEntryPhase = !this.testSceneActive && this.battleState?.phase === 'entry';
    const isBattlePhase = !this.testSceneActive && this.battleState?.phase === 'battle';
    const isReplayBattle =
      isBattlePhase &&
      !this.battleState?.result &&
      !!this.serverReplayPlayback?.active;
    const isBattleResultPhase = isBattlePhase && !!this.battleState?.result;
    const showBoardOccupancyShadowBase = isBattleResultPhase
      ? !!this.debugShowHexShadowDuringBattle
      : (!isReplayBattle || !!this.debugShowHexShadowDuringBattle);
    // Entry reveal should not have occupancy gray fill under units.
    const showBoardOccupancyShadow = isEntryPhase ? false : showBoardOccupancyShadowBase;

    // затемнение занятых гексов (доска + скамейка)
    for (const u of (this.battleState?.units ?? [])) {
      if (this.draggingUnitId != null && String(u.id) === String(this.draggingUnitId)) continue;
      // в prep врагов не затемняем (они скрыты)
      if (!this.testSceneActive && this.battleState?.phase === 'prep' && u.team === 'enemy') continue;
      if (u.dead) continue;

      if (u.zone === 'board') {
        if (!showBoardOccupancyShadow) continue;
        for (const c of getBoardCellsForUnit(u)) {
          // ? в prep не рисуем тени в скрытых колонках
          if (!this.testSceneActive && this.battleState?.phase === 'prep') {
            const col = c.q + Math.floor(c.r / 2);
            if (col >= 6) continue;
          }
          const p = this.hexToPixel(c.q, c.r);
          this.drawHexFilledOn(g, p.x, p.y, 0x000000, 0.35);
        }
        continue;
      }

      if (u.zone === 'bench') {
        const slot = Number.isInteger(u.benchSlot) ? u.benchSlot : 0;
        const p = this.benchSlotToScreen(slot);
        this.drawHexFilledOn(g, p.x, p.y, 0x000000, 0.35);
        continue;
      }
    }

    const draggingCoreForPlacement = this.getCoreUnitById?.(this.draggingUnitId);
    const canShowPlacementTargets = !!draggingCoreForPlacement && !this.battleState?.result;
    if (canShowPlacementTargets) {
      const phase = this.battleState?.phase ?? 'prep';
      const canPlaceOnBoardNow = this.testSceneActive || phase === 'prep';

      // Board placement targets (prep/test only).
      if (canPlaceOnBoardNow) {
        const boardCells = this.testSceneActive
          ? (this.cachedBoardHexCenters ?? [])
          : (this.cachedPrepBoardHexCenters ?? []);
        for (const cell of boardCells) {
          this.drawHexFilledOn(g, cell.x, cell.y, 0x000000, 0.16);
        }
      }

      // Bench placement targets (always for draggable player units).
      for (const cell of (this.cachedBenchHexCenters ?? [])) {
        this.drawHexFilledOn(g, cell.x, cell.y, 0x000000, 0.16);
      }
    }

    const draggingCore = this.getCoreUnitById?.(this.draggingUnitId);
    const dragAttackRangeMax = Math.max(1, Number(draggingCore?.attackRangeMax ?? 1));
    const dragAttackRangeFull = Math.max(1, Number(draggingCore?.attackRangeFullDamage ?? dragAttackRangeMax));
    const canShowRangeHeatmap =
      !!this.dragBoardHover &&
      this.battleState?.phase === 'prep' &&
      !this.battleState?.result &&
      !!draggingCore &&
      !draggingCore.dead &&
      dragAttackRangeMax > 1;
    if (canShowRangeHeatmap) {
      const boardCells = this.cachedBoardHexCenters ?? [];
      for (const cell of boardCells) {
        const d = hexDistance(this.dragBoardHover.q, this.dragBoardHover.r, cell.q, cell.r);
        if (d > dragAttackRangeMax) continue;
        if (
          this.isCrossbowmanLineShotUnit?.(draggingCore) &&
          !this.isHexOnLineFrom?.(this.dragBoardHover.q, this.dragBoardHover.r, cell.q, cell.r)
        ) {
          continue;
        }
        if (d <= dragAttackRangeFull) {
          // Full damage zone.
          this.drawHexFilledOn(g, cell.x, cell.y, 0x7fdc6a, 0.18);
        } else {
          // Reduced (half) damage zone.
          this.drawHexFilledOn(g, cell.x, cell.y, 0xff5a5a, 0.16);
          this.drawRangePenaltyIconAt?.(cell.x, cell.y);
        }
      }
    }

    if (this.dragBoardHover && this.battleState?.phase === 'prep' && !this.battleState?.result) {
      const span = getUnitCellSpanX(draggingCore);
      for (let i = 0; i < span; i++) {
        const q = this.dragBoardHover.q - i;
        const r = this.dragBoardHover.r;
        const p = this.hexToPixel(q, r);
        this.drawHexFilledOn(g, p.x, p.y, 0x000000, 0.55);
      }
    }
    if (Number.isInteger(this.dragBenchHoverSlot)) {
      const p = this.benchSlotToScreen(this.dragBenchHoverSlot);
      this.drawHexFilledOn(g, p.x, p.y, 0x000000, 0.55);
    }

    // Hover highlight: which unit will be picked up on pointer down.
    if (this.hoverPickupCell && this.draggingUnitId == null) {
      const hoverUnitId = this.hoverPickupCell.unitId;
      if (hoverUnitId != null) {
        const hoverUnit = this.getCoreUnitById?.(hoverUnitId);
        if (!hoverUnit || hoverUnit.dead) {
          this.hoverPickupCell = null;
        }
      }
    }
    if (this.hoverPickupCell && this.draggingUnitId == null) {
      let p = null;
      if (this.hoverPickupCell.area === 'board') {
        p = this.hexToPixel(this.hoverPickupCell.q, this.hoverPickupCell.r);
      } else if (this.hoverPickupCell.area === 'bench' && Number.isInteger(this.hoverPickupCell.slot)) {
        p = this.benchSlotToScreen(this.hoverPickupCell.slot);
      }
      if (p && !this.unitInfoVisible && this.battleState?.phase !== 'battle') {
        if (this.hoverPickupCell.area === 'board' && this.hoverPickupCell.unitId != null) {
          const hoverUnit = this.getCoreUnitById?.(this.hoverPickupCell.unitId);
          const span = getUnitCellSpanX(hoverUnit);
          if (span > 1) {
            const footprint = [];
            for (let i = 0; i < span; i++) {
              footprint.push({ q: this.hoverPickupCell.q - i, r: this.hoverPickupCell.r });
            }
            this.drawFootprintGlowOn(g, footprint);
          } else {
            const pp = this.hexToPixel(this.hoverPickupCell.q, this.hoverPickupCell.r);
            this.drawHexGlowOn(g, pp.x, pp.y);
          }
        } else {
          this.drawHexGlowOn(g, p.x, p.y);
        }
      }
    }

    // выделение
    if (this.selected?.area === 'board' && !this.unitInfoVisible) {
      const p = this.hexToPixel(this.selected.q, this.selected.r);
      this.drawHexOn(g, p.x, p.y, 0x00ffcc, 1.0);
    }

    if (this.selected?.area === 'bench' && !this.unitInfoVisible) {
      const { x, y } = this.selected.screen;
      this.drawHexOn(g, x, y, 0xffcc66, 1.0);
    }

    const showCombatHexOverlay =
      !!this.debugShowCombatHexOverlay &&
      !!this.serverReplayPlayback?.active &&
      !this.testSceneActive &&
      this.battleState?.phase === 'battle' &&
      !this.battleState?.result;
    if (showCombatHexOverlay) {
      const nowMs = Number(this.time?.now ?? 0);
      for (const u of (this.battleState?.units ?? [])) {
        if (!u || u.zone !== 'board' || u.dead) continue;

        // Reserved hex: where unit already occupies logically.
        const reserved = this.hexToPixel(u.q, u.r);
        this.drawHexOn(g, reserved.x, reserved.y, 0x57c7ff, 0.95);

        // Combat hex: first half of move = previous cell, second half = target cell.
        const combatHex = this.getReplayCombatHexForUnit(u, nowMs);
        if (!combatHex) continue;
        const combat = this.hexToPixel(combatHex.q, combatHex.r);
        this.drawHexOn(g, combat.x, combat.y, 0xffa954, 0.95);
      }
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

  getBenchUnitScreen(slot) {
    const p = this.benchSlotToScreen(slot);
    return {
      x: Number(p?.x ?? 0),
      y: Number(p?.y ?? 0) + Number(BENCH_UNIT_VISUAL_OFFSET_Y_PX ?? 0),
    };
  }


  update(time, delta) {
    this.unitSys.update(delta / 1000);
    this.syncBattleVisualFrame?.(Number(this.time?.now ?? 0));

    const dt = delta / 1000;
    const lagSpeed = KING_UI.hpLagSpeed;
    let kingLagChanged = false;
    const playerAnim = this.kingHpAnim?.player;
    if (playerAnim && playerAnim.lag > playerAnim.instant) {
      playerAnim.lag = Math.max(playerAnim.instant, playerAnim.lag - lagSpeed * dt);
      kingLagChanged = true;
    }
    const enemyAnim = this.kingHpAnim?.enemy;
    if (enemyAnim && enemyAnim.lag > enemyAnim.instant) {
      enemyAnim.lag = Math.max(enemyAnim.instant, enemyAnim.lag - lagSpeed * dt);
      kingLagChanged = true;
    }
    if (kingLagChanged) this.drawKingHpBars();
    if (this.debugShowCombatHexOverlay && this.serverReplayPlayback?.active) {
      this.drawGrid();
    }
  }

}

installBattleSceneDrag(BattleScene);
installBattleSceneShopUi(BattleScene);
installBattleSceneTestScene(BattleScene);
installBattleSceneDebugUi(BattleScene);
installBattleSceneKingDamageFx(BattleScene);
installBattleSceneKingHudUi(BattleScene);
installBattleSceneStateSync(BattleScene);
installBattleSceneLifecycle(BattleScene);



