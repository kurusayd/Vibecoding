export function getUnitCellSpanX(unitLike) {
  const raw = Number(unitLike?.cellSpanX ?? NaN);
  if (Number.isFinite(raw)) return Math.max(1, Math.floor(raw));
  const type = String(unitLike?.type ?? '');
  if (type === 'Headless' || type === 'Worm' || type === 'Knight') return 2;
  return 1;
}

export function getBoardCellsForUnit(unitLike) {
  const span = getUnitCellSpanX(unitLike);
  const q = Number(unitLike?.q ?? 0);
  const r = Number(unitLike?.r ?? 0);
  const out = [];
  // Anchor is the rightmost cell for horizontal multi-cell units.
  for (let i = 0; i < span; i++) out.push({ q: q - i, r });
  return out;
}
