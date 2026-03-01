import {
  createBattleState,
  addUnit as coreAddUnit,
  moveUnit as coreMoveUnit,
  attack as coreAttack,
  getUnitAt as coreGetUnitAt,
  hexDistance as coreHexDistance,
} from '../../../shared/battleCore.js';
import { UNIT_CATALOG as SHARED_UNIT_CATALOG } from '../../../shared/unitCatalog.js';

const TEST_SCENE_TICK_MS = 100;
const TEST_SCENE_RESTART_DELAY_MS = 500;
const TEST_SCENE_PLAYER_SPAWN = { q: 3, r: 4 };
const TEST_SCENE_ENEMY_SPAWN = { q: 7, r: 4 };
const TEST_SCENE_DEFAULT_ATTACK_SPEED = 1;
const TEST_SCENE_DEFAULT_MOVE_SPEED = 1;
const TEST_SCENE_MAX_ACTIONS_PER_UNIT_PER_TICK = 8;

export const TEST_SCENE_UNITS = SHARED_UNIT_CATALOG.map((u) => ({ ...u }));

const TEST_SCENE_NEIGHBORS = [
  { dq: 1, dr: 0 },
  { dq: 1, dr: -1 },
  { dq: 0, dr: -1 },
  { dq: -1, dr: 0 },
  { dq: -1, dr: 1 },
  { dq: 0, dr: 1 },
];

