import { positionFullscreenButton } from '../../game/ui.js';

export function installBattleSceneLifecycle(BattleScene) {
  Object.assign(BattleScene.prototype, {
    cleanupSceneLifecycle() {
      if (this._hudOutsideTapHandler) {
        this.input?.off?.('pointerdown', this._hudOutsideTapHandler);
        this._hudOutsideTapHandler = null;
      }
      if (this._onResizeHandler) {
        this.scale?.off?.('resize', this._onResizeHandler);
        this._onResizeHandler = null;
      }
      this.stopServerBattleReplayPlayback?.();
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
      };
      this.scale.on('resize', this._onResizeHandler);
    },
  });
}

