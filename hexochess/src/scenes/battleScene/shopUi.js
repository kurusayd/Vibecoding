export function installBattleSceneShopUi(BattleScene) {
  const SHOP_PORTRAIT_ATLAS_KEY = 'unitPortraitsAtlas';
  const SHOP_PORTRAIT_FRAME_PREFIX = 'ALL PORTRAITS/PREPEARE for Atlas/';
  // Portraits are square (256x256), but shop art panel is rectangular.
  // Cover mode fills the whole gray panel (with crop if needed). Tune one multiplier here.
  const SHOP_PORTRAIT_SCALE = 1.05;
  const SHOP_PORTRAIT_TYPE_ALIASES = {
    Swordsman: 'swordman',
  };
  const SHOP_FIGURE_ICON_BY_POWER_TYPE = {
    'Пешка': 'figure_pawn',
    'Конь': 'figure_knight',
    'Слон': 'figure_bishop',
    'Ладья': 'figure_rook',
    'Ферзь': 'figure_queen',
    PAWN: 'figure_pawn',
    KNIGHT: 'figure_knight',
    BISHOP: 'figure_bishop',
    ROOK: 'figure_rook',
    QUEEN: 'figure_queen',
  };
  const SHOP_RACE_LABEL_BY_KEY = {
    HUMAN: 'Люди',
    UNDEAD: 'Нежить',
    LIZARD: 'Ящеры',
    GOD: 'Боги',
    DEMON: 'Демоны',
  };
  const SHOP_CARD_FIGURE_ICON_SIZE = 35;
  const SHOP_CARD_FIGURE_OFFSET_X = 15;
  const SHOP_CARD_FIGURE_OFFSET_Y = -5;
  const SHOP_CARD_BOTTOM_ROW_Y = 172;
  const SHOP_CARD_FIGURE_ICON_X = -52;
  const SHOP_CARD_COST_TEXT_RIGHT_X = 55;
  const SHOP_CARD_COST_GROUP_OFFSET_X = 0;
  const SHOP_CARD_COST_GROUP_OFFSET_Y = -2;
  const SHOP_CARD_COST_GAP_PX = 6;
  const SHOP_CARD_COST_COIN_SIZE = 28;  // Shop art mask tuning (debug-visible black panel for now).
  const SHOP_CARD_ART_MASK_OFFSET_X = 0;
  const SHOP_CARD_ART_MASK_OFFSET_Y = 0;
  const SHOP_CARD_ART_MASK_WIDTH_DELTA = 0;
  const SHOP_CARD_ART_MASK_HEIGHT_DELTA = 0;
  // Per-side clip masks (shared for all shop tiles):
  // WIDTH/HEIGHT_*: shrink visible art area from this side.
  // OFFSET_X/OFFSET_Y_*: shift visible crop window.
  const SHOP_CARD_ART_CLIP_LEFT_WIDTH_DELTA = 200;
  const SHOP_CARD_ART_CLIP_LEFT_OFFSET_X = -200;
  const SHOP_CARD_ART_CLIP_LEFT_OFFSET_Y = 0;
  const SHOP_CARD_ART_CLIP_RIGHT_WIDTH_DELTA = 200;
  const SHOP_CARD_ART_CLIP_RIGHT_OFFSET_X = 200;
  const SHOP_CARD_ART_CLIP_RIGHT_OFFSET_Y = 0;
  const SHOP_CARD_ART_CLIP_TOP_HEIGHT_DELTA = 10;
  const SHOP_CARD_ART_CLIP_TOP_OFFSET_X = 0;
  const SHOP_CARD_ART_CLIP_TOP_OFFSET_Y = 0;
  const SHOP_CARD_ART_CLIP_BOTTOM_HEIGHT_DELTA = 0;
  const SHOP_CARD_ART_CLIP_BOTTOM_OFFSET_X = 0;
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

  const BUTTON_SHADOW_COLOR = 0x000000;
  const BUTTON_SHADOW_ALPHA = 0.35;
  const BUTTON_SHADOW_OFFSET_X = 2;
  const BUTTON_SHADOW_OFFSET_Y = 3;

  Object.assign(BattleScene.prototype, {
    initShopUI() {
      this.shopCards = [];
      this.shopCollapsed = false;
      this.shopRefreshBusy = false;
      this.shopRefreshUnlockTimer = null;
      this.shopRefreshRequestTimer = null;
      this.shopCardLayout = {
        width: 132,
        height: 188,
        gap: 10,
        bottomMargin: 10,
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

      this.positionShop();
      this.syncShopUI();
    },

    collapseShopUi() {
      const canShowShop = !this.testSceneActive && (this.battleState?.phase === 'prep' || this.battleState?.phase === 'battle');
      if (!canShowShop) return;
      if (this.shopCollapsed) return;
      this.shopCollapsed = true;
      this.syncShopUI?.();
    },

    createShopCard(index) {
      const layout = this.shopCardLayout ?? { width: 132, height: 188 };
      const w = layout.width;
      const h = layout.height;
      const top = -h / 2;
      const artLiftY = Number(this.shopCardArtLiftY ?? 75);

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

      const shadow = this.add.rectangle(4, 5, w, h, 0x000000, 0.35).setOrigin(0.5, 0.5);
      const bg = this.add.rectangle(0, 0, w, h, 0xf6edd7, 0.97).setOrigin(0.5, 0.5);
      const border = this.add.rectangle(0, 0, w, h)
        .setOrigin(0.5, 0.5)
        .setStrokeStyle(2, 0xb58a3c, 1);

      const artPanel = this.add.rectangle(0, top + 55, w - 14, 86, 0x1b1b1b, 0.92)
        .setOrigin(0.5, 0.5)
        .setStrokeStyle(1, 0x6f5d3a, 0.85);
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

      const divider1 = this.add.rectangle(0, top + 98, w - 16, 1, 0x6f5d3a, 0.55).setOrigin(0.5, 0.5);
      const divider2 = this.add.rectangle(0, top + 126, w - 16, 1, 0x6f5d3a, 0.40).setOrigin(0.5, 0.5);
      const divider3 = this.add.rectangle(0, top + 151, w - 16, 1, 0x6f5d3a, 0.35).setOrigin(0.5, 0.5);

      const previewSprite = this.add.sprite(
        0,
        (artPanel.y + artPanel.height / 2) - artLiftY,
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

      const nameText = this.add.text(0, top + 104, '...', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '14px',
        color: '#17130d',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: w - 16, useAdvancedWrap: true },
      }).setOrigin(0.5, 0);

      const typeText = this.add.text(0, top + 132, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '13px',
        color: '#4f3f25',
        align: 'center',
        wordWrap: { width: w - 16, useAdvancedWrap: true },
      }).setOrigin(0.5, 0);

      const figureIcon = this.add.image(
        SHOP_CARD_FIGURE_ICON_X + SHOP_CARD_FIGURE_OFFSET_X,
        top + SHOP_CARD_BOTTOM_ROW_Y + SHOP_CARD_FIGURE_OFFSET_Y,
        'figure_pawn'
      )
        .setOrigin(0.5, 0.5)
        .setDisplaySize(SHOP_CARD_FIGURE_ICON_SIZE, SHOP_CARD_FIGURE_ICON_SIZE)
        .setVisible(false);

      const costCoin = this.add.image(0, top + SHOP_CARD_BOTTOM_ROW_Y, 'coin')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(SHOP_CARD_COST_COIN_SIZE, SHOP_CARD_COST_COIN_SIZE);

      const costText = this.add.text(SHOP_CARD_COST_TEXT_RIGHT_X, top + SHOP_CARD_BOTTOM_ROW_Y, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '20px',
        color: '#7c5b00',
        fontStyle: 'bold',
        align: 'right',
      }).setOrigin(1, 0.5);

      const hit = this.add.zone(0, 0, w, h)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });

      card.container = container;
      card.shadow = shadow;
      card.bg = bg;
      card.border = border;
      card.artPanel = artPanel;
      card._artPanelLeft = panelLeft;
      card._artPanelRight = panelRight;
      card._artPanelTop = panelTop;
      card._artPanelBottom = panelBottom;
      card._cardLeft = cardLeft;
      card._cardRight = cardRight;
      card._cardTop = cardTop;
      card._cardBottom = cardBottom;
      card._artMaskCy = maskCy;
      card._artMaskH = maskH;
      card.previewSprite = previewSprite;
      card.previewUnitY = previewSprite.y;
      card.previewPortraitY = artPanel.y;
      card.previewFallback = previewFallback;
      card.nameText = nameText;
      card.typeText = typeText;
      card.figureIcon = figureIcon;
      card.costCoin = costCoin;
      card.costText = costText;
      card.hit = hit;

      card.updateCostLayout = () => {
        const textX = SHOP_CARD_COST_TEXT_RIGHT_X + SHOP_CARD_COST_GROUP_OFFSET_X;
        const y = top + SHOP_CARD_BOTTOM_ROW_Y + SHOP_CARD_COST_GROUP_OFFSET_Y;
        const textW = Number(card.costText.width ?? 0);
        const coinW = Number(card.costCoin.displayWidth ?? SHOP_CARD_COST_COIN_SIZE);
        const figureX = SHOP_CARD_FIGURE_ICON_X + SHOP_CARD_FIGURE_OFFSET_X;
        const figureY = top + SHOP_CARD_BOTTOM_ROW_Y + SHOP_CARD_FIGURE_OFFSET_Y;
        card.figureIcon.setPosition(figureX, figureY);
        card.costText.setPosition(textX, y);
        card.costCoin.setPosition(textX - textW - SHOP_CARD_COST_GAP_PX - (coinW / 2), y);
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

        const fill = enabled
          ? (hovered ? 0xfcf4e4 : 0xf6edd7)
          : 0xaea79b;
        const fillAlpha = enabled ? 0.97 : 0.62;
        const borderColor = enabled ? (hovered ? 0xe1b754 : 0xb58a3c) : 0x7f786b;

        card.bg.setFillStyle(fill, fillAlpha);
        card.border.setStrokeStyle(2, borderColor, 1);
        card.artPanel.setAlpha(enabled ? 1 : 0.55);
        card.container.setScale(pressed ? 0.985 : 1);
        card.previewSprite.setAlpha(enabled ? 1 : 0.55);
        card.previewFallback.setAlpha(enabled ? 1 : 0.55);
        card.nameText.setAlpha(enabled ? 1 : 0.75);
        card.typeText.setAlpha(enabled ? 1 : 0.75);
        card.figureIcon.setAlpha(enabled ? 1 : 0.75);
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
        shadow,
        bg,
        artPanel,
        previewSprite,
        previewFallback,
        divider1,
        nameText,
        divider2,
        typeText,
        divider3,
        figureIcon,
        costCoin,
        costText,
        border,
        hit,
      ]);

      card.updateCostLayout();
      card.refreshVisual();
      return card;
    },

    positionShop() {
      if (!this.shopCards?.length) return;

      const layout = this.shopCardLayout ?? { width: 132, height: 188, gap: 10, bottomMargin: 10 };
      const totalW = this.shopCards.length * layout.width + (this.shopCards.length - 1) * layout.gap;
      let x = this.scale.width / 2 - totalW / 2 + layout.width / 2;
      const y = this.scale.height - layout.bottomMargin - layout.height / 2;

      for (const card of this.shopCards) {
        card.container?.setPosition(x, y);
        x += layout.width + layout.gap;
      }

      if (this.shopToggleBtn) {
        const rightEdge = this.scale.width / 2 + totalW / 2;
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
      if (btn === this.shopRefreshBtn) return mode === 'open';
      if (btn === this.shopOpenBtn) return mode === 'collapsed' || mode === 'open';

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
        this.setShopButtonVisual(this.shopRefreshBtn, true, { immediate, slideY: 6 });
        this.setShopButtonVisual(this.shopOpenBtn, true, { immediate: true, slideY: 10 });
        return;
      }

      if (mode === 'collapsed') {
        this.setShopCardsVisual(false, { immediate });
        this.setShopButtonVisual(this.shopToggleBtn, false, { immediate, slideY: 6 });
        this.setShopButtonVisual(this.shopRefreshBtn, false, { immediate, slideY: 6 });
        this.setShopButtonVisual(this.shopOpenBtn, true, { immediate: true, slideY: 10 });
        return;
      }

      this.setShopCardsVisual(false, { immediate });
      this.setShopButtonVisual(this.shopToggleBtn, false, { immediate, slideY: 6 });
      this.setShopButtonVisual(this.shopRefreshBtn, false, { immediate, slideY: 6 });
      this.setShopButtonVisual(this.shopOpenBtn, false, { immediate: true, slideY: 10 });
    },

    syncShopUI() {
      const phase = this.battleState?.phase ?? 'prep';
      const result = this.battleState?.result ?? null;
      const show = !this.testSceneActive && (phase === 'prep' || phase === 'battle');
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

      const refreshCost = 2;
      const coins = Number(this.battleState?.kings?.player?.coins ?? 0);
      const canRefreshShop = (mode === 'open') && coins >= refreshCost && !this.shopRefreshBusy;
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
          card.figureIcon?.setVisible(false);
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
        const raceKey = String(o.race ?? '').toUpperCase();
        const raceText = SHOP_RACE_LABEL_BY_KEY[raceKey] ?? String(o.race ?? '\u2014');
        card.typeText.setText(raceText);
        const figureIconKey = SHOP_FIGURE_ICON_BY_POWER_TYPE[powerTypeText] ?? null;
        const hasFigureIcon = !!(figureIconKey && this.textures?.exists?.(figureIconKey));
        if (card.figureIcon) {
          if (hasFigureIcon) {
            card.figureIcon.setTexture(figureIconKey);
            card.figureIcon.setVisible(true);
          } else {
            card.figureIcon.setVisible(false);
          }
        }
        card.costCoin?.setVisible(true);
        card.costText.setText(`${Number(o.cost ?? 0)}`);
        card.updateCostLayout?.();

        const portraitFrame = portraitFrameForUnitType(o.type);
        const hasPortrait = !!(portraitsTexture && portraitFrame && portraitsTexture.has?.(portraitFrame));
        if (hasPortrait) {
          card.previewSprite.setVisible(true);
          card.previewFallback.setVisible(false);
          card.previewSprite.anims?.stop?.();
          card.previewSprite.setCrop();
          card.previewSprite.setOrigin(0.5, 0.5);
          card.previewSprite.setPosition(0, Number(card.previewPortraitY ?? card.artPanel?.y ?? 0));
          card.previewSprite.setTexture(SHOP_PORTRAIT_ATLAS_KEY, portraitFrame);

          const frame = card.previewSprite.frame;
          const fw = frame?.realWidth ?? frame?.width ?? 256;
          const fh = frame?.realHeight ?? frame?.height ?? 256;
          const panelW = card.artPanel?.width ?? (card.width - 14);
          const panelH = card.artPanel?.height ?? 86;
          const coverScale = Math.max(panelW / fw, panelH / fh);
          const scale = Math.max(0.12, coverScale * SHOP_PORTRAIT_SCALE);
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



