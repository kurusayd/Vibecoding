import Phaser from 'phaser';

// ===== Hex math (axial coords q,r), pointy-top =====

export function hexToPixel(state, q, r) {
  const s = state.hexSize;
  const x = state.originX + s * Math.sqrt(3) * (q + r / 2);
  const y = state.originY + s * (3 / 2) * r;
  return { x, y };
}

export function pixelToHex(state, x, y) {
  const s = state.hexSize;
  const px = (x - state.originX);
  const py = (y - state.originY);

  const q = (Math.sqrt(3) / 3 * px - 1 / 3 * py) / s;
  const r = (2 / 3 * py) / s;

  return hexRound(q, r);
}

// Нижняя точка гекса (куда должны вставать "ноги" юнита)
// pointy-top: нижняя вершина находится на +hexSize по Y от центра
export function hexToGroundPixel(state, q, r, groundLift = 0) {
  const p = hexToPixel(state, q, r);
  return { x: p.x, y: p.y + state.hexSize - groundLift };
}

export function hexRound(q, r) {
  let x = q;
  let z = r;
  let y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}

export function hexCorners(state, cx, cy) {
  const s = state.hexSize;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = Phaser.Math.DegToRad(60 * i - 30);
    pts.push({ x: cx + s * Math.cos(angle), y: cy + s * Math.sin(angle) });
  }
  return pts;
}

export function hexDistance(aq, ar, bq, br) {
  const ax = aq, az = ar, ay = -ax - az;
  const bx = bq, bz = br, by = -bx - bz;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}