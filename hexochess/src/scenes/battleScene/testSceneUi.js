import { TEST_SCENE_UNITS } from './testScene.js';

const TEST_SCENE_RACES = [
  { key: 'HUMAN', label: 'HUMAN', bg: 'rgba(30,70,130,0.72)' },
  { key: 'LIZARD', label: 'LIZARD', bg: 'rgba(60,90,40,0.72)' },
  { key: 'UNDEAD', label: 'UNDEAD', bg: 'rgba(70,50,90,0.72)' },
  { key: 'DEMON', label: 'DEMON', bg: 'rgba(120,45,35,0.78)' },
  { key: 'GOD', label: 'GOD', bg: 'rgba(120,100,35,0.78)' },
];

const TEST_SCENE_ENEMY_KING_SKINS = [
  { label: 'FROG', key: 'king_frog' },
  { label: 'PRINCESS', key: 'king_princess' },
  { label: 'KING', key: 'king_king' },
  { label: 'BLACK KNIGHT', key: 'black_knight' },
  { label: 'BLACK PAWN', key: 'black_pawn' },
  { label: 'WHITE KNIGHT', key: 'white_knight' },
  { label: 'WHITE PAWN', key: 'white_pawn' },
];

export function installBattleSceneTestSceneUi(BattleScene) {
  Object.assign(BattleScene.prototype, {
    initTestSceneUi() {
      this.testSceneSpawnRankMenuOpen = false;
      this.testScenePendingSpawnUnitType = null;
      this.testSceneEnemyKingMenuOpen = false;
      this.testSceneEnemyKingSkinButtons = [];

      this.testSceneUnitsBtn = this.add.text(0, 0, 'UNITS', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,70,110,0.72)',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
        .setOrigin(1, 0)
        .setDepth(10020)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);
      this.testSceneUnitsBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        if (!this.testSceneActive) return;
        const nextOpen = !this.testSceneUnitsMenuOpen;
        this.testSceneUnitsMenuOpen = nextOpen;
        if (nextOpen) this.testSceneUnitsMenuRace = null;
        this.refreshTestSceneUnitsMenuContent?.();
        this.syncDebugUI?.();
      });

      this.testSceneBattleBtn = this.add.text(0, 0, 'БОЙ', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.72)',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
        .setOrigin(1, 0)
        .setDepth(10020)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);
      this.testSceneBattleBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        if (!this.testSceneActive) return;
        if (!this.debugCanStartBattle) return;
        this.startTestSceneBattleFromPrep?.();
      });

      this.testSceneStopBtn = this.add.text(0, 0, 'STOP', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: 'rgba(120,40,40,0.72)',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
        .setOrigin(1, 0)
        .setDepth(10020)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);
      this.testSceneStopBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        if (!this.testSceneActive) return;
        this.restoreTestSceneBattleFromSnapshot?.();
      });

      this.testSceneExitBtn = this.add.text(0, 0, 'EXIT', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: 'rgba(120,0,0,0.72)',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
        .setOrigin(1, 0)
        .setDepth(10020)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);
      this.testSceneExitBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        if (!this.testSceneActive) return;
        this.exitTestScene?.();
        this.scene.start('StartScene');
      });

      this.testSceneEnemyKingBtn = this.add.text(0, 0, 'ENEMY KING', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: 'rgba(70,40,100,0.78)',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
        .setOrigin(1, 0)
        .setDepth(10020)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);
      this.testSceneEnemyKingBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        if (!this.testSceneActive) return;
        this.testSceneEnemyKingMenuOpen = !this.testSceneEnemyKingMenuOpen;
        this.syncDebugUI?.();
      });

      this.testSceneEnemyKingModal = this.add.container(0, 0)
        .setDepth(10026)
        .setScrollFactor(0)
        .setVisible(false);
      this.testSceneEnemyKingModalBg = this.add.rectangle(0, 0, 220, 14 + TEST_SCENE_ENEMY_KING_SKINS.length * 38 + 16, 0x111111, 0.94)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x666666, 0.95);
      this.testSceneEnemyKingModalHit = this.add.zone(0, 0, 220, 14 + TEST_SCENE_ENEMY_KING_SKINS.length * 38 + 16)
        .setOrigin(0, 0)
        .setInteractive();
      this.testSceneEnemyKingModalHit.on('pointerdown', (pointer) => pointer?.event?.stopPropagation?.());
      this.testSceneEnemyKingModalTitle = this.add.text(110, 12, 'ENEMY KING', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5, 0);
      this.testSceneEnemyKingModal.add([
        this.testSceneEnemyKingModalHit,
        this.testSceneEnemyKingModalBg,
        this.testSceneEnemyKingModalTitle,
      ]);

      TEST_SCENE_ENEMY_KING_SKINS.forEach((skin, idx) => {
        const btn = this.add.text(110, 42 + idx * 38, skin.label, {
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
          fontSize: '16px',
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.55)',
          padding: { left: 12, right: 12, top: 7, bottom: 7 },
        })
          .setOrigin(0.5, 0)
          .setDepth(10027)
          .setInteractive({ useHandCursor: true });
        btn._testSceneEnemyKingTextureKey = skin.key;
        btn.on('pointerdown', (pointer) => {
          pointer?.event?.stopPropagation?.();
          if (!this.testSceneActive) return;
          this.showTestSceneEnemyKingPreview?.(skin.key);
          this.testSceneEnemyKingMenuOpen = false;
          this.syncDebugUI?.();
        });
        this.testSceneEnemyKingSkinButtons.push(btn);
        this.testSceneEnemyKingModal.add(btn);
      });

      this.testSceneUnitsMenu = this.add.container(0, 0)
        .setDepth(10025)
        .setScrollFactor(0)
        .setVisible(false);

      const menuW = 220;
      const maxUnitsPerRace = Math.max(
        1,
        ...TEST_SCENE_RACES.map((race) => TEST_SCENE_UNITS.filter((u) => u.race === race.key).length)
      );
      const menuH = Math.max(160, 14 + (Math.max(TEST_SCENE_RACES.length, maxUnitsPerRace + 1) * 46) + 8);

      this.testSceneUnitsMenuBg = this.add.rectangle(0, 0, menuW, menuH, 0x111111, 0.94)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x666666, 0.95);
      this.testSceneUnitsMenuHit = this.add.zone(0, 0, menuW, menuH)
        .setOrigin(0, 0)
        .setInteractive();
      this.testSceneUnitsMenuHit.on('pointerdown', (pointer) => pointer?.event?.stopPropagation?.());

      this.testSceneRaceButtons = [];
      this.testSceneUnitButtons = [];
      this.testSceneUnitsMenu.add([this.testSceneUnitsMenuHit, this.testSceneUnitsMenuBg]);

      TEST_SCENE_RACES.forEach((race, idx) => {
        const btn = this.add.text(menuW / 2, 14 + idx * 46, race.label, {
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
          fontSize: '16px',
          color: '#ffffff',
          backgroundColor: race.bg,
          padding: { left: 12, right: 12, top: 7, bottom: 7 },
        })
          .setOrigin(0.5, 0)
          .setDepth(10026)
          .setInteractive({ useHandCursor: true });
        btn._testSceneRace = race.key;
        btn.on('pointerdown', (pointer) => {
          pointer?.event?.stopPropagation?.();
          if (!this.testSceneActive) return;
          this.testSceneUnitsMenuRace = race.key;
          this.refreshTestSceneUnitsMenuContent?.();
          this.syncDebugUI?.();
        });
        this.testSceneRaceButtons.push(btn);
        this.testSceneUnitsMenu.add(btn);
      });

      this.testSceneUnitsBackBtn = this.add.text(menuW / 2, 14, '← BACK TO RACES', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: 'rgba(60,60,60,0.75)',
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
        .setOrigin(0.5, 0)
        .setDepth(10026)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);
      this.testSceneUnitsBackBtn.on('pointerdown', (pointer) => {
        pointer?.event?.stopPropagation?.();
        if (!this.testSceneActive) return;
        this.testSceneUnitsMenuRace = null;
        this.refreshTestSceneUnitsMenuContent?.();
        this.syncDebugUI?.();
      });
      this.testSceneUnitsMenu.add(this.testSceneUnitsBackBtn);

      TEST_SCENE_UNITS.forEach((def, idx) => {
        const btn = this.add.text(menuW / 2, 14 + idx * 46, def.label, {
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
          fontSize: '15px',
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.55)',
          padding: { left: 8, right: 8, top: 6, bottom: 6 },
        })
          .setOrigin(0.5, 0)
          .setDepth(10026)
          .setInteractive({ useHandCursor: true });
        btn.on('pointerdown', (pointer) => {
          pointer?.event?.stopPropagation?.();
          if (!this.testSceneActive) return;
          this.openTestSceneSpawnRankMenu?.(def.type);
        });
        btn._testSceneRace = def.race ?? null;
        this.testSceneUnitButtons.push(btn);
        this.testSceneUnitsMenu.add(btn);
      });

      this.refreshTestSceneUnitsMenuContent?.();

      this.testSceneSpawnRankMenu = this.add.container(0, 0)
        .setDepth(10027)
        .setScrollFactor(0)
        .setVisible(false);
      this.testSceneSpawnRankMenuBg = this.add.rectangle(0, 0, 150, 64, 0x111111, 0.95)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x777777, 0.95);
      this.testSceneSpawnRankMenuHit = this.add.zone(0, 0, 150, 64)
        .setOrigin(0, 0)
        .setInteractive();
      this.testSceneSpawnRankMenuHit.on('pointerdown', (pointer) => pointer?.event?.stopPropagation?.());
      this.testSceneSpawnRankMenuTitle = this.add.text(75, 8, 'RANK', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#ffffff',
      }).setOrigin(0.5, 0);
      this.testSceneSpawnRankMenu.add([
        this.testSceneSpawnRankMenuHit,
        this.testSceneSpawnRankMenuBg,
        this.testSceneSpawnRankMenuTitle,
      ]);

      this.testSceneSpawnRankButtons = [];
      ['R1', 'R2', 'R3'].forEach((label, idx) => {
        const btn = this.add.text(15 + idx * 44, 32, label, {
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
          fontSize: '14px',
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.55)',
          padding: { left: 8, right: 8, top: 5, bottom: 5 },
        })
          .setOrigin(0, 0)
          .setDepth(10028)
          .setInteractive({ useHandCursor: true });
        btn._spawnRankValue = idx + 1;
        btn.on('pointerdown', (pointer) => {
          pointer?.event?.stopPropagation?.();
          if (!this.testSceneActive) return;
          const type = this.testScenePendingSpawnUnitType;
          if (!type) return;
          this.spawnTestScenePlayerUnit?.(type, { rank: btn._spawnRankValue });
          this.hideTestSceneSpawnRankMenu?.({ closeUnitsMenu: true });
          this.syncDebugUI?.();
        });
        this.testSceneSpawnRankButtons.push(btn);
        this.testSceneSpawnRankMenu.add(btn);
      });
    },

    openTestSceneSpawnRankMenu(unitType) {
      if (!this.testSceneActive) return;
      this.testScenePendingSpawnUnitType = unitType ?? null;
      this.testSceneSpawnRankMenuOpen = !!unitType;
      this.testSceneEnemyKingMenuOpen = false;
      this.positionTestSceneUi?.();
      this.syncTestSceneUi?.(this.debugCanStartBattle ?? false);
    },

    hideTestSceneSpawnRankMenu({ closeUnitsMenu = false } = {}) {
      this.testSceneSpawnRankMenuOpen = false;
      this.testScenePendingSpawnUnitType = null;
      if (closeUnitsMenu) {
        this.testSceneUnitsMenuRace = null;
        this.testSceneUnitsMenuOpen = false;
        this.refreshTestSceneUnitsMenuContent?.();
      }
      this.syncTestSceneUi?.(this.debugCanStartBattle ?? false);
    },

    refreshTestSceneUnitsMenuContent() {
      if (!this.testSceneUnitsMenuBg || !this.testSceneUnitsMenuHit) return;

      const menuW = 220;
      const rowStep = 46;
      const top = 14;
      const selectedRace = this.testSceneUnitsMenuRace ?? null;
      const raceButtons = this.testSceneRaceButtons ?? [];
      const unitButtons = this.testSceneUnitButtons ?? [];

      if (!selectedRace) {
        const rows = Math.max(1, raceButtons.length);
        const h = Math.max(120, top + rows * rowStep + 8);
        this.testSceneUnitsMenuBg.setSize(menuW, h);
        this.testSceneUnitsMenuHit.setSize(menuW, h);

        raceButtons.forEach((btn, idx) => {
          btn.setPosition(menuW / 2, top + idx * rowStep);
          btn.setVisible(true);
        });

        if (this.testSceneUnitsBackBtn) this.testSceneUnitsBackBtn.setVisible(false);
        unitButtons.forEach((btn) => btn.setVisible(false));
        return;
      }

      const visibleUnits = unitButtons.filter((btn) => btn?._testSceneRace === selectedRace);
      const rows = 1 + Math.max(1, visibleUnits.length);
      const h = Math.max(160, top + rows * rowStep + 8);
      this.testSceneUnitsMenuBg.setSize(menuW, h);
      this.testSceneUnitsMenuHit.setSize(menuW, h);

      raceButtons.forEach((btn) => btn.setVisible(false));

      if (this.testSceneUnitsBackBtn) {
        this.testSceneUnitsBackBtn.setPosition(menuW / 2, top).setVisible(true);
      }

      let i = 0;
      for (const btn of unitButtons) {
        const show = btn?._testSceneRace === selectedRace;
        btn.setVisible(show);
        if (!show) continue;
        btn.setPosition(menuW / 2, top + rowStep + i * rowStep);
        i += 1;
      }
    },

    positionTestSceneUi() {
      if (this.testSceneExitBtn && this.debugBtn) {
        const gap = 8;
        const debugLeft = this.debugBtn.x - (this.debugBtn.width ?? this.debugBtn.displayWidth ?? 0);
        this.testSceneExitBtn.setPosition(debugLeft - gap, 14);
      }
      if (this.testSceneEnemyKingBtn && this.testSceneExitBtn) {
        const gap = 8;
        const exitLeft = this.testSceneExitBtn.x - (this.testSceneExitBtn.width ?? this.testSceneExitBtn.displayWidth ?? 0);
        this.testSceneEnemyKingBtn.setPosition(exitLeft - gap, 14);
      }
      if (this.testSceneUnitsBtn && (this.testSceneEnemyKingBtn || this.testSceneExitBtn)) {
        const gap = 8;
        const anchor = this.testSceneEnemyKingBtn ?? this.testSceneExitBtn;
        const anchorLeft = anchor.x - (anchor.width ?? anchor.displayWidth ?? 0);
        this.testSceneUnitsBtn.setPosition(anchorLeft - gap, 14);
      }
      if (this.testSceneStopBtn && this.testSceneUnitsBtn) {
        const gap = 8;
        const unitsLeft = this.testSceneUnitsBtn.x - (this.testSceneUnitsBtn.width ?? this.testSceneUnitsBtn.displayWidth ?? 0);
        this.testSceneStopBtn.setPosition(unitsLeft - gap, 14);
      }
      if (this.testSceneBattleBtn && (this.testSceneStopBtn || this.testSceneUnitsBtn)) {
        const gap = 8;
        const anchor = this.testSceneStopBtn ?? this.testSceneUnitsBtn;
        const anchorLeft = anchor.x - (anchor.width ?? anchor.displayWidth ?? 0);
        this.testSceneBattleBtn.setPosition(anchorLeft - gap, 14);
      }
      if (this.testSceneUnitsMenu && this.testSceneUnitsBtn) {
        this.refreshTestSceneUnitsMenuContent?.();
        const menuW = this.testSceneUnitsMenuBg?.width ?? 220;
        const x = Math.max(8, (this.testSceneUnitsBtn.x - (this.testSceneUnitsBtn.width ?? this.testSceneUnitsBtn.displayWidth ?? 0)));
        this.testSceneUnitsMenu.setPosition(Math.max(8, x - (menuW - (this.testSceneUnitsBtn.width ?? 80))), 48);
      }
      if (this.testSceneSpawnRankMenu && this.testSceneUnitsMenu) {
        const menuX = this.testSceneUnitsMenu.x ?? 8;
        const menuY = this.testSceneUnitsMenu.y ?? 48;
        const menuW = this.testSceneUnitsMenuBg?.width ?? 220;
        const rankW = this.testSceneSpawnRankMenuBg?.width ?? 150;
        this.testSceneSpawnRankMenu.setPosition(
          Math.max(8, Math.round(menuX + (menuW - rankW) / 2)),
          Math.round(menuY + 10),
        );
      }
      if (this.testSceneEnemyKingModal && this.testSceneEnemyKingBtn) {
        const modalW = this.testSceneEnemyKingModalBg?.width ?? 220;
        const btnW = this.testSceneEnemyKingBtn.width ?? this.testSceneEnemyKingBtn.displayWidth ?? 120;
        const x = Math.max(8, Math.round(this.testSceneEnemyKingBtn.x - modalW + btnW));
        this.testSceneEnemyKingModal.setPosition(x, 48);
      }
    },

    syncTestSceneUi(canBattle = false) {
      if (this.testSceneUnitsBtn) this.testSceneUnitsBtn.setVisible(!!this.testSceneActive);
      if (this.testSceneBattleBtn) this.testSceneBattleBtn.setVisible(!!this.testSceneActive);
      if (this.testSceneStopBtn) this.testSceneStopBtn.setVisible(!!this.testSceneActive);
      if (this.testSceneExitBtn) this.testSceneExitBtn.setVisible(!!this.testSceneActive);
      if (this.testSceneEnemyKingBtn) {
        this.testSceneEnemyKingBtn.setVisible(!!this.testSceneActive);
        this.testSceneEnemyKingBtn.setAlpha(this.testSceneEnemyKingMenuOpen ? 1 : 0.92);
      }
      if (this.testSceneUnitsMenu) this.testSceneUnitsMenu.setVisible(!!this.testSceneActive && !!this.testSceneUnitsMenuOpen);
      if (this.testSceneSpawnRankMenu) this.testSceneSpawnRankMenu.setVisible(!!this.testSceneActive && !!this.testSceneSpawnRankMenuOpen);
      if (this.testSceneEnemyKingModal) {
        this.testSceneEnemyKingModal.setVisible(!!this.testSceneActive && !!this.testSceneEnemyKingMenuOpen);
      }
      if (this.testSceneBattleBtn) {
        if (this.testSceneBattleBtn.input) this.testSceneBattleBtn.input.enabled = !!canBattle;
        this.testSceneBattleBtn.setAlpha(canBattle ? 1 : 0.4);
      }
      if (this.testSceneStopBtn) {
        const canStop = !!this.testSceneActive && !!(this.testSceneBattleStartSnapshot?.length) &&
          ((this.battleState?.phase === 'battle') || (this.battleState?.result != null));
        if (this.testSceneStopBtn.input) this.testSceneStopBtn.input.enabled = canStop;
        this.testSceneStopBtn.setAlpha(canStop ? 1 : 0.4);
      }
      if (this.testSceneSpawnRankButtons?.length) {
        for (const btn of this.testSceneSpawnRankButtons) {
          btn?.setVisible?.(!!this.testSceneActive && !!this.testSceneSpawnRankMenuOpen);
        }
      }
      for (const btn of (this.testSceneEnemyKingSkinButtons ?? [])) {
        const active = btn?._testSceneEnemyKingTextureKey === this.testSceneEnemyKingSkinKey;
        btn?.setVisible?.(!!this.testSceneActive && !!this.testSceneEnemyKingMenuOpen);
        btn?.setAlpha?.(active ? 1 : 0.85);
        btn?.setStyle?.({
          backgroundColor: active ? 'rgba(0,90,40,0.75)' : 'rgba(0,0,0,0.55)',
        });
      }

    },
  });
}
