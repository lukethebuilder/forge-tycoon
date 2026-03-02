// FILE: src/game/engine.ts

import type { GameState, Order, Grade, StrikeZone, CustomerTier, FeaturedRun, FeaturedRunObstacle } from './types';
import {
  START_GOLD,
  ORDER_COUNT,
  ITEM_TEMPLATES,
  TONGS_UPGRADE_ID,
  TONGS_MAX_LEVEL,
  TONGS_GOOD_WIDEN_PER_LEVEL,
  TONGS_PERFECT_WIDEN_MAX,
  HEAT_START,
  HEAT_DRIFT_PER_TICK,
  HEAT_DRIFT_APPRENTICE_PER_LEVEL,
  HEAT_MAX,
  HEAT_MIN,
  HEAT_PERFECT_LO,
  HEAT_PERFECT_HI,
  HEAT_GOOD_LO,
  HEAT_GOOD_HI,
  HEAT_TOO_HOT_HI,
  HAMMER_QUALITY,
  HAMMER_DEFECTS,
  HAMMER_COOLDOWN_MS,
  BELLOWS_UPGRADE_ID,
  BELLOWS_MAX_LEVEL,
  BELLOWS_HEAT_BASE,
  BELLOWS_HEAT_PER_LEVEL,
  BELLOWS_COOLDOWN_MS,
  OILSTONE_UPGRADE_ID,
  OILSTONE_MAX_LEVEL,
  OILSTONE_DEFECT_REDUCTION_PER_LEVEL,
  APPRENTICE_UPGRADE_ID,
  APPRENTICE_MAX_LEVEL,
  QUENCH_HOT_THRESHOLD,
  QUENCH_COLD_THRESHOLD,
  QUENCH_HOT_CRACK_FRACTION,
  QUENCH_IDEAL_BONUS,
  QUENCH_OVERCOOLED_PENALTY,
  GRADE_S_THRESHOLD,
  GRADE_A_THRESHOLD,
  GRADE_B_THRESHOLD,
  GRADE_C_THRESHOLD,
  GRADE_PAYOUT_MULT,
  GRADE_REP_MULT,
  MAX_STRIKES,
  AUTO_QUENCH_MS,
  AUTO_QUENCH_PENALTY_DEFECTS,
  upgradeCost,
  UPGRADE_BASE_COSTS,
  RANKS,
  REP_GAIN_BASE,
  TIER_MULTIPLIERS,
  TIER_UNLOCK_RANK,
  TIER_UNLOCK_ORDERS,
  POLISH_UPGRADE_ID,
  POLISH_MAX_LEVEL,
  POLISH_REP_BONUS_PER_LEVEL,
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

function generateOrders(
  count: number,
  rankIndex: number,
  ordersCompleted: number,
  frontSignLevel: number,
  firstFeatured = false,
): Order[] {
  if (count <= 0) return [];

  const unlockedTiers = getUnlockedTiers(rankIndex, ordersCompleted, frontSignLevel);

  const shuffled = [...ITEM_TEMPLATES].sort(() => Math.random() - 0.5);
  const orders: Order[] = [];
  const distinct = Math.min(count, shuffled.length);
  for (let i = 0; i < distinct; i++) {
    const tier = unlockedTiers[Math.floor(Math.random() * unlockedTiers.length)];
    orders.push({ ...shuffled[i], id: generateOrderId(), customerTier: tier });
  }

  while (orders.length < count) {
    orders.push(generateOrder(unlockedTiers));
  }

  if (firstFeatured && orders.length > 0) {
    orders[0] = { ...orders[0], isFeatured: true };
  }

  return orders;
}

// ─── Zone classification ────────────────────────────────────────────────────

function classifyZone(heat: number, tongsLevel: number): StrikeZone {
  // Tongs widens GOOD zone symmetrically
  const goodLo = HEAT_GOOD_LO - tongsLevel * TONGS_GOOD_WIDEN_PER_LEVEL;
  const goodHi = HEAT_GOOD_HI + tongsLevel * TONGS_GOOD_WIDEN_PER_LEVEL;

  // Tongs widens PERFECT zone, but capped at +/- TONGS_PERFECT_WIDEN_MAX per side
  const perfectWiden = Math.min(tongsLevel, TONGS_PERFECT_WIDEN_MAX);
  const perfectLo = HEAT_PERFECT_LO - perfectWiden;
  const perfectHi = HEAT_PERFECT_HI + perfectWiden;

  if (heat >= perfectLo && heat <= perfectHi) return 'PERFECT';
  if (heat >= goodLo && heat <= goodHi) return 'GOOD';
  if (heat > goodHi && heat <= HEAT_TOO_HOT_HI) return 'TOO_HOT';
  if (heat > HEAT_TOO_HOT_HI) return 'DANGER';
  if (heat >= QUENCH_COLD_THRESHOLD && heat < goodLo) return 'COOL';
  return 'COLD';
}

// ─── Grade computation ──────────────────────────────────────────────────────

function computeGrade(quality: number, defects: number): Grade {
  const score = quality - defects * 1.5;
  if (score >= GRADE_S_THRESHOLD) return 'S';
  if (score >= GRADE_A_THRESHOLD) return 'A';
  if (score >= GRADE_B_THRESHOLD) return 'B';
  if (score >= GRADE_C_THRESHOLD) return 'C';
  return 'F';
}

// ─── Exported pure functions ─────────────────────────────────────────────────

export function initState(): GameState {
  return {
    gold: START_GOLD,
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
    version: 5,
  };
}

export function tick(state: GameState, dtMs: number): GameState {
  if (!state.crafting) return state;

  const crafting = state.crafting;

  // Heat drift
  const apprentice = state.upgrades.find(u => u.id === APPRENTICE_UPGRADE_ID);
  const apprenticeLevel = apprentice?.level ?? 0;
  const driftReduction = apprenticeLevel * HEAT_DRIFT_APPRENTICE_PER_LEVEL;
  const effectiveDrift = HEAT_DRIFT_PER_TICK - driftReduction;
  const driftThisTick = effectiveDrift * (dtMs / 250);
  const newHeat = Math.max(HEAT_MIN, Math.min(HEAT_MAX, crafting.heat - driftThisTick));

  // Cooldowns
  const newHammerCd = Math.max(0, crafting.hammerCooldownMs - dtMs);
  const newBellowsCd = Math.max(0, crafting.bellowsCooldownMs - dtMs);

  // Age lastStrike feedback
  let newLastStrike = crafting.lastStrike ? { ...crafting.lastStrike, ageMs: crafting.lastStrike.ageMs + dtMs } : undefined;

  // Auto-quench countdown
  let newAutoQuenchMs = crafting.autoQuenchMs;
  let stateAfterTick = state;

  if (crafting.strikesRemaining <= 0) {
    newAutoQuenchMs = Math.max(0, crafting.autoQuenchMs - dtMs);

    // Trigger auto-quench
    if (newAutoQuenchMs <= 0) {
      return finalizeCraft(state, true);
    }
  }

  // Guard: nothing changed
  if (
    newHeat === crafting.heat
    && newHammerCd === crafting.hammerCooldownMs
    && newBellowsCd === crafting.bellowsCooldownMs
    && newAutoQuenchMs === crafting.autoQuenchMs
    && (!newLastStrike || newLastStrike.ageMs === crafting.lastStrike?.ageMs)
  ) {
    return state;
  }

  return {
    ...state,
    crafting: {
      ...crafting,
      heat: newHeat,
      hammerCooldownMs: newHammerCd,
      bellowsCooldownMs: newBellowsCd,
      autoQuenchMs: newAutoQuenchMs,
      lastStrike: newLastStrike,
    },
  };
}

export function selectOrder(state: GameState, orderId: string): GameState {
  if (state.crafting) return state;
  return { ...state, activeOrderId: orderId };
}

export function startCraft(state: GameState): GameState {
  if (!state.activeOrderId || state.crafting) return state;

  const order = state.orders.find(o => o.id === state.activeOrderId);
  if (!order) return state;

  const tierMults = TIER_MULTIPLIERS[order.customerTier];
  const eventDef = state.event ? EVENTS.find(e => e.id === state.event!.id) : undefined;
  const eventPayoutMult = eventDef?.payoutMult ?? 1;

  const payoutSnapshot = Math.round(order.basePayout * tierMults.payoutMult * eventPayoutMult);

  const maxStrikes = MAX_STRIKES[order.customerTier];

  return {
    ...state,
    lastEvent: undefined,
    featuredRun: undefined,
    crafting: {
      orderId: state.activeOrderId,
      heat: HEAT_START,
      quality: 0,
      defects: 0,
      hammerCooldownMs: 0,
      bellowsCooldownMs: 0,
      payoutSnapshot,
      strikesRemaining: maxStrikes,
      autoQuenchMs: AUTO_QUENCH_MS,
    },
  };
}

export function hammer(state: GameState): GameState {
  if (!state.crafting) return state;
  if (state.crafting.hammerCooldownMs > 0) return state;
  if (state.crafting.strikesRemaining <= 0) return state;

  const tongs = state.upgrades.find(u => u.id === TONGS_UPGRADE_ID);
  const tongsLevel = tongs?.level ?? 0;

  const oilstone = state.upgrades.find(u => u.id === OILSTONE_UPGRADE_ID);
  const oilstoneLevel = oilstone?.level ?? 0;

  const zone = classifyZone(state.crafting.heat, tongsLevel);
  const baseQuality = HAMMER_QUALITY[zone] ?? 0;
  const baseDefects = HAMMER_DEFECTS[zone] ?? 0;
  const defectReduction = Math.min(baseDefects, oilstoneLevel * OILSTONE_DEFECT_REDUCTION_PER_LEVEL);
  const netDefects = Math.max(0, baseDefects - defectReduction);

  return {
    ...state,
    crafting: {
      ...state.crafting,
      quality: state.crafting.quality + baseQuality,
      defects: state.crafting.defects + netDefects,
      hammerCooldownMs: HAMMER_COOLDOWN_MS,
      strikesRemaining: state.crafting.strikesRemaining - 1,
      autoQuenchMs: state.crafting.strikesRemaining - 1 <= 0 ? AUTO_QUENCH_MS : state.crafting.autoQuenchMs,
      lastStrike: {
        zone,
        qualityDelta: baseQuality,
        defectDelta: netDefects,
        ageMs: 0,
      },
    },
  };
}

export function bellows(state: GameState): GameState {
  if (!state.crafting) return state;
  if (state.crafting.bellowsCooldownMs > 0) return state;

  const bellowsUpgrade = state.upgrades.find(u => u.id === BELLOWS_UPGRADE_ID);
  const bellowsLevel = bellowsUpgrade?.level ?? 0;
  const heatGain = BELLOWS_HEAT_BASE + bellowsLevel * BELLOWS_HEAT_PER_LEVEL;

  return {
    ...state,
    crafting: {
      ...state.crafting,
      heat: Math.min(HEAT_MAX, state.crafting.heat + heatGain),
      bellowsCooldownMs: BELLOWS_COOLDOWN_MS,
    },
  };
}

export function quench(state: GameState): GameState {
  if (!state.crafting) return state;
  return finalizeCraft(state, false);
}

// ─── Private helper for quench and auto-quench ──────────────────────────────

function finalizeCraft(state: GameState, auto: boolean): GameState {
  if (!state.crafting) return state;

  const crafting = state.crafting;
  const deliveredOrderId = crafting.orderId;

  // Collect quality/defects with clamping
  let quality = Math.max(0, crafting.quality);
  let defects = Math.max(0, crafting.defects);

  // Apply auto-quench penalty
  if (auto) {
    defects = Math.max(0, defects + AUTO_QUENCH_PENALTY_DEFECTS);
  }

  // Apply quench modifier
  const heat = crafting.heat;
  if (heat > QUENCH_HOT_THRESHOLD) {
    // Crack: 40% of quality becomes defects
    const crackAmount = Math.floor(quality * QUENCH_HOT_CRACK_FRACTION);
    quality = Math.max(0, quality - crackAmount);
    defects = defects + crackAmount;
  } else if (heat >= 50 && heat <= QUENCH_HOT_THRESHOLD) {
    // Ideal quench
    quality = quality + QUENCH_IDEAL_BONUS;
  } else if (heat >= QUENCH_COLD_THRESHOLD && heat < 50) {
    // Cold quench — no change
  } else {
    // Over-cooled
    quality = Math.max(0, quality - QUENCH_OVERCOOLED_PENALTY);
  }

  // Compute grade
  const grade = computeGrade(quality, defects);

  // Payout
  const goldGained = Math.round(crafting.payoutSnapshot * GRADE_PAYOUT_MULT[grade]);

  // Reputation
  const deliveredOrder = state.orders.find(o => o.id === deliveredOrderId);
  const tierMults = TIER_MULTIPLIERS[deliveredOrder?.customerTier ?? 'ROOKIE'];
  const polish = state.upgrades.find(u => u.id === POLISH_UPGRADE_ID);
  const polishLevel = polish?.level ?? 0;

  const baseRep = Math.round(REP_GAIN_BASE * tierMults.repMult * GRADE_REP_MULT[grade]);
  const repGained = grade !== 'F' ? baseRep + polishLevel * POLISH_REP_BONUS_PER_LEVEL : 0;

  const newRepXp = state.repXp + repGained;

  // Rank advancement
  let newRankIndex = state.rankIndex;
  while (newRankIndex < RANKS.length - 1 && newRepXp >= RANKS[newRankIndex + 1].xpRequired) {
    newRankIndex++;
  }

  // Event lifecycle
  const newOrdersCompleted = state.ordersCompleted + 1;
  let newEvent: GameState['event'];
  if (state.event) {
    const remaining = state.event.remainingDeliveries - 1;
    newEvent = remaining <= 0 ? undefined : { ...state.event, remainingDeliveries: remaining };
  }

  if (!newEvent && newOrdersCompleted % EVENT_TRIGGER_EVERY === 0) {
    const idx = Math.floor((newOrdersCompleted / EVENT_TRIGGER_EVERY - 1) % EVENTS.length);
    const def = EVENTS[idx];
    newEvent = { id: def.id, remainingDeliveries: def.durationOrders };
  }

  // Featured run
  const featured = deliveredOrder?.isFeatured ?? false;
  let newFeaturedRun: FeaturedRun | undefined;
  if (featured && deliveredOrder) {
    newFeaturedRun = {
      id: deliveredOrderId,
      grade,
      obstacles: generateObstacles(deliveredOrderId),
      itemType: deliveredOrder.itemType,
      tier: deliveredOrder.customerTier,
    };
  }

  const afterFinalize: GameState = {
    ...state,
    gold: state.gold + goldGained,
    orders: state.orders.filter(o => o.id !== deliveredOrderId),
    crafting: undefined,
    activeOrderId: undefined,
    ordersCompleted: newOrdersCompleted,
    repXp: newRepXp,
    rankIndex: newRankIndex,
    lastEvent: { kind: 'DELIVERED', featured, grade, repGained, goldGained },
    event: newEvent,
    featuredRun: newFeaturedRun,
  };

  return regenOrdersIfNeeded(afterFinalize);
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
