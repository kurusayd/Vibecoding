const DEFAULT_ART_TARGET_PX = 170;
const DEFAULT_GROUND_LIFT_PX = 100;
const DEFAULT_ART_OFFSET_X_PX = 0;
const DEFAULT_HP_UI_LIFT_PX = 0;
const DEFAULT_FOOT_SHADOW_WIDTH_PX = 58;
const DEFAULT_FOOT_SHADOW_HEIGHT_PX = 18;
const DEFAULT_FOOT_SHADOW_OFFSET_X_PX = 0;
const DEFAULT_FOOT_SHADOW_OFFSET_Y_PX = 10;

// Centralized per-unit visual tuning used by scene rendering, drag visuals, and HP UI.
// Field meanings:
// - groundLiftPx: raises/lowers the character art relative to the hex ground anchor.
//   Increase this to move the unit art higher on screen (use this for "raise the golem a bit").
// - artTargetPx: target rendered art width in pixels (affects scale).
// - artOffsetXPx: horizontal art offset relative to the hex center for the player-facing sprite.
//   For mirrored enemy visuals the sign is auto-inverted by getUnitArtOffsetXPx(...).
// - hpUiLiftPx: extra vertical lift for HP bar + rank icon (positive = move UI higher).
// - footShadowWidthPx/footShadowHeightPx: per-unit ellipse shadow size.
// - footShadowOffsetXPx/footShadowOffsetYPx: per-unit shadow anchor shift relative to unit hex center.
export const UNIT_VISUAL_CONFIG_BY_TYPE = {
  Swordsman: {
    // Baseline example config. Use this as reference when tuning other units.
    groundLiftPx: 100,
    artTargetPx: 160,
    artOffsetXPx: 15,
    hpUiLiftPx: 20,
    footShadowWidthPx: 65,
    footShadowHeightPx: 17,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 10,
  },
  Priest: {
    groundLiftPx: 100,
    artTargetPx: 150,
    artOffsetXPx: 5,
    hpUiLiftPx: 45,
    footShadowWidthPx: 56,
    footShadowHeightPx: 16,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 15,
  },
  Crossbowman: {
    groundLiftPx: 90,
    artTargetPx: 140,
    artOffsetXPx: 10,
    hpUiLiftPx: 25,
    footShadowWidthPx: 65,
    footShadowHeightPx: 16,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 10,
  },
  Crusader: {
    groundLiftPx: 100,
    artTargetPx: 160,
    artOffsetXPx: 15,
    hpUiLiftPx: 35,
    footShadowWidthPx: 65,
    footShadowHeightPx: 18,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 11,
  },
  Monk: {
    groundLiftPx: 95,
    artTargetPx: 140,
    artOffsetXPx: 5,
    hpUiLiftPx: 35,
    footShadowWidthPx: 57,
    footShadowHeightPx: 16,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 12,
  },
  Skeleton: {
    groundLiftPx: 80,
    artTargetPx: 130,
    artOffsetXPx: 5,
    hpUiLiftPx: 20,
    footShadowWidthPx: 50,
    footShadowHeightPx: 15,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 15,
  },
  BonesGolem: {
    // Tune BonesGolem here:
    // - raise/lower the unit art: change groundLiftPx
    // - make art bigger/smaller: change artTargetPx
    // - move art left/right: change artOffsetXPx
    // - move HP bar/rank icon: change hpUiLiftPx
    groundLiftPx: 110,
    artTargetPx: 187,
    artOffsetXPx: 6,
    hpUiLiftPx: 75,
    footShadowWidthPx: 70,
    footShadowHeightPx: 22,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 12,
  },
  Ghost: {
    groundLiftPx: 95,
    artTargetPx: 120,
    artOffsetXPx: 0,
    hpUiLiftPx: 30,
    footShadowWidthPx: 48,
    footShadowHeightPx: 14,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 12,
  },
  Lich: {
    groundLiftPx: 95,
    artTargetPx: 150,
    artOffsetXPx: 0,
    hpUiLiftPx: 40,
    footShadowWidthPx: 58,
    footShadowHeightPx: 18,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 18,
  },
  SkeletonArcher: {
    groundLiftPx: 80,
    artTargetPx: 120,
    artOffsetXPx: 0,
    hpUiLiftPx: 18,
    footShadowWidthPx: 50,
    footShadowHeightPx: 15,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 15,
  },
  Vampire: {
    groundLiftPx: 90,
    artTargetPx: 150,
    artOffsetXPx: 5,
    hpUiLiftPx: 38,
    footShadowWidthPx: 56,
    footShadowHeightPx: 17,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 19,
  },
  Zombie: {
    groundLiftPx: 90,
    artTargetPx: 150,
    artOffsetXPx: 5,
    hpUiLiftPx: 40,
    footShadowWidthPx: 64,
    footShadowHeightPx: 20,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 11,
  },
  Undertaker: {
    // Same visual profile as Crusader for now.
    groundLiftPx: 100,
    artTargetPx: 160,
    artOffsetXPx: 5,
    hpUiLiftPx: 40,
    footShadowWidthPx: 65,
    footShadowHeightPx: 18,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 15,
  },
  Angel: {
    groundLiftPx: 130,
    artTargetPx: 220,
    artOffsetXPx: 6,
    hpUiLiftPx: 75,
    footShadowWidthPx: 76,
    footShadowHeightPx: 24,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 13,
  },
  Devil: {
    groundLiftPx: 110,
    artTargetPx: 180,
    artOffsetXPx: -5,
    hpUiLiftPx: 75,
    footShadowWidthPx: 76,
    footShadowHeightPx: 24,
    footShadowOffsetXPx: 0,
    footShadowOffsetYPx: 13,
  },
};

function getUnitVisualConfig(type) {
  return UNIT_VISUAL_CONFIG_BY_TYPE[type] ?? null;
}

export function getUnitGroundLiftPx(type) {
  return getUnitVisualConfig(type)?.groundLiftPx ?? DEFAULT_GROUND_LIFT_PX;
}

export function getUnitArtTargetPx(type) {
  return getUnitVisualConfig(type)?.artTargetPx ?? DEFAULT_ART_TARGET_PX;
}

export function getUnitArtOffsetXPx(type, opts = {}) {
  const base = getUnitVisualConfig(type)?.artOffsetXPx ?? DEFAULT_ART_OFFSET_X_PX;

  if (typeof opts === 'boolean') {
    return opts ? -base : base;
  }

  const team = typeof opts === 'string'
    ? opts
    : (opts?.team ?? null);
  const mirrored = Boolean(opts?.mirrored) || team === 'enemy';

  return mirrored ? -base : base;
}

export function getUnitHpUiLiftPx(type) {
  return getUnitVisualConfig(type)?.hpUiLiftPx ?? DEFAULT_HP_UI_LIFT_PX;
}

export function getUnitFootShadowConfig(type) {
  const cfg = getUnitVisualConfig(type) ?? {};
  return {
    widthPx: Number(cfg.footShadowWidthPx ?? DEFAULT_FOOT_SHADOW_WIDTH_PX),
    heightPx: Number(cfg.footShadowHeightPx ?? DEFAULT_FOOT_SHADOW_HEIGHT_PX),
    offsetXPx: Number(cfg.footShadowOffsetXPx ?? DEFAULT_FOOT_SHADOW_OFFSET_X_PX),
    offsetYPx: Number(cfg.footShadowOffsetYPx ?? DEFAULT_FOOT_SHADOW_OFFSET_Y_PX),
  };
}
