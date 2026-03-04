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

export const UNIT_CATALOG = [
  { race: 'HUMAN',  type: 'Swordsman',      label: 'SWORDSMAN',       powerType: POWER_TYPE_PAWN,   hp: 60,  atk: 20, attackSpeed: 1.0, moveSpeed: 1.4, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE },
  { race: 'HUMAN',  type: 'Priest',         label: 'PRIEST',          powerType: POWER_TYPE_BISHOP, hp: 60,  atk: 20, attackSpeed: 0.65, moveSpeed: 0.9, attackRangeMax: 20, attackRangeFullDamage: 5, projectileSpeed: 6.0, attackMode: ATTACK_MODE_RANGED },
  { race: 'LIZARD', type: 'Monk',           label: 'MONK',            powerType: POWER_TYPE_PAWN,   hp: 60,  atk: 20, attackSpeed: 1.1, moveSpeed: 1.9, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE },
  { race: 'UNDEAD', type: 'Skeleton',       label: 'SKELETON',        powerType: POWER_TYPE_PAWN,   hp: 60,  atk: 20, attackSpeed: 1.0, moveSpeed: 1.3, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE },
  { race: 'UNDEAD', type: 'SimpleSkeleton', label: 'SIMPLE SKELETON', powerType: POWER_TYPE_PAWN,   hp: 60,  atk: 20, attackSpeed: 1.0, moveSpeed: 1.4, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE },
  { race: 'HUMAN',  type: 'Crossbowman',    label: 'CROSSBOW',        powerType: POWER_TYPE_PAWN,   hp: 40,  atk: 25, attackSpeed: 0.8, moveSpeed: 1.0, attackRangeMax: 20, attackRangeFullDamage: 5, projectileSpeed: 7.5, attackMode: ATTACK_MODE_RANGED },
  { race: 'HUMAN',  type: 'Crusader',       label: 'CRUSADER',        powerType: POWER_TYPE_KNIGHT, hp: 120, atk: 12, attackSpeed: 0.9, moveSpeed: 1.1, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE },
  { race: 'HUMAN',  type: 'Knight',         label: 'KNIGHT',          powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, attackSpeed: 0.8, moveSpeed: 0.9, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, cellSpanX: 2 },
  { race: 'UNDEAD', type: 'BonesGolem',     label: 'BONES GOLEM',     powerType: POWER_TYPE_BISHOP, hp: 240, atk: 12, attackSpeed: 0.7, moveSpeed: 0.8, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE },
  { race: 'UNDEAD', type: 'Ghost',          label: 'GHOST',           powerType: POWER_TYPE_KNIGHT, hp: 120, atk: 12, attackSpeed: 0.7, moveSpeed: 2.4, attackRangeMax: 2,  attackRangeFullDamage: 2, projectileSpeed: 8.0, attackMode: ATTACK_MODE_MELEE, abilityType: ABILITY_PASSIVE, abilityKey: 'ghost_evasion' },
  { race: 'UNDEAD', type: 'Lich',           label: 'LICH',            powerType: POWER_TYPE_BISHOP, hp: 120, atk: 12, attackSpeed: 0.6, moveSpeed: 1.0, attackRangeMax: 20, attackRangeFullDamage: 5, projectileSpeed: 5.5, attackMode: ATTACK_MODE_RANGED },
  { race: 'UNDEAD', type: 'SkeletonArcher', label: 'SKELETON ARCHER', powerType: POWER_TYPE_PAWN,   hp: 120, atk: 12, attackSpeed: 0.65, moveSpeed: 1.0, attackRangeMax: 20, attackRangeFullDamage: 5, projectileSpeed: 7.5, attackMode: ATTACK_MODE_RANGED, abilityType: ABILITY_PASSIVE, abilityKey: 'skeleton_archer_bounce' },
  { race: 'UNDEAD', type: 'Headless',       label: 'HEADLESS',        powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, attackSpeed: 0.8, moveSpeed: 0.9, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, cellSpanX: 2 },
  { race: 'UNDEAD', type: 'Worm',           label: 'WORM',            powerType: POWER_TYPE_QUEEN,  hp: 480, atk: 24, attackSpeed: 1, moveSpeed: 3.0, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, cellSpanX: 2 },
  { race: 'UNDEAD', type: 'Vampire',        label: 'VAMPIRE',         powerType: POWER_TYPE_BISHOP, hp: 120, atk: 12, attackSpeed: 1.1, moveSpeed: 2.0, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE },
  { race: 'UNDEAD', type: 'Zombie',         label: 'ZOMBIE',          powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, attackSpeed: 0.8, moveSpeed: 0.9, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE },
  { race: 'UNDEAD', type: 'Undertaker',     label: 'UNDERTAKER',      powerType: POWER_TYPE_BISHOP, hp: 120, atk: 12, attackSpeed: 0.9, moveSpeed: 1.1, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE, abilityType: ABILITY_ACTIVE, abilityKey: 'undertaker_active', abilityCooldown: 4 },
  { race: 'GOD',    type: 'Angel',          label: 'ANGEL',           powerType: POWER_TYPE_QUEEN,  hp: 480, atk: 24, attackSpeed: 1, moveSpeed: 3.0, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE },
  { race: 'DEMON',  type: 'Incub',          label: 'INCUB',           powerType: POWER_TYPE_KNIGHT, hp: 120, atk: 12, attackSpeed: 0.9, moveSpeed: 1.1, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE },
  { race: 'DEMON',  type: 'Succub',         label: 'SUCCUB',          powerType: POWER_TYPE_BISHOP, hp: 120, atk: 12, attackSpeed: 0.95, moveSpeed: 1.3, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE },
  { race: 'DEMON',  type: 'Devil',          label: 'DEVIL',           powerType: POWER_TYPE_QUEEN,  hp: 480, atk: 24, attackSpeed: 1, moveSpeed: 3.0, attackRangeMax: 1,  attackRangeFullDamage: 1, projectileSpeed: 0, attackMode: ATTACK_MODE_MELEE },
].map((u) => ({
  ...u,
  accuracy: Math.max(0, Math.min(1, Number(u.accuracy ?? DEFAULT_ACCURACY))),
  abilityCooldown: Math.max(0, Number(u.abilityCooldown ?? 0)),
  abilityType: String(u.abilityType ?? ABILITY_NONE),
  abilityKey: u.abilityKey ?? null,
  cellSpanX: Math.max(1, Math.floor(Number(u.cellSpanX ?? 1))),
  attackMode: String(u.attackMode ?? ((Number(u.attackRangeMax ?? 1) > 1 && Number(u.projectileSpeed ?? 0) > 0) ? ATTACK_MODE_RANGED : ATTACK_MODE_MELEE)),
}));

export function getUnitCatalogEntry(type) {
  return UNIT_CATALOG.find((u) => u.type === type) ?? null;
}
