/**
 * chartStore.ts — Zustand chart store.
 *
 * React Native port of src/store/chartStore.ts
 * ─────────────────────────────────────────────
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. localStorage → Zustand persist middleware backed by AsyncStorage.
 *    Web: symbol/interval/chartType/indicators are read from localStorage
 *         synchronously at module initialisation and written on every action.
 *    RN:  Zustand's `persist` middleware with `zustandStorage` (AsyncStorage)
 *         handles both directions.  The store starts with the same defaults and
 *         rehydrates from AsyncStorage asynchronously on first mount.
 *
 * All state shape, actions, selectors, and types are preserved exactly.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { zustandStorage } from "@/lib/rnStorage";

export type ChartType = "candles" | "heikin_ashi" | "line" | "line_with_markers" | "area" | "bars";

export interface IndicatorState {
  ema9:   boolean;
  ema21:  boolean;
  ema50:  boolean;
  ema200: boolean;
  vwap:   boolean;
}

export interface OHLCBar {
  time:   number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface CrosshairInfo {
  time:   number | null;
  open:   number | null;
  high:   number | null;
  low:    number | null;
  close:  number | null;
  volume: number | null;
}

interface ChartStoreState {
  symbol:        string;
  interval:      string;
  chartType:     ChartType;
  indicators:    IndicatorState;
  livePrice:     number | null;
  liveOpen:      number | null;
  crosshairInfo: CrosshairInfo;
  barsLoaded:            boolean;
  mobileChartFullscreen: boolean;
  dashboardSheetOpen:    boolean;

  setSymbol:       (s: string) => void;
  setInterval:     (i: string) => void;
  setChartType:    (t: ChartType) => void;
  setIndicator:    (key: keyof IndicatorState, val: boolean) => void;
  setLivePrice:    (p: number | null) => void;
  setLiveOpen:     (p: number | null) => void;
  setCrosshair:    (info: CrosshairInfo) => void;
  setBarsLoaded:            (v: boolean) => void;
  setMobileChartFullscreen: (v: boolean) => void;
  setDashboardSheetOpen:    (v: boolean) => void;
}

const DEFAULT_INDICATORS: IndicatorState = {
  ema9: false, ema21: false, ema50: false, ema200: false, vwap: false,
};

export const useChartStore = create<ChartStoreState>()(
  persist(
    (set, get) => ({
      symbol:     "BTCUSD",
      interval:   "60",
      chartType:  "candles",
      indicators: DEFAULT_INDICATORS,
      livePrice:  null,
      liveOpen:   null,
      crosshairInfo: { time: null, open: null, high: null, low: null, close: null, volume: null },
      barsLoaded: false,
      mobileChartFullscreen: false,
      dashboardSheetOpen:    false,

      setSymbol:    (symbol)    => set({ symbol,   barsLoaded: false }),
      setInterval:  (interval)  => set({ interval, barsLoaded: false }),
      setChartType: (chartType) => set({ chartType }),
      setIndicator: (key, val)  => {
        const next = { ...get().indicators, [key]: val };
        set({ indicators: next });
      },
      setLivePrice:  (livePrice)     => set({ livePrice }),
      setLiveOpen:   (liveOpen)      => set({ liveOpen }),
      setCrosshair:  (crosshairInfo) => set({ crosshairInfo }),
      setBarsLoaded:            (barsLoaded)            => set({ barsLoaded }),
      setMobileChartFullscreen: (mobileChartFullscreen) => set({ mobileChartFullscreen }),
      setDashboardSheetOpen:    (dashboardSheetOpen)    => set({ dashboardSheetOpen }),
    }),
    {
      name:    "tv_chart_store",
      storage: zustandStorage,
      // Only persist user-selected preferences; never persist ephemeral state.
      partialize: (s) => ({
        symbol:    s.symbol,
        interval:  s.interval,
        chartType: s.chartType,
        indicators: s.indicators,
      }),
    },
  ),
);
