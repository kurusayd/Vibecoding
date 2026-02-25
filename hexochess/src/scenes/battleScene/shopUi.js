export function installBattleSceneShopUi(BattleScene) {
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

      this.shopToggleBtn = this.add.text(0, 0, 'X', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.65)',
        padding: { left: 8, right: 8, top: 5, bottom: 5 },
      })
        .setOrigin(0.5, 0.5)
        .setDepth(10000)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      this.shopToggleBtn.on('pointerdown', () => {
        this.shopCollapsed = true;
        this.syncShopUI();
      });

      this.shopRefreshBtn = this.add.container(0, 0)
        .setDepth(10000)
        .setScrollFactor(0);

      this.shopRefreshBtnBody = this.add.container(30, 0);

      this.shopRefreshBtnBg = this.add.rectangle(0, 0, 60, 64, 0x463700, 0.78)
        .setOrigin(0.5, 0.5)
        .setStrokeStyle(1, 0x8f7a33, 0.75);

      this.shopRefreshBtnIcon = this.add.image(0, -12, 'updateMarketIcon')
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

      this.shopOpenBtn = this.add.text(0, 0, 'МАГАЗИН', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.72)',
        padding: { left: 12, right: 12, top: 7, bottom: 7 },
      })
        .setOrigin(0.5, 0.5)
        .setDepth(10000)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      this.shopOpenBtn.on('pointerdown', () => {
        this.shopCollapsed = !this.shopCollapsed;
        this.syncShopUI();
        this.playPressFeedback?.(this.shopOpenBtn, { scaleTo: 0.96, duration: 70 });
      });

      this.positionShop();
      this.syncShopUI();
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

      const divider1 = this.add.rectangle(0, top + 98, w - 16, 1, 0x6f5d3a, 0.55).setOrigin(0.5, 0.5);
      const divider2 = this.add.rectangle(0, top + 126, w - 16, 1, 0x6f5d3a, 0.40).setOrigin(0.5, 0.5);
      const divider3 = this.add.rectangle(0, top + 151, w - 16, 1, 0x6f5d3a, 0.35).setOrigin(0.5, 0.5);

      const previewSprite = this.add.sprite(
        0,
        (artPanel.y + artPanel.height / 2) - artLiftY,
        'sworman_atlas',
        'psd_animation/idle.png'
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

      const costCoin = this.add.image(-10, top + 167, 'coin')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(18, 18);

      const costText = this.add.text(4, top + 167, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '17px',
        color: '#7c5b00',
        fontStyle: 'bold',
        align: 'left',
      }).setOrigin(0, 0.5);

      const hit = this.add.zone(0, 0, w, h)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });

      card.container = container;
      card.shadow = shadow;
      card.bg = bg;
      card.border = border;
      card.artPanel = artPanel;
      card.previewSprite = previewSprite;
      card.previewFallback = previewFallback;
      card.nameText = nameText;
      card.typeText = typeText;
      card.costCoin = costCoin;
      card.costText = costText;
      card.hit = hit;

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
        costCoin,
        costText,
        border,
        hit,
      ]);

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
        this.shopToggleBtn.setPosition(btnX, btnY);

        if (this.shopRefreshBtn) {
          const xHalfW = (this.shopToggleBtn.width ?? this.shopToggleBtn.displayWidth ?? 0) / 2;
          const refreshHalfH = (this.shopRefreshBtn.height ?? this.shopRefreshBtn.displayHeight ?? 0) / 2;
          const tileBottomY = y + layout.height / 2;
          const refreshY = tileBottomY - refreshHalfH;
          const leftEdgeX = btnX - xHalfW;
          this.shopRefreshBtn.setPosition(leftEdgeX, refreshY);
        }
      }

      if (this.shopOpenBtn) {
        const view = this.scale.getViewPort();
        const btnW = this.shopOpenBtn.width ?? this.shopOpenBtn.displayWidth ?? 0;
        const btnH = this.shopOpenBtn.height ?? this.shopOpenBtn.displayHeight ?? 0;
        this.shopOpenBtn.setPosition(
          view.x + view.width - 12 - btnW / 2,
          view.y + view.height - 12 - btnH / 2,
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

      if (this.shopToggleBtn) {
        this.shopToggleBtn.setText('X');
        this.shopToggleBtn.setStyle({ backgroundColor: 'rgba(0,0,0,0.65)' });
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
        this.shopOpenBtn.setStyle({
          backgroundColor: isActive ? 'rgba(110,95,20,0.82)' : 'rgba(0,0,0,0.72)',
          color: isActive ? '#ffe08a' : '#ffffff',
        });
        this.shopOpenBtn.setAlpha(isActive ? 1 : 0.94);
      }

      if (!show) return;

      const refreshCost = 2;
      const coins = Number(this.battleState?.kings?.player?.coins ?? 0);
      const canRefreshShop = (mode === 'open') && coins >= refreshCost && !this.shopRefreshBusy;
      if (this.shopRefreshBtn) {
        this.shopRefreshBtnBg?.setFillStyle(canRefreshShop ? 0x463700 : 0x4b4b4b, canRefreshShop ? 0.78 : 0.75);
        this.shopRefreshBtnBg?.setStrokeStyle(1, canRefreshShop ? 0x8f7a33 : 0x787878, 0.75);
        this.shopRefreshBtnCost?.setAlpha(canRefreshShop ? 1 : 0.82);
        this.shopRefreshBtnIcon?.setAlpha(canRefreshShop ? 1 : 0.72);
        this.shopRefreshBtnCoin?.setAlpha(canRefreshShop ? 1 : 0.72);
        if (this.shopRefreshBtnHit?.input) this.shopRefreshBtnHit.input.enabled = canRefreshShop;
        this.shopRefreshBtn.setAlpha(canRefreshShop ? 1 : 0.78);
      }

      const offers = this.battleState?.shop?.offers ?? [];
      const atlasByType = this.shopUnitAtlasDefByType ?? {};
      const getIdleFrame = this.shopAtlasIdleFrame ?? ((def) => `${String(def?.framePrefix ?? 'psd_animation')}/idle.png`);

      for (let i = 0; i < (this.shopCards?.length ?? 0); i++) {
        const card = this.shopCards[i];
        if (!card) continue;

        const o = offers[i] ?? null;
        if (!o) {
          card.enabled = false;
          card.pressed = false;
          card.nameText.setText('Пусто');
          card.typeText.setText('—');
          card.costText.setText('');
          card.costCoin?.setVisible(false);
          card.previewSprite.setVisible(false);
          card.previewFallback.setText('…').setVisible(true);
          card.refreshVisual();
          continue;
        }

        card.enabled = true;
        card.pressed = false;
        card.nameText.setText(String(o.type ?? 'Unknown'));
        card.typeText.setText(String(o.powerType ?? '—'));
        card.costCoin?.setVisible(true);
        card.costText.setText(`${Number(o.cost ?? 0)}`);

        const atlasDef = atlasByType[o.type] ?? null;
        if (atlasDef && this.textures.exists(atlasDef.atlasKey)) {
          card.previewSprite.setVisible(true);
          card.previewFallback.setVisible(false);
          card.previewSprite.setTexture(atlasDef.atlasKey, getIdleFrame(atlasDef));

          const frame = card.previewSprite.frame;
          const fw = frame?.realWidth ?? frame?.width ?? 256;
          const fh = frame?.realHeight ?? frame?.height ?? 256;
          const panelW = card.artPanel?.width ?? (card.width - 14);
          const panelH = card.artPanel?.height ?? 86;
          const targetW = (panelW - 10) * 1.84;
          const targetH = (panelH - 6) * 1.96;
          const scale = Math.max(0.12, Math.min(targetW / fw, targetH / fh));
          card.previewSprite.setScale(scale);

          if (this.anims.exists(atlasDef.idleAnim)) {
            card.previewSprite.play(atlasDef.idleAnim, true);
          }
        } else {
          card.previewSprite.setVisible(false);
          card.previewFallback.setText(String(o.type ?? '?').slice(0, 1).toUpperCase()).setVisible(true);
        }

        card.refreshVisual();
      }
    },
  });
}

