import test from 'node:test';
import assert from 'node:assert/strict';

import { addUnit, attack, computeMitigatedDamage, createBattleState, hexDistance } from '../shared/battleCore.js';
import { POWER_TYPE_PAWN } from '../shared/unitCatalog.js';
import { BATTLE_ENTRY_SECONDS } from '../server/battlePhases.js';
import {
  createSimState,
  performAttackIn,
  sanitizeUnitForBattleStart,
  simulateBattleReplayFromState,
  SNAPSHOT_STEP_MS,
} from '../server/combatSimulator.js';
import { ABILITY_DESC_BY_KEY } from '../src/scenes/battleScene/battleText.js';

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
    powerType: POWER_TYPE_PAWN,
    zone: 'board',
    benchSlot: null,
    attackSpeed: 1,
    moveSpeed: 1,
    projectileSpeed: 0,
    attackMode: 'melee',
    accuracy: 1,
    armor: 0,
    magicResist: 0,
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

test('battle text module imports cleanly and exposes knight charge description', () => {
  assert.equal(typeof ABILITY_DESC_BY_KEY.knight_charge, 'string');
  assert.ok(ABILITY_DESC_BY_KEY.knight_charge.length > 0);
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

test('battle core applies target armor as diminishing damage reduction', () => {
  const state = createBattleState();
  addUnit(state, makeUnit({ id: 1, atk: 20 }));
  addUnit(state, makeUnit({ id: 2, q: 1, r: 0, team: 'enemy', armor: 25 }));

  const res = attack(state, 1, 2);

  assert.equal(res.success, true);
  assert.equal(res.damage, 15);
});

test('battle core soft-caps armor scaling after 70 and clamps maximum reduction', () => {
  const state = createBattleState();
  addUnit(state, makeUnit({ id: 1, atk: 100 }));
  addUnit(state, makeUnit({ id: 2, q: 1, r: 0, team: 'enemy', armor: 90 }));

  const res = attack(state, 1, 2);

  assert.equal(res.success, true);
  assert.equal(res.damage, 20);
});

test('magic resist uses the same mitigation curve as armor on the magic damage channel', () => {
  assert.equal(computeMitigatedDamage(100, 20, 'magic'), 80);
  assert.equal(computeMitigatedDamage(100, 90, 'magic'), 20);
});

test('crossbowman cannot shoot target outside straight hex line', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Crossbowman',
      attackMode: 'ranged',
      projectileSpeed: 7.5,
      attackRangeMax: 20,
      attackRangeFullDamage: 5,
      abilityType: 'passive',
      abilityKey: 'crossbowman_line_shot',
    }),
    makeUnit({ id: 2, q: 1, r: 1, team: 'enemy' }),
  ]);

  const res = withRandomSequence([0], () => performAttackIn(simState, 1, 2, 0));

  assert.equal(res.success, false);
  assert.equal(res.reason, 'OUT_OF_LINE');
});

test('crossbowman cannot shoot vertically after diagonal-line removal', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Crossbowman',
      attackMode: 'ranged',
      projectileSpeed: 10,
      attackRangeMax: 20,
      attackRangeFullDamage: 5,
      abilityType: 'passive',
      abilityKey: 'crossbowman_line_shot',
    }),
    makeUnit({ id: 2, q: 0, r: 2, team: 'enemy' }),
  ]);

  const res = withRandomSequence([0], () => performAttackIn(simState, 1, 2, 0));

  assert.equal(res.success, false);
  assert.equal(res.reason, 'OUT_OF_LINE');
});

