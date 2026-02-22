import { updateHpBar } from './hpbar.js';
import Phaser from 'phaser';

export function cellKey(q, r) {
  return `${q},${r}`;
}

const RANK_ICON_SCALE = 0.10; //скейл размера иконки звёздочки. Чтобы менять в одном месте
const SWORDSMAN_ART_PX = 170; // целевая "высота/ширина" на экране, подгони: 90..140

function makeHexHitArea(scene, w, h) {
  const s = scene.hexSize;
  const cx = w / 2;
  const cy = h / 2;

  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = Phaser.Math.DegToRad(60 * i - 30);
    pts.push(new Phaser.Geom.Point(
      cx + s * Math.cos(angle),
      cy + s * Math.sin(angle)
    ));
  }

  return new Phaser.Geom.Polygon(pts);
}

function updateRankStroke(unit) {
  if (!unit?.sprite) return;

  const rank = unit.rank ?? 1;

  // сначала сбрасываем обводку
  unit.sprite.setStrokeStyle();

  if (rank === 2) {
    // серая толстая обводка
    unit.sprite.setStrokeStyle(5, 0x888888, 1);
  }

  if (rank >= 3) {
    // сначала серая
    unit.sprite.setStrokeStyle(5, 0x888888, 1);

    // потом добавляем жёлтую поверх (Phaser не поддерживает 2 stroke,
    // поэтому имитируем — увеличиваем толщину и меняем цвет)
    unit.sprite.setStrokeStyle(10, 0xffcc00, 1);
  }
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

    const radius = Math.floor(scene.hexSize * 0.62);
    
    const sprite = scene.add.circle(p.x, p.y, radius, opts.color ?? 0x66ccff)
    .setDepth(1000);

    // ✅ невидимый drag-handle размером с гекс (лежит поверх всего)
    const w = scene.hexSize * 2;
    const h = scene.hexSize * 2;

    const dragHandle = scene.add.zone(p.x, p.y, w, h).setDepth(1100);
    dragHandle.setDataEnabled();

    const hexArea = makeHexHitArea(scene, w, h);
    dragHandle.setInteractive(hexArea, Phaser.Geom.Polygon.Contains);
    scene.input.setDraggable(dragHandle, true);

    let art = null;

    const atlasKey = 'sworman_atlas';
    const idleFrame = 'psd_animation/idle.png';

    if (opts.type === 'Swordsman' && scene.textures.exists(atlasKey)) {
      art = scene.add.sprite(p.x, p.y, atlasKey, idleFrame)
        .setDepth(1050)
        .setOrigin(0.5, 0.85);

      // ✅ если вдруг всё равно missing (например race condition) — откатываемся на круг
      if (art.texture?.key === '__MISSING' || art.frame?.name == null) {
        art.destroy();
        art = null;
        sprite.setVisible(true);
      } else {
        const frameW = art.frame?.realWidth ?? art.frame?.width ?? 256;
        art.setScale(SWORDSMAN_ART_PX / frameW);

        if (scene.anims.exists('swordman_idle')) art.play('swordman_idle');
        else if (scene.anims.exists('swordman_walk')) art.play('swordman_walk');
        if (opts.team === 'enemy') art.setFlipX(true);

        sprite.setVisible(false);
      }
    } else {
      sprite.setVisible(true);
    }

    const label = scene.add.text(p.x, p.y, opts.label ?? '1', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#000',
    }).setOrigin(0.5).setDepth(1001);

    const hp = opts.hp ?? 100;
    const maxHp = opts.maxHp ?? hp;

    const hpBar = scene.add.graphics().setDepth(1060);

    const rank = opts.rank ?? 1;
    const rankKey = `rank${Math.max(1, Math.min(3, rank))}`;

    // ⭐ иконка ранга (позицию выставит updateHpBar)
    const rankIcon = scene.add.image(p.x, p.y, rankKey)
      .setDepth(1070)
      .setOrigin(0.5, 1)
      .setScale(RANK_ICON_SCALE); //Скейл иконки звёздочки
      rankIcon.setVisible(false); // ✅ на bench по умолчанию скрыто


    const unit = {
      id: opts.id ?? crypto.randomUUID?.() ?? String(Date.now()),

      q, r,
      team: opts.team ?? 'neutral',

      hp,
      maxHp,
      hpInstant: hp,
      hpLag: hp,
      rank,
      rankIcon,
      sprite,
      dragHandle,
      art,
      label,
      hpBar,
    };

    if (art) label.setVisible(false);

    state.units.push(unit);
    state.occupied.add(key);

    updateHpBar(scene, unit);
    updateRankStroke(unit);
    return unit;
  }

  function spawnUnitAtScreen(x, y, opts = {}) {
    const radius = Math.floor(scene.hexSize * 0.62);

    const sprite = scene.add.circle(x, y, radius, opts.color ?? 0x66ccff)
      .setDepth(1000);

    // ✅ невидимый drag-handle размером с гекс (лежит поверх всего)
    const w = scene.hexSize * 2;
    const h = scene.hexSize * 2;

    const dragHandle = scene.add.zone(x, y, w, h).setDepth(1100);
    dragHandle.setDataEnabled();

    const hexArea = makeHexHitArea(scene, w, h);
    dragHandle.setInteractive(hexArea, Phaser.Geom.Polygon.Contains);
    scene.input.setDraggable(dragHandle, true);

    let art = null;

    const atlasKey = 'sworman_atlas';
    const idleFrame = 'psd_animation/idle.png';

    if (opts.type === 'Swordsman' && scene.textures.exists(atlasKey)) {
      art = scene.add.sprite(x, y, atlasKey, idleFrame)
        .setDepth(1050)
        .setOrigin(0.5, 0.85);

      if (art.texture?.key === '__MISSING' || art.frame?.name == null) {
        art.destroy();
        art = null;
        sprite.setVisible(true);
      } else {
        const frameW = art.frame?.realWidth ?? art.frame?.width ?? 256;
        art.setScale(SWORDSMAN_ART_PX / frameW);

        if (scene.anims.exists('swordman_idle')) art.play('swordman_idle');
        else if (scene.anims.exists('swordman_walk')) art.play('swordman_walk');

        if (opts.team === 'enemy') art.setFlipX(true);

        sprite.setVisible(false);
      }
    } else {
      sprite.setVisible(true);
    }

    const label = scene.add.text(x, y, opts.label ?? '1', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#000',
    }).setOrigin(0.5).setDepth(1001);

    const hp = opts.hp ?? 100;
    const maxHp = opts.maxHp ?? hp;

    const hpBar = scene.add.graphics().setDepth(1060);

    const rank = opts.rank ?? 1;
    const rankKey = `rank${Math.max(1, Math.min(3, rank))}`;

    const rankIcon = scene.add.image(x, y, rankKey)
      .setDepth(1070)
      .setOrigin(0.5, 1)
      .setScale(RANK_ICON_SCALE);
    rankIcon.setVisible(false); // ✅ на bench по умолчанию скрыто

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
      rank,
      rankIcon,
      sprite,
      dragHandle,
      art,
      label,
      hpBar,
    };

    if (art) label.setVisible(false);

    state.units.push(unit);

    // occupied НЕ трогаем
    updateHpBar(scene, unit);
    updateRankStroke(unit);
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
    u.art?.destroy();
    u.dragHandle?.destroy();
    u.rankIcon?.destroy(); 

    state.units = state.units.filter(x => x.id !== id);
  }

  function setUnitPos(id, q, r, opts = {}) {
    const u = findUnit(id);
    if (!u) return;

    // если координаты не менялись — ничего не делаем
    if (u.q === q && u.r === r) {
      updateHpBar(scene, u);
      return;
    }

    // обновляем occupied сразу (логика authoritative)
    state.occupied.delete(cellKey(u.q, u.r));
    state.occupied.add(cellKey(q, r));

    // запоминаем новые q/r (логика)
    u.q = q;
    u.r = r;

    const p = scene.hexToPixel(q, r);

    // если tween не нужен — телепорт
    const tweenMs = Number(opts.tweenMs ?? 0);
    if (!tweenMs || tweenMs <= 0) {
      u.sprite.setPosition(p.x, p.y);
      u.dragHandle?.setPosition(p.x, p.y);
      if (u.art) u.art.setPosition(p.x, p.y);
      u.label.setPosition(p.x, p.y);
      updateHpBar(scene, u);
      return;
    }

    // убиваем прошлый tween движения, если был
    if (u._moveTween) {
      try { u._moveTween.stop(); } catch {}
      u._moveTween = null;
    }

    const targets = [u.sprite, u.dragHandle, u.art, u.label].filter(Boolean);

    // двигаем всех визуалов синхронно
    u._moveTween = scene.tweens.add({
      targets,
      x: p.x,
      y: p.y,
      duration: tweenMs,
      ease: 'Linear',
      onUpdate: () => {
        // hpbar и звёзды рисуются относительно sprite.x/y — перерисовываем
        updateHpBar(scene, u);
      },
      onComplete: () => {
        u._moveTween = null;
        updateHpBar(scene, u);
      }
    });
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
    updateRankStroke(u);
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
    unit.dragHandle?.setPosition(p.x, p.y);
    if (unit.art) unit.art.setPosition(p.x, p.y);
    unit.label.setPosition(p.x, p.y);

    updateHpBar(scene, unit);
    updateRankStroke(unit);
    return true;
  }

  function removeUnit(unit) {
    destroyUnit(unit.id);
  }

  function relayoutUnits() {
    for (const u of state.units) {
      const p = scene.hexToPixel(u.q, u.r);
      u.sprite.setPosition(p.x, p.y);
      u.dragHandle?.setPosition(p.x, p.y);
      if (u.art) u.art.setPosition(p.x, p.y);
      u.label.setPosition(p.x, p.y);
      updateHpBar(scene, u);
      updateRankStroke(u);
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
