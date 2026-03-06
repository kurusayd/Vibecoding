import {
  createBattleState,
  getUnitAt,
  moveUnit,
  hexDistance,
  getUnitCellSpanX,
  getOccupiedCellsFromAnchor,
} from '../shared/battleCore.js';
import { UNIT_CATALOG } from '../shared/unitCatalog.js';
import { BATTLE_DURATION_SECONDS } from './battlePhases.js';

const GRID_COLS = 12;
const GRID_ROWS = 8;
const DEFAULT_UNIT_ATTACK_SPEED = 1;
const DEFAULT_UNIT_MOVE_SPEED = 1;
const DEFAULT_UNIT_PROJECTILE_SPEED = 0;
const DEFAULT_UNIT_ACCURACY = 0.8;
const DEFAULT_UNIT_ABILITY_COOLDOWN = 0;
const DEFAULT_UNIT_ATTACK_MODE = 'melee';
const GHOST_EVASION_DODGE_CHANCE = 0.5;
const UNDERTAKER_SUMMON_TYPE = 'SimpleSkeleton';
const UNDERTAKER_ABILITY_KEY = 'undertaker_active';
const UNDERTAKER_CAST_TIME_MS = 1000;
const WORM_SWALLOW_ABILITY_KEY = 'worm_swallow';
const WORM_SWALLOW_DIGEST_MS = 6000;
const WORM_SWALLOW_CHANCE = 0.5;
const WORM_DIGEST_SPEED_MULT = 0.7;
const MAX_ACTIONS_PER_UNIT_PER_TICK = 8;
const CROSSBOWMAN_IMPACT_DELAY_MS = 200;

export const SNAPSHOT_STEP_MS = 100;

function rankMultiplier(rank) {
  const safeRank = Math.max(1, Math.min(3, Number(rank ?? 1)));
  return 2 ** (safeRank - 1);
}

function cloneStateForBattleReplay(sourceState) {
  return {
    phase: sourceState.phase,
    result: sourceState.result,
    units: (sourceState.units ?? []).map((u) => ({ ...u })),
    kings: {
      player: { ...(sourceState.kings?.player ?? {}) },
      enemy: { ...(sourceState.kings?.enemy ?? {}) },
    },
  };
}

function findUnitByIdIn(simState, id) {
  return simState.units.find((u) => u.id === id) ?? null;
}

function getUnitAtTimeIn(simState, q, r, timeMs, team = null) {
  for (const u of simState.units ?? []) {
    if (!u || u.zone !== 'board' || u.dead) continue;
    if (team != null && u.team !== team) continue;
    const pos = getCombatHexAtIn(simState, u, timeMs);
    if (!pos) continue;
    const cells = getBoardCellsForUnitAnchor(u, pos.q, pos.r);
    if (cells.some((c) => Number(c.q) === Number(q) && Number(c.r) === Number(r))) {
      return u;
    }
  }
  return null;
}

function isInsideBoard(q, r) {
  if (r < 0 || r >= GRID_ROWS) return false;
  const col = q + Math.floor(r / 2);
  return col >= 0 && col < GRID_COLS;
}

function getBoardCellsForUnitAnchor(unitLike, q, r) {
  return getOccupiedCellsFromAnchor(q, r, getUnitCellSpanX(unitLike));
}

function isBoardPlacementInsideForUnit(unitLike, q, r) {
  const cells = getBoardCellsForUnitAnchor(unitLike, q, r);
  return cells.every((c) => isInsideBoard(c.q, c.r));
}

function findBlockingUnitAtPlacement(simState, unitLike, q, r, ignoreUnitId = null) {
  const cells = getBoardCellsForUnitAnchor(unitLike, q, r);
  for (const c of cells) {
    const occupied = getUnitAt(simState, c.q, c.r);
    if (!occupied) continue;
    if (ignoreUnitId != null && Number(occupied.id) === Number(ignoreUnitId)) continue;
    return occupied;
  }
  return null;
}

function canPlaceUnitAtBoard(simState, unitLike, q, r, ignoreUnitId = null) {
  if (!isBoardPlacementInsideForUnit(unitLike, q, r)) return false;
  return !findBlockingUnitAtPlacement(simState, unitLike, q, r, ignoreUnitId);
}

function getCombatHexAtIn(simState, unit, timeMs) {
  if (!unit) return null;
  const startAt = Number(unit.moveStartAt ?? -1);
  const endAt = Number(unit.moveEndAt ?? -1);
  const fromQ = Number(unit.moveFromQ ?? unit.q);
  const fromR = Number(unit.moveFromR ?? unit.r);
  const toQ = Number(unit.q);
  const toR = Number(unit.r);
  if (endAt <= startAt || timeMs + 1e-6 >= endAt) return { q: toQ, r: toR };
  if (timeMs + 1e-6 < startAt) return { q: fromQ, r: fromR };
  const progress = (timeMs - startAt) / Math.max(1, endAt - startAt);
  return progress < 0.5 ? { q: fromQ, r: fromR } : { q: toQ, r: toR };
}

function unitDistanceByFootprintAtTime(simState, a, b, timeMs) {
  const aPos = getCombatHexAtIn(simState, a, timeMs);
  const bPos = getCombatHexAtIn(simState, b, timeMs);
  if (!aPos || !bPos) return Infinity;
  const aCells = getBoardCellsForUnitAnchor(a, aPos.q, aPos.r);
  const bCells = getBoardCellsForUnitAnchor(b, bPos.q, bPos.r);
  let best = Infinity;
  for (const ac of aCells) {
    for (const bc of bCells) {
      const d = hexDistance(ac.q, ac.r, bc.q, bc.r);
      if (d < best) best = d;
    }
  }
  return Number.isFinite(best) ? best : Infinity;
}

function findClosestOpponentIn(simState, attacker, timeMs) {
  if (!attacker || attacker.dead) return null;
  const opponentTeam = attacker.team === 'player' ? 'enemy' : 'player';
  if (!getCombatHexAtIn(simState, attacker, timeMs)) return null;

  let best = null;
  let bestDist = Infinity;
  for (const u of simState.units) {
    if (u.zone !== 'board' || u.dead || u.team !== opponentTeam) continue;
    const d = unitDistanceByFootprintAtTime(simState, attacker, u, timeMs);
    if (d < bestDist) {
      bestDist = d;
      best = u;
    }
  }
  return best;
}

function findBestCrossbowmanTargetIn(simState, attacker, timeMs) {
  if (!attacker || attacker.dead) return null;
  const attackerPos = getCombatHexAtIn(simState, attacker, timeMs);
  if (!attackerPos) return null;
  const opponentTeam = attacker.team === 'player' ? 'enemy' : 'player';

  let bestShootNow = null;
  let bestShootNowDist = Infinity;
  let bestShootNowFootDist = Infinity;

  let bestReposition = null;
  let bestRepositionMoveDist = Infinity;
  let bestRepositionFootDist = Infinity;

  for (const u of simState.units ?? []) {
    if (!u || u.dead || u.zone !== 'board' || u.team !== opponentTeam) continue;

    const lineShotMeta = getCrossbowmanLineShotMetaIn(simState, attacker, u, timeMs);
    const footDist = unitDistanceByFootprintAtTime(simState, attacker, u, timeMs);
    if (lineShotMeta?.canShoot) {
      const shotDist = Number(lineShotMeta.dist ?? Infinity);
      if (
        shotDist < bestShootNowDist ||
        (shotDist === bestShootNowDist && footDist < bestShootNowFootDist) ||
        (shotDist === bestShootNowDist && footDist === bestShootNowFootDist && Number(u.id) < Number(bestShootNow?.id ?? Infinity))
      ) {
        bestShootNow = u;
        bestShootNowDist = shotDist;
        bestShootNowFootDist = footDist;
      }
      continue;
    }

    const desiredHex = findBestCrossbowmanFiringHexIn(simState, attacker, u, timeMs);
    if (!desiredHex) continue;
    const moveDist = hexDistance(attackerPos.q, attackerPos.r, Number(desiredHex.q), Number(desiredHex.r));
    if (
      moveDist < bestRepositionMoveDist ||
      (moveDist === bestRepositionMoveDist && footDist < bestRepositionFootDist) ||
      (moveDist === bestRepositionMoveDist && footDist === bestRepositionFootDist && Number(u.id) < Number(bestReposition?.id ?? Infinity))
    ) {
      bestReposition = u;
      bestRepositionMoveDist = moveDist;
      bestRepositionFootDist = footDist;
    }
  }

  return bestShootNow ?? bestReposition ?? null;
}

