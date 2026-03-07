import {
  createBattleState,
  addUnit as coreAddUnit,
} from '../../../shared/battleCore.js';
import { UNIT_CATALOG as SHARED_UNIT_CATALOG } from '../../../shared/unitCatalog.js';

const TEST_SCENE_RESTART_DELAY_MS = 500;
const TEST_SCENE_PLAYER_SPAWN = { q: 3, r: 4 };
const TEST_SCENE_ENEMY_SPAWN = { q: 7, r: 4 };
const TEST_SCENE_DEFAULT_ATTACK_SPEED = 1;
const TEST_SCENE_DEFAULT_MOVE_SPEED = 1;
const TEST_SCENE_ENEMY_KING_UI_DELAY_MS = 700;

export const TEST_SCENE_UNITS = SHARED_UNIT_CATALOG.map((u) => ({ ...u }));

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
      s.shop = { offers: [], locked: false };
      s.round = 0;
      s.prepSecondsLeft = 0;
      s.battleSecondsLeft = 0;
      return s;
    },

    clearTestSceneEnemyKingRevealTimers() {
      for (const t of (this.testSceneEnemyKingRevealTimers ?? [])) {
        try { t?.remove?.(false); } catch {}
      }
      this.testSceneEnemyKingRevealTimers = [];
    },

    hideTestSceneEnemyKingPreview() {
      this.clearTestSceneEnemyKingRevealTimers?.();
      this.testSceneEnemyKingPreviewVisible = false;
      this.testSceneEnemyKingUiVisible = false;
      this.syncKingsUI?.();
    },

    showTestSceneEnemyKingPreview(textureKey) {
      if (!this.testSceneActive) return;
      const state = this.battleState;
      if (!state?.kings?.enemy) return;

      this.clearTestSceneEnemyKingRevealTimers?.();

      const nextTextureKey = String(textureKey ?? state.kings.enemy.visualKey ?? 'king_princess');
      state.kings.enemy.visible = true;
      state.kings.enemy.visualKey = nextTextureKey;
      this.testSceneEnemyKingSkinKey = nextTextureKey;
      this.testSceneEnemyKingPreviewVisible = false;
      this.testSceneEnemyKingUiVisible = false;
      this.syncKingsUI?.();

      const spriteTimer = this.time.delayedCall(0, () => {
        if (!this.testSceneActive) return;
        this.testSceneEnemyKingPreviewVisible = true;
        this.syncKingsUI?.();
        this.playEnemyKingRevealTween?.();
      });
      const uiTimer = this.time.delayedCall(TEST_SCENE_ENEMY_KING_UI_DELAY_MS, () => {
        if (!this.testSceneActive) return;
        this.testSceneEnemyKingUiVisible = true;
        this.syncKingsUI?.();
      });
      this.testSceneEnemyKingRevealTimers = [spriteTimer, uiTimer];
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
      this.stopServerBattleReplayPlayback?.();
      this.testSceneServerBattlePending = false;

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

    finishTestSceneBattle(result) {
      if (!this.testSceneActive) return;
      this.stopTestSceneBattleLoop();
      this.stopTestSceneRestartTimer();
      this.battleState.phase = 'battle';
      this.battleState.result = result ?? 'draw';
      this.gridStaticDirty = true;
      this.refreshFromLocalBattleState?.();
      this.testSceneRestartTimer = this.time.delayedCall(TEST_SCENE_RESTART_DELAY_MS, () => {
        this.testSceneRestartTimer = null;
        if (!this.testSceneActive) return;
        this.restoreTestSceneBattleFromSnapshot?.();
      });
    },

    buildTestSceneServerBattlePayload() {
      if (!this.testSceneActive || !this.battleState) return [];
      return (this.battleState.units ?? [])
        .filter((u) => u.zone === 'board' && !u.dead && (u.team === 'player' || u.team === 'enemy'))
        .map((u) => ({
          id: Number(u.id),
          team: u.team === 'enemy' ? 'enemy' : 'player',
          type: String(u.type ?? ''),
          q: Number(u.q),
          r: Number(u.r),
          rank: Math.max(1, Math.min(3, Number(u.rank ?? 1))),
        }));
    },

    handleTestSceneServerBattleReplay(msg) {
      if (!this.testSceneActive) return;
      const replay = msg?.replay ?? null;
      const battleStartState = msg?.battleStartState ?? null;
      if (!replay?.events || !battleStartState?.units) return;

      this.testSceneServerBattlePending = false;
      this.hideTestSceneSpawnRankMenu?.();
      this.draggingUnitId = null;
      this.dragHover = null;
      this.shadowOverride = null;

      this.startServerBattleReplayPlayback?.(replay, battleStartState, {
        allowTestScene: true,
        onComplete: () => this.finishTestSceneBattle?.(replay?.result ?? 'draw'),
      });
    },

    startTestSceneBattleFromPrep() {
      if (!this.testSceneActive) return;
      if (!this.battleState) return;
      if (this.battleState.result) return;
      if (this.battleState.phase === 'battle') return;
      if (this.testSceneServerBattlePending) return;

      const hasPlayer = (this.battleState.units ?? []).some((u) => u.zone === 'board' && !u.dead && u.team === 'player');
      const hasEnemy = (this.battleState.units ?? []).some((u) => u.zone === 'board' && !u.dead && u.team === 'enemy');
      if (!hasPlayer || !hasEnemy) return;

      this.testSceneBattleStartSnapshot = this.captureTestSceneBattleStartSnapshot?.() ?? null;
      this.hideTestSceneSpawnRankMenu?.();

      this.draggingUnitId = null;
      this.dragHover = null;
      this.shadowOverride = null;

      this.battleState.phase = 'battle';
      this.battleState.result = null;
      this.gridStaticDirty = true;
      this.refreshFromLocalBattleState?.();
      this.testSceneServerBattlePending = true;
      const payloadUnits = this.buildTestSceneServerBattlePayload?.() ?? [];
      const sent = this.ws?.sendIntentDebugRunTestBattle?.(payloadUnits, this.testSceneEnemyKingSkinKey ?? 'king_princess');
      if (!sent) {
        this.testSceneServerBattlePending = false;
        this.battleState.phase = 'prep';
        this.refreshFromLocalBattleState?.();
      }
    },

    spawnTestScenePlayerUnit(type, { autoStart = false, rank = 1 } = {}) {
      if (!this.testSceneActive) return;
      this.testSceneSelectedUnitType = type;
      this.testSceneSelectedUnitRank = Math.max(1, Math.min(3, Number(rank ?? 1)));
      this.testSceneBattleStartSnapshot = null;
      this.stopTestSceneRestartTimer?.();
      this.stopTestSceneBattleLoop?.();
      this.stopServerBattleReplayPlayback?.();
      this.testSceneServerBattlePending = false;
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
      this.testSceneEnemyKingPreviewVisible = false;
      this.testSceneEnemyKingUiVisible = false;
      this.testSceneEnemyKingSkinKey = 'king_princess';
      this.clearTestSceneEnemyKingRevealTimers?.();
      this.stopTestSceneBattleLoop?.();
      this.stopTestSceneRestartTimer?.();
      this.stopServerBattleReplayPlayback?.();
      this.testSceneServerBattlePending = false;

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
      if (this.battleState?.kings?.enemy) {
        this.battleState.kings.enemy.visualKey = this.testSceneEnemyKingSkinKey;
      }
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
      this.stopServerBattleReplayPlayback?.();
      this.testSceneActive = false;
      this.testSceneUnitsMenuOpen = false;
      this.testSceneUnitsMenuRace = null;
      this.hideTestSceneSpawnRankMenu?.();
      this.testSceneSelectedUnitType = null;
      this.testSceneSelectedUnitRank = 1;
      this.testSceneBattleStartSnapshot = null;
      this.testSceneEnemyKingPreviewVisible = false;
      this.testSceneEnemyKingUiVisible = false;
      this.clearTestSceneEnemyKingRevealTimers?.();
      this.pendingAttackAnimIds?.clear?.();
      this.testSceneServerBattlePending = false;

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


