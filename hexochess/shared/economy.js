// Shared economy rules used by server (authoritative) and client UI previews/tooltips.

export const BASE_INCOME_AFTER_R5 = 5;
export const INTEREST_STEP = 10;
export const INTEREST_CAP = 5; // classic cap: +5
export const COINS_CAP = 100;

// round: 1..N
export function baseIncomeForRound(round) {
  if (round <= 1) return 1;
  if (round === 2) return 2;
  if (round === 3) return 3;
  if (round === 4) return 4;
  return BASE_INCOME_AFTER_R5;
}

export function interestIncome(coins) {
  return Math.min(INTEREST_CAP, Math.floor(Number(coins ?? 0) / INTEREST_STEP));
}

export function streakBonus(streakCount) {
  // 0-2:0, 3-4:+1, 5-6:+2, 7+:+3
  if (streakCount >= 7) return 3;
  if (streakCount >= 5) return 2;
  if (streakCount >= 3) return 1;
  return 0;
}

