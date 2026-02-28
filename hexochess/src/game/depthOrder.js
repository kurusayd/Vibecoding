export const DEPTH_ORDER_ROW_FACTOR = 10;
export const DEPTH_ORDER_COL_FACTOR = 0.01;

export function boardColFromQr(q, r) {
  return q + Math.floor(r / 2);
}

export function boardDepth(baseDepth, q, r) {
  const row = Number(r);
  const col = boardColFromQr(Number(q), row);
  return Number(baseDepth) + row * DEPTH_ORDER_ROW_FACTOR + col * DEPTH_ORDER_COL_FACTOR;
}

export function hasBoardCoords(unitLike) {
  const q = Number(unitLike?.q);
  const r = Number(unitLike?.r);
  return Number.isFinite(q) && Number.isFinite(r);
}
