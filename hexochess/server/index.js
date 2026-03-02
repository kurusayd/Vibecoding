// server/index.js
import http from 'http';
import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  createBattleState,
  addUnit,
  getUnitAt,
  moveUnit,
  hexDistance,
  applyKingXp,
  kingXpToNext,
} from '../shared/battleCore.js';

import {
  makeInitMessage,
  makeStateMessage,
  makeErrorMessage,
} from '../shared/messages.js';
import { UNIT_CATALOG } from '../shared/unitCatalog.js';
import { baseIncomeForRound, interestIncome, streakBonus, COINS_CAP } from '../shared/economy.js';
import { canManageShopInPhase, canMergeBoardUnitsInPhase, clampCoins } from '../shared/gameRules.js';
import { getBotProfileByIndex, getBotProfileById } from './botProfiles.js';

const DEFAULT_MATCH_ID = 'default';
const matchStore = new Map();

// ---- game state (authoritative) ----
const state = createBattleState();
let nextUnitId = 1;

state.battleSecondsLeft = state.battleSecondsLeft ?? 0;

let battleCountdownTimer = null;
const BATTLE_DURATION_SECONDS = 45; // Бой длится максимум 45с, затем ничья.

// ---- rounds / prep timer ----
state.round = state.round ?? 1;              // РёРіСЂР° СЃС‚Р°СЂС‚СѓРµС‚ СЃ 1 СЂР°СѓРЅРґР°
state.prepSecondsLeft = state.prepSecondsLeft ?? 0;

let prepTimer = null;

// ---- economy / rounds ----
state.winStreak = state.winStreak ?? 0;  // РїРѕРґСЂСЏРґ РїРѕР±РµРґ
state.loseStreak = state.loseStreak ?? 0; // РїРѕРґСЂСЏРґ РїРѕСЂР°Р¶

// СЃР»РµРїРѕРє СЂР°СЃСЃС‚Р°РЅРѕРІРєРё РЅР° РјРѕРјРµРЅС‚ СЃС‚Р°СЂС‚Р° Р±РѕСЏ (РґР»СЏ РІРѕР·РІСЂР°С‚Р° РІ prep)
let prepSnapshot = null; // Array of units

// ---- battle timers (GLOBAL, not per connection) ----
let finishTimeout = null;

// ---- solo lobby / pairings (MVP) ----
const LOBBY_SIZE = 8;
const SOLO_PLAYER_ID = 'player-1';
const SOLO_PLAYER_NAME = 'Player';
const BOT_COUNT = LOBBY_SIZE - 1;

const roomState = {
  participants: [],
  pairings: [],
  hiddenBattles: [],
  playerOpponentId: null,
  playerOpponentIsCopy: false,
  playerOpponentCopySourceId: null,
};

function ensureMatchRuntime(matchId = DEFAULT_MATCH_ID) {
  if (!matchStore.has(matchId)) {
    matchStore.set(matchId, {
      matchId,
      state,
      roomState,
      clients,
      clientToUnits,
    });
  }
  return matchStore.get(matchId);
}

function isAllPlayerOpponentsBots() {
  const others = (roomState.participants ?? []).filter((p) => p?.id !== SOLO_PLAYER_ID && p?.alive !== false);
  if (!others.length) return false;
  return others.every((p) => p?.kind === 'bot');
}

function makeSoloLobbyParticipants() {
  const list = [{ id: SOLO_PLAYER_ID, kind: 'human', name: SOLO_PLAYER_NAME, alive: true }];
  for (let i = 1; i <= BOT_COUNT; i++) {
    const profile = getBotProfileByIndex(i);
    const coinIncomeMultiplier = Number(profile?.difficulty?.coinIncomeMultiplier ?? 1);
    list.push({
      id: profile?.id ?? `bot-${i}`,
      kind: 'bot',
      name: profile?.name ?? `bot ${i}`,
      alive: true,
      kingVisualKey: profile?.kingVisualKey ?? 'king',
      coins: 100,
      hp: 100,
      maxHp: 100,
      level: 1,
      xp: 0,
      winStreak: 0,
      loseStreak: 0,
      difficulty: {
        coinIncomeMultiplier: Number.isFinite(coinIncomeMultiplier) ? Math.max(0, coinIncomeMultiplier) : 1,
      },
    });
  }
  return list;
}

function ensureSoloLobbyInitialized() {
  if (roomState.participants.length === LOBBY_SIZE) return;
  roomState.participants = makeSoloLobbyParticipants();
  roomState.pairings = [];
  roomState.hiddenBattles = [];
  roomState.playerOpponentId = null;
  roomState.playerOpponentIsCopy = false;
  roomState.playerOpponentCopySourceId = null;
}

function resetSoloLobbyState() {
  roomState.participants = makeSoloLobbyParticipants();
  roomState.pairings = [];
  roomState.hiddenBattles = [];
  roomState.playerOpponentId = null;
  roomState.playerOpponentIsCopy = false;
  roomState.playerOpponentCopySourceId = null;
}

function roundRobinPairingsEven(participants, round) {
  const active = (participants ?? []).filter(p => p?.alive !== false);
  if (active.length < 2 || active.length % 2 !== 0) return [];

  const rounds = Math.max(1, active.length - 1);
  const steps = ((Math.max(1, Number(round ?? 1)) - 1) % rounds + rounds) % rounds;

  let arr = active.slice();
  for (let i = 0; i < steps; i++) {
    arr = [arr[0], arr[arr.length - 1], ...arr.slice(1, -1)];
  }

  const pairings = [];
  for (let i = 0; i < arr.length / 2; i++) {
    pairings.push({
      aId: arr[i].id,
      bId: arr[arr.length - 1 - i].id,
      aIsCopy: false,
      bIsCopy: false,
      aCopySourceId: null,
      bCopySourceId: null,
    });
  }
  return pairings;
}

function buildRoundPairingsWithCopyFallback(participants, round) {
  const active = (participants ?? []).filter((p) => p?.alive !== false);
  if (active.length < 2) return [];

  if (active.length % 2 === 0) {
    return roundRobinPairingsEven(active, round);
  }

  const byeIdx = ((Math.max(1, Number(round ?? 1)) - 1) % active.length + active.length) % active.length;
  const unmatched = active[byeIdx];
  const others = active.filter((p) => p.id !== unmatched.id);
  if (others.length < 1) return [];

  const copySource = others[Math.floor(Math.random() * others.length)];
  const realPairings = roundRobinPairingsEven(others, round);
  return [
    ...realPairings,
    {
      aId: unmatched.id,
      bId: copySource.id,
      aIsCopy: false,
      bIsCopy: true,
      aCopySourceId: null,
      bCopySourceId: copySource.id,
    },
  ];
}

