/**
 * CustomChart.tsx — React Native / Skia port (Phase 9.15 Pass A)
 *
 * Pass A scope: candles, price axis, time axis, viewport, camera/transform,
 * visible candle window, basic pan/zoom, chart layout.
 *
 * Rendering engine: @shopify/react-native-skia (Phase 9.13 selection, locked).
 *
 * Web → RN changes (Pass A):
 *   lightweight-charts    → custom Skia Canvas + local viewport math
 *   DOM pointer/touch     → react-native-gesture-handler Gesture
 *   localStorage          → AsyncStorage
 *   import.meta.env.BASE  → getApiBase()
 *   ResizeObserver        → View.onLayout
 *   window.addEventListener → no-op / stubbed
 *   requestAnimationFrame → global rAF (available on Hermes)
 *   performance.mark      → Date.now() timing
 *   HTMLDivElement refs   → React Native View (display only, no ref needed)
 *
 * All exported types, props, and the CustomChart signature are preserved
 * identically to the web source.
 */

import {
  useEffect, useRef, useCallback, memo, useState, useMemo,
  type ReactNode,
} from "react";
import { StyleSheet, View, Text as RNText, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSharedValue, runOnJS } from "react-native-reanimated";
import {
  Canvas, Rect, Line, Group, Fill, Path, Skia, vec,
} from "@shopify/react-native-skia";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  activatePanRange, updatePanRange, subscribePanRange, getPanRange,
} from "./chartPanState";
import {
  useChartStore, type OHLCBar, type ChartType, type IndicatorState,
} from "@/store/chartStore";
import { fmtPrice } from "@/lib/fmtPrice";
import { useMarketSession, type MarketType } from "@/lib/marketSession";
import { SYMBOL_CATALOG } from "@/store/brokerWatchlistStore";
import { emitCrosshair, resetCrosshair } from "@/lib/crosshairState";
import { RealtimeTradeAggregator, toSec } from "@/lib/realtimeTradeAggregator";
import {
  ChartContext, type ChartContextValue,
  type IChartApi, type ISeriesApi,
} from "@/contexts/ChartContext";
import { ChartBarsContext } from "@/contexts/ChartBarsContext";
import type { ChartSettings } from "@/components/charts/chartSettingsTypes";
import { chartApiRef } from "@/lib/chartApiRef";
import { getCachedCandles, setCachedCandles } from "@/lib/candleCache";
import { getApiBase } from "@/lib/apiBase";

// ─── Local type definitions (replace lightweight-charts imports) ──────────────

/** Unix-second timestamp — identical to LWC UTCTimestamp usage throughout. */
type _Time = number;

type _LogicalRange = { from: number; to: number };

/** Matches the web source's SeriesType union from lightweight-charts. */
type _SeriesType = "Candlestick" | "Line" | "Bar" | "Area";

type _AutoscaleInfo = { priceRange: { minValue: number; maxValue: number } } | null;

interface _IPriceLine {
  applyOptions(opts: { price?: number; color?: string }): void;
  getPrice(): number;
  getColor(): string;
}

/** Extended ISeriesApi with the actual methods called by CustomChart. */
interface _ISkiaSeries<T extends string> extends ISeriesApi<T> {
  setData(data: Array<{ time: _Time; [k: string]: number }>): void;
  update(point: { time: _Time; [k: string]: number }): void;
  applyOptions(opts: {
    autoscaleInfoProvider?: (() => _AutoscaleInfo) | null;
    priceFormat?: { type: string; precision: number; minMove: number };
    [k: string]: unknown;
  }): void;
  coordinateToPrice(y: number): number | null;
  priceToCoordinate(price: number): number | null;
  createPriceLine(opts: {
    price: number; color: string; lineWidth: number;
    lineStyle: number; axisLabelVisible: boolean; title: string;
  }): _IPriceLine;
  // Internal accessors used by the canvas rendering
  _getData(): Array<{ time: _Time; [k: string]: number }>;
  _getPriceLines(): _IPriceLine[];
  _getColor(): string;
  _getAutoscaleProvider(): (() => _AutoscaleInfo) | null | undefined;
}

interface _ISkiaTimeScale {
  getVisibleLogicalRange(): _LogicalRange | null;
  setVisibleLogicalRange(r: _LogicalRange): void;
  fitContent(): void;
  subscribeVisibleLogicalRangeChange(fn: (r: _LogicalRange | null) => void): void;
  unsubscribeVisibleLogicalRangeChange(fn: (r: _LogicalRange | null) => void): void;
  coordinateToLogical(px: number): number | null;
  coordinateToTime(px: number): _Time | null;
}

interface _ISkiaPriceScale {
  applyOptions(opts: {
    autoScale?: boolean;
    scaleMargins?: { top: number; bottom: number };
  }): void;
}

/** Extended IChartApi with all methods called by the CustomChart component body. */
interface _ISkiaChart extends IChartApi {
  timeScale(): _ISkiaTimeScale;
  priceScale(id: string): _ISkiaPriceScale;
  addSeries<T extends string>(
    type: unknown,
    opts?: { color?: string; lineWidth?: number; [k: string]: unknown },
  ): _ISkiaSeries<T>;
  removeSeries(series: _ISkiaSeries<string>): void;
  applyOptions(opts: object): void;
  options(): object;
  subscribeCrosshairMove(fn: (p: unknown) => void): void;
  clearCrosshairPosition(): void;
  setCrosshairPosition(price: number, time: unknown, series: unknown): void;
  panes(): Array<{ getHeight(): number }>;
  remove(): void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UP_COLOR   = "#B7FF5A";
const DOWN_COLOR = "#ef4444";
const UP_WICK    = "#7CBF4B";
const DOWN_WICK  = "#dc2626";
const CHART_BG   = "#07110D";
const GRID_COLOR = "rgba(13,28,22,0.7)";
const TEXT_COLOR = "#A7B8A9";

/** Chart layout constants (px) */
const PRICE_AXIS_W  = 72;  // right price-scale strip width
const TIME_AXIS_H   = 35;  // bottom time-scale strip height

/** Viewport defaults — mirror the web source exactly. */
const DEFAULT_VISIBLE_BARS  = 150;
const MIN_FUTURE_BARS       = 50;
const HISTORY_PREFETCH_BARS = 150;
const MAX_TOTAL_BARS        = 10_000;

/** Scale margins applied to the auto-fit price range (matches LWC defaults). */
const SCALE_MARGIN_TOP = 0.07;
const SCALE_MARGIN_BOT = 0.25;
/** Data occupies this fraction of height after margins: 1 - 0.07 - 0.25 = 0.68 */
const SCALE_DATA_FRAC  = 1 - SCALE_MARGIN_TOP - SCALE_MARGIN_BOT;

const EMA_COLORS: Record<keyof IndicatorState, string> = {
  ema9:   "#f59e0b",
  ema21:  "#38bdf8",
  ema50:  "#a78bfa",
  ema200: "#f87171",
  vwap:   "#60a5fa",
};

const EMA_PERIODS: Record<keyof IndicatorState, number> = {
  ema9: 9, ema21: 21, ema50: 50, ema200: 200, vwap: 0,
};

interface ChartMsg {
  type:      string;
  symbol?:   string;
  interval?: string;
  bar?:      OHLCBar;
}

// ─── Stubs for features not yet in scope ─────────────────────────────────────
// sheetDragState: the tablet layout has no draggable BottomSheet — no-op.
const sheetDragState = { active: false, flush: null as (() => void) | null };

// fmtTickAge: not exported by the tablet's LiveMarketContext stub.
function fmtTickAge(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// subscribeToMessages / sendMessage: LiveMarketContext is a stub on tablet.
// These will be replaced when Phase 6 (WS context) is merged.
const _noopUnsub = () => {};
function _noopSubscribe(_fn: (msg: unknown) => void) { return _noopUnsub; }
function _noopSend(_msg: unknown) { /* no-op */ }

// LineStyle enum (mirrors LWC — used in createPriceLine options)
const LineStyle = { Solid: 0, Dotted: 1, Dashed: 2, LargeDashed: 3, SparseDotted: 4 } as const;

// ─── Pure helpers (algorithms preserved verbatim from web source) ─────────────

function calcEMA(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let ema: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
    } else if (i === period - 1) {
      ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
      out.push(ema);
    } else {
      const k = 2 / (period + 1);
      ema = values[i] * k + ema! * (1 - k);
      out.push(ema);
    }
  }
  return out;
}

function calcVWAP(bars: OHLCBar[]): (number | null)[] {
  const out: (number | null)[] = [];
  let cumPV = 0, cumV = 0;
  for (const b of bars) {
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * b.volume;
    cumV  += b.volume;
    out.push(cumV > 0 ? cumPV / cumV : null);
  }
  return out;
}

function safeSortDedup(bars: OHLCBar[]): OHLCBar[] {
  if (bars.length < 2) return bars;
  const deduped = [...new Map(bars.map(b => [b.time, b])).values()];
  deduped.sort((a, b) => a.time - b.time);
  return deduped;
}

function isValidBarTime(barTime: number, lastBarTime: number, context: string): boolean {
  if (!Number.isFinite(barTime) || barTime <= 0) {
    console.warn(`[Chart] ${context}: invalid bar.time=${barTime} — skipped`);
    return false;
  }
  if (barTime < lastBarTime) {
    console.warn(`[Chart] ${context}: out-of-order bar skipped (bar=${barTime}, last=${lastBarTime})`);
    return false;
  }
  return true;
}

function toHeikinAshi(bars: OHLCBar[]): OHLCBar[] {
  const out: OHLCBar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const haClose = (b.open + b.high + b.low + b.close) / 4;
    const haOpen = i === 0
      ? (b.open + b.close) / 2
      : (out[i - 1].open + out[i - 1].close) / 2;
    const haHigh = Math.max(b.high, haOpen, haClose);
    const haLow  = Math.min(b.low,  haOpen, haClose);
    out.push({ time: b.time, open: haOpen, high: haHigh, low: haLow, close: haClose, volume: b.volume });
  }
  return out;
}

// ─── Price / time formatting (algorithms preserved verbatim) ─────────────────

