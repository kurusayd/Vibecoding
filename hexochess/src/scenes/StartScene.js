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
const TG_ICON_TEXTURE_KEY = 'telegramIcon';
const TG_URL = 'https://t.me/StationOfHorror';
const X_ICON_TEXTURE_KEY = 'xIcon';
const X_URL = 'https://x.com/DevisJJones';
const SOCIAL_BLOCK_OFFSET_X = 0;
const SOCIAL_BLOCK_OFFSET_Y = 60;
const TG_ICON_SCALE = 0.4;
const TG_ICON_OFFSET_X = 0;
const TG_ICON_OFFSET_Y = 0;
const X_ICON_SCALE = 0.35;
const X_ICON_OFFSET_X = 0;
const X_ICON_OFFSET_Y = 60;
const X_ICON_ALPHA = 0.78;
const JOIN_TEXT = 'Join';
const JOIN_TEXT_FONT_SIZE_PX = 24;
const JOIN_TEXT_OFFSET_X = 0;
const JOIN_TEXT_OFFSET_Y = -6;
const JOIN_BG_COLOR = 0x000000;
const JOIN_BG_EDGE_ALPHA = 0.03;
const JOIN_BG_CENTER_ALPHA = 0.05;
const JOIN_BG_RADIUS_PX = 7;
const JOIN_BG_BLUR_STEPS = 6;
const JOIN_BG_PADDING_X_PX = 3;

export default class StartScene extends Phaser.Scene {
  constructor() {
    super('StartScene');
  }

  preload() {
    this.load.image('menuMainBg', '/assets/menu/main.png');
    this.load.image(MENU_BUTTON_TEXTURE_KEY, '/assets/buttons/bt_menu.png');
    this.load.image(TG_ICON_TEXTURE_KEY, '/assets/icons/social/tg.png');
    this.load.image(X_ICON_TEXTURE_KEY, '/assets/icons/social/x.png');
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
    this.createTelegramCta();
    this.positionTelegramCta();

    this.scale.on('resize', this.onResize, this);
    this.scale.on('enterfullscreen', this.positionTelegramCta, this);
    this.scale.on('leavefullscreen', this.positionTelegramCta, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.events.once('destroy', () => this.scale.off('resize', this.onResize, this));
    this.events.once('shutdown', () => {
      this.scale.off('enterfullscreen', this.positionTelegramCta, this);
      this.scale.off('leavefullscreen', this.positionTelegramCta, this);
    });
    this.events.once('destroy', () => {
      this.scale.off('enterfullscreen', this.positionTelegramCta, this);
      this.scale.off('leavefullscreen', this.positionTelegramCta, this);
    });
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
    this.positionTelegramCta();
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

  createTelegramCta() {
    if (this.telegramCtaBlock) return;

    this.telegramJoinBg = this.add.graphics();

    this.telegramJoinText = this.add.text(0, 0, JOIN_TEXT, {
      fontFamily: 'CormorantSC-SemiBold, CormorantSC-Regular, Georgia, serif',
      fontSize: `${JOIN_TEXT_FONT_SIZE_PX}px`,
      color: '#ffffff',
    })
      .setOrigin(0.5, 1)
      .setStroke('#53b9ff', 1);
    this.telegramJoinText.setPosition(JOIN_TEXT_OFFSET_X, JOIN_TEXT_OFFSET_Y);

    this.telegramIcon = this.add.image(0, 0, TG_ICON_TEXTURE_KEY)
      .setOrigin(0.5, 0)
      .setScale(TG_ICON_SCALE)
      .setInteractive({ useHandCursor: true });
    this.telegramIcon.setPosition(TG_ICON_OFFSET_X, TG_ICON_OFFSET_Y);

    this.telegramIcon.on('pointerup', () => {
      window.open(TG_URL, '_blank', 'noopener,noreferrer');
    });

    this.xIcon = this.add.image(0, 0, X_ICON_TEXTURE_KEY)
      .setOrigin(0.5, 0)
      .setScale(X_ICON_SCALE)
      .setAlpha(X_ICON_ALPHA)
      .setInteractive({ useHandCursor: true });
    this.xIcon.setPosition(X_ICON_OFFSET_X, X_ICON_OFFSET_Y);

    this.xIcon.on('pointerup', () => {
      window.open(X_URL, '_blank', 'noopener,noreferrer');
    });

    this.telegramCtaBlock = this.add.container(0, 0, [
      this.telegramJoinBg,
      this.telegramJoinText,
      this.telegramIcon,
      this.xIcon,
    ])
      .setDepth(9998)
      .setScrollFactor(0);
    this.refreshTelegramJoinBackdrop();
  }

  positionTelegramCta() {
    if (!this.fsBtn || !this.telegramCtaBlock) return;
    this.refreshTelegramJoinBackdrop();
    const fsBounds = this.fsBtn.getBounds();
    const fsCenterX = fsBounds.centerX;
    const blockY = fsBounds.bottom + SOCIAL_BLOCK_OFFSET_Y;
    this.telegramCtaBlock.setPosition(fsCenterX + SOCIAL_BLOCK_OFFSET_X, blockY);
  }

  refreshTelegramJoinBackdrop() {
    if (!this.telegramJoinBg || !this.telegramJoinText) return;

    this.telegramJoinBg.clear();

    const textW = Math.max(1, Math.ceil(Number(this.telegramJoinText.width ?? 1))) + (JOIN_BG_PADDING_X_PX * 2);
    const textH = Math.max(1, Math.ceil(Number(this.telegramJoinText.height ?? 1)));
    const left = JOIN_TEXT_OFFSET_X - (textW * 0.5);
    const top = JOIN_TEXT_OFFSET_Y - textH;
    const steps = Math.max(1, Math.floor(JOIN_BG_BLUR_STEPS));

    for (let i = 0; i < steps; i++) {
      const t = steps <= 1 ? 1 : (i / (steps - 1));
      const alpha = Phaser.Math.Linear(JOIN_BG_EDGE_ALPHA, JOIN_BG_CENTER_ALPHA, t * t);
      const inset = Math.floor((1 - t) * Math.min(steps - 1, Math.floor(Math.min(textW, textH) * 0.25)));
      const w = Math.max(1, textW - inset * 2);
      const h = Math.max(1, textH - inset * 2);
      const x = left + inset;
      const y = top + inset;
      const radius = Math.max(1, JOIN_BG_RADIUS_PX - Math.floor(inset * 0.5));

      this.telegramJoinBg.fillStyle(JOIN_BG_COLOR, alpha);
      this.telegramJoinBg.fillRoundedRect(x, y, w, h, radius);
    }
  }
}