function applyDamageToUnitIn(simState, targetId, damageRaw) {
  const target = findUnitByIdIn(simState, targetId);
  if (!target) return { success: false, reason: 'NO_TARGET' };
  if (target.zone !== 'board') return { success: false, reason: 'TARGET_NOT_ON_BOARD' };
  if (target.dead) return { success: false, reason: 'TARGET_DEAD' };

  const damage = Math.max(1, Number(damageRaw ?? 0));
  target.hp = Math.max(0, Number(target.hp ?? 0) - damage);
  const killed = Number(target.hp ?? 0) <= 0;
  if (killed) target.dead = true;
  return {
    success: true,
    damage,
    killed,
    targetHp: Number(target.hp ?? 0),
    targetMaxHp: Number(target.maxHp ?? target.hp ?? 0),
  };
}

function isRangedAttackUnit(unitLike) {
  return String(unitLike?.attackMode ?? DEFAULT_UNIT_ATTACK_MODE).toLowerCase() === 'ranged';
}

function hasCrossbowmanLineShotPassive(unit) {
  return !!unit
    && String(unit.abilityType ?? 'none') === 'passive'
    && String(unit.abilityKey ?? '') === 'crossbowman_line_shot';
}

function areHexesOnSameLine(aq, ar, bq, br) {
  const dr = Number(br) - Number(ar);
  return dr === 0;
}

function getHexLineStep(aq, ar, bq, br) {
  const dq = Number(bq) - Number(aq);
  const dr = Number(br) - Number(ar);
  if (dr === 0 && dq !== 0) return { dq: Math.sign(dq), dr: 0 };
  return null;
}

function getCrossbowmanLineShotMetaIn(simState, attackerLike, targetLike, timeMs, attackerAnchorOverride = null) {
  const attacker = attackerLike ? { ...attackerLike } : null;
  const target = targetLike ?? null;
  if (!attacker || !target) return { hasAlignedLine: false, canShoot: false, dist: Infinity };

  const targetPos = getCombatHexAtIn(simState, target, timeMs);
  if (!targetPos) return { hasAlignedLine: false, canShoot: false, dist: Infinity };

  const attackerQ = attackerAnchorOverride?.q ?? attacker.q;
  const attackerR = attackerAnchorOverride?.r ?? attacker.r;
  const attackerCells = getBoardCellsForUnitAnchor(attacker, attackerQ, attackerR);
  const targetCells = getBoardCellsForUnitAnchor(target, targetPos.q, targetPos.r);
  const attackRangeMax = Math.max(1, Number(attacker.attackRangeMax ?? 1));

  let bestAlignedDist = Infinity;
  let bestAlignedPair = null;
  for (const ac of attackerCells) {
    for (const tc of targetCells) {
      if (!areHexesOnSameLine(ac.q, ac.r, tc.q, tc.r)) continue;
      const d = hexDistance(ac.q, ac.r, tc.q, tc.r);
      if (d < bestAlignedDist) {
        bestAlignedDist = d;
        bestAlignedPair = { attackerCell: ac, targetCell: tc };
      }
    }
  }

  return {
    hasAlignedLine: Number.isFinite(bestAlignedDist),
    canShoot: Number.isFinite(bestAlignedDist) && bestAlignedDist <= attackRangeMax,
    dist: bestAlignedDist,
    ...(bestAlignedPair ?? {}),
  };
}

function getCrossbowmanPierceTargetsIn(simState, attacker, target, timeMs, lineShotMeta = null) {
  const meta = lineShotMeta ?? getCrossbowmanLineShotMetaIn(simState, attacker, target, timeMs);
  if (!meta?.canShoot || !meta?.attackerCell || !meta?.targetCell) return [];

  const step = getHexLineStep(meta.attackerCell.q, meta.attackerCell.r, meta.targetCell.q, meta.targetCell.r);
  if (!step) return [];

  const attackRangeMax = Math.max(1, Number(attacker.attackRangeMax ?? 1));
  const hits = [];
  for (const u of simState.units ?? []) {
    if (!u || u.dead || u.zone !== 'board') continue;
    if (Number(u.id) === Number(attacker.id)) continue;
    if (u.team === attacker.team) continue;

    const cells = getBoardCellsForUnitAnchor(u, Number(u.q), Number(u.r));
    let bestRayDist = Infinity;
    for (const c of cells) {
      const relQ = Number(c.q) - Number(meta.attackerCell.q);
      const relR = Number(c.r) - Number(meta.attackerCell.r);
      let k = null;
      if (step.dq === 0) {
        if (relQ !== 0) continue;
        k = relR / step.dr;
      } else if (step.dr === 0) {
        if (relR !== 0) continue;
        k = relQ / step.dq;
      } else {
        if (relQ !== (k = relQ / step.dq) * step.dq) continue;
        if (relR !== k * step.dr) continue;
      }
      if (!Number.isFinite(k) || k <= 0 || Math.floor(k) !== k) continue;
      const rayDist = Number(k);
      if (rayDist > attackRangeMax) continue;
      if (rayDist < bestRayDist) bestRayDist = rayDist;
    }
    if (Number.isFinite(bestRayDist)) {
      hits.push({ unitId: Number(u.id), dist: bestRayDist });
    }
  }

  hits.sort((a, b) => Number(a.dist) - Number(b.dist) || Number(a.unitId) - Number(b.unitId));
  return hits;
}

function getProjectileExitTravelMsIn(simState, attacker, target, timeMs, lineShotMeta = null) {
  const meta = lineShotMeta ?? getCrossbowmanLineShotMetaIn(simState, attacker, target, timeMs);
  if (!meta?.attackerCell || !meta?.targetCell) return 0;
  const step = getHexLineStep(meta.attackerCell.q, meta.attackerCell.r, meta.targetCell.q, meta.targetCell.r);
  const projectileSpeed = Math.max(0, Number(attacker?.projectileSpeed ?? DEFAULT_UNIT_PROJECTILE_SPEED));
  if (!step || projectileSpeed <= 0) return 0;

  let rayDist = 0;
  let q = Number(meta.attackerCell.q);
  let r = Number(meta.attackerCell.r);
  while (true) {
    q += step.dq;
    r += step.dr;
    rayDist += 1;
    if (!isInsideBoard(q, r)) break;
  }
  return (rayDist / projectileSpeed) * 1000;
}

function getCrossbowmanRayCellsIn(simState, attacker, target, timeMs, lineShotMeta = null) {
  const meta = lineShotMeta ?? getCrossbowmanLineShotMetaIn(simState, attacker, target, timeMs);
  if (!meta?.attackerCell || !meta?.targetCell) return [];
  const step = getHexLineStep(meta.attackerCell.q, meta.attackerCell.r, meta.targetCell.q, meta.targetCell.r);
  if (!step) return [];

  const cells = [];
  let q = Number(meta.attackerCell.q);
  let r = Number(meta.attackerCell.r);
  let dist = 0;
  const attackRangeMax = Math.max(1, Number(attacker.attackRangeMax ?? 1));
  while (dist < attackRangeMax) {
    q += step.dq;
    r += step.dr;
    dist += 1;
    if (!isInsideBoard(q, r)) break;
    cells.push({ q, r, dist });
  }
  return cells;
}

