import { updateHpBar } from './hpbar.js';
import Phaser from 'phaser';

export function cellKey(q, r) {
  return `${q},${r}`;
}

const RANK_ICON_SCALE = 0.10; //скейл размера иконки звёздочки. Чтобы менять в одном месте
const SWORDSMAN_ART_PX = 170; // целевая "высота/ширина" на экране, подгони: 90..140
// Насколько ПОДНЯТЬ "землю" для мечника (потому что в кадре много прозрачного снизу)
// Подбирай: 0..80. Если мечник низко — УВЕЛИЧЬ.
const GROUND_LIFT_BY_TYPE = {
  Swordsman: 100,
  Crossbowman: 100,
  Knight: 100,
};

const UNIT_ATLAS_BY_TYPE = {
  Swordsman: {
    atlasKey: 'sworman_atlas',
    idleAnim: 'swordman_idle',
    walkAnim: 'swordman_walk',
    deadAnim: 'swordman_dead',
  },
  Crossbowman: {
    atlasKey: 'crossbowman_atlas',
    idleAnim: 'crossbowman_idle',
    walkAnim: 'crossbowman_walk',
    deadAnim: 'crossbowman_dead',
  },
  Knight: {
    atlasKey: 'knight_atlas',
    idleAnim: 'knight_idle',
    walkAnim: 'knight_walk',
    deadAnim: 'knight_dead',
  },
};

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

    const atlasCfg = UNIT_ATLAS_BY_TYPE[opts.type] ?? null;
    const atlasKey = atlasCfg?.atlasKey;
    const idleFrame = 'psd_animation/idle.png';

    if (atlasCfg && scene.textures.exists(atlasKey)) {
      const g = scene.hexToGroundPixel(q, r, GROUND_LIFT_BY_TYPE[opts.type] ?? 0);
      art = scene.add.sprite(g.x, g.y, atlasKey, idleFrame) // ✅ было p.x/p.y
        .setDepth(1050)
        .setOrigin(0.5, 1);

      // ✅ если вдруг всё равно missing (например race condition) — откатываемся на круг
      if (art.texture?.key === '__MISSING' || art.frame?.name == null) {
        art.destroy();
        art = null;
        sprite.setVisible(true);
      } else {
        const frameW = art.frame?.realWidth ?? art.frame?.width ?? 256;
        art.setScale(SWORDSMAN_ART_PX / frameW);

        if (scene.anims.exists(atlasCfg.idleAnim)) art.play(atlasCfg.idleAnim);
        else if (scene.anims.exists(atlasCfg.walkAnim)) art.play(atlasCfg.walkAnim);
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
      type: opts.type ?? null, // ✅ ВОТ ЭТОГО НЕ ХВАТАЛО

      hp,
      maxHp,
      hpInstant: hp,
      hpLag: hp,
      rank,
      dead: Boolean(opts.dead ?? false),
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

    const atlasCfg = UNIT_ATLAS_BY_TYPE[opts.type] ?? null;
    const atlasKey = atlasCfg?.atlasKey;
    const idleFrame = 'psd_animation/idle.png';

    if (atlasCfg && scene.textures.exists(atlasKey)) {
      const lift = GROUND_LIFT_BY_TYPE[opts.type] ?? 0;
      art = scene.add.sprite(x, y + scene.hexSize - lift, atlasKey, idleFrame) // ✅ вниз к "земле" этого гекса
        .setDepth(1050)
        .setOrigin(0.5, 1); // ✅ якорь по низу

      if (art.texture?.key === '__MISSING' || art.frame?.name == null) {
        art.destroy();
        art = null;
        sprite.setVisible(true);
      } else {
        const frameW = art.frame?.realWidth ?? art.frame?.width ?? 256;
        art.setScale(SWORDSMAN_ART_PX / frameW);

        if (scene.anims.exists(atlasCfg.idleAnim)) art.play(atlasCfg.idleAnim);
        else if (scene.anims.exists(atlasCfg.walkAnim)) art.play(atlasCfg.walkAnim);

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

      q: opts.q ?? 0,
      r: opts.r ?? 0,
      team: opts.team ?? 'neutral',
      type: opts.type ?? null, // ✅ ВОТ ЭТОГО ТОЖЕ НЕ ХВАТАЛО

      hp,
      maxHp,

      hpInstant: hp,
      hpLag: hp,
      rank,
      dead: Boolean(opts.dead ?? false),
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

    const p = scene.hexToPixel(q, r);
    const lift = GROUND_LIFT_BY_TYPE[u.type] ?? 0;
    const g = scene.hexToGroundPixel(q, r, lift);

    // Если координаты совпадают, но визуально объект "уехал" (например, из-за гонки
    // локального дропа и серверного state), всё равно нужно дотянуть его в правильную точку.
    const sameCell = (u.q === q && u.r === r);
    const isAtTarget =
      Math.abs((u.sprite?.x ?? p.x) - p.x) < 0.5 &&
      Math.abs((u.sprite?.y ?? p.y) - p.y) < 0.5 &&
      Math.abs((u.dragHandle?.x ?? p.x) - p.x) < 0.5 &&
      Math.abs((u.dragHandle?.y ?? p.y) - p.y) < 0.5 &&
      Math.abs((u.label?.x ?? p.x) - p.x) < 0.5 &&
      Math.abs((u.label?.y ?? p.y) - p.y) < 0.5 &&
      Math.abs((u.art?.x ?? g.x) - g.x) < 0.5 &&
      Math.abs((u.art?.y ?? g.y) - g.y) < 0.5;

    if (sameCell && isAtTarget) {
      updateHpBar(scene, u);
      return;
    }

    // обновляем occupied сразу (логика authoritative)
    state.occupied.delete(cellKey(u.q, u.r));
    state.occupied.add(cellKey(q, r));

    // запоминаем новые q/r (логика)
    u.q = q;
    u.r = r;

    // если tween не нужен — телепорт
    const tweenMs = Number(opts.tweenMs ?? 0);
    if (!tweenMs || tweenMs <= 0) {
      u.sprite.setPosition(p.x, p.y);
      u.dragHandle?.setPosition(p.x, p.y);
      if (u.art) u.art.setPosition(g.x, g.y);   // ✅ art на земле
      u.label.setPosition(p.x, p.y);
      updateHpBar(scene, u);
      return;
    }

    // убиваем прошлый tween движения, если был
    if (u._moveTween) {
      try { u._moveTween.stop(); } catch {}
      u._moveTween = null;
    }

    // ✅ твиним центр для sprite/dragHandle/label
    const centerTargets = [u.sprite, u.dragHandle, u.label].filter(Boolean);

    // ✅ арту твиним отдельно к g
    u._moveTween = scene.tweens.add({
      targets: centerTargets,
      x: p.x,
      y: p.y,
      duration: tweenMs,
      ease: 'Linear',
      onUpdate: () => updateHpBar(scene, u),
      onComplete: () => { u._moveTween = null; updateHpBar(scene, u); }
    });

    if (u.art) {
      scene.tweens.add({
        targets: u.art,
        x: g.x,
        y: g.y,
        duration: tweenMs,
        ease: 'Linear',
      });
    }
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

  function setUnitDead(id, dead) {
    const u = findUnit(id);
    if (!u) return;

    const nextDead = Boolean(dead);
    u.dead = nextDead;

    if (nextDead) {
      if (u.hpBar) u.hpBar.setVisible(false);
      if (u.rankIcon) u.rankIcon.setVisible(false);
      if (u.label) u.label.setVisible(false);
      if (u.dragHandle?.input) u.dragHandle.input.enabled = false;
    } else {
      // Для "живого" юнита не форсим hp/rank visibility:
      // их видимость управляется renderFromState + updateHpBar (phase/zone).
      if (u.label) u.label.setVisible(!u.art);
      if (u.dragHandle?.input) u.dragHandle.input.enabled = true;
    }

    if (u.art) {
      const atlasCfg = UNIT_ATLAS_BY_TYPE[u.type] ?? null;
      const deadAnim = atlasCfg?.deadAnim ?? null;

      if (nextDead) {
        if (u._moveTween) {
          try { u._moveTween.stop(); } catch {}
          u._moveTween = null;
        }
        if (deadAnim && scene.anims.exists(deadAnim) && u.art.anims?.getName?.() !== deadAnim) {
          u.art.play(deadAnim);
        } else if (u.art.frame?.name !== 'psd_animation/dead.png') {
          u.art.setFrame('psd_animation/dead.png');
        }
      }
    }
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
    const lift = GROUND_LIFT_BY_TYPE[unit.type] ?? 0;
    const g = scene.hexToGroundPixel(newQ, newR, lift);

    unit.sprite.setPosition(p.x, p.y);
    unit.dragHandle?.setPosition(p.x, p.y);
    if (unit.art) unit.art.setPosition(g.x, g.y);
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
      const lift = GROUND_LIFT_BY_TYPE[u.type] ?? 0;
      const g = scene.hexToGroundPixel(u.q, u.r, lift);

      u.sprite.setPosition(p.x, p.y);
      u.dragHandle?.setPosition(p.x, p.y);
      if (u.art) u.art.setPosition(g.x, g.y);
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
    setUnitDead,
    moveUnit,
    removeUnit,
    relayoutUnits,
    update,
  };
}
