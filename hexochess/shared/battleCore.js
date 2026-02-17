// ===== Чистое боевое ядро (без Phaser) =====

export function createBattleState() {
  return {
    phase: 'prep',     // 'prep' | 'battle'
    result: null,      // null | 'victory' | 'defeat' | 'draw'
    units: [],
  };
}

export function addUnit(state, unit) {
  state.units.push({
    id: unit.id,
    q: unit.q,
    r: unit.r,
    hp: unit.hp,
    maxHp: unit.hp,
    atk: unit.atk,
    team: unit.team,
  });
}

export function getUnitAt(state, q, r) {
  return state.units.find(u => u.q === q && u.r === r) || null;
}

export function moveUnit(state, unitId, q, r) {
  const unit = state.units.find(u => u.id === unitId);
  if (!unit) return false;

  const occupied = getUnitAt(state, q, r);
  if (occupied) return false;

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

  if (!attacker || !target) return { success: false };

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