function makeBotDebugSnapshot() {
  return (roomState.participants ?? [])
    .filter((p) => p?.kind === 'bot')
    .map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive !== false,
      coins: Number(p.coins ?? 0),
      hp: Number(p.hp ?? 100),
      maxHp: Number(p.maxHp ?? 100),
      level: Number(p.level ?? 1),
      xp: Number(p.xp ?? 0),
      winStreak: Number(p.winStreak ?? 0),
      loseStreak: Number(p.loseStreak ?? 0),
      kingVisualKey: p.kingVisualKey ?? 'king',
      coinIncomeMultiplier: Number(p?.difficulty?.coinIncomeMultiplier ?? 1),
      isCurrentOpponent: p.id === roomState.playerOpponentId,
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function syncMatchmakingSnapshot() {
  state.matchmaking = {
    round: Number(state.round ?? 1),
    phase: state.phase ?? 'prep',
    allOpponentsBots: isAllPlayerOpponentsBots(),
    playerOpponentId: roomState.playerOpponentId,
    playerOpponentIsCopy: roomState.playerOpponentIsCopy === true,
    playerOpponentCopySourceId: roomState.playerOpponentCopySourceId ?? null,
    pairings: roomState.pairings.map(p => ({ ...p })),
    hiddenBattles: roomState.hiddenBattles.map(h => ({ ...h })),
    bots: makeBotDebugSnapshot(),
  };
}

function syncRoundPairingsForCurrentRound() {
  ensureSoloLobbyInitialized();

  const pairings = buildRoundPairingsWithCopyFallback(roomState.participants, state.round ?? 1);
  roomState.pairings = pairings.map((p) => ({ ...p }));

  const playerPair = pairings.find((p) => p.aId === SOLO_PLAYER_ID || p.bId === SOLO_PLAYER_ID) ?? null;
  roomState.playerOpponentId = null;
  roomState.playerOpponentIsCopy = false;
  roomState.playerOpponentCopySourceId = null;
  if (playerPair) {
    if (playerPair.aId === SOLO_PLAYER_ID) {
      roomState.playerOpponentId = playerPair.bId;
      roomState.playerOpponentIsCopy = playerPair.bIsCopy === true;
      roomState.playerOpponentCopySourceId = playerPair.bCopySourceId ?? null;
    } else {
      roomState.playerOpponentId = playerPair.aId;
      roomState.playerOpponentIsCopy = playerPair.aIsCopy === true;
      roomState.playerOpponentCopySourceId = playerPair.aCopySourceId ?? null;
    }
  }

  roomState.hiddenBattles = pairings
    .filter((p) => p.aId !== SOLO_PLAYER_ID && p.bId !== SOLO_PLAYER_ID)
    .map((p) => ({
      aId: p.aId,
      bId: p.bId,
      aIsCopy: p.aIsCopy === true,
      bIsCopy: p.bIsCopy === true,
      aCopySourceId: p.aCopySourceId ?? null,
      bCopySourceId: p.bCopySourceId ?? null,
      phase: 'prep',
      result: null, // 'a' | 'b' | 'draw'
    }));

  const enemyProfile = getCurrentOpponentBotProfile();
  if (state.kings?.enemy) {
    state.kings.enemy.name = getCurrentOpponentBotName();
    state.kings.enemy.visualKey = enemyProfile?.kingVisualKey ?? 'king';
    state.kings.enemy.hp = Number(enemyProfile?.hp ?? 100);
    state.kings.enemy.maxHp = Number(enemyProfile?.maxHp ?? 100);
    state.kings.enemy.coins = Number(enemyProfile?.coins ?? 0);
    state.kings.enemy.level = Number(enemyProfile?.level ?? 1);
    state.kings.enemy.xp = Number(enemyProfile?.xp ?? 0);
    state.kings.enemy.coinIncomeMultiplier = Number(enemyProfile?.difficulty?.coinIncomeMultiplier ?? 1);
  }

  // Debug-friendly snapshot for client/UI.
  syncMatchmakingSnapshot();
}

function getParticipantById(id) {
  return roomState.participants.find(p => p.id === id) ?? null;
}

function getCurrentOpponentBotProfile() {
  const fromParticipant = getParticipantById(roomState.playerOpponentId);
  if (fromParticipant?.id) {
    return {
      id: fromParticipant.id,
      name: fromParticipant.name,
      kingVisualKey: fromParticipant.kingVisualKey,
      hp: Number(fromParticipant.hp ?? 100),
      maxHp: Number(fromParticipant.maxHp ?? 100),
      coins: Number(fromParticipant.coins ?? 0),
      level: Number(fromParticipant.level ?? 1),
      xp: Number(fromParticipant.xp ?? 0),
      difficulty: {
        coinIncomeMultiplier: Number(fromParticipant?.difficulty?.coinIncomeMultiplier ?? 1),
      },
    };
  }
  return getBotProfileById(roomState.playerOpponentId);
}

function getCurrentOpponentBotName() {
  const base = getCurrentOpponentBotProfile()?.name ?? 'Enemy King';
  return roomState.playerOpponentIsCopy ? `${base} (copy)` : base;
}

function markHiddenBattlesPhase(phase) {
  roomState.hiddenBattles = roomState.hiddenBattles.map(h => ({ ...h, phase }));
  syncMatchmakingSnapshot();
}

function resolveHiddenBattlesNoConsequences() {
  roomState.hiddenBattles = roomState.hiddenBattles.map((h) => {
    const replay = simulateHiddenBotBattleReplay(h?.aId, h?.bId);
    let result = 'draw';
    if (replay?.result === 'victory') result = 'a';
    else if (replay?.result === 'defeat') result = 'b';

    const aDamage = Number(replay?.winnerDamageByResult?.victory ?? 0);
    const bDamage = Number(replay?.winnerDamageByResult?.defeat ?? 0);
    if (result === 'a' && h?.bIsCopy !== true) {
      applyDamageToParticipantKing(h?.bId, aDamage);
    } else if (result === 'b' && h?.aIsCopy !== true) {
      applyDamageToParticipantKing(h?.aId, bDamage);
    }

    return { ...h, phase: 'result', result };
  });
  syncMatchmakingSnapshot();
}

function applyDamageToParticipantKing(participantId, rawDamage) {
  const target = getParticipantById(participantId);
  if (!target) return;
  const damage = Math.max(0, Math.floor(Number(rawDamage ?? 0)));
  if (damage <= 0) return;

  target.hp = Math.max(0, Number(target.hp ?? 0) - damage);
  target.alive = Number(target.hp ?? 0) > 0;
}

function syncPlayerParticipantHpFromKing() {
  const playerP = getParticipantById(SOLO_PLAYER_ID);
  if (!playerP) return;
  playerP.hp = Number(state?.kings?.player?.hp ?? playerP.hp ?? 0);
  playerP.maxHp = Number(state?.kings?.player?.maxHp ?? playerP.maxHp ?? 100);
  playerP.alive = Number(playerP.hp ?? 0) > 0;
}

function clampCoinsKing(king) {
  king.coins = clampCoins(king.coins, COINS_CAP);
}

function clampPlayerCoins() {
  if (!state?.kings?.player) return;
  state.kings.player.coins = clampCoins(state.kings.player.coins, COINS_CAP);
}

function clampCoinsValue(coins) {
  return clampCoins(coins, COINS_CAP);
}

function grantRoundGold(result) {
  // result: 'victory' | 'defeat' | 'draw'
  const king = state.kings.player;

  const round = Number(state.round ?? 1);
  const base = baseIncomeForRound(round);

  const didWin = (result === 'victory');
  const didLose = (result === 'defeat');

  // РїРѕР±РµРґР° РґР°С‘С‚ +1 (РєР°Рє РІ DAC). РќРёС‡СЊСЏ = 0.
  const winBonus = didWin ? 1 : 0;

  // СЃС‚СЂРёРєРё
  if (didWin) {
    state.winStreak = (state.winStreak ?? 0) + 1;
    state.loseStreak = 0;
  } else if (didLose) {
    state.loseStreak = (state.loseStreak ?? 0) + 1;
    state.winStreak = 0;
  } else {
    // draw: РѕР±С‹С‡РЅРѕ СЃР±СЂР°СЃС‹РІР°СЋС‚ СЃС‚СЂРёРєРё
    state.winStreak = 0;
    state.loseStreak = 0;
  }

  const streak = didWin
    ? streakBonus(state.winStreak)
    : didLose
      ? streakBonus(state.loseStreak)
      : 0;

  const interest = interestIncome(king.coins);

  king.coins += (base + winBonus + streak + interest);
  clampPlayerCoins();
}

function grantRoundGoldToBotParticipant(bot, result) {
  if (!bot || bot.kind !== 'bot') return;

  bot.coins = clampCoinsValue(bot.coins);
  bot.winStreak = Number(bot.winStreak ?? 0);
  bot.loseStreak = Number(bot.loseStreak ?? 0);

  const round = Number(state.round ?? 1);
  const base = baseIncomeForRound(round);
  const didWin = (result === 'victory');
  const didLose = (result === 'defeat');
  const winBonus = didWin ? 1 : 0;

  if (didWin) {
    bot.winStreak += 1;
    bot.loseStreak = 0;
  } else if (didLose) {
    bot.loseStreak += 1;
    bot.winStreak = 0;
  } else {
    bot.winStreak = 0;
    bot.loseStreak = 0;
  }

  const streak = didWin
    ? streakBonus(bot.winStreak)
    : didLose
      ? streakBonus(bot.loseStreak)
      : 0;

  const interest = interestIncome(bot.coins);
  const baseIncome = base + winBonus + streak + interest;
  const multRaw = Number(bot?.difficulty?.coinIncomeMultiplier ?? 1);
  const incomeMultiplier = Number.isFinite(multRaw) ? Math.max(0, multRaw) : 1;
  const finalIncome = Math.ceil(baseIncome * incomeMultiplier);

  bot.coins = clampCoinsValue(bot.coins + finalIncome);
}

function grantRoundGoldToAllBots(playerResult) {
  if (!Array.isArray(roomState.participants) || roomState.participants.length === 0) return;

  const botResults = new Map(); // botId -> 'victory' | 'defeat' | 'draw'

  const playerOpponentId = roomState.playerOpponentId;
  if (playerOpponentId && roomState.playerOpponentIsCopy !== true) {
    let botResult = 'draw';
    if (playerResult === 'victory') botResult = 'defeat';
    else if (playerResult === 'defeat') botResult = 'victory';
    botResults.set(playerOpponentId, botResult);
  }

  for (const hb of (roomState.hiddenBattles ?? [])) {
    const aId = hb?.aId;
    const bId = hb?.bId;
    if (!aId || !bId) continue;

    if (hb.result === 'a') {
      botResults.set(aId, 'victory');
      if (hb?.bIsCopy !== true) botResults.set(bId, 'defeat');
    } else if (hb.result === 'b') {
      if (hb?.aIsCopy !== true) botResults.set(aId, 'defeat');
      botResults.set(bId, 'victory');
    } else {
      botResults.set(aId, 'draw');
      botResults.set(bId, 'draw');
    }
  }

  for (const p of roomState.participants) {
    if (!p || p.kind !== 'bot') continue;
    const result = botResults.get(p.id) ?? 'draw';
    grantRoundGoldToBotParticipant(p, result);
  }
}

function grantRoundXpToAllBots(deltaXp = 1) {
  const xpDelta = Number(deltaXp ?? 0);
  if (!Number.isFinite(xpDelta) || xpDelta === 0) return;

  for (const p of (roomState.participants ?? [])) {
    if (!p || p.kind !== 'bot') continue;
    applyKingXp(p, xpDelta);
  }
}

function stopBattleTimers() {
  if (finishTimeout) {
    clearTimeout(finishTimeout);
    finishTimeout = null;
  }
  if (battleCountdownTimer) {
    clearInterval(battleCountdownTimer);
    battleCountdownTimer = null;
  }
  state.battleSecondsLeft = 0;
}

function stopPrepTimer() {
  if (prepTimer) {
    clearInterval(prepTimer);
    prepTimer = null;
  }
}

function resetGameToStart() {
  stopBattleTimers();
  stopPrepTimer();

  prepSnapshot = null;
  nextUnitId = 1;

  state.phase = 'prep';
  state.result = null;
  state.gameStarted = false;
  state.battleReplay = null;
  state.units = [];

  state.round = 1;
  state.prepSecondsLeft = 0;
  state.battleSecondsLeft = 0;
  state.winStreak = 0;
  state.loseStreak = 0;

  state.kings = {
    player: { hp: 100, maxHp: 100, coins: 100, level: 1, xp: 0 },
    enemy:  {
      hp: 100, maxHp: 100, coins: 0, visible: false, level: 1, xp: 0,
      name: 'bot 1',
      visualKey: 'bot_bishop',
      coinIncomeMultiplier: 1,
    },
  };

  state.shop = { offers: [] };
  resetSoloLobbyState();
  syncRoundPairingsForCurrentRound();

  for (const owned of clientToUnits.values()) {
    owned.clear();
  }

  broadcast(makeStateMessage(state));
}

function prepDurationForRound(round) {
  return 40;
}

function startPrepCountdown() {
  stopPrepTimer();

  // РµСЃР»Рё СѓР¶Рµ battle вЂ” РЅРµ СЃС‚Р°СЂС‚СѓРµРј
  if (state.phase !== 'prep') return;

  if (isAllPlayerOpponentsBots()) {
    state.prepSecondsLeft = 0;
    broadcast(makeStateMessage(state));
    return;
  }

  const duration = prepDurationForRound(Number(state.round ?? 1));
  state.prepSecondsLeft = duration;
  broadcast(makeStateMessage(state));

  prepTimer = setInterval(() => {
    if (state.phase !== 'prep') {
      stopPrepTimer();
      return;
    }

    state.prepSecondsLeft = Math.max(0, Number(state.prepSecondsLeft ?? 0) - 1);
    broadcast(makeStateMessage(state));

    if (state.prepSecondsLeft <= 0) {
      stopPrepTimer();
      startBattle(); // Р°РІС‚Рѕ-СЃС‚Р°СЂС‚ Р±РѕСЏ
    }
  }, 1000);
}


// РєС‚Рѕ РєР°РєРёРј СЋРЅРёС‚РѕРј СѓРїСЂР°РІР»СЏРµС‚
/** @type {Map<string, Set<number>>} */
const clientToUnits = new Map(); // clientId -> Set(unitIds)

// РґРµСЂР¶РёРј СЃРїРёСЃРѕРє СЃРѕРєРµС‚РѕРІ
/** @type {Map<string, import('ws').WebSocket>} */
const clients = new Map();

// ---- board limits (РґРѕР»Р¶РЅС‹ СЃРѕРІРїР°РґР°С‚СЊ СЃ РєР»РёРµРЅС‚РѕРј) ----
const GRID_COLS = 12;
const GRID_ROWS = 8;
const BENCH_SLOTS = 8;

// ---- MERGE (server-authoritative) ----
const MAX_RANK = 3;

// key РґР»СЏ РіСЂСѓРїРїРёСЂРѕРІРєРё "РѕРґРёРЅР°РєРѕРІС‹С…"
function mergeKey(u) {
  return `${u.type ?? 'Unknown'}#${u.rank ?? 1}`;
}

// РЈРґР°Р»СЏРµС‚ СЋРЅРёС‚Р° РёР· state + РёР· owned set
function removeOwnedUnit(state, owned, unitId) {
  state.units = state.units.filter(u => u.id !== unitId);
  owned.delete(unitId);
}

// РџС‹С‚Р°РµРјСЃСЏ СЃРјС‘СЂРґР¶РёС‚СЊ Р’РЎР• РІРѕР·РјРѕР¶РЅС‹Рµ С‚СЂРѕР№РєРё РґР»СЏ owned.
// preferredUnitId вЂ” РєРѕРіРѕ Р°РїР°С‚СЊ, РµСЃР»Рё РѕРЅ РІС…РѕРґРёС‚ РІ С‚СЂРѕР№РєСѓ (СѓРґРѕР±РЅРѕ: РєСѓРїР»РµРЅРЅС‹Р№/РїРµСЂРµС‚Р°С‰РµРЅРЅС‹Р№ СЋРЅРёС‚)
function applyMergesForClient(clientId, preferredUnitId = null) {
  const owned = clientToUnits.get(clientId);
  if (!owned || owned.size === 0) return false;

  // Р’ prep РјРѕР¶РЅРѕ РјРµСЂРґР¶РёС‚СЊ РІСЃРµ РјРѕРё СЋРЅРёС‚С‹ (board + bench).
  // Р’РЅРµ prep (РёРґС‘С‚ Р±РѕР№ / СЌРєСЂР°РЅ СЂРµР·СѓР»СЊС‚Р°С‚Р°) РЅРµР»СЊР·СЏ "С‚СЂРѕРіР°С‚СЊ" СЋРЅРёС‚РѕРІ РЅР° РґРѕСЃРєРµ,
  // РёРЅР°С‡Рµ merge РєРѕРЅС„Р»РёРєС‚СѓРµС‚ СЃ РІРѕР·РІСЂР°С‚РѕРј Рє prepSnapshot РїРѕСЃР»Рµ Р±РѕСЏ.
  const allowBoardUnitsInMerge = canMergeBoardUnitsInPhase(state.phase);

  // СЃРѕР±РёСЂР°РµРј С‚РѕР»СЊРєРѕ РјРѕРёС… player-СЋРЅРёС‚РѕРІ (Р±РѕС‚РѕРІ РЅРµ С‚СЂРѕРіР°РµРј)
  const myUnits = state.units.filter(u =>
    u.team === 'player' &&
    owned.has(u.id) &&
    (allowBoardUnitsInMerge || u.zone === 'bench')
  );

  let changed = false;

  // loop РґРѕ С‚РµС… РїРѕСЂ, РїРѕРєР° РЅР°С…РѕРґСЏС‚СЃСЏ РЅРѕРІС‹Рµ РјРµСЂРґР¶Рё (РїРѕС‚РѕРјСѓ С‡С‚Рѕ 3x rank1 в†’ rank2,
  // РїРѕС‚РѕРј РјРѕР¶РµС‚ СЃР»РѕР¶РёС‚СЊСЃСЏ 3x rank2 в†’ rank3)
  while (true) {
    // РіСЂСѓРїРїРёСЂСѓРµРј РїРѕ type+rank
    const groups = new Map(); // key -> array of units
    for (const u of myUnits) {
      const rank = u.rank ?? 1;
      if (rank >= MAX_RANK) continue; // rank3 СѓР¶Рµ РЅРµ РјРµСЂРґР¶РёРј
      const k = mergeKey(u);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(u);
    }

    // РЅР°Р№РґС‘Рј Р»СЋР±СѓСЋ РіСЂСѓРїРїСѓ СЃ >=3
    let foundKey = null;
    for (const [k, arr] of groups.entries()) {
      if (arr.length >= 3) {
        foundKey = k;
        break;
      }
    }
    if (!foundKey) break;

    const arr = groups.get(foundKey);

    // РІС‹Р±РёСЂР°РµРј Р±Р°Р·РѕРІРѕРіРѕ СЋРЅРёС‚Р° РґР»СЏ Р°РїР°:
    // 1) РїСЂРёРѕСЂРёС‚РµС‚ Сѓ СЋРЅРёС‚Р° РЅР° РїРѕР»Рµ (zone=board), С‡С‚РѕР±С‹ Р°Рї РЅРµ "СѓР»РµС‚Р°Р»" РЅР° СЃРєР°РјРµР№РєСѓ;
    // 2) РµСЃР»Рё СЋРЅРёС‚ СЃ preferredUnitId РЅР°С…РѕРґРёС‚СЃСЏ РЅР° РїРѕР»Рµ Рё РІС…РѕРґРёС‚ РІ РіСЂСѓРїРїСѓ вЂ” РјРѕР¶РЅРѕ Р°РїРЅСѓС‚СЊ РµРіРѕ;
    // 3) РµСЃР»Рё РЅР° РїРѕР»Рµ РЅРёРєРѕРіРѕ РЅРµС‚ вЂ” РёСЃРїРѕР»СЊР·СѓРµРј preferredUnitId (РµСЃР»Рё РµСЃС‚СЊ) РёР»Рё Р»СЋР±РѕРіРѕ.
    let base = null;

    const boardCandidates = arr.filter(u => u.zone === 'board');

    if (boardCandidates.length > 0) {
      if (preferredUnitId != null) {
        base = boardCandidates.find(u => u.id === Number(preferredUnitId)) ?? null;
      }
      if (!base) base = boardCandidates[0];
    } else {
      if (preferredUnitId != null) {
        base = arr.find(u => u.id === Number(preferredUnitId)) ?? null;
      }
      if (!base) base = arr[0];
    }

    // Р±РµСЂС‘Рј РµС‰С‘ 2 Р»СЋР±С‹С…, РєСЂРѕРјРµ base
    const others = arr.filter(u => u.id !== base.id).slice(0, 2);
    if (others.length < 2) break; // РЅР° РІСЃСЏРєРёР№ РїРѕР¶Р°СЂРЅС‹Р№

    // вњ… Р°РїР°РµРј base: rank + СЃС‚Р°С‚С‹ (x2 Р·Р° РєР°Р¶РґС‹Р№ РїРµСЂРµС…РѕРґ СЂР°РЅРіР°)
    const oldRank = base.rank ?? 1;
    const newRank = Math.min(MAX_RANK, oldRank + 1);
    base.rank = newRank;

    // РјРЅРѕР¶РёС‚РµР»Рё: x2 РЅР° РєР°Р¶РґС‹Р№ Р°Рї СЂР°РЅРіР° (1->2 Рё 2->3)
    const mult = 2;

    // maxHp
    const oldMaxHp = Number(base.maxHp ?? base.hp ?? 1);
    const newMaxHp = Math.max(1, Math.round(oldMaxHp * mult));
    base.maxHp = newMaxHp;

    // atk
    const oldAtk = Number(base.atk ?? 1);
    const newAtk = Math.max(1, Math.round(oldAtk * mult));
    base.atk = newAtk;

    // hp РІСЃРµРіРґР° РїРѕР»РЅРѕРµ РїРѕСЃР»Рµ РјРµСЂРґР¶Р°
    base.hp = base.maxHp;

    // СѓРґР°Р»СЏРµРј РґРІСѓС… РѕСЃС‚Р°Р»СЊРЅС‹С…
    for (const o of others) {
      removeOwnedUnit(state, owned, o.id);
    }

    // РѕР±РЅРѕРІР»СЏРµРј myUnits (С‚.Рє. РјС‹ СѓРґР°Р»РёР»Рё СЋРЅРёС‚РѕРІ)
    // Рё РѕСЃС‚Р°РІР»СЏРµРј base РІ РјР°СЃСЃРёРІРµ (РѕРЅ СѓР¶Рµ С‚Р°Рј, РїСЂРѕСЃС‚Рѕ rank РїРѕРјРµРЅСЏР»СЃСЏ)
    for (const o of others) {
      const idx = myUnits.findIndex(x => x.id === o.id);
      if (idx !== -1) myUnits.splice(idx, 1);
    }

    changed = true;

    // РїРѕСЃР»Рµ РїРµСЂРІРѕРіРѕ РјРµСЂРґР¶Р° preferredUnitId Р»СѓС‡С€Рµ РїСЂРёРІСЏР·Р°С‚СЊ Рє base,
    // С‡С‚РѕР±С‹ РІРѕР·РјРѕР¶РЅС‹Р№ СЃР»РµРґСѓСЋС‰РёР№ РјРµСЂРґР¶ Р°РїР°Р» СЃРІРµР¶РёР№ Р°РїРЅСѓС‚С‹Р№ СЋРЅРёС‚
    preferredUnitId = base.id;
  }

  return changed;
}

// вњ… helper: СЃР»СѓС‡Р°Р№РЅРѕРµ С†РµР»РѕРµ [0..n-1]
function randInt(n) {
  return Math.floor(Math.random() * n);
}

// ---- SHOP + UNIT CATALOG (MVP) ----
// С†РµРЅР° СЃС‚СЂРѕРіРѕ РїРѕ "СЃРёР»Рµ" (С€Р°С…РјР°С‚РЅРѕРјСѓ С‚РёРїСѓ)
const COST_BY_POWER_TYPE = {
  '\u041f\u0435\u0448\u043a\u0430': 1, // Пешка
  '\u041a\u043e\u043d\u044c': 2, // Конь
  '\u0421\u043b\u043e\u043d': 3, // Слон
  '\u041b\u0430\u0434\u044c\u044f': 4, // Ладья
  '\u0424\u0435\u0440\u0437\u044c': 5, // Ферзь
};

const SHOP_OFFER_COUNT = 5;
const DEFAULT_UNIT_ATTACK_SPEED = 1;
const DEFAULT_UNIT_MOVE_SPEED = 1;
const DEFAULT_UNIT_PROJECTILE_SPEED = 0;
const DEFAULT_UNIT_ACCURACY = 0.8;
const MAX_ACTIONS_PER_UNIT_PER_TICK = 8;
const SNAPSHOT_STEP_MS = 100;

function makeRandomOffer() {
  const base = UNIT_CATALOG.length
    ? UNIT_CATALOG[randInt(UNIT_CATALOG.length)]
    : {
      type: 'Swordsman',
      powerType: '\u041f\u0435\u0448\u043a\u0430', // Пешка
      hp: 60,
      atk: 20,
      attackSpeed: DEFAULT_UNIT_ATTACK_SPEED,
      moveSpeed: DEFAULT_UNIT_MOVE_SPEED,
      projectileSpeed: DEFAULT_UNIT_PROJECTILE_SPEED,
      attackRangeMax: 1,
      attackRangeFullDamage: 1,
      accuracy: DEFAULT_UNIT_ACCURACY,
    };

  const cost = COST_BY_POWER_TYPE[base.powerType] ?? 1;

  return {
    race: base.race ?? null,
    type: base.type,
    powerType: base.powerType,
    cost,
    hp: base.hp,
    maxHp: base.hp,
    atk: base.atk,
    attackSpeed: base.attackSpeed ?? DEFAULT_UNIT_ATTACK_SPEED,
    moveSpeed: base.moveSpeed ?? DEFAULT_UNIT_MOVE_SPEED,
    projectileSpeed: base.projectileSpeed ?? DEFAULT_UNIT_PROJECTILE_SPEED,
    attackRangeMax: base.attackRangeMax ?? 1,
    attackRangeFullDamage: base.attackRangeFullDamage ?? (base.attackRangeMax ?? 1),
    accuracy: base.accuracy ?? DEFAULT_UNIT_ACCURACY,
    abilityType: base.abilityType ?? 'none',
    abilityKey: base.abilityKey ?? null,
  };
}

function makeOfferFromCatalogUnit(base) {
  const src = base ?? {
    type: 'Swordsman',
    powerType: 'Пешка',
    hp: 60,
    atk: 20,
    attackSpeed: DEFAULT_UNIT_ATTACK_SPEED,
    moveSpeed: DEFAULT_UNIT_MOVE_SPEED,
    projectileSpeed: DEFAULT_UNIT_PROJECTILE_SPEED,
    attackRangeMax: 1,
    attackRangeFullDamage: 1,
    accuracy: DEFAULT_UNIT_ACCURACY,
  };
  const cost = COST_BY_POWER_TYPE[src.powerType] ?? 1;
  return {
    race: src.race ?? null,
    type: src.type,
    powerType: src.powerType,
    cost,
    hp: src.hp,
    maxHp: src.hp,
    atk: src.atk,
    attackSpeed: src.attackSpeed ?? DEFAULT_UNIT_ATTACK_SPEED,
    moveSpeed: src.moveSpeed ?? DEFAULT_UNIT_MOVE_SPEED,
    projectileSpeed: src.projectileSpeed ?? DEFAULT_UNIT_PROJECTILE_SPEED,
    attackRangeMax: src.attackRangeMax ?? 1,
    attackRangeFullDamage: src.attackRangeFullDamage ?? (src.attackRangeMax ?? 1),
    accuracy: src.accuracy ?? DEFAULT_UNIT_ACCURACY,
    abilityType: src.abilityType ?? 'none',
    abilityKey: src.abilityKey ?? null,
  };
}

function generateShopOffers() {
  state.shop = state.shop ?? { offers: [] };
  state.shop.offers = [];
  for (let i = 0; i < SHOP_OFFER_COUNT; i++) state.shop.offers.push(makeRandomOffer());
}

function findFirstFreeBenchSlot() {
  for (let slot = 0; slot < BENCH_SLOTS; slot++) {
    if (!getUnitInBenchSlot(slot)) return slot;
  }
  return null;
}

function findFirstFreeBoardCell() {
  for (let r = 0; r < GRID_ROWS; r++) {
    // Р’ prep РёРіСЂРѕРєСѓ СЂР°Р·СЂРµС€РµРЅР° С‚РѕР»СЊРєРѕ "СЃРІРѕСЏ" РїРѕР»РѕРІРёРЅР° РїРѕР»СЏ (РєР°Рє РЅР° РєР»РёРµРЅС‚Рµ: РїРµСЂРІС‹Рµ 6 РєРѕР»РѕРЅРѕРє).
    const maxPlayerPrepCols = Math.min(GRID_COLS, 6);
    for (let col = 0; col < maxPlayerPrepCols; col++) {
      const q = col - Math.floor(r / 2);
      if (!isInsideBoard(q, r)) continue;
      if (getUnitAt(state, q, r)) continue;
      return { q, r };
    }
  }
  return null;
}

// ---- BOT ARMY (MVP) ----
function colRowToAxial(col, r) {
  return { q: col - Math.floor(r / 2), r };
}

function rankMultiplier(rank) {
  const safeRank = Math.max(1, Math.min(3, Number(rank ?? 1)));
  return 2 ** (safeRank - 1);
}

function clearEnemyUnits() {
  state.units = state.units.filter(u => u.team !== 'enemy');
}

function spawnBotArmy() {
  clearEnemyUnits();

  // С„РёРєСЃ-Р°СЂРјРёСЏ Р±РѕС‚Р° (РїРѕРєР° С…Р°СЂРґРєРѕРґ)
  const enemyProfile = getCurrentOpponentBotProfile();
  const fallbackProfile = getBotProfileByIndex(1);
  const preset = enemyProfile?.armyPreset ?? fallbackProfile?.armyPreset ?? [];
  const botUnits = preset.map((u) => {
    const { q, r } = colRowToAxial(u.col, u.row);
    return { q, r, type: u.type, rank: Math.max(1, Number(u.rank ?? 1)) };
  });

  for (const b of botUnits) {
    // safety: РµСЃР»Рё РєР»РµС‚РєР° Р·Р°РЅСЏС‚Р° РёР»Рё РІРЅРµ РїРѕР»СЏ вЂ” РїСЂРѕСЃС‚Рѕ РїСЂРѕРїСѓСЃРєР°РµРј
    if (!isInsideBoard(b.q, b.r)) continue;
    if (getUnitAt(state, b.q, b.r)) continue;

    const base = UNIT_CATALOG.find(x => x.type === b.type) ?? UNIT_CATALOG[0];
    const rank = Math.max(1, Math.min(3, Number(b.rank ?? 1)));
    const mult = rankMultiplier(rank);
    const hp = Math.max(1, Math.round(Number(base.hp ?? 1) * mult));
    const atk = Math.max(1, Math.round(Number(base.atk ?? 1) * mult));
    addUnit(state, {
      id: nextUnitId++,
      q: b.q,
      r: b.r,
      hp,
      maxHp: hp,
      atk,
      team: 'enemy',
      type: base.type,
      powerType: base.powerType,
      abilityType: base.abilityType ?? 'none',
      abilityKey: base.abilityKey ?? null,
      rank,
      zone: 'board',
      benchSlot: null,
      attackSpeed: base.attackSpeed ?? DEFAULT_UNIT_ATTACK_SPEED,
      moveSpeed: base.moveSpeed ?? DEFAULT_UNIT_MOVE_SPEED,
      projectileSpeed: base.projectileSpeed ?? DEFAULT_UNIT_PROJECTILE_SPEED,
      attackRangeMax: base.attackRangeMax ?? 1,
      attackRangeFullDamage: base.attackRangeFullDamage ?? (base.attackRangeMax ?? 1),
      accuracy: base.accuracy ?? DEFAULT_UNIT_ACCURACY,
    });
  }
}

function getBotArmyPresetById(botId) {
  const profile = getBotProfileById(botId) ?? getBotProfileByIndex(1);
  return profile?.armyPreset ?? [];
}

function buildBotBoardUnitsForSim(botId, team, nextIdRef) {
  const preset = getBotArmyPresetById(botId);
  const out = [];

  for (const u of preset) {
    const { q, r } = colRowToAxial(u.col, u.row);
    if (!isInsideBoard(q, r)) continue;

    const base = UNIT_CATALOG.find((x) => x.type === u.type) ?? UNIT_CATALOG[0];
    if (!base) continue;

    const rank = Math.max(1, Math.min(3, Number(u.rank ?? 1)));
    const mult = rankMultiplier(rank);
    const hp = Math.max(1, Math.round(Number(base.hp ?? 1) * mult));
    const atk = Math.max(1, Math.round(Number(base.atk ?? 1) * mult));

    out.push({
      id: nextIdRef.value++,
      q,
      r,
      hp,
      maxHp: hp,
      atk,
      team,
      type: base.type,
      powerType: base.powerType,
      abilityType: base.abilityType ?? 'none',
      abilityKey: base.abilityKey ?? null,
      rank,
      zone: 'board',
      benchSlot: null,
      attackSpeed: base.attackSpeed ?? DEFAULT_UNIT_ATTACK_SPEED,
      moveSpeed: base.moveSpeed ?? DEFAULT_UNIT_MOVE_SPEED,
      projectileSpeed: base.projectileSpeed ?? DEFAULT_UNIT_PROJECTILE_SPEED,
      attackRangeMax: base.attackRangeMax ?? 1,
      attackRangeFullDamage: base.attackRangeFullDamage ?? (base.attackRangeMax ?? 1),
      accuracy: base.accuracy ?? DEFAULT_UNIT_ACCURACY,
      dead: false,
      nextAttackAt: 0,
      nextMoveAt: 0,
      nextActionAt: 0,
      attackSeq: 0,
    });
  }

  return out;
}

function simulateHiddenBotBattleReplay(botAId, botBId) {
  const nextIdRef = { value: 1 };
  const playerSideUnits = buildBotBoardUnitsForSim(botAId, 'player', nextIdRef);
  const enemySideUnits = buildBotBoardUnitsForSim(botBId, 'enemy', nextIdRef);
  const units = [...playerSideUnits, ...enemySideUnits];

  const simState = createBattleState();
  simState.phase = 'battle';
  simState.result = null;
  simState.units = units;
  simState.kings.enemy.visible = true;

  return simulateBattleReplayFromState(simState, {
    tickMs: SNAPSHOT_STEP_MS,
    maxBattleMs: BATTLE_DURATION_SECONDS * 1000,
    collectTimeline: false,
    collectSnapshots: false,
  });
}

function sumPresetRanks(botId) {
  return getBotArmyPresetById(botId)
    .reduce((sum, u) => sum + Math.max(1, Number(u?.rank ?? 1)), 0);
}


// axial (q,r) -> "col" РєР°Рє РЅР° РєР»РёРµРЅС‚Рµ: col = q + floor(r/2)
function isInsideBoard(q, r) {
  if (r < 0 || r >= GRID_ROWS) return false;
  const col = q + Math.floor(r / 2);
  return col >= 0 && col < GRID_COLS;
}

const NEIGHBORS = [
  { dq: 1, dr: 0 },
  { dq: 1, dr: -1 },
  { dq: 0, dr: -1 },
  { dq: -1, dr: 0 },
  { dq: -1, dr: 1 },
  { dq: 0, dr: 1 },
];

function findUnitById(id) {
  return state.units.find(u => u.id === id) ?? null;
}

function getUnitInBenchSlot(slot) {
  return state.units.find(u => u.zone === 'bench' && u.benchSlot === slot) ?? null;
}

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of clients.values()) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function spawnPlayerUnitFor(clientId) {
  // СЃС‚Р°СЂС‚ РёРіСЂС‹: РїСѓСЃС‚Рѕ. СЋРЅРёС‚С‹ РїРѕСЏРІР»СЏСЋС‚СЃСЏ С‚РѕР»СЊРєРѕ С‡РµСЂРµР· РјР°РіР°Р·РёРЅ.
  // ownership set СЃРѕР·РґР°С‘Рј Р·Р°СЂР°РЅРµРµ, С‡С‚РѕР±С‹ shopBuy РјРѕРі РґРѕР±Р°РІР»СЏС‚СЊ С‚СѓРґР° РЅРѕРІС‹Рµ unitId.
  if (!clientToUnits.get(clientId)) clientToUnits.set(clientId, new Set());
  return null;
}


