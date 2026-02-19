import { updateHpBar } from './hpbar.js';

export function cellKey(q, r) {
  return `${q},${r}`;
}

export function createUnitSystem(scene) {
  const state = {
    units: [],
    occupied: new Set(),
  };

  function findUnit(id) {
    return state.units.find(u => u.id === id) ?? null;
  }

  function getUnitAt(q, r) {
    return state.units.find(u => u.q === q && u.r === r) ?? null;
  }

  function spawnUnitOnBoard(q, r, opts = {}) {
    const key = cellKey(q, r);
    if (state.occupied.has(key)) return null;

    const p = scene.hexToPixel(q, r);

    const radius = Math.max(10, Math.floor(scene.hexSize * 0.45));
    const sprite = scene.add.circle(p.x, p.y, radius, opts.color ?? 0x66ccff).setDepth(1000);

    const label = scene.add.text(p.x, p.y, opts.label ?? '1', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#000',
    }).setOrigin(0.5).setDepth(1001);

    const hp = opts.hp ?? 100;
    const maxHp = opts.maxHp ?? hp;

    const hpBar = scene.add.graphics().setDepth(1002);

    const unit = {
      id: opts.id ?? crypto.randomUUID?.() ?? String(Date.now()),

      q, r,
      team: opts.team ?? 'neutral',

      hp,
      maxHp,

      // визуальные значения для анимации
      hpInstant: hp,
      hpLag: hp,

      sprite,
      label,
      hpBar,
    };

    state.units.push(unit);
    state.occupied.add(key);

    updateHpBar(scene, unit);
    return unit;
  }

  function spawnUnitAtScreen(x, y, opts = {}) {
    const radius = Math.max(10, Math.floor(scene.hexSize * 0.45));
    const sprite = scene.add.circle(x, y, radius, opts.color ?? 0x66ccff).setDepth(1000);

    const label = scene.add.text(x, y, opts.label ?? '1', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#000',
    }).setOrigin(0.5).setDepth(1001);

    const hp = opts.hp ?? 100;
    const maxHp = opts.maxHp ?? hp;

    const hpBar = scene.add.graphics().setDepth(1002);

    const unit = {
      id: opts.id ?? crypto.randomUUID?.() ?? String(Date.now()),

      // важно: эти q/r не должны конфликтовать с доской,
      // BattleScene потом сам выставит позицию/логика зоны не через occupied
      q: opts.q ?? 0,
      r: opts.r ?? 0,
      team: opts.team ?? 'neutral',

      hp,
      maxHp,

      hpInstant: hp,
      hpLag: hp,

      sprite,
      label,
      hpBar,
    };

    state.units.push(unit);

    // occupied НЕ трогаем
    updateHpBar(scene, unit);
    return unit;
  }


  function destroyUnit(id) {
    const u = findUnit(id);
    if (!u) return;

    // удаляем occupied только если этот юнит реально занимал клетку
    const k = cellKey(u.q, u.r);
    if (state.occupied.has(k)) state.occupied.delete(k);


    u.sprite.destroy();
    u.label.destroy();
    u.hpBar.destroy();

    state.units = state.units.filter(x => x.id !== id);
  }

  function setUnitPos(id, q, r) {
    const u = findUnit(id);
    if (!u) return;

    // обновляем occupied
    state.occupied.delete(cellKey(u.q, u.r));
    state.occupied.add(cellKey(q, r));

    u.q = q;
    u.r = r;

    const p = scene.hexToPixel(q, r);
    u.sprite.setPosition(p.x, p.y);
    u.label.setPosition(p.x, p.y);

    updateHpBar(scene, u);
  }

  function setUnitHp(id, hp, maxHp) {
    const u = findUnit(id);
    if (!u) return;

    if (typeof maxHp === 'number') u.maxHp = maxHp;
    u.hp = Math.max(0, Math.min(hp, u.maxHp));

    // красный (мгновенный) сразу прыгает на текущее hp
    u.hpInstant = u.hp;

    // жёлтый (догоняющий) НЕ прыгает вниз при уроне
    // но при хиле можно сразу поднять
    if (u.hpLag < u.hpInstant) u.hpLag = u.hpInstant;

    updateHpBar(scene, u);
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
    unit.sprite.setPosition(p.x, p.y);
    unit.label.setPosition(p.x, p.y);

    updateHpBar(scene, unit);
    return true;
  }

  function removeUnit(unit) {
    destroyUnit(unit.id);
  }

  function relayoutUnits() {
    for (const u of state.units) {
      const p = scene.hexToPixel(u.q, u.r);
      u.sprite.setPosition(p.x, p.y);
      u.label.setPosition(p.x, p.y);
      updateHpBar(scene, u);
    }
  }

  function update(dt) {
    const lagSpeed = 80; // hp/сек

    for (const u of state.units) {
      // жёлтый догоняет вниз к красному
      if (u.hpLag > u.hpInstant) {
        u.hpLag = Math.max(u.hpInstant, u.hpLag - lagSpeed * dt);
        updateHpBar(scene, u);
      }
    }
  }

  return {
    state,
    getUnitAt,
    findUnit,
    spawnUnitOnBoard,
    spawnUnitAtScreen,
    destroyUnit,
    setUnitPos,
    setUnitHp,
    moveUnit,
    removeUnit,
    relayoutUnits,
    update,
  };
}
