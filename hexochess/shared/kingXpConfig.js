// Shared king XP progression config used by player and bots.
// cost = XP needed to go from level L to L+1
// DAC sources cover up to level 10, and community sources mention 11:48, 12:56.
// Extended to 20 by continuing +8 per level.

export const KING_MAX_LEVEL = 20;

export const KING_XP_COST = [
  0,  // dummy for index 0
  1,  // 1->2
  1,  // 2->3
  4,  // 3->4
  8,  // 4->5
  16,  // 5->6
  32, // 6->7
  48, // 7->8
  56, // 8->9
  64, // 9->10
  64, // 10->11
  64, // 11->12
  64, // 12->13
  64, // 13->14
  64, // 14->15
  64, // 15->16
  64, // 16->17
  64,// 17->18
  64,// 18->19
  64,// 19->20
];

export function kingXpToNext(level) {
  if (level >= KING_MAX_LEVEL) return 0;
  return KING_XP_COST[level] ?? 0;
}

