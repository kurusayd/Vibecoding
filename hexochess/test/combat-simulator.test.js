import test from 'node:test';
import assert from 'node:assert/strict';

import { BATTLE_ENTRY_SECONDS } from '../server/battlePhases.js';
import {
  createSimState,
  performAttackIn,
  sanitizeUnitForBattleStart,
  simulateBattleReplayFromState,
  SNAPSHOT_STEP_MS,
} from '../server/combatSimulator.js';

function withRandomSequence(values, fn) {
  const originalRandom = Math.random;
  let idx = 0;
  Math.random = () => {
    const value = values[Math.min(idx, values.length - 1)];
    idx += 1;
    return value;
  };
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

function makeUnit(overrides = {}) {
  return {
    id: 1,
    q: 0,
    r: 0,
    hp: 100,
    maxHp: 100,
    atk: 20,
    team: 'player',
    rank: 1,
    type: 'Swordsman',
    powerType: 'Пешка',
    zone: 'board',
    benchSlot: null,
    attackSpeed: 1,
    moveSpeed: 1,
    projectileSpeed: 0,
    attackMode: 'melee',
    accuracy: 1,
    abilityCooldown: 0,
    attackRangeMax: 1,
    attackRangeFullDamage: 1,
    abilityType: 'none',
    abilityKey: null,
    attackSeq: 0,
    dead: false,
    cellSpanX: 1,
    ...overrides,
  };
}

test('entry phase constant stays aligned with 5-second reveal spec', () => {
  assert.equal(BATTLE_ENTRY_SECONDS, 5);
});

test('performAttackIn reports ranged projectile travel time from hex distance', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'SkeletonArcher',
      attackMode: 'ranged',
      projectileSpeed: 5,
      attackRangeMax: 20,
      attackRangeFullDamage: 5,
    }),
    makeUnit({ id: 2, q: 3, r: 0, team: 'enemy' }),
  ]);

  const res = withRandomSequence([0], () => performAttackIn(simState, 1, 2, 0));

  assert.equal(res.success, true);
  assert.equal(res.isRanged, true);
  assert.equal(res.dist, 3);
  assert.equal(res.projectileTravelMs, 600);
});

test('skeleton archer bounce schedules secondary projectile damage', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'SkeletonArcher',
      attackMode: 'ranged',
      projectileSpeed: 10,
      attackRangeMax: 20,
      attackRangeFullDamage: 20,
      atk: 20,
      abilityType: 'passive',
      abilityKey: 'skeleton_archer_bounce',
    }),
    makeUnit({ id: 2, q: 2, r: 0, team: 'enemy', hp: 40, maxHp: 40 }),
    makeUnit({ id: 3, q: 3, r: 0, team: 'enemy', hp: 40, maxHp: 40 }),
  ]);

  const replay = withRandomSequence([0, 0, 0], () => simulateBattleReplayFromState(simState, {
    tickMs: SNAPSHOT_STEP_MS,
    maxBattleMs: 1500,
    collectSnapshots: false,
  }));

  const damages = replay.events.filter((e) => e.type === 'damage');
  const primary = damages.find((e) => e.targetId === 2 && e.damageSource === 'projectile');
  const bounce = damages.find((e) => e.targetId === 3 && e.damageSource === 'projectile_bounce');

  assert.ok(primary);
  assert.ok(bounce);
  assert.equal(primary.damage, 20);
  assert.equal(bounce.damage, 10);
});

test('ghost evasion converts an otherwise successful hit into miss event', () => {
  const simState = createSimState([
    makeUnit({ id: 1, atk: 15 }),
    makeUnit({
      id: 2,
      q: 1,
      r: 0,
      team: 'enemy',
      type: 'Ghost',
      hp: 100,
      maxHp: 100,
      abilityType: 'passive',
      abilityKey: 'ghost_evasion',
    }),
  ]);

  const replay = withRandomSequence([0, 0, 0], () => simulateBattleReplayFromState(simState, {
    tickMs: SNAPSHOT_STEP_MS,
    maxBattleMs: 250,
    collectSnapshots: false,
  }));

  const miss = replay.events.find((e) => e.type === 'miss' && e.targetId === 2);
  const damage = replay.events.find((e) => e.type === 'damage' && e.targetId === 2);

  assert.ok(miss);
  assert.equal(miss.missSource, 'ghost_evasion');
  assert.equal(damage, undefined);
});

test('undertaker casts and summons a skeleton after cast time', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Undertaker',
      atk: 12,
      abilityType: 'active',
      abilityKey: 'undertaker_active',
      abilityCooldown: 0.2,
      moveSpeed: 0.1,
      nextAbilityAt: 0,
    }),
    makeUnit({ id: 2, q: 1, r: 0, team: 'enemy', hp: 200, maxHp: 200, atk: 0, moveSpeed: 0.1 }),
  ]);

  const replay = withRandomSequence([0, 0, 0], () => simulateBattleReplayFromState(simState, {
    tickMs: 100,
    maxBattleMs: 1400,
    collectSnapshots: false,
  }));

  const cast = replay.events.find((e) => e.type === 'ability_cast' && e.casterId === 1);
  const spawn = replay.events.find((e) => e.type === 'spawn' && e.sourceId === 1);

  assert.ok(cast);
  assert.ok(spawn);
  assert.equal(spawn.unit.type, 'SimpleSkeleton');
  assert.ok(spawn.t >= cast.t + 1000);
});

test('sanitizeUnitForBattleStart resets transient combat state and worm swallow state', () => {
  const unit = makeUnit({
    type: 'Worm',
    abilityType: 'passive',
    abilityKey: 'worm_swallow',
    abilityCooldown: 6,
    nextAttackAt: 50,
    nextMoveAt: 60,
    nextActionAt: 70,
    nextAbilityAt: 80,
    attackSeq: 3,
    moveStartAt: 10,
    moveEndAt: 20,
    moveFromQ: 4,
    moveFromR: 5,
    wormSwallowedUnitId: 99,
    wormDigestEndsAt: 1000,
    swallowedByUnitId: 77,
    swallowedAtHp: 42,
  });

  sanitizeUnitForBattleStart(unit);

  assert.equal(unit.nextAttackAt, 0);
  assert.equal(unit.nextMoveAt, 0);
  assert.equal(unit.nextActionAt, 0);
  assert.equal(unit.nextAbilityAt, 0);
  assert.equal(unit.attackSeq, 0);
  assert.equal(unit.moveStartAt, -1);
  assert.equal(unit.moveEndAt, -1);
  assert.equal(unit.moveFromQ, unit.q);
  assert.equal(unit.moveFromR, unit.r);
  assert.equal(unit.wormSwallowedUnitId, null);
  assert.equal(unit.wormDigestEndsAt, null);
  assert.equal(unit.swallowedByUnitId, null);
  assert.equal(unit.swallowedAtHp, null);
});
