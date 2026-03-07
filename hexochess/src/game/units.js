import { updateHpBar } from './hpbar.js';
import Phaser from 'phaser';
import { getUnitArtOffsetXPx, getUnitArtTargetPx, getUnitFootShadowConfig, getUnitGroundLiftPx } from './unitVisualConfig.js';
import { atlasIdleFrame, atlasDeadFrame, UNIT_ATLAS_DEF_BY_TYPE } from './unitAtlasConfig.js';
import { boardDepth, hasBoardCoords } from './depthOrder.js';

export function cellKey(q, r) {
  return `${q},${r}`;
}

function getUnitCellSpanX(unitLike) {
  const raw = Number(unitLike?.cellSpanX ?? NaN);
  if (Number.isFinite(raw)) return Math.max(1, Math.floor(raw));
  const type = String(unitLike?.type ?? '');
  if (type === 'Headless' || type === 'Worm' || type === 'Knight') return 2;
  return 1;
}

function getOccupiedCellKeys(q, r, cellSpanX = 1) {
  const span = Math.max(1, Math.floor(Number(cellSpanX ?? 1)));
  const out = [];
  // Anchor is the rightmost cell for horizontal multi-cell units.
  for (let i = 0; i < span; i++) out.push(cellKey(Number(q) - i, Number(r)));
  return out;
}

function isPlacementFree(occupiedSet, q, r, cellSpanX = 1, ignoreKeys = []) {
  const blocked = new Set(ignoreKeys ?? []);
  const keys = getOccupiedCellKeys(q, r, cellSpanX);
  for (const k of keys) {
    if (blocked.has(k)) continue;
    if (occupiedSet.has(k)) return false;
  }
  return true;
}

const RANK_ICON_SCALE = 0.25;

const UNIT_ART_DEPTH_LIVE = 1040;
const UNIT_ART_DEPTH_DEAD = 990;
const UNIT_ART_DEPTH_Y_FACTOR = 0.01;
const UNIT_ART_DEPTH_X_FACTOR = 0.0002;
const FOOT_SHADOW_COLOR = 0x000000;
const FOOT_SHADOW_ALPHA = 0.48;
const FOOT_SHADOW_STROKE_COLOR = 0x000000;
const FOOT_SHADOW_STROKE_ALPHA = 0.22;
const FOOT_SHADOW_STROKE_WIDTH_PX = 1;

function makeHexHitArea(scene, w, h, cellSpanX = 1) {
  const span = Math.max(1, Math.floor(Number(cellSpanX ?? 1)));
  if (span > 1) {
    // For wide units (e.g. 2 cells), expand hit area left so the unit can be grabbed from both occupied hexes.
    const extraLeft = Math.round(scene.hexSize * 1.9 * (span - 1));
    return new Phaser.Geom.Rectangle(-extraLeft, 0, w + extraLeft, h);
  }

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
  // Board ordering:
  // 1) lower rows (bigger r) are rendered above upper rows
  // 2) inside the same row, right cells are rendered above left cells
  if (hasBoardCoords(unit) && unit.zone !== 'bench') {
    unit.art.setDepth(boardDepth(base, unit.q, unit.r));
    return;
  }

  // Fallback ordering for non-board visuals (bench/temporary states).
  const y = Number(unit.art.y ?? unit.sprite?.y ?? 0);
  const x = Number(unit.art.x ?? unit.sprite?.x ?? 0);
  unit.art.setDepth(base + y * UNIT_ART_DEPTH_Y_FACTOR + x * UNIT_ART_DEPTH_X_FACTOR);
}

function updateFootShadowDepth(unit) {
  if (!unit?.footShadow) return;
  if (unit.dead) {
    unit.footShadow.setVisible(false);
    return;
  }
  unit.footShadow.setVisible(true);
  const base = UNIT_ART_DEPTH_LIVE - 6;
  if (hasBoardCoords(unit) && unit.zone !== 'bench') {
    unit.footShadow.setDepth(boardDepth(base, unit.q, unit.r));
    return;
  }
  const y = Number(unit.footShadow.y ?? unit.art?.y ?? unit.sprite?.y ?? 0);
  const x = Number(unit.footShadow.x ?? unit.art?.x ?? unit.sprite?.x ?? 0);
  unit.footShadow.setDepth(base + y * UNIT_ART_DEPTH_Y_FACTOR + x * UNIT_ART_DEPTH_X_FACTOR);
}