export function performAttackIn(simState, attackerId, targetId, timeMs) {
  const attacker = findUnitByIdIn(simState, attackerId);
  const target = findUnitByIdIn(simState, targetId);
  if (!attacker || !target) return { success: false, reason: 'NO_UNIT' };
  if (attacker.zone !== 'board') return { success: false, reason: 'ATTACKER_NOT_ON_BOARD' };
  if (target.zone !== 'board') return { success: false, reason: 'TARGET_NOT_ON_BOARD' };
  if (attacker.dead) return { success: false, reason: 'ATTACKER_DEAD' };
  if (target.dead) return { success: false, reason: 'TARGET_DEAD' };
  if (attacker.team === target.team) return { success: false, reason: 'SAME_TEAM' };

  const dist = unitDistanceByFootprintAtTime(simState, attacker, target, timeMs);
  if (!Number.isFinite(dist)) return { success: false, reason: 'NO_POSITION' };
  const attackRangeMax = Math.max(1, Number(attacker.attackRangeMax ?? 1));
  const attackRangeFullDamage = Math.max(1, Number(attacker.attackRangeFullDamage ?? attackRangeMax));
  let lineShotMeta = null;
  if (hasCrossbowmanLineShotPassive(attacker)) {
    lineShotMeta = getCrossbowmanLineShotMetaIn(simState, attacker, target, timeMs);
    if (!lineShotMeta.hasAlignedLine) {
      return { success: false, reason: 'OUT_OF_LINE', dist, attackRangeMax };
    }
    if (!lineShotMeta.canShoot) {
      return { success: false, reason: 'OUT_OF_RANGE', dist: lineShotMeta.dist, attackRangeMax };
    }
  } else if (dist > attackRangeMax) {
    return { success: false, reason: 'OUT_OF_RANGE', dist, attackRangeMax };
  }

  const baseDamage = Math.max(0, Number(attacker.atk ?? 0));
  const damageMultiplier = dist > attackRangeFullDamage ? 0.5 : 1;
  const damage = Math.max(1, Math.round(baseDamage * damageMultiplier));
  const accuracy = Math.max(0, Math.min(1, Number(attacker.accuracy ?? DEFAULT_UNIT_ACCURACY)));
  const isHit = Math.random() < accuracy;
  const projectileSpeed = Math.max(0, Number(attacker.projectileSpeed ?? DEFAULT_UNIT_PROJECTILE_SPEED));
  const isRanged = isRangedAttackUnit(attacker);
  const isCrossbowmanShot = hasCrossbowmanLineShotPassive(attacker);
  const actualDist = lineShotMeta?.canShoot ? Number(lineShotMeta.dist) : dist;
  const projectileTravelMs = isCrossbowmanShot
    ? CROSSBOWMAN_IMPACT_DELAY_MS
    : (isRanged && projectileSpeed > 0 ? (actualDist / projectileSpeed) * 1000 : 0);
  const pierceTargets = isCrossbowmanShot
    ? getCrossbowmanPierceTargetsIn(simState, attacker, target, timeMs, lineShotMeta)
    : [];
  const projectileRayCells = isCrossbowmanShot
    ? getCrossbowmanRayCellsIn(simState, attacker, target, timeMs, lineShotMeta)
    : [];
  const projectileTravelMsTotal = isCrossbowmanShot
    ? CROSSBOWMAN_IMPACT_DELAY_MS
    : projectileTravelMs;
  return {
    success: true,
    damage,
    dist: actualDist,
    attackRangeMax,
    attackRangeFullDamage,
    accuracy,
    isHit,
    isRanged,
    projectileSpeed,
    projectileTravelMs,
    projectileTravelMsTotal,
    pierceTargets,
    projectileRayCells,
    projectilePierce: isCrossbowmanShot,
    projectileForceStraight: isCrossbowmanShot,
    projectileTargetQ: Number(lineShotMeta?.targetCell?.q ?? target.q ?? 0),
    projectileTargetR: Number(lineShotMeta?.targetCell?.r ?? target.r ?? 0),
  };
}

function findBounceTargetIn(simState, fromQ, fromR, attackerTeam, excludedIds = []) {
  const enemyTeam = attackerTeam === 'player' ? 'enemy' : 'player';
  const blocked = new Set((excludedIds ?? []).map((x) => Number(x)));
  let best = null;
  let bestDist = Infinity;
  for (const u of simState.units ?? []) {
    if (!u || u.zone !== 'board' || u.dead || u.team !== enemyTeam) continue;
    if (blocked.has(Number(u.id))) continue;
    const targetCells = getBoardCellsForUnitAnchor(u, Number(u.q), Number(u.r));
    let d = Infinity;
    for (const c of targetCells) d = Math.min(d, hexDistance(fromQ, fromR, c.q, c.r));
    if (d > 2) continue;
    if (d < bestDist || (d === bestDist && Number(u.id) < Number(best?.id ?? Infinity))) {
      bestDist = d;
      best = u;
    }
  }
  return best;
}

function hasGhostEvasionPassive(unit) {
  return !!unit
    && String(unit.abilityType ?? 'none') === 'passive'
    && String(unit.abilityKey ?? '') === 'ghost_evasion';
}

function isAttackDodgedByTarget(unit) {
  return hasGhostEvasionPassive(unit) && Math.random() < GHOST_EVASION_DODGE_CHANCE;
}

function hasWormSwallowPassive(unit) {
  return !!unit
    && String(unit.abilityType ?? 'none') === 'passive'
    && String(unit.abilityKey ?? '') === WORM_SWALLOW_ABILITY_KEY;
}

function releaseWormSwallowedVictimIn(simState, wormId, timeMs, { collectTimeline = false, events = [] } = {}) {
  const worm = findUnitByIdIn(simState, wormId);
  if (!worm) return false;
  const victimId = Number(worm.wormSwallowedUnitId ?? NaN);
  if (!Number.isFinite(victimId)) return false;
  const victim = findUnitByIdIn(simState, victimId);
  if (!victim) {
    worm.wormSwallowedUnitId = null;
    worm.wormDigestEndsAt = null;
    return false;
  }
  if (victim.dead || victim.zone !== 'swallowed') {
    worm.wormSwallowedUnitId = null;
    worm.wormDigestEndsAt = null;
    victim.swallowedByUnitId = null;
    victim.swallowedAtHp = null;
    return false;
  }

  const swallowedHp = Math.max(1, Number(victim.swallowedAtHp ?? victim.hp ?? 1));
  const releaseHp = Math.max(1, Math.floor(swallowedHp * 0.5));

  victim.zone = 'board';
  victim.benchSlot = null;
  victim.dead = false;
  victim.hp = Math.min(Math.max(1, releaseHp), Number(victim.maxHp ?? releaseHp));
  victim.q = Number(worm.q ?? victim.q ?? 0);
  victim.r = Number(worm.r ?? victim.r ?? 0);
  victim.nextAttackAt = Math.max(0, Number(victim.nextAttackAt ?? 0));
  victim.nextMoveAt = Math.max(0, Number(victim.nextMoveAt ?? 0));
  victim.nextActionAt = Math.max(0, Number(victim.nextActionAt ?? 0));
  victim.moveStartAt = -1;
  victim.moveEndAt = -1;
  victim.moveFromQ = victim.q;
  victim.moveFromR = victim.r;
  victim.swallowedByUnitId = null;
  victim.swallowedAtHp = null;

  worm.wormSwallowedUnitId = null;
  worm.wormDigestEndsAt = null;

  if (collectTimeline) {
    events.push({
      t: Number(timeMs ?? 0),
      type: 'worm_release',
      wormId: Number(worm.id),
      targetId: Number(victim.id),
      q: Number(victim.q),
      r: Number(victim.r),
      hp: Number(victim.hp ?? 1),
      maxHp: Number(victim.maxHp ?? victim.hp ?? 1),
    });
  }
  return true;
}

