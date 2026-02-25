// Shared unit catalog used by the server (authoritative gameplay) and test scene UI/spawn presets.
// Edit stats here to keep server and local test scene in sync.
export const UNIT_CATALOG = [
  { race: 'HUMAN',  type: 'Swordsman',      label: 'SWORDSMAN',       powerType: 'Пешка', hp: 60,  atk: 20, moveSpeed: 2.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'Skeleton',       label: 'SKELETON',        powerType: 'Пешка', hp: 60,  atk: 20, moveSpeed: 2.6, attackSpeed: 100 },
  { race: 'HUMAN',  type: 'Crossbowman',    label: 'CROSSBOW',        powerType: 'Конь',  hp: 40,  atk: 25, moveSpeed: 2.3, attackSpeed: 100 },
  { race: 'HUMAN',  type: 'Knight',         label: 'KNIGHT',          powerType: 'Ладья', hp: 120, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'BonesGolem',     label: 'BONES GOLEM',     powerType: 'Ладья', hp: 240, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'Ghost',          label: 'GHOST',           powerType: 'Ладья', hp: 120, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'Lich',           label: 'LICH',            powerType: 'Ладья', hp: 120, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'SkeletonArcher', label: 'SKELETON ARCHER', powerType: 'Ладья', hp: 120, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'Vampire',        label: 'VAMPIRE',         powerType: 'Ладья', hp: 120, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
  { race: 'UNDEAD', type: 'Zombie',         label: 'ZOMBIE',          powerType: 'Ладья', hp: 120, atk: 12, moveSpeed: 1.6, attackSpeed: 100 },
];

export function getUnitCatalogEntry(type) {
  return UNIT_CATALOG.find((u) => u.type === type) ?? null;
}

