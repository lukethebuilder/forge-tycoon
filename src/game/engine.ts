// FILE: src/game/engine.ts

import type { GameState, Order, WorkFocus, CustomerTier, FeaturedRun, FeaturedRunObstacle } from './types';
import {
  START_GOLD,
  ORDER_COUNT,
  ITEM_TEMPLATES,
  TONGS_UPGRADE_ID,
  TONGS_MAX_LEVEL,
  TONGS_TIME_REDUCTION_PER_LEVEL,
  FOCUS_TIME_MULTIPLIERS,
  FOCUS_PAYOUT_MULTIPLIERS,
  HAMMER_BURST_MS,
  HAMMER_COOLDOWN_MS,
  MIN_CRAFT_MS,
  upgradeCost,
  UPGRADE_BASE_COSTS,
  RANKS,
  BASE_SUCCESS_CHANCE,
  FOCUS_SUCCESS_MODIFIERS,
  REP_GAIN_BASE,
  TIER_MULTIPLIERS,
  TIER_UNLOCK_RANK,
  TIER_UNLOCK_ORDERS,
  BELLOWS_UPGRADE_ID,
  BELLOWS_MAX_LEVEL,
  BELLOWS_PAYOUT_MULT_PER_LEVEL,
  POLISH_UPGRADE_ID,
  POLISH_MAX_LEVEL,
  POLISH_REP_BONUS_PER_LEVEL,
  APPRENTICE_UPGRADE_ID,
  APPRENTICE_MAX_LEVEL,
  APPRENTICE_PASSIVE_CRAFT_BONUS_MS_PER_TICK,
  OILSTONE_UPGRADE_ID,
  OILSTONE_MAX_LEVEL,
  OILSTONE_SUCCESS_BONUS_PER_LEVEL,
  FRONT_SIGN_UPGRADE_ID,
  FRONT_SIGN_MAX_LEVEL,
  EVENTS,
  EVENT_TRIGGER_EVERY,
} from './balance';

// ─── Private helpers ────────────────────────────────────────────────────────

function generateOrderId(): string {
  return Math.random().toString(36).slice(2);
}

/** Deterministic pseudo-random float [0,1) seeded by a string + index. */
function seededRand(seed: string, index: number): number {
  let h = index * 2654435761;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x9e3779b9);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 0xffffffff;
}

const OBSTACLE_KINDS = ['SLIME', 'SPIKES', 'GOBLIN'] as const;

/** Generates 3 obstacles deterministically from orderId — same result every call. */
function generateObstacles(orderId: string): FeaturedRunObstacle[] {
  return [0.25, 0.50, 0.75].map((xFraction, i) => ({
    kind: OBSTACLE_KINDS[Math.floor(seededRand(orderId, i) * 3)],
    xFraction,
  }));
}

function getUnlockedTiers(rankIndex: number, ordersCompleted: number, frontSignLevel: number): CustomerTier[] {
  const tiers: CustomerTier[] = ['ROOKIE'];
  const hasRegular = rankIndex >= TIER_UNLOCK_RANK.REGULAR || ordersCompleted >= TIER_UNLOCK_ORDERS.REGULAR;
  const hasNoble   = rankIndex >= TIER_UNLOCK_RANK.NOBLE   || ordersCompleted >= TIER_UNLOCK_ORDERS.NOBLE;
  if (hasRegular) {
    tiers.push('REGULAR');
    for (let i = 0; i < frontSignLevel; i++) tiers.push('REGULAR'); // weighted
  }
  if (hasNoble) {
    tiers.push('NOBLE');
    for (let i = 0; i < frontSignLevel; i++) tiers.push('NOBLE'); // weighted
  }
  return tiers;
}

function generateOrder(unlockedTiers: CustomerTier[]): Order {
  const template = ITEM_TEMPLATES[Math.floor(Math.random() * ITEM_TEMPLATES.length)];
  const tier = unlockedTiers[Math.floor(Math.random() * unlockedTiers.length)];
  return { ...template, id: generateOrderId(), customerTier: tier };
}

