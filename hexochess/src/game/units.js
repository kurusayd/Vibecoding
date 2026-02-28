import { updateHpBar } from './hpbar.js';
import Phaser from 'phaser';
import { getUnitArtOffsetXPx, getUnitArtTargetPx, getUnitGroundLiftPx } from './unitVisualConfig.js';
import { atlasIdleFrame, atlasDeadFrame, UNIT_ATLAS_DEF_BY_TYPE } from './unitAtlasConfig.js';

export function cellKey(q, r) {
  return `${q},${r}`;
}

const RANK_ICON_SCALE = 0.25;

const UNIT_ART_DEPTH_LIVE = 1040;
const UNIT_ART_DEPTH_DEAD = 990;
const UNIT_ART_DEPTH_ROW_FACTOR = 10;
const UNIT_ART_DEPTH_COL_FACTOR = 0.01;
const UNIT_ART_DEPTH_Y_FACTOR = 0.01;
const UNIT_ART_DEPTH_X_FACTOR = 0.0002;

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


  unit.sprite.setStrokeStyle();

  if (rank === 2) {

    unit.sprite.setStrokeStyle(5, 0x888888, 1);
  }

  if (rank >= 3) {

    unit.sprite.setStrokeStyle(5, 0x888888, 1);



    unit.sprite.setStrokeStyle(10, 0xffcc00, 1);
  }
}

function updateArtDepth(unit) {
  if (!unit?.art) return;
  const base = unit.dead ? UNIT_ART_DEPTH_DEAD : UNIT_ART_DEPTH_LIVE;
  const q = Number(unit.q);
  const r = Number(unit.r);

  // Board ordering:
  // 1) lower rows (bigger r) are rendered above upper rows
  // 2) inside the same row, right cells are rendered above left cells
  if (Number.isFinite(q) && Number.isFinite(r) && unit.zone !== 'bench') {
    const row = r;
    const col = q + Math.floor(r / 2);
    unit.art.setDepth(base + row * UNIT_ART_DEPTH_ROW_FACTOR + col * UNIT_ART_DEPTH_COL_FACTOR);
    return;
  }

  // Fallback ordering for non-board visuals (bench/temporary states).
  const y = Number(unit.art.y ?? unit.sprite?.y ?? 0);
  const x = Number(unit.art.x ?? unit.sprite?.x ?? 0);
  unit.art.setDepth(base + y * UNIT_ART_DEPTH_Y_FACTOR + x * UNIT_ART_DEPTH_X_FACTOR);
}

