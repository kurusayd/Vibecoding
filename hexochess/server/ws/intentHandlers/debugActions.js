import { applyKingXp, kingXpToNext } from '../../../shared/battleCore.js';
import { makeTestBattleReplayMessage } from '../../../shared/messages.js';
import { UNIT_CATALOG } from '../../../shared/unitCatalog.js';

export const debugActionHandlers = {
  debugAddGold100(ctx) {
    ctx.state.kings = ctx.state.kings ?? {};
    ctx.state.kings.player = ctx.state.kings.player ?? { hp: 100, maxHp: 100, coins: 0, level: 1, xp: 0 };
    ctx.state.kings.player.coins = Number(ctx.state.kings.player.coins ?? 0) + 100;
    ctx.clampPlayerCoins();
    ctx.broadcastState();
  },

  debugAddLevel(ctx) {
    ctx.state.kings = ctx.state.kings ?? {};
    ctx.state.kings.player = ctx.state.kings.player ?? { hp: 100, maxHp: 100, coins: 0, level: 1, xp: 0 };
    const playerKing = ctx.state.kings.player;
    const level = Math.max(1, Number(playerKing.level ?? 1));
    const currentXp = Math.max(0, Number(playerKing.xp ?? 0));
    const requiredXp = Number(kingXpToNext(level) ?? 0);
    if (requiredXp > 0) {
      const delta = Math.max(0, requiredXp - currentXp);
      if (delta > 0) applyKingXp(playerKing, delta);
    }
    ctx.broadcastState();
  },

  debugSetShopUnit(ctx) {
    if (ctx.state.phase !== 'prep' && ctx.state.phase !== 'battle') {
      ctx.sendError('BAD_PHASE', 'debugSetShopUnit allowed only in prep/battle');
      return;
    }

    const unitType = String(ctx.msg.unitType ?? '').trim();
    if (!unitType) {
      ctx.sendError('BAD_ARGS', 'unitType required');
      return;
    }

    const base = UNIT_CATALOG.find((unit) => String(unit.type) === unitType);
    if (!base) {
      ctx.sendError('BAD_ARGS', `Unknown unitType: ${unitType}`);
      return;
    }

    ctx.state.shop = ctx.state.shop ?? { offers: [], locked: false };
    ctx.state.shop.locked = Boolean(ctx.state.shop.locked);
    ctx.state.shop.offers = [];
    for (let i = 0; i < ctx.SHOP_OFFER_COUNT; i += 1) {
      ctx.state.shop.offers.push(ctx.makeOfferFromCatalogUnit(base));
    }
    ctx.broadcastState();
  },

  debugRunTestBattle(ctx) {
    const simState = ctx.buildDebugTestBattleStateFromPayload(ctx.msg.units, ctx.msg.enemyKingVisualKey);
    const hasPlayer = (simState.units ?? []).some((unit) => unit.zone === 'board' && !unit.dead && unit.team === 'player');
    const hasEnemy = (simState.units ?? []).some((unit) => unit.zone === 'board' && !unit.dead && unit.team === 'enemy');
    if (!hasPlayer || !hasEnemy) {
      ctx.sendError('BAD_TEST_BATTLE', 'Test battle requires player and enemy units on board');
      return;
    }

    const battleStartState = ctx.cloneTestBattleStateForMessage(simState);
    const replay = ctx.simulateBattleReplayFromState(simState, {
      tickMs: ctx.SNAPSHOT_STEP_MS,
      maxBattleMs: ctx.BATTLE_DURATION_SECONDS * 1000,
      collectSnapshots: false,
    });

    ctx.ws.send(JSON.stringify(makeTestBattleReplayMessage({
      battleStartState,
      replay,
    })));
  },
};