function cloneStateForBattleReplay(sourceState) {
  return {
    phase: sourceState.phase,
    result: sourceState.result,
    units: (sourceState.units ?? []).map((u) => ({ ...u })),
    kings: {
      player: { ...(sourceState.kings?.player ?? {}) },
      enemy: { ...(sourceState.kings?.enemy ?? {}) },
    },
  };
}

function findUnitByIdIn(simState, id) {
  return simState.units.find((u) => u.id === id) ?? null;
}

function getCombatHexAtIn(simState, unit, timeMs) {
  if (!unit) return null;
  const startAt = Number(unit.moveStartAt ?? -1);
  const endAt = Number(unit.moveEndAt ?? -1);
  const fromQ = Number(unit.moveFromQ ?? unit.q);
  const fromR = Number(unit.moveFromR ?? unit.r);
  const toQ = Number(unit.q);
  const toR = Number(unit.r);
  if (endAt <= startAt || timeMs + 1e-6 >= endAt) {
    return { q: toQ, r: toR };
  }
  if (timeMs + 1e-6 < startAt) {
    return { q: fromQ, r: fromR };
  }
  const progress = (timeMs - startAt) / Math.max(1, endAt - startAt);
  if (progress < 0.5) {
    return { q: fromQ, r: fromR };
  }
  return { q: toQ, r: toR };
}

