import test from 'node:test';
import assert from 'node:assert/strict';

import { applyKingXp, kingXpToNext, KING_MAX_LEVEL } from '../shared/battleCore.js';
import { interestIncome, COINS_CAP } from '../shared/economy.js';
import { canManageShopInPhase, canMergeBoardUnitsInPhase, clampCoins } from '../shared/gameRules.js';

test('shop is manageable only in prep/battle phases', () => {
  assert.equal(canManageShopInPhase('prep'), true);
  assert.equal(canManageShopInPhase('battle'), true);
  assert.equal(canManageShopInPhase('result'), false);
  assert.equal(canManageShopInPhase('unknown'), false);
});

test('board merges are allowed only in prep phase', () => {
  assert.equal(canMergeBoardUnitsInPhase('prep'), true);
  assert.equal(canMergeBoardUnitsInPhase('battle'), false);
});

test('coin clamping obeys 0..cap range', () => {
  assert.equal(clampCoins(-10, COINS_CAP), 0);
  assert.equal(clampCoins(COINS_CAP + 10, COINS_CAP), COINS_CAP);
  assert.equal(clampCoins(57, COINS_CAP), 57);
});

test('interest income is monotonic by tens and capped by economy rules', () => {
  assert.equal(interestIncome(0), 0);
  assert.equal(interestIncome(9), 0);
  assert.equal(interestIncome(10), 1);
  assert.equal(interestIncome(20), 2);
  assert.equal(interestIncome(50), 5);
  assert.equal(interestIncome(90), 5);
});

test('king xp progression levels up and never exceeds max level', () => {
  const king = { level: 1, xp: 0 };
  const totalToMax = Array.from({ length: KING_MAX_LEVEL - 1 }, (_, i) => kingXpToNext(i + 1))
    .reduce((a, b) => a + Number(b ?? 0), 0);

  applyKingXp(king, totalToMax + 999);

  assert.equal(king.level, KING_MAX_LEVEL);
  assert.ok(king.xp >= 0);
});

