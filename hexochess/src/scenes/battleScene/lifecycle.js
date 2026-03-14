import { positionFullscreenButton } from '../../game/ui.js';

export function installBattleSceneLifecycle(BattleScene) {
  Object.assign(BattleScene.prototype, {
    cleanupSceneLifecycle() {
      if (this._hudOutsideTapHandler) {
        this.input?.off?.('pointerdown', this._hudOutsideTapHandler);
        this._hudOutsideTapHandler = null;
      }
      if (this._unitInfoOutsideTapHandler) {
        this.input?.off?.('pointerdown', this._unitInfoOutsideTapHandler);
        this._unitInfoOutsideTapHandler = null;
      }
      if (this._onResizeHandler) {
        this.scale?.off?.('resize', this._onResizeHandler);
        this._onResizeHandler = null;
      }
      if (this._loadErrorHandler) {
        this.load?.off?.('loaderror', this._loadErrorHandler);
        this._loadErrorHandler = null;
      }
      this.stopSceneLoadIntro?.();
      this.stopServerBattleReplayPlayback?.();
      this.stopBattleEntryReveal?.();
      if (this.ws) {
        this.ws.onInit = null;
        this.ws.onState = null;
        this.ws.onTestBattleReplay = null;
        this.ws.onError = null;
      }
      this.ws?.close?.();
    },

    bindSceneLifecycleHandlers() {
      this.events.once('shutdown', () => this.cleanupSceneLifecycle?.());
      this.events.once('destroy', () => this.cleanupSceneLifecycle?.());

      this._onResizeHandler = () => {
        this.draggingUnitId = null;
        this.dragBoardHover = null;
        this.dragBenchHoverSlot = null;
        this.hoverPickupCell = null;
        if (this.sceneLoadIntroActive) this.finishSceneLoadIntro?.();
        this.layout();
        this.drawGrid();

        if (this.roundText) this.roundText.setPosition(this.scale.width / 2, 10);
        if (this.prepTimerText) this.prepTimerText.setPosition(this.scale.width / 2, 56);
        if (this.resultText) this.resultText.setPosition(this.scale.width / 2, 56);
        if (this.resultText) this.resultText.setWordWrapWidth(Math.min(520, this.scale.width - 40));

        positionFullscreenButton(this);
        this.positionDebugUI?.();
        this.positionShop?.();
        this.positionCoinsHUD?.();
        this.positionTrashUi?.();
      };
      this.scale.on('resize', this._onResizeHandler);
    },
  });
}