test('crossbowman moves to nearest firing line before attacking', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Crossbowman',
      atk: 25,
      attackMode: 'ranged',
      projectileSpeed: 10,
      attackRangeMax: 20,
      attackRangeFullDamage: 20,
      moveSpeed: 10,
      attackSpeed: 1,
      abilityType: 'passive',
      abilityKey: 'crossbowman_line_shot',
    }),
    makeUnit({
      id: 2,
      q: 1,
      r: 1,
      team: 'enemy',
      hp: 40,
      maxHp: 40,
      atk: 0,
      moveSpeed: 0.1,
    }),
  ]);

  const replay = withRandomSequence([0, 0, 0], () => simulateBattleReplayFromState(simState, {
    tickMs: 100,
    maxBattleMs: 1000,
    collectSnapshots: false,
  }));

  const move = replay.events.find((e) => e.type === 'move' && e.unitId === 1);
  const attack = replay.events.find((e) => e.type === 'attack' && e.attackerId === 1);

  assert.ok(move);
  assert.ok(attack);
  assert.ok(move.t <= attack.t);
  assert.equal(move.q, 0);
  assert.equal(move.r, 1);
});

test('crossbowman prefers rear diagonal firing hex over front diagonal one', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      q: 4,
      r: 4,
      type: 'Crossbowman',
      atk: 25,
      attackMode: 'ranged',
      projectileSpeed: 10,
      attackRangeMax: 20,
      attackRangeFullDamage: 20,
      moveSpeed: 10,
      attackSpeed: 1,
      abilityType: 'passive',
      abilityKey: 'crossbowman_line_shot',
    }),
    makeUnit({
      id: 2,
      q: 6,
      r: 3,
      team: 'enemy',
      hp: 40,
      maxHp: 40,
      atk: 0,
      moveSpeed: 0.1,
    }),
  ]);

  const replay = withRandomSequence([0, 0, 0], () => simulateBattleReplayFromState(simState, {
    tickMs: 100,
    maxBattleMs: 500,
    collectSnapshots: false,
  }));

  const move = replay.events.find((e) => e.type === 'move' && e.unitId === 1);

  assert.ok(move);
  assert.equal(move.q, 4);
  assert.equal(move.r, 3);
});

test('crossbowman prioritizes a target already on the firing line over a nearer off-line enemy', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Crossbowman',
      atk: 25,
      attackMode: 'ranged',
      projectileSpeed: 10,
      attackRangeMax: 20,
      attackRangeFullDamage: 2,
      attackSpeed: 1,
      moveSpeed: 10,
      abilityType: 'passive',
      abilityKey: 'crossbowman_line_shot',
    }),
    makeUnit({ id: 2, q: 1, r: 1, team: 'enemy', hp: 40, maxHp: 40, moveSpeed: 0.1, atk: 0 }),
    makeUnit({ id: 3, q: 4, r: 0, team: 'enemy', hp: 40, maxHp: 40, moveSpeed: 0.1, atk: 0 }),
  ]);

  const replay = withRandomSequence([0, 0, 0], () => simulateBattleReplayFromState(simState, {
    tickMs: 100,
    maxBattleMs: 500,
    collectSnapshots: false,
  }));

  const move = replay.events.find((e) => e.type === 'move' && e.unitId === 1);
  const attack = replay.events.find((e) => e.type === 'attack' && e.attackerId === 1);

  assert.equal(move, undefined);
  assert.ok(attack);
  assert.equal(attack.targetId, 3);
  assert.equal(attack.dist, 4);
});

test('crossbowman attack metadata includes all pierced targets on firing line', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Crossbowman',
      atk: 25,
      attackMode: 'ranged',
      projectileSpeed: 10,
      attackRangeMax: 20,
      attackRangeFullDamage: 20,
      abilityType: 'passive',
      abilityKey: 'crossbowman_line_shot',
    }),
    makeUnit({ id: 2, q: 2, r: 0, team: 'enemy', hp: 40, maxHp: 40 }),
    makeUnit({ id: 3, q: 4, r: 0, team: 'enemy', hp: 40, maxHp: 40 }),
  ]);

  const res = withRandomSequence([0], () => performAttackIn(simState, 1, 2, 0));

  assert.equal(res.success, true);
  assert.equal(res.projectilePierce, true);
  assert.deepEqual(res.pierceTargets, [
    { unitId: 2, dist: 2 },
    { unitId: 3, dist: 4 },
  ]);
  assert.equal(res.projectileTravelMs, 200);
  assert.equal(res.projectileTravelMsTotal, 200);
});

