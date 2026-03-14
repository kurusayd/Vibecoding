import { POWER_TYPE_BISHOP, POWER_TYPE_KNIGHT, POWER_TYPE_PAWN, POWER_TYPE_QUEEN, POWER_TYPE_ROOK, normalizePowerType } from './unitCatalog.js';

export const SHOP_ODDS_LAST_LEVEL = 11;

export const SHOP_ODDS_POWER_TYPES = Object.freeze([
  POWER_TYPE_PAWN,
  POWER_TYPE_KNIGHT,
  POWER_TYPE_BISHOP,
  POWER_TYPE_ROOK,
  POWER_TYPE_QUEEN,
]);

export const SHOP_ODDS_BY_POWER_TYPE = Object.freeze({
  [POWER_TYPE_PAWN]: Object.freeze([100, 85, 70, 55, 45, 35, 25, 20, 20, 15, 15]),
  [POWER_TYPE_KNIGHT]: Object.freeze([0, 15, 25, 35, 35, 35, 30, 30, 25, 25, 20]),
  [POWER_TYPE_BISHOP]: Object.freeze([0, 0, 5, 10, 18, 25, 35, 32, 27, 25, 20]),
  [POWER_TYPE_ROOK]: Object.freeze([0, 0, 0, 0, 2, 5, 10, 17, 25, 29, 36]),
  [POWER_TYPE_QUEEN]: Object.freeze([0, 0, 0, 0, 0, 0, 0, 1, 3, 6, 9]),
});

export function clampShopOddsLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level ?? 1)));
  return Math.min(SHOP_ODDS_LAST_LEVEL, safeLevel);
}

export function getShopOddsForPowerTypeAtLevel(powerType, level) {
  const byLevel = SHOP_ODDS_BY_POWER_TYPE[normalizePowerType(powerType)];
  if (!byLevel) return 0;
  const clampedLevel = clampShopOddsLevel(level);
  return Number(byLevel[clampedLevel - 1] ?? 0);
}

export function getShopOddsRowForLevel(level) {
  const clampedLevel = clampShopOddsLevel(level);
  const row = {};
  for (const powerType of SHOP_ODDS_POWER_TYPES) {
    row[powerType] = getShopOddsForPowerTypeAtLevel(powerType, clampedLevel);
  }
  return row;
}
