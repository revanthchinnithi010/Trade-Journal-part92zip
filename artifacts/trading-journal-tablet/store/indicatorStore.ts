/**
 * indicatorStore.ts — Zustand applied-indicators store.
 *
 * React Native port of src/store/indicatorStore.ts
 * ─────────────────────────────────────────────────
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. localStorage → Zustand persist middleware backed by AsyncStorage.
 *    Web: saveApplied / loadApplied / migrateOld use localStorage.
 *    RN:  Zustand's `persist` middleware with `zustandStorage` (AsyncStorage)
 *         handles serialisation and rehydration.  `migrateOld` is retained as
 *         a utility but is not called at module init (no synchronous localStorage
 *         read on RN).  The store starts with an empty indicator list and
 *         rehydrates from AsyncStorage asynchronously on first mount.
 *
 * All state shape, actions, selectors, and public API signatures are
 * preserved exactly.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { zustandStorage } from "@/lib/rnStorage";

export type IndicatorType = "EMA" | "SMA" | "RSI" | "VWAP" | "SUPERTREND" | "CUSTOM";

export interface AppliedIndicator {
  id: string;
  type: IndicatorType;
  label: string;
  visible: boolean;
  color: string;
  lineWidth: number;
  lineStyle: "solid" | "dashed" | "dotted";
  opacity: number;
  settings: Record<string, unknown>;
  visibleTimeframes: string[];
  pineCode?: string;
}

export const DEFAULT_SETTINGS: Record<IndicatorType, Record<string, unknown>> = {
  EMA:       { period: 9,  source: "close", offset: 0 },
  SMA:       { period: 20, source: "close", offset: 0 },
  RSI:       { period: 14, source: "close" },
  VWAP:      {},
  SUPERTREND:{ period: 10, multiplier: 3 },
  CUSTOM:    {},
};

export const DEFAULT_COLORS: Record<IndicatorType, string> = {
  EMA:       "#f59e0b",
  SMA:       "#60a5fa",
  RSI:       "#c084fc",
  VWAP:      "#60a5fa",
  SUPERTREND:"#22c55e",
  CUSTOM:    "#22c55e",
};

function genId() { return Math.random().toString(36).slice(2, 10); }

/**
 * Retained from the web version for potential migration use.
 * Not called at module init on RN (no synchronous localStorage).
 */
export function migrateOld(legacyIndicators: Record<string, boolean>): AppliedIndicator[] {
  const result: AppliedIndicator[] = [];
  const LEGACY = [
    { key: "ema9",   period: 9,   color: "#f59e0b" },
    { key: "ema21",  period: 21,  color: "#38bdf8" },
    { key: "ema50",  period: 50,  color: "#a78bfa" },
    { key: "ema200", period: 200, color: "#f87171" },
  ];
  for (const { key, period, color } of LEGACY) {
    if (legacyIndicators[key]) {
      result.push({ id: key, type: "EMA", label: `EMA (${period})`, visible: true, color, lineWidth: 1, lineStyle: "solid", opacity: 1, settings: { period, source: "close", offset: 0 }, visibleTimeframes: [] });
    }
  }
  return result;
}

interface IndicatorStoreState {
  appliedIndicators:  AppliedIndicator[];
  addIndicator:       (type: IndicatorType, label: string, overrides?: Partial<AppliedIndicator>) => void;
  removeIndicator:    (id: string) => void;
  toggleVisible:      (id: string) => void;
  updateIndicator:    (id: string, changes: Partial<AppliedIndicator>) => void;
  duplicateIndicator: (id: string) => void;
}

export const useIndicatorStore = create<IndicatorStoreState>()(
  persist(
    (set, get) => ({
      appliedIndicators: [],

      addIndicator: (type, label, overrides = {}) => {
        const period = DEFAULT_SETTINGS[type]?.period as number | undefined;
        const fullLabel = period ? `${label} (${period})` : label;
        const ind: AppliedIndicator = {
          id:               genId(),
          type,
          label:            fullLabel,
          visible:          true,
          color:            DEFAULT_COLORS[type],
          lineWidth:        1,
          lineStyle:        "solid",
          opacity:          1,
          settings:         { ...(DEFAULT_SETTINGS[type] ?? {}) },
          visibleTimeframes:[],
          ...overrides,
        };
        const next = [...get().appliedIndicators, ind];
        set({ appliedIndicators: next });
      },

      removeIndicator: (id) => {
        const next = get().appliedIndicators.filter(i => i.id !== id);
        set({ appliedIndicators: next });
      },

      toggleVisible: (id) => {
        const next = get().appliedIndicators.map(i => i.id === id ? { ...i, visible: !i.visible } : i);
        set({ appliedIndicators: next });
      },

      updateIndicator: (id, changes) => {
        const next = get().appliedIndicators.map(i =>
          i.id === id ? { ...i, ...changes, settings: { ...i.settings, ...(changes.settings ?? {}) } } : i
        );
        set({ appliedIndicators: next });
      },

      duplicateIndicator: (id) => {
        const orig = get().appliedIndicators.find(i => i.id === id);
        if (!orig) return;
        const copy: AppliedIndicator = { ...orig, id: genId(), label: `${orig.label} (copy)` };
        const next = [...get().appliedIndicators, copy];
        set({ appliedIndicators: next });
      },
    }),
    {
      name:    "tj_applied_indicators_v2",
      storage: zustandStorage,
      partialize: (s) => ({
        appliedIndicators: s.appliedIndicators.filter(i =>
          ["EMA","SMA","RSI","VWAP","SUPERTREND","CUSTOM"].includes(i.type)
        ),
      }),
    },
  ),
);
