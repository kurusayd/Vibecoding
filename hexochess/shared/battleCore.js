import { KING_MAX_LEVEL, KING_XP_COST, kingXpToNext } from './kingXpConfig.js';

// Pure battle core logic (no Phaser).
const DEFAULT_ATTACK_RANGE_MAX = 1;
const DEFAULT_ATTACK_RANGE_FULL_DAMAGE = 1;
const DEFAULT_ATTACK_SPEED = 1;
const DEFAULT_MOVE_SPEED = 1;
const DEFAULT_PROJECTILE_SPEED = 0;
const DEFAULT_ACCURACY = 0.8;
const DEFAULT_ABILITY_TYPE = 'none';
const DEFAULT_ABILITY_COOLDOWN = 0;
const DEFAULT_ATTACK_MODE = 'melee';
const DEFAULT_CELL_SPAN_X = 1;

function normalizeCellSpanX(value, type) {
  if (Number.isFinite(Number(value))) {
    return Math.max(1, Math.floor(Number(value)));
  }
  // Backward-safe fallback for older state snapshots without explicit span.
  if (String(type ?? '') === 'Headless') return 2;
  return DEFAULT_CELL_SPAN_X;
}

export function getUnitCellSpanX(unitLike) {
  return normalizeCellSpanX(unitLike?.cellSpanX, unitLike?.type);
}

export function getOccupiedCellsFromAnchor(q, r, cellSpanX = DEFAULT_CELL_SPAN_X) {
  const span = Math.max(1, Math.floor(Number(cellSpanX ?? DEFAULT_CELL_SPAN_X)));
  const out = [];
  for (let i = 0; i < span; i++) {
    // Anchor is the rightmost cell for horizontal multi-cell units.
    out.push({ q: Number(q) - i, r: Number(r) });
  }
  return out;
}

export function getUnitOccupiedCells(unitLike) {
  if (!unitLike) return [];
  return getOccupiedCellsFromAnchor(unitLike.q, unitLike.r, getUnitCellSpanX(unitLike));
}

function distanceBetweenUnitsByFootprint(a, b) {
  const aCells = getUnitOccupiedCells(a);
  const bCells = getUnitOccupiedCells(b);
  let best = Infinity;
  for (const ac of aCells) {
    for (const bc of bCells) {
      const d = hexDistance(ac.q, ac.r, bc.q, bc.r);
      if (d < best) best = d;
    }
  }
  return Number.isFinite(best) ? best : Infinity;
}

export function createBattleState() {
  return {
    phase: 'prep',     // 'prep' | 'battle'
    result: null,      // null | 'victory' | 'defeat' | 'draw'
    gameStarted: false,
    battleReplay: null, // precomputed server battle log
    units: [],
    kings: {
      player: { hp: 100, maxHp: 100, coins: 100, level: 1, xp: 0 },
      enemy: { hp: 100, maxHp: 100, coins: 0, visible: false, level: 1, xp: 0 },
    },
    shop: {
      offers: [],
    },
  };
}

export function addUnit(state, unit) {
  const attackRangeMax = Math.max(1, Number(unit.attackRangeMax ?? DEFAULT_ATTACK_RANGE_MAX));
  const attackRangeFullDamage = Math.max(1, Number(unit.attackRangeFullDamage ?? attackRangeMax));
  const attackSpeed = Math.max(0.1, Number(unit.attackSpeed ?? DEFAULT_ATTACK_SPEED));
  const moveSpeed = Math.max(1, Number(unit.moveSpeed ?? DEFAULT_MOVE_SPEED));
  const projectileSpeed = Math.max(0, Number(unit.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED));
  const accuracy = Math.max(0, Math.min(1, Number(unit.accuracy ?? DEFAULT_ACCURACY)));
  const abilityCooldown = Math.max(0, Number(unit.abilityCooldown ?? DEFAULT_ABILITY_COOLDOWN));
  const attackMode = String(unit.attackMode ?? DEFAULT_ATTACK_MODE);
  const cellSpanX = normalizeCellSpanX(unit.cellSpanX, unit.type);

  state.units.push({
    id: unit.id,
    q: unit.q,
    r: unit.r,
    hp: unit.hp,
    maxHp: unit.maxHp ?? unit.hp,
    atk: unit.atk,
    team: unit.team,
    rank: unit.rank ?? 1,
    type: unit.type ?? null,
    powerType: unit.powerType ?? null,
    zone: unit.zone ?? 'board',
    benchSlot: unit.benchSlot ?? null,
    attackSpeed,
    moveSpeed,
    projectileSpeed,
    attackMode,
    accuracy,
    abilityCooldown,
    attackRangeMax,
    attackRangeFullDamage,
    abilityType: String(unit.abilityType ?? DEFAULT_ABILITY_TYPE),
    abilityKey: unit.abilityKey ?? null,
    attackSeq: unit.attackSeq ?? 0,
    dead: Boolean(unit.dead ?? false),
    cellSpanX,
  });
}

