import { addUnit, getUnitCellSpanX } from '../../../shared/battleCore.js';
import { canManageShopInPhase } from '../../../shared/gameRules.js';

export const shopActionHandlers = {
  shopRefresh(ctx) {
    if (!canManageShopInPhase(ctx.state.phase)) {
      ctx.sendError('BAD_PHASE', 'shopRefresh allowed only in prep/battle');
      return;
    }

    const refreshCost = 2;
    const coins = Number(ctx.state.kings?.player?.coins ?? 0);
    if (coins < refreshCost) {
      ctx.sendError('NO_COINS', 'Not enough coins to refresh shop');
      return;
    }

    ctx.state.kings.player.coins -= refreshCost;
    ctx.clampPlayerCoins();
    ctx.generateShopOffers();
    ctx.broadcastState();
  },

  shopToggleLock(ctx) {
    if (!canManageShopInPhase(ctx.state.phase)) {
      ctx.sendError('BAD_PHASE', 'shopToggleLock allowed only in prep/battle');
      return;
    }

    ctx.state.shop = ctx.state.shop ?? { offers: [], locked: false };
    ctx.state.shop.locked = !Boolean(ctx.state.shop.locked);
    ctx.broadcastState();
  },

  shopBuy(ctx) {
    if (!canManageShopInPhase(ctx.state.phase)) {
      ctx.sendError('BAD_PHASE', 'shopBuy allowed only in prep/battle');
      return;
    }

    const idx = Number(ctx.msg.offerIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= ctx.SHOP_OFFER_COUNT) {
      ctx.sendError('BAD_ARGS', `offerIndex must be 0..${ctx.SHOP_OFFER_COUNT - 1}`);
      return;
    }

    const offer = ctx.state.shop?.offers?.[idx];
    if (!offer) {
      ctx.sendError('NO_OFFER', 'Offer not found');
      return;
    }

    const coins = Number(ctx.state.kings?.player?.coins ?? 0);
    if (coins < offer.cost) {
      ctx.sendError('NO_COINS', 'Not enough coins');
      return;
    }

    const canPlaceOnBoardNow = (ctx.state.phase === 'prep') && !ctx.state.result;
    const playerBoardCap = ctx.getPlayerBoardUnitCap();
    const playerBoardCount = ctx.countPlayerBoardUnits();
    const canPlaceByCap = playerBoardCount < playerBoardCap;
    const freeBoardCell = (canPlaceOnBoardNow && canPlaceByCap) ? ctx.findFirstFreeBoardCell(offer) : null;
    const freeSlot = freeBoardCell ? null : ctx.findFirstFreeBenchSlot();
    if (!freeBoardCell && freeSlot == null) {
      ctx.sendError('NO_SPACE', 'No space');
      return;
    }

    ctx.state.kings.player.coins -= offer.cost;
    ctx.clampPlayerCoins();

    const newId = ctx.allocateUnitId();
    addUnit(ctx.state, {
      id: newId,
      q: freeBoardCell?.q ?? 0,
      r: freeBoardCell?.r ?? 0,
      hp: offer.hp,
      maxHp: offer.maxHp ?? offer.hp,
      atk: offer.atk,
      team: 'player',
      type: offer.type,
      powerType: offer.powerType,
      abilityType: offer.abilityType ?? 'none',
      abilityKey: offer.abilityKey ?? null,
      damageType: String(offer.damageType ?? 'physical'),
      abilityDamageType: offer.abilityDamageType ?? null,
      armor: Math.max(0, Number(offer.armor ?? 0)),
      magicResist: Math.max(0, Number(offer.magicResist ?? 0)),
      rank: 1,
      zone: freeBoardCell ? 'board' : 'bench',
      benchSlot: freeBoardCell ? null : freeSlot,
      attackSpeed: offer.attackSpeed ?? ctx.DEFAULT_UNIT_ATTACK_SPEED,
      moveSpeed: offer.moveSpeed ?? ctx.DEFAULT_UNIT_MOVE_SPEED,
      projectileSpeed: offer.projectileSpeed ?? ctx.DEFAULT_UNIT_PROJECTILE_SPEED,
      attackRangeMax: offer.attackRangeMax ?? 1,
      attackRangeFullDamage: offer.attackRangeFullDamage ?? (offer.attackRangeMax ?? 1),
      attackMode: String(offer.attackMode ?? ctx.DEFAULT_UNIT_ATTACK_MODE),
      accuracy: offer.accuracy ?? ctx.DEFAULT_UNIT_ACCURACY,
      abilityCooldown: offer.abilityCooldown ?? ctx.DEFAULT_UNIT_ABILITY_COOLDOWN,
      cellSpanX: getUnitCellSpanX(offer),
    });

    ctx.owned.add(newId);
    ctx.state.shop.offers[idx] = null;
    ctx.state.shop.locked = false;

    ctx.applyMergesForClient(ctx.clientId, newId);
    ctx.broadcastState();
  },
};
