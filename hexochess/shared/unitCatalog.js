// Shared unit catalog used by the server (authoritative gameplay) and test scene UI/spawn presets.
// Edit stats here to keep server and local test scene in sync.

const POWER_TYPE_PAWN = '\u041f\u0435\u0448\u043a\u0430';   // Пешка
const POWER_TYPE_KNIGHT = '\u041a\u043e\u043d\u044c';      // Конь
const POWER_TYPE_BISHOP = '\u0421\u043b\u043e\u043d';      // Слон
const POWER_TYPE_ROOK = '\u041b\u0430\u0434\u044c\u044f';  // Ладья
const POWER_TYPE_QUEEN = '\u0424\u0435\u0440\u0437\u044c'; // Ферзь

const ABILITY_NONE = 'none';
const ABILITY_ACTIVE = 'active';
const ABILITY_PASSIVE = 'passive';
const DEFAULT_ACCURACY = 0.8;
const ATTACK_MODE_MELEE = 'melee';
const ATTACK_MODE_RANGED = 'ranged';
const DAMAGE_TYPE_PHYSICAL = 'physical';
const DAMAGE_TYPE_MAGIC = 'magic';
const DAMAGE_TYPE_PURE = 'pure';

function getDefaultAbilityDamageType(abilityKey) {
  switch (String(abilityKey ?? '')) {
    case 'swordsman_counter':
    case 'crossbowman_line_shot':
    case 'skeleton_archer_bounce':
    case 'knight_charge':
      return DAMAGE_TYPE_PHYSICAL;
    default:
      return null;
  }
}

