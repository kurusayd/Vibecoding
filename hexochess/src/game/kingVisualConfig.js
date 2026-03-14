const DEFAULT_KING_SIZE_PX = 190;
const DEFAULT_KING_OFFSET_X_PX = 0;
const DEFAULT_KING_OFFSET_Y_PX = 0;
const DEFAULT_KING_HP_BAR_OFFSET_X_PX = 0;
const DEFAULT_KING_HP_BAR_OFFSET_Y_PX = 0;
const DEFAULT_KING_SHADOW_WIDTH_PX = 142;
const DEFAULT_KING_SHADOW_HEIGHT_PX = 40;
const DEFAULT_KING_SHADOW_OFFSET_X_PX = 0;
const DEFAULT_KING_SHADOW_OFFSET_Y_PX = 76;

// Centralized per-king visual tuning used by BattleScene and king HUD rendering.
// Field meanings:
// - sizePx: displayed king art size in pixels.
// - offsetXPx / offsetYPx: move the whole king art; shadow follows the king center automatically.
//   X offsets are mirrored automatically for enemy kings.
// - hpBarOffsetXPx / hpBarOffsetYPx: extra offset for the HP bar block above this king.
//   HP bar X offset mirrors together with the art.
// - shadowWidthPx / shadowHeightPx: size of the king ground shadow ellipse.
// - shadowOffsetXPx / shadowOffsetYPx: shadow shift relative to the king art center.
export const KING_VISUAL_CONFIG_BY_KEY = {
  king: {
    sizePx: DEFAULT_KING_SIZE_PX + 30,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX - 20,
    offsetYPx: DEFAULT_KING_OFFSET_Y_PX - 20,
    hpBarOffsetXPx: DEFAULT_KING_HP_BAR_OFFSET_X_PX - 15,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX - 10,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX + 0,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX + 0,
    shadowOffsetXPx: DEFAULT_KING_SHADOW_OFFSET_X_PX + 0,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX + 10,
  },
  king_princess: {
    sizePx: DEFAULT_KING_SIZE_PX + 30,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX - 25,
    offsetYPx: DEFAULT_KING_OFFSET_Y_PX - 20,
    hpBarOffsetXPx: DEFAULT_KING_HP_BAR_OFFSET_X_PX - 15,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX - 7,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX - 5,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX + 0,
    shadowOffsetXPx: DEFAULT_KING_SHADOW_OFFSET_X_PX + 0,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX + 5,
  },
  king_frog: {
    sizePx: DEFAULT_KING_SIZE_PX + 0,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX + 0,
    offsetYPx: DEFAULT_KING_OFFSET_Y_PX + 0,
    hpBarOffsetXPx: DEFAULT_KING_HP_BAR_OFFSET_X_PX + 0,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX + 20,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX - 5,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX + 0,
    shadowOffsetXPx: DEFAULT_KING_SHADOW_OFFSET_X_PX + 0,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX - 20,
  },
  black_knight: {
    sizePx: DEFAULT_KING_SIZE_PX + 30,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX - 12,
    offsetYPx: DEFAULT_KING_OFFSET_Y_PX - 35,
    hpBarOffsetXPx: DEFAULT_KING_HP_BAR_OFFSET_X_PX - 3,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX - 15,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX - 40,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX - 10,
    shadowOffsetXPx: DEFAULT_KING_SHADOW_OFFSET_X_PX + 10,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX + 25,
  },
  black_pawn: {
    sizePx: DEFAULT_KING_SIZE_PX + 30,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX - 12,
    offsetYPx: DEFAULT_KING_OFFSET_Y_PX - 35,
    hpBarOffsetXPx: DEFAULT_KING_HP_BAR_OFFSET_X_PX - 3,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX - 15,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX - 40,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX - 10,
    shadowOffsetXPx: DEFAULT_KING_SHADOW_OFFSET_X_PX + 5,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX + 20,
  },
  white_knight: {
    sizePx: DEFAULT_KING_SIZE_PX + 30,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX - 12,
    offsetYPx: DEFAULT_KING_OFFSET_Y_PX - 35,
    hpBarOffsetXPx: DEFAULT_KING_HP_BAR_OFFSET_X_PX - 3,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX - 15,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX - 40,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX - 10,
    shadowOffsetXPx: DEFAULT_KING_SHADOW_OFFSET_X_PX + 10,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX + 25,
  },
  white_pawn: {
    sizePx: DEFAULT_KING_SIZE_PX + 30,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX - 12,
    offsetYPx: DEFAULT_KING_OFFSET_Y_PX - 35,
    hpBarOffsetXPx: DEFAULT_KING_HP_BAR_OFFSET_X_PX - 3,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX - 15,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX - 40,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX - 10,
    shadowOffsetXPx: DEFAULT_KING_SHADOW_OFFSET_X_PX - 5,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX + 20,
  },
};

// Legacy alias: the "KING" art uses texture key `king_king`, but should follow the base `king` config.
KING_VISUAL_CONFIG_BY_KEY.king_king = KING_VISUAL_CONFIG_BY_KEY.king;

function getKingVisualConfig(visualKey) {
  return KING_VISUAL_CONFIG_BY_KEY[visualKey] ?? KING_VISUAL_CONFIG_BY_KEY.king;
}

function maybeMirrorX(value, mirrorX) {
  const numeric = Number(value ?? 0);
  return mirrorX ? -numeric : numeric;
}

export function getKingSizePx(visualKey) {
  return Number(getKingVisualConfig(visualKey)?.sizePx ?? DEFAULT_KING_SIZE_PX);
}

export function getKingOffsetXPx(visualKey, { mirrorX = false } = {}) {
  return maybeMirrorX(
    getKingVisualConfig(visualKey)?.offsetXPx ?? DEFAULT_KING_OFFSET_X_PX,
    mirrorX
  );
}

export function getKingOffsetYPx(visualKey) {
  return Number(getKingVisualConfig(visualKey)?.offsetYPx ?? DEFAULT_KING_OFFSET_Y_PX);
}

export function getKingHpBarOffsetXPx(visualKey, { mirrorX = false } = {}) {
  return maybeMirrorX(
    getKingVisualConfig(visualKey)?.hpBarOffsetXPx ?? DEFAULT_KING_HP_BAR_OFFSET_X_PX,
    mirrorX
  );
}

export function getKingHpBarOffsetYPx(visualKey) {
  return Number(getKingVisualConfig(visualKey)?.hpBarOffsetYPx ?? DEFAULT_KING_HP_BAR_OFFSET_Y_PX);
}

export function getKingShadowConfig(visualKey, { mirrorX = false } = {}) {
  const cfg = getKingVisualConfig(visualKey);
  return {
    widthPx: Number(cfg?.shadowWidthPx ?? DEFAULT_KING_SHADOW_WIDTH_PX),
    heightPx: Number(cfg?.shadowHeightPx ?? DEFAULT_KING_SHADOW_HEIGHT_PX),
    offsetXPx: maybeMirrorX(
      cfg?.shadowOffsetXPx ?? DEFAULT_KING_SHADOW_OFFSET_X_PX,
      mirrorX
    ),
    offsetYPx: Number(cfg?.shadowOffsetYPx ?? DEFAULT_KING_SHADOW_OFFSET_Y_PX),
  };
}
