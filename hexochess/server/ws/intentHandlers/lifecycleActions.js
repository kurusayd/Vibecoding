import { applyKingXp } from '../../../shared/battleCore.js';

export const lifecycleActionHandlers = {
  startGame(ctx) {
    if (!ctx.isPreStart()) {
      ctx.sendError('BAD_PHASE', 'startGame allowed only before round start');
      return;
    }

    ctx.state.round = 1;
    ctx.state.winStreak = 0;
    ctx.state.loseStreak = 0;
    ctx.state.result = null;
    ctx.state.gameStarted = true;
    ctx.state.prepSecondsLeft = 0;
    ctx.state.entrySecondsLeft = 0;

    ctx.generateShopOffers();
    ctx.ensureSoloLobbyInitialized();
    ctx.syncRoundPairingsForCurrentRound();

    ctx.broadcastState();
    ctx.startPrepCountdown();
  },

  startBattle(ctx) {
    if (ctx.state.phase !== 'prep') {
      ctx.sendError('BAD_PHASE', 'Battle can start only from prep');
      return;
    }
    ctx.startBattle();
  },

  resetGame(ctx) {
    ctx.resetGameToStart();
  },

  buyXp(ctx) {
    if (ctx.state.phase !== 'prep' || ctx.state.result) {
      ctx.sendError('BAD_PHASE', 'buyXp allowed only in prep (no result)');
      return;
    }

    const cost = 4;
    const gain = 4;
    const coins = Number(ctx.state.kings?.player?.coins ?? 0);
    if (coins < cost) {
      ctx.sendError('NO_COINS', 'Not enough coins for XP');
      return;
    }

    ctx.state.kings.player.coins -= cost;
    applyKingXp(ctx.state.kings.player, gain);
    ctx.clampPlayerCoins();
    ctx.broadcastState();
  },
};
