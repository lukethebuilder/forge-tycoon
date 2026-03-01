// FILE: src/game/balance.ts

import type { CustomerTier, ItemType } from './types';

export const START_GOLD = 100;
export const ORDER_COUNT = 3;

// ─── Item templates ───────────────────────────────────────────────────────────

type ItemTemplate = { itemType: ItemType; baseTimeSec: number; basePayout: number };

export const ITEM_TEMPLATES: ItemTemplate[] = [
  { itemType: 'Blade',        baseTimeSec: 5,  basePayout: 45 },
  { itemType: 'Fine Blade',   baseTimeSec: 8,  basePayout: 72 },
  { itemType: 'Shield',       baseTimeSec: 7,  basePayout: 60 },
  { itemType: 'Tower Shield', baseTimeSec: 11, basePayout: 98 },
  { itemType: 'Buckler',      baseTimeSec: 5,  basePayout: 42 },
  { itemType: 'Boots',        baseTimeSec: 4,  basePayout: 30 },
  { itemType: 'Swift Boots',  baseTimeSec: 5,  basePayout: 40 },
];

export const ITEM_FLAVOR_LINES: Record<string, string[]> = {
  'Blade':        ["A nervous rookie needs a blade.", "Clean edge, clean conscience.", "Someone's heading into the mines."],
  'Fine Blade':   ["This one's for a duel. No pressure.", "The noble wants engraving too. You said no.", "Sharpest in the market, they claim."],
  'Shield':       ["A farmer who's seen too much.", "Just big enough to hide behind.", "Not the flashiest, but it'll do."],
  'Tower Shield': ["Someone's about to die on those stairs.", "Built like a barn door. That's the point.", "The client is very short. Very nervous."],
  'Buckler':      ["Quick hands, quick shield.", "A thief turned guard. Old habits.", "Small but dependable."],
  'Boots':        ["A nervous rookie needs boots.", "Worn soles tell old stories.", "They'll run in these. Guarantee it."],
  'Swift Boots':  ["Fast feet save lives around here.", "Built for someone who never stops moving.", "Light as a promise, strong as spite."],
};

export const FOCUS_TIME_MULTIPLIERS: Record<'RUSH' | 'CAREFUL', number> = {
  RUSH: 0.75,
  CAREFUL: 1.25,
};

export const FOCUS_PAYOUT_MULTIPLIERS: Record<'RUSH' | 'CAREFUL', number> = {
  RUSH: 0.75,
  CAREFUL: 1.25,
};

export const HAMMER_BURST_MS = 500;
export const HAMMER_COOLDOWN_MS = 1000;

export const MIN_CRAFT_MS = 1200;

// ─── Customer tiers ───────────────────────────────────────────────────────────

export const TIER_MULTIPLIERS: Record<CustomerTier, { timeMult: number; payoutMult: number; repMult: number }> = {
  ROOKIE:  { timeMult: 1.00, payoutMult: 1.00, repMult: 1.00 },
  REGULAR: { timeMult: 1.10, payoutMult: 1.25, repMult: 1.15 },
  NOBLE:   { timeMult: 1.25, payoutMult: 1.60, repMult: 1.35 },
};

// Minimum rankIndex to unlock each tier (primary rule)
export const TIER_UNLOCK_RANK: Record<CustomerTier, number> = {
  ROOKIE: 0,
  REGULAR: 1,
  NOBLE: 3,
};

// Fallback: ordersCompleted threshold when rankIndex is below the rank threshold
export const TIER_UNLOCK_ORDERS: Record<CustomerTier, number> = {
  ROOKIE: 0,
  REGULAR: 5,
  NOBLE: 15,
};

// ─── World Events ─────────────────────────────────────────────────────────────

export interface WorldEvent {
  id: string;
  name: string;
  durationOrders: number;
  timeMult?: number;
  payoutMult?: number;
  successChanceDelta?: number;
}

export const EVENTS: WorldEvent[] = [
  { id: 'mud_season',    name: 'Mud Season',        durationOrders: 3, timeMult: 1.15, successChanceDelta: -0.05 },
  { id: 'merchant_fest', name: 'Merchant Festival',  durationOrders: 3, payoutMult: 1.15 },
  { id: 'bandit_week',   name: 'Bandit Week',        durationOrders: 3, successChanceDelta: -0.10, payoutMult: 1.20 },
  { id: 'calm_skies',    name: 'Calm Skies',         durationOrders: 3, successChanceDelta: 0.05, timeMult: 0.95 },
];