test('crossbowman single-target shot still stays piercing and exits the board', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Crossbowman',
      atk: 25,
      attackMode: 'ranged',
      projectileSpeed: 10,
      attackRangeMax: 20,
      attackRangeFullDamage: 20,
      abilityType: 'passive',
      abilityKey: 'crossbowman_line_shot',
    }),
    makeUnit({ id: 2, q: 2, r: 0, team: 'enemy', hp: 40, maxHp: 40 }),
  ]);

  const res = withRandomSequence([0], () => performAttackIn(simState, 1, 2, 0));

  assert.equal(res.success, true);
  assert.equal(res.projectilePierce, true);
  assert.equal(res.projectileForceStraight, true);
  assert.ok(Array.isArray(res.projectileRayCells));
  assert.ok(res.projectileRayCells.length > 0);
  assert.equal(res.projectileTravelMs, 200);
  assert.equal(res.projectileTravelMsTotal, 200);
});

test('crossbowman piercing shot damages every enemy on the firing line', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Crossbowman',
      atk: 25,
      attackMode: 'ranged',
      projectileSpeed: 10,
      attackRangeMax: 20,
      attackRangeFullDamage: 20,
      attackSpeed: 1,
      abilityType: 'passive',
      abilityKey: 'crossbowman_line_shot',
    }),
    makeUnit({ id: 2, q: 2, r: 0, team: 'enemy', hp: 40, maxHp: 40 }),
    makeUnit({ id: 3, q: 4, r: 0, team: 'enemy', hp: 40, maxHp: 40 }),
  ]);

  const replay = withRandomSequence([0, 0, 0], () => simulateBattleReplayFromState(simState, {
    tickMs: 100,
    maxBattleMs: 800,
    collectSnapshots: false,
  }));

  const damages = replay.events.filter((e) => e.type === 'damage' && e.attackerId === 1);
  const targets = damages.map((e) => e.targetId);

  assert.deepEqual(targets, [2, 3]);
  assert.equal(damages[0].damageSource, 'projectile_pierce');
  assert.equal(damages[1].damageSource, 'projectile_pierce');
  assert.equal(damages[0].t, 200);
  assert.equal(damages[1].t, 200);
});

test('swordsman counter queues follow-up triggers during the 500ms counter window', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Monk',
      team: 'enemy',
      hp: 100,
      maxHp: 100,
      atk: 10,
      attackSpeed: 5,
    }),
    makeUnit({
      id: 2,
      q: 1,
      r: 0,
      hp: 100,
      maxHp: 100,
      abilityType: 'passive',
      abilityKey: 'swordsman_counter',
    }),
  ]);

  const replay = withRandomSequence([0, 0, 0, 0, 0, 0], () => simulateBattleReplayFromState(simState, {
    tickMs: 100,
    maxBattleMs: 700,
    collectSnapshots: false,
  }));

  const counterCasts = replay.events.filter((e) =>
    e.type === 'ability_cast' &&
    e.casterId === 2 &&
    e.abilityKey === 'swordsman_counter'
  );
  const counterDamages = replay.events.filter((e) =>
    e.type === 'damage' &&
    e.attackerId === 2 &&
    e.damageSource === 'swordsman_counter'
  );
  const swordsmanAttacks = replay.events.filter((e) =>
    e.type === 'attack' &&
    e.attackerId === 2
  );

  assert.deepEqual(counterCasts.map((e) => e.t), [0, 500]);
  assert.deepEqual(counterDamages.map((e) => e.t), [0, 500]);
  assert.equal(counterCasts[0].windowMs, 500);
  assert.equal(counterCasts[1].windowMs, 500);
  assert.equal(counterCasts[0].displayMs, 300);
  assert.equal(counterCasts[1].displayMs, 300);
  assert.equal(swordsmanAttacks.length, 0);
});