function findClosestOpponentIn(simState, attacker, timeMs) {
  if (!attacker || attacker.dead) return null;
  const opponentTeam = attacker.team === 'player' ? 'enemy' : 'player';
  const mePos = getCombatHexAtIn(simState, attacker, timeMs);
  if (!mePos) return null;

  let best = null;
  let bestDist = Infinity;
  for (const u of simState.units) {
    if (u.zone !== 'board') continue;
    if (u.dead) continue;
    if (u.team !== opponentTeam) continue;
    const targetPos = getCombatHexAtIn(simState, u, timeMs);
    if (!targetPos) continue;
    const d = hexDistance(mePos.q, mePos.r, targetPos.q, targetPos.r);
    if (d < bestDist) {
      bestDist = d;
      best = u;
    }
  }
  return best;
}

function applyDamageToUnitIn(simState, targetId, damageRaw) {
  const target = findUnitByIdIn(simState, targetId);
  if (!target) return { success: false, reason: 'NO_TARGET' };
  if (target.zone !== 'board') return { success: false, reason: 'TARGET_NOT_ON_BOARD' };
  if (target.dead) return { success: false, reason: 'TARGET_DEAD' };

  const damage = Math.max(1, Number(damageRaw ?? 0));
  target.hp = Math.max(0, Number(target.hp ?? 0) - damage);
  const killed = Number(target.hp ?? 0) <= 0;
  if (killed) target.dead = true;
  return {
    success: true,
    damage,
    killed,
    targetHp: Number(target.hp ?? 0),
    targetMaxHp: Number(target.maxHp ?? target.hp ?? 0),
  };
}