export function getUnitAt(state, q, r) {
  return state.units.find((u) => {
    if (u.zone !== 'board' || u.dead) return false;
    return getUnitOccupiedCells(u).some((c) => c.q === q && c.r === r);
  }) ?? null;
}

export function moveUnit(state, unitId, q, r) {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return false;
  if (unit.zone !== 'board') return false;
  if (unit.dead) return false;

  const nextCells = getOccupiedCellsFromAnchor(q, r, getUnitCellSpanX(unit));
  for (const c of nextCells) {
    const occupied = getUnitAt(state, c.q, c.r);
    if (occupied && occupied.id !== unitId) return false;
  }

  unit.q = q;
  unit.r = r;
  return true;
}

export function hexDistance(aq, ar, bq, br) {
  const ax = aq;
  const az = ar;
  const ay = -ax - az;
  const bx = bq;
  const bz = br;
  const by = -bx - bz;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

export function attack(state, attackerId, targetId) {
  const attacker = state.units.find((u) => u.id === attackerId);
  const target = state.units.find((u) => u.id === targetId);

  if (!attacker || !target) return { success: false, reason: 'NO_UNIT' };
  if (attacker.zone !== 'board') return { success: false, reason: 'ATTACKER_NOT_ON_BOARD' };
  if (target.zone !== 'board') return { success: false, reason: 'TARGET_NOT_ON_BOARD' };
  if (attacker.dead) return { success: false, reason: 'ATTACKER_DEAD' };
  if (target.dead) return { success: false, reason: 'TARGET_DEAD' };
  if (attacker.team === target.team) return { success: false, reason: 'SAME_TEAM' };

  const dist = distanceBetweenUnitsByFootprint(attacker, target);
  const attackRangeMax = Math.max(1, Number(attacker.attackRangeMax ?? DEFAULT_ATTACK_RANGE_MAX));
  const attackRangeFullDamage = Math.max(1, Number(attacker.attackRangeFullDamage ?? attackRangeMax));
  if (dist > attackRangeMax) return { success: false, reason: 'OUT_OF_RANGE', dist, attackRangeMax };

  const baseDamage = Math.max(0, Number(attacker.atk ?? 0));
  const damageMultiplier = dist > attackRangeFullDamage ? 0.5 : 1;
  const damage = Math.max(1, Math.round(baseDamage * damageMultiplier));
  target.hp -= damage;

  if (target.hp <= 0) {
    target.hp = 0;
    target.dead = true;
    return { success: true, killed: true, damage, dist, attackRangeMax, attackRangeFullDamage };
  }

  return { success: true, killed: false, damage, dist, attackRangeMax, attackRangeFullDamage };
}

export { KING_MAX_LEVEL, KING_XP_COST, kingXpToNext };

export function applyKingXp(king, deltaXp) {
  if (!king) return;
  king.level = Math.max(1, Math.min(KING_MAX_LEVEL, Number(king.level ?? 1)));
  king.xp = Math.max(0, Number(king.xp ?? 0) + Number(deltaXp ?? 0));

  while (king.level < KING_MAX_LEVEL) {
    const need = kingXpToNext(king.level);
    if (!need || king.xp < need) break;
    king.xp -= need;
    king.level += 1;
  }
}
