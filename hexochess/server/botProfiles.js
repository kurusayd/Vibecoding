function cell(col, row, type, rank = 1) {
  return { col, row, type, rank };
}

export const BOT_PROFILES_BY_INDEX = {
  1: {
    index: 1,
    id: 'bot-1',
    name: 'bot 1',
    kingVisualKey: 'bot_bishop',
    difficulty: { coinIncomeMultiplier: 1.0 },
    armyPreset: [
      cell(6, 4, 'Swordsman'),
      cell(7, 4, 'Swordsman'),
      cell(8, 4, 'Swordsman'),
      cell(7, 6, 'Crossbowman'),
      cell(9, 6, 'Crossbowman'),
    ],
  },
  2: {
    index: 2,
    id: 'bot-2',
    name: 'bot 2',
    kingVisualKey: 'bot_knight',
    difficulty: { coinIncomeMultiplier: 1.0 },
    armyPreset: [
      cell(6, 4, 'Crusader'),
      cell(7, 4, 'Crusader'),
      cell(8, 4, 'Crusader'),
      cell(10, 2, 'Crossbowman'),
      cell(10, 6, 'Crossbowman'),
    ],
  },
  3: {
    index: 3,
    id: 'bot-3',
    name: 'bot 3',
    kingVisualKey: 'bot_queen',
    difficulty: { coinIncomeMultiplier: 1.0 },
    armyPreset: [
      cell(7, 4, 'Zombie'),
      cell(7, 5, 'Zombie'),
      cell(8, 6, 'Lich'),
      cell(9, 6, 'Lich'),
      cell(10, 6, 'Lich'),
    ],
  },
  4: {
    index: 4,
    id: 'bot-4',
    name: 'bot 4',
    kingVisualKey: 'bot_rook',
    difficulty: { coinIncomeMultiplier: 1.0 },
    armyPreset: [
      cell(6, 3, 'Vampire'),
      cell(7, 4, 'Vampire'),
      cell(8, 3, 'Vampire'),
      cell(8, 5, 'Vampire'),
      cell(9, 4, 'Vampire'),
    ],
  },
  5: {
    index: 5,
    id: 'bot-5',
    name: 'bot 5',
    kingVisualKey: 'king_frog',
    difficulty: { coinIncomeMultiplier: 1.0 },
    armyPreset: [
      cell(6, 3, 'BonesGolem'),
      cell(7, 3, 'BonesGolem'),
      cell(6, 5, 'BonesGolem'),
      cell(7, 5, 'BonesGolem'),
      cell(9, 6, 'Lich'),
    ],
  },
  6: {
    index: 6,
    id: 'bot-6',
    name: 'bot 6',
    kingVisualKey: 'king_king',
    difficulty: { coinIncomeMultiplier: 1.0 },
    armyPreset: [
      cell(6, 4, 'Ghost', 2),
      cell(7, 3, 'Ghost', 2),
      cell(7, 5, 'Ghost', 2),
      cell(9, 6, 'Lich'),
    ],
  },
  7: {
    index: 7,
    id: 'bot-7',
    name: 'bot 7',
    kingVisualKey: 'king_princess',
    difficulty: { coinIncomeMultiplier: 1.0 },
    armyPreset: [
      cell(7, 4, 'Skeleton', 2),
      cell(6, 4, 'Skeleton', 1),
      cell(8, 4, 'Skeleton', 1),
      cell(7, 6, 'SkeletonArcher', 2),
      cell(6, 6, 'SkeletonArcher', 1),
      cell(8, 6, 'SkeletonArcher', 1),
    ],
  },
};

export function getBotProfileByIndex(index) {
  const n = Number(index);
  return BOT_PROFILES_BY_INDEX[n] ?? null;
}

export function getBotProfileById(id) {
  const m = String(id ?? '').match(/^bot-(\d+)$/);
  if (!m) return null;
  return getBotProfileByIndex(Number(m[1]));
}