function createFootShadow(scene, x, y, type) {
  const shadowCfg = getUnitFootShadowConfig(type);
  return scene.add.ellipse(
    x + shadowCfg.offsetXPx,
    y + shadowCfg.offsetYPx,
    shadowCfg.widthPx,
    shadowCfg.heightPx,
    FOOT_SHADOW_COLOR,
    FOOT_SHADOW_ALPHA
  )
    .setStrokeStyle(FOOT_SHADOW_STROKE_WIDTH_PX, FOOT_SHADOW_STROKE_COLOR, FOOT_SHADOW_STROKE_ALPHA)
    .setDepth(UNIT_ART_DEPTH_LIVE - 6);
}

function getArtFacingMirrored(unitLike) {
  const explicit = unitLike?._artFacingMirrored;
  if (typeof explicit === 'boolean') return explicit;
  return unitLike?.team === 'enemy';
}

function getUnitArtOffsetByFacing(unitLike) {
  const type = unitLike?.type;
  const mirrored = getArtFacingMirrored(unitLike);
  return getUnitArtOffsetXPx(type, mirrored);
}

function getKnightMirroredAnchorShiftPx(scene, unitLike, q, r) {
  if (String(unitLike?.type ?? '') !== 'Knight') return 0;
  if (!getArtFacingMirrored(unitLike)) return 0;
  const span = getUnitCellSpanX(unitLike);
  if (span <= 1) return 0;

  const lift = getUnitGroundLiftPx(unitLike?.type);
  const anchorGround = scene.hexToGroundPixel(q, r, lift);
  const leftGround = scene.hexToGroundPixel(q - (span - 1), r, lift);
  return Number(anchorGround?.x ?? 0) - Number(leftGround?.x ?? 0);
}