function performAttackIn(simState, attackerId, targetId, timeMs) {
  const attacker = findUnitByIdIn(simState, attackerId);
  const target = findUnitByIdIn(simState, targetId);
  if (!attacker || !target) return { success: false, reason: 'NO_UNIT' };
  if (attacker.zone !== 'board') return { success: false, reason: 'ATTACKER_NOT_ON_BOARD' };
  if (target.zone !== 'board') return { success: false, reason: 'TARGET_NOT_ON_BOARD' };
  if (attacker.dead) return { success: false, reason: 'ATTACKER_DEAD' };
  if (target.dead) return { success: false, reason: 'TARGET_DEAD' };
  if (attacker.team === target.team) return { success: false, reason: 'SAME_TEAM' };

  const attackerPos = getCombatHexAtIn(simState, attacker, timeMs);
  const targetPos = getCombatHexAtIn(simState, target, timeMs);
  if (!attackerPos || !targetPos) return { success: false, reason: 'NO_POSITION' };

  const dist = hexDistance(attackerPos.q, attackerPos.r, targetPos.q, targetPos.r);
  const attackRangeMax = Math.max(1, Number(attacker.attackRangeMax ?? 1));
  const attackRangeFullDamage = Math.max(1, Number(attacker.attackRangeFullDamage ?? attackRangeMax));
  if (dist > attackRangeMax) return { success: false, reason: 'OUT_OF_RANGE', dist, attackRangeMax };

  const baseDamage = Math.max(0, Number(attacker.atk ?? 0));
  const damageMultiplier = dist > attackRangeFullDamage ? 0.5 : 1;
  const damage = Math.max(1, Math.round(baseDamage * damageMultiplier));
  const accuracy = Math.max(0, Math.min(1, Number(attacker.accuracy ?? DEFAULT_UNIT_ACCURACY)));
  const isHit = Math.random() < accuracy;
  const projectileSpeed = Math.max(0, Number(attacker.projectileSpeed ?? DEFAULT_UNIT_PROJECTILE_SPEED));
  const isRanged = attackRangeMax > 1;
  const projectileTravelMs = isRanged && projectileSpeed > 0
    ? ((dist / projectileSpeed) * 1000)
    : 0;
  return {
    success: true,
    damage,
    dist,
    attackRangeMax,
    attackRangeFullDamage,
    accuracy,
    isHit,
    isRanged,
    projectileSpeed,
    projectileTravelMs,
  };
}

function getUnitAtIn(simState, q, r) {
  return simState.units.find((u) => u.zone === 'board' && !u.dead && u.q === q && u.r === r) ?? null;
}

function findBounceTargetIn(simState, fromQ, fromR, attackerTeam, excludedIds = []) {
  const enemyTeam = attackerTeam === 'player' ? 'enemy' : 'player';
  const blocked = new Set((excludedIds ?? []).map((x) => Number(x)));
  let best = null;
  let bestDist = Infinity;
  for (const u of (simState.units ?? [])) {
    if (!u || u.zone !== 'board' || u.dead) continue;
    if (u.team !== enemyTeam) continue;
    if (blocked.has(Number(u.id))) continue;
    const d = hexDistance(fromQ, fromR, Number(u.q), Number(u.r));
    if (d > 2) continue;
    if (d < bestDist || (d === bestDist && Number(u.id) < Number(best?.id ?? Infinity))) {
      bestDist = d;
      best = u;
    }
  }
  return best;
}

function pickBestStepTowardIn(simState, attacker, target, timeMs) {
  const attackerPos = getCombatHexAtIn(simState, attacker, timeMs);
  const targetPos = getCombatHexAtIn(simState, target, timeMs);
  if (!attackerPos || !targetPos) return null;

  let best = null;
  let bestDist = Infinity;

  for (const n of NEIGHBORS) {
    const nq = attackerPos.q + n.dq;
    const nr = attackerPos.r + n.dr;
    if (!isInsideBoard(nq, nr)) continue;
    if (getUnitAtIn(simState, nq, nr)) continue;
    const d = hexDistance(nq, nr, targetPos.q, targetPos.r);
    if (d < bestDist) {
      bestDist = d;
      best = { q: nq, r: nr };
    }
  }
  return best;
}

function computeResultIn(simState) {
  const hasPlayer = simState.units.some(u => u.team === 'player' && u.zone === 'board' && !u.dead);
  const hasEnemy = simState.units.some(u => u.team === 'enemy' && u.zone === 'board' && !u.dead);

  const pKing = simState.kings?.player;
  const eKing = simState.kings?.enemy;
  if (pKing && pKing.hp <= 0) return 'defeat';
  if (eKing && eKing.visible && eKing.hp <= 0) return 'victory';

  if (hasPlayer && !hasEnemy) return 'victory';
  if (!hasPlayer && hasEnemy) return 'defeat';
  if (!hasPlayer && !hasEnemy) return 'draw';
  return null;
}

function sumAliveBoardRanksIn(simState, team) {
  return (simState?.units ?? [])
    .filter((u) => u?.zone === 'board' && !u?.dead && u?.team === team)
    .reduce((sum, u) => sum + Math.max(1, Number(u.rank ?? 1)), 0);
}

function simulateBattleReplayFromState(sourceState, opts = {}) {
  const tickMs = Number(opts.tickMs ?? SNAPSHOT_STEP_MS);
  const maxBattleMs = Number(opts.maxBattleMs ?? (BATTLE_DURATION_SECONDS * 1000));
  const collectTimeline = opts.collectTimeline !== false;
  const collectSnapshots = opts.collectSnapshots !== false;
  const simState = cloneStateForBattleReplay(sourceState);
  const events = [];
  const snapshots = [];
  const pendingDamageEvents = [];

  let elapsedMs = 0;
  let result = computeResultIn(simState);

  while (!result && elapsedMs < maxBattleMs) {
    const tickTimeMs = elapsedMs;
    let didSomething = false;

    if (pendingDamageEvents.length > 0) {
      pendingDamageEvents.sort((a, b) => Number(a?.t ?? 0) - Number(b?.t ?? 0));
      while (pendingDamageEvents.length > 0) {
        const next = pendingDamageEvents[0];
        const dueAt = Number(next?.t ?? Infinity);
        if (!Number.isFinite(dueAt) || dueAt > tickTimeMs + 1e-6) break;
        pendingDamageEvents.shift();

        if (next.missed === true) {
          didSomething = true;
          if (collectTimeline) {
            events.push({
              t: dueAt,
              type: 'miss',
              attackerId: next.attackerId,
              targetId: next.targetId,
              attackerTeam: next.attackerTeam,
              attackSeq: Number(next.attackSeq ?? 0),
              missSource: next.damageSource ?? 'attack',
            });
          }
          continue;
        }

        const dmgRes = applyDamageToUnitIn(simState, next.targetId, next.damage);
        if (!dmgRes.success) continue;

        didSomething = true;
        let chainMeta = null;
        const canBounce = next.enableSkeletonArcherBounce === true;
        if (canBounce) {
          const primaryTarget = findUnitByIdIn(simState, next.targetId);
          const fromQ = Number(primaryTarget?.q ?? NaN);
          const fromR = Number(primaryTarget?.r ?? NaN);
          const projectileSpeed = Math.max(0, Number(next.projectileSpeed ?? 0));
          if (Number.isFinite(fromQ) && Number.isFinite(fromR) && projectileSpeed > 0) {
            const bounceTarget = findBounceTargetIn(simState, fromQ, fromR, next.attackerTeam, [next.targetId]);
            if (bounceTarget) {
              const bounceDist = hexDistance(fromQ, fromR, Number(bounceTarget.q), Number(bounceTarget.r));
              const bounceTravelMs = (bounceDist / projectileSpeed) * 1000;
              const bounceDamage = Math.max(1, Math.round(Number(dmgRes.damage ?? 1) * 0.5));
              const bounceT = dueAt + Math.max(0, Number(bounceTravelMs ?? 0));
              pendingDamageEvents.push({
                t: bounceT,
                attackerId: next.attackerId,
                targetId: bounceTarget.id,
                attackerTeam: next.attackerTeam,
                attackSeq: Number(next.attackSeq ?? 0),
                damage: bounceDamage,
                damageSource: 'projectile_bounce',
                projectileSpeed,
                enableSkeletonArcherBounce: false,
              });
              chainMeta = {
                chainFromTargetId: Number(next.targetId),
                chainTargetId: Number(bounceTarget.id),
                chainTravelMs: Math.max(0, Number(bounceTravelMs ?? 0)),
              };
            }
          }
        }
        if (collectTimeline) {
          events.push({
            t: dueAt,
            type: 'damage',
            attackerId: next.attackerId,
            targetId: next.targetId,
            attackerTeam: next.attackerTeam,
            attackSeq: Number(next.attackSeq ?? 0),
            damage: Number(dmgRes.damage ?? 0),
            targetHp: Number(dmgRes.targetHp ?? 0),
            targetMaxHp: Number(dmgRes.targetMaxHp ?? 0),
            killed: Boolean(dmgRes.killed),
            damageSource: next.damageSource ?? 'attack',
            ...(chainMeta ?? {}),
          });
        }
      }
    }

    result = computeResultIn(simState);
    if (result) break;

    const actors = simState.units
      .filter((u) => u.zone === 'board' && !u.dead && (u.team === 'player' || u.team === 'enemy'))
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id));

    for (const a of actors) {
      const me = findUnitByIdIn(simState, a.id);
      if (!me || me.dead || me.zone !== 'board') continue;

      const target = findClosestOpponentIn(simState, me, tickTimeMs);
      if (!target) continue;

      const attackSpeed = Math.max(0.1, Number(me.attackSpeed ?? DEFAULT_UNIT_ATTACK_SPEED));
      const moveSpeed = Math.max(0.1, Number(me.moveSpeed ?? DEFAULT_UNIT_MOVE_SPEED));
      const attackIntervalMs = 1000 / attackSpeed;
      const moveIntervalMs = 1000 / moveSpeed;
      me.nextAttackAt = Math.max(0, Number(me.nextAttackAt ?? 0));
      me.nextMoveAt = Math.max(0, Number(me.nextMoveAt ?? 0));
      // Unified action gate:
      // after movement, unit cannot start attack/ability until it "arrives" to destination hex.
      me.nextActionAt = Math.max(0, Number(me.nextActionAt ?? 0));

      let unitActions = 0;
      while (unitActions < MAX_ACTIONS_PER_UNIT_PER_TICK) {
        const liveTarget = findClosestOpponentIn(simState, me, tickTimeMs);
        if (!liveTarget) break;

        const mePos = getCombatHexAtIn(simState, me, tickTimeMs);
        const targetPos = getCombatHexAtIn(simState, liveTarget, tickTimeMs);
        if (!mePos || !targetPos) break;
        const dist = hexDistance(mePos.q, mePos.r, targetPos.q, targetPos.r);
        const attackRangeMax = Math.max(1, Number(me.attackRangeMax ?? 1));

        if (dist <= attackRangeMax) {
          if (tickTimeMs + 1e-6 < me.nextActionAt) break;
          if (tickTimeMs + 1e-6 < me.nextAttackAt) break;

          const res = performAttackIn(simState, me.id, liveTarget.id, tickTimeMs);
          me.nextAttackAt = Math.max(me.nextAttackAt, tickTimeMs) + attackIntervalMs;
          unitActions += 1;

          if (res.success) {
            didSomething = true;
            me.attackSeq = Number(me.attackSeq ?? 0) + 1;
            const attackSeq = Number(me.attackSeq ?? 0);
            if (collectTimeline) {
              events.push({
                t: tickTimeMs,
                type: 'attack',
                attackerId: me.id,
                targetId: liveTarget.id,
                attackerTeam: me.team,
                attackSeq,
                dist: Number(res.dist ?? dist),
                attackRangeMax: Number(res.attackRangeMax ?? attackRangeMax),
                attackRangeFullDamage: Number(res.attackRangeFullDamage ?? attackRangeMax),
                isRanged: Boolean(res.isRanged),
                projectileSpeed: Number(res.projectileSpeed ?? 0),
                projectileTravelMs: Number(res.projectileTravelMs ?? 0),
              });
            }

            const isRanged = Boolean(res.isRanged) && Number(res.projectileTravelMs ?? 0) > 0;
            const hasSkeletonArcherBounce =
              String(me.abilityType ?? 'none') === 'passive' &&
              String(me.abilityKey ?? '') === 'skeleton_archer_bounce';
            if (isRanged) {
              pendingDamageEvents.push({
                t: tickTimeMs + Number(res.projectileTravelMs ?? 0),
                attackerId: me.id,
                targetId: liveTarget.id,
                attackerTeam: me.team,
                attackSeq,
                damage: Number(res.damage ?? 1),
                damageSource: 'projectile',
                projectileSpeed: Number(res.projectileSpeed ?? 0),
                missed: res.isHit !== true,
                enableSkeletonArcherBounce: hasSkeletonArcherBounce,
              });
            } else {
              if (res.isHit !== true) {
                if (collectTimeline) {
                  events.push({
                    t: tickTimeMs,
                    type: 'miss',
                    attackerId: me.id,
                    targetId: liveTarget.id,
                    attackerTeam: me.team,
                    attackSeq,
                    missSource: 'attack',
                  });
                }
              } else {
                const dmgRes = applyDamageToUnitIn(simState, liveTarget.id, res.damage);
                if (dmgRes.success && collectTimeline) {
                  events.push({
                    t: tickTimeMs,
                    type: 'damage',
                    attackerId: me.id,
                    targetId: liveTarget.id,
                    attackerTeam: me.team,
                    attackSeq,
                    damage: Number(dmgRes.damage ?? 0),
                    targetHp: Number(dmgRes.targetHp ?? 0),
                    targetMaxHp: Number(dmgRes.targetMaxHp ?? 0),
                    killed: Boolean(dmgRes.killed),
                    damageSource: 'attack',
                  });
                }
              }
            }
          }
          break;
        }

        // Do not allow movement while attack cooldown is active:
        // after attacking, unit "commits" and waits for its attack timer before advancing.
        if (tickTimeMs + 1e-6 < me.nextAttackAt) break;
        if (tickTimeMs + 1e-6 < me.nextMoveAt) break;

        const step = pickBestStepTowardIn(simState, me, liveTarget, tickTimeMs);
        if (!step) break;

        const from = { q: me.q, r: me.r };
        const moved = moveUnit(simState, me.id, step.q, step.r);
        const moveReadyAt = Math.max(me.nextMoveAt, tickTimeMs) + moveIntervalMs;
        me.nextMoveAt = moveReadyAt;
        me.nextActionAt = Math.max(me.nextActionAt, moveReadyAt);
        me.moveFromQ = from.q;
        me.moveFromR = from.r;
        me.moveStartAt = tickTimeMs;
        me.moveEndAt = moveReadyAt;
        unitActions += 1;
        if (!moved) break;

        didSomething = true;
        if (collectTimeline) {
          events.push({
            tStart: tickTimeMs,
            t: tickTimeMs + moveIntervalMs,
            durationMs: moveIntervalMs,
            type: 'move',
            unitId: me.id,
            team: me.team,
            fromQ: from.q,
            fromR: from.r,
            q: step.q,
            r: step.r,
          });
        }
      }

      result = computeResultIn(simState);
      if (result) break;
    }

    result = computeResultIn(simState);
    if (result) break;

    if (collectSnapshots) {
      snapshots.push({
        t: tickTimeMs,
        units: (simState.units ?? []).map((u) => ({
          id: u.id,
          q: u.q,
          r: u.r,
          zone: u.zone,
          team: u.team,
          type: u.type,
          hp: u.hp,
          maxHp: u.maxHp,
          dead: Boolean(u.dead),
          attackSeq: Number(u.attackSeq ?? 0),
        })),
      });
    }

    elapsedMs += tickMs;
  }

  if (!result) result = 'draw';

  const survivorRankSum = {
    player: sumAliveBoardRanksIn(simState, 'player'),
    enemy: sumAliveBoardRanksIn(simState, 'enemy'),
  };

  return {
    version: 1,
    mode: 'server-sim',
    tickMs,
    maxBattleMs,
    durationMs: Math.min(maxBattleMs, Math.max(elapsedMs, 0, ...events.map((e) => Number(e?.t ?? 0)))),
    result,
    survivorRankSum,
    winnerDamageByResult: {
      victory: survivorRankSum.player,
      defeat: survivorRankSum.enemy,
      draw: 0,
    },
    events: collectTimeline ? events : [],
    snapshots: collectSnapshots ? snapshots : [],
  };
}