export function installBattleSceneTestScene(BattleScene) {
  Object.assign(BattleScene.prototype, {
    isInsideBoardCell(q, r) {
      if (r < 0 || r >= this.gridRows) return false;
      const col = q + Math.floor(r / 2);
      return col >= 0 && col < this.gridCols;
    },

    createTestSceneState() {
      const s = createBattleState();
      s.phase = 'prep';
      s.result = null;
      if (s.kings?.enemy) s.kings.enemy.visible = true;
      if (s.kings?.player) s.kings.player.coins = 0;
      if (s.kings?.enemy) s.kings.enemy.coins = 0;
      s.shop = { offers: [] };
      s.round = 0;
      s.prepSecondsLeft = 0;
      s.battleSecondsLeft = 0;
      return s;
    },

    getTestUnitTemplate(type) {
      return TEST_SCENE_UNITS.find((u) => u.type === type) ?? TEST_SCENE_UNITS[0];
    },

    addTestSceneUnit(state, { id, team, q, r, type, rank = 1 }) {
      const base = this.getTestUnitTemplate(type);
      if (!base) return null;
      const safeRank = Math.max(1, Math.min(3, Number(rank ?? 1)));
      const mult = Math.pow(2, safeRank - 1);
      const hp = Math.max(1, Math.round(Number(base.hp ?? 1) * mult));
      const atk = Math.max(1, Math.round(Number(base.atk ?? 1) * mult));
      coreAddUnit(state, {
        id,
        q,
        r,
        hp,
        maxHp: hp,
        atk,
        team,
        type: base.type,
        powerType: base.powerType,
        abilityType: base.abilityType ?? 'none',
        abilityKey: base.abilityKey ?? null,
        rank: safeRank,
        zone: 'board',
        benchSlot: null,
        attackSpeed: base.attackSpeed ?? TEST_SCENE_DEFAULT_ATTACK_SPEED,
        moveSpeed: base.moveSpeed ?? TEST_SCENE_DEFAULT_MOVE_SPEED,
        attackRangeMax: base.attackRangeMax ?? 1,
        attackRangeFullDamage: base.attackRangeFullDamage ?? (base.attackRangeMax ?? 1),
        attackSeq: 0,
        dead: false,
      });
      return state.units.find((u) => u.id === id) ?? null;
    },

    refreshFromLocalBattleState() {
      this.renderFromState();
      this.drawGrid();
      this.syncPhaseUI();
      this.syncKingsUI();
      this.syncShopUI();
      this.refreshAllDraggable();
    },

    stopTestSceneBattleLoop() {
      try { this.testSceneBattleLoop?.remove?.(false); } catch {}
      this.testSceneBattleLoop = null;
    },

    stopTestSceneRestartTimer() {
      try { this.testSceneRestartTimer?.remove?.(false); } catch {}
      this.testSceneRestartTimer = null;
    },

    captureTestSceneBattleStartSnapshot() {
      if (!this.testSceneActive || !this.battleState) return null;
      return (this.battleState.units ?? [])
        .filter((u) => u.zone === 'board' && (u.team === 'player' || u.team === 'enemy'))
        .map((u) => ({
          id: u.id,
          team: u.team,
          type: u.type,
          q: u.q,
          r: u.r,
          hp: u.maxHp ?? u.hp,
          maxHp: u.maxHp ?? u.hp,
          atk: u.atk,
          attackSpeed: u.attackSpeed ?? TEST_SCENE_DEFAULT_ATTACK_SPEED,
          moveSpeed: u.moveSpeed ?? TEST_SCENE_DEFAULT_MOVE_SPEED,
          attackRangeMax: u.attackRangeMax ?? 1,
          attackRangeFullDamage: u.attackRangeFullDamage ?? (u.attackRangeMax ?? 1),
          powerType: u.powerType ?? null,
          abilityType: u.abilityType ?? 'none',
          abilityKey: u.abilityKey ?? null,
          rank: u.rank ?? 1,
        }));
    },

    restoreTestSceneBattleFromSnapshot() {
      if (!this.testSceneActive || !this.battleState) return false;
      const snap = Array.isArray(this.testSceneBattleStartSnapshot) ? this.testSceneBattleStartSnapshot : null;
      if (!snap?.length) return false;

      this.stopTestSceneBattleLoop?.();
      this.stopTestSceneRestartTimer?.();

      this.battleState.units = [];
      for (const u of snap) {
        coreAddUnit(this.battleState, {
          id: u.id,
          q: u.q,
          r: u.r,
          hp: u.hp,
          maxHp: u.maxHp,
          atk: u.atk,
          team: u.team,
          type: u.type,
          powerType: u.powerType,
          abilityType: u.abilityType ?? 'none',
          abilityKey: u.abilityKey ?? null,
          rank: u.rank ?? 1,
          zone: 'board',
          benchSlot: null,
          attackSpeed: u.attackSpeed ?? TEST_SCENE_DEFAULT_ATTACK_SPEED,
          moveSpeed: u.moveSpeed ?? TEST_SCENE_DEFAULT_MOVE_SPEED,
          attackRangeMax: u.attackRangeMax ?? 1,
          attackRangeFullDamage: u.attackRangeFullDamage ?? (u.attackRangeMax ?? 1),
          attackSeq: 0,
          dead: false,
        });
      }

      this.battleState.phase = 'prep';
      this.battleState.result = null;
      this.gridStaticDirty = true;
      this.pendingAttackAnimIds?.clear?.();
      this.refreshFromLocalBattleState?.();
      return true;
    },

    startTestSceneBattleLoop() {
      this.stopTestSceneBattleLoop();
      if (!this.testSceneActive) return;
      this.testSceneBattleLoop = this.time.addEvent({
        delay: TEST_SCENE_TICK_MS,
        loop: true,
        callback: () => this.tickTestSceneBattleLoop?.(),
      });
    },

    findTestSceneClosestOpponent(state, attacker) {
      if (!attacker || attacker.dead) return null;
      const enemyTeam = attacker.team === 'player' ? 'enemy' : 'player';
      let best = null;
      let bestDist = Infinity;
      for (const u of (state.units ?? [])) {
        if (u.zone !== 'board' || u.dead || u.team !== enemyTeam) continue;
        const d = coreHexDistance(attacker.q, attacker.r, u.q, u.r);
        if (d < bestDist) {
          bestDist = d;
          best = u;
        }
      }
      return best;
    },

    pickTestSceneBestStepToward(state, attacker, target) {
      let best = null;
      let bestDist = Infinity;
      for (const n of TEST_SCENE_NEIGHBORS) {
        const nq = attacker.q + n.dq;
        const nr = attacker.r + n.dr;
        if (!this.isInsideBoardCell(nq, nr)) continue;
        if (coreGetUnitAt(state, nq, nr)) continue;
        const d = coreHexDistance(nq, nr, target.q, target.r);
        if (d < bestDist) {
          bestDist = d;
          best = { q: nq, r: nr };
        }
      }
      return best;
    },

    finishTestSceneBattle(result) {
      if (!this.testSceneActive) return;
      this.stopTestSceneBattleLoop();
      this.stopTestSceneRestartTimer();
      this.battleState.phase = 'battle';
      this.battleState.result = result ?? 'draw';
      this.gridStaticDirty = true;
      this.refreshFromLocalBattleState?.();

      if (this.testSceneSelectedUnitType) {
        this.testSceneRestartTimer = this.time.delayedCall(TEST_SCENE_RESTART_DELAY_MS, () => {
          this.testSceneRestartTimer = null;
          if (!this.testSceneActive) return;
          if (this.restoreTestSceneBattleFromSnapshot?.()) {
            this.startTestSceneBattleFromPrep?.();
            return;
          }
          this.spawnTestScenePlayerUnit?.(this.testSceneSelectedUnitType, {
            autoStart: true,
            rank: this.testSceneSelectedUnitRank ?? 1,
          });
        });
      }
    },

    startTestSceneBattleFromPrep() {
      if (!this.testSceneActive) return;
      if (!this.battleState) return;
      if (this.battleState.result) return;
      if (this.battleState.phase === 'battle') return;

      const hasPlayer = (this.battleState.units ?? []).some((u) => u.zone === 'board' && !u.dead && u.team === 'player');
      const hasEnemy = (this.battleState.units ?? []).some((u) => u.zone === 'board' && !u.dead && u.team === 'enemy');
      if (!hasPlayer || !hasEnemy) return;

      for (const u of (this.battleState.units ?? [])) {
        u.nextAttackAt = 0;
        u.nextMoveAt = 0;
        u.dead = false;
        u.hp = u.maxHp ?? u.hp;
      }

      this.testSceneBattleStartSnapshot = this.captureTestSceneBattleStartSnapshot?.() ?? null;
      this.hideTestSceneSpawnRankMenu?.();

      this.draggingUnitId = null;
      this.dragHover = null;
      this.shadowOverride = null;

      this.battleState.phase = 'battle';
      this.battleState.result = null;
      this.gridStaticDirty = true;
      this.refreshFromLocalBattleState?.();
      this.startTestSceneBattleLoop?.();
    },

    tickTestSceneBattleLoop() {
      if (!this.testSceneActive) return;
      const state = this.battleState;
      if (!state || state.phase !== 'battle') return;

      const playerAlive = (state.units ?? []).some((u) => u.zone === 'board' && !u.dead && u.team === 'player');
      const enemyAlive = (state.units ?? []).some((u) => u.zone === 'board' && !u.dead && u.team === 'enemy');
      if (!playerAlive || !enemyAlive) {
        this.finishTestSceneBattle(playerAlive && !enemyAlive ? 'victory' : (!playerAlive && enemyAlive ? 'defeat' : 'draw'));
        return;
      }

      let didSomething = false;
      const tickTimeMs = Number(this.time?.now ?? 0);
      const actors = (state.units ?? [])
        .filter((u) => u.zone === 'board' && !u.dead && (u.team === 'player' || u.team === 'enemy'))
        .slice()
        .sort((a, b) => Number(a.id) - Number(b.id));

      for (const a of actors) {
        const me = (state.units ?? []).find((u) => u.id === a.id);
        if (!me || me.dead || me.zone !== 'board') continue;

        const attackSpeed = Math.max(0.1, Number(me.attackSpeed ?? TEST_SCENE_DEFAULT_ATTACK_SPEED));
        const moveSpeed = Math.max(0.1, Number(me.moveSpeed ?? TEST_SCENE_DEFAULT_MOVE_SPEED));
        const attackIntervalMs = 1000 / attackSpeed;
        const moveIntervalMs = 1000 / moveSpeed;
        me.nextAttackAt = Math.max(0, Number(me.nextAttackAt ?? 0));
        me.nextMoveAt = Math.max(0, Number(me.nextMoveAt ?? 0));

        let unitActions = 0;
        while (unitActions < TEST_SCENE_MAX_ACTIONS_PER_UNIT_PER_TICK) {
          const target = this.findTestSceneClosestOpponent?.(state, me);
          if (!target) break;

          const attackRangeMax = Math.max(1, Number(me.attackRangeMax ?? 1));
          const dist = coreHexDistance(me.q, me.r, target.q, target.r);
          if (dist <= attackRangeMax) {
            if (tickTimeMs + 1e-6 < me.nextAttackAt) break;

            const res = coreAttack(state, me.id, target.id);
            me.nextAttackAt = Math.max(me.nextAttackAt, tickTimeMs) + attackIntervalMs;
            unitActions += 1;
            if (res.success) {
              didSomething = true;
              me.attackSeq = Number(me.attackSeq ?? 0) + 1;
              this.pendingAttackAnimIds?.add?.(me.id);
            }
            break;
          }

          // Match server combat pacing: after attack, movement is blocked until attack cooldown ends.
          if (tickTimeMs + 1e-6 < me.nextAttackAt) break;
          if (tickTimeMs + 1e-6 < me.nextMoveAt) break;

          const step = this.pickTestSceneBestStepToward?.(state, me, target);
          if (!step) break;
          const moved = coreMoveUnit(state, me.id, step.q, step.r);
          me.nextMoveAt = Math.max(me.nextMoveAt, tickTimeMs) + moveIntervalMs;
          unitActions += 1;
          if (!moved) break;
          didSomething = true;
        }
      }

      if (didSomething) {
        this.refreshFromLocalBattleState?.();
      }

      const playerAliveAfter = (state.units ?? []).some((u) => u.zone === 'board' && !u.dead && u.team === 'player');
      const enemyAliveAfter = (state.units ?? []).some((u) => u.zone === 'board' && !u.dead && u.team === 'enemy');
      if (!playerAliveAfter || !enemyAliveAfter) {
        this.finishTestSceneBattle(playerAliveAfter && !enemyAliveAfter ? 'victory' : (!playerAliveAfter && enemyAliveAfter ? 'defeat' : 'draw'));
      }
    },

    spawnTestScenePlayerUnit(type, { autoStart = false, rank = 1 } = {}) {
      if (!this.testSceneActive) return;
      this.testSceneSelectedUnitType = type;
      this.testSceneSelectedUnitRank = Math.max(1, Math.min(3, Number(rank ?? 1)));
      this.testSceneBattleStartSnapshot = null;
      this.stopTestSceneRestartTimer?.();
      this.stopTestSceneBattleLoop?.();
      const state = this.battleState;
      if (!state) return;

      state.units = (state.units ?? []).filter((u) => !(u.team === 'player'));
      state.result = null;
      state.phase = 'prep';

      const playerPos = { ...TEST_SCENE_PLAYER_SPAWN };
      const enemyPos = { ...TEST_SCENE_ENEMY_SPAWN };

      const enemy = (state.units ?? []).find((u) => u.team === 'enemy');
      if (enemy) {
        enemy.dead = false;
        enemy.hp = enemy.maxHp;
        enemy.attackSeq = 0;
        enemy.nextAttackAt = 0;
        enemy.nextMoveAt = 0;
        enemy.zone = 'board';
        enemy.q = enemyPos.q;
        enemy.r = enemyPos.r;
      } else {
        this.addTestSceneUnit?.(state, {
          id: this.testSceneNextUnitId--,
          team: 'enemy',
          q: enemyPos.q,
          r: enemyPos.r,
          type: 'Skeleton',
        });
      }

      this.addTestSceneUnit?.(state, {
        id: this.testSceneNextUnitId--,
        team: 'player',
        q: playerPos.q,
        r: playerPos.r,
        type,
        rank: this.testSceneSelectedUnitRank,
      });

      for (const u of (state.units ?? [])) {
        u.dead = false;
        u.hp = u.maxHp ?? u.hp;
        u.nextAttackAt = 0;
        u.nextMoveAt = 0;
        u.attackSeq = Number(u.attackSeq ?? 0);
      }

      state.phase = 'prep';
      state.result = null;
      this.gridStaticDirty = true;
      this.refreshFromLocalBattleState?.();
      if (autoStart) this.startTestSceneBattleFromPrep?.();
    },

    enterTestScene() {
      if (this.testSceneActive) return;

      this.testSceneSavedLiveState = this.battleState;
      this.testSceneQueuedLiveState = null;
      this.testSceneActive = true;
      // Останавливаем/сбрасываем "живую" игру так же, как кнопка DEBUG->ВЫХОД.
      // Пока testSceneActive=true, входящий state будет только поставлен в очередь.
      this.ws?.sendIntentResetGame?.();
      this.testSceneUnitsMenuOpen = false;
      this.testSceneUnitsMenuRace = null;
      this.hideTestSceneSpawnRankMenu?.();
      this.testSceneSelectedUnitType = null;
      this.testSceneSelectedUnitRank = 1;
      this.testSceneBattleStartSnapshot = null;
      this.stopTestSceneBattleLoop?.();
      this.stopTestSceneRestartTimer?.();

      this.draggingUnitId = null;
      this.dragHover = null;
      this.shadowOverride = null;
      this.pendingAttackAnimIds?.clear?.();
      for (const vu of (this.unitSys?.state?.units ?? [])) {
        vu._attackAnimPlaying = false;
        vu._attackAnimForceReplay = false;
      }

      this.hideCoinInfoPopup?.();
      this.hideDebugMenu?.();

      this.battleState = this.createTestSceneState();
      this.gridStaticDirty = true;
      this.addTestSceneUnit?.(this.battleState, {
        id: this.testSceneNextUnitId--,
        team: 'enemy',
        q: TEST_SCENE_ENEMY_SPAWN.q,
        r: TEST_SCENE_ENEMY_SPAWN.r,
        type: 'Skeleton',
      });
      this.refreshFromLocalBattleState?.();
      this.syncDebugUI?.();
    },

    exitTestScene() {
      if (!this.testSceneActive) return;

      this.stopTestSceneBattleLoop?.();
      this.stopTestSceneRestartTimer?.();
      this.testSceneActive = false;
      this.testSceneUnitsMenuOpen = false;
      this.testSceneUnitsMenuRace = null;
      this.hideTestSceneSpawnRankMenu?.();
      this.testSceneSelectedUnitType = null;
      this.testSceneSelectedUnitRank = 1;
      this.testSceneBattleStartSnapshot = null;
      this.pendingAttackAnimIds?.clear?.();

      const liveState = this.testSceneQueuedLiveState ?? this.testSceneSavedLiveState;
      if (liveState) this.battleState = liveState;
      this.gridStaticDirty = true;
      this.testSceneSavedLiveState = null;
      this.testSceneQueuedLiveState = null;

      for (const vu of (this.unitSys?.state?.units ?? [])) {
        vu._attackAnimPlaying = false;
        vu._attackAnimForceReplay = false;
      }

      // Re-sync live mode with a clean server state after leaving test scene.
      // WebSocket preserves message order, so a subsequent "startGame" click
      // will be processed after this reset and won't fail the server guard.
      this.ws?.sendIntentResetGame?.();

      this.refreshFromLocalBattleState?.();
      this.syncDebugUI?.();
    },
  });
}


