const areKingsEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ap = a.player ?? {};
  const bp = b.player ?? {};
  const ae = a.enemy ?? {};
  const be = b.enemy ?? {};
  return (
    ap.hp === bp.hp &&
    ap.maxHp === bp.maxHp &&
    ap.coins === bp.coins &&
    ap.level === bp.level &&
    ap.xp === bp.xp &&
    ae.hp === be.hp &&
    ae.maxHp === be.maxHp &&
    ae.coins === be.coins &&
    ae.visible === be.visible &&
    ae.level === be.level &&
    ae.xp === be.xp
  );
};

const areShopOffersEqual = (a, b) => {
  if (a === b) return true;
  const aa = a?.offers ?? [];
  const bb = b?.offers ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    const x = aa[i];
    const y = bb[i];
    if (x === y) continue;
    if (!x || !y) {
      if (x !== y) return false;
      continue;
    }
    if (
      x.type !== y.type ||
      x.powerType !== y.powerType ||
      x.cost !== y.cost ||
      x.hp !== y.hp ||
      (x.maxHp ?? x.hp) !== (y.maxHp ?? y.hp) ||
      x.atk !== y.atk ||
      Number(x.attackSpeed ?? 1) !== Number(y.attackSpeed ?? 1) ||
      Number(x.moveSpeed ?? 1) !== Number(y.moveSpeed ?? 1) ||
      Number(x.projectileSpeed ?? 0) !== Number(y.projectileSpeed ?? 0) ||
      Number(x.attackRangeMax ?? 1) !== Number(y.attackRangeMax ?? 1) ||
      Number(x.attackRangeFullDamage ?? (x.attackRangeMax ?? 1)) !== Number(y.attackRangeFullDamage ?? (y.attackRangeMax ?? 1))
    ) return false;
  }
  return true;
};

const areUnitsEqual = (a, b) => {
  if (a === b) return true;
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    const x = aa[i];
    const y = bb[i];
    if (!x || !y) return false;
    if (
      x.id !== y.id ||
      x.q !== y.q || x.r !== y.r ||
      x.zone !== y.zone ||
      x.benchSlot !== y.benchSlot ||
      x.team !== y.team ||
      x.type !== y.type ||
      x.rank !== y.rank ||
      Number(x.attackSpeed ?? 1) !== Number(y.attackSpeed ?? 1) ||
      Number(x.moveSpeed ?? 1) !== Number(y.moveSpeed ?? 1) ||
      Number(x.projectileSpeed ?? 0) !== Number(y.projectileSpeed ?? 0) ||
      Number(x.attackRangeMax ?? 1) !== Number(y.attackRangeMax ?? 1) ||
      Number(x.attackRangeFullDamage ?? (x.attackRangeMax ?? 1)) !== Number(y.attackRangeFullDamage ?? (y.attackRangeMax ?? 1)) ||
      x.hp !== y.hp ||
      (x.maxHp ?? x.hp) !== (y.maxHp ?? y.hp) ||
      Number(x.attackSeq ?? 0) !== Number(y.attackSeq ?? 0) ||
      x.dead !== y.dead
    ) return false;
  }
  return true;
};