test('swordsman serializes multiple counter triggers into a strict 500ms queue', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Monk',
      team: 'enemy',
      hp: 40,
      maxHp: 40,
      atk: 10,
    }),
    makeUnit({
      id: 2,
      type: 'Monk',
      q: 0,
      r: 1,
      team: 'enemy',
      hp: 40,
      maxHp: 40,
      atk: 10,
    }),
    makeUnit({
      id: 3,
      q: 1,
      r: 0,
      hp: 100,
      maxHp: 100,
      abilityType: 'passive',
      abilityKey: 'swordsman_counter',
    }),
  ]);

  const replay = withRandomSequence([0, 0, 0, 0, 0, 0], () => simulateBattleReplayFromState(simState, {
    tickMs: 100,
    maxBattleMs: 700,
    collectSnapshots: false,
  }));

  const counterCasts = replay.events.filter((e) =>
    e.type === 'ability_cast' &&
    e.casterId === 3 &&
    e.abilityKey === 'swordsman_counter'
  );
  const counterDamages = replay.events.filter((e) =>
    e.type === 'damage' &&
    e.attackerId === 3 &&
    e.damageSource === 'swordsman_counter'
  );
  const swordsmanAttacks = replay.events.filter((e) =>
    e.type === 'attack' &&
    e.attackerId === 3
  );

  assert.deepEqual(counterCasts.map((e) => ({ t: e.t, targetId: e.targetId })), [
    { t: 0, targetId: 1 },
    { t: 500, targetId: 2 },
  ]);
  assert.deepEqual(counterDamages.map((e) => ({ t: e.t, targetId: e.targetId })), [
    { t: 0, targetId: 1 },
    { t: 500, targetId: 2 },
  ]);
  assert.equal(counterCasts[0].windowMs, 500);
  assert.equal(counterCasts[1].windowMs, 500);
  assert.equal(swordsmanAttacks.length, 0);
});

test('swordsman counter inherits accuracy and can miss', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Monk',
      team: 'enemy',
      hp: 100,
      maxHp: 100,
      atk: 10,
      accuracy: 1,
    }),
    makeUnit({
      id: 2,
      q: 1,
      r: 0,
      hp: 100,
      maxHp: 100,
      accuracy: 0.2,
      abilityType: 'passive',
      abilityKey: 'swordsman_counter',
    }),
  ]);

  const replay = withRandomSequence([0, 0, 0.9], () => simulateBattleReplayFromState(simState, {
    tickMs: 100,
    maxBattleMs: 200,
    collectSnapshots: false,
  }));

  const counterCasts = replay.events.filter((e) =>
    e.type === 'ability_cast' &&
    e.casterId === 2 &&
    e.abilityKey === 'swordsman_counter'
  );
  const counterMisses = replay.events.filter((e) =>
    e.type === 'miss' &&
    e.attackerId === 2
  );
  const counterDamages = replay.events.filter((e) =>
    e.type === 'damage' &&
    e.attackerId === 2 &&
    e.damageSource === 'swordsman_counter'
  );

  assert.equal(counterCasts.length, 1);
  assert.equal(counterMisses.length, 1);
  assert.equal(counterMisses[0].missSource, 'swordsman_counter');
  assert.equal(counterMisses[0].skipPreparedAttackVisual, true);
  assert.equal(counterDamages.length, 0);
});

test('swordsman counter does not trigger when the 30 percent roll fails', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Monk',
      team: 'enemy',
      hp: 100,
      maxHp: 100,
      atk: 10,
      accuracy: 1,
    }),
    makeUnit({
      id: 2,
      q: 1,
      r: 0,
      hp: 100,
      maxHp: 100,
      accuracy: 1,
      abilityType: 'passive',
      abilityKey: 'swordsman_counter',
    }),
  ]);

  const replay = withRandomSequence([0, 0.9], () => simulateBattleReplayFromState(simState, {
    tickMs: 100,
    maxBattleMs: 200,
    collectSnapshots: false,
  }));

  const counterCasts = replay.events.filter((e) =>
    e.type === 'ability_cast' &&
    e.casterId === 2 &&
    e.abilityKey === 'swordsman_counter'
  );
  const counterDamages = replay.events.filter((e) =>
    e.type === 'damage' &&
    e.attackerId === 2 &&
    e.damageSource === 'swordsman_counter'
  );

  assert.equal(counterCasts.length, 0);
  assert.equal(counterDamages.length, 0);
});