function sanitizeUnitForBattleStart(unit) {
  if (!unit) return;
  unit.nextAttackAt = 0;
  unit.nextMoveAt = 0;
  unit.nextActionAt = 0;
  unit.attackSeq = 0;
  unit.moveStartAt = -1;
  unit.moveEndAt = -1;
  unit.moveFromQ = unit.q;
  unit.moveFromR = unit.r;
}

function clonePlayerUnitForPrep(unit) {
  const clone = { ...unit };
  clone.nextAttackAt = 0;
  clone.nextMoveAt = 0;
  clone.nextActionAt = 0;
  clone.attackSeq = 0;
  clone.moveStartAt = -1;
  clone.moveEndAt = -1;
  clone.moveFromQ = clone.q;
  clone.moveFromR = clone.r;
  clone.dead = false;
  if (Number(clone.hp ?? 0) <= 0) {
    clone.hp = Number(clone.maxHp ?? clone.hp ?? 1);
  }
  return clone;
}

function resetToPrep() {
  // Auto Chess rule: +1 XP each round (win/lose doesnвЂ™t matter)
  applyKingXp(state.kings.player, 1);
  grantRoundXpToAllBots(1);

  // СЃР»РµРґСѓСЋС‰РёР№ СЂР°СѓРЅРґ РЅР°С‡РёРЅР°РµС‚СЃСЏ РІ prep
  state.round = Number(state.round ?? 1) + 1;

  // GOLD: РЅР°С‡РёСЃР»СЏРµРј Р·РѕР»РѕС‚Рѕ Р·Р° РїСЂРѕС€РµРґС€РёР№ Р±РѕР№
  // state.result РІ СЌС‚РѕС‚ РјРѕРјРµРЅС‚ РµС‰С‘ СЃРѕРґРµСЂР¶РёС‚ 'victory/defeat/draw'
  grantRoundGold(state.result);
  grantRoundGoldToAllBots(state.result);
  state.phase = 'prep';
  state.result = null;
  state.battleReplay = null;

  // enemy king СЃРєСЂС‹С‚ РІ prep
  if (state.kings?.enemy) state.kings.enemy.visible = false;

  // Bench is live during battle/result replay.
  // Restore board/non-bench from prep snapshot, but keep current player bench as-is.
  const snapshotUnits = Array.isArray(prepSnapshot) ? prepSnapshot : [];
  const restoredFromSnapshot = snapshotUnits
    .filter((u) => !(u.team === 'player' && u.zone === 'bench'))
    .map((u) => clonePlayerUnitForPrep(u));
  const livePlayerBench = (state.units ?? [])
    .filter((u) => u.team === 'player' && u.zone === 'bench')
    .map((u) => clonePlayerUnitForPrep(u));

  state.units = [
    ...restoredFromSnapshot,
    ...livePlayerBench,
  ];

  // РЎСЂР°Р·Сѓ РїРѕСЃР»Рµ РІРѕР·РІСЂР°С‚Р° РІ prep РїРµСЂРµСЃС‡РёС‚С‹РІР°РµРј merge РґР»СЏ РІСЃРµС… РёРіСЂРѕРєРѕРІ:
  // СЌС‚Рѕ РїРѕРєСЂС‹РІР°РµС‚ РєРµР№СЃ "РґРѕРєСѓРїРёР» 3-РіРѕ РІРѕ РІСЂРµРјСЏ Р±РѕСЏ/СЌРєСЂР°РЅР° СЂРµР·СѓР»СЊС‚Р°С‚Р°",
  // РєРѕРіРґР° РЅРѕРІС‹Р№ СЋРЅРёС‚ РЅР° bench РґРѕР»Р¶РµРЅ СЃР»РёС‚СЊСЃСЏ СЃ РґРІСѓРјСЏ СЋРЅРёС‚Р°РјРё РЅР° board.
  for (const clientId of clientToUnits.keys()) {
    applyMergesForClient(clientId);
  }

  // РєР°Р¶РґС‹Р№ prep вЂ” РЅРѕРІС‹Р№ РјР°РіР°Р·РёРЅ
  generateShopOffers();
  syncRoundPairingsForCurrentRound();

  broadcast(makeStateMessage(state));
  startPrepCountdown();
}

function finishBattle(result) {
  stopBattleTimers();
  const replayDamage = Number(state?.battleReplay?.winnerDamageByResult?.[result] ?? 0);
  const fallbackDefeatDamage = (result === 'defeat' && !state?.battleReplay)
    ? sumPresetRanks(roomState.playerOpponentId)
    : 0;
  const playerBattleDamage = Math.max(0, Math.floor(replayDamage || fallbackDefeatDamage));
  if (result === 'victory' && roomState.playerOpponentIsCopy !== true) {
    applyDamageToParticipantKing(roomState.playerOpponentId, playerBattleDamage);
  } else if (result === 'defeat') {
    state.kings.player.hp = Math.max(0, Number(state.kings.player.hp ?? 0) - playerBattleDamage);
    syncPlayerParticipantHpFromKing();
  }
  resolveHiddenBattlesNoConsequences();

  // РїРѕРєР°Р·С‹РІР°РµРј СЂРµР·СѓР»СЊС‚Р°С‚, РѕСЃС‚Р°С‘РјСЃСЏ РІ battle-view РґРѕ resetToPrep()
  state.phase = 'battle';
  state.result = result;

  const enemyProfile = getCurrentOpponentBotProfile();
  if (state.kings?.enemy) {
    state.kings.enemy.hp = Number(enemyProfile?.hp ?? state.kings.enemy.hp ?? 100);
    state.kings.enemy.maxHp = Number(enemyProfile?.maxHp ?? state.kings.enemy.maxHp ?? 100);
  }


  broadcast(makeStateMessage(state));

  finishTimeout = setTimeout(() => {
    resetToPrep();
  }, 3000);
}