function getUnitArtWorldX(scene, unitLike, q, r) {
  const lift = getUnitGroundLiftPx(unitLike?.type);
  const g = scene.hexToGroundPixel(q, r, lift);
  return Number(g?.x ?? 0)
    + getUnitArtOffsetByFacing(unitLike)
    - getKnightMirroredAnchorShiftPx(scene, unitLike, q, r);
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
    return state.units.find((u) => {
      const span = getUnitCellSpanX(u);
      return getOccupiedCellKeys(u.q, u.r, span).includes(cellKey(q, r));
    }) ?? null;
  }

  function spawnUnitOnBoard(q, r, opts = {}) {
    const cellSpanX = getUnitCellSpanX(opts);
    if (!isPlacementFree(state.occupied, q, r, cellSpanX)) return null;

    const p = scene.hexToPixel(q, r);

    const radius = Math.floor(scene.hexSize * 0.62);
    
    const sprite = scene.add.circle(p.x, p.y, radius, opts.color ?? 0x66ccff)
    .setDepth(1000);

    const w = scene.hexSize * 2;
    const h = scene.hexSize * 2;

    const dragHandle = scene.add.zone(p.x, p.y, w, h).setDepth(1100);
    dragHandle.setDataEnabled();

    const hexArea = makeHexHitArea(scene, w, h, cellSpanX);
    const hitTestCb = (hexArea instanceof Phaser.Geom.Rectangle)
      ? Phaser.Geom.Rectangle.Contains
      : Phaser.Geom.Polygon.Contains;
    dragHandle.setInteractive(hexArea, hitTestCb);
    scene.input.setDraggable(dragHandle, true);

    let art = null;
    let footShadow = null;

    const atlasCfg = UNIT_ATLAS_DEF_BY_TYPE[opts.type] ?? null;
    const atlasKey = atlasCfg?.atlasKey;
    const idleFrame = atlasIdleFrame(atlasCfg);

    if (atlasCfg && scene.textures.exists(atlasKey)) {
      const g = scene.hexToGroundPixel(q, r, getUnitGroundLiftPx(opts.type));
      const p = scene.hexToPixel(q, r);
      footShadow = createFootShadow(scene, p.x, p.y, opts.type);
      art = scene.add.sprite(
        getUnitArtWorldX(scene, { ...opts, q, r, _artFacingMirrored: opts.team === 'enemy' }, q, r),
        g.y,
        atlasKey,
        idleFrame
      )
        .setDepth(UNIT_ART_DEPTH_LIVE)
        .setOrigin(0.5, 1);


      if (art.texture?.key === '__MISSING' || art.frame?.name == null) {
        art.destroy();
        art = null;
        footShadow?.destroy?.();
        footShadow = null;
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
      cellSpanX,

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
      footShadow,
      label,
      hpBar,
      _artFacingMirrored: opts.team === 'enemy',
    };

    if (art) label.setVisible(false);

    state.units.push(unit);
    indexUnit(unit);
    for (const k of getOccupiedCellKeys(q, r, cellSpanX)) state.occupied.add(k);

    updateHpBar(scene, unit);
    updateArtDepth(unit);
    updateFootShadowDepth(unit);
    updateRankStroke(unit);
    return unit;
  }

  function spawnUnitAtScreen(x, y, opts = {}) {
    const cellSpanX = getUnitCellSpanX(opts);
    const radius = Math.floor(scene.hexSize * 0.62);

    const sprite = scene.add.circle(x, y, radius, opts.color ?? 0x66ccff)
      .setDepth(1000);

    const w = scene.hexSize * 2;
    const h = scene.hexSize * 2;

    const dragHandle = scene.add.zone(x, y, w, h).setDepth(1100);
    dragHandle.setDataEnabled();

    const hexArea = makeHexHitArea(scene, w, h, cellSpanX);
    const hitTestCb = (hexArea instanceof Phaser.Geom.Rectangle)
      ? Phaser.Geom.Rectangle.Contains
      : Phaser.Geom.Polygon.Contains;
    dragHandle.setInteractive(hexArea, hitTestCb);
    scene.input.setDraggable(dragHandle, true);

    let art = null;
    let footShadow = null;

    const atlasCfg = UNIT_ATLAS_DEF_BY_TYPE[opts.type] ?? null;
    const atlasKey = atlasCfg?.atlasKey;
    const idleFrame = atlasIdleFrame(atlasCfg);

    if (atlasCfg && scene.textures.exists(atlasKey)) {
      const lift = getUnitGroundLiftPx(opts.type);
      footShadow = createFootShadow(scene, x, y, opts.type);
      art = scene.add.sprite(
        x + getUnitArtOffsetXPx(opts.type, opts.team === 'enemy'),
        y + scene.hexSize - lift,
        atlasKey,
        idleFrame
      )
        .setDepth(UNIT_ART_DEPTH_LIVE)
        .setOrigin(0.5, 1);

      if (art.texture?.key === '__MISSING' || art.frame?.name == null) {
        art.destroy();
        art = null;
        footShadow?.destroy?.();
        footShadow = null;
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
      cellSpanX,

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
      footShadow,
      label,
      hpBar,
      _artFacingMirrored: opts.team === 'enemy',
    };

    if (art) label.setVisible(false);

    state.units.push(unit);
    indexUnit(unit);


    updateHpBar(scene, unit);
    updateArtDepth(unit);
    updateFootShadowDepth(unit);
    updateRankStroke(unit);
    return unit;
  }

  function destroyUnit(id) {
    const u = findUnit(id);
    if (!u) return;

    for (const k of getOccupiedCellKeys(u.q, u.r, getUnitCellSpanX(u))) {
      if (state.occupied.has(k)) state.occupied.delete(k);
    }


    if (u.dragHandle) {
      try { scene.input?.setDraggable?.(u.dragHandle, false); } catch {}
      try { u.dragHandle.disableInteractive?.(); } catch {}
      if (u.dragHandle.input) u.dragHandle.input.enabled = false;
    }

    u.sprite.destroy();
    u.label.destroy();
    u.hpBar.destroy();
    u.art?.destroy();
    u.footShadow?.destroy();
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
    const artX = getUnitArtWorldX(scene, u, q, r);
    const shadowCfg = getUnitFootShadowConfig(u.type);
    const shadowX = p.x + shadowCfg.offsetXPx;
    const shadowY = p.y + shadowCfg.offsetYPx;



    const sameCell = (u.q === q && u.r === r);
    const requestedTweenMs = Number(opts.tweenMs ?? NaN);
    const forceSnapToCell = Number.isFinite(requestedTweenMs) && requestedTweenMs <= 0;
    const isAtTarget =
      Math.abs((u.sprite?.x ?? p.x) - p.x) < 0.5 &&
      Math.abs((u.sprite?.y ?? p.y) - p.y) < 0.5 &&
      Math.abs((u.dragHandle?.x ?? p.x) - p.x) < 0.5 &&
      Math.abs((u.dragHandle?.y ?? p.y) - p.y) < 0.5 &&
      Math.abs((u.label?.x ?? p.x) - p.x) < 0.5 &&
      Math.abs((u.label?.y ?? p.y) - p.y) < 0.5 &&
      Math.abs((u.art?.x ?? artX) - artX) < 0.5 &&
      Math.abs((u.art?.y ?? g.y) - g.y) < 0.5 &&
      Math.abs((u.footShadow?.x ?? shadowX) - shadowX) < 0.5 &&
      Math.abs((u.footShadow?.y ?? shadowY) - shadowY) < 0.5;

    if (sameCell && isAtTarget && !forceSnapToCell) {
      updateHpBar(scene, u);
      return;
    }

    // If the logical cell didn't change and a move tween is already running,
    // do not restart it on every state/event update (prevents jitter/back-and-forth).
    if (sameCell && u._moveTween && !forceSnapToCell) {
      updateHpBar(scene, u);
      return;
    }

    const span = getUnitCellSpanX(u);
    for (const k of getOccupiedCellKeys(u.q, u.r, span)) state.occupied.delete(k);
    for (const k of getOccupiedCellKeys(q, r, span)) state.occupied.add(k);


    u.q = q;
    u.r = r;


    let tweenMs = Number(opts.tweenMs ?? 0);
    if (u.dead) tweenMs = 0;
    if (!tweenMs || tweenMs <= 0) {
      if (u._moveTween) {
        try { u._moveTween.stop(); } catch {}
        u._moveTween = null;
      }
      if (u._artMoveTween) {
        try { u._artMoveTween.stop(); } catch {}
        u._artMoveTween = null;
      }
      if (u._shadowMoveTween) {
        try { u._shadowMoveTween.stop(); } catch {}
        u._shadowMoveTween = null;
      }
      u.sprite.setPosition(p.x, p.y);
      u.dragHandle?.setPosition(p.x, p.y);
      if (u.art) u.art.setPosition(artX, g.y);
      if (u.footShadow) u.footShadow.setPosition(shadowX, shadowY);
      u.label.setPosition(p.x, p.y);
      updateArtDepth(u);
      updateFootShadowDepth(u);
      updateHpBar(scene, u);
      return;
    }


    if (u._moveTween) {
      try { u._moveTween.stop(); } catch {}
      u._moveTween = null;
    }
    if (u._artMoveTween) {
      try { u._artMoveTween.stop(); } catch {}
      u._artMoveTween = null;
    }
    if (u._shadowMoveTween) {
      try { u._shadowMoveTween.stop(); } catch {}
      u._shadowMoveTween = null;
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
      u._artMoveTween = scene.tweens.add({
        targets: u.art,
        x: artX,
        y: g.y,
        duration: tweenMs,
        ease: 'Linear',
        onUpdate: () => updateArtDepth(u),
        onComplete: () => { u._artMoveTween = null; updateArtDepth(u); },
      });
    }
    if (u.footShadow) {
      u._shadowMoveTween = scene.tweens.add({
        targets: u.footShadow,
        x: shadowX,
        y: shadowY,
        duration: tweenMs,
        ease: 'Linear',
        onUpdate: () => updateFootShadowDepth(u),
        onComplete: () => { u._shadowMoveTween = null; updateFootShadowDepth(u); },
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
      if (u.footShadow) u.footShadow.setVisible(false);
      if (u.dragHandle?.input) u.dragHandle.input.enabled = false;
    } else {


      if (u.label) u.label.setVisible(!u.art);
      if (u.footShadow) u.footShadow.setVisible(true);
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
        if (u._artMoveTween) {
          try { u._artMoveTween.stop(); } catch {}
          u._artMoveTween = null;
        }
        if (u._shadowMoveTween) {
          try { u._shadowMoveTween.stop(); } catch {}
          u._shadowMoveTween = null;
        }
        if (deadAnim && scene.anims.exists(deadAnim) && u.art.anims?.getName?.() !== deadAnim) {
          u.art.play(deadAnim);
        } else if (u.art.frame?.name !== atlasDeadFrame(atlasCfg)) {
          u.art.setFrame(atlasDeadFrame(atlasCfg));
        }
      }
      updateArtDepth(u);
      updateFootShadowDepth(u);
    }
  }

  function moveUnit(unit, newQ, newR) {
    const span = getUnitCellSpanX(unit);
    const oldKeys = getOccupiedCellKeys(unit.q, unit.r, span);
    if (!isPlacementFree(state.occupied, newQ, newR, span, oldKeys)) return false;

    for (const k of oldKeys) state.occupied.delete(k);
    for (const k of getOccupiedCellKeys(newQ, newR, span)) state.occupied.add(k);

    unit.q = newQ;
    unit.r = newR;

    const p = scene.hexToPixel(newQ, newR);
    const lift = getUnitGroundLiftPx(unit.type);
    const g = scene.hexToGroundPixel(newQ, newR, lift);
    const artX = getUnitArtWorldX(scene, unit, newQ, newR);
    const shadowCfg = getUnitFootShadowConfig(unit.type);
    const shadowX = p.x + shadowCfg.offsetXPx;
    const shadowY = p.y + shadowCfg.offsetYPx;

    unit.sprite.setPosition(p.x, p.y);
    unit.dragHandle?.setPosition(p.x, p.y);
    if (unit.art) unit.art.setPosition(artX, g.y);
    if (unit.footShadow) unit.footShadow.setPosition(shadowX, shadowY);
    unit.label.setPosition(p.x, p.y);

    updateArtDepth(unit);
    updateFootShadowDepth(unit);
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
      const artX = getUnitArtWorldX(scene, u, u.q, u.r);
      const shadowCfg = getUnitFootShadowConfig(u.type);
      const shadowX = p.x + shadowCfg.offsetXPx;
      const shadowY = p.y + shadowCfg.offsetYPx;

      u.sprite.setPosition(p.x, p.y);
      u.dragHandle?.setPosition(p.x, p.y);
      if (u.art) u.art.setPosition(artX, g.y);
      if (u.footShadow) u.footShadow.setPosition(shadowX, shadowY);
      u.label.setPosition(p.x, p.y);
      updateArtDepth(u);
      updateFootShadowDepth(u);
      updateHpBar(scene, u);
      updateRankStroke(u);
    }
  }

  function update(dt) {
    const lagSpeed = 80;
    const abilityCdFillEpsilon = 0.01;
    const nowMs = Number(scene?.time?.now ?? 0);

    for (const u of state.units) {
      const abilityCdFill = Number(scene.getAbilityCooldownFillForUnit?.(u));
      const needsAbilityCdUi = Number.isFinite(abilityCdFill);
      if (u.hpLag > u.hpInstant) {
        u.hpLag = Math.max(u.hpInstant, u.hpLag - lagSpeed * dt);
        if (needsAbilityCdUi) u._abilityCdLastRenderedFill = abilityCdFill;
        updateHpBar(scene, u);
      } else if (needsAbilityCdUi) {
        const prevFill = Number(u._abilityCdLastRenderedFill ?? NaN);
        const flashUntilMs = Number(u._abilityCdReadyFlashUntilMs ?? 0);
        const inFlashWindow = flashUntilMs > nowMs;
        const castEndAtMs = Number(u._abilityCastEndAtMs ?? NaN);
        const inCastPhase = Number.isFinite(castEndAtMs) && castEndAtMs > nowMs;
        const shouldRedrawCd =
          !Number.isFinite(prevFill) ||
          Math.abs(abilityCdFill - prevFill) >= abilityCdFillEpsilon ||
          abilityCdFill <= 0.001 ||
          abilityCdFill >= 0.999 ||
          inFlashWindow ||
          inCastPhase;
        if (shouldRedrawCd) {
          u._abilityCdLastRenderedFill = abilityCdFill;
          // Ability cooldown bar animates over time even when HP does not change.
          updateHpBar(scene, u);
        }
      } else if (u._abilityCdLastRenderedFill != null) {
        u._abilityCdLastRenderedFill = null;
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


