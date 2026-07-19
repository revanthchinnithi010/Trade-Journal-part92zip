/**
 * Selected-position store — holds the single BrokerPosition the user has
 * tapped/clicked to inspect in a detail panel.
 *
 * React Native port of src/store/selectedPositionStore.ts
 * ────────────────────────────────────────────────────────
 * No modifications — the file contains only a pure Zustand store with no
 * DOM APIs, browser globals, localStorage usage, or browser event types.
 *
 * Import path update:
 *   @/types/broker → @/types/broker  (already migrated ✓)
 */

import { create } from "zustand";
import type { BrokerPosition } from "@/types/broker";

interface SelectedPositionState {
  position: BrokerPosition | null;
  setPosition: (pos: BrokerPosition | null) => void;
}

export const useSelectedPositionStore = create<SelectedPositionState>((set) => ({
  position: null,
  setPosition: (position) => set({ position }),
}));
