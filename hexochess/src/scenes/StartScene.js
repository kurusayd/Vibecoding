import Phaser from 'phaser';
import { createFullscreenButton, positionFullscreenButton } from '../game/ui.js';

const MENU_TEXT = {
  PLAY: '\u0418\u0433\u0440\u0430\u0442\u044c',
  SHOP: '\u041c\u0430\u0433\u0430\u0437\u0438\u043d',
  STORY: '\u0418\u0441\u0442\u043e\u0440\u0438\u044f',
  COLLECTION: '\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f',
  TEST_SCENE: '\u0422\u0435\u0441\u0442\u043e\u0432\u0430\u044f',
};
const MENU_BUTTON_TEXTURE_KEY = 'menuButtonBg';
const MENU_BUTTON_VERTICAL_GAP_PX = -25;
const MENU_BUTTON_SCALE = 0.92;
const MENU_BUTTON_HOVER_SCALE_MUL = 1.015;
const MENU_BUTTON_TEXT_OFFSET_Y = 4;
const MENU_BUTTON_SHADOW_OFFSET_Y = 5;
const MENU_BUTTON_PRESS_OFFSET_Y = 2;
const MENU_BUTTON_SHADOW_ALPHA = 0.32;
const MENU_BUTTON_SHADOW_WIDTH_MUL = 0.96;
const MENU_BLOCK_OFFSET_X = 280; // move whole menu block on X
const MENU_BLOCK_OFFSET_Y = 80; // move whole menu block on Y

export default class StartScene extends Phaser.Scene {
  constructor() {
    super('StartScene');
  }

  preload() {
    this.load.image('menuMainBg', '/assets/menu/main.png');
    this.load.image(MENU_BUTTON_TEXTURE_KEY, '/assets/buttons/bt_menu.png');
  }

