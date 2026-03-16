const PREPARED_ATTACK_CONFIG_BY_TYPE = Object.freeze({
  Swordsman: Object.freeze({
    attackIntervalMs: 1500,
    hitDelayMs: 750,
    attackHoldMs: 400,
  }),
  Crossbowman: Object.freeze({
    attackIntervalMs: Math.round(1000 / 0.7),
    hitDelayMs: 400,
    attackHoldMs: 400,
    projectileLaunchDelayMs: 400,
  }),
  Priest: Object.freeze({
    attackIntervalMs: Math.round(1000 / 0.6),
    hitDelayMs: 400,
    attackHoldMs: 400,
    recoveryDelayMs: 200,
    projectileLaunchDelayMs: 400,
  }),
});

export function getPreparedAttackConfig(type) {
  const key = String(type ?? '');
  return PREPARED_ATTACK_CONFIG_BY_TYPE[key] ?? null;
}

export function usesPreparedAttackConfig(type) {
  return !!getPreparedAttackConfig(type);
}
