const DEFAULT_ART_TARGET_PX = 170;
const DEFAULT_GROUND_LIFT_PX = 100;
const DEFAULT_ART_OFFSET_X_PX = 0;
const DEFAULT_HP_UI_LIFT_PX = 0;

// Centralized per-unit visual tuning used by scene rendering, drag visuals, and HP UI.
// Field meanings:
// - groundLiftPx: raises/lowers the character art relative to the hex ground anchor.
//   Increase this to move the unit art higher on screen (use this for "raise the golem a bit").
// - artTargetPx: target rendered art width in pixels (affects scale).
// - artOffsetXPx: horizontal art offset relative to the hex center for the player-facing sprite.
//   For mirrored enemy visuals the sign is auto-inverted by getUnitArtOffsetXPx(...).
// - hpUiLiftPx: extra vertical lift for HP bar + rank icon (positive = move UI higher).
export const UNIT_VISUAL_CONFIG_BY_TYPE = {
  Swordsman: {
    // Baseline example config. Use this as reference when tuning other units.
    groundLiftPx: 100,
    artTargetPx: 160,
    artOffsetXPx: 15,
    hpUiLiftPx: 20,
  },
  Priest: {
    groundLiftPx: 100,
    artTargetPx: 150,
    artOffsetXPx: 5,
    hpUiLiftPx: 45,
  },
  Crossbowman: {
    groundLiftPx: 90,
    artTargetPx: 140,
    artOffsetXPx: 10,
    hpUiLiftPx: 25,
  },
  Crusader: {
    groundLiftPx: 100,
    artTargetPx: 160,
    artOffsetXPx: 15,
    hpUiLiftPx: 35,
  },
  Monk: {
    groundLiftPx: 95,
    artTargetPx: 140,
    artOffsetXPx: 5,
    hpUiLiftPx: 35,
  },
  Skeleton: {
    groundLiftPx: 90,
    artTargetPx: 130,
    artOffsetXPx: 5,
    hpUiLiftPx: 30,
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
  },
  Ghost: {
    groundLiftPx: 80,
    artTargetPx: 130,
    artOffsetXPx: 0,
    hpUiLiftPx: 15,
  },
  Lich: {
    groundLiftPx: 100,
    artTargetPx: 170,
    artOffsetXPx: 0,
    hpUiLiftPx: 40,
  },
  SkeletonArcher: {
    groundLiftPx: 80,
    artTargetPx: 130,
    artOffsetXPx: 0,
    hpUiLiftPx: 18,
  },
  Vampire: {
    groundLiftPx: 90,
    artTargetPx: 150,
    artOffsetXPx: 0,
    hpUiLiftPx: 30,
  },
  Zombie: {
    groundLiftPx: 100,
    artTargetPx: 170,
    artOffsetXPx: 0,
    hpUiLiftPx: 40,
  },
  Angel: {
    groundLiftPx: 130,
    artTargetPx: 220,
    artOffsetXPx: 6,
    hpUiLiftPx: 75,
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
