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

// ─── Heat system (arcade minigame) ────────────────────────────────────────────

export const HEAT_START = 60;
export const HEAT_DRIFT_PER_TICK = 2.0; // units lost per 250ms tick (base)
export const HEAT_DRIFT_APPRENTICE_PER_LEVEL = 0.05; // units saved per tick per Apprentice level
export const HEAT_MAX = 100;
export const HEAT_MIN = 0;

// ─── Bellows (heating) ────────────────────────────────────────────────────────

export const BELLOWS_HEAT_BASE = 15;
export const BELLOWS_HEAT_PER_LEVEL = 3; // additional heat per Bellows upgrade level
export const BELLOWS_COOLDOWN_MS = 800;

// ─── Hammer (striking) ────────────────────────────────────────────────────────

export const HAMMER_COOLDOWN_MS = 800;

// ─── Hammer zones (base thresholds; Tongs widens dynamically) ─────────────────

export const HEAT_PERFECT_LO = 58;
export const HEAT_PERFECT_HI = 62;
export const HEAT_GOOD_LO = 50;
export const HEAT_GOOD_HI = 70;
export const HEAT_TOO_HOT_HI = 85; // TOO_HOT = 71–85, DANGER = >85

export const HAMMER_QUALITY: Record<string, number> = {
  PERFECT: 12,
  GOOD: 8,
  TOO_HOT: 4,
  DANGER: 2,
  COOL: 3,
  COLD: 1,
};

export const HAMMER_DEFECTS: Record<string, number> = {
  PERFECT: 0,
  GOOD: 0,
  TOO_HOT: 5,
  DANGER: 12,
  COOL: 2,
  COLD: 5,
};

// ─── Tongs (widens sweet spot) ───────────────────────────────────────────────

export const TONGS_GOOD_WIDEN_PER_LEVEL = 2;
export const TONGS_PERFECT_WIDEN_MAX = 1; // hard cap for PERFECT zone

// ─── Quench decision ─────────────────────────────────────────────────────────

export const QUENCH_HOT_THRESHOLD = 75;
export const QUENCH_COLD_THRESHOLD = 35;
export const QUENCH_HOT_CRACK_FRACTION = 0.40; // 40% of quality becomes defects
export const QUENCH_IDEAL_BONUS = 8;
export const QUENCH_OVERCOOLED_PENALTY = 5;

// ─── Strike limits (anti-farming) ────────────────────────────────────────────

export const MAX_STRIKES: Record<'ROOKIE' | 'REGULAR' | 'NOBLE', number> = {
  ROOKIE: 8,
  REGULAR: 10,
  NOBLE: 12,
};

export const AUTO_QUENCH_MS = 2000; // auto-quench countdown after strikes hit 0
export const AUTO_QUENCH_PENALTY_DEFECTS = 5; // penalty for forgetting to quench

// ─── Grade thresholds ────────────────────────────────────────────────────────

export const GRADE_S_THRESHOLD = 60;
export const GRADE_A_THRESHOLD = 45;
export const GRADE_B_THRESHOLD = 30;
export const GRADE_C_THRESHOLD = 15;

export const GRADE_PAYOUT_MULT: Record<string, number> = {
  S: 1.5,
  A: 1.2,
  B: 1.0,
  C: 0.6,
  F: 0.2,
};

export const GRADE_REP_MULT: Record<string, number> = {
  S: 1.5,
  A: 1.2,
  B: 1.0,
  C: 0.5,
  F: 0.0,
};

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

export const BELLOWS_UPGRADE_ID = 'bellows';
export const BELLOWS_BASE_COST = 100;
export const BELLOWS_MAX_LEVEL = 6;

export const POLISH_UPGRADE_ID = 'polish';
export const POLISH_BASE_COST = 120;
export const POLISH_MAX_LEVEL = 5;
export const POLISH_REP_BONUS_PER_LEVEL = 2; // +2 rep/grade per level

export const APPRENTICE_UPGRADE_ID = 'apprentice';
export const APPRENTICE_BASE_COST = 150;
export const APPRENTICE_MAX_LEVEL = 5;

export const OILSTONE_UPGRADE_ID = 'oilstone';
export const OILSTONE_BASE_COST = 90;
export const OILSTONE_MAX_LEVEL = 5;
export const OILSTONE_DEFECT_REDUCTION_PER_LEVEL = 1; // reduces defects per bad strike per level

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

// ─── Reputation ──────────────────────────────────────────────────────────────

export const REP_GAIN_BASE = 10;