test('swordsman counter can be dodged by ghost evasion', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Ghost',
      team: 'enemy',
      hp: 100,
      maxHp: 100,
      atk: 10,
      accuracy: 1,
      abilityType: 'passive',
      abilityKey: 'ghost_evasion',
    }),
    makeUnit({
      id: 2,
      q: 1,
      r: 0,
      hp: 100,
      maxHp: 100,
      accuracy: 1,
      abilityType: 'passive',
      abilityKey: 'swordsman_counter',
    }),
  ]);

  const replay = withRandomSequence([0, 0, 0, 0], () => simulateBattleReplayFromState(simState, {
    tickMs: 100,
    maxBattleMs: 200,
    collectSnapshots: false,
  }));

  const counterCasts = replay.events.filter((e) =>
    e.type === 'ability_cast' &&
    e.casterId === 2 &&
    e.abilityKey === 'swordsman_counter'
  );
  const counterMisses = replay.events.filter((e) =>
    e.type === 'miss' &&
    e.attackerId === 2
  );
  const counterDamages = replay.events.filter((e) =>
    e.type === 'damage' &&
    e.attackerId === 2 &&
    e.damageSource === 'swordsman_counter'
  );

  assert.equal(counterCasts.length, 1);
  assert.equal(counterMisses.length, 1);
  assert.equal(counterMisses[0].missSource, 'ghost_evasion');
  assert.equal(counterMisses[0].skipPreparedAttackVisual, true);
  assert.equal(counterDamages.length, 0);
});

test('swordsman counter interrupts residual idle_attack2 instead of waiting full attack interval', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Skeleton',
      team: 'enemy',
      hp: 1060,
      maxHp: 1060,
      atk: 1,
      attackSpeed: 1,
    }),
    makeUnit({
      id: 2,
      q: 1,
      r: 0,
      hp: 60,
      maxHp: 60,
      abilityType: 'passive',
      abilityKey: 'swordsman_counter',
    }),
  ]);

  const replay = withRandomSequence([0, 0, 0, 0, 0, 0, 0, 0], () => simulateBattleReplayFromState(simState, {
    tickMs: 100,
    maxBattleMs: 2500,
    collectSnapshots: false,
  }));

  const counterCasts = replay.events.filter((e) =>
    e.type === 'ability_cast' &&
    e.casterId === 2 &&
    e.abilityKey === 'swordsman_counter'
  );

  assert.ok(counterCasts.length >= 3);
  assert.equal(counterCasts[0].t, 0);
  assert.equal(counterCasts[1].t, 1650);
  assert.equal(counterCasts[2].t, 2150);
});

test('crossbowman bolt keeps a fixed target cell and hits occupancy on the flight line', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Crossbowman',
      atk: 25,
      attackMode: 'ranged',
      projectileSpeed: 1,
      attackRangeMax: 20,
      attackRangeFullDamage: 20,
      attackSpeed: 0.1,
      abilityType: 'passive',
      abilityKey: 'crossbowman_line_shot',
    }),
    makeUnit({
      id: 2,
      q: 3,
      r: 0,
      team: 'enemy',
      hp: 40,
      maxHp: 40,
      moveSpeed: 10,
    }),
  ]);

  const replay = withRandomSequence([0, 0, 0, 0], () => simulateBattleReplayFromState(simState, {
    tickMs: 100,
    maxBattleMs: 3500,
    collectSnapshots: false,
  }));

  const openingAttack = replay.events.find((e) => e.type === 'attack' && e.attackerId === 1);
  const earlyMove = replay.events.find((e) => e.type === 'move' && e.unitId === 2);
  const openingDamage = replay.events.find((e) => e.type === 'damage' && e.attackerId === 1);

  assert.ok(openingAttack);
  assert.equal(openingAttack.projectileTargetQ, 3);
  assert.equal(openingAttack.projectileTargetR, 0);
  assert.equal(openingAttack.projectileTravelMs, 200);
  assert.ok(earlyMove);
  assert.ok(openingDamage);
  assert.equal(openingDamage.targetId, 2);
  assert.equal(openingDamage.t, 200);
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
    makeUnit({ id: 1, type: 'Monk', atk: 15 }),
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

