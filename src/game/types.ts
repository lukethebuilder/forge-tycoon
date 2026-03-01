// FILE: src/game/types.ts

export type WorkFocus = 'RUSH' | 'CAREFUL';

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
  remainingMs: number;
  totalMs: number;
  payoutSnapshot: number;
  hammerCooldownMs: number;
}

export interface FeaturedRunObstacle {
  kind: 'SLIME' | 'SPIKES' | 'GOBLIN';
  xFraction: number; // 0.0–1.0 across canvas width
}

export interface FeaturedRun {
  id: string;           // orderId — used as seed for deterministic obstacles
  success: boolean;
  obstacles: FeaturedRunObstacle[];
  itemType: string;
  tier: CustomerTier;
  focus: WorkFocus;
}

export interface GameState {
  gold: number;
  focus: WorkFocus;
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
    success: boolean;
    repGained: number;
    goldGained: number;
  };
  event?: { id: string; remainingDeliveries: number };
  featuredRun?: FeaturedRun;
  version: number;
}
