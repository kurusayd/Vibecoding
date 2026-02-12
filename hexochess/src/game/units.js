import { updateHpBar } from './hpbar.js';

export function cellKey(q, r) {
  return `${q},${r}`;
}

export function createUnitSystem(scene) {
  const state = {
    units: [],
    occupied: new Set(),
  };

  function getUnitAt(q, r) {
    return state.units.find(u => u.q === q && u.r === r) ?? null;
  }

  function spawnUnitOnBoard(q, r, opts = {}) {
    const key = cellKey(q, r);
    if (state.occupied.has(key)) return null;

    const p = scene.hexToPixel(q, r);

    const radius = Math.max(10, Math.floor(scene.hexSize * 0.45));
    const circle = scene.add.circle(p.x, p.y, radius, opts.color ?? 0x66ccff).setDepth(1000);

    const label = scene.add.text(p.x, p.y, opts.label ?? '1', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#000',
    }).setOrigin(0.5).setDepth(1001);

    const team = opts.team ?? 'neutral';
    const hp = opts.hp ?? 100;
    const maxHp = opts.hp ?? 100;

    const hpBar = scene.add.graphics().setDepth(1002);
    const hpColor = team === 'enemy' ? 0xff4444 : 0x44ff66;

    const unit = {
      q, r,
      team,
      circle,
      label,

      hp,
      maxHp,
      hpShown: hp,
      hpLag: null,

      hpBar,
      hpColor,

      atk: opts.atk ?? 25,
    };

    state.units.push(unit);
    state.occupied.add(key);

    updateHpBar(scene, unit);
    return unit;
  }

  function moveUnit(unit, newQ, newR) {
    const oldKey = cellKey(unit.q, unit.r);
    const newKey = cellKey(newQ, newR);
    if (state.occupied.has(newKey)) return false;

    state.occupied.delete(oldKey);
    state.occupied.add(newKey);

    unit.q = newQ;
    unit.r = newR;

    const p = scene.hexToPixel(newQ, newR);
    unit.circle.setPosition(p.x, p.y);
    unit.label.setPosition(p.x, p.y);

    updateHpBar(scene, unit);
    return true;
  }

  function removeUnit(unit) {
    state.occupied.delete(cellKey(unit.q, unit.r));

    if (unit.hpLag) unit.hpLag.stop();

    unit.circle.destroy();
    unit.label.destroy();
    unit.hpBar.destroy();

    state.units = state.units.filter(u => u !== unit);
  }

  function relayoutUnits() {
    for (const u of state.units) {
      const p = scene.hexToPixel(u.q, u.r);
      u.circle.setPosition(p.x, p.y);
      u.label.setPosition(p.x, p.y);
      updateHpBar(scene, u);
    }
  }

  return {
    state,
    getUnitAt,
    spawnUnitOnBoard,
    moveUnit,
    removeUnit,
    relayoutUnits,
  };
}
