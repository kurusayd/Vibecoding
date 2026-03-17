export const GHOST_EVASION_ABILITY_KEY = 'ghost_evasion';
export const GHOST_EVASION_DODGE_CHANCE = 0.5;

export const ghostEvasionAbility = {
  key: GHOST_EVASION_ABILITY_KEY,
  kind: 'passive',

  matches(unitLike) {
    return !!unitLike
      && String(unitLike.abilityType ?? 'none') === 'passive'
      && String(unitLike.abilityKey ?? '') === GHOST_EVASION_ABILITY_KEY;
  },

  getAttackDodgeChance(unitLike) {
    return this.matches(unitLike) ? GHOST_EVASION_DODGE_CHANCE : 0;
  },
};
