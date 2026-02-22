// ===== Чистое боевое ядро (без Phaser) =====

export function createBattleState() {
  return {
    phase: 'prep',     // 'prep' | 'battle'
    result: null,      // null | 'victory' | 'defeat' | 'draw'
    units: [],

    // короли: UI + условия окончания (позже сюда ляжет урон/награды)
    kings: {
      player: { hp: 100, maxHp: 100, coins: 500 }, // старт для теста
      enemy:  { hp: 100, maxHp: 100, coins: 0, visible: false },
    },

    // магазин (server authoritative)
    shop: {
      offers: [], // 5 офферов, генерятся сервером в prep
    },
  };
}

export function addUnit(state, unit) {
  state.units.push({
    id: unit.id,
    q: unit.q,
    r: unit.r,
    hp: unit.hp,
    maxHp: unit.maxHp ?? unit.hp,
    atk: unit.atk,
    team: unit.team,
    rank: unit.rank ?? 1, // ⭐ ранг (1..3)
    type: unit.type ?? null, // ВАЖНО: роль/класс юнита
    zone: unit.zone ?? 'board',
    benchSlot: unit.benchSlot ?? null,
    moveSpeed: unit.moveSpeed ?? 2.0,
  });
}


export function getUnitAt(state, q, r) {
  return state.units.find(u => u.zone === 'board' && u.q === q && u.r === r) ?? null;
}

export function moveUnit(state, unitId, q, r) {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit) return false;
  if (unit.zone !== 'board') return false;

  const occupied = getUnitAt(state, q, r);
  if (occupied && occupied.id !== unitId) return false;

  unit.q = q;
  unit.r = r;
  return true;
}

export function hexDistance(aq, ar, bq, br) {
  const ax = aq, az = ar, ay = -ax - az;
  const bx = bq, bz = br, by = -bx - bz;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

export function attack(state, attackerId, targetId) {
  const attacker = state.units.find(u => u.id === attackerId);
  const target = state.units.find(u => u.id === targetId);

  if (!attacker || !target) return { success: false, reason: 'NO_UNIT' };
  if (attacker.zone !== 'board') return { success: false, reason: 'ATTACKER_NOT_ON_BOARD' };
  if (target.zone !== 'board') return { success: false, reason: 'TARGET_NOT_ON_BOARD' };

  if (attacker.team === target.team) return { success: false };

  const dist = hexDistance(attacker.q, attacker.r, target.q, target.r);
  if (dist > 1) return { success: false };

  target.hp -= attacker.atk;

  if (target.hp <= 0) {
    state.units = state.units.filter(u => u.id !== target.id);
    return { success: true, killed: true };
  }

  return { success: true, killed: false };
}