function releaseSwallowedVictimsFromDeadWormsIn(simState, timeMs, { collectTimeline = false, events = [] } = {}) {
  let changed = false;
  for (const u of simState?.units ?? []) {
    if (!u || !hasWormSwallowPassive(u)) continue;
    const swallowedId = Number(u.wormSwallowedUnitId ?? NaN);
    if (!Number.isFinite(swallowedId)) continue;
    if (!u.dead && u.zone === 'board') continue;
    changed = releaseWormSwallowedVictimIn(simState, u.id, timeMs, { collectTimeline, events }) || changed;
  }
  return changed;
}

const NEIGHBORS = [
  { dq: 1, dr: 0 },
  { dq: 1, dr: -1 },
  { dq: 0, dr: -1 },
  { dq: -1, dr: 0 },
  { dq: -1, dr: 1 },
  { dq: 0, dr: 1 },
];

function getCrossbowmanStepPriority(unitLike, step) {
  const dq = Number(step?.dq ?? 0);
  const dr = Number(step?.dr ?? 0);
  const isEnemy = String(unitLike?.team ?? '') === 'enemy';

  if (!isEnemy) {
    if (dq === -1 && dr === 1) return 0;  // rear-lower
    if (dq === 0 && dr === -1) return 1;  // rear-upper
    if (dq === 1 && dr === -1) return 2;  // front-upper
    if (dq === 0 && dr === 1) return 3;   // front-lower
    if (dq === -1 && dr === 0) return 4;  // rear
    if (dq === 1 && dr === 0) return 5;   // front
    return 99;
  }

  if (dq === 1 && dr === -1) return 0;    // rear-lower (mirrored for enemy side)
  if (dq === 0 && dr === 1) return 1;     // rear-upper
  if (dq === 0 && dr === -1) return 2;    // front-upper
  if (dq === -1 && dr === 1) return 3;    // front-lower
  if (dq === 1 && dr === 0) return 4;     // rear
  if (dq === -1 && dr === 0) return 5;    // front
  return 99;
}

function getBoardColumnForHex(q, r) {
  return Number(q) + Math.floor(Number(r) / 2);
}

function getCrossbowmanBoardBackPriority(unitLike, q, r) {
  const col = getBoardColumnForHex(q, r);
  const isEnemy = String(unitLike?.team ?? '') === 'enemy';
  return isEnemy ? -col : col;
}

function pickBestStepTowardIn(simState, attacker, target, timeMs) {
  const attackerPos = getCombatHexAtIn(simState, attacker, timeMs);
  const targetPos = getCombatHexAtIn(simState, target, timeMs);
  if (!attackerPos || !targetPos) return null;
  const targetCells = getBoardCellsForUnitAnchor(target, targetPos.q, targetPos.r);
  let best = null;
  let bestDist = Infinity;

  for (const n of NEIGHBORS) {
    const nq = attackerPos.q + n.dq;
    const nr = attackerPos.r + n.dr;
    if (!canPlaceUnitAtBoard(simState, attacker, nq, nr, attacker.id)) continue;
    const attackerCells = getBoardCellsForUnitAnchor(attacker, nq, nr);
    let d = Infinity;
    for (const ac of attackerCells) {
      for (const tc of targetCells) d = Math.min(d, hexDistance(ac.q, ac.r, tc.q, tc.r));
    }
    if (d < bestDist) {
      bestDist = d;
      best = { q: nq, r: nr };
    }
  }
  return best;
}

function findBestCrossbowmanFiringHexIn(simState, attacker, target, timeMs) {
  const attackerPos = getCombatHexAtIn(simState, attacker, timeMs);
  if (!attackerPos) return null;

  let best = null;
  let bestMoveDist = Infinity;
  let bestShotDist = Infinity;
  let bestBackPriority = Infinity;

  for (let row = 0; row < GRID_ROWS; row++) {
    const rowShift = Math.floor(row / 2);
    for (let col = 0; col < GRID_COLS; col++) {
      const q = col - rowShift;
      const r = row;
      if (!canPlaceUnitAtBoard(simState, attacker, q, r, attacker.id)) continue;

      const lineShotMeta = getCrossbowmanLineShotMetaIn(simState, attacker, target, timeMs, { q, r });
      if (!lineShotMeta.canShoot) continue;

      const moveDist = hexDistance(attackerPos.q, attackerPos.r, q, r);
      const shotDist = Number(lineShotMeta.dist ?? Infinity);
      const backPriority = getCrossbowmanBoardBackPriority(attacker, q, r);
      if (
        moveDist < bestMoveDist ||
        (moveDist === bestMoveDist && backPriority < bestBackPriority) ||
        (moveDist === bestMoveDist && backPriority === bestBackPriority && shotDist < bestShotDist) ||
        (moveDist === bestMoveDist && backPriority === bestBackPriority && shotDist === bestShotDist && r < Number(best?.r ?? Infinity)) ||
        (moveDist === bestMoveDist && backPriority === bestBackPriority && shotDist === bestShotDist && r === Number(best?.r ?? Infinity) && q < Number(best?.q ?? Infinity))
      ) {
        bestMoveDist = moveDist;
        bestBackPriority = backPriority;
        bestShotDist = shotDist;
        best = { q, r };
      }
    }
  }

  return best;
}

function pickBestStepTowardCrossbowmanShotIn(simState, attacker, target, timeMs) {
  const attackerPos = getCombatHexAtIn(simState, attacker, timeMs);
  if (!attackerPos) return null;

  const desiredHex = findBestCrossbowmanFiringHexIn(simState, attacker, target, timeMs);
  if (!desiredHex) return pickBestStepTowardIn(simState, attacker, target, timeMs);
  if (desiredHex.q === attackerPos.q && desiredHex.r === attackerPos.r) return null;

  let best = null;
  let bestDist = Infinity;
  let bestPriority = Infinity;
  for (const n of NEIGHBORS) {
    const nq = attackerPos.q + n.dq;
    const nr = attackerPos.r + n.dr;
    if (!canPlaceUnitAtBoard(simState, attacker, nq, nr, attacker.id)) continue;
    const d = hexDistance(nq, nr, desiredHex.q, desiredHex.r);
    const stepPriority = getCrossbowmanStepPriority(attacker, n);
    if (
      d < bestDist ||
      (d === bestDist && stepPriority < bestPriority) ||
      (d === bestDist && stepPriority === bestPriority && nr < Number(best?.r ?? Infinity)) ||
      (d === bestDist && stepPriority === bestPriority && nr === Number(best?.r ?? Infinity) && nq < Number(best?.q ?? Infinity))
    ) {
      bestDist = d;
      bestPriority = stepPriority;
      best = { q: nq, r: nr };
    }
  }
  return best;
}

function pickBestStepAwayFromClosestEnemyIn(simState, unit, timeMs) {
  const mePos = getCombatHexAtIn(simState, unit, timeMs);
  if (!mePos) return null;
  const nearestEnemy = findClosestOpponentIn(simState, unit, timeMs);
  if (!nearestEnemy) return null;
  const enemyPos = getCombatHexAtIn(simState, nearestEnemy, timeMs);
  if (!enemyPos) return null;
  const enemyCells = getBoardCellsForUnitAnchor(nearestEnemy, enemyPos.q, enemyPos.r);

  let best = null;
  let bestDist = -Infinity;
  for (const n of NEIGHBORS) {
    const nq = mePos.q + n.dq;
    const nr = mePos.r + n.dr;
    if (!canPlaceUnitAtBoard(simState, unit, nq, nr, unit.id)) continue;
    const myCells = getBoardCellsForUnitAnchor(unit, nq, nr);
    let d = Infinity;
    for (const mc of myCells) {
      for (const ec of enemyCells) d = Math.min(d, hexDistance(mc.q, mc.r, ec.q, ec.r));
    }
    if (d > bestDist) {
      bestDist = d;
      best = { q: nq, r: nr };
    }
  }
  return best;
}

