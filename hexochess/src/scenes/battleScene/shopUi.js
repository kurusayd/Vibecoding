export function installBattleSceneShopUi(BattleScene) {
  const SHOP_PORTRAIT_ATLAS_KEY = 'unitPortraitsAtlas';
  const SHOP_PORTRAIT_FRAME_PREFIX = 'ALL PORTRAITS/PREPEARE for Atlas/';
  // Main shop tuning. If you need to move or resize the whole shop again, edit only this block.
  const SHOP_UI_TUNING = Object.freeze({
    offsetX: 80,
    cardScale: 1.3,
  });

  // Portraits are square (256x256), but shop art panel is rectangular.
  // Cover mode fills the whole gray panel (with crop if needed). Tune one multiplier here.
  const SHOP_CARD_BASE_WIDTH = 132;
  const SHOP_CARD_BASE_HEIGHT = 188;
  const SHOP_PORTRAIT_SCALE = 1.3;
  const SHOP_PORTRAIT_STYLE_PRESETS = {
    default: {
      scaleMul: 1.2,
      offsetYPx: -26,
    },
  };
  const SHOP_PORTRAIT_TYPE_ALIASES = {
    Swordsman: 'swordman',
  };
  const SHOP_CUSTOM_PORTRAIT_BY_TYPE = {
    NagaSiren: {
      key: 'shop_portrait_siren',
    },
  };
  const SHOP_CARD_POWER_ART_KEY_BY_POWER_TYPE = Object.freeze({
    'Пешка': 'shop_card_power_pawn',
    PAWN: 'shop_card_power_pawn',
    'Конь': 'shop_card_power_knight',
    KNIGHT: 'shop_card_power_knight',
    'Слон': 'shop_card_power_bishop',
    BISHOP: 'shop_card_power_bishop',
    'Ладья': 'shop_card_power_rook',
    ROOK: 'shop_card_power_rook',
    'Ферзь': 'shop_card_power_queen',
    QUEEN: 'shop_card_power_queen',
  });
  const SHOP_RACE_LABEL_BY_KEY = {
    HUMAN: 'Люди',
    UNDEAD: 'Нежить',
    LIZARD: 'Ящеры',
    GOD: 'Боги',
    DEMON: 'Демоны',
  };
  // Internal preset for the fitted card skin. Normally this block should not need changes.
  const SHOP_CARD_ART_PRESET = Object.freeze({
    portraitOffsetX: 3,
    portraitOffsetY: -37,
    nameOffsetY: 36,
    raceOffsetY: 40,
    bottomRowOffsetY: -40,
    bottomRowY: 172,
    bgBackOffsetY: 57,
    bgBackWidthDelta: 30,
    bgBackHeightDelta: 30,
    bgOffsetX: 0,
    bgOffsetY: 87,
    bgWidthDelta: 30,
    bgHeightDelta: 30,
    powerArtOffsetX: 0,
    powerArtOffsetY: 78,
    powerArtScale: 0.37,
    costTextRightX: 55,
    costGroupOffsetX: -31,
    costGroupOffsetY: 100,
    costGapPx: 6,
    costCoinSize: 28,
  });
  const SHOP_CARD_BG_BACK_KEY = 'shop_rook_card_back';
  const SHOP_CARD_BG_KEY = 'shop_rook_card';
  // Shop art mask tuning.
  const SHOP_CARD_ART_MASK_OFFSET_X = 0;
  const SHOP_CARD_ART_MASK_OFFSET_Y = 0;
  const SHOP_CARD_ART_MASK_WIDTH_DELTA = 0;
  const SHOP_CARD_ART_MASK_HEIGHT_DELTA = 0;
  // Per-side clip masks (shared for all shop tiles):
  // WIDTH/HEIGHT_*: shrink visible art area from this side.
  // OFFSET_X/OFFSET_Y_*: shift visible crop window.
  const SHOP_CARD_ART_CLIP_LEFT_WIDTH_DELTA = 200;
  const SHOP_CARD_ART_CLIP_LEFT_OFFSET_X = -200;
  const SHOP_CARD_ART_CLIP_RIGHT_WIDTH_DELTA = 200;
  const SHOP_CARD_ART_CLIP_RIGHT_OFFSET_X = 200;
  const SHOP_CARD_ART_CLIP_TOP_HEIGHT_DELTA = 10;
  const SHOP_CARD_ART_CLIP_TOP_OFFSET_Y = 0;
  const SHOP_CARD_ART_CLIP_BOTTOM_HEIGHT_DELTA = 0;
  const SHOP_CARD_ART_CLIP_BOTTOM_OFFSET_Y = 0;
  const unitTypeToPortraitName = (type) => {
    const raw = String(type ?? '').trim();
    if (!raw) return '';
    if (SHOP_PORTRAIT_TYPE_ALIASES[raw]) return SHOP_PORTRAIT_TYPE_ALIASES[raw];
    return raw
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
  };
  const portraitFrameForUnitType = (type) => {
    const name = unitTypeToPortraitName(type);
    if (!name) return '';
    return `${SHOP_PORTRAIT_FRAME_PREFIX}${name}.png`;
  };
  const getShopPortraitStyle = () => SHOP_PORTRAIT_STYLE_PRESETS.default;

  const BUTTON_SHADOW_COLOR = 0x000000;
  const BUTTON_SHADOW_ALPHA = 0.35;
  const BUTTON_SHADOW_OFFSET_X = 2;
  const BUTTON_SHADOW_OFFSET_Y = 3;

  Object.assign(BattleScene.prototype, {
    initShopUI() {
      this.shopCards = [];
      this.shopCollapsed = false;
      this.shopPendingBuyOfferIndex = null;
      this.shopRefreshBusy = false;
      this.shopRefreshUnlockTimer = null;
      this.shopRefreshRequestTimer = null;
      this.shopLockToggleBusy = false;
      this.shopCardLayout = {
        width: Math.round(SHOP_CARD_BASE_WIDTH * SHOP_UI_TUNING.cardScale),
        height: Math.round(SHOP_CARD_BASE_HEIGHT * SHOP_UI_TUNING.cardScale),
        gap: 10,
        bottomMargin: 10,
        scale: SHOP_UI_TUNING.cardScale,
      };

      const offerCount = Number(this.shopOfferCount ?? 5);
      for (let i = 0; i < offerCount; i++) {
        this.shopCards.push(this.createShopCard(i));
      }

      this.shopToggleBtn = this.add.container(0, 0)
        .setDepth(10000)
        .setScrollFactor(0)
        .setSize(38, 38);
      this.shopToggleBtnBody = this.add.container(19, 19);
      this.shopToggleBtnShadow = this.add.rectangle(BUTTON_SHADOW_OFFSET_X, BUTTON_SHADOW_OFFSET_Y, 40, 40, BUTTON_SHADOW_COLOR, BUTTON_SHADOW_ALPHA)
        .setOrigin(0.5, 0.5);
      this.shopToggleBtnBg = this.add.rectangle(0, 0, 37, 37, 0x7a474f, 1)
        .setOrigin(0.5, 0.5)
        .setStrokeStyle(4, 0xb7868f, 1);
      this.shopToggleBtnLabel = this.add.text(0, 0, 'X', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f6e9ec',
      }).setOrigin(0.5, 0.5);
      this.shopToggleBtnHit = this.add.zone(19, 19, 38, 38)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });
      this.shopToggleBtnBody.add([
        this.shopToggleBtnShadow,
        this.shopToggleBtnBg,
        this.shopToggleBtnLabel,
      ]);
      this.shopToggleBtn.add([
        this.shopToggleBtnBody,
        this.shopToggleBtnHit,
      ]);

      this.shopToggleBtnHit.on('pointerdown', () => {
        this.shopCollapsed = true;
        this.syncShopUI();
        this.playPressFeedback?.(this.shopToggleBtnBody ?? this.shopToggleBtn, { scaleTo: 0.96, duration: 70 });
      });

      this.shopRefreshBtn = this.add.container(0, 0)
        .setDepth(10000)
        .setScrollFactor(0);

      this.shopRefreshBtnBody = this.add.container(30, 0);

      this.shopRefreshBtnShadow = this.add.rectangle(BUTTON_SHADOW_OFFSET_X, BUTTON_SHADOW_OFFSET_Y, 62, 66, BUTTON_SHADOW_COLOR, BUTTON_SHADOW_ALPHA)
        .setOrigin(0.5, 0.5);

      this.shopRefreshBtnBg = this.add.rectangle(0.5, 0.5, 59, 63, 0xd8c8aa, 0.93)
        .setOrigin(0.5, 0.5)
        .setStrokeStyle(4, 0x8f6d39, 1);

      this.shopRefreshBtnIcon = this.add.image(0, -9, 'updateMarketIcon')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(36, 36);

      this.shopRefreshBtnCoin = this.add.image(-8, 18, 'coin')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(14, 14);

      this.shopRefreshBtnCost = this.add.text(4, 18, '2', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '17px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5);

      this.shopRefreshBtnBody.add([
        this.shopRefreshBtnShadow,
        this.shopRefreshBtnBg,
        this.shopRefreshBtnIcon,
        this.shopRefreshBtnCoin,
        this.shopRefreshBtnCost,
      ]);
      this.shopRefreshBtn.add(this.shopRefreshBtnBody);

      this.shopRefreshBtn.setSize(60, 64);
      this.shopRefreshBtnHit = this.add.zone(30, 0, 60, 64)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });
      this.shopRefreshBtn.add(this.shopRefreshBtnHit);

      this.shopRefreshBtnHit.on('pointerdown', () => {
        if (this.shopRefreshBusy) return;

        this.shopRefreshBusy = true;
        this.syncShopUI();
        this.playPressFeedback?.(this.shopRefreshBtnBody, { scaleTo: 0.96, duration: 70 });
        const refreshAnim = this.playShopRefreshTilesAnimation?.() ?? { sendDelayMs: 0, totalMs: 420 };
        const sendDelayMs = Number(refreshAnim.sendDelayMs ?? 0);
        const unlockDelayMs = Number(refreshAnim.totalMs ?? 420);

        try { this.shopRefreshRequestTimer?.remove?.(false); } catch {}
        this.shopRefreshRequestTimer = this.time.delayedCall(sendDelayMs, () => {
          this.shopRefreshRequestTimer = null;
          this.ws?.sendIntentShopRefresh?.();
        });

        try { this.shopRefreshUnlockTimer?.remove?.(false); } catch {}
        this.shopRefreshUnlockTimer = this.time.delayedCall(unlockDelayMs, () => {
          this.shopRefreshBusy = false;
          this.shopRefreshUnlockTimer = null;
          this.syncShopUI();
        });
      });

      this.shopLockBtn = this.add.container(0, 0)
        .setDepth(10000)
        .setScrollFactor(0);

      this.shopLockBtnBody = this.add.container(30, 0);

      this.shopLockBtnShadow = this.add.rectangle(BUTTON_SHADOW_OFFSET_X, BUTTON_SHADOW_OFFSET_Y, 62, 66, BUTTON_SHADOW_COLOR, BUTTON_SHADOW_ALPHA)
        .setOrigin(0.5, 0.5);

      this.shopLockBtnBg = this.add.rectangle(0.5, 0.5, 59, 63, 0xd8c8aa, 0.93)
        .setOrigin(0.5, 0.5)
        .setStrokeStyle(4, 0x8f6d39, 1);

      this.shopLockBtnIcon = this.add.image(0, 0, 'lock_open')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(46, 46);

      this.shopLockBtnBody.add([
        this.shopLockBtnShadow,
        this.shopLockBtnBg,
        this.shopLockBtnIcon,
      ]);
      this.shopLockBtn.add(this.shopLockBtnBody);

      this.shopLockBtn.setSize(60, 64);
      this.shopLockBtnHit = this.add.zone(30, 0, 60, 64)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });
      this.shopLockBtn.add(this.shopLockBtnHit);

      this.shopLockBtnHit.on('pointerdown', () => {
        if (this.shopLockToggleBusy) return;
        this.shopLockToggleBusy = true;
        this.playPressFeedback?.(this.shopLockBtnBody, { scaleTo: 0.96, duration: 70 });
        this.ws?.sendIntentShopToggleLock?.();
        this.time.delayedCall(160, () => {
          this.shopLockToggleBusy = false;
          this.syncShopUI?.();
        });
      });

      this.shopOpenBtn = this.add.container(0, 0)
        .setDepth(10000)
        .setScrollFactor(0)
        .setSize(128, 38);
      this.shopOpenBtnBody = this.add.container(64, 19);
      this.shopOpenBtnShadow = this.add.rectangle(BUTTON_SHADOW_OFFSET_X, BUTTON_SHADOW_OFFSET_Y, 130, 40, BUTTON_SHADOW_COLOR, BUTTON_SHADOW_ALPHA)
        .setOrigin(0.5, 0.5);
      this.shopOpenBtnBg = this.add.rectangle(0, 0, 127, 37, 0x6b4b2f, 1)
        .setOrigin(0.5, 0.5)
        .setStrokeStyle(4, 0xb38a5e, 1);
      this.shopOpenBtnLabel = this.add.text(0, 0, '\u041c\u0410\u0413\u0410\u0417\u0418\u041d', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#f3ead6',
      }).setOrigin(0.5, 0.5);
      this.shopOpenBtnHit = this.add.zone(64, 19, 128, 38)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });
      this.shopOpenBtnBody.add([
        this.shopOpenBtnShadow,
        this.shopOpenBtnBg,
        this.shopOpenBtnLabel,
      ]);
      this.shopOpenBtn.add([
        this.shopOpenBtnBody,
        this.shopOpenBtnHit,
      ]);

      this.shopOpenBtnHit.on('pointerdown', () => {
        this.shopCollapsed = !this.shopCollapsed;
        this.syncShopUI();
        this.playPressFeedback?.(this.shopOpenBtnBody ?? this.shopOpenBtn, { scaleTo: 0.96, duration: 70 });
      });

      this._shopOutsideTapHandler = (_pointer, currentlyOver) => {
        if (this.shopCollapsed || this.shopUiMode !== 'open') return;
        if (this.isPointerOverShopUi?.(currentlyOver)) return;
        this.collapseShopUi?.();
      };
      this.input?.on?.('pointerdown', this._shopOutsideTapHandler);
      this.events?.once?.('shutdown', () => {
        this.input?.off?.('pointerdown', this._shopOutsideTapHandler);
      });

      this.positionShop();
      this.syncShopUI();
    },

    isPointerOverShopUi(currentlyOver) {
      const over = Array.isArray(currentlyOver) ? currentlyOver : [];
      if (!over.length) return false;

      const directHits = [
        this.shopToggleBtnHit,
        this.shopRefreshBtnHit,
        this.shopLockBtnHit,
        this.shopOpenBtnHit,
      ].filter(Boolean);
      for (const target of directHits) {
        if (over.includes(target)) return true;
      }

      for (const card of (this.shopCards ?? [])) {
        if (card?.hit && over.includes(card.hit)) return true;
      }

      return false;
    },

    collapseShopUi() {
      const canShowShop = !this.testSceneActive && (this.battleState?.phase === 'prep' || this.battleState?.phase === 'battle');
      if (!canShowShop) return;
      if (this.shopCollapsed) return;
      this.shopCollapsed = true;
      this.syncShopUI?.();
    },

    createShopCard(index) {
      const layout = this.shopCardLayout ?? {
        width: Math.round(SHOP_CARD_BASE_WIDTH * SHOP_UI_TUNING.cardScale),
        height: Math.round(SHOP_CARD_BASE_HEIGHT * SHOP_UI_TUNING.cardScale),
        scale: SHOP_UI_TUNING.cardScale,
      };
      const w = layout.width;
      const h = layout.height;
      const top = -h / 2;
      const cardScale = Number(layout.scale ?? SHOP_UI_TUNING.cardScale);
      const artLiftY = Number(this.shopCardArtLiftY ?? (75 * cardScale));

      const card = {
        index,
        width: w,
        height: h,
        enabled: false,
        hovered: false,
        pressed: false,
      };

      const container = this.add.container(0, 0)
        .setDepth(9999)
        .setScrollFactor(0);

      const bgBack = this.add.image(
        SHOP_CARD_ART_PRESET.bgOffsetX,
        SHOP_CARD_ART_PRESET.bgBackOffsetY,
        SHOP_CARD_BG_BACK_KEY
      ).setOrigin(0.5, 0.5);
      bgBack.setDisplaySize(
        w + SHOP_CARD_ART_PRESET.bgBackWidthDelta,
        Math.max(
          1,
          (w + SHOP_CARD_ART_PRESET.bgBackWidthDelta)
            * (Number(bgBack.height ?? 1) / Math.max(1, Number(bgBack.width ?? 1)))
        )
      );
      const bg = this.add.image(
        SHOP_CARD_ART_PRESET.bgOffsetX,
        SHOP_CARD_ART_PRESET.bgOffsetY,
        SHOP_CARD_BG_KEY
      ).setOrigin(0.5, 0.5);
      bg.setDisplaySize(
        w + SHOP_CARD_ART_PRESET.bgWidthDelta,
        Math.max(
          1,
          (w + SHOP_CARD_ART_PRESET.bgWidthDelta)
            * (Number(bg.height ?? 1) / Math.max(1, Number(bg.width ?? 1)))
        )
      );
      const artPanel = this.add.zone(
        0,
        top + (55 * cardScale),
        w - (14 * cardScale),
        86 * cardScale
      ).setOrigin(0.5, 0.5);
      const maskW = Math.max(1, artPanel.width + SHOP_CARD_ART_MASK_WIDTH_DELTA);
      const maskH = Math.max(1, artPanel.height + SHOP_CARD_ART_MASK_HEIGHT_DELTA);
      const maskCx = artPanel.x + SHOP_CARD_ART_MASK_OFFSET_X;
      const maskCy = artPanel.y + SHOP_CARD_ART_MASK_OFFSET_Y;
      const panelLeft = maskCx - (maskW / 2);
      const panelRight = maskCx + (maskW / 2);
      const panelTop = maskCy - (maskH / 2);
      const panelBottom = maskCy + (maskH / 2);
      const cardLeft = -w / 2;
      const cardRight = w / 2;
      const cardTop = -h / 2;
      const cardBottom = h / 2;

      const previewSprite = this.add.sprite(
        0,
        (artPanel.y + artPanel.height / 2) - artLiftY + SHOP_CARD_ART_PRESET.portraitOffsetY,
        'swordman_atlas',
        'psd_anim/idle.png'
      )
        .setOrigin(0.5, 1)
        .setScale(0.68);

      const previewFallback = this.add.text(0, top + 52, '?', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '34px',
        color: '#f0d9a0',
      }).setOrigin(0.5, 0.5).setVisible(false);

      const nameText = this.add.text(0, top + 104 + SHOP_CARD_ART_PRESET.nameOffsetY, '...', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '14px',
        color: '#17130d',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: w - 16, useAdvancedWrap: true },
      }).setOrigin(0.5, 0);

      const powerTypeArt = this.add.image(
        SHOP_CARD_ART_PRESET.powerArtOffsetX,
        top + SHOP_CARD_ART_PRESET.nameOffsetY + SHOP_CARD_ART_PRESET.powerArtOffsetY,
        'shop_card_power_pawn'
      )
        .setOrigin(0.5, 0.5)
        .setScale(cardScale * SHOP_CARD_ART_PRESET.powerArtScale)
        .setVisible(false);

      const typeText = this.add.text(0, top + 132 + SHOP_CARD_ART_PRESET.raceOffsetY, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '13px',
        color: '#4f3f25',
        align: 'center',
        wordWrap: { width: w - 16, useAdvancedWrap: true },
      }).setOrigin(0.5, 0);

      const costCoin = this.add.image(0, top + SHOP_CARD_ART_PRESET.bottomRowY + SHOP_CARD_ART_PRESET.bottomRowOffsetY, 'coin')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(SHOP_CARD_ART_PRESET.costCoinSize, SHOP_CARD_ART_PRESET.costCoinSize);

      const costText = this.add.text(SHOP_CARD_ART_PRESET.costTextRightX, top + SHOP_CARD_ART_PRESET.bottomRowY + SHOP_CARD_ART_PRESET.bottomRowOffsetY, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '26px',
        color: '#ffd85a',
        fontStyle: 'bold',
        align: 'right',
      })
        .setOrigin(1, 0.5)
        .setStroke('#b35a00', 3)
        .setShadow(0, 0, '#000000', 2, true, true);

      const hit = this.add.zone(0, 0, w, h)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });

      const failHintText = this.add.text(0, top - 10, 'Нет места', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#4b0000',
        strokeThickness: 3,
      })
        .setOrigin(0.5, 1)
        .setAlpha(0)
        .setVisible(false);

      card.container = container;
      card.bgBack = bgBack;
      card.bg = bg;
      card.artPanel = artPanel;
      card._artPanelLeft = panelLeft;
      card._artPanelRight = panelRight;
      card._artPanelTop = panelTop;
      card._artPanelBottom = panelBottom;
      card._cardLeft = cardLeft;
      card._cardRight = cardRight;
      card._cardTop = cardTop;
      card._cardBottom = cardBottom;
      card.previewSprite = previewSprite;
      card.cardScale = cardScale;
      card.previewPortraitY = artPanel.y + SHOP_CARD_ART_PRESET.portraitOffsetY;
      card.previewFallback = previewFallback;
      card.powerTypeArt = powerTypeArt;
      card.powerTypeArtBaseY = top + SHOP_CARD_ART_PRESET.nameOffsetY + SHOP_CARD_ART_PRESET.powerArtOffsetY;
      card.nameText = nameText;
      card.typeText = typeText;
      card.costCoin = costCoin;
      card.costText = costText;
      card.hit = hit;
      card.failHintText = failHintText;

      card.updateCostLayout = () => {
        const textX = SHOP_CARD_ART_PRESET.costTextRightX + SHOP_CARD_ART_PRESET.costGroupOffsetX;
        const y = top + SHOP_CARD_ART_PRESET.bottomRowY + SHOP_CARD_ART_PRESET.bottomRowOffsetY + SHOP_CARD_ART_PRESET.costGroupOffsetY;
        const textW = Number(card.costText.width ?? 0);
        const coinW = Number(card.costCoin.displayWidth ?? SHOP_CARD_ART_PRESET.costCoinSize);
        card.costText.setPosition(textX, y);
        card.costCoin.setPosition(textX - textW - SHOP_CARD_ART_PRESET.costGapPx - (coinW / 2), y);
      };

      card.applyArtCrop = () => {
        const s = card.previewSprite;
        if (!s?.active || !s.visible) {
          s?.setCrop?.();
          return;
        }
        const fw = Number(s.frame?.realWidth ?? s.frame?.width ?? 0);
        const fh = Number(s.frame?.realHeight ?? s.frame?.height ?? 0);
        const dw = Number(s.displayWidth ?? 0);
        const dh = Number(s.displayHeight ?? 0);
        if (fw <= 0 || fh <= 0 || dw <= 0 || dh <= 0) {
          s.setCrop();
          return;
        }

        const rawLeft = Number(card._artPanelLeft ?? 0) + Number(SHOP_CARD_ART_CLIP_LEFT_WIDTH_DELTA ?? 0) + Number(SHOP_CARD_ART_CLIP_LEFT_OFFSET_X ?? 0);
        const rawRight = Number(card._artPanelRight ?? 0) - Number(SHOP_CARD_ART_CLIP_RIGHT_WIDTH_DELTA ?? 0) + Number(SHOP_CARD_ART_CLIP_RIGHT_OFFSET_X ?? 0);
        const rawTop = Number(card._artPanelTop ?? 0) + Number(SHOP_CARD_ART_CLIP_TOP_HEIGHT_DELTA ?? 0) + Number(SHOP_CARD_ART_CLIP_TOP_OFFSET_Y ?? 0);
        const rawBottom = Number(card._artPanelBottom ?? 0) - Number(SHOP_CARD_ART_CLIP_BOTTOM_HEIGHT_DELTA ?? 0) + Number(SHOP_CARD_ART_CLIP_BOTTOM_OFFSET_Y ?? 0);

        const clipLeft = Math.max(Number(card._cardLeft ?? -Infinity), rawLeft);
        const clipRight = Math.min(Number(card._cardRight ?? Infinity), rawRight);
        const clipTop = Math.max(Number(card._cardTop ?? -Infinity), rawTop);
        const clipBottom = Math.min(Number(card._cardBottom ?? Infinity), rawBottom);

        const sx = Number(s.x ?? 0) - dw * Number(s.originX ?? 0.5);
        const sy = Number(s.y ?? 0) - dh * Number(s.originY ?? 1);
        const sRight = sx + dw;
        const sBottom = sy + dh;

        const interLeft = Math.max(clipLeft, sx);
        const interRight = Math.min(clipRight, sRight);
        const interTop = Math.max(clipTop, sy);
        const interBottom = Math.min(clipBottom, sBottom);

        if (interRight <= interLeft || interBottom <= interTop) {
          s.setCrop(0, 0, 0, 0);
          return;
        }

        const cropX = ((interLeft - sx) / dw) * fw;
        const cropY = ((interTop - sy) / dh) * fh;
        const cropW = ((interRight - interLeft) / dw) * fw;
        const cropH = ((interBottom - interTop) / dh) * fh;
        s.setCrop(cropX, cropY, cropW, cropH);
      };

      card.refreshVisual = () => {
        const enabled = !!card.enabled;
        const hovered = enabled && !!card.hovered;
        const pressed = enabled && !!card.pressed;

        if (enabled) {
          card.bgBack.clearTint();
          card.bgBack.setAlpha(hovered ? 1 : 0.97);
          card.bg.clearTint();
          card.bg.setAlpha(hovered ? 1 : 0.97);
        } else {
          card.bgBack.setTint(0x9c9c9c);
          card.bgBack.setAlpha(0.68);
          card.bg.setTint(0x9c9c9c);
          card.bg.setAlpha(0.68);
        }
        card.container.setScale(pressed ? 0.985 : 1);
        card.previewSprite.setAlpha(enabled ? 1 : 0.55);
        card.previewFallback.setAlpha(enabled ? 1 : 0.55);
        card.powerTypeArt.setAlpha(enabled ? 1 : 0.75);
        card.nameText.setAlpha(enabled ? 1 : 0.75);
        card.typeText.setAlpha(enabled ? 1 : 0.75);
        card.costCoin.setAlpha(enabled ? 1 : 0.75);
        card.costText.setAlpha(enabled ? 1 : 0.75);

        if (card.hit?.input) {
          card.hit.input.enabled = enabled;
          card.hit.input.cursor = enabled ? 'pointer' : 'default';
        }
      };

      hit.on('pointerover', () => {
        card.hovered = true;
        card.refreshVisual();
      });
      hit.on('pointerout', () => {
        card.hovered = false;
        card.pressed = false;
        card.refreshVisual();
      });
      hit.on('pointerdown', () => {
        if (!card.enabled) return;
        card.pressed = true;
        card.refreshVisual();
        this.shopPendingBuyOfferIndex = Number(index);
        this.ws?.sendIntentShopBuy?.(index);
      });
      hit.on('pointerup', () => {
        card.pressed = false;
        card.refreshVisual();
      });
      hit.on('pointerupoutside', () => {
        card.pressed = false;
        card.refreshVisual();
      });

      container.add([
        bgBack,
        artPanel,
        previewSprite,
        previewFallback,
        bg,
        powerTypeArt,
        nameText,
        typeText,
        costCoin,
        costText,
        hit,
        failHintText,
      ]);

      card.updateCostLayout();
      card.refreshVisual();
      return card;
    },

    showShopCardHint(index, text = 'Нет места') {
      const safeIndex = Number(index);
      if (!Number.isInteger(safeIndex) || safeIndex < 0) return;
      const card = this.shopCards?.[safeIndex];
      const hint = card?.failHintText;
      if (!hint?.active) return;

      hint.setText(String(text || 'Нет места'));
      hint.setVisible(true).setAlpha(0).setY((-(card.height ?? 188) / 2) - 10);
      this.tweens.killTweensOf(hint);
      this.tweens.add({
        targets: hint,
        alpha: 1,
        y: (-(card.height ?? 188) / 2) - 16,
        duration: 110,
        ease: 'Cubic.Out',
        yoyo: true,
        hold: 500,
        onComplete: () => {
          hint.setVisible(false);
        },
      });
    },

    positionShop() {
      if (!this.shopCards?.length) return;

      const layout = this.shopCardLayout ?? {
        width: Math.round(SHOP_CARD_BASE_WIDTH * SHOP_UI_TUNING.cardScale),
        height: Math.round(SHOP_CARD_BASE_HEIGHT * SHOP_UI_TUNING.cardScale),
        gap: 10,
        bottomMargin: 10,
        scale: SHOP_UI_TUNING.cardScale,
      };
      const totalW = this.shopCards.length * layout.width + (this.shopCards.length - 1) * layout.gap;
      let x = this.scale.width / 2 - totalW / 2 + layout.width / 2 + SHOP_UI_TUNING.offsetX;
      const y = this.scale.height - layout.bottomMargin - layout.height / 2;

      for (const card of this.shopCards) {
        card.container?.setPosition(x, y);
        x += layout.width + layout.gap;
      }

      if (this.shopToggleBtn) {
        const lastCard = this.shopCards?.[this.shopCards.length - 1] ?? null;
        const rightEdge = Number(lastCard?.container?.x ?? x) + layout.width / 2;
        const btnX = rightEdge + 18;
        const btnY = y - layout.height / 2 + 16;
        this.shopToggleBtn.setPosition(btnX - 10, btnY - 15);

        if (this.shopRefreshBtn) {
          const xHalfW = (this.shopToggleBtn.width ?? this.shopToggleBtn.displayWidth ?? 0) / 2;
          const refreshHalfH = (this.shopRefreshBtn.height ?? this.shopRefreshBtn.displayHeight ?? 0) / 2;
          const tileBottomY = y + layout.height / 2;
          const refreshY = tileBottomY - refreshHalfH;
          const leftEdgeX = btnX - xHalfW;
          this.shopRefreshBtn.setPosition(leftEdgeX + 8, refreshY);

          if (this.shopLockBtn) {
            const lockHalfH = (this.shopLockBtn.height ?? this.shopLockBtn.displayHeight ?? 0) / 2;
            const lockY = refreshY - refreshHalfH - lockHalfH - 8;
            this.shopLockBtn.setPosition(leftEdgeX + 8, lockY);
          }
        }
      }

      if (this.shopOpenBtn) {
        const view = this.scale.getViewPort();
        const btnW = this.shopOpenBtn.width ?? this.shopOpenBtn.displayWidth ?? 0;
        const btnH = this.shopOpenBtn.height ?? this.shopOpenBtn.displayHeight ?? 0;
        this.shopOpenBtn.setPosition(
          view.x + view.width - 80 - btnW / 2,
          view.y + view.height - 30 - btnH / 2,
        );
      }
    },

    stopShopUiTweens() {
      for (const card of (this.shopCards ?? [])) {
        if (card?.container) this.tweens.killTweensOf(card.container);
      }
      if (this.shopToggleBtn) this.tweens.killTweensOf(this.shopToggleBtn);
      if (this.shopRefreshBtn) this.tweens.killTweensOf(this.shopRefreshBtn);
      if (this.shopRefreshBtnBody) this.tweens.killTweensOf(this.shopRefreshBtnBody);
      if (this.shopLockBtn) this.tweens.killTweensOf(this.shopLockBtn);
      if (this.shopLockBtnBody) this.tweens.killTweensOf(this.shopLockBtnBody);
      if (this.shopOpenBtn) this.tweens.killTweensOf(this.shopOpenBtn);
      if (this.shopOpenBtnBody) this.tweens.killTweensOf(this.shopOpenBtnBody);
    },

    setShopCardsVisual(open, { immediate = false } = {}) {
      const cards = this.shopCards ?? [];
      const slide = 18;

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const c = card?.container;
        if (!c) continue;

        const baseX = c.x;
        const baseY = c.y;
        c._shopBaseX = baseX;
        c._shopBaseY = baseY;

        this.tweens.killTweensOf(c);

        if (open) {
          c.setVisible(true);

          if (immediate) {
            c.setAlpha(1);
            c.setPosition(baseX, baseY);
          } else {
            c.setAlpha(Math.min(Number(c.alpha ?? 1), 0.01));
            c.setPosition(baseX, baseY + slide);
            this.tweens.add({
              targets: c,
              alpha: 1,
              x: baseX,
              y: baseY,
              duration: 170,
              delay: i * 16,
              ease: 'Cubic.Out',
            });
          }
          continue;
        }

        if (immediate) {
          c.setAlpha(0);
          c.setPosition(baseX, baseY + slide);
          c.setVisible(false);
        } else {
          c.setVisible(true);
          this.tweens.add({
            targets: c,
            alpha: 0,
            y: baseY + slide,
            duration: 130,
            delay: Math.max(0, (cards.length - 1 - i)) * 10,
            ease: 'Cubic.In',
            onComplete: () => {
              if (this.shopUiMode !== 'open') c.setVisible(false);
            },
          });
        }
      }
    },

    isShopButtonExpectedVisible(btn) {
      if (!btn) return false;
      const mode = this.shopUiMode ?? 'hidden';

      if (btn === this.shopToggleBtn) return mode === 'open';
      if (btn === this.shopLockBtn) return mode === 'open';
      if (btn === this.shopRefreshBtn) return mode === 'open';
      if (btn === this.shopOpenBtn) return mode === 'collapsed';

      return false;
    },

    playShopRefreshTilesAnimation() {
      if (this.shopUiMode !== 'open') return { sendDelayMs: 0, totalMs: 0 };

      const cards = this.shopCards ?? [];
      const slide = 18;
      const outDuration = 95;
      const inDuration = 140;
      const stagger = 14;
      const reopenDelay = 70;
      const visibleCards = cards.filter((card) => !!card?.container?.visible).length;
      const chainCount = Math.max(1, visibleCards);
      const sendDelayMs = outDuration + Math.max(0, chainCount - 1) * stagger;
      const totalMs = sendDelayMs + reopenDelay + inDuration;

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const c = card?.container;
        if (!c || !c.visible) continue;

        const baseX = c.x;
        const baseY = c.y;
        c._shopBaseX = baseX;
        c._shopBaseY = baseY;

        this.tweens.killTweensOf(c);
        c.setVisible(true);

        this.tweens.add({
          targets: c,
          alpha: 0,
          y: baseY + slide,
          duration: outDuration,
          delay: i * stagger,
          ease: 'Cubic.In',
          onComplete: () => {
            if (this.shopUiMode !== 'open') return;

            c.setPosition(baseX, baseY + slide);

            this.tweens.add({
              targets: c,
              alpha: 1,
              x: baseX,
              y: baseY,
              duration: inDuration,
              delay: reopenDelay,
              ease: 'Cubic.Out',
            });
          },
        });
      }

      return { sendDelayMs, totalMs };
    },

    setShopButtonVisual(btn, visible, { immediate = false, slideY = 8 } = {}) {
      if (!btn) return;

      const baseX = btn.x;
      const baseY = btn.y;
      btn._shopBaseX = baseX;
      btn._shopBaseY = baseY;

      this.tweens.killTweensOf(btn);

      if (btn.input) btn.input.enabled = visible;

      if (visible) {
        btn.setVisible(true);

        if (immediate) {
          btn.setAlpha(1);
          btn.setPosition(baseX, baseY);
          return;
        }

        btn.setAlpha(Math.min(Number(btn.alpha ?? 1), 0.01));
        btn.setPosition(baseX, baseY + slideY);
        this.tweens.add({
          targets: btn,
          alpha: 1,
          x: baseX,
          y: baseY,
          duration: 150,
          ease: 'Cubic.Out',
        });
        return;
      }

      if (immediate) {
        btn.setAlpha(0);
        btn.setPosition(baseX, baseY + slideY);
        btn.setVisible(false);
        return;
      }

      btn.setVisible(true);
      this.tweens.add({
        targets: btn,
        alpha: 0,
        y: baseY + slideY,
        duration: 110,
        ease: 'Cubic.In',
        onComplete: () => {
          if (!this.isShopButtonExpectedVisible(btn)) btn.setVisible(false);
        },
      });
    },

    playPressFeedback(target, { scaleTo = 0.96, duration = 70 } = {}) {
      if (!target) return;

      this.tweens.killTweensOf(target);
      target.setScale(1, 1);

      this.tweens.add({
        targets: target,
        scaleX: scaleTo,
        scaleY: scaleTo,
        duration,
        ease: 'Quad.Out',
        yoyo: true,
      });
    },

    applyShopUiMode(mode, { animate = true } = {}) {
      const immediate = !animate;

      if (this.shopToggleBtnBg) {
        this.shopToggleBtnBg.setFillStyle(0x7a474f, 1);
        this.shopToggleBtnBg.setStrokeStyle(4, 0xb7868f, 1);
      }
      if (this.shopToggleBtnLabel) {
        this.shopToggleBtnLabel.setColor('#f6e9ec');
      }

      if (mode === 'open') {
        this.setShopCardsVisual(true, { immediate });
        this.setShopButtonVisual(this.shopToggleBtn, true, { immediate, slideY: 6 });
        this.setShopButtonVisual(this.shopLockBtn, true, { immediate, slideY: 6 });
        this.setShopButtonVisual(this.shopRefreshBtn, true, { immediate, slideY: 6 });
        this.setShopButtonVisual(this.shopOpenBtn, false, { immediate: true, slideY: 10 });
        return;
      }

      if (mode === 'collapsed') {
        this.setShopCardsVisual(false, { immediate });
        this.setShopButtonVisual(this.shopToggleBtn, false, { immediate, slideY: 6 });
        this.setShopButtonVisual(this.shopLockBtn, false, { immediate, slideY: 6 });
        this.setShopButtonVisual(this.shopRefreshBtn, false, { immediate, slideY: 6 });
        this.setShopButtonVisual(this.shopOpenBtn, true, { immediate: true, slideY: 10 });
        return;
      }

      this.setShopCardsVisual(false, { immediate });
      this.setShopButtonVisual(this.shopToggleBtn, false, { immediate, slideY: 6 });
      this.setShopButtonVisual(this.shopLockBtn, false, { immediate, slideY: 6 });
      this.setShopButtonVisual(this.shopRefreshBtn, false, { immediate, slideY: 6 });
      this.setShopButtonVisual(this.shopOpenBtn, false, { immediate: true, slideY: 10 });
    },

    syncShopUI() {
      const phase = this.battleState?.phase ?? 'prep';
      const introAllowsShop = !this.sceneLoadIntroActive || !!this.sceneLoadIntroShopVisible;
      const show = !this.testSceneActive && introAllowsShop && (phase === 'prep' || phase === 'battle');
      const mode = !show ? 'hidden' : (this.shopCollapsed ? 'collapsed' : 'open');

      this.positionShop();

      if (this.shopUiMode !== mode) {
        const firstApply = (this.shopUiMode == null);
        const skipAnim = !!this.shopUiSkipNextModeAnimation;
        this.shopUiSkipNextModeAnimation = false;
        this.shopUiMode = mode;
        this.applyShopUiMode(mode, { animate: !firstApply && !skipAnim });
      } else {
        this.shopUiSkipNextModeAnimation = false;
      }

      if (this.shopOpenBtn) {
        const isActive = (mode === 'open');
        this.shopOpenBtnBg?.setFillStyle(isActive ? 0x7a5635 : 0x6b4b2f, 1);
        this.shopOpenBtnBg?.setStrokeStyle(4, isActive ? 0xc89e68 : 0xb38a5e, 1);
        this.shopOpenBtnLabel?.setColor(isActive ? '#ffe4ad' : '#f3ead6');
        this.shopOpenBtnShadow?.setFillStyle(BUTTON_SHADOW_COLOR, 1);
        this.shopOpenBtnShadow?.setAlpha(BUTTON_SHADOW_ALPHA);
        this.shopOpenBtn.setAlpha(isActive ? 1 : 0.94);
      }

      if (!show) return;

      const isShopLocked = Boolean(this.battleState?.shop?.locked);
      const refreshCost = 2;
      const coins = Number(this.battleState?.kings?.player?.coins ?? 0);
      const canRefreshShop = (mode === 'open') && coins >= refreshCost && !this.shopRefreshBusy;
      const canToggleShopLock = (mode === 'open') && !this.shopLockToggleBusy;
      if (this.shopLockBtn) {
        this.shopLockBtnBg?.setFillStyle(isShopLocked ? 0xcfbf73 : 0xd8c8aa, isShopLocked ? 0.98 : 0.93);
        this.shopLockBtnBg?.setStrokeStyle(4, isShopLocked ? 0x8a6d18 : 0x8f6d39, 1);
        this.shopLockBtnShadow?.setFillStyle(BUTTON_SHADOW_COLOR, 1);
        this.shopLockBtnShadow?.setAlpha(canToggleShopLock ? BUTTON_SHADOW_ALPHA : 0.18);
        this.shopLockBtnIcon?.setTexture(isShopLocked ? 'lock_close' : 'lock_open');
        this.shopLockBtnIcon?.setAlpha(canToggleShopLock ? 1 : 0.6);
        if (this.shopLockBtnHit?.input) this.shopLockBtnHit.input.enabled = canToggleShopLock;
        this.shopLockBtn.setAlpha(canToggleShopLock ? 1 : 0.78);
      }
      if (this.shopRefreshBtn) {
        this.shopRefreshBtnBg?.setFillStyle(canRefreshShop ? 0xd8c8aa : 0x9d9588, canRefreshShop ? 0.93 : 0.62);
        this.shopRefreshBtnBg?.setStrokeStyle(4, canRefreshShop ? 0x8f6d39 : 0x6f695f, 1);
        this.shopRefreshBtnShadow?.setFillStyle(BUTTON_SHADOW_COLOR, 1);
        this.shopRefreshBtnShadow?.setAlpha(canRefreshShop ? BUTTON_SHADOW_ALPHA : 0.18);
        this.shopRefreshBtnCost?.setColor(canRefreshShop ? '#7c5b00' : '#5b5b5b');
        this.shopRefreshBtnCost?.setAlpha(canRefreshShop ? 1 : 0.82);
        this.shopRefreshBtnIcon?.setAlpha(canRefreshShop ? 1 : 0.60);
        this.shopRefreshBtnCoin?.setAlpha(canRefreshShop ? 1 : 0.65);
        if (this.shopRefreshBtnHit?.input) this.shopRefreshBtnHit.input.enabled = canRefreshShop;
        this.shopRefreshBtn.setAlpha(canRefreshShop ? 1 : 0.78);
      }

      const offers = this.battleState?.shop?.offers ?? [];
      const portraitsTexture = this.textures?.exists?.(SHOP_PORTRAIT_ATLAS_KEY)
        ? this.textures.get(SHOP_PORTRAIT_ATLAS_KEY)
        : null;

      for (let i = 0; i < (this.shopCards?.length ?? 0); i++) {
        const card = this.shopCards[i];
        if (!card) continue;

        const o = offers[i] ?? null;
        if (!o) {
          card.enabled = false;
          card.pressed = false;
          card.nameText.setText('\u041f\u0443\u0441\u0442\u043e');
          card.typeText.setText('\u2014');
          card.costText.setText('');
          card.powerTypeArt?.setVisible(false);
          card.costCoin?.setVisible(false);
          card.previewSprite.setCrop();
          card.previewSprite.setVisible(false);
          card.previewFallback.setText('\u2026').setVisible(true);
          card.updateCostLayout?.();
          card.refreshVisual();
          continue;
        }

        card.enabled = true;
        card.pressed = false;
        card.nameText.setText(String(o.type ?? 'Unknown'));
        const powerTypeText = String(o.powerType ?? '\u2014');
        const powerTypeArtKey = SHOP_CARD_POWER_ART_KEY_BY_POWER_TYPE[powerTypeText] ?? null;
        if (card.powerTypeArt) {
          if (powerTypeArtKey && this.textures?.exists?.(powerTypeArtKey)) {
            card.powerTypeArt.setTexture(powerTypeArtKey);
            card.powerTypeArt.setPosition(
              SHOP_CARD_ART_PRESET.powerArtOffsetX,
              Number(card.powerTypeArtBaseY ?? 0)
            );
            card.powerTypeArt.setScale(Number(card.cardScale ?? 1) * SHOP_CARD_ART_PRESET.powerArtScale);
            card.powerTypeArt.setVisible(true);
          } else {
            card.powerTypeArt.setVisible(false);
          }
        }
        const raceKey = String(o.race ?? '').toUpperCase();
        const raceText = SHOP_RACE_LABEL_BY_KEY[raceKey] ?? String(o.race ?? '\u2014');
        card.typeText.setText(raceText);
        card.costCoin?.setVisible(true);
        card.costText.setText(`${Number(o.cost ?? 0)}`);
        card.updateCostLayout?.();

        const customPortraitDef = SHOP_CUSTOM_PORTRAIT_BY_TYPE[String(o.type ?? '')] ?? null;
        const customPortraitKey = String(customPortraitDef?.key ?? '');
        const portraitStyle = getShopPortraitStyle();
        const hasCustomPortrait = !!(customPortraitKey && this.textures?.exists?.(customPortraitKey));
        const portraitFrame = portraitFrameForUnitType(o.type);
        const hasAtlasPortrait = !!(portraitsTexture && portraitFrame && portraitsTexture.has?.(portraitFrame));
        if (hasCustomPortrait || hasAtlasPortrait) {
          card.previewSprite.setVisible(true);
          card.previewFallback.setVisible(false);
          card.previewSprite.anims?.stop?.();
          card.previewSprite.setCrop();
          card.previewSprite.setOrigin(0.5, 0.5);
          card.previewSprite.setPosition(
            Number(SHOP_CARD_ART_PRESET.portraitOffsetX ?? 0),
            Number(card.previewPortraitY ?? card.artPanel?.y ?? 0) + Number(portraitStyle.offsetYPx ?? 0),
          );
          if (hasCustomPortrait) {
            card.previewSprite.setTexture(customPortraitKey);
          } else {
            card.previewSprite.setTexture(SHOP_PORTRAIT_ATLAS_KEY, portraitFrame);
          }

          const frame = card.previewSprite.frame;
          const fw = frame?.realWidth ?? frame?.width ?? 256;
          const fh = frame?.realHeight ?? frame?.height ?? 256;
          const panelW = card.artPanel?.width ?? (card.width - 14);
          const panelH = card.artPanel?.height ?? 86;
          const coverScale = Math.max(panelW / fw, panelH / fh);
          const scale = Math.max(0.12, coverScale * SHOP_PORTRAIT_SCALE * Number(portraitStyle.scaleMul ?? 1));
          card.previewSprite.setScale(scale);
        } else {
          card.previewSprite.setCrop();
          card.previewSprite.setVisible(false);
          card.previewFallback.setText(String(o.type ?? '?').slice(0, 1).toUpperCase()).setVisible(true);
        }

        card.refreshVisual();
      }
    },
  });
}



