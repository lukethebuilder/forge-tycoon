// FILE: src/lib/storage.ts

import type { GameState } from '../game/types';

const STORAGE_KEY = 'forge-tycoon-state';
const CURRENT_VERSION = 4;

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      (parsed as { version: unknown }).version !== CURRENT_VERSION
    ) {
      return null;
    }

    return parsed as GameState;
  } catch {
    return null;
  }
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage quota exceeded or private browsing — silently ignore
  }
}
