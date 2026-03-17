import { debugActionHandlers } from './debugActions.js';
import { lifecycleActionHandlers } from './lifecycleActions.js';
import { placementActionHandlers } from './placementActions.js';
import { shopActionHandlers } from './shopActions.js';

// Actions that do not require an already assigned owned unit.
// This registry is also the first clean split point for later growth.
export const ALLOW_WITHOUT_UNITS = new Set([
  'shopBuy',
  'shopRefresh',
  'shopToggleLock',
  'startGame',
  'startBattle',
  'buyXp',
  'resetGame',
  'debugAddGold100',
  'debugAddLevel',
  'debugSetShopUnit',
  'debugRunTestBattle',
]);

export const INTENT_ACTION_HANDLERS = Object.freeze({
  ...lifecycleActionHandlers,
  ...placementActionHandlers,
  ...shopActionHandlers,
  ...debugActionHandlers,
});
