import {
  createBattleState,
  getUnitAt,
  moveUnit,
  hexDistance,
  getUnitCellSpanX,
  getOccupiedCellsFromAnchor,
} from '../shared/battleCore.js';
import { UNIT_CATALOG } from '../shared/unitCatalog.js';
import { getPreparedAttackConfig } from '../shared/preparedAttackConfig.js';
import { STEP_MOVE_TRAVEL_MS, getStepMoveTimings } from '../shared/stepMovementConfig.js';
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
const SIREN_ILLUSION_DODGE_CHANCE = 0.3;
const UNDERTAKER_SUMMON_TYPE = 'SimpleSkeleton';
const UNDERTAKER_ABILITY_KEY = 'undertaker_active';
const UNDERTAKER_CAST_TIME_MS = 1000;
const SIREN_MIRROR_ABILITY_KEY = 'siren_mirror_image';
const SIREN_MIRROR_CAST_TIME_MS = 1000;
const SIREN_MIRROR_CLONE_STAT_MULT = 0.3;
const KNIGHT_CHARGE_ABILITY_KEY = 'knight_charge';
const KNIGHT_CHARGE_CAST_TIME_MS = 1000;
const KNIGHT_CHARGE_SPEED_MULT = 2;
const WORM_SWALLOW_ABILITY_KEY = 'worm_swallow';
const SWORDSMAN_COUNTER_ABILITY_KEY = 'swordsman_counter';
const SWORDSMAN_COUNTER_TRIGGER_CHANCE = 1.0;
const SWORDSMAN_COUNTER_WINDOW_MS = 500;
const SWORDSMAN_COUNTER_SKILL_MS = 300;
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

