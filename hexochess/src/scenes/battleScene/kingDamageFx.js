import Phaser from 'phaser';
import { getUnitArtOffsetXPx, getUnitGroundLiftPx } from '../../game/unitVisualConfig.js';

export const KING_DAMAGE_FX = {
  sourceYOffsetPx: -25,
  startScaleMul: 1.2,
  bounceScaleMul: 1.5,
  sequenceDelayMs: 53,
  bounceDurationMs: 128,
  targetSpreadPx: 20,
  midXJitterPx: 16,
  arcBaseMin: 35,
  arcBaseMax: 95,
  arcHeightFactor: 0.18,
  flightDurationMs: 744,
  starShowAlpha: 0.98,
  starFlightAlpha: 0.9,
  impactBounceMul: 1.25,
  impactBounceMinAdd: 0.02,
  impactBounceDurationMs: 70,
  trail: {
    emitZone: { x: -3, y: -5, w: 6, h: 10 },
    frequencyMs: 18,
    quantity: 4,
    lifespan: { min: 280, max: 460 },
    speedX: { min: -10, max: 10 },
    speedY: { min: 8, max: 26 },
    gravityY: 120,
    scale: { start: 0.28, end: 0.04 },
    alpha: { start: 0.8, end: 0 },
    blendMode: 'ADD',
    depth: 10049,
    destroyDelayMs: 180,
  },
  impactBurst: {
    lifespan: { min: 220, max: 380 },
    speed: { min: 80, max: 230 },
    angle: { min: 0, max: 360 },
    gravityY: 120,
    scale: { start: 0.42, end: 0.05 },
    alpha: { start: 1, end: 0 },
    blendMode: 'ADD',
    depth: 10060,
    count: 26,
    destroyDelayMs: 430,
  },
};

