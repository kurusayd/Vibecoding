import { ghostEvasionAbility, GHOST_EVASION_ABILITY_KEY } from './passives/ghostEvasion.js';
import { swordsmanCounterAbility, SWORDSMAN_COUNTER_ABILITY_KEY } from './passives/swordsmanCounter.js';

const ABILITY_HANDLERS_BY_KEY = Object.freeze({
  [GHOST_EVASION_ABILITY_KEY]: ghostEvasionAbility,
  [SWORDSMAN_COUNTER_ABILITY_KEY]: swordsmanCounterAbility,
});

export function getAbilityHandlerByKey(abilityKey) {
  const key = String(abilityKey ?? '').trim();
  return key ? (ABILITY_HANDLERS_BY_KEY[key] ?? null) : null;
}

export function getPassiveAbilityHandler(unitLike) {
  if (!unitLike || String(unitLike.abilityType ?? 'none') !== 'passive') return null;
  const handler = getAbilityHandlerByKey(unitLike.abilityKey);
  return handler?.kind === 'passive' ? handler : null;
}