function findFarthestOpponentIn(simState, attacker, timeMs) {
  if (!attacker || attacker.dead) return null;
  const opponentTeam = attacker.team === 'player' ? 'enemy' : 'player';
  if (!getCombatHexAtIn(simState, attacker, timeMs)) return null;

  let best = null;
  let bestDist = -Infinity;
  for (const u of simState.units) {
    if (u.zone !== 'board' || u.dead || u.team !== opponentTeam) continue;
    const d = unitDistanceByFootprintAtTime(simState, attacker, u, timeMs);
    if (d > bestDist) {
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

function hasKnightChargeAbility(unit) {
  return !!unit
    && String(unit.abilityType ?? 'none') === 'active'
    && String(unit.abilityKey ?? '') === KNIGHT_CHARGE_ABILITY_KEY;
}

function hasSirenMirrorAbility(unit) {
  return !!unit
    && String(unit.abilityType ?? 'none') === 'active'
    && String(unit.abilityKey ?? '') === SIREN_MIRROR_ABILITY_KEY;
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
  const preparedAttackCfg = !isRanged ? getPreparedAttackConfig(attacker.type) : null;
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
    preparedAttackIntervalMs: Number(preparedAttackCfg?.attackIntervalMs ?? 0),
    preparedAttackHitDelayMs: Number(preparedAttackCfg?.hitDelayMs ?? 0),
    preparedAttackHoldMs: Number(preparedAttackCfg?.attackHoldMs ?? 0),
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

function hasSirenIllusionDodge(unit) {
  return !!unit
    && Boolean(unit.isIllusion)
    && String(unit.type ?? '') === 'NagaSiren';
}

function getAttackDodgeChance(unit) {
  if (hasGhostEvasionPassive(unit)) return GHOST_EVASION_DODGE_CHANCE;
  if (hasSirenIllusionDodge(unit)) return SIREN_ILLUSION_DODGE_CHANCE;
  return 0;
}

function isAttackDodgedByTarget(unit) {
  const chance = Math.max(0, Math.min(1, Number(getAttackDodgeChance(unit) ?? 0)));
  return chance > 0 && Math.random() < chance;
}

function hasWormSwallowPassive(unit) {
  return !!unit
    && String(unit.abilityType ?? 'none') === 'passive'
    && String(unit.abilityKey ?? '') === WORM_SWALLOW_ABILITY_KEY;
}

function hasSwordsmanCounterPassive(unit) {
  return !!unit
    && String(unit.abilityType ?? 'none') === 'passive'
    && String(unit.abilityKey ?? '') === SWORDSMAN_COUNTER_ABILITY_KEY;
}

function getPreparedAttackIdleAttack2At(unit) {
  return Math.max(0, Number(unit?.preparedAttackIdleAttack2At ?? 0));
}

function tryTriggerSwordsmanCounterIn(simState, defender, incomingEvent, timeMs, { collectTimeline = false, events = [], pendingCounterEvents = null } = {}) {
  if (!hasSwordsmanCounterPassive(defender)) return false;
  if (!defender || defender.dead || defender.zone !== 'board') return false;
  const incomingDamageSource = String(incomingEvent?.damageSource ?? '');
  if (incomingDamageSource === SWORDSMAN_COUNTER_ABILITY_KEY) return false;
  if (incomingDamageSource !== 'attack') return false;

  const attacker = findUnitByIdIn(simState, incomingEvent?.attackerId);
  if (!attacker || attacker.dead || attacker.zone !== 'board') return false;
  if (String(attacker.team ?? '') === String(defender.team ?? '')) return false;
  if (Math.random() >= SWORDSMAN_COUNTER_TRIGGER_CHANCE) return false;
  if (!Array.isArray(pendingCounterEvents)) return false;
  const counterWindowMs = Math.max(0, Number(SWORDSMAN_COUNTER_WINDOW_MS ?? 0));
  const dueAt = Math.max(
    Number(timeMs ?? 0),
    Number(defender.nextActionAt ?? 0),
    getPreparedAttackIdleAttack2At(defender),
  );
  defender.nextActionAt = Math.max(
    Number(defender.nextActionAt ?? 0),
    dueAt + counterWindowMs,
  );
  pendingCounterEvents.push({
    t: dueAt,
    casterId: Number(defender.id),
    targetId: Number(attacker.id),
    casterTeam: defender.team,
    damage: Math.max(1, Math.round(Number(defender.atk ?? 1))),
    windowMs: counterWindowMs,
    displayMs: Math.max(0, Number(SWORDSMAN_COUNTER_SKILL_MS ?? 0)),
  });
  return true;
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

function findSirenMirrorSpawnHexesIn(simState, q, r) {
  const found = [];
  const used = new Set([`${q},${r}`]);
  const preferredDirs = [
    { dq: 0, dr: -1 },
    { dq: 0, dr: 1 },
  ];

  for (const dir of preferredDirs) {
    let dist = 1;
    while (dist <= Math.max(GRID_COLS, GRID_ROWS)) {
      const nq = Number(q) + dir.dq * dist;
      const nr = Number(r) + dir.dr * dist;
      if (!isBoardPlacementInsideForUnit({ cellSpanX: 1 }, nq, nr)) break;
      const key = `${nq},${nr}`;
      if (!used.has(key) && !findBlockingUnitAtPlacement(simState, { cellSpanX: 1 }, nq, nr, null)) {
        found.push({ q: nq, r: nr });
        used.add(key);
        break;
      }
      dist += 1;
    }
  }

  if (found.length >= 2) return found.slice(0, 2);

  const fallback = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    const rowShift = Math.floor(row / 2);
    for (let col = 0; col < GRID_COLS; col++) {
      const nq = col - rowShift;
      const nr = row;
      const key = `${nq},${nr}`;
      if (used.has(key)) continue;
      if (!isBoardPlacementInsideForUnit({ cellSpanX: 1 }, nq, nr)) continue;
      if (findBlockingUnitAtPlacement(simState, { cellSpanX: 1 }, nq, nr, null)) continue;
      fallback.push({
        q: nq,
        r: nr,
        dist: hexDistance(q, r, nq, nr),
        verticalBias: Math.abs(Number(nr) - Number(r)),
      });
    }
  }

  fallback.sort((a, b) => (
    Number(a.dist) - Number(b.dist)
    || Number(a.verticalBias) - Number(b.verticalBias)
    || Number(a.r) - Number(b.r)
    || Number(a.q) - Number(b.q)
  ));

  for (const cell of fallback) {
    if (found.length >= 2) break;
    found.push({ q: cell.q, r: cell.r });
  }

  return found.slice(0, 2);
}

function getBoardForwardPriority(unitLike, q, r) {
  const col = getBoardColumnForHex(q, r);
  const isEnemy = String(unitLike?.team ?? '') === 'enemy';
  return isEnemy ? -col : col;
}

function findKnightChargeDestinationIn(simState, attacker, target, timeMs) {
  const attackerPos = getCombatHexAtIn(simState, attacker, timeMs);
  const targetPos = getCombatHexAtIn(simState, target, timeMs);
  if (!attackerPos || !targetPos) return null;

  const targetCells = getBoardCellsForUnitAnchor(target, targetPos.q, targetPos.r);
  let best = null;
  let bestForwardPriority = -Infinity;
  let bestMoveDist = -Infinity;

  for (let row = 0; row < GRID_ROWS; row++) {
    const rowShift = Math.floor(row / 2);
    for (let col = 0; col < GRID_COLS; col++) {
      const q = col - rowShift;
      const r = row;
      if (!canPlaceUnitAtBoard(simState, attacker, q, r, attacker.id)) continue;

      const myCells = getBoardCellsForUnitAnchor(attacker, q, r);
      let minDist = Infinity;
      for (const mc of myCells) {
        for (const tc of targetCells) minDist = Math.min(minDist, hexDistance(mc.q, mc.r, tc.q, tc.r));
      }
      if (minDist !== 1) continue;

      const forwardPriority = getBoardForwardPriority(attacker, q, r);
      const moveDist = hexDistance(attackerPos.q, attackerPos.r, q, r);
      if (
        forwardPriority > bestForwardPriority ||
        (forwardPriority === bestForwardPriority && moveDist > bestMoveDist) ||
        (forwardPriority === bestForwardPriority && moveDist === bestMoveDist && r < Number(best?.r ?? Infinity)) ||
        (forwardPriority === bestForwardPriority && moveDist === bestMoveDist && r === Number(best?.r ?? Infinity) && q < Number(best?.q ?? Infinity))
      ) {
        bestForwardPriority = forwardPriority;
        bestMoveDist = moveDist;
        best = { q, r };
      }
    }
  }

  return best;
}

function findShortestPathIgnoringUnitsIn(simState, unitLike, startQ, startR, endQ, endR) {
  if (Number(startQ) === Number(endQ) && Number(startR) === Number(endR)) {
    return [{ q: Number(startQ), r: Number(startR) }];
  }

  const startKey = `${startQ},${startR}`;
  const endKey = `${endQ},${endR}`;
  const queue = [{ q: Number(startQ), r: Number(startR) }];
  const prev = new Map([[startKey, null]]);

  while (queue.length > 0) {
    const cur = queue.shift();
    const curKey = `${cur.q},${cur.r}`;
    if (curKey === endKey) break;

    for (const n of NEIGHBORS) {
      const nq = Number(cur.q) + Number(n.dq);
      const nr = Number(cur.r) + Number(n.dr);
      if (!isBoardPlacementInsideForUnit(unitLike, nq, nr)) continue;
      const nextKey = `${nq},${nr}`;
      if (prev.has(nextKey)) continue;
      prev.set(nextKey, curKey);
      queue.push({ q: nq, r: nr });
    }
  }

  if (!prev.has(endKey)) return null;

  const path = [];
  let key = endKey;
  while (key != null) {
    const [qStr, rStr] = String(key).split(',');
    path.push({ q: Number(qStr), r: Number(rStr) });
    key = prev.get(key) ?? null;
  }
  path.reverse();
  return path;
}

function getKnightChargeDamageCellsForAnchor(unitLike, q, r) {
  const out = [];
  const seen = new Set();
  const baseCells = getBoardCellsForUnitAnchor(unitLike, q, r);
  for (const c of baseCells) {
    const candidates = [
      { q: Number(c.q), r: Number(c.r) },
      { q: Number(c.q), r: Number(c.r) - 1 },
      { q: Number(c.q), r: Number(c.r) + 1 },
    ];
    for (const cell of candidates) {
      if (!isInsideBoard(cell.q, cell.r)) continue;
      const key = `${cell.q},${cell.r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cell);
    }
  }
  return out;
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
  const pendingCounterEvents = [];
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

        if (!Boolean(dmgRes.killed)) {
          tryTriggerSwordsmanCounterIn(simState, liveTarget, next, dueAt, { collectTimeline, events, pendingCounterEvents });
        }

        if (dmgRes.killed) {
          releaseWormSwallowedVictimIn(simState, liveTarget.id, dueAt, { collectTimeline, events });
        }
      }
    }

    if (pendingCounterEvents.length > 0) {
      pendingCounterEvents.sort((a, b) => Number(a?.t ?? 0) - Number(b?.t ?? 0));
      while (pendingCounterEvents.length > 0) {
        const next = pendingCounterEvents[0];
        const dueAt = Number(next?.t ?? Infinity);
        if (!Number.isFinite(dueAt) || dueAt > tickTimeMs + 1e-6) break;
        pendingCounterEvents.shift();

        const caster = findUnitByIdIn(simState, next.casterId);
        const target = findUnitByIdIn(simState, next.targetId);
        if (!caster || caster.dead || caster.zone !== 'board') continue;
        if (!target || target.dead || target.zone !== 'board') continue;
        if (String(caster.team ?? '') === String(target.team ?? '')) continue;
        const counterWindowMs = Math.max(0, Number(next.windowMs ?? SWORDSMAN_COUNTER_WINDOW_MS));
        caster.nextActionAt = Math.max(
          Number(caster.nextActionAt ?? 0),
          dueAt + counterWindowMs,
        );

        caster.attackSeq = Number(caster.attackSeq ?? 0) + 1;
        const attackSeq = Number(caster.attackSeq ?? 0);

        if (collectTimeline) {
          events.push({
            t: dueAt,
            type: 'ability_cast',
            casterId: Number(caster.id),
            targetId: Number(target.id),
            abilityKey: SWORDSMAN_COUNTER_ABILITY_KEY,
            castTimeMs: 0,
            windowMs: counterWindowMs,
            displayMs: Math.max(0, Number(next.displayMs ?? SWORDSMAN_COUNTER_SKILL_MS)),
          });
        }

        const counterAccuracy = Math.max(0, Math.min(1, Number(caster.accuracy ?? DEFAULT_UNIT_ACCURACY)));
        const counterIsHit = Math.random() < counterAccuracy;
        if (!counterIsHit) {
          if (collectTimeline) {
            events.push({
              t: dueAt,
              type: 'miss',
              attackerId: Number(caster.id),
              targetId: Number(target.id),
              attackerTeam: caster.team,
              attackSeq,
              missSource: SWORDSMAN_COUNTER_ABILITY_KEY,
              skipPreparedAttackVisual: true,
            });
          }
          continue;
        }
        if (isAttackDodgedByTarget(target)) {
          if (collectTimeline) {
            events.push({
              t: dueAt,
              type: 'miss',
              attackerId: Number(caster.id),
              targetId: Number(target.id),
              attackerTeam: caster.team,
              attackSeq,
              missSource: 'ghost_evasion',
              skipPreparedAttackVisual: true,
            });
          }
          continue;
        }

        const counterDmgRes = applyDamageToUnitIn(simState, target.id, next.damage);
        if (!counterDmgRes.success) continue;

        if (collectTimeline) {
          events.push({
            t: dueAt,
            type: 'damage',
            attackerId: Number(caster.id),
            targetId: Number(target.id),
            attackerTeam: caster.team,
            attackSeq,
            damage: Number(counterDmgRes.damage ?? 0),
            targetHp: Number(counterDmgRes.targetHp ?? 0),
            targetMaxHp: Number(counterDmgRes.targetMaxHp ?? 0),
            killed: Boolean(counterDmgRes.killed),
            damageSource: SWORDSMAN_COUNTER_ABILITY_KEY,
            skipPreparedAttackVisual: true,
          });
        }

        if (counterDmgRes.killed) {
          releaseWormSwallowedVictimIn(simState, target.id, dueAt, { collectTimeline, events });
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
        if (!caster || caster.dead || caster.zone !== 'board') continue;
        const casterPos = getCombatHexAtIn(simState, caster, dueAt);
        if (!casterPos) continue;
        let summonUnits = [];
        if (String(next?.abilityKey ?? '') === UNDERTAKER_ABILITY_KEY) {
          if (!undertakerSummonBase) continue;
          const summonHex = findNearestFreeAdjacentHexIn(simState, casterPos.q, casterPos.r);
          if (!summonHex) continue;

          const summonRank = Math.max(1, Math.min(3, Number(caster.rank ?? 1)));
          const summonMult = rankMultiplier(summonRank);
          const summonHp = Math.max(1, Math.round(Number(undertakerSummonBase.hp ?? 1) * summonMult));
          const summonAtk = Math.max(1, Math.round(Number(undertakerSummonBase.atk ?? 1) * summonMult));
          summonUnits = [{
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
          }];
        } else if (String(next?.abilityKey ?? '') === SIREN_MIRROR_ABILITY_KEY) {
          const summonHexes = findSirenMirrorSpawnHexesIn(simState, casterPos.q, casterPos.r);
          if (summonHexes.length < 2) continue;
          summonUnits = summonHexes.map((hex) => {
            const summonHp = Math.max(1, Math.round(Number(caster.maxHp ?? caster.hp ?? 1) * SIREN_MIRROR_CLONE_STAT_MULT));
            const summonAtk = Math.max(1, Math.round(Number(caster.atk ?? 1) * SIREN_MIRROR_CLONE_STAT_MULT));
            return {
              id: simNextUnitId++,
              q: hex.q,
              r: hex.r,
              isIllusion: true,
              hp: summonHp,
              maxHp: summonHp,
              atk: summonAtk,
              team: caster.team,
              type: caster.type,
              powerType: caster.powerType,
              abilityType: 'none',
              abilityKey: null,
              abilityCooldown: 0,
              rank: Math.max(1, Math.min(3, Number(caster.rank ?? 1))),
              zone: 'board',
              benchSlot: null,
              attackSpeed: caster.attackSpeed ?? DEFAULT_UNIT_ATTACK_SPEED,
              moveSpeed: caster.moveSpeed ?? DEFAULT_UNIT_MOVE_SPEED,
              projectileSpeed: caster.projectileSpeed ?? DEFAULT_UNIT_PROJECTILE_SPEED,
              attackRangeMax: caster.attackRangeMax ?? 1,
              attackRangeFullDamage: caster.attackRangeFullDamage ?? (caster.attackRangeMax ?? 1),
              attackMode: String(caster.attackMode ?? DEFAULT_UNIT_ATTACK_MODE),
              accuracy: caster.accuracy ?? DEFAULT_UNIT_ACCURACY,
              cellSpanX: getUnitCellSpanX(caster),
              dead: false,
              nextAttackAt: 0,
              nextMoveAt: 0,
              nextActionAt: 0,
              nextAbilityAt: 0,
              attackSeq: 0,
              moveStartAt: -1,
              moveEndAt: -1,
              moveFromQ: hex.q,
              moveFromR: hex.r,
            };
          });
        }

        for (const summoned of summonUnits) {
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
                isIllusion: Boolean(summoned.isIllusion),
                dead: false,
                attackSeq: 0,
              },
              sourceId: caster.id,
              sourceAbilityKey: String(next?.abilityKey ?? UNDERTAKER_ABILITY_KEY),
            });
          }
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
      const moveTimings = getStepMoveTimings(moveSpeed, digestSpeedMult);
      const moveTravelMs = Number(moveTimings.travelMs ?? STEP_MOVE_TRAVEL_MS);
      const moveWaitMs = Number(moveTimings.waitMs ?? 0);
      me.nextAttackAt = Math.max(0, Number(me.nextAttackAt ?? 0));
      me.nextMoveAt = Math.max(0, Number(me.nextMoveAt ?? 0));
      me.nextActionAt = Math.max(0, Number(me.nextActionAt ?? 0));
      me.nextAbilityAt = Number.isFinite(Number(me.nextAbilityAt))
        ? Math.max(0, Number(me.nextAbilityAt ?? 0))
        : ((hasWormSwallowPassive(me) || hasSirenMirrorAbility(me)) ? 0 : abilityIntervalMs);

      const isUndertakerSummoner =
        String(me.abilityType ?? 'none') === 'active' &&
        String(me.abilityKey ?? '') === UNDERTAKER_ABILITY_KEY;
      const isSirenMirrorCaster = hasSirenMirrorAbility(me);
      const isKnightCharger = hasKnightChargeAbility(me);

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
            pendingSummonEvents.push({ t: castCompleteAt, casterId: me.id, abilityKey: UNDERTAKER_ABILITY_KEY });
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

        if (
          isSirenMirrorCaster &&
          abilityIntervalMs > 0 &&
          tickTimeMs + 1e-6 >= me.nextActionAt &&
          tickTimeMs + 1e-6 >= me.nextAbilityAt
        ) {
          const summonHexes = findSirenMirrorSpawnHexesIn(simState, mePos.q, mePos.r);
          if (summonHexes.length >= 2) {
            const castCompleteAt = tickTimeMs + SIREN_MIRROR_CAST_TIME_MS;
            me.nextAbilityAt = Math.max(me.nextAbilityAt, castCompleteAt) + abilityIntervalMs;
            me.nextActionAt = Math.max(me.nextActionAt, castCompleteAt);
            pendingSummonEvents.push({ t: castCompleteAt, casterId: me.id, abilityKey: SIREN_MIRROR_ABILITY_KEY });
            unitActions += 1;
            if (collectTimeline) {
              events.push({
                t: tickTimeMs,
                type: 'ability_cast',
                casterId: me.id,
                abilityKey: SIREN_MIRROR_ABILITY_KEY,
                castTimeMs: SIREN_MIRROR_CAST_TIME_MS,
              });
            }
            continue;
          }
        }

        if (
          isKnightCharger &&
          abilityIntervalMs > 0 &&
          tickTimeMs + 1e-6 >= me.nextActionAt &&
          tickTimeMs + 1e-6 >= me.nextAbilityAt
        ) {
          const chargeTarget = findFarthestOpponentIn(simState, me, tickTimeMs);
          const chargeDestination = chargeTarget
            ? findKnightChargeDestinationIn(simState, me, chargeTarget, tickTimeMs)
            : null;
          const chargePath = chargeDestination
            ? findShortestPathIgnoringUnitsIn(simState, me, mePos.q, mePos.r, chargeDestination.q, chargeDestination.r)
            : null;

          if (chargeTarget && chargeDestination && Array.isArray(chargePath) && chargePath.length > 1) {
            const castCompleteAt = tickTimeMs + KNIGHT_CHARGE_CAST_TIME_MS;
            const chargeStepMs = 1000 / Math.max(0.1, moveSpeed * KNIGHT_CHARGE_SPEED_MULT);
            const chargeDurationMs = (chargePath.length - 1) * chargeStepMs;
            const chargeCompleteAt = castCompleteAt + chargeDurationMs;
            const from = { q: me.q, r: me.r };
            const moved = moveUnit(simState, me.id, chargeDestination.q, chargeDestination.r);

            if (moved) {
              me.nextAbilityAt = Math.max(me.nextAbilityAt, chargeCompleteAt) + abilityIntervalMs;
              me.nextAttackAt = Math.max(me.nextAttackAt, chargeCompleteAt);
              me.nextMoveAt = Math.max(me.nextMoveAt, chargeCompleteAt);
              me.nextActionAt = Math.max(me.nextActionAt, chargeCompleteAt);
              me.moveFromQ = from.q;
              me.moveFromR = from.r;
              me.moveStartAt = castCompleteAt;
              me.moveEndAt = chargeCompleteAt;
              unitActions += 1;

              if (collectTimeline) {
                events.push({
                  t: tickTimeMs,
                  type: 'ability_cast',
                  casterId: me.id,
                  abilityKey: KNIGHT_CHARGE_ABILITY_KEY,
                  castTimeMs: KNIGHT_CHARGE_CAST_TIME_MS,
                });
                events.push({
                  tStart: castCompleteAt,
                  t: chargeCompleteAt,
                  durationMs: chargeDurationMs,
                  type: 'move',
                  abilityKey: KNIGHT_CHARGE_ABILITY_KEY,
                  unitId: me.id,
                  team: me.team,
                  fromQ: from.q,
                  fromR: from.r,
                  q: chargeDestination.q,
                  r: chargeDestination.r,
                });
              }

              const projectileId = `knight_charge:${me.id}:${tickTimeMs}`;
              for (let idx = 1; idx < chargePath.length; idx++) {
                const stepAnchor = chargePath[idx];
                const dueAt = castCompleteAt + chargeStepMs * idx;
                const damageCells = getKnightChargeDamageCellsForAnchor(me, stepAnchor.q, stepAnchor.r);
                for (const cell of damageCells) {
                  pendingDamageEvents.push({
                    t: dueAt,
                    attackerId: me.id,
                    targetId: Number(chargeTarget.id),
                    attackerTeam: me.team,
                    attackSeq: Number(me.attackSeq ?? 0),
                    projectileId,
                    targetCellQ: Number(cell.q),
                    targetCellR: Number(cell.r),
                    damage: Math.max(1, Math.round(Number(me.atk ?? 0))),
                    damageSource: 'knight_charge',
                    projectileSpeed: 0,
                    missed: false,
                    enableSkeletonArcherBounce: false,
                  });
                }
              }
              break;
            }
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
            const preparedAttackHitDelayMs = Math.max(0, Number(res.preparedAttackHitDelayMs ?? 0));
            const preparedAttackHoldMs = Math.max(0, Number(res.preparedAttackHoldMs ?? 0));
            const usesPreparedAttackTiming = !Boolean(res.isRanged) && preparedAttackHitDelayMs > 0;
            me.preparedAttackIdleAttack2At = usesPreparedAttackTiming
              ? tickTimeMs + preparedAttackHitDelayMs + preparedAttackHoldMs
              : 0;
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
                preparedAttackIntervalMs: Number(res.preparedAttackIntervalMs ?? 0),
                preparedAttackHitDelayMs: preparedAttackHitDelayMs,
                preparedAttackHoldMs: preparedAttackHoldMs,
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
            } else if (usesPreparedAttackTiming) {
              pendingDamageEvents.push({
                t: tickTimeMs + preparedAttackHitDelayMs,
                attackerId: me.id,
                targetId: liveTarget.id,
                attackerTeam: me.team,
                attackSeq,
                damage: Number(res.damage ?? 1),
                damageSource: 'attack',
                projectileSpeed: 0,
                missed: res.isHit !== true,
                enableSkeletonArcherBounce: false,
              });
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
            } else {
              if (isAttackDodgedByTarget(liveTarget)) {
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
              if (dmgRes.success && !Boolean(dmgRes.killed)) {
                tryTriggerSwordsmanCounterIn(simState, liveTarget, {
                  attackerId: me.id,
                  attackerTeam: me.team,
                  attackSeq,
                  damageSource: 'attack',
                }, tickTimeMs, { collectTimeline, events, pendingCounterEvents });
              }
              if (dmgRes.success && dmgRes.killed) {
                releaseWormSwallowedVictimIn(simState, liveTarget.id, tickTimeMs, { collectTimeline, events });
              }
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
        const moveTravelEndsAt = Math.max(tickTimeMs, Number(me.nextActionAt ?? 0)) + moveTravelMs;
        const moveReadyAt = moveTravelEndsAt + moveWaitMs;
        me.nextMoveAt = moveReadyAt;
        me.nextActionAt = Math.max(me.nextActionAt, moveTravelEndsAt);
        me.moveFromQ = from.q;
        me.moveFromR = from.r;
        me.moveStartAt = tickTimeMs;
        me.moveEndAt = moveTravelEndsAt;
        unitActions += 1;
        if (!moved) break;

        if (collectTimeline) {
          events.push({
            tStart: tickTimeMs,
            t: moveTravelEndsAt,
            durationMs: moveTravelMs,
            waitMs: moveWaitMs,
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
  unit.preparedAttackIdleAttack2At = 0;
  unit.nextAbilityAt = hasWormSwallowPassive(unit) || hasSirenMirrorAbility(unit)
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
