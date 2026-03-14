import Phaser from 'phaser';
import { KING_MAX_LEVEL } from '../../../shared/battleCore.js';
import { baseIncomeForRound, interestIncome, streakBonus } from '../../../shared/economy.js';

export function installBattleSceneKingHudUi(BattleScene) {
  Object.assign(BattleScene.prototype, {
    positionCoinsHUD() {
      if (!this.kingLeftCoinIcon || !this.kingLeftCoinText || !this.kingLevelContainer) return;

      const view = this.scale.getViewPort();
      const btnTop = view.y + 14;

      const p0 = this.hexToPixel(0, 0);
      const baseX = Math.max(view.x + 8, p0.x - this.hexSize);

      const xpY = btnTop + 14;
      const crownW = this.kingLevelIcon?.displayWidth ?? 30;
      this.kingLevelContainer.setPosition(baseX + crownW / 2, xpY);

      if (this.kingXpBuyBtn) {
        this.kingXpBuyBtn.setPosition(baseX + 222, xpY);
      }
      if (this.kingUnitCapHud) {
        this.kingUnitCapHud.setPosition(baseX + 288, xpY);
      }

      const iconW = this.kingLeftCoinIcon.displayWidth || this.coinSize;
      const coinTextReserveW = Number(this.coinHudTextReserveW ?? 42);
      const coinGap = 8;
      const coinBlockW = iconW + coinGap + coinTextReserveW;
      const coinsToXpGap = 14;
      const xpLeftX = baseX;
      const coinLeftX = Math.max(view.x + 8, xpLeftX - coinsToXpGap - coinBlockW);
      const coinY = xpY;

      this.coinContainer.setPosition(Math.round(coinLeftX + iconW / 2), coinY);
    },

    syncKingsUI() {
      const kings = this.battleState?.kings;
      const p = kings?.player ?? { hp: 100, maxHp: 100, coins: 0 };
      const rawCoins = Number(p.coins ?? 0);
      const showTopHud = !this.sceneLoadIntroActive || !!this.sceneLoadIntroHudVisible;

      this.syncCoinHudCompact?.(rawCoins);

      const lvl = Number(p.level ?? 1);
      const xp = Number(p.xp ?? 0);
      const need = (lvl >= this.kingMaxLevel) ? 0 : (this.kingXpCost?.[lvl] ?? 0);

      if (this.kingLevelText) this.kingLevelText.setText(`${lvl}`);

      if (this.kingLevelXpText) {
        this.kingLevelXpText.setText(need > 0 ? `Exp: ${xp} / ${need}` : 'Max');
        this.kingLevelXpText.setVisible(this.kingLevelExpanded);
      }

      this.drawKingXpBar?.(lvl, xp, need);
      this.positionCoinsHUD();
      this.coinContainer?.setVisible?.(showTopHud);
      this.kingLevelContainer?.setVisible?.(showTopHud);

      if (this.kingXpBuyBtn) {
        const phase = this.battleState?.phase ?? 'prep';
        const result = this.battleState?.result ?? null;
        const level = Number(lvl);
        const buyCost = Number(this.kingXpBuyCost ?? 4);
        const hasCoins = Number(rawCoins) >= buyCost;
        const canUseXpButton =
          !this.testSceneActive &&
          phase === 'prep' &&
          !result &&
          level < Number(this.kingMaxLevel ?? KING_MAX_LEVEL);
        this.kingXpBuyBtn.setVisible(!this.testSceneActive && showTopHud);
        this.kingXpBuyBtn.setAlpha(canUseXpButton ? 1 : 0.62);
        if (this.kingXpBuyBtnHit?.input) this.kingXpBuyBtnHit.input.enabled = canUseXpButton;
        this.kingXpBuyBtnIcon?.setTint(canUseXpButton ? 0xffffff : 0xb0b0b0);
        this.kingXpBuyBtnCoin?.setAlpha(canUseXpButton ? 1 : 0.72);

        if (!canUseXpButton) {
          this.kingXpBuyBtnCostText?.setColor('#c8c8c8');
          this.kingXpBuyBtnCostText?.setStroke('#6e6e6e', 2);
          this.kingXpBuyBtnTopText?.setColor('#d8d8d8');
        } else if (!hasCoins) {
          this.kingXpBuyBtnCostText?.setColor('#ff5f5f');
          this.kingXpBuyBtnCostText?.setStroke('#6b1212', 2);
          this.kingXpBuyBtnTopText?.setColor('#fff0cf');
        } else {
          this.kingXpBuyBtnCostText?.setColor('#ffd85a');
          this.kingXpBuyBtnCostText?.setStroke('#b35a00', 2);
          this.kingXpBuyBtnTopText?.setColor('#fff0cf');
        }
      }

      if (this.kingUnitCapHud && this.kingUnitCapCurrentText && this.kingUnitCapSlashMaxText) {
        const phase = this.battleState?.phase ?? 'prep';
        const result = this.battleState?.result ?? null;
        // X counts only active board units; bench units are intentionally ignored.
        const boardUnits = (this.battleState?.units ?? []).filter((u) => (
          u?.team === 'player' &&
          u?.zone === 'board' &&
          !u?.dead
        ));
        const liveBoardUnits = Number(boardUnits.length ?? 0);
        const lockedBoardUnits = Number(this.lockedPlayerBoardUnitCount ?? NaN);
        const useLockedCount = phase === 'battle' || result != null;
        const currentUnits = useLockedCount && Number.isFinite(lockedBoardUnits)
          ? lockedBoardUnits
          : liveBoardUnits;
        const allowedUnits = Math.max(1, Number(lvl ?? 1));
        const isOverflow = currentUnits > allowedUnits;

        this.kingUnitCapCurrentText
          .setText(`${currentUnits}`)
          .setColor(isOverflow ? '#ff5f5f' : '#ffffff')
          .setStroke(isOverflow ? '#6b1212' : '#6e6e6e', 2);
        this.kingUnitCapSlashMaxText
          .setText(`/\u2009${allowedUnits}`)
          .setColor('#ffffff')
          .setStroke('#6e6e6e', 2);

        const textGap = 0;
        const currentW = Number(this.kingUnitCapCurrentText.width ?? 0);
        this.kingUnitCapCurrentText.setPosition(-textGap / 2, 0);
        this.kingUnitCapSlashMaxText.setPosition(textGap / 2, 0);

        const suffixW = Number(this.kingUnitCapSlashMaxText.width ?? 0);
        const currentH = Number(this.kingUnitCapCurrentText.height ?? 13);
        const suffixH = Number(this.kingUnitCapSlashMaxText.height ?? 13);
        const totalW = Math.max(1, currentW + textGap + suffixW);
        const totalH = Math.max(1, Math.max(currentH, suffixH));
        const bgPadX = 3;
        const bgW = totalW + bgPadX * 2;
        const bgH = totalH;
        const bgLeft = -bgW / 2;
        const bgTop = -bgH / 2;
        const blurSteps = 6;
        const edgeAlpha = 0.03;
        const centerAlpha = 0.05;
        const bgRadius = 7;
        this.kingUnitCapTextBg?.clear?.();
        for (let i = 0; i < blurSteps; i++) {
          const tNorm = blurSteps <= 1 ? 1 : (i / (blurSteps - 1));
          const alpha = Phaser.Math.Linear(edgeAlpha, centerAlpha, tNorm * tNorm);
          const inset = Math.floor((1 - tNorm) * Math.min(blurSteps - 1, Math.floor(Math.min(bgW, bgH) * 0.25)));
          const w = Math.max(1, bgW - inset * 2);
          const h = Math.max(1, bgH - inset * 2);
          const x = bgLeft + inset;
          const y = bgTop + inset;
          const radius = Math.max(1, bgRadius - Math.floor(inset * 0.5));
          this.kingUnitCapTextBg?.fillStyle?.(0x000000, alpha);
          this.kingUnitCapTextBg?.fillRoundedRect?.(x, y, w, h, radius);
        }
        this.kingUnitCapTextGroup?.setPosition?.(-4, Number(this.kingUnitCapTextGroup.y ?? 30));

        this.kingUnitCapHud.setVisible(!this.testSceneActive && showTopHud);
      }

      const phase = this.battleState?.phase ?? 'prep';
      const result = this.battleState?.result ?? null;

      const e = kings?.enemy ?? { hp: 100, maxHp: 100, coins: 0, visible: false };
      const enemyVisualKey = String(e.visualKey ?? 'king');
      if (this.kingRight) {
        this.kingRight.setFlipX(true);
      }
      if (this.kingRight && this.textures?.exists?.(enemyVisualKey) && this.kingRight.texture?.key !== enemyVisualKey) {
        this.kingRight.setTexture(enemyVisualKey);
        this.syncKingVisualConfig?.();
        this.positionKings?.();
      }
      this.syncKingVisualConfig?.();
      const enemyDisplayName = String(e.name ?? this.enemyKingDisplayName ?? 'Enemy King');
      this.kingRightNameText?.setText(enemyDisplayName);

      const isEntryView = phase === 'entry' && !!this.entryEnemyKingVisible;
      const isBattleView = (phase === 'battle') || (result != null);
      const isTestScenePreviewView = !!this.testSceneActive && !!this.testSceneEnemyKingPreviewVisible;
      const showEnemyKing = (isEntryView || isBattleView || isTestScenePreviewView) && (e.visible !== false);

      this.kingRight?.setVisible(showEnemyKing);
      this.syncRoundUI();
      this.drawKingHpBars();
    },

    drawKingXpBar(level, xp, need) {
      if (!this.kingLevelBarBg || !this.kingLevelBarFill) return;

      const ui = this.kingXpBarUi ?? {};
      const kingUi = this.kingUi ?? {};

      const w = Number(ui.width ?? 156);
      const h = Number(ui.height ?? 14);
      const r = Number(ui.radius ?? 6);
      const iconW = this.kingLevelIcon?.displayWidth ?? 30;

      const overlap = 10;
      const gap = 2;
      const barDx = Number(ui.xOffset ?? -8);
      const barDy = Number(ui.yOffset ?? 0);
      const x = (iconW / 2) - overlap + gap + barDx;
      const y = -h / 2 + barDy;

      this.kingLevelBarBg.clear();
      this.kingLevelBarFill.clear();

      this.kingLevelBarBg.fillStyle(kingUi.hpBar?.bgColor ?? 0x1c1c1c, kingUi.hpBar?.bgAlpha ?? 0.96);
      this.kingLevelBarBg.fillRoundedRect(x, y, w, h, r);

      const ratio = (need > 0) ? Phaser.Math.Clamp(xp / need, 0, 1) : 1;
      const fillW = Math.max(0, w * ratio);
      this.kingLevelBarFill.fillStyle(ui.fillColor ?? 0xc9a7ff, ui.fillAlpha ?? 0.95);
      this.kingLevelBarFill.fillRoundedRect(x, y, fillW, h, r);
      if (fillW > 3) {
        this.kingLevelBarFill.fillStyle(kingUi.hpBar?.highlightColor ?? 0xffffff, kingUi.hpBar?.highlightAlpha ?? 0.14);
        this.kingLevelBarFill.fillRect(x + 1, y + 1, fillW - 2, 1);
      }
      this.kingLevelBarBg.lineStyle(1, kingUi.hpBar?.frameColor ?? 0x1b1b1b, kingUi.hpBar?.frameAlpha ?? 0.85);
      this.kingLevelBarBg.strokeRoundedRect(x, y, w, h, r);

      const cx = x + w / 2;
      const cy = y + h / 2;
      const doubleDigitOffsetX = Number(level > 9 ? (this.kingLevelTextDoubleDigitOffsetX ?? 0) : 0);
      const crownTextX = Number(this.kingLevelIcon?.x ?? 0) + Number(this.kingLevelTextOffsetX ?? 0) + doubleDigitOffsetX;
      const crownTextY = Number(this.kingLevelIcon?.y ?? 0) + Number(this.kingLevelTextOffsetY ?? 0);
      this.kingLevelText.setPosition(crownTextX, crownTextY);

      this.kingLevelXpText.setOrigin(0.5, 0.5);
      this.kingLevelXpText.setPosition(cx, cy);

      const hitH = 44;
      const hitW = (iconW / 2) + w + 16;
      const hitCx = cx;
      const hitCy = 0;

      this.kingLevelHit.setPosition(hitCx, hitCy);
      this.kingLevelHit.setSize(hitW, hitH);
    },

    drawCoinBar(coins, maxCoins) {
      if (!this.coinBarBg || !this.coinBarFill) return;

      const w = 170;
      const h = 18;
      const iconW = this.kingLeftCoinIcon?.displayWidth ?? 28;
      const overlap = 10;
      const gap = 2;
      const x = (iconW / 2) - overlap + gap;
      const y = -h / 2;

      this.coinBarBg.clear();
      this.coinBarFill.clear();

      this.coinBarBg.lineStyle(1, 0x9a5a00, 1);
      this.coinBarBg.strokeRoundedRect(x, y, w, h, 6);

      this.coinBarBg.fillStyle(0x2a2a2a, 1);
      this.coinBarBg.fillRoundedRect(x + 1, y + 1, w - 2, h - 2, 5);

      const ratio = (maxCoins > 0) ? Phaser.Math.Clamp(coins / maxCoins, 0, 1) : 1;
      this.coinBarFill.fillStyle(0xffb000, 0.95);
      this.coinBarFill.fillRoundedRect(x + 1, y + 1, (w - 2) * ratio, h - 2, 5);

      const cx = x + w / 2;
      const cy = y + h / 2;
      this.kingLeftCoinText.setPosition(cx, cy);

      if (this.coinHit) {
        const hitH = 44;
        const hitW = (iconW / 2) + w + 16;
        const hitCx = x + w / 2;
        this.coinHit.setPosition(hitCx, 0);
        this.coinHit.setSize(hitW, hitH);
      }
    },

    syncCoinHudCompact(coins) {
      if (!this.kingLeftCoinIcon || !this.kingLeftCoinText) return;

      const rawCoins = Math.max(0, Number(coins ?? 0));
      this.kingLeftCoinText.setText(`${rawCoins}`);

      const iconW = this.kingLeftCoinIcon?.displayWidth ?? this.coinSize ?? 28;
      const textGap = 8;
      const textX = (iconW / 2) + textGap;
      const isAtCoinMax = rawCoins >= Number(this.coinMax ?? 100);
      const textW = Number(this.kingLeftCoinText.width ?? 0);
      this.kingLeftCoinText.setPosition(textX, 0);
      if (this.kingLeftCoinMaxText) {
        this.kingLeftCoinMaxText.setVisible(isAtCoinMax);
        this.kingLeftCoinMaxText.setPosition(textX + (textW / 2), 14);
      }

      if (this.coinHit) {
        const left = -(iconW / 2);
        const right = textX + textW;
        const padX = 8;
        const hitW = Math.max(64, Math.ceil((right - left) + padX * 2));
        const hitH = isAtCoinMax ? 52 : 44;
        const hitCx = Math.round((left + right) / 2);
        this.coinHit.setPosition(hitCx, isAtCoinMax ? 4 : 0);
        this.coinHit.setSize(hitW, hitH);
      }
    },

    showCoinInfoPopup() {
      if (this.coinInfoOpen) return;
      this.coinInfoOpen = true;

      const round = Number(this.battleState?.round ?? 1);
      const base = baseIncomeForRound(round);
      const coinsNow = Number(this.battleState?.kings?.player?.coins ?? 0);
      const interest = interestIncome(coinsNow);
      const stats = this.battleState?.debug?.playerStats ?? {};
      const winStreak = Number(stats.winStreak ?? 0);
      const loseStreak = Number(stats.loseStreak ?? 0);
      const winBonus = Number(stats.lastBattleWon ? 1 : 0);

      let expected = base + interest + winBonus;
      if (winStreak >= 3) {
        expected = base + interest + winBonus + streakBonus(winStreak);
      }
      if (loseStreak >= 3) {
        const effectiveLoseStreak = (loseStreak >= 3) ? streakBonus(loseStreak) : streakBonus(3);
        expected = base + interest + effectiveLoseStreak;
      }

      const b = this.coinContainer.getBounds();
      const padding = 10;
      const popupW = 320;
      const lineH = 18;

      const t = this.uiText ?? {};
      const lines = [];
      lines.push(`${t.COIN_INCOME ?? 'Income'}: +${base + interest}`);
      lines.push(`${t.WIN_BONUS ?? 'Win bonus'}: +${winBonus}`);

      if (winStreak >= 2) {
        const txt = (winStreak >= 3)
          ? `${t.WIN_STREAK_BONUS ?? 'Win streak'}: +${streakBonus(winStreak)}`
          : `${t.WIN_STREAK_BONUS ?? 'Win streak'}: +${streakBonus(3)} ${t.FROM_NEXT_WIN ?? ''}`;
        lines.push(txt);
      }

      if (loseStreak >= 2) {
        const txt = (loseStreak >= 3)
          ? `${t.LOSE_STREAK_BONUS ?? 'Lose streak'}: +${streakBonus(loseStreak)}`
          : `${t.LOSE_STREAK_BONUS ?? 'Lose streak'}: +${streakBonus(3)} ${t.FROM_NEXT_LOSS ?? ''}`;
        lines.push(txt);
      }

      lines.push(`${t.EXPECTED_ROUND_INCOME ?? 'Expected'}: +${expected}`);

      const popupH = padding * 2 + lines.length * lineH + 8;
      this.coinPopup = this.add.container(0, 0).setDepth(20000).setScrollFactor(0);

      const bg = this.add.rectangle(0, 0, popupW, popupH, 0x0b0b0b, 0.88)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0xffb000, 0.95);

      const text = this.add.text(0, 0, lines.join('\n'), {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '14px',
        color: '#ffffff',
        lineSpacing: 6,
        wordWrap: { width: popupW - padding * 2 },
      }).setOrigin(0, 0);

      text.setPosition(padding, padding);

      this.coinPopupHit = this.add.zone(0, 0, popupW, popupH)
        .setOrigin(0, 0)
        .setInteractive();

      this.coinPopup.add([bg, text, this.coinPopupHit]);

      let px = b.left;
      let py = b.bottom + 6;
      const viewW = this.scale.width;
      if (px + popupW > viewW - 8) px = Math.max(8, viewW - 8 - popupW);

      this.coinPopup.setPosition(px, py);
    },

    hideCoinInfoPopup() {
      if (!this.coinInfoOpen) return;
      this.coinInfoOpen = false;

      if (this.coinPopup) {
        this.coinPopup.destroy(true);
        this.coinPopup = null;
      }
      this.coinPopupHit = null;
    },
  });
}