test('naga siren starts battle with mirror-image cast and summons two copies after 1 second', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'NagaSiren',
      q: 2,
      r: 3,
      hp: 120,
      maxHp: 120,
      atk: 12,
      attackSpeed: 0.95,
      moveSpeed: 1.3,
      abilityType: 'active',
      abilityKey: 'siren_mirror_image',
      abilityCooldown: 20,
    }),
    makeUnit({ id: 2, q: 6, r: 3, team: 'enemy', hp: 200, maxHp: 200, atk: 0, moveSpeed: 0.1 }),
  ]);

  const replay = simulateBattleReplayFromState(simState, {
    tickMs: SNAPSHOT_STEP_MS,
    maxBattleMs: 1600,
    collectSnapshots: false,
  });

  const cast = replay.events.find((e) => e.type === 'ability_cast' && e.casterId === 1 && e.abilityKey === 'siren_mirror_image');
  const sirenSpawns = replay.events.filter((e) => e.type === 'spawn' && e.sourceId === 1 && e.sourceAbilityKey === 'siren_mirror_image');
  const spawnCells = sirenSpawns.map((e) => `${e.unit.q},${e.unit.r}`).sort();

  assert.ok(cast);
  assert.equal(cast.t, 0);
  assert.equal(cast.castTimeMs, 1000);
  assert.equal(sirenSpawns.length, 2);
  assert.deepEqual(spawnCells, ['2,2', '2,4']);
  assert.ok(sirenSpawns.every((spawn) => spawn.unit.isIllusion === true));
});

test('naga siren copies inherit movement stats but lose the ability and keep only 30 percent hp and attack', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'NagaSiren',
      q: 2,
      r: 3,
      hp: 120,
      maxHp: 120,
      atk: 12,
      attackSpeed: 0.95,
      moveSpeed: 1.3,
      abilityType: 'active',
      abilityKey: 'siren_mirror_image',
      abilityCooldown: 20,
    }),
    makeUnit({ id: 2, q: 6, r: 3, team: 'enemy', hp: 200, maxHp: 200, atk: 0, moveSpeed: 0.1 }),
  ]);

  const replay = simulateBattleReplayFromState(simState, {
    tickMs: SNAPSHOT_STEP_MS,
    maxBattleMs: 1600,
    collectSnapshots: false,
  });

  const sirenSpawns = replay.events.filter((e) => e.type === 'spawn' && e.sourceId === 1 && e.sourceAbilityKey === 'siren_mirror_image');

  assert.equal(sirenSpawns.length, 2);
  for (const spawn of sirenSpawns) {
    assert.equal(spawn.unit.isIllusion, true);
    assert.equal(spawn.unit.type, 'NagaSiren');
    assert.equal(spawn.unit.hp, 36);
    assert.equal(spawn.unit.maxHp, 36);
    assert.equal(spawn.unit.atk, 4);
    assert.equal(spawn.unit.attackSpeed, 0.95);
    assert.equal(spawn.unit.moveSpeed, 1.3);
    assert.equal(spawn.unit.abilityType, 'none');
    assert.equal(spawn.unit.abilityKey, null);
    assert.equal(spawn.unit.abilityCooldown, 0);
  }
});

