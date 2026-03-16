import { UNIT_CATALOG } from './unitCatalog.js';

export const DEFAULT_ATTACK_HIT_DELAY_MS = 500;

const ATTACK_TIMING_OVERRIDES_BY_TYPE = Object.freeze({
  Swordsman: Object.freeze({
    attackIntervalMs: 1500,
    hitDelayMs: 750,
    attackHoldMs: 400,
    usesPreparedAttackVisual: true,
  }),
  Crossbowman: Object.freeze({
    attackIntervalMs: Math.round(1000 / 0.7),
    hitDelayMs: 400,
    attackHoldMs: 400,
    projectileLaunchDelayMs: 400,
    usesPreparedAttackVisual: true,
  }),
  Priest: Object.freeze({
    attackIntervalMs: Math.round(1000 / 0.6),
    hitDelayMs: 400,
    attackHoldMs: 400,
    recoveryDelayMs: 200,
    projectileLaunchDelayMs: 400,
    usesPreparedAttackVisual: true,
  }),
  Zombie: Object.freeze({
    attackIntervalMs: Math.round(1000 / 0.65),
    hitDelayMs: 750,
    attackHoldMs: 400,
    usesPreparedAttackVisual: true,
  }),
});

const ATTACK_TIMING_CONFIG_BY_TYPE = Object.freeze(
  Object.fromEntries(
    UNIT_CATALOG.map((unit) => {
      const type = String(unit?.type ?? '');
      const attackSpeed = Math.max(0.1, Number(unit?.attackSpeed ?? 1));
      const overrides = ATTACK_TIMING_OVERRIDES_BY_TYPE[type] ?? {};
      return [type, Object.freeze({
        attackIntervalMs: Math.round(1000 / attackSpeed),
        hitDelayMs: DEFAULT_ATTACK_HIT_DELAY_MS,
        attackHoldMs: 0,
        recoveryDelayMs: 0,
        projectileLaunchDelayMs: 0,
        usesPreparedAttackVisual: false,
        ...overrides,
      })];
    })
  )
);

export function getAttackTimingConfig(type) {
  const key = String(type ?? '');
  return ATTACK_TIMING_CONFIG_BY_TYPE[key] ?? null;
}

export function getPreparedAttackConfig(type) {
  const cfg = getAttackTimingConfig(type);
  return cfg?.usesPreparedAttackVisual ? cfg : null;
}

export function usesPreparedAttackConfig(type) {
  return !!getPreparedAttackConfig(type);
}