function startBattle() {
  stopPrepTimer();
  if (state.phase === 'battle') return;
  ensureSoloLobbyInitialized();
  syncRoundPairingsForCurrentRound();
  markHiddenBattlesPhase('battle');

  // 1) Р’СЃРµРіРґР° СЃРѕС…СЂР°РЅСЏРµРј Р°РєС‚СѓР°Р»СЊРЅСѓСЋ СЂР°СЃСЃС‚Р°РЅРѕРІРєСѓ РёРіСЂРѕРєР° РїРµСЂРµРґ Р»СЋР±С‹Рј РёСЃС…РѕРґРѕРј СЃС‚Р°СЂС‚Р° Р±РѕСЏ
  // (РІ С‚РѕРј С‡РёСЃР»Рµ РїРµСЂРµРґ instant defeat, РµСЃР»Рё РЅР° РґРѕСЃРєРµ РїСѓСЃС‚Рѕ)
  prepSnapshot = state.units
    .filter(u => u.team === 'player')
    .map((u) => clonePlayerUnitForPrep(u));

  // 2) Р•СЃР»Рё РЅР° РґРѕСЃРєРµ РЅРµС‚ РёРіСЂРѕРєРѕРІ вЂ” РјРіРЅРѕРІРµРЅРЅРѕРµ РїРѕСЂР°Р¶РµРЅРёРµ
  const hasPlayersOnBoard = state.units.some(u => u.team === 'player' && u.zone === 'board');
  if (!hasPlayersOnBoard) {
    finishBattle('defeat');
    return;
  }

  // РґР°Р»СЊС€Рµ РѕР±С‹С‡РЅС‹Р№ СЃС‚Р°СЂС‚ Р±РѕСЏ...
  state.phase = 'battle';
  state.result = null;
  state.battleReplay = null;

  // СЃРїР°РІРЅРёРј Р°СЂРјРёСЋ Р±РѕС‚Р° С‚РѕР»СЊРєРѕ РЅР° СЃС‚Р°СЂС‚ Р±РѕСЏ
  spawnBotArmy();

  for (const u of (state.units ?? [])) {
    if (u?.zone !== 'board') continue;
    sanitizeUnitForBattleStart(u);
  }

  // enemy king РїРѕСЏРІР»СЏРµС‚СЃСЏ С‚РѕР»СЊРєРѕ РІ Р±РѕСЋ
  if (state.kings?.enemy) {
    state.kings.enemy.visible = true;
    state.kings.enemy.name = getCurrentOpponentBotName();
  }

  // Replay-only authoritative battle simulation.
  state.battleReplay = simulateBattleReplayFromState(state, {
    tickMs: SNAPSHOT_STEP_MS,
    maxBattleMs: BATTLE_DURATION_SECONDS * 1000,
  });

  const replayResult = state.battleReplay?.result ?? 'draw';
  const rawDurationMs = Number(state.battleReplay?.durationMs ?? 0);
  const replayFinishMs = Number.isFinite(rawDurationMs)
    ? Math.max(0, Math.min(BATTLE_DURATION_SECONDS * 1000, rawDurationMs))
    : (BATTLE_DURATION_SECONDS * 1000);
  const battleDisplayMs = BATTLE_DURATION_SECONDS * 1000;

  state.battleSecondsLeft = Math.max(0, Math.ceil(battleDisplayMs / 1000));
  broadcast(makeStateMessage(state));

  if (replayFinishMs <= 0) {
    finishBattle(replayResult);
    return;
  }

  const startedAt = Date.now();
  let lastShownSeconds = Number(state.battleSecondsLeft ?? 0);

  battleCountdownTimer = setInterval(() => {
    if (state.phase !== 'battle') {
      clearInterval(battleCountdownTimer);
      battleCountdownTimer = null;
      return;
    }

    const elapsed = Date.now() - startedAt;
    const remainingMs = Math.max(0, battleDisplayMs - elapsed);
    const nextSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    if (nextSeconds !== lastShownSeconds) {
      lastShownSeconds = nextSeconds;
      state.battleSecondsLeft = nextSeconds;
      broadcast(makeStateMessage(state));
    }
  }, 250);

  finishTimeout = setTimeout(() => {
    finishBattle(replayResult);
  }, replayFinishMs);
}

