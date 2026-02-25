import { installBattleSceneTestSceneUi } from './testSceneUi.js';

const KING_DEBUG_SKINS = [
  { label: 'ЛЯГУШКА', key: 'king_frog' },
  { label: 'ПРИНЦЕССА', key: 'king_princess' },
  { label: 'КОРОЛЬ', key: 'king_king' },
];

export function installBattleSceneDebugUi(BattleScene) {
  // Install test scene UI first, because debug UI delegates part of its layout/sync to it.
  installBattleSceneTestSceneUi(BattleScene);

  Object.assign(BattleScene.prototype, {
    initDebugUi() {
      // Debug / test-scene UI state lives on BattleScene instance so gameplay modules can read it.
      this.debugMenuOpen = false;
      this.debugKingMenuOpen = false;
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

      this.debugBtn = this.add.text(this.scale.width - 14, 14, 'Debug', {
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

      this.debugModal = this.add.container(0, 0)
        .setDepth(10030)
        .setScrollFactor(0)
        .setVisible(false);

      this.debugModalBg = this.add.rectangle(0, 0, 180, 210, 0x111111, 0.94)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x666666, 0.95);

      this.debugModalTitle = this.add.text(90, 12, 'DEBUG', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);

      this.battleBtn = this.add.text(90, 44, 'БОЙ', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.55)',
        padding: { left: 18, right: 18, top: 8, bottom: 8 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });

      this.debugExitBtn = this.add.text(90, 120, 'ВЫХОД', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: 'rgba(120,0,0,0.65)',
        padding: { left: 14, right: 14, top: 8, bottom: 8 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });

      this.debugTestSceneBtn = this.add.text(90, 158, 'TEST SCENE', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '17px',
        color: '#ffffff',
        backgroundColor: 'rgba(70,40,110,0.70)',
        padding: { left: 10, right: 10, top: 7, bottom: 7 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });

      this.debugKingBtn = this.add.text(90, 82, 'КОРОЛЬ', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,60,110,0.65)',
        padding: { left: 12, right: 12, top: 8, bottom: 8 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10031)
        .setInteractive({ useHandCursor: true });

      this.debugModalHit = this.add.zone(0, 0, 180, 210)
        .setOrigin(0, 0)
        .setInteractive();
      this.debugModalHit.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
      });

      this.debugModal.add([
        this.debugModalHit,
        this.debugModalBg,
        this.debugModalTitle,
        this.battleBtn,
        this.debugKingBtn,
        this.debugExitBtn,
        this.debugTestSceneBtn,
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

      this.debugKingBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        this.debugKingMenuOpen = !this.debugKingMenuOpen;
        this.syncDebugUI?.();
      });
      this.debugTestSceneBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        this.enterTestScene?.();
        this.hideDebugMenu?.();
      });
      this.debugExitBtn.on('pointerdown', () => {
        this.ws?.sendIntentResetGame?.();
        this.hideDebugMenu?.();
      });

      // Test scene top-right controls are installed by a dedicated UI module.
      this.initTestSceneUi?.();
      this.positionDebugUI?.();
      this.syncDebugUI?.();
    },

    positionDebugUI() {
      if (this.debugBtn) {
        this.debugBtn.setPosition(this.scale.width - 14, 14);
      }
      this.positionTestSceneUi?.();

      if (this.debugModal) {
        const modalW = this.debugModalBg?.width ?? 180;
        const x = this.scale.width - modalW - 14;
        const y = 48;
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
    },

    showDebugMenu() {
      this.debugMenuOpen = true;
      this.syncDebugUI();
    },

    hideDebugMenu() {
      this.debugMenuOpen = false;
      this.debugKingMenuOpen = false;
      this.syncDebugUI();
    },

    toggleDebugMenu() {
      this.debugMenuOpen = !this.debugMenuOpen;
      if (!this.debugMenuOpen) this.debugKingMenuOpen = false;
      this.syncDebugUI();
    },

    syncDebugUI() {
      if (this.debugBtn) this.debugBtn.setVisible(true);
      if (this.debugModal) this.debugModal.setVisible(!!this.debugMenuOpen);
      if (this.debugKingModal) this.debugKingModal.setVisible(!!this.debugMenuOpen && !!this.debugKingMenuOpen);

      const canBattle = !!this.debugCanStartBattle;
      this.syncTestSceneUi?.(canBattle);

      if (this.battleBtn) {
        this.battleBtn.setVisible(!!this.debugMenuOpen);
        if (this.battleBtn.input) this.battleBtn.input.enabled = canBattle;
        this.battleBtn.setAlpha(canBattle ? 1 : 0.4);
      }

      if (this.debugExitBtn) {
        this.debugExitBtn.setVisible(!!this.debugMenuOpen);
      }

      if (this.debugTestSceneBtn) {
        this.debugTestSceneBtn.setVisible(!!this.debugMenuOpen);
        this.debugTestSceneBtn.setAlpha(this.testSceneActive ? 0.7 : 1);
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

