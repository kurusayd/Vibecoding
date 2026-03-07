const DEFAULT_KING_SIZE_PX = 190;
const DEFAULT_KING_OFFSET_X_PX = 0;
const DEFAULT_KING_HP_BAR_OFFSET_Y_PX = 0;
const DEFAULT_KING_SHADOW_WIDTH_PX = 142;
const DEFAULT_KING_SHADOW_HEIGHT_PX = 40;
const DEFAULT_KING_SHADOW_OFFSET_Y_PX = 76;

// Centralized per-king visual tuning used by BattleScene and king HUD rendering.
// Field meanings:
// - sizePx: displayed king art size in pixels.
// - offsetXPx: moves the whole king art on X; shadow follows the king center automatically.
// - hpBarOffsetYPx: extra Y offset for the HP bar block above this king.
// - shadowWidthPx / shadowHeightPx: size of the king ground shadow ellipse.
// - shadowOffsetYPx: vertical shift of shadow relative to the king art center.
export const KING_VISUAL_CONFIG_BY_KEY = {
  king: {
    sizePx: DEFAULT_KING_SIZE_PX + 0,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX + 0,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX + 0,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX + 0,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX + 0,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX + 0,
  },
  king_princess: {
    sizePx: DEFAULT_KING_SIZE_PX + 0,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX + 0,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX + 0,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX - 5,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX + 0,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX - 5,
  },
  king_frog: {
    sizePx: DEFAULT_KING_SIZE_PX + 0,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX + 0,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX + 0,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX - 5,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX + 0,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX - 20,
  },
  king_king: {
    sizePx: DEFAULT_KING_SIZE_PX + 0,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX + 0,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX + 0,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX + 0,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX + 0,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX + 0,
  },
  black_knight: {
    sizePx: DEFAULT_KING_SIZE_PX + 0,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX + 0,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX + 0,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX + 0,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX + 0,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX + 0,
  },
  black_pawn: {
    sizePx: DEFAULT_KING_SIZE_PX + 0,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX + 0,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX + 0,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX - 70,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX + 0,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX + 5,
  },
  white_knight: {
    sizePx: DEFAULT_KING_SIZE_PX + 0,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX + 0,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX + 0,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX + 0,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX + 0,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX + 0,
  },
  white_pawn: {
    sizePx: DEFAULT_KING_SIZE_PX + 0,
    offsetXPx: DEFAULT_KING_OFFSET_X_PX + 0,
    hpBarOffsetYPx: DEFAULT_KING_HP_BAR_OFFSET_Y_PX + 0,
    shadowWidthPx: DEFAULT_KING_SHADOW_WIDTH_PX - 70,
    shadowHeightPx: DEFAULT_KING_SHADOW_HEIGHT_PX + 0,
    shadowOffsetYPx: DEFAULT_KING_SHADOW_OFFSET_Y_PX + 5,
  },
};

function getKingVisualConfig(visualKey) {
  return KING_VISUAL_CONFIG_BY_KEY[visualKey] ?? KING_VISUAL_CONFIG_BY_KEY.king;
}

export function getKingSizePx(visualKey) {
  return Number(getKingVisualConfig(visualKey)?.sizePx ?? DEFAULT_KING_SIZE_PX);
}

export function getKingOffsetXPx(visualKey) {
  return Number(getKingVisualConfig(visualKey)?.offsetXPx ?? DEFAULT_KING_OFFSET_X_PX);
}

export function getKingHpBarOffsetYPx(visualKey) {
  return Number(getKingVisualConfig(visualKey)?.hpBarOffsetYPx ?? DEFAULT_KING_HP_BAR_OFFSET_Y_PX);
}

export function getKingShadowConfig(visualKey) {
  const cfg = getKingVisualConfig(visualKey);
  return {
    widthPx: Number(cfg?.shadowWidthPx ?? DEFAULT_KING_SHADOW_WIDTH_PX),
    heightPx: Number(cfg?.shadowHeightPx ?? DEFAULT_KING_SHADOW_HEIGHT_PX),
    offsetYPx: Number(cfg?.shadowOffsetYPx ?? DEFAULT_KING_SHADOW_OFFSET_Y_PX),
  };
}
