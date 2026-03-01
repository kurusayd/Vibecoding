// Shared unit catalog used by the server (authoritative gameplay) and test scene UI/spawn presets.
// Edit stats here to keep server and local test scene in sync.

const POWER_TYPE_PAWN = '\u041f\u0435\u0448\u043a\u0430';   // Пешка
const POWER_TYPE_KNIGHT = '\u041a\u043e\u043d\u044c';      // Конь
const POWER_TYPE_BISHOP = '\u0421\u043b\u043e\u043d';      // Слон
const POWER_TYPE_ROOK = '\u041b\u0430\u0434\u044c\u044f';  // Ладья
const POWER_TYPE_QUEEN = '\u0424\u0435\u0440\u0437\u044c'; // Ферзь

const ABILITY_NONE = 'none';
const ABILITY_ACTIVE = 'active';

export const UNIT_CATALOG = [
  { race: 'HUMAN',  type: 'Swordsman',      label: 'SWORDSMAN',       powerType: POWER_TYPE_PAWN,   hp: 60,  atk: 20, attackSpeed: 1.0, moveSpeed: 1.4, attackRangeMax: 1,  attackRangeFullDamage: 1 },
  { race: 'HUMAN',  type: 'Priest',         label: 'PRIEST',          powerType: POWER_TYPE_PAWN,   hp: 60,  atk: 20, attackSpeed: 1.3, moveSpeed: 0.9, attackRangeMax: 20, attackRangeFullDamage: 5 },
  { race: 'LIZARD', type: 'Monk',           label: 'MONK',            powerType: POWER_TYPE_PAWN,   hp: 60,  atk: 20, attackSpeed: 1.1, moveSpeed: 1.9, attackRangeMax: 1,  attackRangeFullDamage: 1 },
  { race: 'UNDEAD', type: 'Skeleton',       label: 'SKELETON',        powerType: POWER_TYPE_PAWN,   hp: 60,  atk: 20, attackSpeed: 1.0, moveSpeed: 1.3, attackRangeMax: 1,  attackRangeFullDamage: 1 },
  { race: 'HUMAN',  type: 'Crossbowman',    label: 'CROSSBOW',        powerType: POWER_TYPE_KNIGHT, hp: 40,  atk: 25, attackSpeed: 1.6, moveSpeed: 1.0, attackRangeMax: 20, attackRangeFullDamage: 5 },
  { race: 'HUMAN',  type: 'Crusader',       label: 'CRUSADER',        powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, attackSpeed: 0.9, moveSpeed: 1.1, attackRangeMax: 1,  attackRangeFullDamage: 1 },
  { race: 'UNDEAD', type: 'BonesGolem',     label: 'BONES GOLEM',     powerType: POWER_TYPE_ROOK,   hp: 240, atk: 12, attackSpeed: 0.7, moveSpeed: 0.8, attackRangeMax: 1,  attackRangeFullDamage: 1 },
  { race: 'UNDEAD', type: 'Ghost',          label: 'GHOST',           powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, attackSpeed: 1.4, moveSpeed: 2.4, attackRangeMax: 2,  attackRangeFullDamage: 2 },
  { race: 'UNDEAD', type: 'Lich',           label: 'LICH',            powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, attackSpeed: 1.2, moveSpeed: 1.0, attackRangeMax: 20, attackRangeFullDamage: 5 },
  { race: 'UNDEAD', type: 'SkeletonArcher', label: 'SKELETON ARCHER', powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, attackSpeed: 1.3, moveSpeed: 1.0, attackRangeMax: 20, attackRangeFullDamage: 5 },
  { race: 'UNDEAD', type: 'Vampire',        label: 'VAMPIRE',         powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, attackSpeed: 1.1, moveSpeed: 2.0, attackRangeMax: 1,  attackRangeFullDamage: 1 },
  { race: 'UNDEAD', type: 'Zombie',         label: 'ZOMBIE',          powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, attackSpeed: 0.8, moveSpeed: 0.9, attackRangeMax: 1,  attackRangeFullDamage: 1 },
  { race: 'UNDEAD', type: 'Undertaker',     label: 'UNDERTAKER',      powerType: POWER_TYPE_BISHOP, hp: 120, atk: 12, attackSpeed: 0.9, moveSpeed: 1.1, attackRangeMax: 1,  attackRangeFullDamage: 1, abilityType: ABILITY_ACTIVE, abilityKey: 'undertaker_active' },
  { race: 'GOD',    type: 'Angel',          label: 'ANGEL',           powerType: POWER_TYPE_QUEEN,  hp: 480, atk: 24, attackSpeed: 1, moveSpeed: 3.0, attackRangeMax: 1,  attackRangeFullDamage: 1 },
  { race: 'DEMON',  type: 'Devil',          label: 'DEVIL',           powerType: POWER_TYPE_QUEEN,  hp: 480, atk: 24, attackSpeed: 1, moveSpeed: 3.0, attackRangeMax: 1,  attackRangeFullDamage: 1 },
].map((u) => ({
  ...u,
  abilityType: String(u.abilityType ?? ABILITY_NONE),
  abilityKey: u.abilityKey ?? null,
}));

export function getUnitCatalogEntry(type) {
  return UNIT_CATALOG.find((u) => u.type === type) ?? null;
}
