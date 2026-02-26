// Shared king XP progression config used by player and bots.
// cost = XP needed to go from level L to L+1
// DAC sources cover up to level 10, and community sources mention 11:48, 12:56.
// Extended to 20 by continuing +8 per level.

export const KING_MAX_LEVEL = 20;

export const KING_XP_COST = [
  0,  // dummy for index 0
  1,  // 1->2
  1,  // 2->3
  2,  // 3->4
  4,  // 4->5
  8,  // 5->6
  16, // 6->7
  24, // 7->8
  32, // 8->9
  40, // 9->10
  48, // 10->11
  56, // 11->12
  64, // 12->13
  72, // 13->14
  80, // 14->15
  88, // 15->16
  96, // 16->17
  104,// 17->18
  112,// 18->19
  120,// 19->20
];

export function kingXpToNext(level) {
  if (level >= KING_MAX_LEVEL) return 0;
  return KING_XP_COST[level] ?? 0;
}

