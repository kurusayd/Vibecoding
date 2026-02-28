import Phaser from 'phaser';

const MENU_TEXT = {
  PLAY: '\u0418\u0433\u0440\u0430\u0442\u044c',
  SHOP: '\u041c\u0430\u0433\u0430\u0437\u0438\u043d',
  STORY: '\u0418\u0441\u0442\u043e\u0440\u0438\u044f',
  COLLECTION: '\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f',
  TEST_SCENE: '\u0422\u0435\u0441\u0442\u043e\u0432\u0430\u044f \u0441\u0446\u0435\u043d\u0430',
};
const MENU_BLOCK_OFFSET_X = 280; // двигай весь блок кнопок меню по X

export default class StartScene extends Phaser.Scene {
  constructor() {
    super('StartScene');
  }

  preload() {
    this.load.image('menuMainBg', '/assets/menu/main.png');
  }

  create() {
    this.bg = this.add.image(0, 0, 'menuMainBg')
      .setOrigin(0, 0)
      .setDepth(-10);
    this.resizeBackground();

    const cx = this.scale.width / 2 + MENU_BLOCK_OFFSET_X;
    const cy = this.scale.height / 2;
    const gap = 74;
    const labels = [
      MENU_TEXT.PLAY,
      MENU_TEXT.SHOP,
      MENU_TEXT.STORY,
      MENU_TEXT.COLLECTION,
      MENU_TEXT.TEST_SCENE,
    ];

    this.menuButtons = labels.map((label, idx) => {
      const y = cy - (gap * 1.5) + (idx * gap);
      const btn = this.add.text(cx, y, label, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.45)',
        padding: { left: 28, right: 28, top: 12, bottom: 12 },
      })
        .setOrigin(0.5, 0.5)
        .setDepth(20)
        .setStroke('#888888', 3)
        .setShadow(0, 0, '#000000', 2, true, true)
        .setInteractive({ useHandCursor: true });

      btn.on('pointerover', () => btn.setScale(1.03));
      btn.on('pointerout', () => btn.setScale(1));
      btn.on('pointerdown', () => this.onMenuClick(label));
      return btn;
    });

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.events.once('destroy', () => this.scale.off('resize', this.onResize, this));
  }

  onMenuClick(label) {
    if (label === MENU_TEXT.PLAY) {
      this.scene.start('BattleScene', { autoStart: true });
      return;
    }
    if (label === MENU_TEXT.TEST_SCENE) {
      this.scene.start('BattleScene', { openTestScene: true });
      return;
    }
    // placeholders for next iterations
    console.log(`[StartScene] TODO action: ${label}`);
  }

  onResize() {
    this.resizeBackground();
    const cx = this.scale.width / 2 + MENU_BLOCK_OFFSET_X;
    const cy = this.scale.height / 2;
    const gap = 74;
    this.menuButtons?.forEach?.((btn, idx) => {
      btn.setPosition(cx, cy - (gap * 1.5) + (idx * gap));
    });
  }

  resizeBackground() {
    if (!this.bg) return;
    const designW = 1280;
    const designH = 720;
    const scaleX = designW / this.bg.width;
    const scaleY = designH / this.bg.height;
    const scale = Math.max(scaleX, scaleY);
    this.bg.setScale(scale);
  }
}