  create() {
    this.bg = this.add.image(0, 0, 'menuMainBg')
      .setOrigin(0, 0)
      .setDepth(-10);
    this.resizeBackground();

    const cx = this.scale.width / 2 + MENU_BLOCK_OFFSET_X;
    const cy = this.scale.height / 2 + MENU_BLOCK_OFFSET_Y;
    const labels = [
      MENU_TEXT.PLAY,
      MENU_TEXT.SHOP,
      MENU_TEXT.STORY,
      MENU_TEXT.COLLECTION,
      MENU_TEXT.TEST_SCENE,
    ];
    const btnSource = this.textures.get(MENU_BUTTON_TEXTURE_KEY)?.getSourceImage?.();
    const btnW = btnSource?.width ?? 300;
    const btnH = btnSource?.height ?? 64;
    const buttonStep = btnH + MENU_BUTTON_VERTICAL_GAP_PX;
    const yStart = cy - ((labels.length - 1) * buttonStep) / 2;

    this.menuButtons = labels.map((label, idx) => {
      const y = yStart + (idx * buttonStep);
      const btnShadow = this.add.image(cx, y + MENU_BUTTON_SHADOW_OFFSET_Y, MENU_BUTTON_TEXTURE_KEY)
        .setOrigin(0.5, 0.5)
        .setDepth(19)
        .setScale(MENU_BUTTON_SCALE * MENU_BUTTON_SHADOW_WIDTH_MUL, MENU_BUTTON_SCALE)
        .setTint(0x000000)
        .setAlpha(MENU_BUTTON_SHADOW_ALPHA);

      const btnBg = this.add.image(cx, y, MENU_BUTTON_TEXTURE_KEY)
        .setOrigin(0.5, 0.5)
        .setDepth(20)
        .setScale(MENU_BUTTON_SCALE)
        .setInteractive({ useHandCursor: true });

      const btnText = this.add.text(cx, y + MENU_BUTTON_TEXT_OFFSET_Y, String(label).toUpperCase(), {
        fontFamily: 'CormorantSC-SemiBold, CormorantSC-Regular, Georgia, serif',
        fontSize: '30px',
        color: '#f7dec1',
      })
        .setOrigin(0.5, 0.5)
        .setDepth(21)
        .setStroke('#a06f4a', 1)
        .setShadow(0, 3, '#1a1009', 0, true, true)
        .setResolution(2);

      btnBg.on('pointerover', () => {
        btnShadow.setPosition(cx, y + MENU_BUTTON_SHADOW_OFFSET_Y);
        btnBg.setPosition(cx, y);
        btnText.setPosition(cx, y + MENU_BUTTON_TEXT_OFFSET_Y);
        btnShadow.setScale(
          MENU_BUTTON_SCALE * MENU_BUTTON_SHADOW_WIDTH_MUL * MENU_BUTTON_HOVER_SCALE_MUL,
          MENU_BUTTON_SCALE * MENU_BUTTON_HOVER_SCALE_MUL
        );
        btnBg.setScale(MENU_BUTTON_SCALE * MENU_BUTTON_HOVER_SCALE_MUL);
        btnText.setScale(MENU_BUTTON_HOVER_SCALE_MUL);
      });
      btnBg.on('pointerout', () => {
        btnShadow.setPosition(cx, y + MENU_BUTTON_SHADOW_OFFSET_Y);
        btnBg.setPosition(cx, y);
        btnText.setPosition(cx, y + MENU_BUTTON_TEXT_OFFSET_Y);
        btnShadow.setScale(MENU_BUTTON_SCALE * MENU_BUTTON_SHADOW_WIDTH_MUL, MENU_BUTTON_SCALE);
        btnBg.setScale(MENU_BUTTON_SCALE);
        btnText.setScale(1);
      });
      btnBg.on('pointerdown', () => {
        btnShadow.setPosition(cx, y + MENU_BUTTON_SHADOW_OFFSET_Y + MENU_BUTTON_PRESS_OFFSET_Y);
        btnBg.setPosition(cx, y + MENU_BUTTON_PRESS_OFFSET_Y);
        btnText.setPosition(cx, y + MENU_BUTTON_TEXT_OFFSET_Y + MENU_BUTTON_PRESS_OFFSET_Y);
        btnShadow.setScale(
          MENU_BUTTON_SCALE * MENU_BUTTON_SHADOW_WIDTH_MUL * 0.99,
          MENU_BUTTON_SCALE * 0.99
        );
        btnBg.setScale(MENU_BUTTON_SCALE * 0.99);
        btnText.setScale(0.99);
      });
      btnBg.on('pointerup', () => {
        btnShadow.setPosition(cx, y + MENU_BUTTON_SHADOW_OFFSET_Y);
        btnBg.setPosition(cx, y);
        btnText.setPosition(cx, y + MENU_BUTTON_TEXT_OFFSET_Y);
        btnShadow.setScale(
          MENU_BUTTON_SCALE * MENU_BUTTON_SHADOW_WIDTH_MUL * MENU_BUTTON_HOVER_SCALE_MUL,
          MENU_BUTTON_SCALE * MENU_BUTTON_HOVER_SCALE_MUL
        );
        btnBg.setScale(MENU_BUTTON_SCALE * MENU_BUTTON_HOVER_SCALE_MUL);
        btnText.setScale(MENU_BUTTON_HOVER_SCALE_MUL);
        this.onMenuClick(label);
      });
      btnBg.on('pointerupoutside', () => {
        btnShadow.setPosition(cx, y + MENU_BUTTON_SHADOW_OFFSET_Y);
        btnBg.setPosition(cx, y);
        btnText.setPosition(cx, y + MENU_BUTTON_TEXT_OFFSET_Y);
        btnShadow.setScale(MENU_BUTTON_SCALE * MENU_BUTTON_SHADOW_WIDTH_MUL, MENU_BUTTON_SCALE);
        btnBg.setScale(MENU_BUTTON_SCALE);
        btnText.setScale(1);
      });
      return { shadow: btnShadow, bg: btnBg, text: btnText };
    });

    createFullscreenButton(this);
    positionFullscreenButton(this);

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
    const cy = this.scale.height / 2 + MENU_BLOCK_OFFSET_Y;
    const buttonStep = (this.textures.get(MENU_BUTTON_TEXTURE_KEY)?.getSourceImage?.()?.height ?? 64) + MENU_BUTTON_VERTICAL_GAP_PX;
    const yStart = cy - ((this.menuButtons?.length - 1) * buttonStep) / 2;
    this.menuButtons?.forEach?.((btn, idx) => {
      const y = yStart + (idx * buttonStep);
      btn?.shadow?.setPosition(cx, y + MENU_BUTTON_SHADOW_OFFSET_Y);
      btn?.bg?.setPosition(cx, y);
      btn?.text?.setPosition(cx, y + MENU_BUTTON_TEXT_OFFSET_Y);
    });
    positionFullscreenButton(this);
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
