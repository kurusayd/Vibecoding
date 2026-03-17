import { getUnitAt, getUnitCellSpanX, moveUnit } from '../../../shared/battleCore.js';

export const placementActionHandlers = {
  setBench(ctx) {
    if (!ctx.requireOwnedUnit()) return;

    const slot = Number(ctx.msg.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= ctx.BENCH_SLOTS) {
      ctx.sendError('BAD_ARGS', 'slot must be integer 0..7');
      return;
    }

    const me = ctx.findUnitById(ctx.requestedUnitId);
    if (!me) {
      ctx.sendError('NO_UNIT', 'Unit not found');
      return;
    }

    if (ctx.state.phase !== 'prep' && me.zone !== 'bench') {
      ctx.sendError('BAD_PHASE', 'Only bench units can be managed outside prep');
      return;
    }

    const prev = {
      zone: me.zone,
      q: me.q,
      r: me.r,
      benchSlot: me.benchSlot,
    };

    const occupied = ctx.getUnitInBenchSlot(slot);
    if (occupied && occupied.id !== ctx.requestedUnitId) {
      if (occupied.team !== 'player' || !ctx.owned.has(occupied.id)) {
        ctx.sendError('OCCUPIED', 'Bench slot occupied');
        return;
      }

      me.zone = 'bench';
      me.benchSlot = slot;

      if (prev.zone === 'bench') {
        occupied.zone = 'bench';
        occupied.benchSlot = prev.benchSlot;
      } else {
        if (!ctx.canPlaceUnitAtBoard(ctx.state, occupied, prev.q, prev.r, me.id)) {
          ctx.sendError('OCCUPIED', 'Cannot swap: previous board cell is blocked');
          return;
        }
        occupied.zone = 'board';
        occupied.benchSlot = null;
        occupied.q = prev.q;
        occupied.r = prev.r;
      }

      ctx.applyMergesForClient(ctx.clientId, ctx.requestedUnitId);
      ctx.broadcastState();
      return;
    }

    me.zone = 'bench';
    me.benchSlot = slot;
    ctx.applyMergesForClient(ctx.clientId, ctx.requestedUnitId);
    ctx.broadcastState();
  },

  setStart(ctx) {
    if (ctx.state.phase !== 'prep') {
      ctx.sendError('BAD_PHASE', 'setStart allowed only in prep');
      return;
    }
    if (!ctx.requireOwnedUnit()) return;

    const q = Number(ctx.msg.q);
    const r = Number(ctx.msg.r);
    if (!Number.isInteger(q) || !Number.isInteger(r)) {
      ctx.sendError('BAD_ARGS', 'q/r must be integers');
      return;
    }

    if (!ctx.isInsideBoard(q, r)) {
      ctx.sendError('OUT_OF_BOUNDS', 'Cell is outside board');
      return;
    }

    const me = ctx.findUnitById(ctx.requestedUnitId);
    if (!me) {
      ctx.sendError('NO_UNIT', 'Unit not found');
      return;
    }

    if (!ctx.isBoardPlacementInsideForUnit(me, q, r)) {
      ctx.sendError('OUT_OF_BOUNDS', 'Unit footprint is outside board');
      return;
    }

    const maxPlayerPrepCols = Math.min(ctx.GRID_COLS, 6);
    const cells = ctx.getBoardCellsForUnitAnchor(me, q, r);
    const outsidePrep = cells.some((cell) => {
      const col = cell.q + Math.floor(cell.r / 2);
      return col < 0 || col >= maxPlayerPrepCols;
    });
    if (outsidePrep) {
      ctx.sendError('OUT_OF_PREP_ZONE', 'Cell is outside player prep zone');
      return;
    }

    const prev = {
      zone: me.zone,
      q: me.q,
      r: me.r,
      benchSlot: me.benchSlot,
    };

    const targetBlockers = (() => {
      const ids = new Map();
      for (const cell of ctx.getBoardCellsForUnitAnchor(me, q, r)) {
        const blocker = getUnitAt(ctx.state, cell.q, cell.r);
        if (!blocker) continue;
        if (Number(blocker.id) === Number(ctx.requestedUnitId)) continue;
        ids.set(Number(blocker.id), blocker);
      }
      return Array.from(ids.values());
    })();

    const occupied = targetBlockers[0] ?? null;
    if (occupied && occupied.id !== ctx.requestedUnitId) {
      if (targetBlockers.length > 1) {
        ctx.sendError('OCCUPIED', 'Target footprint is occupied');
        return;
      }
      if (occupied.team !== 'player' || !ctx.owned.has(occupied.id)) {
        ctx.sendError('OCCUPIED', 'Cell is occupied');
        return;
      }

      const meSpan = getUnitCellSpanX(me);
      const occupiedSpan = getUnitCellSpanX(occupied);
      const swapTargetQ = (meSpan > 1 && occupiedSpan > 1) ? Number(occupied.q) : q;
      const swapTargetR = (meSpan > 1 && occupiedSpan > 1) ? Number(occupied.r) : r;

      if (prev.zone === 'board') {
        const prevBlockers = (() => {
          const ids = new Map();
          for (const cell of ctx.getBoardCellsForUnitAnchor(occupied, prev.q, prev.r)) {
            const blocker = getUnitAt(ctx.state, cell.q, cell.r);
            if (!blocker) continue;
            if (Number(blocker.id) === Number(me.id) || Number(blocker.id) === Number(occupied.id)) continue;
            ids.set(Number(blocker.id), blocker);
          }
          return Array.from(ids.values());
        })();
        if (prevBlockers.length > 0) {
          ctx.sendError('OCCUPIED', 'Cannot swap: previous board cell is blocked');
          return;
        }
      }

      me.zone = 'board';
      me.benchSlot = null;
      me.q = swapTargetQ;
      me.r = swapTargetR;

      if (prev.zone === 'board') {
        occupied.zone = 'board';
        occupied.benchSlot = null;
        occupied.q = prev.q;
        occupied.r = prev.r;
      } else {
        occupied.zone = 'bench';
        occupied.benchSlot = prev.benchSlot;
      }

      ctx.applyMergesForClient(ctx.clientId, ctx.requestedUnitId);
      ctx.broadcastState();
      return;
    }

    me.zone = 'board';
    me.benchSlot = null;

    if (!ctx.canPlaceUnitAtBoard(ctx.state, me, q, r, ctx.requestedUnitId)) {
      ctx.sendError('MOVE_DENIED', 'Cannot set start there');
      return;
    }

    const moved = moveUnit(ctx.state, ctx.requestedUnitId, q, r);
    if (!moved) {
      ctx.sendError('MOVE_DENIED', 'Cannot set start there');
      return;
    }

    ctx.applyMergesForClient(ctx.clientId, ctx.requestedUnitId);
    ctx.broadcastState();
  },

  removeUnit(ctx) {
    if (!ctx.requireOwnedUnit()) return;

    const me = ctx.findUnitById(ctx.requestedUnitId);
    if (!me) {
      ctx.sendError('NO_UNIT', 'Unit not found');
      return;
    }

    if (ctx.state.phase !== 'prep' && me.zone !== 'bench') {
      ctx.sendError('BAD_PHASE', 'Only bench units can be removed outside prep');
      return;
    }

    const sellRefund = ctx.getSellPriceForUnit(me);
    ctx.state.kings = ctx.state.kings ?? {};
    ctx.state.kings.player = ctx.state.kings.player ?? { hp: 100, maxHp: 100, coins: 0, level: 1, xp: 0 };
    ctx.state.kings.player.coins = Number(ctx.state.kings.player.coins ?? 0) + sellRefund;
    ctx.clampPlayerCoins();

    ctx.removeOwnedUnit(ctx.state, ctx.owned, ctx.requestedUnitId);
    ctx.applyMergesForClient(ctx.clientId, null);
    ctx.broadcastState();
  },
};