function handleIntent(clientId, msg, ws) {
  if (!msg || msg.type !== 'intent') return;

  const owned = clientToUnits.get(clientId) ?? new Set();
  if (!clientToUnits.get(clientId)) clientToUnits.set(clientId, owned);

  // DEV ONLY: BELOW INTENTS INCLUDE DEBUG/RESET ACTIONS AND MUST BE RESTRICTED BEFORE SHARED LOBBIES.
  const ALLOW_WITHOUT_UNITS = new Set(['shopBuy', 'shopRefresh', 'startGame', 'startBattle', 'buyXp', 'resetGame', 'debugAddGold100', 'debugAddLevel', 'debugSetShopUnit']);
  if (!ALLOW_WITHOUT_UNITS.has(msg.action) && owned.size === 0) {
    ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'No unit assigned to this client')));
    return;
  }

  const requestedUnitId = Number(msg.unitId);
  const requireOwnedUnit = () => {
    if (!Number.isInteger(requestedUnitId) || !owned.has(requestedUnitId)) {
      ws.send(JSON.stringify(makeErrorMessage('NOT_OWNER', 'You do not own this unitId')));
      return false;
    }
    return true;
  };

  if (msg.action === 'startGame') {
    // СЃС‚Р°СЂС‚СѓРµРј С‚РѕР»СЊРєРѕ РµСЃР»Рё СЃРµР№С‡Р°СЃ prep Рё С‚Р°Р№РјРµСЂ РЅРµ РёРґС‘С‚
    const isPreStart =
      state.phase === 'prep' &&
      !state.result &&
      Number(state.round ?? 1) === 1 &&
      Number(state.prepSecondsLeft ?? 0) === 0 &&
      Number(state.battleSecondsLeft ?? 0) === 0 &&
      !prepTimer &&
      !finishTimeout;

    if (!isPreStart) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'startGame allowed only before round start')));
      return;
    }

    // СЃС‚Р°СЂС‚СѓРµРј СЃС‚СЂРѕРіРѕ СЃ 1-РіРѕ СЂР°СѓРЅРґР°
    state.round = 1;
    state.winStreak = 0;
    state.loseStreak = 0;
    state.result = null;
    state.gameStarted = true;
    state.prepSecondsLeft = 0;

    // РјР°РіР°Р·РёРЅ РЅР° СЃС‚Р°СЂС‚
    generateShopOffers();
    ensureSoloLobbyInitialized();
    syncRoundPairingsForCurrentRound();

    broadcast(makeStateMessage(state));
    startPrepCountdown();
    return;
  }

  if (msg.action === 'startBattle') {
    // СЃС‚Р°СЂС‚СѓРµС‚ С‚РѕР»СЊРєРѕ РёР· prep
    if (state.phase !== 'prep') {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'Battle can start only from prep')));
      return;
    }
    startBattle();
    return;
  }

  if (msg.action === 'resetGame') {
    // DEV ONLY: GLOBAL MATCH RESET. DO NOT KEEP OPEN WHEN MULTIPLE REAL CLIENTS SHARE A LOBBY.
    resetGameToStart();
    return;
  }

  if (msg.action === 'setBench') {
    if (!requireOwnedUnit()) return;

    const slot = Number(msg.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= BENCH_SLOTS) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_ARGS', 'slot must be integer 0..7')));
      return;
    }

    const me = findUnitById(requestedUnitId);
    if (!me) {
      ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'Unit not found')));
      return;
    }

    // РЎРєР°РјРµР№РєР° РґРѕСЃС‚СѓРїРЅР° РІСЃРµРіРґР°, РЅРѕ РІРЅРµ prep СЂР°Р·СЂРµС€Р°РµРј С‚РѕР»СЊРєРѕ РјРµРЅРµРґР¶РјРµРЅС‚ СЋРЅРёС‚РѕРІ,
    // РєРѕС‚РѕСЂС‹Рµ РЈР–Р• СЃС‚РѕСЏС‚ РЅР° СЃРєР°РјРµР№РєРµ (bench -> bench, РІРєР»СЋС‡Р°СЏ swap).
    if (state.phase !== 'prep' && me.zone !== 'bench') {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'Only bench units can be managed outside prep')));
      return;
    }

    // Р·Р°РїРѕРјРёРЅР°РµРј РѕС‚РєСѓРґР° РїСЂРёС€С‘Р»
    const prev = {
        zone: me.zone,
        q: me.q,
        r: me.r,
        benchSlot: me.benchSlot,
    };

    const occupied = getUnitInBenchSlot(slot);
    if (occupied && occupied.id !== requestedUnitId) {
      // вњ… swap С‚РѕР»СЊРєРѕ РµСЃР»Рё Р·Р°РЅСЏС‚Рѕ РњРћРРњ СЋРЅРёС‚РѕРј
      if (occupied.team !== 'player' || !owned.has(occupied.id)) {
        ws.send(JSON.stringify(makeErrorMessage('OCCUPIED', 'Bench slot occupied')));
        return;
      }

      // me -> target bench slot
      me.zone = 'bench';
      me.benchSlot = slot;

      // occupied -> old place of me
      if (prev.zone === 'bench') {
        occupied.zone = 'bench';
        occupied.benchSlot = prev.benchSlot;
      } else {
        occupied.zone = 'board';
        occupied.benchSlot = null;
        occupied.q = prev.q;
        occupied.r = prev.r;
      }

      // вњ… MERGE: РїСЂРµРґРїРѕС‡РёС‚Р°РµРј СЋРЅРёС‚, РєРѕС‚РѕСЂС‹Р№ РґРІРёРіР°Р»Рё
      applyMergesForClient(clientId, requestedUnitId);

      broadcast(makeStateMessage(state));
      return;
    }

    // РѕР±С‹С‡РЅР°СЏ СѓСЃС‚Р°РЅРѕРІРєР° (СЃР»РѕС‚ СЃРІРѕР±РѕРґРµРЅ)
    me.zone = 'bench';
    me.benchSlot = slot;

    applyMergesForClient(clientId, requestedUnitId);
    broadcast(makeStateMessage(state));
    return;

  }

  if (msg.action === 'setStart') {
    if (state.phase !== 'prep') {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'setStart allowed only in prep')));
      return;
    }
    if (!requireOwnedUnit()) return;

    const q = Number(msg.q);
    const r = Number(msg.r);

    if (!Number.isFinite(q) || !Number.isFinite(r) || !Number.isInteger(q) || !Number.isInteger(r)) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_ARGS', 'q/r must be integers')));
      return;
    }

    if (!isInsideBoard(q, r)) {
      ws.send(JSON.stringify(makeErrorMessage('OUT_OF_BOUNDS', 'Cell is outside board')));
      return;
    }

    // Р’ prep РёРіСЂРѕРє РјРѕР¶РµС‚ СЃС‚Р°РІРёС‚СЊ СЋРЅРёС‚РѕРІ С‚РѕР»СЊРєРѕ РЅР° СЃРІРѕСЋ РїРѕР»РѕРІРёРЅСѓ РїРѕР»СЏ (РїРµСЂРІС‹Рµ 6 РєРѕР»РѕРЅРѕРє).
    // Р­С‚Рѕ РґСѓР±Р»РёСЂСѓРµС‚ РѕРіСЂР°РЅРёС‡РµРЅРёРµ РєР»РёРµРЅС‚Р°, РЅРѕ РґРѕР»Р¶РЅРѕ РїСЂРѕРІРµСЂСЏС‚СЊСЃСЏ Рё РЅР° СЃРµСЂРІРµСЂРµ.
    if (state.phase === 'prep') {
      const col = q + Math.floor(r / 2);
      const maxPlayerPrepCols = Math.min(GRID_COLS, 6);
      if (col < 0 || col >= maxPlayerPrepCols) {
        ws.send(JSON.stringify(makeErrorMessage('OUT_OF_PREP_ZONE', 'Cell is outside player prep zone')));
        return;
      }
    }

    const me = findUnitById(requestedUnitId);
    if (!me) {
      ws.send(JSON.stringify(makeErrorMessage('NO_UNIT', 'Unit not found')));
      return;
    }

    // Р·Р°РїРѕРјРёРЅР°РµРј РѕС‚РєСѓРґР° СЋРЅРёС‚ РїСЂРёС€С‘Р» (С‡С‚РѕР±С‹ Р±С‹Р»Рѕ РєСѓРґР° "РІС‹С‚РѕР»РєРЅСѓС‚СЊ" РІС‚РѕСЂРѕРіРѕ)
    const prev = {
      zone: me.zone,
      q: me.q,
      r: me.r,
      benchSlot: me.benchSlot,
    };

    const occupied = getUnitAt(state, q, r);
    if (occupied && occupied.id !== requestedUnitId) {
      // вњ… swap С‚РѕР»СЊРєРѕ РµСЃР»Рё Р·Р°РЅСЏС‚Рѕ РњРћРРњ СЋРЅРёС‚РѕРј
      if (occupied.team !== 'player' || !owned.has(occupied.id)) {
        ws.send(JSON.stringify(makeErrorMessage('OCCUPIED', 'Cell is occupied')));
        return;
      }

      // me -> target cell
      me.zone = 'board';
      me.benchSlot = null;
      me.q = q;
      me.r = r;

      // occupied -> old place of me
      if (prev.zone === 'board') {
        occupied.zone = 'board';
        occupied.benchSlot = null;
        occupied.q = prev.q;
        occupied.r = prev.r;
      } else {
        // me Р±С‹Р» РЅР° bench в†’ occupied СѓРµР·Р¶Р°РµС‚ РЅР° РµРіРѕ СЃР»РѕС‚
        occupied.zone = 'bench';
        occupied.benchSlot = prev.benchSlot;
      }

      applyMergesForClient(clientId, requestedUnitId);

      broadcast(makeStateMessage(state));
      return;
    }

    // РѕР±С‹С‡РЅР°СЏ СѓСЃС‚Р°РЅРѕРІРєР° (РєР»РµС‚РєР° СЃРІРѕР±РѕРґРЅР°)
    me.zone = 'board';
    me.benchSlot = null;

    const ok = moveUnit(state, requestedUnitId, q, r);
    if (!ok) {
      ws.send(JSON.stringify(makeErrorMessage('MOVE_DENIED', 'Cannot set start there')));
      return;
    }

    applyMergesForClient(clientId, requestedUnitId);

    broadcast(makeStateMessage(state));
    return;
  }

  if (msg.action === 'buyXp') {
    if (state.phase !== 'prep' || state.result) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'buyXp allowed only in prep (no result)')));
      return;
    }

    const COST = 4;
    const GAIN = 4;

    const coins = state.kings?.player?.coins ?? 0;
    if (coins < COST) {
      ws.send(JSON.stringify(makeErrorMessage('NO_COINS', 'Not enough coins for XP')));
      return;
    }

    state.kings.player.coins -= COST;
    applyKingXp(state.kings.player, GAIN);

    clampPlayerCoins();
    broadcast(makeStateMessage(state));
    return;
  }

  if (msg.action === 'debugAddGold100') {
    // DEV ONLY: DEBUG ECONOMY CHEAT. MUST BE DISABLED/PROTECTED IN PRODUCTION.
    state.kings = state.kings ?? {};
    state.kings.player = state.kings.player ?? { hp: 100, maxHp: 100, coins: 0, level: 1, xp: 0 };
    state.kings.player.coins = Number(state.kings.player.coins ?? 0) + 100;
    clampPlayerCoins();
    broadcast(makeStateMessage(state));
    return;
  }

  if (msg.action === 'debugAddLevel') {
    // DEV ONLY: DEBUG LEVEL CHEAT. MUST BE DISABLED/PROTECTED IN PRODUCTION.
    state.kings = state.kings ?? {};
    state.kings.player = state.kings.player ?? { hp: 100, maxHp: 100, coins: 0, level: 1, xp: 0 };
    const p = state.kings.player;
    const lvl = Math.max(1, Number(p.level ?? 1));
    const curXp = Math.max(0, Number(p.xp ?? 0));
    const need = Number(kingXpToNext(lvl) ?? 0);
    if (need > 0) {
      const delta = Math.max(0, need - curXp);
      if (delta > 0) applyKingXp(p, delta);
    }
    broadcast(makeStateMessage(state));
    return;
  }

  if (msg.action === 'debugSetShopUnit') {
    // DEV ONLY: DEBUG SHOP OVERRIDE. MUST BE DISABLED/PROTECTED IN PRODUCTION.
    if (state.phase !== 'prep' && state.phase !== 'battle') {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'debugSetShopUnit allowed only in prep/battle')));
      return;
    }
    const unitType = String(msg.unitType ?? '').trim();
    if (!unitType) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_ARGS', 'unitType required')));
      return;
    }
    const base = UNIT_CATALOG.find((u) => String(u.type) === unitType);
    if (!base) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_ARGS', `Unknown unitType: ${unitType}`)));
      return;
    }
    state.shop = state.shop ?? { offers: [] };
    state.shop.offers = [];
    for (let i = 0; i < SHOP_OFFER_COUNT; i++) {
      state.shop.offers.push(makeOfferFromCatalogUnit(base));
    }
    broadcast(makeStateMessage(state));
    return;
  }

  if (msg.action === 'shopRefresh') {
    const canRefreshShop = canManageShopInPhase(state.phase);
    if (!canRefreshShop) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'shopRefresh allowed only in prep/battle')));
      return;
    }

    const REFRESH_COST = 2;
    const coins = Number(state.kings?.player?.coins ?? 0);
    if (coins < REFRESH_COST) {
      ws.send(JSON.stringify(makeErrorMessage('NO_COINS', 'Not enough coins to refresh shop')));
      return;
    }

    state.kings.player.coins -= REFRESH_COST;
    clampPlayerCoins();
    generateShopOffers();
    broadcast(makeStateMessage(state));
    return;
  }

  if (msg.action === 'shopBuy') {
    const canBuyFromShop = canManageShopInPhase(state.phase);
    if (!canBuyFromShop) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_PHASE', 'shopBuy allowed only in prep/battle')));
      return;
    }

    const idx = Number(msg.offerIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= SHOP_OFFER_COUNT) {
      ws.send(JSON.stringify(makeErrorMessage('BAD_ARGS', `offerIndex must be 0..${SHOP_OFFER_COUNT - 1}`)));
      return;
    }

    const offer = state.shop?.offers?.[idx];
    if (!offer) {
      ws.send(JSON.stringify(makeErrorMessage('NO_OFFER', 'Offer not found')));
      return;
    }

    const coins = state.kings?.player?.coins ?? 0;
    if (coins < offer.cost) {
      ws.send(JSON.stringify(makeErrorMessage('NO_COINS', 'Not enough coins')));
      return;
    }

    const canPlaceOnBoardNow = (state.phase === 'prep') && !state.result;
    const freeBoardCell = canPlaceOnBoardNow ? findFirstFreeBoardCell() : null;
    const freeSlot = freeBoardCell ? null : findFirstFreeBenchSlot();
    if (!freeBoardCell && freeSlot == null) {
      ws.send(JSON.stringify(makeErrorMessage('NO_SPACE', 'No free board cell or bench slot')));
      return;
    }

    // СЃРїРёСЃС‹РІР°РµРј РјРѕРЅРµС‚С‹
    state.kings.player.coins -= offer.cost;
    clampPlayerCoins();

    // СЃРѕР·РґР°С‘Рј РєСѓРїР»РµРЅРЅРѕРіРѕ СЋРЅРёС‚Р°: СЃРЅР°С‡Р°Р»Р° РЅР° РїРѕР»Рµ (РµСЃР»Рё СЃРµР№С‡Р°СЃ РјРѕР¶РЅРѕ), РёРЅР°С‡Рµ РЅР° bench
    const newId = nextUnitId++;
    addUnit(state, {
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
      rank: 1,
      zone: freeBoardCell ? 'board' : 'bench',
      benchSlot: freeBoardCell ? null : freeSlot,
      attackSpeed: offer.attackSpeed ?? DEFAULT_UNIT_ATTACK_SPEED,
      moveSpeed: offer.moveSpeed ?? DEFAULT_UNIT_MOVE_SPEED,
      projectileSpeed: offer.projectileSpeed ?? DEFAULT_UNIT_PROJECTILE_SPEED,
      attackRangeMax: offer.attackRangeMax ?? 1,
      attackRangeFullDamage: offer.attackRangeFullDamage ?? (offer.attackRangeMax ?? 1),
      accuracy: offer.accuracy ?? DEFAULT_UNIT_ACCURACY,
    });

    // ownership: РєСѓРїР»РµРЅРЅС‹Р№ СЋРЅРёС‚ РїСЂРёРЅР°РґР»РµР¶РёС‚ СЌС‚РѕРјСѓ РєР»РёРµРЅС‚Сѓ
    owned.add(newId);

    // Р·Р°РјРµРЅСЏРµРј РєСѓРїР»РµРЅРЅС‹Р№ СЃР»РѕС‚ РЅРѕРІС‹Рј РѕС„С„РµСЂРѕРј
    state.shop.offers[idx] = null;

    // вњ… MERGE: РїСЂРѕР±СѓРµРј СЃРјС‘СЂРґР¶РёС‚СЊ, РїСЂРµРґРїРѕС‡РёС‚Р°РµРј С‚РѕР»СЊРєРѕ С‡С‚Рѕ РєСѓРїР»РµРЅРЅРѕРіРѕ
    applyMergesForClient(clientId, newId);

    broadcast(makeStateMessage(state));
    return;
  }

  ws.send(JSON.stringify(makeErrorMessage('BAD_INTENT', 'Unknown intent action')));

}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// СЂР°Р·РґР°С‘Рј Vite build
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// SPA fallback (С‡С‚РѕР±С‹ РѕР±РЅРѕРІР»РµРЅРёРµ СЃС‚СЂР°РЅРёС†С‹ РЅРµ РґР°РІР°Р»Рѕ 404)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ---- server ----
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.matchId = DEFAULT_MATCH_ID;
  ensureMatchRuntime(ws.matchId);

  const clientId = crypto.randomUUID();
  clients.set(clientId, ws);

  // РІС‹РґР°С‘Рј СЋРЅРёС‚ СЌС‚РѕРјСѓ РєР»РёРµРЅС‚Сѓ
  const unitId = spawnPlayerUnitFor(clientId);

  if (!state.shop?.offers || state.shop.offers.length !== SHOP_OFFER_COUNT) {
    generateShopOffers();
  }

  // init С‚РѕР»СЊРєРѕ РїРѕРґРєР»СЋС‡РёРІС€РµРјСѓСЃСЏ
  ws.send(JSON.stringify(makeInitMessage({
    clientId,
    unitId,
    state,
  })));

  // Рё РѕР±РЅРѕРІР»С‘РЅРЅС‹Р№ state РІСЃРµРј (С‡С‚РѕР±С‹ РІСЃРµ РІРёРґРµР»Рё РЅРѕРІРѕРіРѕ РёРіСЂРѕРєР°)
  broadcast(makeStateMessage(state));

  ws.on('message', (raw) => {
    let msg = null;
    try {
        msg = JSON.parse(raw.toString());
    } catch {
    ws.send(JSON.stringify(makeErrorMessage('BAD_JSON', 'Cannot parse JSON')));
        return;
    }

    handleIntent(clientId, msg, ws);
  });

  ws.on('close', () => {
    clients.delete(clientId);
    
    const owned = clientToUnits.get(clientId);
    clientToUnits.delete(clientId);

    if (owned && owned.size > 0) {
      state.units = state.units.filter(u => !owned.has(u.id));
      broadcast(makeStateMessage(state));
    }

    // РµСЃР»Рё РЅРёРєРѕРіРѕ РЅРµ РѕСЃС‚Р°Р»РѕСЃСЊ вЂ” РјРѕР¶РЅРѕ РѕСЃС‚Р°РЅРѕРІРёС‚СЊ С‚Р°Р№РјРµСЂС‹
    const hasPlayers = state.units.some(u => u.team === 'player');
    if (!hasPlayers) {
      stopBattleTimers();
      stopPrepTimer();
      state.phase = 'prep';
      state.result = null;
      state.prepSecondsLeft = 0;
    }
  });

});

const PORT = Number(process.env.PORT || 3001);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});


