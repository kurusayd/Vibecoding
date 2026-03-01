import Phaser from 'phaser';
import { installBattleSceneTestSceneUi } from './testSceneUi.js';
import { kingXpToNext } from '../../../shared/battleCore.js';
import { COINS_CAP } from '../../../shared/economy.js';

const DEBUG_UI_TEXT = {
  BATTLE: '\u0411\u041e\u0419',
  EXIT: '\u0412\u042b\u0425\u041e\u0414',
  KING: '\u041a\u041e\u0420\u041e\u041b\u042c',
  LEVEL_UP: '+ \u0423\u0440\u043e\u0432\u0435\u043d\u044c',
  FROG: '\u041b\u042f\u0413\u0423\u0428\u041a\u0410',
  PRINCESS: '\u041f\u0420\u0418\u041d\u0426\u0415\u0421\u0421\u0410',
};

const KING_DEBUG_SKINS = [
  { label: DEBUG_UI_TEXT.FROG, key: 'king_frog' },
  { label: DEBUG_UI_TEXT.PRINCESS, key: 'king_princess' },
  { label: DEBUG_UI_TEXT.KING, key: 'king_king' },
];

const BUTTON_SHADOW_COLOR = 0x000000;
const BUTTON_SHADOW_ALPHA = 0.35;
const BUTTON_SHADOW_OFFSET_X = 2;
const BUTTON_SHADOW_OFFSET_Y = 3;