export const EVENT_TRIGGER_EVERY = 5; // start an event every N deliveries

// ─── Upgrades ─────────────────────────────────────────────────────────────────

export const TONGS_UPGRADE_ID = 'tongs';
export const TONGS_BASE_COST = 80;
export const TONGS_MAX_LEVEL = 5;
export const TONGS_TIME_REDUCTION_PER_LEVEL = 0.08; // −8% craft time per level

export const BELLOWS_UPGRADE_ID = 'bellows';
export const BELLOWS_BASE_COST = 100;
export const BELLOWS_MAX_LEVEL = 6;
export const BELLOWS_PAYOUT_MULT_PER_LEVEL = 0.06; // +6% payout per level

export const POLISH_UPGRADE_ID = 'polish';
export const POLISH_BASE_COST = 120;
export const POLISH_MAX_LEVEL = 5;
export const POLISH_REP_BONUS_PER_LEVEL = 2; // +2 rep/success per level

export const APPRENTICE_UPGRADE_ID = 'apprentice';
export const APPRENTICE_BASE_COST = 150;
export const APPRENTICE_MAX_LEVEL = 5;
export const APPRENTICE_PASSIVE_CRAFT_BONUS_MS_PER_TICK = 50; // extra ms reduction per tick per level

export const OILSTONE_UPGRADE_ID = 'oilstone';
export const OILSTONE_BASE_COST = 90;
export const OILSTONE_MAX_LEVEL = 5;
export const OILSTONE_SUCCESS_BONUS_PER_LEVEL = 0.02; // +2% success chance per level

export const FRONT_SIGN_UPGRADE_ID = 'front_sign';
export const FRONT_SIGN_BASE_COST = 110;
export const FRONT_SIGN_MAX_LEVEL = 5;
// Each level adds one extra weighted entry of REGULAR/NOBLE in the tier pool

export const UPGRADE_BASE_COSTS: Record<string, number> = {
  [TONGS_UPGRADE_ID]:      TONGS_BASE_COST,
  [BELLOWS_UPGRADE_ID]:    BELLOWS_BASE_COST,
  [POLISH_UPGRADE_ID]:     POLISH_BASE_COST,
  [APPRENTICE_UPGRADE_ID]: APPRENTICE_BASE_COST,
  [OILSTONE_UPGRADE_ID]:   OILSTONE_BASE_COST,
  [FRONT_SIGN_UPGRADE_ID]: FRONT_SIGN_BASE_COST,
};

export function upgradeCost(baseCost: number, level: number): number {
  return Math.round(baseCost * Math.pow(1.3, level));
}

// ─── Rank ladder ─────────────────────────────────────────────────────────────

export interface Rank {
  name: string;
  xpRequired: number;
  unlocks?: string;
}

export const RANKS: Rank[] = [
  { name: 'Apprentice',            xpRequired: 0 },
  { name: 'Journeyman',            xpRequired: 50,   unlocks: 'Better order variety' },
  { name: 'Craftsman',             xpRequired: 150,  unlocks: 'Featured commissions increase' },
  { name: 'Master Smith',          xpRequired: 350,  unlocks: 'Noble clientele' },
  { name: 'Grand Forgemaster',     xpRequired: 700,  unlocks: 'Legendary commissions' },
  { name: 'Best in All the Lands', xpRequired: 1200 },
];

// ─── Upgrade unlock gates ────────────────────────────────────────────────

export const UPGRADE_UNLOCK_RANK: Record<string, number> = {
  [TONGS_UPGRADE_ID]:       0,  // always available
  [OILSTONE_UPGRADE_ID]:    1,  // Journeyman
  [BELLOWS_UPGRADE_ID]:     1,  // Journeyman
  [POLISH_UPGRADE_ID]:      1,  // Journeyman
  [APPRENTICE_UPGRADE_ID]:  2,  // Craftsman
  [FRONT_SIGN_UPGRADE_ID]:  2,  // Craftsman
};

// ─── Success / reputation ────────────────────────────────────────────────────

export const BASE_SUCCESS_CHANCE = 0.70;
export const FOCUS_SUCCESS_MODIFIERS: Record<'RUSH' | 'CAREFUL', number> = {
  RUSH: -0.15,
  CAREFUL: 0.10,
};
export const REP_GAIN_BASE = 10;