function pricePrecision(price: number): { precision: number; minMove: number } {
  if (!price || !isFinite(price) || price <= 0) return { precision: 2, minMove: 0.01 };
  if (price >= 10_000) return { precision: 2, minMove: 0.01 };
  if (price >= 1_000)  return { precision: 2, minMove: 0.01 };
  if (price >= 100)    return { precision: 3, minMove: 0.001 };
  if (price >= 10)     return { precision: 3, minMove: 0.001 };
  if (price >= 1)      return { precision: 5, minMove: 0.00001 };
  if (price >= 0.1)    return { precision: 5, minMove: 0.00001 };
  if (price >= 0.01)   return { precision: 6, minMove: 0.000001 };
  if (price >= 0.001)  return { precision: 7, minMove: 0.0000001 };
  if (price >= 0.0001) return { precision: 8, minMove: 0.00000001 };
  return { precision: 10, minMove: 0.0000000001 };
}

function fmtIntervalLabel(iv: string): string {
  if (iv === "D" || iv === "1D") return "1D";
  if (iv === "W" || iv === "1W") return "1W";
  const mins = parseInt(iv, 10);
  if (!mins)      return iv.toUpperCase();
  if (mins < 60)  return `${mins}M`;
  if (mins < 1440) return `${mins / 60}H`;
  return `${mins / 1440}D`;
}

function calcCd(iv: string): string {
  const now = Date.now();
  let rem: number;
  if (iv === "W") {
    const d = new Date();
    const dl = d.getUTCDay() === 0 ? 1 : 8 - d.getUTCDay();
    rem = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dl) - now;
  } else if (iv === "D" || iv === "1D") {
    const d = new Date();
    rem = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
  } else {
    const ms = parseInt(iv, 10) * 60_000;
    rem = ms - (now % ms);
  }
  const s  = Math.max(0, Math.floor(rem / 1000));
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}

// ─── Viewport coordinate math ─────────────────────────────────────────────────
//
// Mirrors LWC's internal logical→pixel mapping exactly so all chart geometry
// is identical to the web version.
//
// Coordinate system:
//   logicalFrom / logicalTo  — bar indices bounding the visible window
//   barW                     — pixel width per bar slot (including gap)
//   bodyFrac                 — fraction of barW used for the candle body
//   priceToY(p)              — returns canvas Y (0 = top, chartH = bottom)

function barIdxToX(idx: number, logicalFrom: number, barW: number): number {
  return (idx - logicalFrom + 0.5) * barW;
}

interface DisplayRange { min: number; max: number }

/** Compute the display price range from visible bars with LWC-style scale margins. */
function computeDisplayRange(
  bars: OHLCBar[],
  logicalFrom: number,
  logicalTo: number,
  priceLock: DisplayRange | null,
  autoscaleProvider: (() => _AutoscaleInfo) | null | undefined,
): DisplayRange {
  // Locked via autoscaleInfoProvider (vertical pan override)
  const override = autoscaleProvider?.();
  if (override) return { min: override.priceRange.minValue, max: override.priceRange.maxValue };
  if (priceLock) return priceLock;

  // Auto-scale: scan visible bars
  let lo = Infinity, hi = -Infinity;
  const iFrom = Math.max(0, Math.floor(logicalFrom));
  const iTo   = Math.min(bars.length - 1, Math.ceil(logicalTo));
  for (let i = iFrom; i <= iTo; i++) {
    const b = bars[i];
    if (!b) continue;
    if (b.high > hi) hi = b.high;
    if (b.low  < lo) lo = b.low;
  }
  if (!isFinite(lo) || !isFinite(hi) || lo === hi) {
    const mid = isFinite(lo) ? lo : 0;
    return { min: mid * 0.95, max: mid * 1.05 };
  }
  // Apply scale margins so data occupies SCALE_DATA_FRAC of the canvas height.
  const range = hi - lo;
  return {
    min: lo - (SCALE_MARGIN_BOT / SCALE_DATA_FRAC) * range,
    max: hi + (SCALE_MARGIN_TOP / SCALE_DATA_FRAC) * range,
  };
}

function priceToY(
  price: number,
  displayMin: number,
  displayMax: number,
  chartH: number,
): number {
  if (displayMax === displayMin) return chartH / 2;
  return (1 - (price - displayMin) / (displayMax - displayMin)) * chartH;
}

function yToPrice(
  y: number,
  displayMin: number,
  displayMax: number,
  chartH: number,
): number {
  if (chartH === 0) return 0;
  return displayMax - (y / chartH) * (displayMax - displayMin);
}

// ─── Price axis label generation ──────────────────────────────────────────────

function generatePriceLabels(displayMin: number, displayMax: number, chartH: number, symbol: string): Array<{ price: number; y: number; label: string }> {
  if (!isFinite(displayMin) || !isFinite(displayMax) || displayMax <= displayMin) return [];
  const range  = displayMax - displayMin;
  const step   = (() => {
    const raw = range / 6;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    if (norm < 1.5) return mag;
    if (norm < 3.5) return 2 * mag;
    if (norm < 7.5) return 5 * mag;
    return 10 * mag;
  })();
  const first = Math.ceil(displayMin / step) * step;
  const out: Array<{ price: number; y: number; label: string }> = [];
  for (let p = first; p <= displayMax; p += step) {
    const y = priceToY(p, displayMin, displayMax, chartH);
    if (y < 4 || y > chartH - 4) continue;
    out.push({ price: p, y, label: fmtPrice(p, symbol) });
  }
  return out;
}

