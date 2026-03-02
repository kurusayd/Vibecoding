import { updateHpBar } from '../../game/hpbar.js';
import { getUnitArtOffsetXPx, getUnitFootShadowConfig, getUnitGroundLiftPx } from '../../game/unitVisualConfig.js';

export function installBattleSceneDrag(BattleScene) {
  Object.assign(BattleScene.prototype, {
    initDragState() {
      this.draggingUnitId = null;
      this.dragBoardHover = null; // { q, r }
      this.dragBenchHoverSlot = null; // number
      this.hoverPickupCell = null; // { area: 'board'|'bench', q?, r?, slot?, unitId }
    },

    bindDragHandlers() {
      const restoreHoverAfterDrop = (pointer, unitId, preferredCell = null) => {
        if (!unitId) {
          this.hoverPickupCell = null;
          return;
        }

        const core = (this.battleState?.units ?? []).find((u) => String(u.id) === String(unitId));
        if (!core || core.dead) {
          this.hoverPickupCell = null;
          return;
        }

        const canUsePreferred = (() => {
          if (!preferredCell || !pointer) return false;
          if (preferredCell.area === 'board') {
            const hit = this.tryPickBoard(pointer.worldX, pointer.worldY);
            return !!hit && Number(hit.q) === Number(preferredCell.q) && Number(hit.r) === Number(preferredCell.r);
          }
          if (preferredCell.area === 'bench' && Number.isInteger(preferredCell.slot)) {
            const hitBench = this.tryPickBench(pointer.worldX, pointer.worldY);
            return !!hitBench && Number(hitBench.row) === Number(preferredCell.slot);
          }
          return false;
        })();

        if (canUsePreferred) {
          this.hoverPickupCell = { ...preferredCell, unitId: core.id };
          return;
        }

        if (core.zone === 'board') {
          this.hoverPickupCell = { area: 'board', q: core.q, r: core.r, unitId: core.id };
          return;
        }
        if (core.zone === 'bench') {
          const slot = Number.isInteger(core.benchSlot) ? core.benchSlot : 0;
          this.hoverPickupCell = { area: 'bench', slot, unitId: core.id };
          return;
        }
        this.hoverPickupCell = null;
      };

      this.input.on('dragstart', (pointer, gameObject) => {
        const uid = gameObject?.data?.get?.('unitId');
        if (!uid) return;
        const core = (this.battleState?.units ?? []).find((u) => String(u.id) === String(uid));
        if (!core) return;

        const canDragEnemyInTestPrep = !!this.testSceneActive && core.team === 'enemy' && core.zone === 'board';
        const isPlayerBench = core.team === 'player' && core.zone === 'bench';
        const isPrepManage = (this.battleState?.phase === 'prep') && !this.battleState?.result;
        if (core.team !== 'player' && !canDragEnemyInTestPrep) return;
        if (!isPlayerBench && !isPrepManage) return;
        if (core.zone !== 'board' && core.zone !== 'bench') return;

        this.draggingUnitId = uid;
        this.hoverPickupCell = null;
        if (!this.testSceneActive) {
          const hitBench = this.tryPickBench(pointer.worldX, pointer.worldY);
          this.dragBenchHoverSlot = hitBench ? hitBench.row : null;
          this.dragBoardHover = null;
          if (!hitBench) {
            const hit = this.tryPickBoard(pointer.worldX, pointer.worldY);
            this.dragBoardHover = hit ? { q: hit.q, r: hit.r } : null;
          }
        } else {
          this.dragBenchHoverSlot = null;
          const hit = this.tryPickBoard(pointer.worldX, pointer.worldY);
          this.dragBoardHover = hit ? { q: hit.q, r: hit.r } : null;
        }

        const vu = this.unitSys.findUnit(uid);
        if (vu?._moveTween) {
          try { vu._moveTween.stop(); } catch {}
          vu._moveTween = null;
        }
        for (const obj of [vu?.sprite, vu?.dragHandle, vu?.label, vu?.art]) {
          if (obj) this.tweens.killTweensOf(obj);
        }
        if (vu?.art?.active) {
          vu._dragPickupArtScale = {
            x: Number(vu.art.scaleX ?? 1),
            y: Number(vu.art.scaleY ?? 1),
          };
          this.tweens.add({
            targets: vu.art,
            scaleX: vu._dragPickupArtScale.x * 1.08,
            scaleY: vu._dragPickupArtScale.y * 1.08,
            duration: 90,
            ease: 'Quad.Out',
          });
        }
        if (vu?.footShadow) vu.footShadow.setVisible(false);
        if (vu?.hpBar) vu.hpBar.setVisible(false);
        if (vu?.rankIcon) vu.rankIcon.setVisible(false);
        this.drawGrid();
      });

      this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
        const uid = gameObject?.data?.get?.('unitId');
        if (!uid || String(uid) !== String(this.draggingUnitId)) return;
        const core = (this.battleState?.units ?? []).find((u) => String(u.id) === String(uid));
        if (!core) return;

        gameObject.setPosition(dragX, dragY);

        const vu = this.unitSys.findUnit(uid);
        if (!vu) return;
        vu.sprite?.setPosition(dragX, dragY);
        vu.dragHandle?.setPosition(dragX, dragY);
        vu.label?.setPosition(dragX, dragY);
        const lift = getUnitGroundLiftPx(core.type);
        vu.art?.setPosition(dragX + getUnitArtOffsetXPx(core.type, core.team), dragY + this.hexSize - lift);
        if (vu.hpBar) vu.hpBar.setVisible(false);
        if (vu.rankIcon) vu.rankIcon.setVisible(false);
        if (!this.testSceneActive) {
          const hitBench = this.tryPickBench(pointer.worldX, pointer.worldY);
          if (hitBench) {
            this.dragBenchHoverSlot = hitBench.row;
            this.dragBoardHover = null;
          } else {
            const hit = this.tryPickBoard(pointer.worldX, pointer.worldY);
            this.dragBoardHover = hit ? { q: hit.q, r: hit.r } : this.dragBoardHover;
            this.dragBenchHoverSlot = null;
          }
        } else {
          const hit = this.tryPickBoard(pointer.worldX, pointer.worldY);
          this.dragBoardHover = hit ? { q: hit.q, r: hit.r } : this.dragBoardHover;
        }
        this.drawGrid();
      });

      this.input.on('dragend', (pointer, gameObject) => {
        const uid = gameObject?.data?.get?.('unitId');
        const draggedId = this.draggingUnitId;
        this._unitInfoSuppressUntil = Number(this.time?.now ?? 0) + 180;
        this.draggingUnitId = null;
        this.dragBoardHover = null;
        const dropBenchSlot = this.dragBenchHoverSlot;
        this.dragBenchHoverSlot = null;

        const draggedVu = draggedId != null ? this.unitSys.findUnit(draggedId) : null;
        if (draggedVu?.art?.active && draggedVu._dragPickupArtScale) {
          const base = draggedVu._dragPickupArtScale;
          this.tweens.killTweensOf(draggedVu.art);
          this.tweens.add({
            targets: draggedVu.art,
            scaleX: base.x,
            scaleY: base.y,
            duration: 90,
            ease: 'Quad.Out',
            onComplete: () => {
              if (draggedVu?.art?.active) draggedVu.art.setScale(base.x, base.y);
              if (draggedVu) draggedVu._dragPickupArtScale = null;
            },
          });
        }

        if (!uid || String(uid) !== String(draggedId)) {
          this.renderFromState();
          restoreHoverAfterDrop(pointer, uid);
          this.drawGrid();
          return;
        }

        const core = (this.battleState?.units ?? []).find((u) => String(u.id) === String(uid));
        if (!core) {
          this.renderFromState();
          restoreHoverAfterDrop(pointer, uid);
          this.drawGrid();
          return;
        }

        const isPrepManage = (this.battleState?.phase === 'prep') && !this.battleState?.result;
        const isBenchManageAnytime = !this.testSceneActive && core.team === 'player' && core.zone === 'bench';
        if (!isPrepManage && !isBenchManageAnytime) {
          this.renderFromState();
          restoreHoverAfterDrop(pointer, uid);
          this.drawGrid();
          return;
        }

        if (!this.testSceneActive && Number.isInteger(dropBenchSlot)) {
          if (core.zone === 'bench' && Number(core.benchSlot) === Number(dropBenchSlot)) {
            const vu = this.unitSys.findUnit(uid);
            if (vu) {
              const p = this.benchSlotToScreen(dropBenchSlot);
              const lift = getUnitGroundLiftPx(core.type);
              const shadowCfg = getUnitFootShadowConfig(core.type);
              vu.sprite?.setPosition(p.x, p.y);
              vu.dragHandle?.setPosition(p.x, p.y);
              vu.label?.setPosition(p.x, p.y);
              vu.art?.setPosition(p.x + getUnitArtOffsetXPx(core.type, core.team), p.y + this.hexSize - lift);
              vu.footShadow?.setPosition(p.x + shadowCfg.offsetXPx, p.y + shadowCfg.offsetYPx);
              if (!core.dead) vu.footShadow?.setVisible(true);
              if (vu.hpBar) vu.hpBar.setVisible(false);
              if (vu.rankIcon) vu.rankIcon.setVisible(!core.dead);
              updateHpBar(this, vu);
            }
            restoreHoverAfterDrop(pointer, uid, { area: 'bench', slot: dropBenchSlot });
            this.drawGrid();
            return;
          }
          restoreHoverAfterDrop(pointer, uid, { area: 'bench', slot: dropBenchSlot });
          this.drawGrid();
          this.ws?.sendIntentSetBench(uid, dropBenchSlot);
          return;
        }

        if (!isPrepManage) {
          this.renderFromState();
          restoreHoverAfterDrop(pointer, uid);
          this.drawGrid();
          return;
        }

        const hit = this.tryPickBoard(pointer.worldX, pointer.worldY);
        if (!hit) {
          this.renderFromState();
          restoreHoverAfterDrop(pointer, uid);
          this.drawGrid();
          return;
        }

        if (this.testSceneActive) {
          const local = (this.battleState?.units ?? []).find((u) => String(u.id) === String(uid));
          if (local) {
            local.q = hit.q;
            local.r = hit.r;
            local.zone = 'board';
            local.benchSlot = null;
            this.renderFromState();
            restoreHoverAfterDrop(pointer, uid, { area: 'board', q: hit.q, r: hit.r });
            this.drawGrid();
            return;
          }
        } else {
          if (core.zone === 'board' && Number(core.q) === Number(hit.q) && Number(core.r) === Number(hit.r)) {
            const vu = this.unitSys.findUnit(uid);
            if (vu) {
              const p = this.hexToPixel(hit.q, hit.r);
              const lift = getUnitGroundLiftPx(core.type);
              const g = this.hexToGroundPixel(hit.q, hit.r, lift);
              const shadowCfg = getUnitFootShadowConfig(core.type);
              vu.sprite?.setPosition(p.x, p.y);
              vu.dragHandle?.setPosition(p.x, p.y);
              vu.label?.setPosition(p.x, p.y);
              vu.art?.setPosition(g.x + getUnitArtOffsetXPx(core.type, core.team), g.y);
              vu.footShadow?.setPosition(p.x + shadowCfg.offsetXPx, p.y + shadowCfg.offsetYPx);
              if (!core.dead) vu.footShadow?.setVisible(true);
              if (vu.hpBar) vu.hpBar.setVisible(false);
              if (vu.rankIcon) vu.rankIcon.setVisible(!core.dead);
              updateHpBar(this, vu);
            }
            restoreHoverAfterDrop(pointer, uid, { area: 'board', q: hit.q, r: hit.r });
            this.drawGrid();
            return;
          }

          restoreHoverAfterDrop(pointer, uid, { area: 'board', q: hit.q, r: hit.r });
          this.drawGrid();
          this.ws?.sendIntentSetStart(uid, hit.q, hit.r);
          return;
        }

        this.renderFromState();
        restoreHoverAfterDrop(pointer, uid);
        this.drawGrid();
      });
    },

    setSpriteDraggable(sprite, enabled) {
      if (!sprite || !sprite.active) return;
      this.input.setDraggable(sprite, !!enabled);
      if (sprite.input) sprite.input.enabled = !!enabled;
    },

    tryPickBoard(x, y) {
      const { q, r } = this.pixelToHex(x, y);
      const row = r;
      const col = q + Math.floor(row / 2);

      if (row < 0 || row >= this.gridRows) return null;
      if (col < 0 || col >= this.gridCols) return null;
      if (!this.testSceneActive && this.battleState?.phase === 'prep' && col >= 6) return null;

      return { q, r, row, col };
    },

    tryPickBench(x, y) {
      const leftTop = this.hexToPixel(0 - Math.floor(0 / 2), 0);
      const benchOriginX = leftTop.x - this.benchGap;

      const dx = (this.originX - benchOriginX);
      const { q, r } = this.pixelToHex(x + dx, y);

      const row = r;
      const col = q + Math.floor(row / 2);
      if (row < 0 || row >= this.benchRows) return null;
      if (col !== 0) return null;

      const p = this.hexToPixel(0 - Math.floor(row / 2), row);
      return { row, col: 0, screen: { x: p.x - dx, y: p.y } };
    },

    refreshAllDraggable() {
      const phase = this.battleState?.phase ?? 'prep';
      const result = this.battleState?.result ?? null;
      const canManageBoard = (phase === 'prep') && !result;

      for (const u of (this.battleState?.units ?? [])) {
        const vu = this.unitSys.findUnit(u.id);
        if (!vu?.dragHandle) continue;

        const canDrag =
          (
            (u.team === 'player' && u.zone === 'bench') ||
            (
              canManageBoard &&
              u.zone === 'board' &&
              (
                u.team === 'player' ||
                (this.testSceneActive && u.team === 'enemy')
              )
            )
          );

        this.setSpriteDraggable(vu.dragHandle, canDrag);
      }
    },
  });
}