export function installBattleSceneStateSync(BattleScene) {
  Object.assign(BattleScene.prototype, {
    handleServerState(state) {
      if (this.testSceneActive) {
        this.testSceneQueuedLiveState = state;
        return;
      }

      const prevState = this.battleState;
      const prevPhase = this.battleState?.phase ?? null;
      const prevResult = this.battleState?.result ?? null;

      let nextState = state;
      const replayIsRunning =
        !!this.useServerBattleReplay &&
        !this.testSceneActive &&
        !!this.serverReplayPlayback?.active;

      if (replayIsRunning && state?.phase === 'battle') {
        const localUnits = (this.battleState?.units ?? []).map((u) => ({ ...u }));
        const localBoardUnits = localUnits.filter((u) => u?.zone === 'board');
        const serverNonBoardUnits = (state?.units ?? [])
          .filter((u) => u?.zone !== 'board')
          .map((u) => ({ ...u }));

        nextState = {
          ...state,
          units: [...localBoardUnits, ...serverNonBoardUnits],
        };
      }

      const autoSellFx = nextState?.autoSellFx ?? null;
      const autoSellFxNonce = Number(autoSellFx?.nonce ?? NaN);
      if (
        Number.isFinite(autoSellFxNonce) &&
        autoSellFxNonce > 0 &&
        Number(this.lastHandledServerAutoSellFxNonce ?? NaN) !== autoSellFxNonce
      ) {
        this.lastHandledServerAutoSellFxNonce = autoSellFxNonce;
        this.playServerAutoSellFx?.(autoSellFx?.unitIds ?? []);
      }

      const autoBenchFx = nextState?.autoBenchFx ?? null;
      const autoBenchFxNonce = Number(autoBenchFx?.nonce ?? NaN);
      if (
        Number.isFinite(autoBenchFxNonce) &&
        autoBenchFxNonce > 0 &&
        Number(this.lastHandledServerAutoBenchFxNonce ?? NaN) !== autoBenchFxNonce
      ) {
        this.lastHandledServerAutoBenchFxNonce = autoBenchFxNonce;
        this.entryAutoBenchAnimatingIds = new Set((autoBenchFx?.unitIds ?? []).map((id) => Number(id)).filter(Number.isFinite));
      }

      this.battleState = nextState;

      const phaseChanged = (nextState?.phase ?? null) !== prevPhase;
      const resultChanged = (nextState?.result ?? null) !== prevResult;
      const phaseUiChanged =
        phaseChanged ||
        resultChanged ||
        Boolean(prevState?.gameStarted) !== Boolean(nextState?.gameStarted) ||
        Number(prevState?.round ?? 0) !== Number(nextState?.round ?? 0) ||
        Number(prevState?.prepSecondsLeft ?? 0) !== Number(nextState?.prepSecondsLeft ?? 0) ||
        Number(prevState?.entrySecondsLeft ?? 0) !== Number(nextState?.entrySecondsLeft ?? 0) ||
        Number(prevState?.battleSecondsLeft ?? 0) !== Number(nextState?.battleSecondsLeft ?? 0);
      const unitsChanged = !areUnitsEqual(prevState?.units, nextState?.units);
      const pendingAttackAnimIds = new Set();
      const prevUnitsById = new Map((prevState?.units ?? []).map((u) => [u.id, u]));
      for (const u of (nextState?.units ?? [])) {
        const prev = prevUnitsById.get(u.id);
        if (!prev) continue;
        const prevAttackSeq = Number(prev.attackSeq ?? 0);
        const nextAttackSeq = Number(u.attackSeq ?? 0);
        if (nextAttackSeq > prevAttackSeq) pendingAttackAnimIds.add(u.id);
      }
      this.pendingAttackAnimIds = pendingAttackAnimIds;
      const kingsChanged = !areKingsEqual(prevState?.kings, nextState?.kings);
      const shopChanged = !areShopOffersEqual(prevState?.shop, nextState?.shop);

      if (!phaseChanged && resultChanged) {
        this.shopUiSkipNextModeAnimation = true;
      }

      if (phaseChanged) {
        if (nextState?.phase === 'entry' && !nextState?.result) {
          this.startBattleEntryReveal?.();
        } else if (prevPhase === 'entry') {
          this.stopBattleEntryReveal?.();
          this.entryAutoBenchAnimatingIds?.clear?.();
          this.pendingServerAutoSellFxIds?.clear?.();
        }
        if (nextState?.phase === 'battle' && !nextState?.result) {
          this.shopCollapsed = true;
          // Freeze X from player board at battle start; bench must not affect this value.
          const battleStartUnits = (nextState?.units ?? []).filter((u) => (
            u?.team === 'player' &&
            u?.zone === 'board' &&
            !u?.dead
          ));
          this.lockedPlayerBoardUnitCount = Number(battleStartUnits.length ?? 0);
        }
        if (nextState?.phase === 'prep' && !nextState?.result) {
          this.shopCollapsed = false;
          this.lockedPlayerBoardUnitCount = null;
        }
        if (nextState?.phase !== 'battle') {
          this.kingDamageFxToken += 1;
          this.kingHpLock.player = null;
          this.kingHpLock.enemy = null;
        }
        this.gridStaticDirty = true;
        if (nextState?.phase !== 'prep' || nextState?.result) {
          this.draggingUnitId = null;
          this.dragBoardHover = null;
          this.dragBenchHoverSlot = null;
          this.hoverPickupCell = null;
        }
      }

      // Do not hard-reset unit attack/cast playback on phase/result switch:
      // currently playing animations must finish naturally (animationcomplete).

      const needRender = (unitsChanged || phaseChanged || resultChanged);
      const needGrid = needRender;
      const needPhaseUi = phaseUiChanged;
      // Kings HUD also contains board unit counter (X / Y), so it must refresh on unit moves.
      const needKingsUi = phaseUiChanged || kingsChanged || unitsChanged;
      const needShopUi = phaseChanged || resultChanged || kingsChanged || shopChanged;
      const needRefreshDraggable = (unitsChanged || phaseChanged || resultChanged);

      if (needRender) this.renderFromState();
      if (needGrid) this.drawGrid();
      if (needPhaseUi) this.syncPhaseUI();
      if (needKingsUi) this.syncKingsUI();
      this.maybeStartKingDamageFx?.(prevState, nextState, { resultChanged });
      if (needShopUi) this.syncShopUI();
      if (shopChanged) this.shopPendingBuyOfferIndex = null;
      if (needRefreshDraggable) this.refreshAllDraggable();
      this.syncDebugUI?.();

      this.maybeStartServerBattleReplayPlayback?.(state);
      if (nextState?.phase !== 'battle') {
        this.stopServerBattleReplayPlayback?.();
      }
    },

    handleServerError(err) {
      if (this.testSceneActive) return;
      console.warn('Server error:', err?.code, err?.message || err);

      if (err?.code === 'NO_SPACE') {
        const idx = Number(this.shopPendingBuyOfferIndex);
        this.showShopCardHint?.(idx, 'Нет места');
      }

      if (err?.code === 'OCCUPIED' || err?.code === 'MOVE_DENIED' || err?.code === 'NOT_OWNER') {
        this.renderFromState();
        this.drawGrid();
      }
    },
  });
}