export const UNIT_CATALOG = [
  { race: 'HUMAN',  type: 'Swordsman',      label: 'SWORDSMAN',       powerType: POWER_TYPE_PAWN,   hp: 102, atk: 21, attackSpeed: 0.7, moveSpeed: 1.4, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 6, magicResist: 0, abilityType: ABILITY_PASSIVE, abilityKey: 'swordsman_counter' },
  { race: 'HUMAN',  type: 'Priest',         label: 'PRIEST',          powerType: POWER_TYPE_BISHOP, hp: 96,  atk: 22, attackSpeed: 0.6, moveSpeed: 0.9, attackRangeMax: 20, attackRangeFullDamage: 5, projectileSpeed: 6.0, attackMode: ATTACK_MODE_RANGED, armor: 1, magicResist: 20 },
  { race: 'LIZARD', type: 'Monk',           label: 'MONK',            powerType: POWER_TYPE_PAWN,   hp: 108, atk: 19, attackSpeed: 0.85, moveSpeed: 1.9, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 4, magicResist: 10 },
  { race: 'LIZARD', type: 'NagaSiren',      label: 'NAGA SIREN',      powerType: POWER_TYPE_BISHOP, hp: 120, atk: 23, attackSpeed: 0.75, moveSpeed: 1.3, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 5, magicResist: 15, abilityType: ABILITY_ACTIVE, abilityKey: 'siren_mirror_image', abilityCooldown: 20 },
  { race: 'UNDEAD', type: 'Skeleton',       label: 'SKELETON',        powerType: POWER_TYPE_PAWN,   hp: 112, atk: 21, attackSpeed: 0.75, moveSpeed: 1.3, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 2, magicResist: 0 },
  { race: 'UNDEAD', type: 'SimpleSkeleton', label: 'SIMPLE SKELETON', powerType: POWER_TYPE_PAWN,   hp: 112, atk: 21, attackSpeed: 0.75, moveSpeed: 1.4, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 2, magicResist: 0 },
  { race: 'HUMAN',  type: 'Crossbowman',    label: 'CROSSBOW',        powerType: POWER_TYPE_PAWN,   hp: 104, atk: 21, attackSpeed: 0.7, moveSpeed: 1.2, attackRangeMax: 20, attackRangeFullDamage: 5, projectileSpeed: 20.0, attackMode: ATTACK_MODE_RANGED, armor: 0, magicResist: 0, abilityType: ABILITY_PASSIVE, abilityKey: 'crossbowman_line_shot' },
  { race: 'HUMAN',  type: 'Crusader',       label: 'CRUSADER',        powerType: POWER_TYPE_KNIGHT, hp: 104, atk: 23, attackSpeed: 0.7, moveSpeed: 1.1, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 9, magicResist: 10 },
  { race: 'HUMAN',  type: 'Knight',         label: 'KNIGHT',          powerType: POWER_TYPE_ROOK,   hp: 120, atk: 27, attackSpeed: 0.7, moveSpeed: 2.0, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 14, magicResist: 0, cellSpanX: 2, abilityType: ABILITY_ACTIVE, abilityKey: 'knight_charge', abilityCooldown: 6 },
  { race: 'UNDEAD', type: 'BonesGolem',     label: 'BONES GOLEM',     powerType: POWER_TYPE_BISHOP, hp: 102, atk: 27, attackSpeed: 0.6, moveSpeed: 0.8, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 16, magicResist: 20 },
  { race: 'UNDEAD', type: 'Ghost',          label: 'GHOST',           powerType: POWER_TYPE_KNIGHT, hp: 100, atk: 20, attackSpeed: 0.75, moveSpeed: 2.4, attackRangeMax: 2,  attackRangeFullDamage: 2, projectileSpeed: 8.0, attackMode: ATTACK_MODE_MELEE, armor: 6, magicResist: 25, abilityType: ABILITY_PASSIVE, abilityKey: 'ghost_evasion' },
  { race: 'UNDEAD', type: 'Lich',           label: 'LICH',            powerType: POWER_TYPE_BISHOP, hp: 80,  atk: 21, attackSpeed: 0.55, moveSpeed: 1.0, attackRangeMax: 20, attackRangeFullDamage: 5, projectileSpeed: 5.5, attackMode: ATTACK_MODE_RANGED, armor: 3, magicResist: 20 },
  { race: 'UNDEAD', type: 'SkeletonArcher', label: 'SKELETON ARCHER', powerType: POWER_TYPE_PAWN,   hp: 96,  atk: 22, attackSpeed: 0.6, moveSpeed: 1.0, attackRangeMax: 20, attackRangeFullDamage: 5, projectileSpeed: 7.5, attackMode: ATTACK_MODE_RANGED, armor: 2, magicResist: 0, abilityType: ABILITY_PASSIVE, abilityKey: 'skeleton_archer_bounce' },
  { race: 'UNDEAD', type: 'Headless',       label: 'HEADLESS',        powerType: POWER_TYPE_ROOK,   hp: 119, atk: 29, attackSpeed: 0.65, moveSpeed: 0.9, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 13, magicResist: 0, cellSpanX: 2 },
  { race: 'UNDEAD', type: 'Worm',           label: 'WORM',            powerType: POWER_TYPE_QUEEN,  hp: 160, atk: 36, attackSpeed: 0.7, moveSpeed: 3.0, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 18, magicResist: 10, cellSpanX: 2, abilityType: ABILITY_PASSIVE, abilityKey: 'worm_swallow', abilityCooldown: 6 },
  { race: 'UNDEAD', type: 'Vampire',        label: 'VAMPIRE',         powerType: POWER_TYPE_BISHOP, hp: 117, atk: 20, attackSpeed: 0.85, moveSpeed: 2.0, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 5, magicResist: 10 },
  { race: 'UNDEAD', type: 'Zombie',         label: 'ZOMBIE',          powerType: POWER_TYPE_KNIGHT, hp: 105, atk: 24, attackSpeed: 0.65, moveSpeed: 0.9, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 8, magicResist: 0 },
  { race: 'UNDEAD', type: 'Undertaker',     label: 'UNDERTAKER',      powerType: POWER_TYPE_BISHOP, hp: 112, atk: 23, attackSpeed: 0.7, moveSpeed: 1.1, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 4, magicResist: 15, abilityType: ABILITY_ACTIVE, abilityKey: 'undertaker_active', abilityCooldown: 4 },
  { race: 'GOD',    type: 'Angel',          label: 'ANGEL',           powerType: POWER_TYPE_QUEEN,  hp: 152, atk: 34, attackSpeed: 0.7, moveSpeed: 3.0, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 16, magicResist: 30 },
  { race: 'DEMON',  type: 'Incub',          label: 'INCUB',           powerType: POWER_TYPE_KNIGHT, hp: 105, atk: 21, attackSpeed: 0.7, moveSpeed: 1.1, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 8, magicResist: 10, damageType: DAMAGE_TYPE_PURE },
  { race: 'DEMON',  type: 'Succub',         label: 'SUCCUB',          powerType: POWER_TYPE_BISHOP, hp: 112, atk: 20, attackSpeed: 0.75, moveSpeed: 1.3, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 5, magicResist: 20, damageType: DAMAGE_TYPE_PURE },
  { race: 'DEMON',  type: 'Devil',          label: 'DEVIL',           powerType: POWER_TYPE_ROOK,   hp: 152, atk: 32, attackSpeed: 0.65, moveSpeed: 3.0, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, armor: 17, magicResist: 20, damageType: DAMAGE_TYPE_PURE },
].map((u) => ({
  ...u,
  accuracy: Math.max(0, Math.min(1, Number(u.accuracy ?? DEFAULT_ACCURACY))),
  armor: Math.max(0, Number(u.armor ?? 0)),
  magicResist: Math.max(0, Number(u.magicResist ?? 0)),
  damageType: [DAMAGE_TYPE_PHYSICAL, DAMAGE_TYPE_MAGIC, DAMAGE_TYPE_PURE].includes(String(u.damageType ?? ''))
    ? String(u.damageType)
    : DAMAGE_TYPE_PHYSICAL,
  abilityDamageType: u.abilityDamageType == null
    ? getDefaultAbilityDamageType(u.abilityKey)
    : (
      [DAMAGE_TYPE_PHYSICAL, DAMAGE_TYPE_MAGIC, DAMAGE_TYPE_PURE].includes(String(u.abilityDamageType))
        ? String(u.abilityDamageType)
        : null
    ),
  abilityCooldown: Math.max(0, Number(u.abilityCooldown ?? 0)),
  abilityType: String(u.abilityType ?? ABILITY_NONE),
  abilityKey: u.abilityKey ?? null,
  cellSpanX: Math.max(1, Math.floor(Number(u.cellSpanX ?? 1))),
  attackMode: String(u.attackMode ?? ((Number(u.attackRangeMax ?? 1) > 1 && Number(u.projectileSpeed ?? 0) > 0) ? ATTACK_MODE_RANGED : ATTACK_MODE_MELEE)),
}));

export function getUnitCatalogEntry(type) {
  return UNIT_CATALOG.find((u) => u.type === type) ?? null;
}