// ─── Time axis label generation ───────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function generateTimeLabels(
  bars: OHLCBar[],
  logicalFrom: number,
  logicalTo: number,
  barW: number,
  chartW: number,
  interval: string,
): Array<{ x: number; label: string }> {
  if (barW < 2 || chartW < 40) return [];
  const minSpacingPx = 80;
  const step = Math.max(1, Math.ceil(minSpacingPx / barW));
  const out: Array<{ x: number; label: string }> = [];
  const iFrom = Math.max(0, Math.floor(logicalFrom));
  const iTo   = Math.min(bars.length - 1, Math.ceil(logicalTo));
  let lastX = -minSpacingPx;
  for (let i = iFrom; i <= iTo; i += step) {
    const b = bars[i];
    if (!b) continue;
    const x = barIdxToX(i, logicalFrom, barW);
    if (x - lastX < minSpacingPx) continue;
    lastX = x;
    const d     = new Date(b.time * 1000);
    const isDay = interval === "D" || interval === "1D" || interval === "W" || interval === "1W";
    const label = isDay
      ? `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2,"0")}`
      : `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    out.push({ x, label });
  }
  return out;
}

// ─── Skia series implementation ───────────────────────────────────────────────

class SkiaPriceLineImpl implements _IPriceLine {
  constructor(
    private _price: number,
    private _color: string,
    private readonly _inv: () => void,
  ) {}
  applyOptions(opts: { price?: number; color?: string }) {
    if (opts.price !== undefined)  this._price = opts.price;
    if (opts.color !== undefined)  this._color = opts.color;
    this._inv();
  }
  getPrice() { return this._price; }
  getColor() { return this._color; }
}

class SkiaSeriesApiImpl<T extends string> implements _ISkiaSeries<T> {
  readonly _brand   = "ISeriesApi" as const;
  readonly _seriesType: T;

  private _data: Array<{ time: _Time; [k: string]: number }> = [];
  private _color: string;
  private _autoscaleProvider: (() => _AutoscaleInfo) | null | undefined = undefined;
  private _priceLines: SkiaPriceLineImpl[] = [];
  private _priceFmt?: { precision: number; minMove: number };
  private readonly _inv: () => void;

  // Coordinate refs — written by the parent component on each layout change
  readonly _coordRef: { logFrom: number; logTo: number; chartH: number; displayMin: number; displayMax: number };

  constructor(
    seriesType: T,
    color: string,
    coordRef: SkiaSeriesApiImpl<T>["_coordRef"],
    inv: () => void,
  ) {
    this._seriesType  = seriesType;
    this._color       = color;
    this._coordRef    = coordRef;
    this._inv         = inv;
  }

  setData(data: Array<{ time: _Time; [k: string]: number }>) {
    this._data = [...data];
    this._inv();
  }

  update(point: { time: _Time; [k: string]: number }) {
    const last = this._data[this._data.length - 1];
    if (last && last.time === point.time) this._data[this._data.length - 1] = point;
    else this._data.push(point);
    this._inv();
  }

  applyOptions(opts: {
    autoscaleInfoProvider?: (() => _AutoscaleInfo) | null;
    priceFormat?: { type: string; precision: number; minMove: number };
    color?: string;
    lineWidth?: number;
    [k: string]: unknown;
  }) {
    if ("autoscaleInfoProvider" in opts) this._autoscaleProvider = opts.autoscaleInfoProvider ?? undefined;
    if (opts.priceFormat) this._priceFmt = { precision: opts.priceFormat.precision, minMove: opts.priceFormat.minMove };
    if (opts.color) this._color = opts.color;
    this._inv();
  }

  coordinateToPrice(y: number): number | null {
    const cr = this._coordRef;
    if (cr.chartH <= 0 || cr.displayMin === cr.displayMax) return null;
    return yToPrice(y, cr.displayMin, cr.displayMax, cr.chartH);
  }

  priceToCoordinate(price: number): number | null {
    const cr = this._coordRef;
    if (cr.chartH <= 0 || cr.displayMin === cr.displayMax) return null;
    return priceToY(price, cr.displayMin, cr.displayMax, cr.chartH);
  }

  createPriceLine(opts: {
    price: number; color: string; lineWidth: number;
    lineStyle: number; axisLabelVisible: boolean; title: string;
  }): _IPriceLine {
    const pl = new SkiaPriceLineImpl(opts.price, opts.color, this._inv);
    this._priceLines.push(pl);
    return pl;
  }

  _getData()               { return this._data; }
  _getPriceLines()         { return this._priceLines; }
  _getColor()              { return this._color; }
  _getAutoscaleProvider()  { return this._autoscaleProvider; }
}

// ─── Skia chart API implementation ────────────────────────────────────────────

class SkiaChartApiImpl implements _ISkiaChart {
  readonly _brand = "IChartApi" as const;

  private _logFrom:    number;
  private _logTo:      number;
  private _autoScale:  boolean = true;
  private _scaleMargins = { top: SCALE_MARGIN_TOP, bottom: SCALE_MARGIN_BOT };
  private _rangeListeners: Array<(r: _LogicalRange | null) => void> = [];
  private _chartH: number;
  private _chartW: number;
  private _series: SkiaSeriesApiImpl<string>[] = [];
  private readonly _inv: () => void;
  private readonly _barsRef: { current: OHLCBar[] };

  constructor(
    logFrom:  number,
    logTo:    number,
    chartW:   number,
    chartH:   number,
    barsRef:  { current: OHLCBar[] },
    inv:      () => void,
  ) {
    this._logFrom  = logFrom;
    this._logTo    = logTo;
    this._chartW   = chartW;
    this._chartH   = chartH;
    this._barsRef  = barsRef;
    this._inv      = inv;
  }

  // ── Time scale ──────────────────────────────────────────────────────────────
  timeScale(): _ISkiaTimeScale {
    return {
      getVisibleLogicalRange: () => ({ from: this._logFrom, to: this._logTo }),
      setVisibleLogicalRange: (r) => {
        this._logFrom = r.from;
        this._logTo   = r.to;
        this._notifyRange();
        this._inv();
      },
      fitContent: () => {
        const n = this._barsRef.current.length;
        if (n === 0) return;
        const lastIdx = n - 1;
        this._logFrom = Math.max(0, lastIdx - DEFAULT_VISIBLE_BARS + 1);
        this._logTo   = lastIdx + MIN_FUTURE_BARS;
        this._notifyRange();
        this._inv();
      },
      subscribeVisibleLogicalRangeChange: (fn) => {
        this._rangeListeners.push(fn);
      },
      unsubscribeVisibleLogicalRangeChange: (fn) => {
        this._rangeListeners = this._rangeListeners.filter(f => f !== fn);
      },
      coordinateToLogical: (px) => {
        const barsVis = this._logTo - this._logFrom;
        if (this._chartW <= 0 || barsVis <= 0) return null;
        return this._logFrom + (px / this._chartW) * barsVis;
      },
      coordinateToTime: (px) => {
        const idx = Math.round(
          this._logFrom + (px / (this._chartW || 1)) * (this._logTo - this._logFrom) - 0.5
        );
        const bar = this._barsRef.current[idx];
        return bar ? bar.time : null;
      },
    };
  }

  private _notifyRange() {
    const r = { from: this._logFrom, to: this._logTo };
    for (const fn of this._rangeListeners) fn(r);
  }

  // ── Price scale ─────────────────────────────────────────────────────────────
  priceScale(_id: string): _ISkiaPriceScale {
    return {
      applyOptions: (opts) => {
        if (opts.autoScale !== undefined) this._autoScale = opts.autoScale;
        if (opts.scaleMargins)            this._scaleMargins = opts.scaleMargins;
        this._inv();
      },
    };
  }

  // ── Series management ───────────────────────────────────────────────────────
  addSeries<T extends string>(
    _type: unknown,
    opts?: { color?: string; lineWidth?: number; [k: string]: unknown },
  ): SkiaSeriesApiImpl<T> {
    const color = (opts?.color as string | undefined) ?? "#B7FF5A";
    // Shared coord ref — parent writes on each render
    const coordRef = { logFrom: this._logFrom, logTo: this._logTo, chartH: this._chartH, displayMin: 0, displayMax: 100 };
    const s = new SkiaSeriesApiImpl<T>(
      "Line" as T, color, coordRef, this._inv,
    );
    this._series.push(s as SkiaSeriesApiImpl<string>);
    this._inv();
    return s;
  }

  removeSeries(series: SkiaSeriesApiImpl<string>) {
    this._series = this._series.filter(s => s !== series);
    this._inv();
  }

  // ── Chart options ───────────────────────────────────────────────────────────
  applyOptions(_opts: object) { /* crosshair/grid options — visual only, no-op for now */ }
  options(): object { return { crosshair: { vertLine: {}, horzLine: {} } }; }

  // ── Crosshair (Pass A — stubs; fully implemented in later pass) ─────────────
  subscribeCrosshairMove(_fn: (p: unknown) => void) { /* implemented in Pass C */ }
  clearCrosshairPosition()                { /* no-op */ }
  setCrosshairPosition(_p: number, _t: unknown, _s: unknown) { /* no-op */ }

  // ── Pane geometry ───────────────────────────────────────────────────────────
  panes() { return [{ getHeight: () => this._chartH }]; }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  remove() {
    this._rangeListeners = [];
    this._series = [];
  }

  // ── Internal accessors used by the canvas rendering ─────────────────────────
  _getFrom()    { return this._logFrom; }
  _getTo()      { return this._logTo; }
  _getAutoScale() { return this._autoScale; }
  _getSeries()  { return this._series; }
  _setChartSize(w: number, h: number) { this._chartW = w; this._chartH = h; }
}

// ─── Series factory (mirrors web makeSeries) ──────────────────────────────────

const CandlestickSeries = "CandlestickSeries" as const;
const LineSeries        = "LineSeries" as const;
const AreaSeries        = "AreaSeries" as const;
const BarSeries         = "BarSeries"  as const;

function makeSeries(chart: SkiaChartApiImpl, ct: ChartType): SkiaSeriesApiImpl<string> {
  switch (ct) {
    case "bars":
      return chart.addSeries(BarSeries, { color: UP_COLOR });
    case "line":
    case "line_with_markers":
      return chart.addSeries(LineSeries, { color: UP_COLOR, lineWidth: 2 });
    case "area":
      return chart.addSeries(AreaSeries, { color: UP_COLOR, lineWidth: 2 });
    default: // candles, heikin_ashi
      return chart.addSeries(CandlestickSeries, { color: UP_COLOR });
  }
}

// ─── applyBars / updateBar (adapted — no LWC Time cast needed) ───────────────

function applyBarsToSeries(series: SkiaSeriesApiImpl<string>, ct: ChartType, bars: OHLCBar[]) {
  if (bars.length === 0) return;
  const safe = safeSortDedup(bars);
  if (ct === "heikin_ashi") {
    const ha = toHeikinAshi(safe);
    series.setData(ha.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
  } else if (ct === "line" || ct === "line_with_markers" || ct === "area") {
    series.setData(safe.map(b => ({ time: b.time, value: b.close })));
  } else {
    series.setData(safe.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
  }
}

function updateBarOnSeries(series: SkiaSeriesApiImpl<string>, ct: ChartType, b: OHLCBar, lastBarTime = 0) {
  if (!isValidBarTime(b.time, lastBarTime, "updateBar")) return;
  try {
    if (ct === "line" || ct === "line_with_markers" || ct === "area") {
      series.update({ time: b.time, value: b.close });
    } else {
      series.update({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close });
    }
  } catch { /* series may be in teardown */ }
}

// ─── AsyncStorage-backed viewport persistence ─────────────────────────────────

async function loadViewport(sym: string, iv: string): Promise<{ from: number; to: number; priceMin?: number; priceMax?: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(`tv_vp_${sym}_${iv}`);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v.from === "number" && typeof v.to === "number") return v;
    return null;
  } catch { return null; }
}

async function saveViewport(sym: string, iv: string, from: number, to: number, panRange: { lo: number; hi: number } | null) {
  try {
    const vp: Record<string, number> = { from, to };
    if (panRange) { vp.priceMin = panRange.lo; vp.priceMax = panRange.hi; }
    await AsyncStorage.setItem(`tv_vp_${sym}_${iv}`, JSON.stringify(vp));
  } catch { /* ignore */ }
}

// ─── TickRateOverlay ──────────────────────────────────────────────────────────
// React Native equivalent: uses React state instead of DOM mutation.
// Updates at 1 Hz via setInterval — same as the web version.

function TickRateOverlay({
  tickCountRef, lastTickTimeRef, isMarketOpen: isOpen, mktType: _mktType,
}: {
  tickCountRef:    React.MutableRefObject<number>;
  lastTickTimeRef: React.MutableRefObject<number>;
  isMarketOpen:    boolean;
  mktType:         MarketType;
}) {
  const [text, setText] = useState(isOpen ? "0 t/s" : "Market Closed");
  const [dotColor, setDotColor] = useState(isOpen ? "#6b7280" : "rgba(239,68,68,0.85)");
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  useEffect(() => {
    let prev = tickCountRef.current;
    const id = setInterval(() => {
      const cur  = tickCountRef.current;
      const tps  = cur - prev;
      prev = cur;
      const open   = isOpenRef.current;
      const lastTs = lastTickTimeRef.current;
      if (!open) {
        const ageStr = lastTs > 0 ? ` · last ${fmtTickAge(lastTs)}` : "";
        setText(`Market Closed${ageStr}`);
        setDotColor("rgba(239,68,68,0.85)");
        return;
      }
      const hasLiveFeed = lastTs > 0;
      if (!hasLiveFeed) { setText("Feed Offline"); setDotColor("#6b7280"); return; }
      const ageStr = tps === 0 ? ` · ${fmtTickAge(lastTs)}` : "";
      setText(tps > 0 ? `${tps} t/s` : `0 t/s${ageStr}`);
      setDotColor(tps > 0 ? "#22c55e" : "#6b7280");
    }, 1000);
    return () => clearInterval(id);
  }, [tickCountRef, lastTickTimeRef]);

  return (
    <View style={styles.tickRow}>
      <View style={[styles.tickDot, { backgroundColor: dotColor }]} />
      <RNText style={styles.tickText}>{text}</RNText>
    </View>
  );
}

// ─── LivePriceBox ─────────────────────────────────────────────────────────────
// React Native equivalent: positioned View with Animated Y.
// The RAF-based DOM mutation approach from the web becomes a 60 Hz
// setInterval driving React state.  The Y position is recomputed from the
// series `priceToCoordinate()` shim.

function LivePriceBox({
  series, interval, upColor = UP_COLOR, downColor = DOWN_COLOR,
  textColor = "#ffffff", tickDataRef, lastTickTimeRef,
  symbolOverride, slotMode = false, isMarketOpen = true,
}: {
  series:       _ISkiaSeries<string> | null;
  interval:     string;
  upColor?:     string;
  downColor?:   string;
  textColor?:   string;
  tickDataRef?: React.MutableRefObject<{ price: number | null; open: number | null }>;
  lastTickTimeRef?: React.MutableRefObject<number>;
  symbolOverride?: string;
  slotMode?: boolean;
  isMarketOpen?: boolean;
}) {
  const storeLivePrice = useChartStore(s => s.livePrice);
  const storeLiveOpen  = useChartStore(s => s.liveOpen);
  const storeSymbol    = useChartStore(s => s.symbol);
  const symbol = symbolOverride ?? storeSymbol;
  const [display, setDisplay] = useState<{
    price: number; bull: boolean; y: number | null; cd: string;
  } | null>(null);

  const seriesRef = useRef(series);
  seriesRef.current = series;
  const ivRef = useRef(interval);
  ivRef.current = interval;
  const openRef = useRef(isMarketOpen);
  openRef.current = isMarketOpen;

  useEffect(() => {
    const id = setInterval(() => {
      const tickPrice = tickDataRef?.current.price ?? null;
      const tickOpen  = tickDataRef?.current.open  ?? null;
      const price = tickPrice ?? (slotMode ? null : storeLivePrice);
      const open  = tickOpen  ?? (slotMode ? null : storeLiveOpen);
      if (price == null || !seriesRef.current) { setDisplay(null); return; }
      const bull = open == null || price >= open;
      const y    = seriesRef.current.priceToCoordinate(price);
      const marketOpen  = openRef.current;
      const hasLiveFeed = (lastTickTimeRef?.current ?? 0) > 0;
      const cd = (marketOpen && hasLiveFeed) ? calcCd(ivRef.current) : "—";
      setDisplay({ price, bull, y: typeof y === "number" && isFinite(y) ? y : null, cd });
    }, 100);
    return () => clearInterval(id);
  }, [slotMode, storeLivePrice, storeLiveOpen, tickDataRef, lastTickTimeRef]);

  if (!display) return null;

  const col = display.bull ? upColor : downColor;
  const top = display.y != null ? display.y - 18 : undefined;

  return (
    <View
      style={[
        styles.priceBox,
        { backgroundColor: col, borderColor: col, top: top ?? 0 },
        top == null && styles.priceBoxHidden,
      ]}
      pointerEvents="none"
    >
      <RNText style={[styles.priceBoxText, { color: textColor }]}>
        {fmtPrice(display.price, symbol)}
      </RNText>
      <RNText style={[styles.priceBoxCd, { color: textColor }]}>
        {display.cd}
      </RNText>
    </View>
  );
}

// ─── CustomChart ──────────────────────────────────────────────────────────────

const CustomChart = memo(function CustomChart({
  children, settings, replayBars,
  symbol: propSymbol, interval: propInterval, chartType: propChartType,
}: {
  children?: ReactNode;
  settings?: ChartSettings;
  replayBars?: OHLCBar[] | null;
  symbol?:    string;
  interval?:  string;
  chartType?: string;
}) {
  // ── Zustand selectors ──────────────────────────────────────────────────────
  const storeSymbol    = useChartStore(s => s.symbol);
  const storeInterval  = useChartStore(s => s.interval);
  const storeChartType = useChartStore(s => s.chartType);
  const indicators     = useChartStore(s => s.indicators);
  const storeSetLivePrice  = useChartStore(s => s.setLivePrice);
  const storeSetLiveOpen   = useChartStore(s => s.setLiveOpen);
  const storeSetBarsLoaded = useChartStore(s => s.setBarsLoaded);

  // Slot mode: per-grid-pane overrides
  const isSlotRef   = useRef(propSymbol != null);
  isSlotRef.current = propSymbol != null;
  const symbol    = propSymbol    ?? storeSymbol;
  const interval  = propInterval  ?? storeInterval;
  const chartType = (propChartType as typeof storeChartType) ?? storeChartType;

  const setLivePrice  = useCallback((p: number | null) => { if (!isSlotRef.current) storeSetLivePrice(p);  }, [storeSetLivePrice]);  // eslint-disable-line
  const setLiveOpen   = useCallback((p: number | null) => { if (!isSlotRef.current) storeSetLiveOpen(p);   }, [storeSetLiveOpen]);   // eslint-disable-line
  const setBarsLoaded = useCallback((v: boolean)        => { if (!isSlotRef.current) storeSetBarsLoaded(v); }, [storeSetBarsLoaded]); // eslint-disable-line

  // ── Chart API refs (mirror web's chartRef / mainRef) ──────────────────────
  const chartRef    = useRef<SkiaChartApiImpl | null>(null);
  const mainRef     = useRef<SkiaSeriesApiImpl<string> | null>(null);
  const priceLineRef = useRef<_IPriceLine | null>(null);
  const emaRefs     = useRef<Partial<Record<keyof IndicatorState, SkiaSeriesApiImpl<string>>>>({});
  const barsRef     = useRef<OHLCBar[]>([]);
  const mountedRef  = useRef(true);
  const [replayBarCount, setReplayBarCount] = useState(0);
  const livePxRef   = useRef<number | null>(null);

  // ── Zero-latency tick path (same as web) ───────────────────────────────────
  const tickDataRef     = useRef<{ price: number | null; open: number | null }>({ price: null, open: null });
  const statePendingRef = useRef(false);

  // ── Realtime bar buffer ────────────────────────────────────────────────────
  const pendingChartBarRef  = useRef<import("@/lib/realtimeTradeAggregator").AggBar | null>(null);
  const chartUpdateRafRef   = useRef<number | null>(null);
  const lastRenderMsRef     = useRef<number>(0);

  // ── EMA / VWAP incremental cache ──────────────────────────────────────────
  const emaPrevRef        = useRef<Partial<Record<keyof IndicatorState, number>>>({});
  const emaCurrRef        = useRef<Partial<Record<keyof IndicatorState, number>>>({});
  const vwapCumRef        = useRef({ cumPV: 0, cumV: 0 });
  const emaLastBarTimeRef = useRef<number | null>(null);

  // ── Market session ─────────────────────────────────────────────────────────
  const tickCountRef    = useRef(0);
  const lastTickTimeRef = useRef<number>(0);
  const isMarketOpenRef = useRef<boolean>(true);
  const { isOpen: mktIsOpen, type: mktType } = useMarketSession(symbol);
  isMarketOpenRef.current = mktIsOpen;

  // ── Trade aggregator ───────────────────────────────────────────────────────
  const tradeAggRef = useRef<RealtimeTradeAggregator | null>(null);

  // ── Viewport persistence debounce ──────────────────────────────────────────
  const vpSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Viewport tracking ──────────────────────────────────────────────────────
  const nearRealtimeRef     = useRef(true);
  const oldestBarTimeRef    = useRef<number | null>(null);
  const isLoadingMoreRef    = useRef(false);
  const hasMoreHistoryRef   = useRef(true);
  const loadMoreHistRef     = useRef<() => void>(() => {});
  const histLoadingRef      = useRef(false);
  const [histLoading, setHistLoading] = useState(false);

  // ── Canvas layout ──────────────────────────────────────────────────────────
  const [chartW, setChartW] = useState(0);
  const [chartH, setChartH] = useState(0);
  const chartWRef = useRef(0);
  const chartHRef = useRef(0);

  // ── Render trigger (increment to force canvas re-render) ──────────────────
  const [tick, setTick] = useState(0);
  const invalidate = useCallback(() => setTick(t => t + 1), []);

  // ── WS message bridge (tablet stub — replace when Phase 6 merges) ─────────
  const subscribeToMessages = _noopSubscribe;
  const sendMsgRef = useRef(_noopSend);

  // ── Stable refs for callbacks ──────────────────────────────────────────────
  const symRef  = useRef(symbol);
  const ivRef   = useRef(interval);
  const ctRef   = useRef(chartType);
  const indRef  = useRef(indicators);
  symRef.current  = symbol;
  ivRef.current   = interval;
  ctRef.current   = chartType;
  indRef.current  = indicators;

  const lineClrRef = useRef(settings?.priceLabelLineColor ?? "rgba(255,255,255,0.4)");
  lineClrRef.current = settings?.priceLabelLineColor ?? "rgba(255,255,255,0.4)";

  // ── ChartContext value ─────────────────────────────────────────────────────
  const [chartCtx, setChartCtx] = useState<{ chart: SkiaChartApiImpl; candle: SkiaSeriesApiImpl<string> } | null>(null);

  // ── Gesture shared values ──────────────────────────────────────────────────
  // panStartFrom/To: snapshot at gesture start for stable delta calculation.
  const panStartFrom  = useSharedValue(0);
  const panStartTo    = useSharedValue(DEFAULT_VISIBLE_BARS);
  const pinchStartBarsVis = useSharedValue(DEFAULT_VISIBLE_BARS);
  const pinchStartFocalX  = useSharedValue(0);

  // ── scheduleChartUpdate ────────────────────────────────────────────────────
  const scheduleChartUpdate = useCallback(() => {
    if (sheetDragState.active) return;
    if (chartUpdateRafRef.current !== null) return;
    chartUpdateRafRef.current = requestAnimationFrame(() => {
      chartUpdateRafRef.current = null;
      if (!mountedRef.current) return;
      const b = pendingChartBarRef.current;
      const s = mainRef.current;
      if (!b || !s) return;
      lastRenderMsRef.current = Date.now();
      pendingChartBarRef.current = null;
      const lastTime = barsRef.current[barsRef.current.length - 1]?.time ?? 0;
      updateBarOnSeries(s, ctRef.current, b, lastTime);
    });
  }, []);

  useEffect(() => {
    sheetDragState.flush = scheduleChartUpdate;
    return () => { if (sheetDragState.flush === scheduleChartUpdate) sheetDragState.flush = null; };
  }, [scheduleChartUpdate]);

  // ── Price line helper ──────────────────────────────────────────────────────
  const doUpdatePriceLine = useCallback((price: number, _sym: string, series?: SkiaSeriesApiImpl<string> | null) => {
    const cs = series ?? mainRef.current;
    if (!cs) return;
    if (priceLineRef.current) {
      try { priceLineRef.current.applyOptions({ price, color: lineClrRef.current }); return; }
      catch { priceLineRef.current = null; }
    }
    try {
      priceLineRef.current = cs.createPriceLine({
        price, color: lineClrRef.current, lineWidth: 1, lineStyle: LineStyle.Dashed,
        axisLabelVisible: false, title: "",
      });
    } catch { /* ok */ }
  }, []);

  // ── Indicator fill (same algorithm as web) ─────────────────────────────────
  const fillIndicator = useCallback((s: SkiaSeriesApiImpl<string>, key: keyof IndicatorState, bars: OHLCBar[]) => {
    if (bars.length === 0) return;
    const closes = bars.map(b => b.close);
    const values = key === "vwap" ? calcVWAP(bars) : calcEMA(closes, EMA_PERIODS[key]);
    const data = bars
      .map((b, i) => values[i] !== null ? { time: b.time, value: values[i] as number } : null)
      .filter(Boolean) as Array<{ time: number; value: number }>;
    if (data.length > 0) s.setData(data);
    const n = bars.length;
    if (n >= 2) {
      if (key === "vwap") {
        let cumPV = 0, cumV = 0;
        for (let i = 0; i < n - 1; i++) {
          const b = bars[i]; const tp = (b.high + b.low + b.close) / 3;
          cumPV += tp * b.volume; cumV += b.volume;
        }
        vwapCumRef.current = { cumPV, cumV };
      } else {
        const prev = values[n - 2]; const curr = values[n - 1];
        if (prev != null) emaPrevRef.current[key] = prev as number;
        if (curr != null) emaCurrRef.current[key] = curr as number;
      }
    }
    if (n > 0) emaLastBarTimeRef.current = bars[n - 1].time;
  }, []);

  // ── Infinite history loader ────────────────────────────────────────────────
  const loadMoreHistory = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreHistoryRef.current) return;
    const oldestTime = oldestBarTimeRef.current;
    if (!oldestTime) return;
    const sym = symRef.current; const iv = ivRef.current;
    isLoadingMoreRef.current = true;
    histLoadingRef.current = true;
    setHistLoading(true);
    try {
      const resp = await fetch(`${getApiBase()}/api/candles/${sym}/${iv}?before=${oldestTime}`);
      if (!resp.ok || !mountedRef.current) return;
      if (symRef.current !== sym || ivRef.current !== iv) return;
      const newBars: OHLCBar[] = await resp.json();
      if (!Array.isArray(newBars) || newBars.length < 2) {
        hasMoreHistoryRef.current = false; return;
      }
      const existing = barsRef.current;
      const earliestExisting = existing[0]?.time ?? Infinity;
      const fresh = newBars.filter(b => b.time < earliestExisting);
      if (fresh.length === 0) { hasMoreHistoryRef.current = false; return; }
      const merged = [...new Map([...fresh, ...existing].map(b => [b.time, b])).values()].sort((a, b) => a.time - b.time);
      const numAdded = merged.length - existing.length;
      if (numAdded <= 0) { hasMoreHistoryRef.current = false; return; }
      if (merged.length >= MAX_TOTAL_BARS) hasMoreHistoryRef.current = false;
      barsRef.current          = merged;
      oldestBarTimeRef.current = merged[0].time;
      const chart = chartRef.current; const series = mainRef.current;
      if (!chart || !series || !mountedRef.current) return;
      const beforeRange = chart.timeScale().getVisibleLogicalRange();
      applyBarsToSeries(series, ctRef.current, merged);
      for (const [key, s] of Object.entries(emaRefs.current) as [keyof IndicatorState, SkiaSeriesApiImpl<string>][]) {
        fillIndicator(s, key, merged);
      }
      if (beforeRange) {
        requestAnimationFrame(() => {
          if (!mountedRef.current) return;
          try {
            chart.timeScale().setVisibleLogicalRange({
              from: (beforeRange.from as number) + numAdded,
              to:   (beforeRange.to   as number) + numAdded,
            });
          } catch { /* ok */ }
        });
      }
    } catch (err) {
      console.warn("[loadMoreHistory] fetch error:", err);
    } finally {
      isLoadingMoreRef.current = false;
      histLoadingRef.current   = false;
      setHistLoading(false);
    }
  }, [fillIndicator]);

  loadMoreHistRef.current = loadMoreHistory;

  // ── Chart init (creates SkiaChartApiImpl on first layout) ─────────────────
  const initChart = useCallback((w: number, h: number) => {
    if (chartRef.current) {
      // Subsequent layout change — just resize
      chartRef.current._setChartSize(w, h);
      mainRef.current?._coordRef && Object.assign(mainRef.current._coordRef, { chartH: h });
      invalidate();
      return;
    }
    const lastIdx  = barsRef.current.length - 1;
    const initFrom = Math.max(0, lastIdx - DEFAULT_VISIBLE_BARS + 1);
    const initTo   = lastIdx >= 0 ? lastIdx + MIN_FUTURE_BARS : DEFAULT_VISIBLE_BARS;

    const chart = new SkiaChartApiImpl(initFrom, initTo, w, h, barsRef, invalidate);
    chartRef.current  = chart;
    chartApiRef.current = chart as unknown as IChartApi;

    const main = makeSeries(chart, ctRef.current);
    mainRef.current = main;

    // Subscribe to range changes for near-realtime tracking + history loading
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      const lastIdx2 = barsRef.current.length - 1;
      nearRealtimeRef.current = lastIdx2 < 0 || (range.to as number) >= lastIdx2 - 3;
      if ((range.from as number) < HISTORY_PREFETCH_BARS &&
          !isLoadingMoreRef.current && hasMoreHistoryRef.current) {
        void loadMoreHistRef.current();
      }
      // Debounced save
      if (vpSaveTimerRef.current) clearTimeout(vpSaveTimerRef.current);
      vpSaveTimerRef.current = setTimeout(() => {
        void saveViewport(symRef.current, ivRef.current, range.from, range.to, getPanRange());
      }, 600);
    });

    // Subscribe pan range for indicator series autoscale coordination
    const unsubPan = subscribePanRange(() => invalidate());
    // Store unsub so we can clean up on unmount
    (chart as any)._unsubPan = unsubPan;

    setChartCtx({ chart, candle: main });
  }, [invalidate]); // eslint-disable-line

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const w = Math.floor(width);
    const h = Math.floor(height);
    if (w === chartWRef.current && h === chartHRef.current) return;
    chartWRef.current = w; chartHRef.current = h;
    setChartW(w); setChartH(h);
    initChart(w, h);
  }, [initChart]);

  // ── Settings reactivity ────────────────────────────────────────────────────
  useEffect(() => {
    if (!settings || !mainRef.current) return;
    mainRef.current.applyOptions({
      color:     settings.upColor || UP_COLOR,
      downColor: settings.downColor,
    });
    invalidate();
  }, [settings, invalidate]);

  // ── chartType change ───────────────────────────────────────────────────────
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const chart = chartRef.current; const old = mainRef.current;
    if (!chart || !old) return;
    priceLineRef.current = null;
    chart.removeSeries(old);
    const newS = makeSeries(chart, chartType);
    mainRef.current = newS;
    const bars = barsRef.current;
    if (bars.length > 0) {
      const savedRange = chart.timeScale().getVisibleLogicalRange();
      applyBarsToSeries(newS, chartType, bars);
      if (savedRange) {
        try { chart.timeScale().setVisibleLogicalRange(savedRange); } catch { /* ok */ }
      }
      const last = bars[bars.length - 1];
      if (last) {
        livePxRef.current = last.close;
        setLivePrice(last.close); setLiveOpen(last.open);
        doUpdatePriceLine(last.close, symRef.current, newS);
      }
    }
    setChartCtx({ chart, candle: newS });
  }, [chartType]); // eslint-disable-line

  // ── Indicator series sync ──────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const bars = barsRef.current;
    const keys: (keyof IndicatorState)[] = ["ema9","ema21","ema50","ema200","vwap"];
    for (const key of keys) {
      const enabled  = indicators[key];
      const existing = emaRefs.current[key];
      if (enabled && !existing) {
        const s = chart.addSeries(LineSeries, { color: EMA_COLORS[key], lineWidth: 1 });
        emaRefs.current[key] = s;
        fillIndicator(s, key, bars);
      } else if (!enabled && existing) {
        chart.removeSeries(existing);
        delete emaRefs.current[key];
      }
    }
  }, [indicators, fillIndicator]);

  // ── applyBarArray (shared by cache-hit and fresh fetch) ───────────────────
  const applyBarArray = useCallback((bars: OHLCBar[], sym: string, iv: string) => {
    const safeBars = safeSortDedup(bars);
    pendingChartBarRef.current = null;
    if (chartUpdateRafRef.current !== null) {
      cancelAnimationFrame(chartUpdateRafRef.current);
      chartUpdateRafRef.current = null;
    }
    barsRef.current = safeBars;
    oldestBarTimeRef.current  = safeBars[0]?.time ?? null;
    hasMoreHistoryRef.current = true;
    isLoadingMoreRef.current  = false;

    const chart = chartRef.current; const oldSeries = mainRef.current;
    if (!chart || !oldSeries) return;

    priceLineRef.current = null;
    chart.removeSeries(oldSeries);
    const cs = makeSeries(chart, ctRef.current);
    mainRef.current = cs;

    chart.priceScale("right").applyOptions({ autoScale: true, scaleMargins: { top: SCALE_MARGIN_TOP, bottom: SCALE_MARGIN_BOT } });
    applyBarsToSeries(cs, ctRef.current, safeBars);

    const last = safeBars[safeBars.length - 1];
    if (last) {
      livePxRef.current = last.close;
      tickDataRef.current = { price: last.close, open: last.open };
      setLivePrice(last.close); setLiveOpen(last.open);
      doUpdatePriceLine(last.close, sym, cs);
      tradeAggRef.current?.seed(last);
    }

    for (const [key, s] of Object.entries(emaRefs.current) as [keyof IndicatorState, SkiaSeriesApiImpl<string>][]) {
      fillIndicator(s, key, safeBars);
    }
    activatePanRange(null);

    const lastBarIdx = safeBars.length - 1;
    const vpKey      = `tv_vp_${sym}_${iv}`;
    const defaultRange = { from: Math.max(0, lastBarIdx - DEFAULT_VISIBLE_BARS + 1), to: lastBarIdx + MIN_FUTURE_BARS };

    // Restore saved viewport (async, but set default immediately)
    chart.timeScale().setVisibleLogicalRange(defaultRange);
    nearRealtimeRef.current = true;

    loadViewport(sym, iv).then(saved => {
      if (!saved || !mountedRef.current) return;
      const wasNearRealtime = saved.to >= lastBarIdx - 5;
      if (wasNearRealtime) {
        const savedWidth = saved.to - saved.from;
        const adjustedTo = lastBarIdx + MIN_FUTURE_BARS;
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, adjustedTo - savedWidth), to: adjustedTo });
      } else if (lastBarIdx - saved.to < DEFAULT_VISIBLE_BARS * 3) {
        chart.timeScale().setVisibleLogicalRange({ from: saved.from, to: saved.to });
      }
      if (saved.priceMin !== undefined && saved.priceMax !== undefined) {
        activatePanRange({ lo: saved.priceMin, hi: saved.priceMax });
        cs.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: saved.priceMin!, maxValue: saved.priceMax! } }) });
      }
    });

    setChartCtx({ chart, candle: cs });
  }, [setLivePrice, setLiveOpen, doUpdatePriceLine, fillIndicator]); // eslint-disable-line

  // ── loadCandles ────────────────────────────────────────────────────────────
  const loadCandles = useCallback(async (sym: string, iv: string) => {
    const t0 = Date.now();
    const cached = getCachedCandles(sym, iv);
    if (cached && cached.length > 0) {
      applyBarArray(cached, sym, iv);
      setBarsLoaded(true);
    } else {
      setBarsLoaded(false);
    }
    try {
      const resp = await fetch(`${getApiBase()}/api/candles/${sym}/${iv}`);
      if (!resp.ok || !mountedRef.current) return;
      const raw: OHLCBar[] = await resp.json();
      if (!mountedRef.current || !Array.isArray(raw) || raw.length === 0) return;
      const bars = [...new Map(raw.map(b => [b.time, b])).values()].sort((a, b) => a.time - b.time);
      setCachedCandles(sym, iv, bars);
      console.debug(`[PERF] candles ${sym}/${iv}: ${Date.now() - t0}ms (${bars.length} bars)`);
      const lastCached = cached?.[cached.length - 1];
      const lastFresh  = bars[bars.length - 1];
      const sameData   = lastCached && lastFresh &&
        lastCached.time === lastFresh.time && lastCached.close === lastFresh.close;
      if (!sameData) applyBarArray(bars, sym, iv);
      setBarsLoaded(true);
    } catch (err) {
      console.error("[CustomChart] loadCandles error:", err);
    }
  }, [setBarsLoaded, applyBarArray]); // eslint-disable-line

  useEffect(() => {
    if (replayBars != null) return;
    void loadCandles(symbol, interval);
  }, [symbol, interval, replayBars, loadCandles]);

  // ── Replay bars ────────────────────────────────────────────────────────────
  const prevReplayLenRef = useRef(0);
  useEffect(() => {
    if (replayBars == null) { prevReplayLenRef.current = 0; setReplayBarCount(0); return; }
    const cs = mainRef.current; if (!cs) return;
    const prevLen = prevReplayLenRef.current;
    prevReplayLenRef.current = replayBars.length;
    if (replayBars.length === 0) return;
    if (prevLen > 0 && replayBars.length === prevLen + 1) {
      const newBar = replayBars[replayBars.length - 1];
      updateBarOnSeries(cs, ctRef.current, newBar);
      for (const [key, s] of Object.entries(emaRefs.current) as [keyof IndicatorState, SkiaSeriesApiImpl<string>][]) {
        const closes = replayBars.map(b => b.close);
        const vals   = key === "vwap" ? calcVWAP(replayBars) : calcEMA(closes, EMA_PERIODS[key]);
        const lastVal = vals[vals.length - 1];
        if (lastVal !== null && lastVal !== undefined) s.update({ time: newBar.time, value: lastVal });
      }
    } else {
      applyBarsToSeries(cs, ctRef.current, replayBars);
      if (prevLen === 0) chartRef.current?.timeScale().fitContent();
      for (const [key, s] of Object.entries(emaRefs.current) as [keyof IndicatorState, SkiaSeriesApiImpl<string>][]) {
        fillIndicator(s, key, replayBars);
      }
    }
    barsRef.current = replayBars;
    setReplayBarCount(replayBars.length);
    const last = replayBars[replayBars.length - 1];
    if (last) {
      livePxRef.current = last.close;
      setLivePrice(last.close); setLiveOpen(last.open);
      doUpdatePriceLine(last.close, symRef.current, cs);
    }
    setBarsLoaded(true);
  }, [replayBars, setLivePrice, setLiveOpen, doUpdatePriceLine, fillIndicator, setBarsLoaded]);

  // ── Live WS candle updates ─────────────────────────────────────────────────
  useEffect(() => {
    if (replayBars != null) return;
    return subscribeToMessages((raw: unknown) => {
      const msg = raw as ChartMsg;
      if (msg.type === "welcome") {
        sendMsgRef.current({ type: "subscribe_candles", symbol: symRef.current, interval: ivRef.current });
        return;
      }
      if (msg.type === "tick" || msg.type === "ctrader_tick") {
        const t = msg as unknown as { symbol?: string; price?: number; volume?: number; timestamp?: number };
        if (!t.symbol || t.symbol !== symRef.current || typeof t.price !== "number") return;
        if (!isMarketOpenRef.current) return;
        const agg = tradeAggRef.current; if (!agg) return;
        const price  = t.price;
        const volume = t.volume ?? 1;
        const tsSec  = t.timestamp != null ? toSec(t.timestamp) : Math.floor(Date.now() / 1000);
        if (!Number.isFinite(price) || price <= 0) return;
        if (!Number.isFinite(tsSec) || tsSec < 1_000_000_000 || tsSec > Date.now() / 1000 + 300) return;
        const prevTickBarTime = barsRef.current[barsRef.current.length - 1]?.time ?? 0;
        const result = agg.ingest(price, volume, tsSec); if (!result) return;
        const { bar } = result;
        const cs = mainRef.current; if (!cs) return;
        pendingChartBarRef.current = bar;
        scheduleChartUpdate();
        if (bar.time > prevTickBarTime && nearRealtimeRef.current) {
          const ch = chartRef.current;
          if (ch) {
            requestAnimationFrame(() => {
              const range = ch.timeScale().getVisibleLogicalRange();
              if (!range) return;
              const estIdx = barsRef.current.length;
              const width  = (range.to as number) - (range.from as number);
              try { ch.timeScale().setVisibleLogicalRange({ from: estIdx - width + MIN_FUTURE_BARS, to: estIdx + MIN_FUTURE_BARS }); } catch { /* ok */ }
            });
          }
        }
        tickCountRef.current++;
        lastTickTimeRef.current = Date.now();
        tickDataRef.current.price = bar.close;
        tickDataRef.current.open  = bar.open;
        if (!statePendingRef.current) {
          statePendingRef.current = true;
          requestAnimationFrame(() => {
            statePendingRef.current = false;
            if (!mountedRef.current) return;
            const d = tickDataRef.current;
            setLiveOpen(d.open);
            if (d.price !== null && d.price !== livePxRef.current) {
              livePxRef.current = d.price;
              setLivePrice(d.price);
              doUpdatePriceLine(d.price, symRef.current);
            }
          });
        }
        return;
      }
      if (msg.type !== "candle_update" || msg.symbol !== symRef.current || msg.interval !== ivRef.current || !msg.bar) return;
      if (!isMarketOpenRef.current) return;
      const bar = msg.bar; const cs = mainRef.current; if (!cs) return;
      const agg = tradeAggRef.current;
      const aggCurrentBar = agg?.getCurrentBar();
      const liveOpenVal: number = (aggCurrentBar && aggCurrentBar.time === bar.time) ? aggCurrentBar.open : bar.open;
      const barForChart = liveOpenVal !== bar.open ? { ...bar, open: liveOpenVal } : bar;
      const stored   = barsRef.current;
      const lastTime = stored.length > 0 ? stored[stored.length - 1].time : 0;
      const isNewBar = bar.time !== emaLastBarTimeRef.current;
      if (!Number.isFinite(bar.time) || bar.time <= 0) {
        console.warn(`[Chart] candle_update: invalid bar.time — discarded`);
      } else if (bar.time >= lastTime) {
        if (stored.length > 0 && stored[stored.length - 1].time === bar.time) stored[stored.length - 1] = barForChart;
        else { stored.push(barForChart); if (stored.length > 6000) stored.shift(); }
      }
      pendingChartBarRef.current = barForChart;
      scheduleChartUpdate();
      if (isNewBar && nearRealtimeRef.current) {
        const ch = chartRef.current;
        if (ch) {
          requestAnimationFrame(() => {
            const range = ch.timeScale().getVisibleLogicalRange();
            if (!range) return;
            const latestIdx = barsRef.current.length - 1;
            const width     = (range.to as number) - (range.from as number);
            try { ch.timeScale().setVisibleLogicalRange({ from: latestIdx - width + MIN_FUTURE_BARS, to: latestIdx + MIN_FUTURE_BARS }); } catch { /* ok */ }
          });
        }
      }
      if (isNewBar) {
        for (const key of Object.keys(emaRefs.current) as (keyof IndicatorState)[]) {
          if (key !== "vwap") emaPrevRef.current[key] = emaCurrRef.current[key];
        }
        if (emaRefs.current.vwap) {
          const closedBar = stored[stored.length - 2];
          if (closedBar) {
            const tp = (closedBar.high + closedBar.low + closedBar.close) / 3;
            vwapCumRef.current.cumPV += tp * closedBar.volume;
            vwapCumRef.current.cumV  += closedBar.volume;
          }
        }
        emaLastBarTimeRef.current = bar.time;
      }
      for (const [key, s] of Object.entries(emaRefs.current) as [keyof IndicatorState, SkiaSeriesApiImpl<string>][]) {
        let val: number | undefined;
        if (key === "vwap") {
          const tp = (bar.high + bar.low + bar.close) / 3;
          const cv = vwapCumRef.current.cumV + bar.volume;
          val = cv > 0 ? (vwapCumRef.current.cumPV + tp * bar.volume) / cv : undefined;
        } else {
          const prev = emaPrevRef.current[key];
          if (prev !== undefined) {
            const k = 2 / (EMA_PERIODS[key] + 1);
            const ema = bar.close * k + prev * (1 - k);
            emaCurrRef.current[key] = ema; val = ema;
          }
        }
        if (val !== undefined) s.update({ time: bar.time, value: val });
      }
      tickDataRef.current.price = bar.close;
      tickDataRef.current.open  = liveOpenVal;
      if (!statePendingRef.current) {
        statePendingRef.current = true;
        requestAnimationFrame(() => {
          statePendingRef.current = false;
          if (!mountedRef.current) return;
          const d = tickDataRef.current;
          setLiveOpen(d.open);
          if (d.price !== null && d.price !== livePxRef.current) {
            livePxRef.current = d.price; setLivePrice(d.price); doUpdatePriceLine(d.price, symRef.current);
          }
        });
      }
    });
  }, [subscribeToMessages, setLivePrice, setLiveOpen, doUpdatePriceLine, replayBars, scheduleChartUpdate]);

  // ── Per-client candle subscription + fresh aggregator ─────────────────────
  useEffect(() => {
    if (replayBars != null) return;
    tradeAggRef.current = new RealtimeTradeAggregator(interval);
    sendMsgRef.current({ type: "subscribe_candles", symbol, interval });
  }, [symbol, interval, replayBars]);

  // ── Unmount cleanup ────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (vpSaveTimerRef.current) clearTimeout(vpSaveTimerRef.current);
      if (chartUpdateRafRef.current) cancelAnimationFrame(chartUpdateRafRef.current);
      const chart = chartRef.current;
      if (chart) {
        (chart as any)._unsubPan?.();
        chart.remove();
        chartRef.current  = null;
        mainRef.current   = null;
        emaRefs.current   = {};
        priceLineRef.current = null;
        chartApiRef.current  = null;
      }
      resetCrosshair();
      setChartCtx(null);
    };
  }, []); // eslint-disable-line

  // ── Gesture handlers (JS thread pan + pinch + double-tap) ─────────────────
  //
  // Horizontal pan: shift logicalFrom/To by dx/barW bars per frame.
  // Vertical pan  : call activatePanRange + autoscaleInfoProvider override.
  // Pinch zoom    : scale barsVisible around the focal point.
  // Double-tap    : fitContent().

  type PanState = {
    logFrom:     number;
    logTo:       number;
    panMin:      number | null;
    panMax:      number | null;
    pricePerPx:  number | null;
    panActivated:boolean;
    lastX:       number;
    lastY:       number;
  };
  const panStateRef = useRef<PanState | null>(null);
  const lastDoubleTapRef = useRef(0);

  const handlePanStart = useCallback((translateX: number, translateY: number) => {
    const chart = chartRef.current;
    const series = mainRef.current;
    const range = chart?.timeScale().getVisibleLogicalRange();
    if (!range) return;
    panStartFrom.value = range.from;
    panStartTo.value   = range.to;
    panStateRef.current = {
      logFrom:      range.from,
      logTo:        range.to,
      panMin:       null,
      panMax:       null,
      pricePerPx:   null,
      panActivated: false,
      lastX:        translateX,
      lastY:        translateY,
    };
    // Disable autoScale for the duration of the gesture
    try { chart?.priceScale("right").applyOptions({ autoScale: false }); } catch { /* ok */ }
  }, [panStartFrom, panStartTo]);

  const handlePanUpdate = useCallback((translateX: number, translateY: number) => {
    const chart  = chartRef.current;
    const series = mainRef.current;
    const ps     = panStateRef.current;
    if (!chart || !ps) return;

    const dx = translateX - ps.lastX;
    const dy = translateY - ps.lastY;
    ps.lastX = translateX;
    ps.lastY = translateY;

    // ── Horizontal pan ──────────────────────────────────────────────────────
    if (Math.abs(dx) > 0) {
      const barsVis = ps.logTo - ps.logFrom;
      if (chartWRef.current > 0 && barsVis > 0) {
        const pxPerBar = chartWRef.current / barsVis;
        const shift    = dx / pxPerBar;
        ps.logFrom    -= shift;
        ps.logTo      -= shift;
        try {
          chart.timeScale().setVisibleLogicalRange({ from: ps.logFrom, to: ps.logTo });
        } catch { /* ok */ }
      }
    }

    // ── Vertical pan ───────────────────────────────────────────────────────
    if (Math.abs(dy) > 0 && series) {
      if (ps.panMin === null) {
        const h = chartHRef.current || 1;
        try {
          const sTop = series.coordinateToPrice(0);
          const sBot = series.coordinateToPrice(h);
          if (sTop !== null && sBot !== null && isFinite(sTop) && isFinite(sBot) && sTop !== sBot) {
            const sMax = Math.max(sTop, sBot); const sMin = Math.min(sTop, sBot);
            const span = sMax - sMin;
            ps.panMax    = sMax - SCALE_MARGIN_TOP * span;
            ps.panMin    = sMin + SCALE_MARGIN_BOT * span;
            ps.pricePerPx = span / h;
          }
        } catch { /* ok */ }
      }
      if (ps.panMin !== null && ps.panMax !== null && ps.pricePerPx !== null) {
        const isFirst = !ps.panActivated;
        if (isFirst) ps.panActivated = true;
        const shift = dy * ps.pricePerPx;
        ps.panMin += shift; ps.panMax += shift;
        const lo = ps.panMin, hi = ps.panMax;
        if (isFirst) {
          try { chart.priceScale("right").applyOptions({ autoScale: true }); } catch { /* ok */ }
          activatePanRange({ lo, hi });
        } else {
          updatePanRange(lo, hi);
        }
        try {
          series.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: lo, maxValue: hi } }) });
        } catch { /* ok */ }
      }
    }
    invalidate();
  }, [invalidate]);

  const handlePanEnd = useCallback((velocityX: number, velocityY: number) => {
    const chart  = chartRef.current;
    const series = mainRef.current;
    const ps     = panStateRef.current;

    // Restore autoScale if no vertical pan happened
    if (!ps?.panActivated) {
      try { chart?.priceScale("right").applyOptions({ autoScale: true }); } catch { /* ok */ }
    } else {
      // Touch kinetic coast (simplified — TradingView style)
      if (Math.abs(velocityY) > 100 && ps && series) {
        const FRICTION = 0.88; const MIN_PX = 0.12;
        let vel = velocityY / 60; let pMin = ps.panMin!; let pMax = ps.panMax!;
        const ppp = ps.pricePerPx!;
        const coast = () => {
          if (Math.abs(vel) < MIN_PX) {
            try { series.applyOptions({ autoscaleInfoProvider: () => null }); } catch { /* ok */ }
            activatePanRange(null);
            return;
          }
          const s = vel * ppp; pMin += s; pMax += s;
          updatePanRange(pMin, pMax);
          try { series.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: pMin, maxValue: pMax } }) }); } catch { return; }
          vel *= FRICTION;
          requestAnimationFrame(coast);
        };
        requestAnimationFrame(coast);
      } else {
        try { series?.applyOptions({ autoscaleInfoProvider: () => null }); } catch { /* ok */ }
        activatePanRange(null);
      }
    }
    panStateRef.current = null;
    invalidate();
  }, [invalidate]);

  type PinchState = { startBars: number; startFocalX: number; prevScale: number };
  const pinchStateRef = useRef<PinchState | null>(null);

  const handlePinchStart = useCallback((scale: number, focalX: number) => {
    const chart = chartRef.current;
    const range = chart?.timeScale().getVisibleLogicalRange();
    if (!range) return;
    const barsVis = (range.to as number) - (range.from as number);
    pinchStateRef.current = { startBars: barsVis, startFocalX: focalX, prevScale: scale };
  }, []);

  const handlePinchUpdate = useCallback((scale: number, focalX: number) => {
    const chart = chartRef.current;
    const ps    = pinchStateRef.current;
    const range = chart?.timeScale().getVisibleLogicalRange();
    if (!chart || !ps || !range) return;

    // Incremental zoom ratio (same algorithm as web pinchZoom)
    const currentBars = (range.to as number) - (range.from as number);
    const ratio    = ps.prevScale / scale;
    const newBars  = Math.max(3, Math.min(500_000, currentBars * ratio));
    ps.prevScale   = scale;
    if (newBars === currentBars) return;

    // Anchor: focal point in logical bar space
    const anchor = chart.timeScale().coordinateToLogical(focalX)
      ?? ((range.from as number) + (range.to as number)) / 2;
    const leftFrac = (anchor - (range.from as number)) / currentBars;
    const newFrom  = anchor - newBars * leftFrac;
    const newTo    = newFrom + newBars;
    try { chart.timeScale().setVisibleLogicalRange({ from: newFrom, to: newTo }); } catch { /* ok */ }
    invalidate();
  }, [invalidate]);

  const handlePinchEnd = useCallback(() => {
    pinchStateRef.current = null;
  }, []);

  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastDoubleTapRef.current < 350) {
      chartRef.current?.timeScale().fitContent();
      invalidate();
    }
    lastDoubleTapRef.current = now;
  }, [invalidate]);

  // ── RNGH Gestures ─────────────────────────────────────────────────────────
  const panGesture = useMemo(() => Gesture.Pan()
    .minDistance(3)
    .onStart(e => { runOnJS(handlePanStart)(e.translationX, e.translationY); })
    .onUpdate(e => { runOnJS(handlePanUpdate)(e.translationX, e.translationY); })
    .onEnd(e   => { runOnJS(handlePanEnd)(e.velocityX, e.velocityY); }),
  [handlePanStart, handlePanUpdate, handlePanEnd]);

  const pinchGesture = useMemo(() => Gesture.Pinch()
    .onStart(e => { runOnJS(handlePinchStart)(e.scale, e.focalX); })
    .onUpdate(e => { runOnJS(handlePinchUpdate)(e.scale, e.focalX); })
    .onEnd(()  => { runOnJS(handlePinchEnd)(); }),
  [handlePinchStart, handlePinchUpdate, handlePinchEnd]);

  const tapGesture = useMemo(() => Gesture.Tap()
    .onEnd(() => { runOnJS(handleDoubleTap)(); }),
  [handleDoubleTap]);

  const composed = useMemo(() =>
    Gesture.Simultaneous(Gesture.Race(panGesture, pinchGesture), tapGesture),
  [panGesture, pinchGesture, tapGesture]);

  // ── Canvas rendering ───────────────────────────────────────────────────────
  const bars     = barsRef.current;
  const chart    = chartRef.current;
  const series   = mainRef.current;

  const logFrom  = chart?._getFrom()  ?? 0;
  const logTo    = chart?._getTo()    ?? DEFAULT_VISIBLE_BARS;
  const barsVis  = logTo - logFrom;
  const barW     = barsVis > 0 && chartW > 0 ? (chartW - PRICE_AXIS_W) / barsVis : 0;
  const plotW    = chartW - PRICE_AXIS_W;
  const plotH    = chartH - TIME_AXIS_H;

  // Compute display price range
  const displayRange = useMemo(() => {
    if (plotH <= 0 || bars.length === 0) return { min: 0, max: 100 };
    return computeDisplayRange(
      bars, logFrom, logTo,
      null,
      series?._getAutoscaleProvider(),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, logFrom, logTo, plotH, bars.length]);

  const { min: displayMin, max: displayMax } = displayRange;

  // Sync coord ref on series so priceToCoordinate / coordinateToPrice work
  if (series) {
    Object.assign(series._coordRef, {
      logFrom, logTo, chartH: plotH, displayMin, displayMax,
    });
  }

  // Price axis labels
  const priceLabels = useMemo(() =>
    generatePriceLabels(displayMin, displayMax, plotH, symbol),
  [displayMin, displayMax, plotH, symbol]);

  // Time axis labels
  const timeLabels = useMemo(() =>
    generateTimeLabels(bars, logFrom, logTo, barW, plotW, interval),
  [bars, logFrom, logTo, barW, plotW, interval]);

  // Visible candle slice
  const iFrom = Math.max(0, Math.floor(logFrom));
  const iTo   = Math.min(bars.length - 1, Math.ceil(logTo));

  // Chart theme from settings
  const upCol   = settings?.upColor    ?? UP_COLOR;
  const downCol = settings?.downColor  ?? DOWN_COLOR;
  const upWick  = settings?.upWickColor   ?? UP_WICK;
  const downWick2 = settings?.downWickColor ?? DOWN_WICK;
  const bgColor   = settings?.bgColor   ?? CHART_BG;

  // Build EMA line paths for visible range
  const emaLinePaths = useMemo(() => {
    if (barW <= 0 || plotH <= 0) return {};
    const result: Record<string, ReturnType<typeof Skia.Path.Make>> = {};
    for (const [key, s] of Object.entries(emaRefs.current) as [keyof IndicatorState, SkiaSeriesApiImpl<string>][]) {
      const data = s._getData();
      if (data.length < 2) continue;
      const path = Skia.Path.Make();
      let started = false;
      for (const pt of data) {
        const idx = bars.findIndex(b => b.time === pt.time);
        if (idx < iFrom - 1 || idx > iTo + 1) continue;
        const x = barIdxToX(idx, logFrom, barW);
        const y = priceToY(pt.value as number, displayMin, displayMax, plotH);
        if (!started) { path.moveTo(x, y); started = true; }
        else            path.lineTo(x, y);
      }
      if (started) result[key] = path;
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, iFrom, iTo, logFrom, barW, displayMin, displayMax, plotH]);

  // Price lines (dashed horizontal)
  const priceLinesData = series?._getPriceLines() ?? [];

  const chartBarsCtxValue = useMemo(
    () => ({ barsRef, replayBarCount }),
    [replayBarCount],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ChartBarsContext.Provider value={chartBarsCtxValue}>
      <ChartContext.Provider value={(chartCtx ?? { chart: null, candle: null }) as ChartContextValue}>
        <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
          <GestureDetector gesture={composed}>
            <View style={StyleSheet.absoluteFill}>
              {/* ── Skia canvas: candles + indicators + grid ── */}
              <Canvas style={{ position: "absolute", left: 0, top: 0, width: plotW, height: plotH }}>
                {/* Background */}
                <Fill color={bgColor} />

                {/* Grid lines (horizontal price) */}
                {priceLabels.map(({ price, y }) => (
                  <Line
                    key={price}
                    p1={vec(0, y)}
                    p2={vec(plotW, y)}
                    color={GRID_COLOR}
                    strokeWidth={0.5}
                  />
                ))}

                {/* Candles */}
                <Group>
                  {bars.slice(iFrom, iTo + 1).map((bar, idx) => {
                    const barIdx = iFrom + idx;
                    if (barIdx < 0 || barIdx >= bars.length) return null;
                    const x = barIdxToX(barIdx, logFrom, barW);
                    if (x < -barW || x > plotW + barW) return null;

                    const isLine   = chartType === "line" || chartType === "line_with_markers" || chartType === "area";
                    if (isLine) return null; // line types rendered via indicator path below

                    const bull     = bar.close >= bar.open;
                    const bodyColor  = bull ? upCol   : downCol;
                    const wickColor  = bull ? upWick  : downWick2;
                    const bodyTop    = Math.min(priceToY(bar.open, displayMin, displayMax, plotH), priceToY(bar.close, displayMin, displayMax, plotH));
                    const bodyBot    = Math.max(priceToY(bar.open, displayMin, displayMax, plotH), priceToY(bar.close, displayMin, displayMax, plotH));
                    const bodyH      = Math.max(1, bodyBot - bodyTop);
                    const bodyX      = x - barW * 0.4;
                    const bodyWid    = Math.max(1, barW * 0.8);
                    const wickW      = Math.max(1, barW * 0.12);
                    const highY      = priceToY(bar.high, displayMin, displayMax, plotH);
                    const lowY       = priceToY(bar.low,  displayMin, displayMax, plotH);

                    return (
                      <Group key={bar.time}>
                        {/* Wick */}
                        <Line p1={vec(x, highY)} p2={vec(x, lowY)} color={wickColor} strokeWidth={wickW} />
                        {/* Body */}
                        <Rect x={bodyX} y={bodyTop} width={bodyWid} height={bodyH} color={bodyColor} />
                      </Group>
                    );
                  })}
                </Group>

                {/* Line / area chart types — draw as a single path */}
                {(chartType === "line" || chartType === "line_with_markers" || chartType === "area") && (() => {
                  const data = series?._getData() ?? [];
                  if (data.length < 2) return null;
                  const path = Skia.Path.Make();
                  let started = false;
                  for (let i = iFrom; i <= iTo; i++) {
                    const b = bars[i]; if (!b) continue;
                    const pt = data.find(d => d.time === b.time); if (!pt) continue;
                    const x = barIdxToX(i, logFrom, barW);
                    const y = priceToY(pt.value as number, displayMin, displayMax, plotH);
                    if (!started) { path.moveTo(x, y); started = true; }
                    else           path.lineTo(x, y);
                  }
                  return started ? (
                    <Path path={path} color={upCol} strokeWidth={2} style="stroke" />
                  ) : null;
                })()}

                {/* EMA / VWAP indicator lines */}
                {Object.entries(emaLinePaths).map(([key, path]) => (
                  <Path
                    key={key}
                    path={path}
                    color={EMA_COLORS[key as keyof IndicatorState]}
                    strokeWidth={1}
                    style="stroke"
                  />
                ))}

                {/* Price lines (dashed) */}
                {priceLinesData.map((pl, i) => {
                  const y = priceToY(pl.getPrice(), displayMin, displayMax, plotH);
                  if (y < 0 || y > plotH) return null;
                  return (
                    <Line
                      key={i}
                      p1={vec(0, y)}
                      p2={vec(plotW, y)}
                      color={pl.getColor()}
                      strokeWidth={1}
                    />
                  );
                })}

                {/* Panel border (right edge) */}
                <Line
                  p1={vec(plotW - 0.5, 0)}
                  p2={vec(plotW - 0.5, plotH)}
                  color="rgba(255,255,255,0.12)"
                  strokeWidth={1}
                />
                {/* Panel border (bottom edge) */}
                <Line
                  p1={vec(0, plotH - 0.5)}
                  p2={vec(plotW, plotH - 0.5)}
                  color="rgba(255,255,255,0.12)"
                  strokeWidth={1}
                />
              </Canvas>

              {/* ── Price axis (right strip) ── */}
              <View style={[styles.priceAxis, { width: PRICE_AXIS_W, height: plotH }]}>
                {priceLabels.map(({ price, y, label }) => (
                  <RNText
                    key={price}
                    style={[styles.priceAxisLabel, { top: y - 8 }]}
                  >
                    {label}
                  </RNText>
                ))}
                {/* Live price box */}
                <LivePriceBox
                  series={series}
                  interval={interval}
                  upColor={settings?.priceLabelBullColor ?? settings?.upColor ?? UP_COLOR}
                  downColor={settings?.priceLabelBearColor ?? settings?.downColor ?? DOWN_COLOR}
                  textColor={settings?.priceLabelTextColor ?? "#ffffff"}
                  tickDataRef={tickDataRef}
                  lastTickTimeRef={lastTickTimeRef}
                  symbolOverride={symbol}
                  slotMode={propSymbol != null}
                  isMarketOpen={mktIsOpen}
                />
              </View>

              {/* ── Time axis (bottom strip) ── */}
              <View style={[styles.timeAxis, { height: TIME_AXIS_H, width: plotW }]}>
                {timeLabels.map(({ x, label }) => (
                  <RNText
                    key={x}
                    style={[styles.timeAxisLabel, { left: x - 28 }]}
                  >
                    {label}
                  </RNText>
                ))}
              </View>

              {/* ── Top-left info overlay (symbol · timeframe · tick rate) ── */}
              <View style={styles.infoOverlay} pointerEvents="none">
                <RNText style={styles.symbolText}>
                  {SYMBOL_CATALOG[symbol]?.badge ?? symbol}
                </RNText>
                <RNText style={styles.intervalText}> · {fmtIntervalLabel(interval)}</RNText>
                <TickRateOverlay
                  tickCountRef={tickCountRef}
                  lastTickTimeRef={lastTickTimeRef}
                  isMarketOpen={mktIsOpen}
                  mktType={mktType}
                />
              </View>

              {/* ── History loading indicator ── */}
              {histLoading && (
                <View style={styles.histLoadingBadge} pointerEvents="none">
                  <RNText style={styles.histLoadingText}>Loading history…</RNText>
                </View>
              )}

              {/* ── Chart children (DrawingOverlay, IndicatorRenderer, etc.) ── */}
              {children}
            </View>
          </GestureDetector>
        </View>
      </ChartContext.Provider>
    </ChartBarsContext.Provider>
  );
});

export default CustomChart;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  priceAxis: {
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: "rgba(7,17,13,0.92)",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.12)",
  },
  priceAxisLabel: {
    position: "absolute",
    right: 4,
    color: TEXT_COLOR,
    fontSize: 10,
    fontFamily: "monospace",
    textAlign: "right",
    lineHeight: 14,
  },
  timeAxis: {
    position: "absolute",
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(7,17,13,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  timeAxisLabel: {
    position: "absolute",
    top: 6,
    color: TEXT_COLOR,
    fontSize: 10,
    fontFamily: "monospace",
    textAlign: "center",
    width: 56,
    lineHeight: 14,
  },
  infoOverlay: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    pointerEvents: "none",
  },
  symbolText: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.82)",
    letterSpacing: 0.3,
  },
  intervalText: {
    fontSize: 10,
    fontWeight: "500",
    color: "rgba(255,255,255,0.38)",
    letterSpacing: 0.1,
  },
  tickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 8,
  },
  tickDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tickText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "rgba(255,255,255,0.75)",
    letterSpacing: 0.3,
  },
  histLoadingBadge: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    backgroundColor: "rgba(18,24,38,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    pointerEvents: "none",
  },
  histLoadingText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
  },
  priceBox: {
    position: "absolute",
    right: 0,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    minWidth: 60,
    alignItems: "center",
  },
  priceBoxHidden: {
    opacity: 0,
  },
  priceBoxText: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "monospace",
    letterSpacing: 0.3,
    lineHeight: 16,
  },
  priceBoxCd: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "monospace",
    opacity: 0.9,
    marginTop: 2,
    letterSpacing: 0.5,
    lineHeight: 13,
  },
});