export function installBattleSceneDebugUi(BattleScene) {
  // Install test scene UI first, because debug UI delegates part of its layout/sync to it.
  installBattleSceneTestSceneUi(BattleScene);

  Object.assign(BattleScene.prototype, {
    initDebugUi() {
      // Debug / test-scene UI state lives on BattleScene instance so gameplay modules can read it.
      this.debugMenuOpen = false;
      this.debugKingMenuOpen = false;
      this.ratingInfoOpen = false;
      this.roundInfoOpen = false;
      this.debugCanStartBattle = false;
      this.debugKingSkinButtons = [];
      this.testSceneActive = false;
      this.testSceneUnitsMenuOpen = false;
      this.testSceneUnitsMenuRace = null;
      this.testSceneBattleLoop = null;
      this.testSceneRestartTimer = null;
      this.testSceneNextUnitId = -1;
      this.testSceneSelectedUnitType = null;
      this.testSceneBattleStartSnapshot = null;
      this.testSceneSavedLiveState = null;
      this.testSceneQueuedLiveState = null;
      this.debugShowHexShadowDuringBattle = false;

      this.debugBtn = this.add.text(this.scale.width - 14, 19, 'Debug', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
        .setOrigin(1, 0)
        .setDepth(10020)
        .setInteractive({ useHandCursor: true });

      this.debugBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        this.toggleDebugMenu?.();
      });

      this.ratingBtn = this.add.container(0, 0)
        .setDepth(10020)
        .setScrollFactor(0)
        .setSize(128, 38);
      this.ratingBtnBody = this.add.container(64, 19);
      this.ratingBtnShadow = this.add.rectangle(BUTTON_SHADOW_OFFSET_X, BUTTON_SHADOW_OFFSET_Y, 130, 40, BUTTON_SHADOW_COLOR, BUTTON_SHADOW_ALPHA)
        .setOrigin(0.5, 0.5);
      this.ratingBtnBg = this.add.rectangle(0, 0, 127, 37, 0x6b4b2f, 1)
        .setOrigin(0.5, 0.5)
        .setStrokeStyle(4, 0xb38a5e, 1);
      this.ratingBtnLabel = this.add.text(0, 0, 'Rating', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#f3ead6',
      }).setOrigin(0.5, 0.5);
      this.ratingBtnHit = this.add.zone(64, 19, 128, 38)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });
      this.ratingBtnBody.add([
        this.ratingBtnShadow,
        this.ratingBtnBg,
        this.ratingBtnLabel,
      ]);
      this.ratingBtn.add([
        this.ratingBtnBody,
        this.ratingBtnHit,
      ]);

      this.ratingBtnHit.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        this.ratingInfoOpen = !this.ratingInfoOpen;
        this.refreshBotsDebugInfo?.();
        this.tweens?.killTweensOf?.(this.ratingBtnBody);
        this.ratingBtnBody?.setScale?.(1, 1);
        this.tweens?.add?.({
          targets: this.ratingBtnBody,
          scaleX: 0.96,
          scaleY: 0.96,
          duration: 70,
          ease: 'Quad.Out',
          yoyo: true,
        });
        this.syncDebugUI?.();
      });

      const roundBattleBtnW = 160;
      const roundBattleBtnH = 38;
      this.roundBattleBtnW = roundBattleBtnW;
      this.roundBattleBtnH = roundBattleBtnH;
      this.roundBattleBtn = this.add.container(this.scale.width / 2, 12)
        .setDepth(10020)
        .setSize(roundBattleBtnW, roundBattleBtnH);
      this.roundBattleBtnHit = this.add.zone(this.scale.width / 2, 12, roundBattleBtnW, roundBattleBtnH)
        .setOrigin(0, 0)
        .setDepth(10021)
        .setInteractive({ useHandCursor: true });
      this.roundBattleBtnShadow = this.add.rectangle(BUTTON_SHADOW_OFFSET_X, BUTTON_SHADOW_OFFSET_Y, roundBattleBtnW + 2, roundBattleBtnH + 2, BUTTON_SHADOW_COLOR, BUTTON_SHADOW_ALPHA)
        .setOrigin(0, 0);
      this.roundBattleBtnBg = this.add.rectangle(0.5, 0.5, roundBattleBtnW - 1, roundBattleBtnH - 1, 0xc793a2, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(4, 0xe9c8d1, 1);
      this.roundBattleBtnLabel = this.add.text(roundBattleBtnW / 2, roundBattleBtnH / 2, DEBUG_UI_TEXT.BATTLE, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#2f2416',
      }).setOrigin(0.5, 0.5);
      this.roundBattleBtn.add([
        this.roundBattleBtnShadow,
        this.roundBattleBtnBg,
        this.roundBattleBtnLabel,
      ]);

      this.debugModal = this.add.container(0, 0)
        .setDepth(10030)
        .setScrollFactor(0)
        .setVisible(false);

      this.debugModalBg = this.add.rectangle(0, 0, 180, 380, 0x111111, 0.94)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x666666, 0.95);

      this.debugModalTitle = this.add.text(90, 12, 'DEBUG', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);

      this.battleBtn = this.add.text(90, 44, DEBUG_UI_TEXT.BATTLE, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.55)',
        padding: { left: 18, right: 18, top: 8, bottom: 8 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });

      this.debugBotsBtn = this.add.text(90, 120, 'ROUND INFO', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '15px',
        color: '#ffffff',
        backgroundColor: 'rgba(20,80,70,0.70)',
        padding: { left: 16, right: 16, top: 7, bottom: 7 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });

      this.debugGoldBtn = this.add.text(90, 158, '+100 GOLD', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '17px',
        color: '#ffffff',
        backgroundColor: 'rgba(120,90,0,0.70)',
        padding: { left: 10, right: 10, top: 7, bottom: 7 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });

      this.debugLevelBtn = this.add.text(90, 196, DEBUG_UI_TEXT.LEVEL_UP, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: 'rgba(90,50,120,0.72)',
        padding: { left: 10, right: 10, top: 7, bottom: 7 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });

      this.debugExitBtn = this.add.text(90, 196, DEBUG_UI_TEXT.EXIT, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: 'rgba(120,0,0,0.65)',
        padding: { left: 14, right: 14, top: 8, bottom: 8 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });

      this.debugTestSceneBtn = this.add.text(90, 234, 'TEST SCENE', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '17px',
        color: '#ffffff',
        backgroundColor: 'rgba(70,40,110,0.70)',
        padding: { left: 10, right: 10, top: 7, bottom: 7 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });

      this.debugHexShadowBtn = this.add.text(90, 272, '[ ] HEX SHADOW', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '15px',
        color: '#ffffff',
        backgroundColor: 'rgba(40,40,40,0.70)',
        padding: { left: 10, right: 10, top: 7, bottom: 7 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });

      this.debugKingBtn = this.add.text(90, 82, DEBUG_UI_TEXT.KING, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,60,110,0.65)',
        padding: { left: 12, right: 12, top: 8, bottom: 8 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });

      this.debugModalHit = this.add.zone(0, 0, 180, 380)
        .setOrigin(0, 0)
        .setInteractive();
      this.debugModalHit.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
      });

      // Uniform debug-menu button layout (same width/height/gap).
      const debugMenuBtnW = 150;
      const debugMenuBtnH = 34;
      const debugMenuBtnX = 90;
      const debugMenuBtnY0 = 34;
      const debugMenuBtnStep = 42;
      const debugMenuBtns = [
        this.battleBtn,
        this.debugKingBtn,
        this.debugBotsBtn,
        this.debugGoldBtn,
        this.debugLevelBtn,
        this.debugExitBtn,
        this.debugTestSceneBtn,
        this.debugHexShadowBtn,
      ];
      debugMenuBtns.forEach((btn, idx) => {
        if (!btn) return;
        btn.setPosition(debugMenuBtnX, debugMenuBtnY0 + idx * debugMenuBtnStep);
        btn.setFixedSize?.(debugMenuBtnW, debugMenuBtnH);
        btn.setAlign?.('center');
      });

      this.debugModal.add([
        this.debugModalHit,
        this.debugModalBg,
        this.debugModalTitle,
        this.battleBtn,
        this.debugKingBtn,
        this.debugBotsBtn,
        this.debugGoldBtn,
        this.debugLevelBtn,
        this.debugExitBtn,
        this.debugTestSceneBtn,
        this.debugHexShadowBtn,
      ]);

      this.debugBotsModal = this.add.container(0, 0)
        .setDepth(10030)
        .setScrollFactor(0)
        .setVisible(false);
      this.debugBotsModalBg = this.add.rectangle(0, 0, 420, 620, 0x111111, 0.95)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x5a7f77, 0.95);
      this.debugBotsModalHit = this.add.zone(0, 0, 420, 620)
        .setOrigin(0, 0)
        .setInteractive();
      this.debugBotsModalHit.on('pointerdown', (pointer) => pointer?.event?.stopPropagation?.());
      this.debugBotsModalTitle = this.add.text(210, 10, 'RATING', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);
      this.debugBotsModalText = this.add.text(10, 36, '', {
        fontFamily: 'Consolas, monospace',
        fontSize: '12px',
        color: '#dfe9e6',
        lineSpacing: 4,
        wordWrap: { width: 400, useAdvancedWrap: true },
      }).setOrigin(0, 0);
      this.debugBotsRowsLayer = this.add.container(0, 0);
      this.debugBotsModal.add([
        this.debugBotsModalHit,
        this.debugBotsModalBg,
        this.debugBotsModalTitle,
        this.debugBotsModalText,
        this.debugBotsRowsLayer,
      ]);

      this.debugRoundModal = this.add.container(0, 0)
        .setDepth(10030)
        .setScrollFactor(0)
        .setVisible(false);
      this.debugRoundModalBg = this.add.rectangle(0, 0, 420, 220, 0x111111, 0.95)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x7a7466, 0.95);
      this.debugRoundModalHit = this.add.zone(0, 0, 420, 220)
        .setOrigin(0, 0)
        .setInteractive();
      this.debugRoundModalHit.on('pointerdown', (pointer) => pointer?.event?.stopPropagation?.());
      this.debugRoundModalTitle = this.add.text(210, 10, 'ROUND INFO', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);
      this.debugRoundModalText = this.add.text(10, 36, '', {
        fontFamily: 'Consolas, monospace',
        fontSize: '12px',
        color: '#dfe9e6',
        lineSpacing: 4,
        wordWrap: { width: 400, useAdvancedWrap: true },
      }).setOrigin(0, 0);
      this.debugRoundModal.add([
        this.debugRoundModalHit,
        this.debugRoundModalBg,
        this.debugRoundModalTitle,
        this.debugRoundModalText,
      ]);

      // Debug king skin picker (local visual override only).
      this.debugKingModal = this.add.container(0, 0)
        .setDepth(10030)
        .setScrollFactor(0)
        .setVisible(false);
      this.debugKingModalBg = this.add.rectangle(0, 0, 220, 168, 0x111111, 0.94)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x666666, 0.95);
      this.debugKingModalTitle = this.add.text(110, 12, 'KING (LOCAL)', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);
      this.debugKingModalHit = this.add.zone(0, 0, 220, 168)
        .setOrigin(0, 0)
        .setInteractive();
      this.debugKingModalHit.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
      });
      this.debugKingModal.add([
        this.debugKingModalHit,
        this.debugKingModalBg,
        this.debugKingModalTitle,
      ]);

      KING_DEBUG_SKINS.forEach((skin, idx) => {
        const btn = this.add.text(110, 42 + idx * 38, skin.label, {
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
          fontSize: '17px',
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.55)',
          padding: { left: 12, right: 12, top: 7, bottom: 7 },
        })
          .setOrigin(0.5, 0)
          .setDepth(10031)
          .setInteractive({ useHandCursor: true });
        btn.on('pointerdown', (pointer) => {
          pointer?.event?.stopPropagation?.();
          this.applyLocalPlayerKingTexture?.(skin.key);
          this.syncDebugUI?.();
        });
        btn._kingTextureKey = skin.key;
        this.debugKingSkinButtons.push(btn);
        this.debugKingModal.add(btn);
      });

      this.battleBtn.on('pointerdown', () => {
        if (this.testSceneActive) {
          this.startTestSceneBattleFromPrep?.();
        } else {
          this.ws?.sendIntentStartBattle();
        }
        this.hideDebugMenu?.();
      });
      this.roundBattleBtnHit.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        if (!this.debugCanStartBattle) return;
        this.updateRoundBattleBtnVisual?.(true);
        if (this.testSceneActive) {
          this.startTestSceneBattleFromPrep?.();
        } else {
          this.ws?.sendIntentStartBattle();
        }
      });
      this.roundBattleBtnHit.on('pointerup', () => {
        this.updateRoundBattleBtnVisual?.(false);
      });
      this.roundBattleBtnHit.on('pointerout', () => {
        this.updateRoundBattleBtnVisual?.(false);
      });

      this.debugKingBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        this.debugKingMenuOpen = !this.debugKingMenuOpen;
        this.syncDebugUI?.();
      });
      this.debugBotsBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        this.roundInfoOpen = !this.roundInfoOpen;
        this.refreshRoundDebugInfo?.();
        this.syncDebugUI?.();
      });
      this.debugTestSceneBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        this.enterTestScene?.();
        this.hideDebugMenu?.();
      });
      this.debugGoldBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        this.ws?.sendIntentDebugAddGold100?.();
      });
      this.debugLevelBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        this.ws?.sendIntentDebugAddLevel?.();
      });
      this.debugHexShadowBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        this.debugShowHexShadowDuringBattle = !this.debugShowHexShadowDuringBattle;
        this.drawGrid?.();
        this.syncDebugUI?.();
      });
      this.debugExitBtn.on('pointerdown', () => {
        if (this.testSceneActive) {
          this.exitTestScene?.();
          this.scene.start('StartScene');
          return;
        }
        this.ws?.sendIntentResetGame?.();
        this.scene.start('StartScene');
      });

      // Close debug/rating panels on the next tap anywhere outside their buttons.
      this._debugOutsideTapHandler = (pointer, currentlyOver) => {
        const over = Array.isArray(currentlyOver) ? currentlyOver : [];
        if (this.debugMenuOpen) {
          const debugButtons = [
            this.debugBtn,
            this.battleBtn,
            this.debugKingBtn,
            this.debugBotsBtn,
            this.debugGoldBtn,
            this.debugLevelBtn,
            this.debugExitBtn,
            this.debugTestSceneBtn,
            this.debugHexShadowBtn,
          ].filter(Boolean);
          const tappedDebugButton = debugButtons.some((obj) => over.includes(obj));
          if (!tappedDebugButton) {
            this.hideDebugMenu?.();
          }
        }
        if (this.ratingInfoOpen) {
          const ratingButtons = [this.ratingBtn, this.ratingBtnHit].filter(Boolean);
          const tappedRatingButton = ratingButtons.some((obj) => over.includes(obj));
          if (!tappedRatingButton) {
            this.ratingInfoOpen = false;
            this.syncDebugUI?.();
          }
        }
      };
      this.input.on('pointerdown', this._debugOutsideTapHandler);

      // Test scene top-right controls are installed by a dedicated UI module.
      this.initTestSceneUi?.();
      this.positionDebugUI?.();
      this.syncDebugUI?.();

      this.events.once('shutdown', () => {
        if (this._debugOutsideTapHandler) {
          this.input?.off?.('pointerdown', this._debugOutsideTapHandler);
          this._debugOutsideTapHandler = null;
        }
      });
      this.events.once('destroy', () => {
        if (this._debugOutsideTapHandler) {
          this.input?.off?.('pointerdown', this._debugOutsideTapHandler);
          this._debugOutsideTapHandler = null;
        }
      });
    },

    positionDebugUI() {
      if (this.debugBtn) {
        this.debugBtn.setPosition(this.scale.width - 14, 60);
      }
      if (this.ratingBtn) {
        const ratingW = Number(this.ratingBtn.width ?? this.ratingBtn.displayWidth ?? 128);
        this.ratingBtn.setPosition(this.scale.width - 14 - ratingW, 14);
      }
      if (this.roundBattleBtn) {
        const baseX = this.roundText?.x ?? (this.scale.width / 2);
        const baseY = this.roundText?.y ?? 10;
        const btnW = Number(this.roundBattleBtnW ?? 160);
        const roundBounds = this.roundText?.getBounds?.() ?? null;
        const roundRight = Number.isFinite(roundBounds?.right)
          ? Number(roundBounds.right)
          : (baseX + (Number(this.roundText?.width ?? 220) / 2));
        const gap = 18;
        const btnX = Math.min(
          this.scale.width - btnW - 12,
          Math.round(roundRight + gap + 20),
        );
        const btnY = Math.round(baseY + 2);
        this.roundBattleBtn.setPosition(
          btnX,
          btnY,
        );
        this.roundBattleBtnHit?.setPosition?.(btnX, btnY);
      }
      this.positionTestSceneUi?.();

      if (this.debugModal) {
        const modalW = this.debugModalBg?.width ?? 180;
        const x = this.scale.width - modalW - 14;
        const y = 14;
        this.debugModal.setPosition(x, y);
      }

      if (this.debugKingModal) {
        const mainX = this.debugModal?.x ?? (this.scale.width - (this.debugModalBg?.width ?? 180) - 14);
        const mainY = this.debugModal?.y ?? 48;
        const kingModalW = this.debugKingModalBg?.width ?? 220;
        const kingModalH = this.debugKingModalBg?.height ?? 168;
        const gap = 8;

        let x = mainX - kingModalW - gap;
        let y = mainY;

        if (x < 8) {
          x = mainX;
          y = mainY + (this.debugModalBg?.height ?? 164) + gap;
        }

        if (y + kingModalH > this.scale.height - 8) {
          y = Math.max(8, this.scale.height - kingModalH - 8);
        }

        this.debugKingModal.setPosition(x, y);
      }

      if (this.debugBotsModal) {
        const mainX = this.debugModal?.x ?? (this.scale.width - (this.debugModalBg?.width ?? 180) - 14);
        const mainY = this.debugModal?.y ?? 48;
        const mainW = this.debugModalBg?.width ?? 180;
        const botsW = this.debugBotsModalBg?.width ?? 360;
        const botsH = this.debugBotsModalBg?.height ?? 300;

        let x = Math.round(mainX + mainW - botsW); // align right edge with debug panel
        let y = mainY;
        if (x < 8) x = 8;
        if (x + botsW > this.scale.width - 8) x = Math.max(8, this.scale.width - botsW - 8);
        if (y + botsH > this.scale.height - 8) {
          y = Math.max(8, this.scale.height - botsH - 8);
        }
        this.debugBotsModal.setPosition(x, y);
      }
      if (this.debugRoundModal) {
        const mainX = this.debugModal?.x ?? (this.scale.width - (this.debugModalBg?.width ?? 180) - 14);
        const mainY = this.debugModal?.y ?? 48;
        const infoW = this.debugRoundModalBg?.width ?? 420;
        const infoH = this.debugRoundModalBg?.height ?? 220;
        const gap = 8;
        let x = mainX - infoW - gap;
        let y = mainY;
        if (x < 8) {
          x = Math.max(8, this.scale.width - infoW - 8);
          y = Math.min(Math.max(8, mainY + (this.debugModalBg?.height ?? 294) + gap), Math.max(8, this.scale.height - infoH - 8));
        }
        if (y + infoH > this.scale.height - 8) {
          y = Math.max(8, this.scale.height - infoH - 8);
        }
        this.debugRoundModal.setPosition(x, y);
      }
    },

    clearBotsDebugRows() {
      const layer = this.debugBotsRowsLayer;
      if (!layer) return;
      const children = layer.list ? [...layer.list] : [];
      for (const child of children) {
        try { child.destroy?.(); } catch {}
      }
      layer.removeAll?.(true);
    },

    updateRoundBattleBtnVisual(pressed = false) {
      if (!this.roundBattleBtn || !this.roundBattleBtnBg || !this.roundBattleBtnLabel) return;
      const canBattle = !!this.debugCanStartBattle && !this.testSceneActive;
      const isPressed = !!pressed && canBattle;
      const fillColor = isPressed ? 0xb67f90 : (canBattle ? 0xc793a2 : 0xb4a3a8);
      const borderColor = isPressed ? 0xe0bcc7 : (canBattle ? 0xe9c8d1 : 0xd0c5c9);
      const labelColor = canBattle ? '#2f2416' : '#645c51';
      this.roundBattleBtnBg.setFillStyle(fillColor, 1);
      this.roundBattleBtnBg.setStrokeStyle(4, borderColor, 1);
      this.roundBattleBtnLabel.setColor(labelColor);
      if (this.roundBattleBtnShadow) {
        this.roundBattleBtnShadow.setPosition(
          isPressed ? (BUTTON_SHADOW_OFFSET_X - 1) : BUTTON_SHADOW_OFFSET_X,
          isPressed ? (BUTTON_SHADOW_OFFSET_Y - 1) : BUTTON_SHADOW_OFFSET_Y,
        );
        this.roundBattleBtnShadow.setFillStyle(BUTTON_SHADOW_COLOR, 1);
        this.roundBattleBtnShadow.setAlpha(canBattle ? (isPressed ? 0.28 : BUTTON_SHADOW_ALPHA) : 0.16);
      }
      this.roundBattleBtn.setScale(isPressed ? 0.985 : 1);
    },

    createBotDebugBar({ x, y, width, height, ratio, fillColor, text, borderColor = 0x000000 }) {
      const r = Phaser.Math.Clamp(Number(ratio ?? 0), 0, 1);

      const bg = this.add.rectangle(x, y, width, height, 0x232323, 0.95)
        .setOrigin(0, 0.5)
        .setStrokeStyle(1, borderColor, 0.9);
      const fillW = Math.max(0, Math.round((width - 2) * r));
      const fill = this.add.rectangle(x + 1, y, fillW, Math.max(1, height - 2), fillColor, 0.95)
        .setOrigin(0, 0.5);
      const txt = this.add.text(x + width / 2, y, String(text ?? ''), {
        fontFamily: 'Consolas, monospace',
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0.5);

      return [bg, fill, txt];
    },

    renderBotsDebugRows(bots, startY) {
      const layer = this.debugBotsRowsLayer;
      if (!layer) return;
      this.clearBotsDebugRows?.();

      const rows = Array.isArray(bots) ? bots : [];
      let y = startY;
      const rowH = 64;

      for (const b of rows) {
        const card = this.add.container(8, y);
        const isCurrent = !!b?.isCurrentOpponent;
        const isPlayer = !!b?.isPlayer;
        const place = Math.max(1, Number(b?.place ?? 1));

        let bgColor = 0x171717;
        let borderColor = 0x444444;
        if (isPlayer) {
          bgColor = 0x22304f;
          borderColor = 0x78a5ff;
        }
        if (isCurrent) {
          bgColor = 0x183a34;
          borderColor = 0x5fd0b8;
        }

        const cardBg = this.add.rectangle(0, 0, 404, rowH - 4, bgColor, 0.92)
          .setOrigin(0, 0)
          .setStrokeStyle(1, borderColor, 0.95);

        const placeText = this.add.text(8, 4, String(place), {
          fontFamily: 'Consolas, monospace',
          fontSize: '22px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 3,
        }).setOrigin(0, 0);

        const titlePrefix = isPlayer ? '[YOU] ' : (isCurrent ? '> ' : '');
        const title = this.add.text(38, 5, `${titlePrefix}${b.name ?? b.id ?? 'bot'}   Lv ${Number(b.level ?? 1)}`, {
          fontFamily: 'Consolas, monospace',
          fontSize: '12px',
          color: isCurrent ? '#c6fff2' : (isPlayer ? '#d9e8ff' : '#e6e6e6'),
          fontStyle: 'bold',
        }).setOrigin(0, 0);

        const subPrefix = isPlayer ? 'player' : `x${Number(b.coinIncomeMultiplier ?? 1).toFixed(2)}`;
        const sub = this.add.text(215, 5, `${subPrefix}  ws:${Number(b.winStreak ?? 0)} ls:${Number(b.loseStreak ?? 0)}`, {
          fontFamily: 'Consolas, monospace',
          fontSize: '11px',
          color: '#b9c9c4',
        }).setOrigin(0, 0);

        const barX = 94;
        const barW = 300;
        const barH = 12;

        const hp = Number(b.hp ?? 100);
        const maxHp = Math.max(1, Number(b.maxHp ?? 100));
        const hpRatio = hp / maxHp;
        const hpLabel = this.add.text(38, 24, 'HP', {
          fontFamily: 'Consolas, monospace',
          fontSize: '11px',
          color: '#ffffff',
        }).setOrigin(0, 0.5);

        const xp = Number(b.xp ?? 0);
        const lvl = Math.max(1, Number(b.level ?? 1));
        const xpNeed = Math.max(0, Number(kingXpToNext(lvl) ?? 0));
        const xpRatio = xpNeed > 0 ? (xp / xpNeed) : 1;
        const xpText = xpNeed > 0 ? `${xp}/${xpNeed}` : 'MAX';
        const xpLabel = this.add.text(38, 38, 'XP', {
          fontFamily: 'Consolas, monospace',
          fontSize: '11px',
          color: '#ffffff',
        }).setOrigin(0, 0.5);

        const gold = Number(b.coins ?? 0);
        const goldCap = Math.max(1, Number(COINS_CAP ?? 100));
        const goldRatio = gold / goldCap;
        const goldLabel = this.add.text(38, 52, 'GOLD', {
          fontFamily: 'Consolas, monospace',
          fontSize: '11px',
          color: '#ffffff',
        }).setOrigin(0, 0.5);

        const hpBar = this.createBotDebugBar({
          x: barX, y: 22, width: barW, height: barH,
          ratio: hpRatio, fillColor: 0x2ecc71,
          text: `${hp}/${maxHp}`,
          borderColor: 0x0e3b21,
        });
        const xpBar = this.createBotDebugBar({
          x: barX, y: 36, width: barW, height: barH,
          ratio: xpRatio, fillColor: 0x4f8dff,
          text: xpText,
          borderColor: 0x203a70,
        });
        const goldBar = this.createBotDebugBar({
          x: barX, y: 50, width: barW, height: barH,
          ratio: goldRatio, fillColor: 0xf3b31f,
          text: `${gold}/${goldCap}`,
          borderColor: 0x6e4b00,
        });

        card.add([
          cardBg,
          placeText,
          title,
          sub,
          hpLabel, xpLabel, goldLabel,
          ...hpBar,
          ...xpBar,
          ...goldBar,
        ]);

        layer.add(card);
        y += rowH;
      }
    },

    refreshBotsDebugInfo() {
      if (!this.debugBotsModalText) return;

      const mm = this.battleState?.matchmaking ?? null;
      const bots = Array.isArray(mm?.bots) ? mm.bots : [];
      const pairings = Array.isArray(mm?.pairings) ? mm.pairings : [];
      const hidden = Array.isArray(mm?.hiddenBattles) ? mm.hiddenBattles : [];
      const round = Number(mm?.round ?? this.battleState?.round ?? 1);
      const playerKing = this.battleState?.kings?.player ?? {};
      const playerEntry = {
        id: 'player',
        name: 'Player',
        isPlayer: true,
        isCurrentOpponent: false,
        hp: Number(playerKing.hp ?? 100),
        maxHp: Number(playerKing.maxHp ?? 100),
        level: Number(playerKing.level ?? 1),
        xp: Number(playerKing.xp ?? 0),
        coins: Number(playerKing.coins ?? 0),
        winStreak: Number(this.battleState?.winStreak ?? 0),
        loseStreak: Number(this.battleState?.loseStreak ?? 0),
        coinIncomeMultiplier: 1,
      };

      const ratingRows = [playerEntry, ...bots.map((b) => ({ ...b }))];
      ratingRows.sort((a, b) => {
        const hpDiff = Number(b.hp ?? 0) - Number(a.hp ?? 0);
        if (hpDiff) return hpDiff;
        const maxHpDiff = Number(b.maxHp ?? 0) - Number(a.maxHp ?? 0);
        if (maxHpDiff) return maxHpDiff;
        const lvlDiff = Number(b.level ?? 1) - Number(a.level ?? 1);
        if (lvlDiff) return lvlDiff;
        const goldDiff = Number(b.coins ?? 0) - Number(a.coins ?? 0);
        if (goldDiff) return goldDiff;
        return String(a.name ?? a.id ?? '').localeCompare(String(b.name ?? b.id ?? ''));
      });
      ratingRows.forEach((row, idx) => { row.place = idx + 1; });

      const rowsStartY = 40;
      this.debugBotsModalText.setText('');
      this.renderBotsDebugRows?.(ratingRows, rowsStartY);
    },

    refreshRoundDebugInfo() {
      if (!this.debugRoundModalText) return;
      const mm = this.battleState?.matchmaking ?? null;
      const pairings = Array.isArray(mm?.pairings) ? mm.pairings : [];
      const hidden = Array.isArray(mm?.hiddenBattles) ? mm.hiddenBattles : [];
      const round = Number(mm?.round ?? this.battleState?.round ?? 1);

      const lines = [];
      lines.push(`Round: ${round}${mm?.phase ? ` (${mm.phase})` : ''}`);
      if (mm?.playerOpponentId) lines.push(`Player vs: ${mm.playerOpponentId}`);
      if (pairings.length) {
        lines.push(`Pairs (round ${round}): ${pairings.map((p) => `${p.aId} vs ${p.bId}`).join(' | ')}`);
      }
      if (hidden.length) {
        lines.push(`Hidden: ${hidden.map((h) => `${h.aId}-${h.bId}:${h.phase}${h.result ? `/${h.result}` : ''}`).join(' | ')}`);
      }
      if (!lines.length) lines.push('No round info yet');
      this.debugRoundModalText.setText(lines.join('\n'));
    },

    showDebugMenu() {
      this.debugMenuOpen = true;
      this.syncDebugUI();
    },

    hideDebugMenu() {
      this.debugMenuOpen = false;
      this.debugKingMenuOpen = false;
      this.roundInfoOpen = false;
      this.syncDebugUI();
    },

    toggleDebugMenu() {
      this.debugMenuOpen = !this.debugMenuOpen;
      if (!this.debugMenuOpen) {
        this.debugKingMenuOpen = false;
        this.roundInfoOpen = false;
      }
      this.syncDebugUI();
    },

    syncDebugUI() {
      if (this.debugBtn) this.debugBtn.setVisible(true);
      if (this.ratingBtn) {
        this.ratingBtn.setVisible(true);
        const isActive = !!this.ratingInfoOpen;
        this.ratingBtnBg?.setFillStyle(isActive ? 0x7a5635 : 0x6b4b2f, 1);
        this.ratingBtnBg?.setStrokeStyle(4, isActive ? 0xc89e68 : 0xb38a5e, 1);
        this.ratingBtnLabel?.setColor(isActive ? '#ffe4ad' : '#f3ead6');
        this.ratingBtnShadow?.setFillStyle(BUTTON_SHADOW_COLOR, 1);
        this.ratingBtnShadow?.setAlpha(BUTTON_SHADOW_ALPHA);
        this.ratingBtn.setAlpha(isActive ? 1 : 0.94);
      }
      if (this.debugModal) this.debugModal.setVisible(!!this.debugMenuOpen);
      if (this.debugKingModal) this.debugKingModal.setVisible(!!this.debugMenuOpen && !!this.debugKingMenuOpen);
      if (this.debugBotsModal) {
        this.refreshBotsDebugInfo?.();
        this.debugBotsModal.setVisible(!!this.ratingInfoOpen);
      }
      if (this.debugRoundModal) {
        this.refreshRoundDebugInfo?.();
        this.debugRoundModal.setVisible(!!this.debugMenuOpen && !!this.roundInfoOpen);
      }

      const canBattle = !!this.debugCanStartBattle;
      this.syncTestSceneUi?.(canBattle);

      if (this.battleBtn) {
        this.battleBtn.setVisible(false);
        if (this.battleBtn.input) this.battleBtn.input.enabled = canBattle;
        this.battleBtn.setAlpha(canBattle ? 1 : 0.4);
      }
      if (this.roundBattleBtn) {
        const visible = !this.testSceneActive && !!this.battleState?.matchmaking?.allOpponentsBots && canBattle;
        this.roundBattleBtn.setVisible(visible);
        if (this.roundBattleBtnHit) {
          this.roundBattleBtnHit.setVisible(visible);
          if (this.roundBattleBtnHit.input) this.roundBattleBtnHit.input.enabled = visible && canBattle;
        }
        this.roundBattleBtn.setAlpha(1);
        this.updateRoundBattleBtnVisual?.(false);
      }

      if (this.debugExitBtn) {
        this.debugExitBtn.setVisible(!!this.debugMenuOpen);
      }

      if (this.debugGoldBtn) {
        this.debugGoldBtn.setVisible(!!this.debugMenuOpen);
      }

      if (this.debugLevelBtn) {
        this.debugLevelBtn.setVisible(!!this.debugMenuOpen);
      }

      if (this.debugBotsBtn) {
        this.debugBotsBtn.setVisible(!!this.debugMenuOpen);
        this.debugBotsBtn.setAlpha(this.roundInfoOpen ? 1 : 0.9);
      }

      if (this.debugTestSceneBtn) {
        this.debugTestSceneBtn.setVisible(!!this.debugMenuOpen);
        this.debugTestSceneBtn.setAlpha(this.testSceneActive ? 0.7 : 1);
      }
      if (this.debugHexShadowBtn) {
        this.debugHexShadowBtn.setVisible(!!this.debugMenuOpen);
        const active = !!this.debugShowHexShadowDuringBattle;
        this.debugHexShadowBtn.setAlpha(active ? 1 : 0.9);
        this.debugHexShadowBtn.setText(`${active ? '[x]' : '[ ]'} HEX SHADOW`);
      }

      if (this.debugKingBtn) {
        this.debugKingBtn.setVisible(!!this.debugMenuOpen);
        this.debugKingBtn.setAlpha(this.debugKingMenuOpen ? 1 : 0.9);
      }

      for (const btn of (this.debugKingSkinButtons ?? [])) {
        const active = btn?._kingTextureKey === this.localPlayerKingTextureKey;
        btn?.setVisible?.(!!this.debugMenuOpen && !!this.debugKingMenuOpen);
        btn?.setAlpha?.(active ? 1 : 0.85);
        if (btn?.setStyle) {
          btn.setStyle({
            backgroundColor: active ? 'rgba(0,90,40,0.75)' : 'rgba(0,0,0,0.55)',
          });
        }
      }
    },
  });
}