export function createUnitSystem(scene) {
  const state = {
    units: [],
    unitsById: new Map(),
    occupied: new Set(),
  };

  function indexUnit(unit) {
    if (!unit) return;
    state.unitsById.set(unit.id, unit);
  }

  function unindexUnit(unitId) {
    state.unitsById.delete(unitId);
  }

  function findUnit(id) {
    return state.unitsById.get(id) ?? null;
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


    const w = scene.hexSize * 2;
    const h = scene.hexSize * 2;

    const dragHandle = scene.add.zone(p.x, p.y, w, h).setDepth(1100);
    dragHandle.setDataEnabled();

    const hexArea = makeHexHitArea(scene, w, h);
    dragHandle.setInteractive(hexArea, Phaser.Geom.Polygon.Contains);
    scene.input.setDraggable(dragHandle, true);

    let art = null;

    const atlasCfg = UNIT_ATLAS_DEF_BY_TYPE[opts.type] ?? null;
    const atlasKey = atlasCfg?.atlasKey;
    const idleFrame = atlasIdleFrame(atlasCfg);

    if (atlasCfg && scene.textures.exists(atlasKey)) {
      const g = scene.hexToGroundPixel(q, r, getUnitGroundLiftPx(opts.type));
      art = scene.add.sprite(g.x + getUnitArtOffsetXPx(opts.type, opts.team), g.y, atlasKey, idleFrame)
        .setDepth(UNIT_ART_DEPTH_LIVE)
        .setOrigin(0.5, 1);


      if (art.texture?.key === '__MISSING' || art.frame?.name == null) {
        art.destroy();
        art = null;
        sprite.setVisible(true);
      } else {
        const frameW = art.frame?.realWidth ?? art.frame?.width ?? 256;
        const targetPx = getUnitArtTargetPx(opts.type);
        art.setScale(targetPx / frameW);
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


    const rankIcon = scene.add.image(p.x, p.y, rankKey)
      .setDepth(1070)
      .setOrigin(0.5, 1)
      .setScale(RANK_ICON_SCALE);
      rankIcon.setVisible(false);

    const unit = {
      id: opts.id ?? crypto.randomUUID?.() ?? String(Date.now()),

      q, r,
      team: opts.team ?? 'neutral',
      type: opts.type ?? null,

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
    indexUnit(unit);
    state.occupied.add(key);

    updateHpBar(scene, unit);
    updateArtDepth(unit);
    updateRankStroke(unit);
    return unit;
  }

  function spawnUnitAtScreen(x, y, opts = {}) {
    const radius = Math.floor(scene.hexSize * 0.62);

    const sprite = scene.add.circle(x, y, radius, opts.color ?? 0x66ccff)
      .setDepth(1000);


    const w = scene.hexSize * 2;
    const h = scene.hexSize * 2;

    const dragHandle = scene.add.zone(x, y, w, h).setDepth(1100);
    dragHandle.setDataEnabled();

    const hexArea = makeHexHitArea(scene, w, h);
    dragHandle.setInteractive(hexArea, Phaser.Geom.Polygon.Contains);
    scene.input.setDraggable(dragHandle, true);

    let art = null;

    const atlasCfg = UNIT_ATLAS_DEF_BY_TYPE[opts.type] ?? null;
    const atlasKey = atlasCfg?.atlasKey;
    const idleFrame = atlasIdleFrame(atlasCfg);

    if (atlasCfg && scene.textures.exists(atlasKey)) {
      const lift = getUnitGroundLiftPx(opts.type);
      art = scene.add.sprite(x + getUnitArtOffsetXPx(opts.type, opts.team), y + scene.hexSize - lift, atlasKey, idleFrame)
        .setDepth(UNIT_ART_DEPTH_LIVE)
        .setOrigin(0.5, 1);

      if (art.texture?.key === '__MISSING' || art.frame?.name == null) {
        art.destroy();
        art = null;
        sprite.setVisible(true);
      } else {
        const frameW = art.frame?.realWidth ?? art.frame?.width ?? 256;
        const targetPx = getUnitArtTargetPx(opts.type);
        art.setScale(targetPx / frameW);
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
    rankIcon.setVisible(false);

    const unit = {
      id: opts.id ?? crypto.randomUUID?.() ?? String(Date.now()),

      q: opts.q ?? 0,
      r: opts.r ?? 0,
      team: opts.team ?? 'neutral',
      type: opts.type ?? null,

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
    indexUnit(unit);


    updateHpBar(scene, unit);
    updateArtDepth(unit);
    updateRankStroke(unit);
    return unit;
  }

  function destroyUnit(id) {
    const u = findUnit(id);
    if (!u) return;


    const k = cellKey(u.q, u.r);
    if (state.occupied.has(k)) state.occupied.delete(k);


    u.sprite.destroy();
    u.label.destroy();
    u.hpBar.destroy();
    u.art?.destroy();
    u.dragHandle?.destroy();
    u.rankIcon?.destroy(); 

    unindexUnit(id);
    state.units = state.units.filter(x => x.id !== id);
  }

  function setUnitPos(id, q, r, opts = {}) {
    const u = findUnit(id);
    if (!u) return;

    const p = scene.hexToPixel(q, r);
    const lift = getUnitGroundLiftPx(u.type);
    const g = scene.hexToGroundPixel(q, r, lift);
    const artX = g.x + getUnitArtOffsetXPx(u.type, u.team);



    const sameCell = (u.q === q && u.r === r);
    const isAtTarget =
      Math.abs((u.sprite?.x ?? p.x) - p.x) < 0.5 &&
      Math.abs((u.sprite?.y ?? p.y) - p.y) < 0.5 &&
      Math.abs((u.dragHandle?.x ?? p.x) - p.x) < 0.5 &&
      Math.abs((u.dragHandle?.y ?? p.y) - p.y) < 0.5 &&
      Math.abs((u.label?.x ?? p.x) - p.x) < 0.5 &&
      Math.abs((u.label?.y ?? p.y) - p.y) < 0.5 &&
      Math.abs((u.art?.x ?? artX) - artX) < 0.5 &&
      Math.abs((u.art?.y ?? g.y) - g.y) < 0.5;

    if (sameCell && isAtTarget) {
      updateHpBar(scene, u);
      return;
    }


    state.occupied.delete(cellKey(u.q, u.r));
    state.occupied.add(cellKey(q, r));


    u.q = q;
    u.r = r;


    const tweenMs = Number(opts.tweenMs ?? 0);
    if (!tweenMs || tweenMs <= 0) {
      u.sprite.setPosition(p.x, p.y);
      u.dragHandle?.setPosition(p.x, p.y);
      if (u.art) u.art.setPosition(artX, g.y);
      u.label.setPosition(p.x, p.y);
      updateArtDepth(u);
      updateHpBar(scene, u);
      return;
    }


    if (u._moveTween) {
      try { u._moveTween.stop(); } catch {}
      u._moveTween = null;
    }


    const centerTargets = [u.sprite, u.dragHandle, u.label].filter(Boolean);


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
        x: artX,
        y: g.y,
        duration: tweenMs,
        ease: 'Linear',
        onUpdate: () => updateArtDepth(u),
        onComplete: () => updateArtDepth(u),
      });
    }
  }

  function setUnitHp(id, hp, maxHp) {
    const u = findUnit(id);
    if (!u) return;

    if (typeof maxHp === 'number') u.maxHp = maxHp;
    u.hp = Math.max(0, Math.min(hp, u.maxHp));


    u.hpInstant = u.hp;



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


      if (u.label) u.label.setVisible(!u.art);
      if (u.dragHandle?.input) u.dragHandle.input.enabled = true;
    }

    if (u.art) {
      const atlasCfg = UNIT_ATLAS_DEF_BY_TYPE[u.type] ?? null;
      const deadAnim = atlasCfg?.deadAnim ?? null;

      if (nextDead) {
        if (u._moveTween) {
          try { u._moveTween.stop(); } catch {}
          u._moveTween = null;
        }
        if (deadAnim && scene.anims.exists(deadAnim) && u.art.anims?.getName?.() !== deadAnim) {
          u.art.play(deadAnim);
        } else if (u.art.frame?.name !== atlasDeadFrame(atlasCfg)) {
          u.art.setFrame(atlasDeadFrame(atlasCfg));
        }
      }
      updateArtDepth(u);
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
    const lift = getUnitGroundLiftPx(unit.type);
    const g = scene.hexToGroundPixel(newQ, newR, lift);
    const artX = g.x + getUnitArtOffsetXPx(unit.type, unit.team);

    unit.sprite.setPosition(p.x, p.y);
    unit.dragHandle?.setPosition(p.x, p.y);
    if (unit.art) unit.art.setPosition(artX, g.y);
    unit.label.setPosition(p.x, p.y);

    updateArtDepth(unit);
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
      const lift = getUnitGroundLiftPx(u.type);
      const g = scene.hexToGroundPixel(u.q, u.r, lift);
      const artX = g.x + getUnitArtOffsetXPx(u.type, u.team);

      u.sprite.setPosition(p.x, p.y);
      u.dragHandle?.setPosition(p.x, p.y);
      if (u.art) u.art.setPosition(artX, g.y);
      u.label.setPosition(p.x, p.y);
      updateArtDepth(u);
      updateHpBar(scene, u);
      updateRankStroke(u);
    }
  }

  function update(dt) {
    const lagSpeed = 80;

    for (const u of state.units) {
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

