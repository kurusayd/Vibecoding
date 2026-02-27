export function canManageShopInPhase(phase) {
  return phase === 'prep' || phase === 'battle';
}

export function canMergeBoardUnitsInPhase(phase) {
  return phase === 'prep';
}

export function clampCoins(value, cap) {
  const n = Number(value ?? 0);
  const c = Number(cap ?? 0);
  if (!Number.isFinite(n) || !Number.isFinite(c)) return 0;
  return Math.max(0, Math.min(c, n));
}