/**
 * Generates `count` orders, guaranteeing at least 2 distinct itemTypes
 * when count >= 2 and templates allow it.
 * If firstFeatured is true, the first order gets isFeatured = true.
 */
function generateOrders(
  count: number,
  rankIndex: number,
  ordersCompleted: number,
  frontSignLevel: number,
  firstFeatured = false,
): Order[] {
  if (count <= 0) return [];

  const unlockedTiers = getUnlockedTiers(rankIndex, ordersCompleted, frontSignLevel);

  // Shuffle a copy of the templates to pick a guaranteed diverse starting set
  const shuffled = [...ITEM_TEMPLATES].sort(() => Math.random() - 0.5);

  const orders: Order[] = [];

  // Fill up to min(count, templates.length) with distinct types
  const distinct = Math.min(count, shuffled.length);
  for (let i = 0; i < distinct; i++) {
    const tier = unlockedTiers[Math.floor(Math.random() * unlockedTiers.length)];
    orders.push({ ...shuffled[i], id: generateOrderId(), customerTier: tier });
  }

  // Fill remaining slots with random orders
  while (orders.length < count) {
    orders.push(generateOrder(unlockedTiers));
  }

  if (firstFeatured && orders.length > 0) {
    orders[0] = { ...orders[0], isFeatured: true };
  }

  return orders;
}

// ─── Exported pure functions ─────────────────────────────────────────────────

export function initState(): GameState {
  return {
    gold: START_GOLD,
    focus: 'CAREFUL',
    activeOrderId: undefined,
    crafting: undefined,
    upgrades: [
      { id: TONGS_UPGRADE_ID,      name: 'Faster Tongs', level: 0, maxLevel: TONGS_MAX_LEVEL },
      { id: BELLOWS_UPGRADE_ID,    name: 'Bellows',      level: 0, maxLevel: BELLOWS_MAX_LEVEL },
      { id: POLISH_UPGRADE_ID,     name: 'Polish Kit',   level: 0, maxLevel: POLISH_MAX_LEVEL },
      { id: APPRENTICE_UPGRADE_ID, name: 'Apprentice',   level: 0, maxLevel: APPRENTICE_MAX_LEVEL },
      { id: OILSTONE_UPGRADE_ID,   name: 'Oilstone',     level: 0, maxLevel: OILSTONE_MAX_LEVEL },
      { id: FRONT_SIGN_UPGRADE_ID, name: 'Front Sign',   level: 0, maxLevel: FRONT_SIGN_MAX_LEVEL },
    ],
    orders: generateOrders(ORDER_COUNT, 0, 0, 0),
    ordersCompleted: 0,
    repXp: 0,
    rankIndex: 0,
    lastEvent: undefined,
    event: undefined,
    featuredRun: undefined,
    version: 4,
  };
}

export function tick(state: GameState, dtMs: number): GameState {
  if (!state.crafting) return state;

  const { remainingMs, hammerCooldownMs } = state.crafting;

  // Return same reference if nothing would change
  if (remainingMs === 0 && hammerCooldownMs === 0) return state;

  const apprentice = state.upgrades.find(u => u.id === APPRENTICE_UPGRADE_ID);
  const passiveBonus = (apprentice?.level ?? 0) * APPRENTICE_PASSIVE_CRAFT_BONUS_MS_PER_TICK;

  return {
    ...state,
    crafting: {
      ...state.crafting,
      remainingMs: Math.max(0, remainingMs - dtMs - passiveBonus),
      hammerCooldownMs: Math.max(0, hammerCooldownMs - dtMs),
    },
  };
}

export function selectOrder(state: GameState, orderId: string): GameState {
  if (state.crafting) return state;
  return { ...state, activeOrderId: orderId };
}

export function setFocus(state: GameState, focus: WorkFocus): GameState {
  if (state.crafting) return state;
  return { ...state, focus };
}

