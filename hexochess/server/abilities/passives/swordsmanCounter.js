export const SWORDSMAN_COUNTER_ABILITY_KEY = 'swordsman_counter';
export const SWORDSMAN_COUNTER_TRIGGER_CHANCE = 0.3;
export const SWORDSMAN_COUNTER_WINDOW_MS = 500;
export const SWORDSMAN_COUNTER_SKILL_MS = 300;

export const swordsmanCounterAbility = {
  key: SWORDSMAN_COUNTER_ABILITY_KEY,
  kind: 'passive',

  matches(unitLike) {
    return !!unitLike
      && String(unitLike.abilityType ?? 'none') === 'passive'
      && String(unitLike.abilityKey ?? '') === SWORDSMAN_COUNTER_ABILITY_KEY;
  },

  tryQueueTrigger({
    defender,
    incomingEvent,
    timeMs,
    pendingCounterEvents,
    getPreparedAttackIdleAttack2At,
  }) {
    if (!this.matches(defender)) return false;
    if (!defender || defender.dead || defender.zone !== 'board') return false;
    const incomingDamageSource = String(incomingEvent?.damageSource ?? '');
    if (incomingDamageSource === SWORDSMAN_COUNTER_ABILITY_KEY) return false;
    if (incomingDamageSource !== 'attack') return false;
    if (!Array.isArray(pendingCounterEvents)) return false;
    if (Math.random() >= SWORDSMAN_COUNTER_TRIGGER_CHANCE) return false;

    const dueAt = Math.max(
      Number(timeMs ?? 0),
      Number(defender.nextActionAt ?? 0),
      Number(getPreparedAttackIdleAttack2At?.(defender) ?? 0),
    );
    const windowMs = Math.max(0, Number(SWORDSMAN_COUNTER_WINDOW_MS ?? 0));
    defender.nextActionAt = Math.max(Number(defender.nextActionAt ?? 0), dueAt + windowMs);

    pendingCounterEvents.push({
      t: dueAt,
      casterId: Number(defender.id),
      targetId: Number(incomingEvent?.attackerId),
      casterTeam: defender.team,
      damage: Math.max(1, Math.round(Number(defender.atk ?? 1))),
      damageKind: String(defender.abilityDamageType ?? defender.damageType ?? 'physical'),
      windowMs,
      displayMs: Math.max(0, Number(SWORDSMAN_COUNTER_SKILL_MS ?? 0)),
    });
    return true;
  },

  resolvePendingEvent({
    simState,
    next,
    dueAt,
    collectTimeline = false,
    events = [],
    findUnitById,
    isAttackDodgedByTarget,
    applyDamageToUnit,
    onKilledTarget,
    defaultAccuracy = 0.8,
  }) {
    const caster = findUnitById(simState, next?.casterId);
    const target = findUnitById(simState, next?.targetId);
    if (!caster || caster.dead || caster.zone !== 'board') return false;
    if (!target || target.dead || target.zone !== 'board') return false;
    if (String(caster.team ?? '') === String(target.team ?? '')) return false;

    const counterWindowMs = Math.max(0, Number(next?.windowMs ?? SWORDSMAN_COUNTER_WINDOW_MS));
    caster.nextActionAt = Math.max(Number(caster.nextActionAt ?? 0), Number(dueAt ?? 0) + counterWindowMs);

    caster.attackSeq = Number(caster.attackSeq ?? 0) + 1;
    const attackSeq = Number(caster.attackSeq ?? 0);

    if (collectTimeline) {
      events.push({
        t: Number(dueAt ?? 0),
        type: 'ability_cast',
        casterId: Number(caster.id),
        targetId: Number(target.id),
        abilityKey: SWORDSMAN_COUNTER_ABILITY_KEY,
        castTimeMs: 0,
        windowMs: counterWindowMs,
        displayMs: Math.max(0, Number(next?.displayMs ?? SWORDSMAN_COUNTER_SKILL_MS)),
      });
    }

    const counterAccuracy = Math.max(0, Math.min(1, Number(caster.accuracy ?? defaultAccuracy)));
    const counterIsHit = Math.random() < counterAccuracy;
    if (!counterIsHit) {
      if (collectTimeline) {
        events.push({
          t: Number(dueAt ?? 0),
          type: 'miss',
          attackerId: Number(caster.id),
          targetId: Number(target.id),
          attackerTeam: caster.team,
          attackSeq,
          missSource: SWORDSMAN_COUNTER_ABILITY_KEY,
          skipPreparedAttackVisual: true,
        });
      }
      return true;
    }

    if (isAttackDodgedByTarget(target)) {
      if (collectTimeline) {
        events.push({
          t: Number(dueAt ?? 0),
          type: 'miss',
          attackerId: Number(caster.id),
          targetId: Number(target.id),
          attackerTeam: caster.team,
          attackSeq,
          missSource: 'ghost_evasion',
          skipPreparedAttackVisual: true,
        });
      }
      return true;
    }

    const counterDmgRes = applyDamageToUnit(simState, target.id, next?.damage, next?.damageKind ?? 'physical');
    if (!counterDmgRes?.success) return false;

    if (collectTimeline) {
      events.push({
        t: Number(dueAt ?? 0),
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
        damageKind: String(next?.damageKind ?? 'physical'),
        skipPreparedAttackVisual: true,
      });
    }

    if (counterDmgRes.killed) {
      onKilledTarget?.(target.id, dueAt);
    }

    return true;
  },
};
