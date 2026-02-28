// Shared unit catalog used by the server (authoritative gameplay) and test scene UI/spawn presets.
// Edit stats here to keep server and local test scene in sync.

const POWER_TYPE_PAWN = '\u041f\u0435\u0448\u043a\u0430';   // Пешка
const POWER_TYPE_KNIGHT = '\u041a\u043e\u043d\u044c';      // Конь
const POWER_TYPE_ROOK = '\u041b\u0430\u0434\u044c\u044f';  // Ладья

export const UNIT_CATALOG = [
  { race: 'HUMAN',  type: 'Swordsman',      label: 'SWORDSMAN',       powerType: POWER_TYPE_PAWN,   hp: 60,  atk: 20, moveSpeed: 2.6, attackSpeed: 100 },
  { race: 'HUMAN',  type: 'Priest',         label: 'PRIEST',          powerType: POWER_TYPE_PAWN,   hp: 60,  atk: 20, moveSpeed: 2.6, attackSpeed: 100 },
  { race: 'LIZARD', type: 'Monk',           label: 'MONK',            powerType: POWER_TYPE_PAWN,   hp: 60,  atk: 20, moveSpeed: 2.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'Skeleton',       label: 'SKELETON',        powerType: POWER_TYPE_PAWN,   hp: 60,  atk: 20, moveSpeed: 2.6, attackSpeed: 100 },
  { race: 'HUMAN',  type: 'Crossbowman',    label: 'CROSSBOW',        powerType: POWER_TYPE_KNIGHT, hp: 40,  atk: 25, moveSpeed: 2.3, attackSpeed: 100 },
  { race: 'HUMAN',  type: 'Crusader',       label: 'CRUSADER',        powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'BonesGolem',     label: 'BONES GOLEM',     powerType: POWER_TYPE_ROOK,   hp: 240, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'Ghost',          label: 'GHOST',           powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'Lich',           label: 'LICH',            powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'SkeletonArcher', label: 'SKELETON ARCHER', powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'Vampire',        label: 'VAMPIRE',         powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'Zombie',         label: 'ZOMBIE',          powerType: POWER_TYPE_ROOK,   hp: 120, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
];

export function getUnitCatalogEntry(type) {
  return UNIT_CATALOG.find((u) => u.type === type) ?? null;
}