export function startCraft(state: GameState): GameState {
  if (!state.activeOrderId || state.crafting) return state;

  const order = state.orders.find(o => o.id === state.activeOrderId);
  if (!order) return state;

  const tongs = state.upgrades.find(u => u.id === TONGS_UPGRADE_ID);
  const tongsLevel = tongs?.level ?? 0;

  const bellows = state.upgrades.find(u => u.id === BELLOWS_UPGRADE_ID);
  const bellowsLevel = bellows?.level ?? 0;

  const tierMults = TIER_MULTIPLIERS[order.customerTier];
  const timeReduction = 1 - tongsLevel * TONGS_TIME_REDUCTION_PER_LEVEL;

  const eventDef = state.event ? EVENTS.find(e => e.id === state.event!.id) : undefined;
  const eventTimeMult = eventDef?.timeMult ?? 1;
  const eventPayoutMult = eventDef?.payoutMult ?? 1;

  const rawMs = Math.round(
    order.baseTimeSec
    * FOCUS_TIME_MULTIPLIERS[state.focus]
    * tierMults.timeMult
    * timeReduction
    * eventTimeMult
    * 1000,
  );
  const effectiveMs = Math.max(MIN_CRAFT_MS, rawMs);

  const bellowsPayoutMult = 1 + bellowsLevel * BELLOWS_PAYOUT_MULT_PER_LEVEL;
  const payoutSnapshot = Math.round(
    order.basePayout
    * FOCUS_PAYOUT_MULTIPLIERS[state.focus]
    * tierMults.payoutMult
    * bellowsPayoutMult
    * eventPayoutMult,
  );

  return {
    ...state,
    lastEvent: undefined,
    featuredRun: undefined,
    crafting: {
      orderId: state.activeOrderId,
      remainingMs: effectiveMs,
      totalMs: effectiveMs,
      payoutSnapshot,
      hammerCooldownMs: 0,
    },
  };
}

export function hammer(state: GameState): GameState {
  if (!state.crafting) return state;
  if (state.crafting.hammerCooldownMs > 0) return state;
  if (state.crafting.remainingMs === 0) return state;

  return {
    ...state,
    crafting: {
      ...state.crafting,
      remainingMs: Math.max(0, state.crafting.remainingMs - HAMMER_BURST_MS),
      hammerCooldownMs: HAMMER_COOLDOWN_MS,
    },
  };
}