function findNearestFreeAdjacentHexIn(simState, q, r) {
  let best = null;
  let bestDist = Infinity;
  for (let row = 0; row < GRID_ROWS; row++) {
    const rowShift = Math.floor(row / 2);
    for (let col = 0; col < GRID_COLS; col++) {
      const nq = col - rowShift;
      const nr = row;
      if (!isBoardPlacementInsideForUnit({ cellSpanX: 1 }, nq, nr)) continue;
      if (nq === q && nr === r) continue;
      if (findBlockingUnitAtPlacement(simState, { cellSpanX: 1 }, nq, nr, null)) continue;
      const d = hexDistance(q, r, nq, nr);
      if (d < 1) continue;
      if (d < bestDist || (d === bestDist && (nr < Number(best?.r ?? Infinity) || (nr === Number(best?.r ?? Infinity) && nq < Number(best?.q ?? Infinity))))) {
        bestDist = d;
        best = { q: nq, r: nr };
      }
    }
  }
  return best;
}

function computeResultIn(simState) {
  const hasPlayer = simState.units.some((u) => u.team === 'player' && u.zone === 'board' && !u.dead);
  const hasEnemy = simState.units.some((u) => u.team === 'enemy' && u.zone === 'board' && !u.dead);
  const pKing = simState.kings?.player;
  const eKing = simState.kings?.enemy;
  if (pKing && pKing.hp <= 0) return 'defeat';
  if (eKing && eKing.visible && eKing.hp <= 0) return 'victory';
  if (hasPlayer && !hasEnemy) return 'victory';
  if (!hasPlayer && hasEnemy) return 'defeat';
  if (!hasPlayer && !hasEnemy) return 'draw';
  return null;
}

function sumAliveBoardRanksIn(simState, team) {
  return (simState.units ?? [])
    .filter((u) => u?.zone === 'board' && !u?.dead && u?.team === team)
    .reduce((sum, u) => sum + Math.max(1, Number(u.rank ?? 1)), 0);
}