test('naga siren illusion can dodge an incoming attack with 30 percent chance', () => {
  const simState = createSimState([
    makeUnit({ id: 1, type: 'Monk', atk: 20, accuracy: 1 }),
    makeUnit({
      id: 2,
      type: 'NagaSiren',
      q: 1,
      r: 0,
      team: 'enemy',
      hp: 36,
      maxHp: 36,
      atk: 4,
      abilityType: 'none',
      abilityKey: null,
      isIllusion: true,
    }),
  ]);

  const replay = withRandomSequence([0], () => simulateBattleReplayFromState(simState, {
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

test('knight starts battle with charge cast and then performs a long dash', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Knight',
      q: 0,
      r: 0,
      atk: 12,
      hp: 120,
      maxHp: 120,
      moveSpeed: 0.9,
      attackSpeed: 0.8,
      cellSpanX: 2,
      abilityType: 'active',
      abilityKey: 'knight_charge',
      abilityCooldown: 6,
      nextAbilityAt: 0,
    }),
    makeUnit({ id: 2, q: 3, r: 0, team: 'enemy', hp: 40, maxHp: 40, atk: 0, moveSpeed: 0.1 }),
    makeUnit({ id: 3, q: 4, r: 1, team: 'enemy', hp: 40, maxHp: 40, atk: 0, moveSpeed: 0.1 }),
    makeUnit({ id: 4, q: 5, r: 1, team: 'enemy', hp: 40, maxHp: 40, atk: 0, moveSpeed: 0.1 }),
  ]);

  const replay = simulateBattleReplayFromState(simState, {
    tickMs: SNAPSHOT_STEP_MS,
    maxBattleMs: 6000,
    collectSnapshots: false,
  });

  const cast = replay.events.find((e) => e.type === 'ability_cast' && e.casterId === 1 && e.abilityKey === 'knight_charge');
  const move = replay.events.find((e) => e.type === 'move' && e.unitId === 1 && Number(e.tStart ?? NaN) >= 1000);
  const chargeDamages = replay.events.filter((e) => e.type === 'damage' && e.attackerId === 1 && e.damageSource === 'knight_charge');

  assert.ok(cast);
  assert.equal(cast.t, 0);
  assert.equal(cast.castTimeMs, 1000);
  assert.ok(move);
  assert.equal(move.tStart, 1000);
  assert.ok(Number(move.durationMs) > 0);
  assert.equal(move.abilityKey, 'knight_charge');
  const moveSteps = hexDistance(move.fromQ, move.fromR, move.q, move.r);
  const normalMoveDurationMs = (moveSteps * 1000) / 0.9;
  assert.equal(move.durationMs, normalMoveDurationMs / 2);
  assert.ok(chargeDamages.length >= 2);
});

test('knight charge damages each enemy at most once per cast', () => {
  const simState = createSimState([
    makeUnit({
      id: 1,
      type: 'Knight',
      q: 0,
      r: 0,
      atk: 12,
      hp: 120,
      maxHp: 120,
      moveSpeed: 0.9,
      attackSpeed: 0.8,
      cellSpanX: 2,
      abilityType: 'active',
      abilityKey: 'knight_charge',
      abilityCooldown: 6,
      nextAbilityAt: 0,
    }),
    makeUnit({ id: 2, q: 3, r: 0, team: 'enemy', hp: 80, maxHp: 80, atk: 0, moveSpeed: 0.1 }),
    makeUnit({ id: 3, q: 5, r: 1, team: 'enemy', hp: 80, maxHp: 80, atk: 0, moveSpeed: 0.1 }),
  ]);

  const replay = simulateBattleReplayFromState(simState, {
    tickMs: SNAPSHOT_STEP_MS,
    maxBattleMs: 6000,
    collectSnapshots: false,
  });

  const chargeDamages = replay.events.filter((e) => e.type === 'damage' && e.attackerId === 1 && e.damageSource === 'knight_charge');
  const targetIds = chargeDamages.map((e) => e.targetId);
  const uniqueTargetIds = Array.from(new Set(targetIds));

  assert.deepEqual(targetIds, uniqueTargetIds);
  assert.ok(uniqueTargetIds.includes(2));
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