export function deliver(state: GameState): GameState {
  if (!state.crafting) return state;
  if (state.crafting.remainingMs > 0) return state;

  const deliveredOrderId = state.crafting.orderId;
  const goldGained = state.crafting.payoutSnapshot;

  const deliveredOrder = state.orders.find(o => o.id === deliveredOrderId);
  const featured = deliveredOrder?.isFeatured ?? false;
  const tierMults = TIER_MULTIPLIERS[deliveredOrder?.customerTier ?? 'ROOKIE'];

  // Active event modifiers for success chance
  const eventDef = state.event ? EVENTS.find(e => e.id === state.event!.id) : undefined;
  const eventSuccessDelta = eventDef?.successChanceDelta ?? 0;

  const oilstone = state.upgrades.find(u => u.id === OILSTONE_UPGRADE_ID);
  const oilstoneLevel = oilstone?.level ?? 0;

  // Roll success based on focus + oilstone + active event
  const rawChance = BASE_SUCCESS_CHANCE
    + FOCUS_SUCCESS_MODIFIERS[state.focus]
    + oilstoneLevel * OILSTONE_SUCCESS_BONUS_PER_LEVEL
    + eventSuccessDelta;
  const successChance = Math.max(0.05, Math.min(0.95, rawChance));
  const success = Math.random() < successChance;

  const polish = state.upgrades.find(u => u.id === POLISH_UPGRADE_ID);
  const polishLevel = polish?.level ?? 0;

  const repGained = success
    ? Math.round(REP_GAIN_BASE * tierMults.repMult) + polishLevel * POLISH_REP_BONUS_PER_LEVEL
    : 0;

  const newRepXp = state.repXp + repGained;

  // Advance rank if XP thresholds crossed (allow multiple rank-ups)
  let newRankIndex = state.rankIndex;
  while (
    newRankIndex < RANKS.length - 1 &&
    newRepXp >= RANKS[newRankIndex + 1].xpRequired
  ) {
    newRankIndex++;
  }

  // ─── Event lifecycle (strict order) ───────────────────────────────────────
  const newOrdersCompleted = state.ordersCompleted + 1;

  // Step 1: decrement current event
  let newEvent: GameState['event'];
  if (state.event) {
    const remaining = state.event.remainingDeliveries - 1;
    newEvent = remaining <= 0 ? undefined : { ...state.event, remainingDeliveries: remaining };
  }

  // Step 2: start a new event if cadence hit and slot is free
  if (!newEvent && newOrdersCompleted % EVENT_TRIGGER_EVERY === 0) {
    const idx = Math.floor((newOrdersCompleted / EVENT_TRIGGER_EVERY - 1) % EVENTS.length);
    const def = EVENTS[idx];
    newEvent = { id: def.id, remainingDeliveries: def.durationOrders };
  }

  // ─── Featured run payload ──────────────────────────────────────────────────
  let newFeaturedRun: FeaturedRun | undefined;
  if (featured && deliveredOrder) {
    newFeaturedRun = {
      id: deliveredOrderId,
      success,
      obstacles: generateObstacles(deliveredOrderId),
      itemType: deliveredOrder.itemType,
      tier: deliveredOrder.customerTier,
      focus: state.focus,
    };
  }

  const afterDeliver: GameState = {
    ...state,
    gold: state.gold + goldGained,
    orders: state.orders.filter(o => o.id !== deliveredOrderId),
    crafting: undefined,
    activeOrderId: undefined,
    ordersCompleted: newOrdersCompleted,
    repXp: newRepXp,
    rankIndex: newRankIndex,
    lastEvent: { kind: 'DELIVERED', featured, success, repGained, goldGained },
    event: newEvent,
    featuredRun: newFeaturedRun,
  };

  return regenOrdersIfNeeded(afterDeliver);
}

export function buyUpgrade(state: GameState, upgradeId: string): GameState {
  const upgradeIndex = state.upgrades.findIndex(u => u.id === upgradeId);
  if (upgradeIndex === -1) return state;

  const upgrade = state.upgrades[upgradeIndex];
  if (upgrade.level >= upgrade.maxLevel) return state;

  const baseCost = UPGRADE_BASE_COSTS[upgradeId];
  if (baseCost === undefined) return state;

  const cost = upgradeCost(baseCost, upgrade.level);
  if (state.gold < cost) return state;

  const updatedUpgrades = state.upgrades.map((u, i) =>
    i === upgradeIndex ? { ...u, level: u.level + 1 } : u,
  );

  return {
    ...state,
    gold: state.gold - cost,
    upgrades: updatedUpgrades,
  };
}

export function regenOrdersIfNeeded(state: GameState): GameState {
  if (state.orders.length >= ORDER_COUNT) return state;

  const needed = ORDER_COUNT - state.orders.length;
  const firstFeatured = state.ordersCompleted > 0 && state.ordersCompleted % 3 === 0;
  const frontSign = state.upgrades.find(u => u.id === FRONT_SIGN_UPGRADE_ID);
  const frontSignLevel = frontSign?.level ?? 0;
  const newOrders = generateOrders(needed, state.rankIndex, state.ordersCompleted, frontSignLevel, firstFeatured);

  return {
    ...state,
    orders: [...state.orders, ...newOrders],
  };
}

export function clearFeaturedRun(state: GameState): GameState {
  return { ...state, featuredRun: undefined };
}
