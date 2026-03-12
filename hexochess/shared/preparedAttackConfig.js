const PREPARED_ATTACK_CONFIG_BY_TYPE = Object.freeze({
  Swordsman: Object.freeze({
    attackIntervalMs: 1500,
    hitDelayMs: 750,
    attackHoldMs: 400,
  }),
});

export function getPreparedAttackConfig(type) {
  const key = String(type ?? '');
  return PREPARED_ATTACK_CONFIG_BY_TYPE[key] ?? null;
}

export function usesPreparedAttackConfig(type) {
  return !!getPreparedAttackConfig(type);
}