export function installBattleSceneKingDamageFx(BattleScene) {
  BattleScene.prototype.collectWinnerStarLaunchPoints = function collectWinnerStarLaunchPoints(state, winnerTeam, count) {
    const units = (state?.units ?? []).filter((u) =>
      u?.zone === 'board' &&
      !u?.dead &&
      u?.team === winnerTeam
    );
    if (!units.length || count <= 0) return [];

    const points = [];
    for (const u of units) {
      const rank = Math.max(1, Number(u.rank ?? 1));
      const vu = this.unitSys?.findUnit?.(u.id);
      let px = vu?.rankIcon?.x ?? vu?.art?.x ?? vu?.sprite?.x ?? null;
      let py = vu?.rankIcon?.y ?? vu?.art?.y ?? vu?.sprite?.y ?? null;
      if (Number.isFinite(py)) py += KING_DAMAGE_FX.sourceYOffsetPx;

      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        const g = this.hexToGroundPixel(u?.q ?? 0, u?.r ?? 0, getUnitGroundLiftPx(u?.type));
        px = g.x + getUnitArtOffsetXPx(u?.type, u?.team);
        py = g.y;
      }

      const rankKey = `rank${rank}`;
      const baseScale = Number(vu?.rankIcon?.scaleX ?? 0.25);
      for (let i = 0; i < rank; i++) {
        points.push({ x: px, y: py, rankKey, baseScale });
      }
    }

    if (!points.length) return [];
    while (points.length < count) {
      const p = points[Math.floor(Math.random() * points.length)];
      points.push({ ...p });
    }
    return points.slice(0, count);
  };

  BattleScene.prototype.playKingDamageStarsFx = function playKingDamageStarsFx({ loserSide, winnerTeam, damage, state, onFirstHit, onComplete }) {
    const done = () => {
      if (typeof onComplete === 'function') onComplete();
    };
    const targetKing = loserSide === 'player' ? this.kingLeft : this.kingRight;
    if (!targetKing || damage <= 0) {
      done();
      return;
    }

    const starts = this.collectWinnerStarLaunchPoints(state, winnerTeam, damage);
    if (!starts.length) {
      this.time.delayedCall(250, done);
      return;
    }

    let alive = starts.length;
    let firstHitFired = false;
    const finishOne = () => {
      alive -= 1;
      if (alive <= 0) done();
    };

    starts.forEach((p, idx) => {
      const baseScale = Number(p?.baseScale ?? 0.25);
      const startScale = Math.max(0.08, baseScale * KING_DAMAGE_FX.startScaleMul);
      const bounceScale = Math.max(startScale, baseScale * KING_DAMAGE_FX.bounceScaleMul);
      const sequenceDelay = idx * KING_DAMAGE_FX.sequenceDelayMs;
      const star = this.add.image(p.x, p.y, p?.rankKey ?? 'rank1')
        .setScale(startScale)
        .setDepth(10050)
        .setAlpha(KING_DAMAGE_FX.starShowAlpha)
        .setVisible(false);

      this.tweens.add({
        targets: star,
        scaleX: bounceScale,
        scaleY: bounceScale,
        delay: sequenceDelay,
        duration: KING_DAMAGE_FX.bounceDurationMs,
        ease: 'Quad.Out',
        yoyo: true,
        onStart: () => {
          if (star?.active) star.setVisible(true);
        },
        onComplete: () => {
          if (!star?.active) {
            finishOne();
            return;
          }

          this.tweens.add({
            targets: star,
            alpha: KING_DAMAGE_FX.starFlightAlpha,
            duration: 1,
            onComplete: () => {
              if (!star?.active) {
                finishOne();
                return;
              }

              const trailFx = this.add.particles(0, 0, 'particleStar', {
                follow: star,
                emitZone: {
                  type: 'random',
                  source: new Phaser.Geom.Rectangle(
                    KING_DAMAGE_FX.trail.emitZone.x,
                    KING_DAMAGE_FX.trail.emitZone.y,
                    KING_DAMAGE_FX.trail.emitZone.w,
                    KING_DAMAGE_FX.trail.emitZone.h
                  ),
                },
                frequency: KING_DAMAGE_FX.trail.frequencyMs,
                quantity: KING_DAMAGE_FX.trail.quantity,
                lifespan: KING_DAMAGE_FX.trail.lifespan,
                speedX: KING_DAMAGE_FX.trail.speedX,
                speedY: KING_DAMAGE_FX.trail.speedY,
                gravityY: KING_DAMAGE_FX.trail.gravityY,
                scale: KING_DAMAGE_FX.trail.scale,
                alpha: KING_DAMAGE_FX.trail.alpha,
                blendMode: KING_DAMAGE_FX.trail.blendMode,
              });
              if (trailFx?.setDepth) trailFx.setDepth(KING_DAMAGE_FX.trail.depth);
              const disposeTrailFx = () => {
                if (!trailFx) return;
                trailFx.stop?.();
                trailFx.killAll?.();
                this.time.delayedCall(KING_DAMAGE_FX.trail.destroyDelayMs, () => trailFx.destroy?.());
              };

              const targetX = targetKing.x + Phaser.Math.Between(-KING_DAMAGE_FX.targetSpreadPx, KING_DAMAGE_FX.targetSpreadPx);
              const targetY = targetKing.y + Phaser.Math.Between(-KING_DAMAGE_FX.targetSpreadPx, KING_DAMAGE_FX.targetSpreadPx);
              const startX = star.x;
              const startY = star.y;

              const midX = (startX + targetX) / 2 + Phaser.Math.Between(-KING_DAMAGE_FX.midXJitterPx, KING_DAMAGE_FX.midXJitterPx);
              const arcBase = Math.max(
                KING_DAMAGE_FX.arcBaseMin,
                Math.min(KING_DAMAGE_FX.arcBaseMax, Math.abs(targetX - startX) * KING_DAMAGE_FX.arcHeightFactor)
              );
              const midY = Math.min(startY, targetY) - arcBase;

              const flightProxy = { t: 0 };
              this.tweens.add({
                targets: flightProxy,
                t: 1,
                duration: KING_DAMAGE_FX.flightDurationMs,
                ease: 'Cubic.In',
                onUpdate: () => {
                  if (!star?.active) return;
                  const t = Phaser.Math.Clamp(Number(flightProxy.t ?? 0), 0, 1);
                  const inv = 1 - t;
                  const x = (inv * inv * startX) + (2 * inv * t * midX) + (t * t * targetX);
                  const y = (inv * inv * startY) + (2 * inv * t * midY) + (t * t * targetY);
                  star.setPosition(x, y);
                },
                onComplete: () => {
                  if (!firstHitFired) {
                    firstHitFired = true;
                    if (typeof onFirstHit === 'function') onFirstHit();
                  }
                  if (!star?.active) {
                    disposeTrailFx();
                    finishOne();
                    return;
                  }
                  disposeTrailFx();

                  const hitFx = this.add.particles(0, 0, 'particleStar', {
                    emitting: false,
                    lifespan: KING_DAMAGE_FX.impactBurst.lifespan,
                    speed: KING_DAMAGE_FX.impactBurst.speed,
                    angle: KING_DAMAGE_FX.impactBurst.angle,
                    gravityY: KING_DAMAGE_FX.impactBurst.gravityY,
                    scale: KING_DAMAGE_FX.impactBurst.scale,
                    alpha: KING_DAMAGE_FX.impactBurst.alpha,
                    blendMode: KING_DAMAGE_FX.impactBurst.blendMode,
                  });
                  if (hitFx?.setDepth) hitFx.setDepth(KING_DAMAGE_FX.impactBurst.depth);
                  hitFx?.emitParticleAt?.(star.x, star.y, KING_DAMAGE_FX.impactBurst.count);
                  this.time.delayedCall(KING_DAMAGE_FX.impactBurst.destroyDelayMs, () => hitFx?.destroy?.());

                  const impactScale = Math.max(
                    startScale * KING_DAMAGE_FX.impactBounceMul,
                    startScale + KING_DAMAGE_FX.impactBounceMinAdd
                  );
                  this.tweens.add({
                    targets: star,
                    scaleX: impactScale,
                    scaleY: impactScale,
                    duration: KING_DAMAGE_FX.impactBounceDurationMs,
                    ease: 'Quad.Out',
                    yoyo: true,
                    onComplete: () => {
                      if (star?.active) star.destroy();
                      finishOne();
                    },
                  });
                },
              });
            },
          });
        },
      });
    });
  };

  BattleScene.prototype.maybeStartKingDamageFx = function maybeStartKingDamageFx(prevState, nextState, { resultChanged }) {
    if (!resultChanged) return;
    if ((nextState?.phase ?? null) !== 'battle') return;
    if (!nextState?.result) return;

    const prevPlayerHp = Number(prevState?.kings?.player?.hp ?? 0);
    const nextPlayerHp = Number(nextState?.kings?.player?.hp ?? 0);
    const prevEnemyHp = Number(prevState?.kings?.enemy?.hp ?? 0);
    const nextEnemyHp = Number(nextState?.kings?.enemy?.hp ?? 0);

    const playerDamage = Math.max(0, prevPlayerHp - nextPlayerHp);
    const enemyDamage = Math.max(0, prevEnemyHp - nextEnemyHp);
    if (playerDamage <= 0 && enemyDamage <= 0) return;

    const token = ++this.kingDamageFxToken;

    if (enemyDamage > 0) {
      this.kingHpLock.enemy = prevEnemyHp;
      this.drawKingHpBars();
      this.playKingDamageStarsFx({
        loserSide: 'enemy',
        winnerTeam: 'player',
        damage: enemyDamage,
        state: nextState,
        onFirstHit: () => {
          if (token !== this.kingDamageFxToken) return;
          this.kingHpLock.enemy = null;
          this.drawKingHpBars();
        },
        onComplete: () => {
          if (token !== this.kingDamageFxToken) return;
          this.kingHpLock.enemy = null;
          this.drawKingHpBars();
        },
      });
      return;
    }

    this.kingHpLock.player = prevPlayerHp;
    this.drawKingHpBars();
    this.playKingDamageStarsFx({
      loserSide: 'player',
      winnerTeam: 'enemy',
      damage: playerDamage,
      state: nextState,
      onFirstHit: () => {
        if (token !== this.kingDamageFxToken) return;
        this.kingHpLock.player = null;
        this.drawKingHpBars();
      },
      onComplete: () => {
        if (token !== this.kingDamageFxToken) return;
        this.kingHpLock.player = null;
        this.drawKingHpBars();
      },
    });
  };
}
