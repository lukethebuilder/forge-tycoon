// FILE: src/game/types.ts

export type WorkFocus = 'RUSH' | 'CAREFUL';

export type Grade = 'S' | 'A' | 'B' | 'C' | 'F';

export type StrikeZone = 'PERFECT' | 'GOOD' | 'TOO_HOT' | 'DANGER' | 'COOL' | 'COLD';

export type CustomerTier = 'ROOKIE' | 'REGULAR' | 'NOBLE';

export type ItemType =
  | 'Blade' | 'Fine Blade'
  | 'Shield' | 'Tower Shield' | 'Buckler'
  | 'Boots' | 'Swift Boots';

export interface Order {
  id: string;
  itemType: ItemType;
  baseTimeSec: number;
  basePayout: number;
  isFeatured?: boolean;
  customerTier: CustomerTier;
}

export interface Upgrade {
  id: string;
  name: string;
  level: number;
  maxLevel: number;
}

export interface CraftingState {
  orderId: string;
  heat: number;
  quality: number;
  defects: number;
  hammerCooldownMs: number;
  bellowsCooldownMs: number;
  payoutSnapshot: number;
  strikesRemaining: number;
  autoQuenchMs: number;
  lastStrike?: {
    zone: StrikeZone;
    qualityDelta: number;
    defectDelta: number;
    ageMs: number;
  };
}

export interface FeaturedRunObstacle {
  kind: 'SLIME' | 'SPIKES' | 'GOBLIN';
  xFraction: number; // 0.0–1.0 across canvas width
}

export interface FeaturedRun {
  id: string;           // orderId — used as seed for deterministic obstacles
  grade: Grade;
  obstacles: FeaturedRunObstacle[];
  itemType: string;
  tier: CustomerTier;
}

export interface GameState {
  gold: number;
  activeOrderId?: string;
  crafting?: CraftingState;
  upgrades: Upgrade[];
  orders: Order[];
  ordersCompleted: number;
  repXp: number;
  rankIndex: number;
  lastEvent?: {
    kind: 'DELIVERED';
    featured: boolean;
    grade: Grade;
    repGained: number;
    goldGained: number;
  };
  event?: { id: string; remainingDeliveries: number };
  featuredRun?: FeaturedRun;
  version: number;
}