export function simulateBattleReplayFromState(sourceState, opts = {}) {
  const tickMs = Number(opts.tickMs ?? SNAPSHOT_STEP_MS);
  const maxBattleMs = Number(opts.maxBattleMs ?? (BATTLE_DURATION_SECONDS * 1000));
  const collectTimeline = opts.collectTimeline !== false;
  const collectSnapshots = opts.collectSnapshots !== false;
  const simState = cloneStateForBattleReplay(sourceState);
  const events = [];
  const snapshots = [];
  const pendingDamageEvents = [];
  const pendingSummonEvents = [];
  const pendingDigestEvents = [];
  const projectileHitRegistry = new Map();
  let simNextUnitId = (simState.units ?? []).reduce((mx, u) => Math.max(mx, Number(u?.id ?? 0)), 0) + 1;
  const undertakerSummonBase = UNIT_CATALOG.find((u) => String(u.type ?? '') === UNDERTAKER_SUMMON_TYPE) ?? null;

  let elapsedMs = 0;
  let result = computeResultIn(simState);

  while (!result && elapsedMs < maxBattleMs) {
    const tickTimeMs = elapsedMs;

    if (pendingDamageEvents.length > 0) {
      pendingDamageEvents.sort((a, b) => Number(a?.t ?? 0) - Number(b?.t ?? 0));
      while (pendingDamageEvents.length > 0) {
        const next = pendingDamageEvents[0];
        const dueAt = Number(next?.t ?? Infinity);
        if (!Number.isFinite(dueAt) || dueAt > tickTimeMs + 1e-6) break;
        pendingDamageEvents.shift();

        if (next.missed === true) {
          if (collectTimeline) {
            events.push({
              t: dueAt,
              type: 'miss',
              attackerId: next.attackerId,
              targetId: Number(next.targetId ?? 0),
              attackerTeam: next.attackerTeam,
              attackSeq: Number(next.attackSeq ?? 0),
              missSource: next.damageSource ?? 'attack',
            });
          }
          continue;
        }

        const liveTarget = Number.isFinite(Number(next.targetCellQ)) && Number.isFinite(Number(next.targetCellR))
          ? getUnitAtTimeIn(
            simState,
            Number(next.targetCellQ),
            Number(next.targetCellR),
            dueAt,
            next.attackerTeam === 'player' ? 'enemy' : 'player',
          )
          : findUnitByIdIn(simState, next.targetId);
        if (!liveTarget || liveTarget.dead || liveTarget.zone !== 'board') continue;
        if (next.projectileId != null) {
          const hitSet = projectileHitRegistry.get(next.projectileId) ?? new Set();
          if (hitSet.has(Number(liveTarget.id))) continue;
          hitSet.add(Number(liveTarget.id));
          projectileHitRegistry.set(next.projectileId, hitSet);
        }
        if (isAttackDodgedByTarget(liveTarget)) {
          if (collectTimeline) {
            events.push({
              t: dueAt,
              type: 'miss',
              attackerId: next.attackerId,
              targetId: Number(liveTarget.id),
              attackerTeam: next.attackerTeam,
              attackSeq: Number(next.attackSeq ?? 0),
              missSource: 'ghost_evasion',
            });
          }
          continue;
        }

        const dmgRes = applyDamageToUnitIn(simState, liveTarget.id, next.damage);
        if (!dmgRes.success) continue;

        let chainMeta = null;
        if (next.enableSkeletonArcherBounce === true) {
          const primaryTarget = liveTarget;
          const fromQ = Number(primaryTarget?.q ?? NaN);
          const fromR = Number(primaryTarget?.r ?? NaN);
          const projectileSpeed = Math.max(0, Number(next.projectileSpeed ?? 0));
          if (Number.isFinite(fromQ) && Number.isFinite(fromR) && projectileSpeed > 0) {
            const bounceTarget = findBounceTargetIn(simState, fromQ, fromR, next.attackerTeam, [liveTarget.id]);
            if (bounceTarget) {
              const bounceCells = getBoardCellsForUnitAnchor(bounceTarget, Number(bounceTarget.q), Number(bounceTarget.r));
              let bounceDist = Infinity;
              for (const c of bounceCells) bounceDist = Math.min(bounceDist, hexDistance(fromQ, fromR, c.q, c.r));
              if (!Number.isFinite(bounceDist)) bounceDist = 1;
              const bounceTravelMs = (bounceDist / projectileSpeed) * 1000;
              const bounceDamage = Math.max(1, Math.round(Number(dmgRes.damage ?? 1) * 0.5));
              pendingDamageEvents.push({
                t: dueAt + Math.max(0, Number(bounceTravelMs ?? 0)),
                attackerId: next.attackerId,
                targetId: bounceTarget.id,
                attackerTeam: next.attackerTeam,
                attackSeq: Number(next.attackSeq ?? 0),
                damage: bounceDamage,
                damageSource: 'projectile_bounce',
                projectileSpeed,
                enableSkeletonArcherBounce: false,
              });
              chainMeta = {
                chainFromTargetId: Number(liveTarget.id),
                chainTargetId: Number(bounceTarget.id),
                chainTravelMs: Math.max(0, Number(bounceTravelMs ?? 0)),
              };
            }
          }
        }

        if (collectTimeline) {
          events.push({
            t: dueAt,
            type: 'damage',
            attackerId: next.attackerId,
            targetId: Number(liveTarget.id),
            attackerTeam: next.attackerTeam,
            attackSeq: Number(next.attackSeq ?? 0),
            damage: Number(dmgRes.damage ?? 0),
            targetHp: Number(dmgRes.targetHp ?? 0),
            targetMaxHp: Number(dmgRes.targetMaxHp ?? 0),
            killed: Boolean(dmgRes.killed),
            damageSource: next.damageSource ?? 'attack',
            ...(chainMeta ?? {}),
          });
        }

        if (dmgRes.killed) {
          releaseWormSwallowedVictimIn(simState, liveTarget.id, dueAt, { collectTimeline, events });
        }
      }
    }

    if (pendingSummonEvents.length > 0) {
      pendingSummonEvents.sort((a, b) => Number(a?.t ?? 0) - Number(b?.t ?? 0));
      while (pendingSummonEvents.length > 0) {
        const next = pendingSummonEvents[0];
        const dueAt = Number(next?.t ?? Infinity);
        if (!Number.isFinite(dueAt) || dueAt > tickTimeMs + 1e-6) break;
        pendingSummonEvents.shift();

        const caster = findUnitByIdIn(simState, next.casterId);
        if (!caster || caster.dead || caster.zone !== 'board' || !undertakerSummonBase) continue;
        const casterPos = getCombatHexAtIn(simState, caster, dueAt);
        if (!casterPos) continue;
        const summonHex = findNearestFreeAdjacentHexIn(simState, casterPos.q, casterPos.r);
        if (!summonHex) continue;

        const summonRank = Math.max(1, Math.min(3, Number(caster.rank ?? 1)));
        const summonMult = rankMultiplier(summonRank);
        const summonHp = Math.max(1, Math.round(Number(undertakerSummonBase.hp ?? 1) * summonMult));
        const summonAtk = Math.max(1, Math.round(Number(undertakerSummonBase.atk ?? 1) * summonMult));
        const summoned = {
          id: simNextUnitId++,
          q: summonHex.q,
          r: summonHex.r,
          hp: summonHp,
          maxHp: summonHp,
          atk: summonAtk,
          team: caster.team,
          type: undertakerSummonBase.type,
          powerType: undertakerSummonBase.powerType,
          abilityType: undertakerSummonBase.abilityType ?? 'none',
          abilityKey: undertakerSummonBase.abilityKey ?? null,
          abilityCooldown: undertakerSummonBase.abilityCooldown ?? DEFAULT_UNIT_ABILITY_COOLDOWN,
          rank: summonRank,
          zone: 'board',
          benchSlot: null,
          attackSpeed: undertakerSummonBase.attackSpeed ?? DEFAULT_UNIT_ATTACK_SPEED,
          moveSpeed: undertakerSummonBase.moveSpeed ?? DEFAULT_UNIT_MOVE_SPEED,
          projectileSpeed: undertakerSummonBase.projectileSpeed ?? DEFAULT_UNIT_PROJECTILE_SPEED,
          attackRangeMax: undertakerSummonBase.attackRangeMax ?? 1,
          attackRangeFullDamage: undertakerSummonBase.attackRangeFullDamage ?? (undertakerSummonBase.attackRangeMax ?? 1),
          attackMode: String(undertakerSummonBase.attackMode ?? DEFAULT_UNIT_ATTACK_MODE),
          accuracy: undertakerSummonBase.accuracy ?? DEFAULT_UNIT_ACCURACY,
          cellSpanX: getUnitCellSpanX(undertakerSummonBase),
          dead: false,
          nextAttackAt: 0,
          nextMoveAt: 0,
          nextActionAt: 0,
          nextAbilityAt: Math.max(0, Number(undertakerSummonBase.abilityCooldown ?? 0) * 1000),
          attackSeq: 0,
          moveStartAt: -1,
          moveEndAt: -1,
          moveFromQ: summonHex.q,
          moveFromR: summonHex.r,
        };
        simState.units.push(summoned);

        if (collectTimeline) {
          events.push({
            t: dueAt,
            type: 'spawn',
            unit: {
              id: summoned.id,
              q: summoned.q,
              r: summoned.r,
              hp: summoned.hp,
              maxHp: summoned.maxHp,
              atk: summoned.atk,
              team: summoned.team,
              rank: summoned.rank,
              type: summoned.type,
              powerType: summoned.powerType,
              zone: summoned.zone,
              benchSlot: null,
              attackSpeed: summoned.attackSpeed,
              moveSpeed: summoned.moveSpeed,
              projectileSpeed: summoned.projectileSpeed,
              attackRangeMax: summoned.attackRangeMax,
              attackRangeFullDamage: summoned.attackRangeFullDamage,
              attackMode: String(summoned.attackMode ?? DEFAULT_UNIT_ATTACK_MODE),
              accuracy: summoned.accuracy,
              abilityType: summoned.abilityType,
              abilityKey: summoned.abilityKey,
              abilityCooldown: summoned.abilityCooldown,
              cellSpanX: summoned.cellSpanX,
              dead: false,
              attackSeq: 0,
            },
            sourceId: caster.id,
            sourceAbilityKey: UNDERTAKER_ABILITY_KEY,
          });
        }
      }
    }

    if (pendingDigestEvents.length > 0) {
      pendingDigestEvents.sort((a, b) => Number(a?.t ?? 0) - Number(b?.t ?? 0));
      while (pendingDigestEvents.length > 0) {
        const next = pendingDigestEvents[0];
        const dueAt = Number(next?.t ?? Infinity);
        if (!Number.isFinite(dueAt) || dueAt > tickTimeMs + 1e-6) break;
        pendingDigestEvents.shift();

        const worm = findUnitByIdIn(simState, next.wormId);
        const target = findUnitByIdIn(simState, next.targetId);
        if (!worm || !target || worm.dead || worm.zone !== 'board') continue;
        if (Number(worm.wormSwallowedUnitId ?? NaN) !== Number(target.id)) continue;
        if (target.zone !== 'swallowed' || target.dead) continue;

        target.hp = 0;
        target.dead = true;
        target.zone = 'swallowed';
        target.swallowedByUnitId = null;
        target.swallowedAtHp = null;
        worm.wormSwallowedUnitId = null;
        worm.wormDigestEndsAt = null;

        if (collectTimeline) {
          events.push({
            t: dueAt,
            type: 'worm_digest',
            wormId: Number(worm.id),
            targetId: Number(target.id),
          });
        }
      }
    }

    releaseSwallowedVictimsFromDeadWormsIn(simState, tickTimeMs, { collectTimeline, events });
    result = computeResultIn(simState);
    if (result) break;

    const actors = simState.units
      .filter((u) => u.zone === 'board' && !u.dead && (u.team === 'player' || u.team === 'enemy'))
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id));

    for (const actor of actors) {
      const me = findUnitByIdIn(simState, actor.id);
      if (!me || me.dead || me.zone !== 'board') continue;

      const target = hasCrossbowmanLineShotPassive(me)
        ? findBestCrossbowmanTargetIn(simState, me, tickTimeMs)
        : findClosestOpponentIn(simState, me, tickTimeMs);
      if (!target) continue;

      const attackSpeed = Math.max(0.1, Number(me.attackSpeed ?? DEFAULT_UNIT_ATTACK_SPEED));
      const moveSpeed = Math.max(0.1, Number(me.moveSpeed ?? DEFAULT_UNIT_MOVE_SPEED));
      const digestSpeedMult = hasWormSwallowPassive(me) && Number.isFinite(Number(me.wormSwallowedUnitId ?? NaN)) ? WORM_DIGEST_SPEED_MULT : 1;
      const abilityCooldownSec = Math.max(0, Number(me.abilityCooldown ?? 0));
      const abilityIntervalMs = abilityCooldownSec * 1000;
      const attackIntervalMs = 1000 / Math.max(0.1, attackSpeed * digestSpeedMult);
      const moveIntervalMs = 1000 / Math.max(0.1, moveSpeed * digestSpeedMult);
      me.nextAttackAt = Math.max(0, Number(me.nextAttackAt ?? 0));
      me.nextMoveAt = Math.max(0, Number(me.nextMoveAt ?? 0));
      me.nextActionAt = Math.max(0, Number(me.nextActionAt ?? 0));
      me.nextAbilityAt = Number.isFinite(Number(me.nextAbilityAt))
        ? Math.max(0, Number(me.nextAbilityAt ?? 0))
        : (hasWormSwallowPassive(me) ? 0 : abilityIntervalMs);

      const isUndertakerSummoner =
        String(me.abilityType ?? 'none') === 'active' &&
        String(me.abilityKey ?? '') === UNDERTAKER_ABILITY_KEY;

      let unitActions = 0;
      while (unitActions < MAX_ACTIONS_PER_UNIT_PER_TICK) {
        const liveTarget = hasCrossbowmanLineShotPassive(me)
          ? findBestCrossbowmanTargetIn(simState, me, tickTimeMs)
          : findClosestOpponentIn(simState, me, tickTimeMs);
        if (!liveTarget) break;

        const mePos = getCombatHexAtIn(simState, me, tickTimeMs);
        const targetPos = getCombatHexAtIn(simState, liveTarget, tickTimeMs);
        if (!mePos || !targetPos) break;
        const dist = hexDistance(mePos.q, mePos.r, targetPos.q, targetPos.r);
        const attackRangeMax = Math.max(1, Number(me.attackRangeMax ?? 1));
        const crossbowmanLineShotMeta = hasCrossbowmanLineShotPassive(me)
          ? getCrossbowmanLineShotMetaIn(simState, me, liveTarget, tickTimeMs)
          : null;
        const canAttackTargetNow = isUndertakerSummoner
          ? false
          : (
            dist <= attackRangeMax &&
            (
              !hasCrossbowmanLineShotPassive(me) ||
              crossbowmanLineShotMeta?.canShoot === true
            )
          );

        if (
          isUndertakerSummoner &&
          undertakerSummonBase &&
          abilityIntervalMs > 0 &&
          tickTimeMs + 1e-6 >= me.nextActionAt &&
          tickTimeMs + 1e-6 >= me.nextAbilityAt
        ) {
          const summonHex = findNearestFreeAdjacentHexIn(simState, mePos.q, mePos.r);
          if (summonHex) {
            const castCompleteAt = tickTimeMs + UNDERTAKER_CAST_TIME_MS;
            me.nextAbilityAt = Math.max(me.nextAbilityAt, castCompleteAt) + abilityIntervalMs;
            me.nextActionAt = Math.max(me.nextActionAt, castCompleteAt);
            pendingSummonEvents.push({ t: castCompleteAt, casterId: me.id });
            unitActions += 1;
            if (collectTimeline) {
              events.push({
                t: tickTimeMs,
                type: 'ability_cast',
                casterId: me.id,
                abilityKey: UNDERTAKER_ABILITY_KEY,
                castTimeMs: UNDERTAKER_CAST_TIME_MS,
              });
            }
            continue;
          }
        }

        if (canAttackTargetNow) {
          if (tickTimeMs + 1e-6 < me.nextActionAt || tickTimeMs + 1e-6 < me.nextAttackAt) break;

          const canWormSwallowNow =
            hasWormSwallowPassive(me) &&
            Number.isFinite(Number(liveTarget?.id)) &&
            Number(me.wormSwallowedUnitId ?? NaN) !== Number(liveTarget.id) &&
            !liveTarget.dead &&
            liveTarget.zone === 'board' &&
            tickTimeMs + 1e-6 >= Math.max(0, Number(me.nextAbilityAt ?? 0));

          if (canWormSwallowNow && Math.random() < WORM_SWALLOW_CHANCE) {
            me.nextAttackAt = Math.max(me.nextAttackAt, tickTimeMs) + attackIntervalMs;
            me.attackSeq = Number(me.attackSeq ?? 0) + 1;
            const attackSeq = Number(me.attackSeq ?? 0);
            const digestAt = tickTimeMs + WORM_SWALLOW_DIGEST_MS;
            const swallowedHp = Math.max(1, Number(liveTarget.hp ?? 1));

            liveTarget.zone = 'swallowed';
            liveTarget.benchSlot = null;
            liveTarget.swallowedByUnitId = Number(me.id);
            liveTarget.swallowedAtHp = swallowedHp;
            me.wormSwallowedUnitId = Number(liveTarget.id);
            me.wormDigestEndsAt = digestAt;
            me.nextAbilityAt = digestAt;
            pendingDigestEvents.push({ t: digestAt, wormId: Number(me.id), targetId: Number(liveTarget.id) });
            unitActions += 1;

            if (collectTimeline) {
              events.push({
                t: tickTimeMs,
                type: 'attack',
                attackerId: me.id,
                targetId: liveTarget.id,
                attackerTeam: me.team,
                attackSeq,
                dist: Number(dist),
                attackRangeMax: Number(attackRangeMax),
                attackRangeFullDamage: Number(attackRangeMax),
                isRanged: false,
                projectileSpeed: 0,
                projectileTravelMs: 0,
              });
              events.push({
                t: tickTimeMs,
                type: 'ability_cast',
                casterId: me.id,
                abilityKey: WORM_SWALLOW_ABILITY_KEY,
                castTimeMs: 0,
              });
              events.push({
                t: tickTimeMs,
                type: 'worm_swallow',
                wormId: Number(me.id),
                targetId: Number(liveTarget.id),
                digestMs: WORM_SWALLOW_DIGEST_MS,
                targetHp: swallowedHp,
                targetMaxHp: Number(liveTarget.maxHp ?? swallowedHp),
              });
            }
            break;
          }

          const res = performAttackIn(simState, me.id, liveTarget.id, tickTimeMs);
          me.nextAttackAt = Math.max(me.nextAttackAt, tickTimeMs) + attackIntervalMs;
          unitActions += 1;

          if (res.success) {
            me.attackSeq = Number(me.attackSeq ?? 0) + 1;
            const attackSeq = Number(me.attackSeq ?? 0);
            if (collectTimeline) {
              events.push({
                t: tickTimeMs,
                type: 'attack',
                attackerId: me.id,
                targetId: liveTarget.id,
                attackerTeam: me.team,
                attackSeq,
                dist: Number(res.dist ?? dist),
                attackRangeMax: Number(res.attackRangeMax ?? attackRangeMax),
                attackRangeFullDamage: Number(res.attackRangeFullDamage ?? attackRangeMax),
                isRanged: Boolean(res.isRanged),
                projectileSpeed: Number(res.projectileSpeed ?? 0),
                projectileTravelMs: Number(res.projectileTravelMs ?? 0),
                projectileTravelMsTotal: Number(res.projectileTravelMsTotal ?? res.projectileTravelMs ?? 0),
                projectilePierce: Boolean(res.projectilePierce),
                projectileForceStraight: Boolean(res.projectileForceStraight),
                projectileTargetQ: Number(res.projectileTargetQ ?? liveTarget.q ?? 0),
                projectileTargetR: Number(res.projectileTargetR ?? liveTarget.r ?? 0),
              });
            }

            const hasSkeletonArcherBounce =
              String(me.abilityType ?? 'none') === 'passive' &&
              String(me.abilityKey ?? '') === 'skeleton_archer_bounce';

            if (Boolean(res.isRanged) && Number(res.projectileTravelMs ?? 0) > 0) {
              const pierceTargets = Array.isArray(res.pierceTargets) ? res.pierceTargets : [];
              const projectileRayCells = Array.isArray(res.projectileRayCells) ? res.projectileRayCells : [];
              if (Boolean(res.projectilePierce) && projectileRayCells.length > 0) {
                const projectileId = `${me.id}:${attackSeq}:${tickTimeMs}`;
                for (const cell of projectileRayCells) {
                  const hitDist = Math.max(0, Number(cell?.dist ?? res.dist ?? 0));
                  const hitTravelMs = hasCrossbowmanLineShotPassive(me)
                    ? CROSSBOWMAN_IMPACT_DELAY_MS
                    : (
                      Number(res.projectileSpeed ?? 0) > 0
                        ? (hitDist / Math.max(0.0001, Number(res.projectileSpeed ?? 0))) * 1000
                        : Number(res.projectileTravelMs ?? 0)
                    );
                  const hitDamageMultiplier = hitDist > Number(res.attackRangeFullDamage ?? attackRangeMax) ? 0.5 : 1;
                  pendingDamageEvents.push({
                    t: tickTimeMs + hitTravelMs,
                    attackerId: me.id,
                    targetId: liveTarget.id,
                    attackerTeam: me.team,
                    attackSeq,
                    projectileId,
                    targetCellQ: Number(cell.q),
                    targetCellR: Number(cell.r),
                    damage: Math.max(1, Math.round(Number(me.atk ?? 0) * hitDamageMultiplier)),
                    damageSource: 'projectile_pierce',
                    projectileSpeed: Number(res.projectileSpeed ?? 0),
                    missed: res.isHit !== true,
                    enableSkeletonArcherBounce: false,
                  });
                }
              } else {
                pendingDamageEvents.push({
                  t: tickTimeMs + Number(res.projectileTravelMs ?? 0),
                  attackerId: me.id,
                  targetId: liveTarget.id,
                  attackerTeam: me.team,
                  attackSeq,
                  damage: Number(res.damage ?? 1),
                  damageSource: 'projectile',
                  projectileSpeed: Number(res.projectileSpeed ?? 0),
                  missed: res.isHit !== true,
                  enableSkeletonArcherBounce: hasSkeletonArcherBounce,
                });
              }
            } else if (res.isHit !== true) {
              if (collectTimeline) {
                events.push({
                  t: tickTimeMs,
                  type: 'miss',
                  attackerId: me.id,
                  targetId: liveTarget.id,
                  attackerTeam: me.team,
                  attackSeq,
                  missSource: 'attack',
                });
              }
            } else if (isAttackDodgedByTarget(liveTarget)) {
              if (collectTimeline) {
                events.push({
                  t: tickTimeMs,
                  type: 'miss',
                  attackerId: me.id,
                  targetId: liveTarget.id,
                  attackerTeam: me.team,
                  attackSeq,
                  missSource: 'ghost_evasion',
                });
              }
            } else {
              const dmgRes = applyDamageToUnitIn(simState, liveTarget.id, res.damage);
              if (dmgRes.success && collectTimeline) {
                events.push({
                  t: tickTimeMs,
                  type: 'damage',
                  attackerId: me.id,
                  targetId: liveTarget.id,
                  attackerTeam: me.team,
                  attackSeq,
                  damage: Number(dmgRes.damage ?? 0),
                  targetHp: Number(dmgRes.targetHp ?? 0),
                  targetMaxHp: Number(dmgRes.targetMaxHp ?? 0),
                  killed: Boolean(dmgRes.killed),
                  damageSource: 'attack',
                });
              }
              if (dmgRes.success && dmgRes.killed) {
                releaseWormSwallowedVictimIn(simState, liveTarget.id, tickTimeMs, { collectTimeline, events });
              }
            }
          }
          break;
        }

        if (tickTimeMs + 1e-6 < me.nextActionAt || tickTimeMs + 1e-6 < me.nextAttackAt || tickTimeMs + 1e-6 < me.nextMoveAt) break;

        const step = isUndertakerSummoner
          ? pickBestStepAwayFromClosestEnemyIn(simState, me, tickTimeMs)
          : (
            hasCrossbowmanLineShotPassive(me)
              ? pickBestStepTowardCrossbowmanShotIn(simState, me, liveTarget, tickTimeMs)
              : pickBestStepTowardIn(simState, me, liveTarget, tickTimeMs)
          );
        if (!step) break;

        const from = { q: me.q, r: me.r };
        const moved = moveUnit(simState, me.id, step.q, step.r);
        const moveReadyAt = Math.max(me.nextMoveAt, tickTimeMs) + moveIntervalMs;
        me.nextMoveAt = moveReadyAt;
        me.nextActionAt = Math.max(me.nextActionAt, moveReadyAt);
        me.moveFromQ = from.q;
        me.moveFromR = from.r;
        me.moveStartAt = tickTimeMs;
        me.moveEndAt = moveReadyAt;
        unitActions += 1;
        if (!moved) break;

        if (collectTimeline) {
          events.push({
            tStart: tickTimeMs,
            t: tickTimeMs + moveIntervalMs,
            durationMs: moveIntervalMs,
            type: 'move',
            unitId: me.id,
            team: me.team,
            fromQ: from.q,
            fromR: from.r,
            q: step.q,
            r: step.r,
          });
        }
      }

      releaseSwallowedVictimsFromDeadWormsIn(simState, tickTimeMs, { collectTimeline, events });
      result = computeResultIn(simState);
      if (result) break;
    }

    releaseSwallowedVictimsFromDeadWormsIn(simState, tickTimeMs, { collectTimeline, events });
    result = computeResultIn(simState);
    if (result) break;

    if (collectSnapshots) {
      snapshots.push({
        t: tickTimeMs,
        units: (simState.units ?? []).map((u) => ({
          id: u.id,
          q: u.q,
          r: u.r,
          zone: u.zone,
          team: u.team,
          type: u.type,
          hp: u.hp,
          maxHp: u.maxHp,
          dead: Boolean(u.dead),
          attackSeq: Number(u.attackSeq ?? 0),
        })),
      });
    }

    elapsedMs += tickMs;
  }

  if (!result) result = 'draw';
  const survivorRankSum = {
    player: sumAliveBoardRanksIn(simState, 'player'),
    enemy: sumAliveBoardRanksIn(simState, 'enemy'),
  };

  return {
    version: 1,
    mode: 'server-sim',
    tickMs,
    maxBattleMs,
    durationMs: Math.min(maxBattleMs, Math.max(elapsedMs, 0, ...events.map((e) => Number(e?.t ?? 0)))),
    result,
    survivorRankSum,
    winnerDamageByResult: {
      victory: survivorRankSum.player,
      defeat: survivorRankSum.enemy,
      draw: 0,
    },
    events: collectTimeline ? events : [],
    snapshots: collectSnapshots ? snapshots : [],
  };
}

export function sanitizeUnitForBattleStart(unit) {
  if (!unit) return;
  unit.nextAttackAt = 0;
  unit.nextMoveAt = 0;
  unit.nextActionAt = 0;
  unit.nextAbilityAt = hasWormSwallowPassive(unit)
    ? 0
    : Math.max(0, Number(unit.abilityCooldown ?? 0) * 1000);
  unit.attackSeq = 0;
  unit.moveStartAt = -1;
  unit.moveEndAt = -1;
  unit.moveFromQ = unit.q;
  unit.moveFromR = unit.r;
  unit.wormSwallowedUnitId = null;
  unit.wormDigestEndsAt = null;
  unit.swallowedByUnitId = null;
  unit.swallowedAtHp = null;
}

export function createSimState(units = [], kings = null) {
  const simState = createBattleState();
  simState.phase = 'battle';
  simState.result = null;
  simState.units = units.map((u) => ({ ...u }));
  if (kings) {
    simState.kings = {
      player: { ...(kings.player ?? simState.kings.player) },
      enemy: { ...(kings.enemy ?? simState.kings.enemy) },
    };
  } else {
    simState.kings.enemy.visible = true;
  }
  return simState;
}
