import { memo, useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { useLocation } from "wouter";
import { createPortal } from "react-dom";
import {
  X, ChevronDown, ChevronLeft, ChevronRight,
  Pencil, Plug, MoreHorizontal, Maximize2, Minimize2,
  LayoutGrid, Activity, Bell, List,
  BarChart2, RotateCcw, Settings2, Camera,
  MousePointer, Eraser,
  Undo2, Redo2,
  Star, Search, TrendingUp, RefreshCw,
  LayoutTemplate, Link2, Unlink2,
} from "lucide-react";
import {
  REGISTRY_FOREX, REGISTRY_METALS, REGISTRY_COMMODITIES, REGISTRY_INDICES,
} from "@/lib/symbolRegistry";
import { useBrokerWatchlistStore } from "@/store/brokerWatchlistStore";
import { MobileWatchlistOverlay } from "./MobileWatchlistOverlay";
import { SymbolPickerSheet } from "./SymbolPickerSheet";
import CustomChart from "./CustomChart";
import MiniChart from "./MiniChart";
import DrawingOverlay from "./DrawingOverlay";
import IndicatorRenderer from "./IndicatorRenderer";
import CustomIndicatorRenderer from "./CustomIndicatorRenderer";
import IndicatorTags from "./IndicatorTags";
import IndicatorsPanel from "./IndicatorsPanel";
import SettingsPanel, {
  ColorBox, ColorSwatch, Section, Row, ColorPair, StyledSelect, Toggle, ThicknessButtons, SaveAsDefaultButton, ToggleRow,
} from "./SettingsPanel";
import { AlertSheetContent } from "./AlertCenterModal";
import { DrawingAlertModal } from "./DrawingAlertModal";
import { tfLabel } from "./TFDropdown";
import { fmtPrice, useLiveMarketContext } from "@/contexts/LiveMarketContext";
import { useSymbolTick, getSymbolTick } from "@/store/tickStore";
import { sheetDragState } from "@/lib/sheetDragState";
import type { ChartSettings } from "./chartSettingsTypes";
import { DEFAULT_CHART_SETTINGS } from "./chartSettingsTypes";
import { type OHLCBar, type ChartType, useChartStore } from "@/store/chartStore";
import { useWatchlist, SYMBOL_CATALOG } from "@/contexts/WatchlistContext";
import type { Drawing, ToolType, DrawingStyle } from "@/types/drawing";
import { useDrawingStore } from "@/store/drawingStore";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ColorPickerGlass } from "@/components/ColorPickerGlass";
import { useBrokerStore } from "@/store/brokerStore";
import { BrokerSelectModal, BrokerListContent } from "@/components/broker/BrokerSelectModal";
import { BrokerAuthModal } from "@/components/broker/BrokerAuthModal";
import { type NamedLayout } from "@/hooks/useNamedLayouts";
import { BrokerIntegrationModal } from "@/components/charts/BrokerIntegrationModal";

// ── Drawing toolbar icon assets ────────────────────────────────────────────
import icoAlertUrl    from "@assets/alert1_1780335285769.svg";
import icoBinUrl      from "@assets/bin1_1780335362774.svg";
import ico3DotsUrl    from "@assets/3dots1_1780335267063.svg";
import icoLockUrl     from "@assets/lockicon1_1780335267097.svg";
import icoSettingUrl  from "@assets/setting1_1780335267166.svg";

// ── Position toolbar assets (same as desktop PositionToolbar) ───────────────
import ptBucketUrl  from "@assets/bucket1_1780601317406.svg";
import ptBinUrl     from "@assets/newbin1_1780601317380.svg";
import ptDotsUrl    from "@assets/new3dots1_1780601317279.svg";
import ptAlertUrl   from "@assets/new_alert1_1780601317242.svg";
import ptSettingUrl from "@assets/setting1_1780601636025.svg";

function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || "#089981").replace("#", "").slice(0, 6).padEnd(6, "0");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Drawing tool SVG assets ────────────────────────────────────────────────
import trendlineSvgUrl      from "@assets/trendline1_1780242299048.svg";
import raySvgUrl             from "@assets/ray1_1780242299093.svg";
import hlineSvgUrl           from "@assets/horizontalline1_1780242299153.svg";
import hraySvgUrl            from "@assets/horizontalray1_1780242299123.svg";
import vlineSvgUrl           from "@assets/verticalline1_1780242299183.svg";
import extendedSvgUrl        from "@assets/extendedline1_1780242299217.svg";
import parallelChannelSvgUrl from "@assets/parallelchannel1_1780242299247.svg";
import fibSvgUrl             from "@assets/fibonacci1_1780243582556.svg";
import fibChannelSvgUrl      from "@assets/fibchannel1_1780243582588.svg";
import longPosSvgUrl         from "@assets/longposition1_1780247637052.svg";
import shortPosSvgUrl        from "@assets/shortposition1_1780247637032.svg";
import dateRangeSvgUrl       from "@assets/daterange1_1780247636983.svg";
import priceRangeSvgUrl      from "@assets/pricerange1_1780247637012.svg";
import textNewSvgUrl         from "@assets/text1_1780246000361.svg";
import noteSvgUrl            from "@assets/note1_1780245960632.svg";
import brushSvgUrl           from "@assets/brushnew1_1780251266199.svg";
import highlighterSvgUrl     from "@assets/highlighter1_1780251266178.svg";
import rectangleSvgUrl       from "@assets/rectangle1_1780251266157.svg";
import circleBrushSvgUrl     from "@assets/circle1_1780251266093.svg";

// ── Chart type assets ──────────────────────────────────────────────────────
import icoCandlesticks from "@/assets/icon-candlesticks.svg?url";
import icoHeikinAshi   from "@/assets/icon-heikinashi.svg?url";
import icoLine         from "@/assets/icon-line.svg?url";
import icoLineMarkers  from "@/assets/icon-linewithmarkers.svg?url";

// ── Constants ──────────────────────────────────────────────────────────────
const CHART_TYPES: { type: ChartType; src: string; label: string }[] = [
  { type: "candles",           src: icoCandlesticks, label: "Candles"     },
  { type: "heikin_ashi",       src: icoHeikinAshi,   label: "Heikin Ashi" },
  { type: "line",              src: icoLine,         label: "Line"        },
  { type: "line_with_markers", src: icoLineMarkers,  label: "Line+Marks"  },
];

const TF_GROUPS = [
  { label: "Minutes", values: ["1","3","5","15","30"]  },
  { label: "Hours",   values: ["60","120","240","360"] },
  { label: "Daily+",  values: ["D","W","M"]            },
];

type MobileDrawTool = {
  type: ToolType;
  label: string;
  src?: string;
};
type MobileDrawGroup = { title: string; tools: MobileDrawTool[] };

const MOBILE_TOOL_GROUPS: MobileDrawGroup[] = [
  {
    title: "Lines",
    tools: [
      { type: "trendline",  label: "Trendline",  src: trendlineSvgUrl      },
      { type: "ray",        label: "Ray",         src: raySvgUrl            },
      { type: "extended",   label: "Extended",    src: extendedSvgUrl       },
      { type: "hline",      label: "H. Line",     src: hlineSvgUrl          },
      { type: "hray",       label: "H. Ray",      src: hraySvgUrl           },
      { type: "vline",      label: "V. Line",     src: vlineSvgUrl          },
      { type: "channel",    label: "Channel",     src: parallelChannelSvgUrl},
    ],
  },
  {
    title: "Fibonacci",
    tools: [
      { type: "fib",         label: "Fib Ret.",    src: fibSvgUrl        },
      { type: "fib_channel", label: "Fib Channel", src: fibChannelSvgUrl },
    ],
  },
  {
    title: "Forecast & Measure",
    tools: [
      { type: "position_long",  label: "Long Pos.",   src: longPosSvgUrl   },
      { type: "position_short", label: "Short Pos.",  src: shortPosSvgUrl  },
      { type: "date_range",     label: "Date Range",  src: dateRangeSvgUrl },
      { type: "price_range",    label: "Price Range", src: priceRangeSvgUrl},
    ],
  },
  {
    title: "Text & Notes",
    tools: [
      { type: "text", label: "Text", src: textNewSvgUrl },
      { type: "note", label: "Note", src: noteSvgUrl    },
    ],
  },
  {
    title: "Shapes & Brushes",
    tools: [
      { type: "brush",       label: "Brush",       src: brushSvgUrl       },
      { type: "highlighter", label: "Highlighter", src: highlighterSvgUrl },
      { type: "rect",        label: "Rectangle",   src: rectangleSvgUrl   },
      { type: "ellipse",     label: "Circle",      src: circleBrushSvgUrl },
    ],
  },
];

const LAYOUT_OPTIONS = [
  { cols: 1, rows: 1, label: "Single",  icon: [[1,1]] },
  { cols: 2, rows: 1, label: "2 Left",  icon: [[1,2]] },
  { cols: 1, rows: 2, label: "2 Top",   icon: [[2,1]] },
  { cols: 2, rows: 2, label: "4-Grid",  icon: [[2,2]] },
];

// ── Sheet-drag blur suppression ────────────────────────────────────────────
// While a BottomSheet is being finger-dragged, backdrop-filter blur on glass
// elements (FloatingLeftDrawingPill, MiniControlBar, DrawingMiniBar) forces the
// GPU to re-blur everything behind them on every compositor frame.
// Toggling body.tj-sheet-drag removes all backdrop-filter instantly with zero
// React re-renders or style recalculations — just a single classList mutation.
if (typeof document !== "undefined") {
  const _s = document.createElement("style");
  _s.textContent =
    "body.tj-sheet-drag *{backdrop-filter:none!important;" +
    "-webkit-backdrop-filter:none!important}";
  document.head.appendChild(_s);
}

// ── Shared styles ──────────────────────────────────────────────────────────
const SHEET_BG      = "rgba(10,12,16,0.98)";
const ACCENT        = "#60A5FA";
const ACCENT_BG     = "rgba(96,165,250,0.10)";
const ACCENT_BORDER = "rgba(96,165,250,0.28)";
const DIVIDER       = "rgba(255,255,255,0.07)";
const TEXT_DIM      = "rgba(255,255,255,0.45)";
const TEXT_MED      = "rgba(255,255,255,0.70)";
const TEXT_HI       = "rgba(255,255,255,0.92)";
const BTN_BG        = "rgba(255,255,255,0.06)";
const BTN_BORDER    = "rgba(255,255,255,0.10)";
const NEON          = "rgba(255,255,255,0.55)";
const NEON_GLOW     = "0 -16px 48px rgba(0,0,0,0.60)";

// ── Glass control bar palette — white/neutral ────────────────────────────────
const GL_TEAL            = "rgba(255,255,255,0.82)";
const GL_BG              = "rgba(8,9,16,0.97)";
const GL_BORDER          = "rgba(255,255,255,0.12)";
const GL_GLOW            = [
  "0 8px 32px rgba(0,0,0,0.85)",
  "0 2px 8px rgba(0,0,0,0.55)",
].join(",");
const GL_BTN_ACTIVE_BG   = "rgba(255,255,255,0.10)";
const GL_BTN_ACTIVE_BDR  = "rgba(255,255,255,0.28)";
const GL_BTN_ACTIVE_GLOW = "0 0 10px rgba(255,255,255,0.10)";
const GL_PILL_BG         = "rgba(255,255,255,0.06)";
const GL_PILL_BDR        = "rgba(255,255,255,0.14)";
const GL_DIV             = "linear-gradient(180deg,transparent,rgba(255,255,255,0.18),transparent)";

// ── Animated mesh gradient background ──────────────────────────────────────
function AnimatedMeshBackground() {
  return (
    <div
      aria-hidden
      style={{
        position:"absolute", inset:0, pointerEvents:"none", overflow:"hidden",
        zIndex:0,
      }}
    >
      {/* Indigo blob */}
      <div
        className="tj-mesh-blob-1"
        style={{
          position:"absolute",
          top:"-20%", left:"-15%",
          width:"65%", height:"65%",
          borderRadius:"50%",
          background:"radial-gradient(circle,rgba(99,102,241,0.09) 0%,transparent 70%)",
          willChange:"transform",
        }}
      />
      {/* Violet blob */}
      <div
        className="tj-mesh-blob-2"
        style={{
          position:"absolute",
          bottom:"-15%", right:"-10%",
          width:"55%", height:"55%",
          borderRadius:"50%",
          background:"radial-gradient(circle,rgba(139,92,246,0.08) 0%,transparent 70%)",
          willChange:"transform",
        }}
      />
      {/* Cyan blob */}
      <div
        className="tj-mesh-blob-3"
        style={{
          position:"absolute",
          top:"35%", right:"20%",
          width:"40%", height:"40%",
          borderRadius:"50%",
          background:"radial-gradient(circle,rgba(6,182,212,0.06) 0%,transparent 70%)",
          willChange:"transform",
        }}
      />
    </div>
  );
}

// ── Floating left drawing pill ──────────────────────────────────────────────
function FloatingDrawingPill({
  activeTool,
  onSelectTool,
  onOpenSheet,
}: {
  activeTool: string;
  onSelectTool: (t: ToolType) => void;
  onOpenSheet: () => void;
}) {
  const QUICK_TOOLS: { type: ToolType; src?: string; label: string }[] = [
    { type: "cursor",    label: "Select"   },
    { type: "trendline", label: "Trend",   src: trendlineSvgUrl      },
    { type: "hline",     label: "H.Line",  src: hlineSvgUrl          },
    { type: "fib",       label: "Fib",     src: fibSvgUrl            },
    { type: "rect",      label: "Rect",    src: rectangleSvgUrl      },
    { type: "eraser",    label: "Erase"    },
  ];

  const isDrawTool = (t: string) => t !== "cursor" && t !== "eraser";

  return (
    <div
      className="tj-panel-in"
      style={{
        position:"absolute",
        left:10, top:"50%",
        transform:"translateY(-50%)",
        zIndex:50,
        display:"flex",
        flexDirection:"column",
        alignItems:"center",
        gap:4,
        pointerEvents:"auto",
      }}
    >
      {/* Glass pill wrapper */}
      <div
        style={{
          background:"rgba(5,6,18,0.90)",
          backdropFilter:"blur(12px) saturate(160%)",
          WebkitBackdropFilter:"blur(12px) saturate(160%)",
          border:"1px solid rgba(99,102,241,0.26)",
          borderRadius:18,
          padding:"6px 4px",
          display:"flex",
          flexDirection:"column",
          alignItems:"center",
          gap:3,
          boxShadow:[
            "0 0 0 1px rgba(99,102,241,0.08) inset",
            "0 0 24px rgba(99,102,241,0.18)",
            "0 8px 32px rgba(0,0,0,0.80)",
          ].join(","),
        }}
      >
        {/* Quick tools */}
        <div className="tj-stagger" style={{ display:"flex", flexDirection:"column", gap:3 }}>
          {QUICK_TOOLS.map(tool => {
            const active = activeTool === tool.type;
            return (
              <button
                key={tool.type}
                onClick={() => onSelectTool(tool.type)}
                title={tool.label}
                className={active ? "tj-tool-active" : ""}
                style={{
                  width:38, height:38, borderRadius:12, flexShrink:0,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  background: active ? "rgba(99,102,241,0.22)" : "rgba(255,255,255,0.04)",
                  border: active ? "1px solid rgba(99,102,241,0.50)" : "1px solid rgba(255,255,255,0.07)",
                  cursor:"pointer",
                  transition:"background 0.14s, border-color 0.14s",
                  willChange:"transform",
                  touchAction:"manipulation",
                }}
                onPointerDown={e => {
                  (e.currentTarget as HTMLElement).style.transform = "scale(0.87)";
                  (e.currentTarget as HTMLElement).style.transition = "transform 0.08s ease";
                }}
                onPointerUp={e => {
                  (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                  (e.currentTarget as HTMLElement).style.transition = "transform 0.32s cubic-bezier(0.34,1.56,0.64,1)";
                }}
                onPointerCancel={e => {
                  (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                }}
              >
                {tool.src ? (
                  <img
                    src={tool.src} width={18} height={18} draggable={false}
                    style={{
                      filter: active
                        ? "brightness(0) saturate(100%) invert(52%) sepia(40%) saturate(700%) hue-rotate(210deg) brightness(115%)"
                        : "brightness(2) opacity(0.55)",
                      transition:"filter 0.14s",
                    }}
                  />
                ) : tool.type === "cursor" ? (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={active?"#a5b4fc":"rgba(255,255,255,0.50)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 3l14 9-7 1-4 7z"/>
                  </svg>
                ) : (
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={active?"#a5b4fc":"rgba(255,255,255,0.50)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 20H7L3 3"/><path d="m6 12 6-6 4 4 3-3"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ width:24, height:1, background:"rgba(99,102,241,0.22)", margin:"2px 0" }} />

        {/* More tools button */}
        <button
          onClick={onOpenSheet}
          title="All tools"
          style={{
            width:38, height:38, borderRadius:12,
            display:"flex", alignItems:"center", justifyContent:"center",
            background:"rgba(99,102,241,0.08)",
            border:"1px solid rgba(99,102,241,0.22)",
            cursor:"pointer",
            touchAction:"manipulation",
            transition:"background 0.14s",
          }}
          onPointerDown={e => {
            (e.currentTarget as HTMLElement).style.transform = "scale(0.87)";
          }}
          onPointerUp={e => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1)";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(165,180,252,0.8)" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="5"  r="1.5" fill="rgba(165,180,252,0.8)"/>
            <circle cx="12" cy="12" r="1.5" fill="rgba(165,180,252,0.8)"/>
            <circle cx="12" cy="19" r="1.5" fill="rgba(165,180,252,0.8)"/>
          </svg>
        </button>
      </div>

      {/* Active tool indicator dot */}
      {isDrawTool(activeTool) && (
        <div
          className="tj-glow-pulse"
          style={{
            width:6, height:6, borderRadius:"50%",
            background:"#818cf8",
            boxShadow:"0 0 8px rgba(99,102,241,0.9)",
          }}
        />
      )}
    </div>
  );
}

// ── BottomSheet — 3-state snap (CLOSED ↔ HALF ↔ FULL), RAF drag ──────────
// Sheet element is always 100vh tall. translateY controls visible amount:
//   FULL_Y = 0                       → entire screen filled
//   HALF_Y = 0.50 * window.innerHeight → bottom half visible
//   off-screen = window.innerHeight + 20 → hidden (close target)
//
// Drag is handled on the ENTIRE sheet body (not just the header).
// Scroll conflict: when FULL + scrollTop > 1 → let scroll happen.
//                  when FULL + scrollTop ≤ 1 + dragging DOWN → drag sheet.
//                  when HALF → always drag.

function BottomSheet({
  title, onClose, children,
  onOpened,
  noShadow,
  partialFraction: _ignored,
  maxHeight: _maxHeight,
}: {
  title: string; onClose: () => void; children: React.ReactNode;
  onOpened?: () => void;
  noShadow?: boolean;
  partialFraction?: number;
  maxHeight?: string;
}) {
  const sheetRef     = useRef<HTMLDivElement>(null);
  const backdropRef  = useRef<HTMLDivElement>(null);
  const headerRef    = useRef<HTMLDivElement>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const onCloseRef   = useRef(onClose);
  const isTouchDeviceRef = useRef(typeof window !== "undefined" && navigator.maxTouchPoints > 0);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const onOpenedRef  = useRef(onOpened);
  useEffect(() => { onOpenedRef.current = onOpened; }, [onOpened]);
  // Fires onOpened exactly once — on the initial open animation completing,
  // not on subsequent half↔full drag transitions.
  const openFiredRef = useRef(false);

  // ── NO React state for snap — all snap-driven styles via direct DOM ────────
  // This eliminates the React re-render burst that caused jank on transitions.

  // Snap Y offsets in px — initialised synchronously so opening RAF can read them
  const snapYRef = useRef({
    full: 0,
    half: typeof window !== "undefined" ? Math.round(0.50 * window.innerHeight) : 400,
  });
  const computeSnaps = useCallback(() => {
    snapYRef.current.full = 0;
    snapYRef.current.half = Math.round(0.50 * window.innerHeight);
  }, []);
  useEffect(() => {
    computeSnaps();
    window.addEventListener("resize", computeSnaps);
    return () => window.removeEventListener("resize", computeSnaps);
  }, [computeSnaps]);

  // ── Shared drag state — never triggers re-render ──────────────────────────
  const ds = useRef({
    active:     false,
    closing:    false,
    snap:       "half" as "half"|"full",
    baseY:      0,
    startPY:    0,
    latestPY:   0,
    rafId:      0,
    rafPending: false,
  });

  // ── Deferred post-animation state ──────────────────────────────────────────
  // All three properties are applied in transitionend, NOT during animation:
  //   borderRadius  — animating on a composited+shadow layer forces per-frame re-rasterization
  //   restoreBlur   — restoring backdrop-filter mid-animation causes a GPU spike on frame 1
  //   applyOverflow — switching overflow during animation causes a synchronous layout
  const pendingTransitionEndRef = useRef<{
    borderRadius:  string;
    restoreBlur:   boolean;
    applyOverflow: "half" | "full" | null;
  } | null>(null);
  const pendingFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── FPS measurement — always active, not gated behind profiler flag ─────────
  const fpsFramesRef = useRef(0);
  const fpsStartRef  = useRef(0);
  const fpsDirRef    = useRef("");
  const fpsRafRef    = useRef<number | null>(null);

  // ── Apply snap-driven DOM styles without any React re-render ─────────────
  // scroll: overflowY + touchAction updated directly on the DOM node
  const applySnapDom = useCallback((newSnap: "half"|"full") => {
    const sc = scrollRef.current;
    if (newSnap === "full") {
      if (sc) { sc.style.overflowY = "auto"; (sc.style as CSSStyleDeclaration & { touchAction: string }).touchAction = "pan-y"; }
    } else {
      if (sc) { sc.style.overflowY = "hidden"; (sc.style as CSSStyleDeclaration & { touchAction: string }).touchAction = "none"; }
    }
  }, []);

  // ── Backdrop opacity: fades when dragging below HALF_Y ───────────────────
  const syncBackdrop = useCallback((y: number) => {
    const bd = backdropRef.current;
    if (!bd) return;
    const hY = snapYRef.current.half;
    if (y <= hY) { bd.style.opacity = "1"; return; }
    const ratio = Math.min(1, (y - hY) / Math.max(1, hY * 0.75));
    bd.style.opacity = String(Math.max(0.05, 1 - ratio * 0.90));
  }, []);

  // ── RAF: write translateY only — border-radius is NOT interpolated per frame ──
  // Reason: sheet has will-change:transform (composited GPU layer) + boxShadow.
  // Mutating border-radius on a composited layer forces full layer re-rasterization
  // + shadow re-rasterization on EVERY frame (4-10ms/frame on mobile = 24-60% of
  // the 16.7ms budget). Corners animate only at snap commit via CSS transition.
  const applyDrag = useCallback(() => {
    ds.current.rafPending = false;
    const sheet = sheetRef.current;
    if (!sheet || ds.current.closing) return;
    const raw = ds.current.baseY + (ds.current.latestPY - ds.current.startPY);
    const y = Math.max(-14, raw); // 14px overscroll at top for rubbery feel
    sheet.style.transform = `translateY(${y}px)`;
    syncBackdrop(y);
  }, [syncBackdrop]);

  // ── Animate to a snap position with spring easing ────────────────────────
  // Only `transform` is animated — border-radius, blur, and overflow are applied
  // after transitionend (see pendingTransitionEndRef) to avoid per-frame GPU work.
  const SNAP_SPRING = "transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)";
  const animateTo = useCallback((
    targetY: number,
    easing = SNAP_SPRING,
  ) => {
    const sheet = sheetRef.current;
    const bd    = backdropRef.current;
    if (!sheet) return;
    sheet.style.transition = easing;
    sheet.style.transform  = `translateY(${targetY}px)`;
    if (bd) {
      bd.style.transition = "opacity 0.18s ease";
      syncBackdrop(targetY);
    }
  }, [syncBackdrop]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Smooth close: slide off-screen → unmount ──────────────────────────────
  const doClose = useCallback(() => {
    if (ds.current.closing) return;
    ds.current.closing = true;
    // Cancel any pending snap transition before closing
    if (pendingTransitionEndRef.current) {
      pendingTransitionEndRef.current = null;
      if (pendingFallbackTimerRef.current !== null) {
        clearTimeout(pendingFallbackTimerRef.current);
        pendingFallbackTimerRef.current = null;
      }
    }
    if (fpsRafRef.current !== null) { cancelAnimationFrame(fpsRafRef.current); fpsRafRef.current = null; }
    sheetDragState.active = false;
    sheetDragState.flush?.();
    document.body.classList.remove("tj-sheet-drag");
    cancelAnimationFrame(ds.current.rafId);
    ds.current.rafPending = false;
    const sheet = sheetRef.current;
    const bd    = backdropRef.current;
    if (!sheet) { onCloseRef.current(); return; }
    const offY = window.innerHeight + 20;
    sheet.style.transition = "transform 0.16s cubic-bezier(0.40, 0, 0.80, 0.60)";
    sheet.style.transform  = `translateY(${offY}px)`;
    if (bd) { bd.style.transition = "opacity 0.16s ease"; bd.style.opacity = "0"; }
    setTimeout(() => onCloseRef.current(), 165);
  }, []);

  // ── Snap decision on pointer/touch release ────────────────────────────────
  // All three previously-synchronous side-effects are now deferred to transitionend:
  //   1. border-radius change  — was causing GPU re-rasterization on every animation frame
  //   2. backdrop-filter restore — was causing a GPU spike on the very first animation frame
  //   3. overflow/touchAction  — was causing a synchronous layout during animation
  const commitSnap = useCallback((currentY: number) => {
    // Settle any still-pending snap from a rapid previous transition
    if (pendingTransitionEndRef.current) {
      const p = pendingTransitionEndRef.current;
      pendingTransitionEndRef.current = null;
      if (pendingFallbackTimerRef.current !== null) { clearTimeout(pendingFallbackTimerRef.current); pendingFallbackTimerRef.current = null; }
      const sheet = sheetRef.current;
      if (sheet) sheet.style.borderRadius = p.borderRadius;
      if (p.restoreBlur && !isTouchDeviceRef.current) document.body.classList.remove("tj-sheet-drag");
      if (p.applyOverflow) applySnapDom(p.applyOverflow);
    }
    // Stop any previous FPS measurement
    if (fpsRafRef.current !== null) { cancelAnimationFrame(fpsRafRef.current); fpsRafRef.current = null; }

    sheetDragState.active = false;
    sheetDragState.flush?.();
    // ⚠️ backdrop-filter is NOT restored here — deferred to transitionend.
    // Restoring blur at the same moment the animation starts causes a GPU spike
    // that drops frame 1 of the spring animation.

    const { half, full } = snapYRef.current;
    const delta = currentY - ds.current.baseY; // positive = dragged down

    // Start FPS counter for this transition
    fpsFramesRef.current = 0;
    fpsStartRef.current  = performance.now();
    const measureFpsFrame = () => {
      fpsFramesRef.current++;
      fpsRafRef.current = requestAnimationFrame(measureFpsFrame);
    };
    fpsRafRef.current = requestAnimationFrame(measureFpsFrame);

    // Fallback: if transitionend never fires (e.g. no transform change), apply after 500ms
    pendingFallbackTimerRef.current = setTimeout(() => {
      pendingFallbackTimerRef.current = null;
      if (fpsRafRef.current !== null) { cancelAnimationFrame(fpsRafRef.current); fpsRafRef.current = null; }
      const pending = pendingTransitionEndRef.current;
      if (!pending) return;
      pendingTransitionEndRef.current = null;
      const sheet = sheetRef.current;
      if (sheet) sheet.style.borderRadius = pending.borderRadius;
      if (pending.restoreBlur && !isTouchDeviceRef.current) document.body.classList.remove("tj-sheet-drag");
      if (pending.applyOverflow) applySnapDom(pending.applyOverflow);
    }, 220);

    if (ds.current.snap === "half") {
      if (delta < -60) {
        // Dragged up far enough → expand to FULL
        ds.current.snap = "full";
        fpsDirRef.current = "HALF→FULL";
        pendingTransitionEndRef.current = { borderRadius: "0px", restoreBlur: true, applyOverflow: "full" };
        // overflow stays hidden during animation (already hidden at half — no layout cost)
        animateTo(full, SNAP_SPRING);
      } else if (delta > 110) {
        // Dragged down → CLOSE (clears fallback timer via doClose)
        clearTimeout(pendingFallbackTimerRef.current!);
        pendingFallbackTimerRef.current = null;
        if (fpsRafRef.current !== null) { cancelAnimationFrame(fpsRafRef.current); fpsRafRef.current = null; }
        doClose();
      } else {
        // Spring back to HALF
        fpsDirRef.current = "HALF spring-back";
        pendingTransitionEndRef.current = { borderRadius: "24px 24px 0 0", restoreBlur: true, applyOverflow: null };
        animateTo(half, SNAP_SPRING);
      }
    } else {
      // From FULL: only collapses to HALF, never closes directly from full
      if (delta > 90) {
        ds.current.snap = "half";
        fpsDirRef.current = "FULL→HALF";
        // Immediately lock overflow to stop content scrolling during animation
        const sc = scrollRef.current;
        if (sc) {
          sc.style.overflowY = "hidden";
          (sc.style as CSSStyleDeclaration & { touchAction: string }).touchAction = "none";
        }
        pendingTransitionEndRef.current = { borderRadius: "24px 24px 0 0", restoreBlur: true, applyOverflow: null };
        animateTo(half, SNAP_SPRING);
      } else {
        // Spring back to FULL
        fpsDirRef.current = "FULL spring-back";
        pendingTransitionEndRef.current = { borderRadius: "0px", restoreBlur: true, applyOverflow: null };
        animateTo(full, SNAP_SPRING);
      }
    }
  }, [animateTo, doClose, applySnapDom]);

  // ── Touch drag on the ENTIRE sheet body ───────────────────────────────────
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    let phase: "idle"|"pending"|"dragging" = "idle";
    let startTouchY = 0;

    const beginDrag = (touchY: number) => {
      ds.current.active   = true;
      ds.current.baseY    = snapYRef.current[ds.current.snap];
      ds.current.startPY  = touchY;
      ds.current.latestPY = touchY;
      sheet.style.transition = "none";
      // Freeze chart canvas + remove all backdrop-filter blurs for 60fps drag
      sheetDragState.active = true;
      document.body.classList.add("tj-sheet-drag");
    };

    const onTS = (e: TouchEvent) => {
      if (ds.current.closing) return;
      phase = "pending";
      startTouchY = e.touches[0].clientY;
    };

    const onTM = (e: TouchEvent) => {
      if (phase === "idle") return;
      const dy = e.touches[0].clientY - startTouchY;

      if (phase === "pending") {
        // 10px threshold: prevents accidental drag interception when tapping
        // buttons (finger jitter on mobile is typically 5-8px; intentional
        // drag is 15px+). 6px was too tight and ate button clicks in HALF state.
        if (Math.abs(dy) < 10) return;

        if (ds.current.snap === "half") {
          // HALF state: drag in any direction starts sheet drag
          phase = "dragging";
          beginDrag(startTouchY);
        } else {
          // FULL state: only drag sheet when at scroll top AND dragging DOWN
          const scrollTop = scrollRef.current ? scrollRef.current.scrollTop : 0;
          if (dy > 0 && scrollTop <= 1) {
            phase = "dragging";
            beginDrag(startTouchY);
          } else {
            phase = "idle"; // let the scroll area scroll normally
            return;
          }
        }
      }

      if (phase === "dragging") {
        e.preventDefault();
        ds.current.latestPY = e.touches[0].clientY;
        if (!ds.current.rafPending) {
          ds.current.rafPending = true;
          ds.current.rafId = requestAnimationFrame(applyDrag);
        }
      }
    };

    const onTE = () => {
      if (phase !== "dragging") { phase = "idle"; return; }
      phase = "idle";
      if (!ds.current.active) return;
      ds.current.active = false;
      cancelAnimationFrame(ds.current.rafId);
      ds.current.rafPending = false;
      const raw = ds.current.baseY + (ds.current.latestPY - ds.current.startPY);
      commitSnap(Math.max(-14, raw));
    };

    sheet.addEventListener("touchstart",  onTS, { passive: true  });
    sheet.addEventListener("touchmove",   onTM, { passive: false });
    sheet.addEventListener("touchend",    onTE, { passive: true  });
    sheet.addEventListener("touchcancel", onTE, { passive: true  });
    return () => {
      sheet.removeEventListener("touchstart",  onTS);
      sheet.removeEventListener("touchmove",   onTM);
      sheet.removeEventListener("touchend",    onTE);
      sheet.removeEventListener("touchcancel", onTE);
      cancelAnimationFrame(ds.current.rafId);
    };
  }, [applyDrag, commitSnap]);

  // ── Mouse/pointer drag on entire sheet (desktop preview / non-touch) ──────
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || ds.current.closing) return;
      ds.current.active   = true;
      ds.current.baseY    = snapYRef.current[ds.current.snap];
      ds.current.startPY  = e.clientY;
      ds.current.latestPY = e.clientY;
      sheet.style.transition = "none";
      sheetDragState.active = true;
      document.body.classList.add("tj-sheet-drag");
      try { sheet.setPointerCapture(e.pointerId); } catch {}
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !ds.current.active) return;
      ds.current.latestPY = e.clientY;
      if (!ds.current.rafPending) {
        ds.current.rafPending = true;
        ds.current.rafId = requestAnimationFrame(applyDrag);
      }
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !ds.current.active) return;
      ds.current.active = false;
      cancelAnimationFrame(ds.current.rafId);
      ds.current.rafPending = false;
      const raw = ds.current.baseY + (ds.current.latestPY - ds.current.startPY);
      commitSnap(Math.max(-14, raw));
    };

    sheet.addEventListener("pointerdown",   onDown);
    sheet.addEventListener("pointermove",   onMove);
    sheet.addEventListener("pointerup",     onUp);
    sheet.addEventListener("pointercancel", onUp);
    return () => {
      sheet.removeEventListener("pointerdown",   onDown);
      sheet.removeEventListener("pointermove",   onMove);
      sheet.removeEventListener("pointerup",     onUp);
      sheet.removeEventListener("pointercancel", onUp);
      cancelAnimationFrame(ds.current.rafId);
    };
  }, [applyDrag, commitSnap]);

  // ── Opening animation: CLOSED → HALF (JS-driven, no CSS hack) ───────────
  // Start off-screen, animate to HALF on the very next double-RAF.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const offY = window.innerHeight + 20;
    sheet.style.transition = "none";
    sheet.style.transform  = `translateY(${offY}px)`;
    // Double-RAF ensures the initial off-screen position is painted first
    let r1 = 0, r2 = 0;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        computeSnaps(); // re-sync in case window.innerHeight changed
        animateTo(
          snapYRef.current.half,
          "transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)",
        );
      });
    });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []); // eslint-disable-line

  // ── Post-animation cleanup (transitionend) ────────────────────────────────
  // Fires once the transform spring settles. Applies all deferred side-effects
  // that were intentionally withheld during the animation to avoid GPU pressure:
  //   • border-radius snaps instantly (no per-frame re-rasterization)
  //   • backdrop-filter blur restored only now (no GPU spike on frame 1)
  //   • overflow switches now (no synchronous layout during animation)
  // Also stops the FPS counter and logs the measured frame rate.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== "transform" || e.target !== sheet) return;

      // Stop FPS counter
      if (fpsRafRef.current !== null) {
        cancelAnimationFrame(fpsRafRef.current);
        fpsRafRef.current = null;
      }
      if (pendingFallbackTimerRef.current !== null) {
        clearTimeout(pendingFallbackTimerRef.current);
        pendingFallbackTimerRef.current = null;
      }

      const pending = pendingTransitionEndRef.current;
      if (pending) {
        pendingTransitionEndRef.current = null;
        // 1. Instant border-radius — no animation = no re-rasterization cost
        sheet.style.borderRadius = pending.borderRadius;
        // 2. Restore backdrop-filter blur — GPU is idle after transform settles (skip on touch)
        if (pending.restoreBlur && !isTouchDeviceRef.current) document.body.classList.remove("tj-sheet-drag");
        // 3. Switch overflow — layout is safe now that animation is complete
        if (pending.applyOverflow) applySnapDom(pending.applyOverflow);
      }

      // Fire onOpened once — only on the initial open animation, not on drag snaps
      if (!openFiredRef.current) {
        openFiredRef.current = true;
        onOpenedRef.current?.();
      }

      // Report animation FPS to console (color-coded: green ≥55, yellow ≥40, red <40)
      const frames   = fpsFramesRef.current;
      const duration = performance.now() - fpsStartRef.current;
      if (frames > 0 && duration > 0) {
        const fps = Math.round(frames / (duration / 1000));
        const color = fps >= 55 ? "color:#34d399;font-weight:bold"
                    : fps >= 40 ? "color:#fbbf24;font-weight:bold"
                    :             "color:#f87171;font-weight:bold";
      }
    };

    sheet.addEventListener("transitionend", onTransitionEnd);
    return () => sheet.removeEventListener("transitionend", onTransitionEnd);
  }, [applySnapDom]);

  // ── Suppress backdrop-filter on touch devices while sheet is open ─────────
  useEffect(() => {
    if (!isTouchDeviceRef.current) return;
    document.body.classList.add("tj-sheet-drag");
    return () => { document.body.classList.remove("tj-sheet-drag"); };
  }, []);

  // ── Tap backdrop to close ─────────────────────────────────────────────────
  const onBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) doClose();
  }, [doClose]);

  return createPortal(
    <div
      ref={backdropRef}
      onClick={onBackdropClick}
      style={{
        position:"fixed", inset:0, zIndex:300,
        background:"rgba(0,0,0,0.72)",
        willChange:"opacity",
        // Backdrop fades in quickly; opacity is later driven by syncBackdrop
        animation:"sheet-fade-in 0.15s ease both",
      }}
    >
      <div
        ref={sheetRef}
        onClick={e => e.stopPropagation()}
        style={{
          position:"absolute", left:0, right:0, bottom:0,
          // 100vh height: at translateY(0) the sheet covers the full screen exactly.
          height:"100vh",
          background: SHEET_BG,
          borderTop:`1px solid rgba(255,255,255,0.10)`,
          borderLeft:`1px solid rgba(255,255,255,0.06)`,
          borderRight:`1px solid rgba(255,255,255,0.06)`,
          borderRadius:"24px 24px 0 0",
          paddingBottom:"max(env(safe-area-inset-bottom,12px),12px)",
          display:"flex", flexDirection:"column",
          boxShadow: noShadow ? "none" : `${NEON_GLOW}, 0 -32px 80px rgba(0,0,0,0.85)`,
          willChange:"transform",
          contain:"layout style",
          // Initial position — JS immediately overrides in opening useEffect
          transform:`translateY(${typeof window !== "undefined" ? window.innerHeight + 20 : 900}px)`,
          // Drag cursor on the sheet container itself
          cursor:"grab",
          userSelect:"none",
          WebkitUserSelect:"none",
        } as React.CSSProperties}
      >
        {/* ── Handle pill + title row ────────────────────────────────────── */}
        <div
          ref={headerRef}
          style={{
            flexShrink:0,
            touchAction:"none",
            userSelect:"none",
            WebkitUserSelect:"none",
            paddingBottom:2,
          } as React.CSSProperties}
        >
          {/* Handle pill — always visible at every snap state; no height toggling */}
          <div
            style={{
              display:"flex", justifyContent:"center", paddingTop:10, paddingBottom:6,
            }}
          >
            <div
              style={{
                width:36, height:3, borderRadius:9999,
                background:"rgba(255,255,255,0.25)",
              }}
            />
          </div>

          {/* Left-aligned title — matches TradingView/Binance/Bybit panel style */}
          <div style={{ display:"flex", justifyContent:"flex-start", alignItems:"center", padding:"4px 18px 10px" }}>
            <span style={{ fontSize:13, fontWeight:600, color:TEXT_HI, letterSpacing:"0.01em" }}>
              {title}
            </span>
          </div>
        </div>

        <div style={{ width:"100%", height:1, background:`rgba(255,255,255,0.07)`, flexShrink:0 }} />

        {/* Content scroll area — overflowY + touchAction driven via ref, not React state.
             Initial state = half (hidden/none). JS updates on snap commit. */}
        <div
          ref={scrollRef}
          style={{
            overflowY:"hidden",
            flex:1,
            touchAction:"none",
            WebkitOverflowScrolling:"touch",
          } as React.CSSProperties}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Custom TF parser (mirrors desktop TFDropdown logic) ────────────────────
function parseCustomTF(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(\d+)\s*(m|h|d|w)?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n <= 0) return null;
  const unit = (m[2] ?? "m").toLowerCase();
  if (unit === "m") return String(n);
  if (unit === "h") return n === 1 ? "60" : String(n * 60);
  if (unit === "d") return n === 1 ? "D" : String(n * 1440);
  if (unit === "w") return n === 1 ? "W" : String(n * 10080);
  return null;
}

// ── TF Sheet ───────────────────────────────────────────────────────────────
function TFSheet({ interval, onSelect, onClose }: {
  interval: string; onSelect: (v: string) => void; onClose: () => void;
}) {
  const [customVal, setCustomVal] = useState("");
  const [customErr, setCustomErr] = useState(false);
  const [customOk,  setCustomOk]  = useState(false);
  const inputRef   = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCustomChange = (val: string) => {
    setCustomVal(val);
    setCustomErr(false);
    setCustomOk(false);
  };

  const commitCustom = useCallback(() => {
    const parsed = parseCustomTF(customVal);
    if (!parsed) { setCustomErr(true); return; }
    setCustomOk(true);
    timerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      onSelect(parsed);
      onClose();
    }, 120);
  }, [customVal, onSelect, onClose]);

  const parsedPreview = useMemo(() => {
    if (!customVal.trim()) return null;
    const p = parseCustomTF(customVal);
    return p ? tfLabel(p) : null;
  }, [customVal]);

  return (
    <BottomSheet title="Timeframe" onClose={onClose}>
      <div style={{ overflowY:"auto", padding:"12px 14px 8px" }}>
        {TF_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom:16 }}>
            <p style={{ fontSize:9.5, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"rgba(255,255,255,0.28)", margin:"0 0 9px" }}>{group.label}</p>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {group.values.map(v => {
                const active = v === interval;
                return (
                  <button key={v} onClick={() => { onSelect(v); onClose(); }} style={{
                    height:42, minWidth:56, padding:"0 16px", borderRadius:10, fontSize:13, fontWeight:600, cursor:"pointer",
                    background: active ? "rgba(245,158,11,0.13)" : BTN_BG,
                    color: active ? "#f59e0b" : TEXT_MED,
                    border: `1px solid ${active ? "rgba(245,158,11,0.35)" : BTN_BORDER}`,
                    transition: "background 0.15s, border-color 0.15s, color 0.15s",
                  }}>
                    {tfLabel(v)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* ── Custom timeframe ── */}
        <div style={{ width:"100%", height:1, background:"rgba(255,255,255,0.07)", margin:"4px 0 14px" }} />
        <p style={{ fontSize:9.5, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"rgba(255,255,255,0.28)", margin:"0 0 9px" }}>Custom</p>
        <div style={{ display:"flex", gap:8, alignItems:"stretch" }}>
          {/* Input */}
          <div style={{
            flex:1, display:"flex", alignItems:"center", gap:8,
            background: customErr ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.06)",
            border: `1px solid ${customErr ? "rgba(239,68,68,0.40)" : customOk ? "rgba(245,158,11,0.40)" : "rgba(255,255,255,0.12)"}`,
            borderRadius:10, padding:"0 12px", height:42,
            transition:"border-color 0.15s, background 0.15s",
          }}>
            <input
              ref={inputRef}
              value={customVal}
              onChange={e => handleCustomChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitCustom(); }}
              placeholder="e.g. 2, 45, 2h, 4h"
              inputMode="text"
              style={{
                flex:1, background:"none", border:"none", outline:"none",
                color:"#fff", fontSize:13.5, caretColor:"#f59e0b", minWidth:0,
              }}
            />
            {/* live preview badge */}
            {parsedPreview && !customErr && (
              <span style={{
                fontSize:11, fontWeight:700, color:"#f59e0b",
                background:"rgba(245,158,11,0.12)", border:"1px solid rgba(245,158,11,0.25)",
                borderRadius:5, padding:"2px 6px", flexShrink:0,
              }}>
                {parsedPreview}
              </span>
            )}
          </div>

          {/* Apply button */}
          <button
            onClick={commitCustom}
            style={{
              height:42, padding:"0 16px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", flexShrink:0,
              background: customOk ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.13)",
              color: "#f59e0b",
              border: `1px solid ${customOk ? "rgba(245,158,11,0.50)" : "rgba(245,158,11,0.30)"}`,
              transition:"background 0.15s, border-color 0.15s",
            }}
          >
            Apply
          </button>
        </div>

        {/* Error hint */}
        {customErr && (
          <p style={{ fontSize:11.5, color:"rgba(239,68,68,0.75)", margin:"6px 0 0", lineHeight:1.4 }}>
            Invalid format. Try <span style={{ fontWeight:700 }}>45</span>, <span style={{ fontWeight:700 }}>2h</span>, or <span style={{ fontWeight:700 }}>4h</span>.
          </p>
        )}

        <div style={{ height:12 }} />
      </div>
    </BottomSheet>
  );
}

// ── Chart Type Sheet ───────────────────────────────────────────────────────
function ChartTypeSheet({ current, onSelect, onClose }: {
  current: ChartType; onSelect: (t: ChartType) => void; onClose: () => void;
}) {
  return (
    <BottomSheet title="Chart Type" onClose={onClose}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, padding:"12px 14px 8px" }}>
        {CHART_TYPES.map(({ type, src, label }) => {
          const active = current === type;
          return (
            <button key={type} onClick={() => { onSelect(type); onClose(); }} style={{
              height:70, borderRadius:12, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:7, cursor:"pointer",
              background: active ? ACCENT_BG : BTN_BG,
              border:`1px solid ${active ? ACCENT_BORDER : BTN_BORDER}`,
            }}>
              <img src={src} width={24} height={24} draggable={false}
                style={{ filter:"brightness(0) invert(1)", opacity: active ? 1 : 0.5 }} />
              <span style={{ fontSize:11.5, fontWeight:600, color: active ? ACCENT : TEXT_MED }}>{label}</span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

// ── Drawing Tools Sheet ────────────────────────────────────────────────────
// memo: re-renders only when onClose ref changes (stable useCallback from parent)
// Selector split: activeTool/canUndo/canRedo are the only reactive fields used here.
// Actions (setActiveTool/undo/redo) are stable Zustand refs — subscribing to them
// individually costs zero re-renders.
const DrawingToolsSheet = memo(function DrawingToolsSheet({ onClose }: { onClose: () => void }) {
  const activeTool    = useDrawingStore(s => s.activeTool);
  const canUndo       = useDrawingStore(s => s.canUndo);
  const canRedo       = useDrawingStore(s => s.canRedo);
  const setActiveTool = useDrawingStore(s => s.setActiveTool);
  const undo          = useDrawingStore(s => s.undo);
  const redo          = useDrawingStore(s => s.redo);

  const selectTool = useCallback((type: ToolType) => {
    setActiveTool(type);
    onClose();
  }, [setActiveTool, onClose]);

  return (
    <BottomSheet title="Drawing Tools" onClose={onClose} maxHeight="80vh">
      {/* Utility row: Cursor, Eraser, Undo, Redo */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px 8px" }}>
        <button
          onClick={() => selectTool("cursor")}
          style={{
            flex:1, height:40, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", gap:7, cursor:"pointer",
            background: activeTool === "cursor" ? ACCENT_BG : BTN_BG,
            border:`1px solid ${activeTool === "cursor" ? ACCENT_BORDER : BTN_BORDER}`,
          }}
        >
          <MousePointer style={{ width:16, height:16, color: activeTool === "cursor" ? ACCENT : TEXT_MED }} />
          <span style={{ fontSize:12, fontWeight:600, color: activeTool === "cursor" ? ACCENT : TEXT_MED }}>Select</span>
        </button>
        <button
          onClick={() => selectTool("eraser")}
          style={{
            flex:1, height:40, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", gap:7, cursor:"pointer",
            background: activeTool === "eraser" ? ACCENT_BG : BTN_BG,
            border:`1px solid ${activeTool === "eraser" ? ACCENT_BORDER : BTN_BORDER}`,
          }}
        >
          <Eraser style={{ width:16, height:16, color: activeTool === "eraser" ? ACCENT : TEXT_MED }} />
          <span style={{ fontSize:12, fontWeight:600, color: activeTool === "eraser" ? ACCENT : TEXT_MED }}>Eraser</span>
        </button>
        <button onClick={undo} disabled={!canUndo} style={{
          width:40, height:40, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", cursor: canUndo ? "pointer" : "default",
          background: BTN_BG, border:`1px solid ${BTN_BORDER}`, opacity: canUndo ? 1 : 0.35,
        }}>
          <Undo2 style={{ width:16, height:16, color: TEXT_MED }} />
        </button>
        <button onClick={redo} disabled={!canRedo} style={{
          width:40, height:40, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", cursor: canRedo ? "pointer" : "default",
          background: BTN_BG, border:`1px solid ${BTN_BORDER}`, opacity: canRedo ? 1 : 0.35,
        }}>
          <Redo2 style={{ width:16, height:16, color: TEXT_MED }} />
        </button>
      </div>

      <div style={{ width:"100%", height:1, background: DIVIDER }} />

      {/* Tool groups */}
      <div style={{ overflowY:"auto", padding:"10px 14px 8px" }}>
        {MOBILE_TOOL_GROUPS.map(group => (
          <div key={group.title} style={{ marginBottom:18 }}>
            <p style={{ fontSize:9.5, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"rgba(255,255,255,0.28)", margin:"0 0 9px" }}>
              {group.title}
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:8 }}>
              {group.tools.map(tool => {
                const active = activeTool === tool.type;
                return (
                  <button
                    key={tool.type}
                    onClick={() => selectTool(tool.type)}
                    style={{
                      height:60, borderRadius:10, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:5, cursor:"pointer",
                      background: active ? ACCENT_BG : BTN_BG,
                      border:`1px solid ${active ? ACCENT_BORDER : BTN_BORDER}`,
                      padding:"4px 2px",
                    }}
                  >
                    {tool.src ? (
                      <img src={tool.src} width={22} height={22} draggable={false}
                        style={{ filter:"brightness(2) contrast(1.05)", opacity: active ? 1 : 0.6 }} />
                    ) : (
                      <MousePointer style={{ width:18, height:18, color: active ? ACCENT : TEXT_MED }} />
                    )}
                    <span style={{ fontSize:9.5, fontWeight:600, color: active ? ACCENT : TEXT_DIM, textAlign:"center", lineHeight:1.2 }}>
                      {tool.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
});

// ── Alert Sheet ─────────────────────────────────────────────────────────────
// Wraps alert functionality in the exact same BottomSheet system used by
// Drawing Tools, Broker, and Watchlist sheets — identical snap, spring,
// GPU optimisations, drag logic, and 60 fps animations.
const AlertSheet = memo(function AlertSheet({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet title="Alerts" onClose={onClose}>
      <AlertSheetContent onClose={onClose} />
    </BottomSheet>
  );
});

// ── Broker Sheet ────────────────────────────────────────────────────────────
// Renders the broker list inside the same BottomSheet system as Drawing Tools.
// Inherits all snap logic, spring config, GPU optimisations, and FPS counter.
const BrokerSheet = memo(function BrokerSheet({ onClose }: { onClose: () => void }) {
  const { loadAccounts } = useBrokerStore();
  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  return (
    <BottomSheet title="Connect Brokers" onClose={onClose}>
      <BrokerListContent onClose={onClose} />
    </BottomSheet>
  );
});

// ── Object Tree Sheet ──────────────────────────────────────────────────────
// memo: re-renders only when onClose ref changes.
// Reactive fields: drawings (ref changes on add/remove/update), selectedDrawingId.
// Actions: stable refs — no re-render cost.
const ObjectTreeSheet = memo(function ObjectTreeSheet({ onClose }: { onClose: () => void }) {
  const drawings             = useDrawingStore(s => s.drawings);
  const selectedDrawingId    = useDrawingStore(s => s.selectedDrawingId);
  const removeDrawing        = useDrawingStore(s => s.removeDrawing);
  const setSelectedDrawingId = useDrawingStore(s => s.setSelectedDrawingId);

  const TOOL_LABEL: Partial<Record<ToolType, string>> = {
    trendline:"Trendline", ray:"Ray", extended:"Extended Line", hline:"H. Line",
    hray:"H. Ray", vline:"V. Line", channel:"Channel", fib:"Fib Ret.",
    fib_channel:"Fib Channel", position_long:"Long Position", position_short:"Short Position",
    date_range:"Date Range", price_range:"Price Range", text:"Text", note:"Note",
    brush:"Brush", highlighter:"Highlighter", rect:"Rectangle", ellipse:"Circle",
    arrow:"Arrow", curve:"Curve", path:"Path",
  };

  return (
    <BottomSheet title={`Object Tree (${drawings.length})`} onClose={onClose} maxHeight="70vh">
      {drawings.length === 0 ? (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 20px", gap:12 }}>
          <List style={{ width:32, height:32, color:TEXT_DIM }} />
          <p style={{ fontSize:13, color:TEXT_DIM, margin:0, textAlign:"center" }}>No drawings on this chart</p>
        </div>
      ) : (
        <div style={{ overflowY:"auto", padding:"8px 14px" }}>
          {drawings.map(d => {
            const isSelected = d.id === selectedDrawingId;
            return (
              <div key={d.id} style={{
                display:"flex", alignItems:"center", gap:10, padding:"10px 10px",
                borderRadius:10, marginBottom:4, cursor:"pointer",
                background: isSelected ? ACCENT_BG : "transparent",
                border:`1px solid ${isSelected ? ACCENT_BORDER : "transparent"}`,
              }} onClick={() => setSelectedDrawingId(isSelected ? null : d.id)}>
                <div style={{
                  width:10, height:10, borderRadius:"50%", flexShrink:0,
                  background: d.style?.color ?? ACCENT,
                  boxShadow:`0 0 6px ${d.style?.color ?? ACCENT}80`,
                }} />
                <span style={{ flex:1, fontSize:12.5, fontWeight:500, color: isSelected ? ACCENT : TEXT_MED }}>
                  {TOOL_LABEL[d.toolType] ?? d.toolType}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); removeDrawing(d.id); }}
                  style={{ width:26, height:26, borderRadius:7, border:"none", background:"rgba(239,68,68,0.12)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
                >
                  <X style={{ width:11, height:11, color:"#ef4444" }} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
});

// ── Layout Bottom Sheet ────────────────────────────────────────────────────
const LAYOUT_PREVIEWS_MB = [
  () => (
    <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:2, width:"100%", height:"100%" }}>
      <div style={{ background:"rgba(56,189,248,0.18)", borderRadius:3 }} />
    </div>
  ),
  () => (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:2, width:"100%", height:"100%" }}>
      {[0,1].map(i => <div key={i} style={{ background:"rgba(56,189,248,0.14)", borderRadius:3 }} />)}
    </div>
  ),
  () => (
    <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gridTemplateRows:"1fr 1fr", gap:2, width:"100%", height:"100%" }}>
      <div style={{ gridRow:"1 / 3", background:"rgba(56,189,248,0.14)", borderRadius:3 }} />
      {[0,1].map(i => <div key={i} style={{ background:"rgba(56,189,248,0.14)", borderRadius:3 }} />)}
    </div>
  ),
  () => (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gridTemplateRows:"1fr 1fr", gap:2, width:"100%", height:"100%" }}>
      {[0,1,2,3].map(i => <div key={i} style={{ background:"rgba(56,189,248,0.14)", borderRadius:3 }} />)}
    </div>
  ),
];
const LAYOUT_LABELS_MB = ["Single", "Side by Side", "Large + 2", "4 Charts"];
type ChartLayoutType = 1 | 2 | 3 | 4;

function LayoutBottomSheet({
  current, onChange, syncTF, onSyncTFChange, onClose,
  namedLayouts, defaultLayoutName, onSaveNamedLayout, onLoadNamedLayout,
  onRenameNamedLayout, onDeleteNamedLayout, activeLayoutId,
}: {
  current: ChartLayoutType;
  onChange: (n: ChartLayoutType) => void;
  syncTF: boolean;
  onSyncTFChange: (v: boolean) => void;
  onClose: () => void;
  namedLayouts: NamedLayout[];
  defaultLayoutName: string;
  onSaveNamedLayout: (name: string) => void;
  onLoadNamedLayout: (layout: NamedLayout) => void;
  onRenameNamedLayout: (id: string, name: string) => void;
  onDeleteNamedLayout: (id: string) => void;
  activeLayoutId: string | null;
}) {
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  const handleSave = () => {
    if (!saveName.trim()) return;
    onSaveNamedLayout(saveName.trim());
    setSaveName("");
    setShowSave(false);
  };

  return (
    <BottomSheet title="Layout Manager" onClose={onClose}>
      <div style={{ padding:"12px 14px 8px" }}>
        <p style={{ margin:"0 0 12px", fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.12em" }}>
          Chart Grid
        </p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {([1, 2, 3, 4] as ChartLayoutType[]).map((n, idx) => {
            const Preview = LAYOUT_PREVIEWS_MB[idx];
            const active = current === n;
            return (
              <button key={n} onClick={() => { onChange(n); onClose(); }}
                style={{
                  padding:10, borderRadius:11, cursor:"pointer",
                  background: active ? "rgba(56,189,248,0.09)" : BTN_BG,
                  boxShadow: active
                    ? "0 0 0 1.5px rgba(56,189,248,0.4), 0 0 20px rgba(56,189,248,0.08)"
                    : `0 0 0 1px ${BTN_BORDER}`,
                  display:"flex", flexDirection:"column", gap:8, alignItems:"center",
                  transition:"all 0.15s",
                }}
                onTouchStart={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)"; }}
                onTouchEnd={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = BTN_BG; }}
              >
                <div style={{ width:"100%", height:52 }}>
                  <Preview />
                </div>
                <span style={{ fontSize:10, fontWeight: active ? 800 : 600, color: active ? "#38bdf8" : TEXT_DIM }}>
                  {LAYOUT_LABELS_MB[idx]}
                </span>
              </button>
            );
          })}
        </div>

        {current > 1 && (
          <div style={{ marginTop:16 }}>
            <p style={{ margin:"0 0 8px", fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.12em" }}>
              Timeframe Sync
            </p>
            <button
              onClick={() => onSyncTFChange(!syncTF)}
              style={{
                width:"100%", display:"flex", alignItems:"center", gap:10,
                padding:"10px 12px", borderRadius:10, cursor:"pointer", border:"none",
                background: syncTF ? "rgba(56,189,248,0.08)" : BTN_BG,
                boxShadow: syncTF
                  ? "0 0 0 1.5px rgba(56,189,248,0.35), 0 0 16px rgba(56,189,248,0.07)"
                  : `0 0 0 1px ${BTN_BORDER}`,
                transition:"all 0.15s",
              }}
            >
              <div style={{
                width:32, height:32, borderRadius:9, flexShrink:0,
                background: syncTF ? "rgba(56,189,248,0.12)" : "rgba(255,255,255,0.06)",
                boxShadow: syncTF ? "0 0 0 1px rgba(56,189,248,0.3)" : `0 0 0 1px ${BTN_BORDER}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all 0.15s",
              }}>
                {syncTF
                  ? <Link2   style={{ width:15, height:15, color:"#38bdf8" }} />
                  : <Unlink2 style={{ width:15, height:15, color:TEXT_DIM }} />}
              </div>
              <div style={{ flex:1, textAlign:"left" }}>
                <p style={{ margin:0, fontSize:11.5, fontWeight:700, color: syncTF ? "#38bdf8" : TEXT_HI }}>
                  {syncTF ? "Synced" : "Independent"}
                </p>
                <p style={{ margin:0, fontSize:9.5, color:TEXT_DIM, marginTop:1, lineHeight:1.4 }}>
                  {syncTF ? "All charts match main timeframe" : "Each chart has own timeframe"}
                </p>
              </div>
              <div style={{
                width:36, height:20, borderRadius:10, flexShrink:0,
                background: syncTF ? "#38bdf8" : "rgba(255,255,255,0.12)",
                position:"relative", transition:"background 0.2s",
              }}>
                <div style={{
                  position:"absolute", top:3, width:14, height:14, borderRadius:"50%",
                  background: syncTF ? ACCENT : "rgba(255,255,255,0.35)",
                  left: syncTF ? 18 : 3,
                  transition:"left 0.2s",
                }} />
              </div>
            </button>
          </div>
        )}

        {/* ── Saved Layouts ── */}
        <div style={{ marginTop:16, borderTop:`1px solid ${BTN_BORDER}`, paddingTop:14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <p style={{ margin:0, fontSize:9, fontWeight:700, color:"rgba(255,255,255,0.25)", textTransform:"uppercase", letterSpacing:"0.12em" }}>
              Saved Layouts
            </p>
            {!showSave && (
              <button
                onClick={() => { setShowSave(true); setSaveName(defaultLayoutName); }}
                style={{ fontSize:11, fontWeight:700, color:ACCENT, background:ACCENT_BG, border:`1px solid ${ACCENT_BORDER}`, borderRadius:8, padding:"4px 10px", cursor:"pointer" }}
              >
                + Save Current
              </button>
            )}
          </div>

          {showSave && (
            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              <input
                autoFocus
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setShowSave(false); }}
                placeholder="Layout name…"
                style={{ flex:1, height:36, borderRadius:9, border:`1px solid ${BTN_BORDER}`, background:BTN_BG, color:TEXT_HI, fontSize:13, padding:"0 10px", outline:"none" }}
              />
              <button onClick={handleSave}
                style={{ height:36, padding:"0 12px", borderRadius:9, fontSize:13, fontWeight:700, cursor:"pointer", background:ACCENT_BG, border:`1px solid ${ACCENT_BORDER}`, color:ACCENT }}>
                Save
              </button>
              <button onClick={() => setShowSave(false)}
                style={{ height:36, padding:"0 10px", borderRadius:9, fontSize:13, cursor:"pointer", background:BTN_BG, border:`1px solid ${BTN_BORDER}`, color:TEXT_DIM }}>
                ✕
              </button>
            </div>
          )}

          {namedLayouts.length === 0 ? (
            <p style={{ fontSize:13, color:TEXT_DIM, textAlign:"center", margin:"16px 0", lineHeight:1.6 }}>
              No saved layouts yet.<br />Save your current chart state to restore it later.
            </p>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {namedLayouts.map(layout => {
                const isActive = layout.id === activeLayoutId;
                return (
                  <div key={layout.id} style={{
                    display:"flex", alignItems:"center", gap:6, padding:"10px 10px", borderRadius:11,
                    background: isActive ? "rgba(59,130,246,0.1)" : BTN_BG,
                    boxShadow: isActive
                      ? "0 0 0 1.5px rgba(59,130,246,0.55), 0 0 16px rgba(59,130,246,0.12)"
                      : `0 0 0 1px ${BTN_BORDER}`,
                    transition:"all 0.15s",
                  }}>
                    {renameId === layout.id ? (
                      <input
                        autoFocus
                        value={renameName}
                        onChange={e => setRenameName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { onRenameNamedLayout(layout.id, renameName || layout.name); setRenameId(null); }
                          if (e.key === "Escape") setRenameId(null);
                        }}
                        onBlur={() => { onRenameNamedLayout(layout.id, renameName || layout.name); setRenameId(null); }}
                        style={{ flex:1, height:32, borderRadius:7, border:`1px solid ${ACCENT_BORDER}`, background:"rgba(255,255,255,0.06)", color:TEXT_HI, fontSize:13, padding:"0 8px", outline:"none" }}
                      />
                    ) : (
                      <>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                            <div style={{ fontSize:13, fontWeight: isActive ? 700 : 600, color: isActive ? "#93c5fd" : TEXT_HI, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{layout.name}</div>
                            {isActive && (
                              <span style={{ fontSize:10, fontWeight:800, color:"#3b82f6", background:"rgba(59,130,246,0.15)", border:"1px solid rgba(59,130,246,0.35)", borderRadius:5, padding:"1px 6px", letterSpacing:"0.04em", flexShrink:0 }}>
                                ✓ Active
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize:11, color: isActive ? "rgba(147,197,253,0.55)" : TEXT_DIM, marginTop:2 }}>{layout.symbol} · {layout.interval}</div>
                        </div>
                        <button
                          onClick={() => {
                            console.log("[mobile] Load tapped — Selected Layout ID:", layout.id, "| Current Active Layout ID:", activeLayoutId, "| Stored Layout ID:", localStorage.getItem("tj_active_layout_id_v1"));
                            onLoadNamedLayout(layout);
                          }}
                          style={{ height:30, padding:"0 10px", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", background: isActive ? "rgba(59,130,246,0.15)" : ACCENT_BG, border: isActive ? "1px solid rgba(59,130,246,0.4)" : `1px solid ${ACCENT_BORDER}`, color: isActive ? "#93c5fd" : ACCENT, flexShrink:0 }}
                        >
                          {isActive ? "Reload" : "Load"}
                        </button>
                        <button
                          onClick={() => { setRenameId(layout.id); setRenameName(layout.name); }}
                          style={{ width:30, height:30, borderRadius:8, fontSize:14, cursor:"pointer", background:"transparent", border:"none", color:TEXT_DIM, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}
                        >✏</button>
                        <button
                          onClick={() => onDeleteNamedLayout(layout.id)}
                          style={{ width:30, height:30, borderRadius:8, fontSize:14, cursor:"pointer", background:"transparent", border:"none", color:"rgba(239,68,68,0.6)", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}
                        >🗑</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

// ── More Options Sheet ─────────────────────────────────────────────────────
function MoreOptionsSheet({
  onClose, onIndicators, onAlerts, onBarReplay, onChartType, onObjectTree, onSettings, onScreenshot, onLayout,
  onFullscreen, isFullscreen, onReset,
}: {
  onClose: () => void;
  onIndicators: () => void;
  onAlerts: () => void;
  onBarReplay?: () => void;
  onChartType: () => void;
  onObjectTree: () => void;
  onSettings: () => void;
  onScreenshot: () => void;
  onLayout: () => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
  onReset: () => void;
}) {
  const TILES: { icon: React.ReactNode; label: string; action: () => void; accent?: string }[] = [
    {
      icon: <Settings2 style={{ width:22, height:22 }} />,
      label: "Chart Settings", accent: "#94a3b8",
      action: () => { onSettings(); onClose(); },
    },
    {
      icon: <RefreshCw style={{ width:22, height:22 }} />,
      label: "Reset Chart", accent: "#34d399",
      action: () => { onReset(); onClose(); },
    },
    {
      icon: <Camera style={{ width:22, height:22 }} />,
      label: "Screenshot", accent: TEXT_MED,
      action: () => { onScreenshot(); onClose(); },
    },
    {
      icon: isFullscreen
        ? <Minimize2 style={{ width:22, height:22 }} />
        : <Maximize2 style={{ width:22, height:22 }} />,
      label: isFullscreen ? "Exit Full" : "Fullscreen", accent: GL_TEAL,
      action: () => { onFullscreen(); onClose(); },
    },
    {
      icon: <LayoutGrid style={{ width:22, height:22 }} />,
      label: "Layout", accent: "#38bdf8",
      action: () => { onLayout(); onClose(); },
    },
    {
      icon: <Activity style={{ width:22, height:22 }} />,
      label: "Indicators", accent: "#818cf8",
      action: () => { onIndicators(); onClose(); },
    },
    {
      icon: <Bell style={{ width:22, height:22 }} />,
      label: "Alerts", accent: "#f59e0b",
      action: () => { onAlerts(); onClose(); },
    },
    {
      icon: <RotateCcw style={{ width:22, height:22 }} />,
      label: "Bar Replay", accent: "#60a5fa",
      action: () => { onBarReplay?.(); onClose(); },
    },
    {
      icon: <BarChart2 style={{ width:22, height:22 }} />,
      label: "Chart Type", accent: ACCENT,
      action: () => { onChartType(); onClose(); },
    },
    {
      icon: <List style={{ width:22, height:22 }} />,
      label: "Object Tree", accent: "#f472b6",
      action: () => { onObjectTree(); onClose(); },
    },
  ];

  return (
    <BottomSheet title="More" onClose={onClose}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10, padding:"12px 14px 8px" }}>
        {TILES.map(tile => (
          <button key={tile.label} onClick={tile.action} style={{
            height:76, borderRadius:12, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:7,
            cursor:"pointer", background:BTN_BG, border:`1px solid ${BTN_BORDER}`, padding:"6px 4px",
          }}
          onTouchStart={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; }}
          onTouchEnd={e => { (e.currentTarget as HTMLButtonElement).style.background = BTN_BG; }}
          >
            <div style={{ color: tile.accent ?? TEXT_MED }}>{tile.icon}</div>
            <span style={{ fontSize:10, fontWeight:600, color: TEXT_DIM, textAlign:"center", lineHeight:1.2 }}>{tile.label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

// ── Chart Settings Sheet ───────────────────────────────────────────────────
// Component tree: ChartSettingsSheet → BottomSheet → content directly.
// Identical depth to DrawingToolsSheet → BottomSheet → content.
// No intermediate wrapper component. All content is inline here.
// ── Module-level options arrays for ChartSettingsSheet StyledSelects ──────────
// MUST be defined outside the component. Inline array literals create new object
// references every render, which defeats memo(StyledSelect)'s prop-equality check.
const CSS_OPTS_TZ        = [{value:"UTC",label:"UTC"},{value:"IST",label:"IST (India)"},{value:"Exchange",label:"Exchange"},{value:"Local",label:"Local Time"}];
const CSS_OPTS_PRECISION = [{value:"2",label:"2 decimals"},{value:"4",label:"4 decimals"},{value:"5",label:"5 decimals"},{value:"8",label:"8 decimals"}];
const CSS_OPTS_BG_TYPE   = [{value:"solid",label:"Solid"},{value:"gradient",label:"Gradient"}];
const CSS_OPTS_GRID      = [{value:"both",label:"Vertical + Horizontal"},{value:"vertical",label:"Vertical Only"},{value:"horizontal",label:"Horizontal Only"},{value:"none",label:"None"}];
const CSS_OPTS_CROSSHAIR = [{value:"normal",label:"Normal"},{value:"magnet",label:"Magnet"}];
const CSS_OPTS_CH_STYLE  = [{value:"solid",label:"Solid"},{value:"dashed",label:"Dashed"},{value:"dotted",label:"Dotted"}];
const CSS_OPTS_FONT_SIZE = [{value:"9",label:"9px"},{value:"10",label:"10px"},{value:"11",label:"11px (default)"},{value:"12",label:"12px"},{value:"13",label:"13px"},{value:"14",label:"14px"}];
const CSS_OPTS_SCALE     = [{value:"normal",label:"Normal"},{value:"log",label:"Logarithmic"},{value:"percent",label:"Percentage"},{value:"indexed",label:"Indexed to 100"}];

// ── ChartSettingsSheet: handler type + section/tab components ─────────────────
// Each section/tab is its own memo'd component so the profiler can attribute
// render cost at section granularity, not just at the sheet level.

type CSSHandlers = {
  upColor: (v: string) => void; downColor: (v: string) => void;
  upBorderColor: (v: string) => void; downBorderColor: (v: string) => void;
  upWickColor: (v: string) => void; downWickColor: (v: string) => void;
  priceLabelBull: (v: string) => void; priceLabelBear: (v: string) => void;
  priceLabelText: (v: string) => void; priceLabelLine: (v: string) => void;
  timezone: (v: string) => void; precision: (v: string) => void;
  bgType: (v: string) => void; bgColor: (v: string) => void;
  gridStyle: (v: string) => void; gridColor: (v: string) => void;
  bordersVisible: (v: boolean) => void; borderColor: (v: string) => void;
  panelBorderVisible: (v: boolean) => void; panelBorderColor: (v: string) => void;
  panelBorderThick: (v: number) => void;
  crosshairColor: (v: string) => void; crosshair: (v: string) => void;
  crosshairStyle: (v: string) => void; crosshairWidth: (v: number) => void;
  textColor: (v: string) => void; fontSize: (v: string) => void;
  linesColor: (v: string) => void;
  scaleMode: (v: string) => void; priceScaleAuto: (v: boolean) => void;
};

type CSSSectionProps = { settings: ChartSettings; h: CSSHandlers };

const CandleSection = memo(function CandleSection({ settings, h }: CSSSectionProps) {
  return (
    <Section title="Candles">
      <ColorPair label="Body" bull={settings.upColor} bear={settings.downColor} onBull={h.upColor} onBear={h.downColor} />
      <ColorPair label="Borders" bull={settings.upBorderColor} bear={settings.downBorderColor} onBull={h.upBorderColor} onBear={h.downBorderColor} />
      <ColorPair label="Wick" bull={settings.upWickColor} bear={settings.downWickColor} onBull={h.upWickColor} onBear={h.downWickColor} last />
    </Section>
  );
});

const PriceLabelSection = memo(function PriceLabelSection({ settings, h }: CSSSectionProps) {
  return (
    <Section title="Price Label">
      <ColorPair label="Background"
        bull={settings.priceLabelBullColor ?? "#22c55e"}
        bear={settings.priceLabelBearColor ?? "#ef4444"}
        onBull={h.priceLabelBull} onBear={h.priceLabelBear} />
      <Row label="Text Color">
        <ColorSwatch value={settings.priceLabelTextColor ?? "#ffffff"} onChange={h.priceLabelText} label="Price Label Text" fallback="#ffffff" />
      </Row>
      <Row label="Line Color" last>
        <ColorSwatch value={settings.priceLabelLineColor ?? "rgba(255,255,255,0.4)"} onChange={h.priceLabelLine} label="Price Line" fallback="rgba(255,255,255,0.4)" />
      </Row>
    </Section>
  );
});

const GridSection = memo(function GridSection({ settings, h }: CSSSectionProps) {
  return (
    <Section title="Grid Lines">
      <Row label="Display">
        <StyledSelect value={settings.gridStyle} onChange={h.gridStyle} options={CSS_OPTS_GRID} />
      </Row>
      <Row label="Color" last>
        <ColorSwatch value={settings.gridColor ?? settings.linesColor} onChange={h.gridColor} label="Grid Color" />
      </Row>
    </Section>
  );
});

const ThemeSection = memo(function ThemeSection({ settings, h }: CSSSectionProps) {
  return (
    <Section title="Background">
      <Row label="Type">
        <StyledSelect value={settings.bgType} onChange={h.bgType} options={CSS_OPTS_BG_TYPE} />
      </Row>
      <Row label="Color" last>
        <ColorSwatch value={settings.bgColor} onChange={h.bgColor} label="Background Color" />
      </Row>
    </Section>
  );
});

// ── Tab-content components ─────────────────────────────────────────────────────
// Each one gets "SettingsTabContent" as its profiler label so the stats aggregate
// across all three tabs (only one is ever mounted at a time).

const TimezoneSection = memo(function TimezoneSection({ settings, h }: CSSSectionProps) {
  return (
    <Section title="Timezone">
      <Row label="Display Timezone" last>
        <StyledSelect value={settings.timezone} onChange={h.timezone} options={CSS_OPTS_TZ} />
      </Row>
    </Section>
  );
});

const CandlesTabContent = memo(function CandlesTabContent({ settings, h }: CSSSectionProps) {
  return (
    <div style={{ padding:"12px 14px 4px" }}>
      <CandleSection settings={settings} h={h} />
      <PriceLabelSection settings={settings} h={h} />
      <TimezoneSection settings={settings} h={h} />
      <Section title="Price Precision">
        <Row label="Decimal Places" last>
          <StyledSelect value={settings.precision} onChange={h.precision} options={CSS_OPTS_PRECISION} />
        </Row>
      </Section>
    </div>
  );
});

const AppearanceTabContent = memo(function AppearanceTabContent({ settings, h }: CSSSectionProps) {
  return (
    <div style={{ padding:"12px 14px 4px" }}>
      <ThemeSection settings={settings} h={h} />
      <GridSection settings={settings} h={h} />
      <Section title="Axis Borders">
        <ToggleRow label="Visible" checked={settings.bordersVisible ?? true} onChange={h.bordersVisible} />
        <Row label="Color" last>
          <ColorSwatch value={settings.borderColor ?? settings.linesColor} onChange={h.borderColor} label="Axis Border Color" />
        </Row>
      </Section>
      <Section title="Chart Panel Border">
        <ToggleRow label="Visible" checked={settings.panelBorderVisible ?? true} onChange={h.panelBorderVisible} />
        <Row label="Color">
          <ColorSwatch value={settings.panelBorderColor ?? "rgba(255,255,255,0.22)"} onChange={h.panelBorderColor} label="Panel Border Color" />
        </Row>
        <Row label="Thickness" last>
          <ThicknessButtons value={settings.panelBorderThickness ?? 1} onChange={h.panelBorderThick} />
        </Row>
      </Section>
      <Section title="Crosshair">
        <Row label="Color">
          <ColorSwatch value={settings.crosshairColor} onChange={h.crosshairColor} label="Crosshair Color" />
        </Row>
        <Row label="Mode">
          <StyledSelect value={settings.crosshair} onChange={h.crosshair} options={CSS_OPTS_CROSSHAIR} />
        </Row>
        <Row label="Line Style">
          <StyledSelect value={settings.crosshairStyle} onChange={h.crosshairStyle} options={CSS_OPTS_CH_STYLE} />
        </Row>
        <Row label="Thickness" last>
          <ThicknessButtons value={settings.crosshairWidth ?? 1} onChange={h.crosshairWidth} />
        </Row>
      </Section>
      <Section title="Text">
        <Row label="Color">
          <ColorSwatch value={settings.textColor} onChange={h.textColor} label="Text Color" />
        </Row>
        <Row label="Font Size" last>
          <StyledSelect value={String(settings.fontSize)} onChange={h.fontSize} options={CSS_OPTS_FONT_SIZE} />
        </Row>
      </Section>
      <Section title="Scale Labels">
        <Row label="Label Color" last>
          <ColorSwatch value={settings.linesColor} onChange={h.linesColor} label="Scale Label Color" />
        </Row>
      </Section>
    </div>
  );
});

const ScaleTabContent = memo(function ScaleTabContent({ settings, h }: CSSSectionProps) {
  return (
    <div style={{ padding:"12px 14px 4px" }}>
      <Section title="Price Scale Mode">
        <Row label="Scale Type">
          <StyledSelect value={settings.scaleMode} onChange={h.scaleMode} options={CSS_OPTS_SCALE} />
        </Row>
        <ToggleRow label="Auto Scale" checked={settings.priceScaleAutoScale} onChange={h.priceScaleAuto} last />
      </Section>
      <Section title="Interaction">
        <Row label="Drag Price Scale" last>
          <span style={{ fontSize:11, color:TEXT_DIM, fontStyle:"italic" }}>Drag the right axis up/down</span>
        </Row>
      </Section>
      <Section title="Reset">
        <Row label="Double-click Axis" last>
          <span style={{ fontSize:11, color:TEXT_DIM, fontStyle:"italic" }}>Double-click price axis to reset</span>
        </Row>
      </Section>
    </div>
  );
});


// ── ChartSettingsSheet — full-screen slide-up modal (mobile-optimised) ────────
// Replaces BottomSheet: no snap points, no drag, no height animation.
// Open:  mount at translateY(100%), rAF flips to translateY(0) — 160ms transform.
// Close: flip to translateY(100%), wait 165ms, then call onClose to unmount.
// No backdrop blur (too expensive on mobile GPU).
// Sticky header + sticky tab bar. Scrollable content. Safe-area aware.
const ChartSettingsSheet = memo(function ChartSettingsSheet({
  settings, onChange, onSaveAsDefault, onClose,
}: {
  settings: ChartSettings;
  onChange: (s: ChartSettings) => void;
  onSaveAsDefault?: (s: ChartSettings) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"Candles"|"Appearance"|"Scale">("Candles");

  // ── Open / close animation state ──────────────────────────────────────────
  // visible: false → translateY(100%) on mount, then rAF flips to true → translateY(0)
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Lock body scroll while open
  useLayoutEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const t = setTimeout(() => onClose(), 165);
    return () => clearTimeout(t);
  }, [onClose]);

  // settingsRef lets `p` read the latest settings without being in the dep array.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const p = useCallback(
    (patch: Partial<ChartSettings>) => onChange({ ...settingsRef.current, ...patch }),
    [onChange],
  );

  // Per-field stable handlers — created once on mount (p is stable).
  const h = useMemo(() => ({
    upColor:            (v: string)  => p({ upColor: v }),
    downColor:          (v: string)  => p({ downColor: v }),
    upBorderColor:      (v: string)  => p({ upBorderColor: v }),
    downBorderColor:    (v: string)  => p({ downBorderColor: v }),
    upWickColor:        (v: string)  => p({ upWickColor: v }),
    downWickColor:      (v: string)  => p({ downWickColor: v }),
    priceLabelBull:     (v: string)  => p({ priceLabelBullColor: v }),
    priceLabelBear:     (v: string)  => p({ priceLabelBearColor: v }),
    priceLabelText:     (v: string)  => p({ priceLabelTextColor: v }),
    priceLabelLine:     (v: string)  => p({ priceLabelLineColor: v }),
    timezone:           (v: string)  => p({ timezone: v as ChartSettings["timezone"] }),
    precision:          (v: string)  => p({ precision: v as ChartSettings["precision"] }),
    bgType:             (v: string)  => p({ bgType: v as ChartSettings["bgType"] }),
    bgColor:            (v: string)  => p({ bgColor: v }),
    gridStyle:          (v: string)  => p({ gridStyle: v as ChartSettings["gridStyle"], gridVisible: v !== "none" }),
    gridColor:          (v: string)  => p({ gridColor: v }),
    bordersVisible:     (v: boolean) => p({ bordersVisible: v }),
    borderColor:        (v: string)  => p({ borderColor: v }),
    panelBorderVisible: (v: boolean) => p({ panelBorderVisible: v }),
    panelBorderColor:   (v: string)  => p({ panelBorderColor: v }),
    panelBorderThick:   (v: number)  => p({ panelBorderThickness: v }),
    crosshairColor:     (v: string)  => p({ crosshairColor: v }),
    crosshair:          (v: string)  => p({ crosshair: v as ChartSettings["crosshair"] }),
    crosshairStyle:     (v: string)  => p({ crosshairStyle: v as ChartSettings["crosshairStyle"] }),
    crosshairWidth:     (v: number)  => p({ crosshairWidth: v }),
    textColor:          (v: string)  => p({ textColor: v }),
    fontSize:           (v: string)  => p({ fontSize: Number(v) }),
    linesColor:         (v: string)  => p({ linesColor: v }),
    scaleMode:          (v: string)  => p({ scaleMode: v as ChartSettings["scaleMode"] }),
    priceScaleAuto:     (v: boolean) => p({ priceScaleAutoScale: v }),
  }), [p]);

  const slideY = (visible && !closing) ? "translateY(0)" : "translateY(100%)";

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(10,12,16,0.99)",
        display: "flex",
        flexDirection: "column",
        transform: slideY,
        transition: "transform 160ms cubic-bezier(0.4,0,0.2,1)",
        willChange: "transform",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        overscrollBehavior: "contain",
      }}
    >
      {/* ── Sticky header ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 4px 0 2px",
        height: 52,
        flexShrink: 0,
        borderBottom: `1px solid ${DIVIDER}`,
        background: "rgba(10,12,16,0.99)",
      }}>
        <button
          onClick={handleClose}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "8px 10px", borderRadius: 10,
            background: "transparent", border: "none",
            color: ACCENT, cursor: "pointer",
            fontSize: 14, fontWeight: 600,
            touchAction: "manipulation",
          }}
          onPointerDown={e => { (e.currentTarget as HTMLElement).style.opacity = "0.65"; }}
          onPointerUp={e   => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          onPointerCancel={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        >
          <ChevronLeft style={{ width: 18, height: 18, strokeWidth: 2.5 }} />
          <span>Back</span>
        </button>

        <span style={{
          position: "absolute", left: "50%", transform: "translateX(-50%)",
          fontSize: 15, fontWeight: 700, color: TEXT_HI,
          pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          Chart Settings
        </span>

        <button
          onClick={handleClose}
          style={{
            padding: "8px 14px", borderRadius: 10,
            background: ACCENT_BG,
            border: `1px solid ${ACCENT_BORDER}`,
            color: ACCENT, fontSize: 13, fontWeight: 700,
            cursor: "pointer", touchAction: "manipulation",
          }}
          onPointerDown={e => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
          onPointerUp={e   => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          onPointerCancel={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        >
          Done
        </button>
      </div>

      {/* ── Sticky tab bar ── */}
      <div style={{
        display: "flex",
        gap: 8,
        padding: "10px 14px",
        borderBottom: `1px solid ${DIVIDER}`,
        flexShrink: 0,
        background: "rgba(10,12,16,0.99)",
      }}>
        {(["Candles","Appearance","Scale"] as const).map(t => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                background: active ? ACCENT_BG : BTN_BG,
                border: `1px solid ${active ? ACCENT_BORDER : BTN_BORDER}`,
                color: active ? ACCENT : TEXT_MED,
                cursor: "pointer",
                outline: "none",
                touchAction: "manipulation",
                transition: "background 0.12s, border-color 0.12s, color 0.12s",
              }}
              onPointerDown={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)";
              }}
              onPointerUp={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = BTN_BG;
              }}
              onPointerCancel={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = BTN_BG;
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* ── Scrollable content — only active tab mounted ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch" as never,
      }}>
        {tab === "Candles"    && <CandlesTabContent    settings={settings} h={h} />}
        {tab === "Appearance" && <AppearanceTabContent settings={settings} h={h} />}
        {tab === "Scale"      && <ScaleTabContent      settings={settings} h={h} />}
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: "12px 14px",
        borderTop: `1px solid ${DIVIDER}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        background: "rgba(10,12,16,0.99)",
      }}>
        <button
          onClick={() => onChange(DEFAULT_CHART_SETTINGS)}
          style={{
            padding: "9px 18px", borderRadius: 10,
            background: "transparent",
            border: `1px solid ${BTN_BORDER}`,
            color: TEXT_DIM,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            touchAction: "manipulation",
          }}
          onPointerDown={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.22)";
            (e.currentTarget as HTMLElement).style.color = TEXT_MED;
          }}
          onPointerUp={e => {
            (e.currentTarget as HTMLElement).style.borderColor = BTN_BORDER;
            (e.currentTarget as HTMLElement).style.color = TEXT_DIM;
          }}
          onPointerCancel={e => {
            (e.currentTarget as HTMLElement).style.borderColor = BTN_BORDER;
            (e.currentTarget as HTMLElement).style.color = TEXT_DIM;
          }}
        >
          Reset Defaults
        </button>
        {onSaveAsDefault && (
          <SaveAsDefaultButton settings={settings} onSaveAsDefault={onSaveAsDefault} />
        )}
      </div>
    </div>,
    document.body,
  );
});

// ── Mini Control Bar ───────────────────────────────────────────────────────
// ── DrawingMiniBar — replaces MiniControlBar when a drawing is selected ───
// memo: receives stable drawing object ref (Zustand map() keeps unmodified objects).
// Zero reactive store subscriptions — only action refs, which are always stable.
// This component will NOT re-render due to any drawing store update unless the
// `drawing` prop itself changes (i.e. the selected drawing was modified).
const DrawingMiniBar = memo(function DrawingMiniBar({
  drawing,
  onAlert,
}: {
  drawing: Drawing;
  onAlert: (d: Drawing) => void;
}) {
  const updateDrawing        = useDrawingStore(s => s.updateDrawing);
  const removeDrawing        = useDrawingStore(s => s.removeDrawing);
  const setSelectedDrawingId = useDrawingStore(s => s.setSelectedDrawingId);
  const [showMore,        setShowMore]        = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTextPicker,  setShowTextPicker]  = useState(false);
  const [showProfitCP,    setShowProfitCP]    = useState(false);
  const [showStopCP,      setShowStopCP]      = useState(false);
  const colorBtnRef  = useRef<HTMLButtonElement>(null);
  const textBtnRef   = useRef<HTMLButtonElement>(null);
  const profitBtnRef = useRef<HTMLButtonElement>(null);
  const stopBtnRef   = useRef<HTMLButtonElement>(null);

  const isPosTool = drawing.toolType === "position_long" || drawing.toolType === "position_short";
  const S: DrawingStyle = drawing.style ?? {};
  const profitHex = S.profitColor ?? "#089981";
  const stopHex   = S.stopColor   ?? "#f23645";

  const MbPtBtn = ({
    children, title, active = false, danger = false, onClick,
    btnRef,
  }: {
    children: React.ReactNode; title?: string; active?: boolean;
    danger?: boolean; onClick?: () => void;
    btnRef?: React.RefObject<HTMLButtonElement | null>;
  }) => (
    <button
      ref={btnRef}
      title={title}
      onClick={onClick}
      onPointerDown={e => e.stopPropagation()}
      onTouchStart={e => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.background = danger ? "rgba(220,60,60,0.14)" : "rgba(255,255,255,0.09)";
        el.style.color = danger ? "#f56565" : "rgba(255,255,255,0.92)";
      }}
      onTouchEnd={e => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.background = active ? "rgba(96,165,250,0.12)" : "transparent";
        el.style.color = danger ? "rgba(220,80,80,0.75)" : active ? "#60A5FA" : "rgba(255,255,255,0.62)";
      }}
      style={{
        width: 42, height: 42, borderRadius: 9, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? "rgba(96,165,250,0.12)" : "transparent",
        border: "none",
        cursor: "pointer", touchAction: "manipulation",
        color: danger ? "rgba(220,80,80,0.75)" : active ? "#60A5FA" : "rgba(255,255,255,0.72)",
        transition: "background .1s, color .1s",
      }}
    >{children}</button>
  );

  const MbPtSep = () => (
    <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.09)", flexShrink: 0, margin: "0 2px" }} />
  );

  const MbTvBtn = ({
    children, title, active = false, danger = false, wide = false, onClick,
    btnRef,
  }: {
    children: React.ReactNode; title?: string; active?: boolean;
    danger?: boolean; wide?: boolean; onClick?: () => void;
    btnRef?: React.RefObject<HTMLButtonElement | null>;
  }) => (
    <button
      ref={btnRef}
      title={title}
      onClick={onClick}
      onPointerDown={e => e.stopPropagation()}
      onTouchStart={e => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.background = danger ? "rgba(220,60,60,0.14)" : "rgba(255,255,255,0.08)";
        el.style.color = danger ? "#f05050" : "#e8ecf0";
      }}
      onTouchEnd={e => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.background = active ? "rgba(255,255,255,0.10)" : "transparent";
        el.style.color = danger ? "rgba(200,200,210,0.82)" : active ? "#ffffff" : "rgba(200,205,215,0.82)";
      }}
      style={{
        minWidth: wide ? 68 : 42, height: 42, borderRadius: 9, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
        border: `1px solid ${active ? "rgba(255,255,255,0.13)" : "transparent"}`,
        background: active ? "rgba(255,255,255,0.10)" : "transparent",
        cursor: "pointer", touchAction: "manipulation", padding: "0 5px",
        color: danger ? "rgba(200,200,210,0.82)" : active ? "#ffffff" : "rgba(200,205,215,0.82)",
        transition: "background .12s, border-color .12s, color .12s",
        outline: "none",
      }}
    >{children}</button>
  );

  const onUpdate = useCallback((patch: Partial<DrawingStyle>) => {
    const merged = { ...S, ...patch };
    updateDrawing(drawing.id, { style: merged });
    // Persist to server
    fetch(`${BASE}/api/drawings/${drawing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style: patch }),
    }).catch(() => {});
  }, [drawing.id, S, updateDrawing]);

  const thickOptions = [1, 2, 3, 4];
  const nextThick = thickOptions[(thickOptions.indexOf(S.thickness ?? 1) + 1) % thickOptions.length];
  const lsOptions: Array<DrawingStyle["lineStyle"]> = ["solid", "dashed", "dotted"];
  const nextLS = lsOptions[(lsOptions.indexOf(S.lineStyle ?? "solid") + 1) % lsOptions.length];

  const Btn = ({ onClick, active = false, danger = false, title, children }: {
    onClick: () => void; active?: boolean; danger?: boolean; title?: string; children: React.ReactNode;
  }) => (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: danger ? "rgba(239,68,68,0.15)" : active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${danger ? "rgba(239,68,68,0.4)" : active ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.09)"}`,
        cursor: "pointer", color: danger ? "rgba(239,68,68,0.9)" : "rgba(255,255,255,0.82)",
        touchAction: "manipulation",
      }}
    >{children}</button>
  );

  const Sep = () => (
    <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.09)", flexShrink: 0, margin: "0 1px" }} />
  );

  return (
    <div
      data-drawing-popup
      onPointerDown={e => e.stopPropagation()}
      style={{ flexShrink: 0, padding: "5px 8px", background: "transparent" }}
    >
      <style>{`
        @keyframes mbBarFlipIn {
          from { opacity:0; transform: perspective(600px) rotateX(-70deg) scale(0.96); }
          to   { opacity:1; transform: perspective(600px) rotateX(0deg) scale(1); }
        }
      `}</style>
      <div style={{
        height: 54,
        display: "flex", alignItems: "center",
        background: GL_BG,
        backdropFilter: "blur(28px) saturate(180%)", WebkitBackdropFilter: "blur(28px) saturate(180%)",
        border: `1px solid ${GL_BORDER}`,
        borderRadius: 18,
        paddingLeft: 6, paddingRight: 6, gap: 1,
        boxShadow: GL_GLOW,
        animation: "mbBarFlipIn .24s cubic-bezier(0.16,1,0.3,1) both",
        transformOrigin: "bottom center",
        overflowX: "auto", scrollbarWidth: "none",
        userSelect: "none",
      }}>

        {isPosTool ? (
          /* ── Position tool controls — matches desktop PositionToolbar exactly ── */
          <>
            {/* Profit zone color — bucket icon + color swatch */}
            <MbPtBtn
              title="Profit zone color"
              active={showProfitCP}
              btnRef={profitBtnRef}
              onClick={() => { setShowProfitCP(v => !v); setShowStopCP(false); setShowMore(false); }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <img src={ptBucketUrl} width={22} height={22} draggable={false}
                  style={{ filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} />
                <div style={{ width: 18, height: 3, borderRadius: 1.5, background: hexToRgba(profitHex, 0.95) }} />
              </div>
            </MbPtBtn>

            {/* Stop zone color — bucket icon + color swatch */}
            <MbPtBtn
              title="Stop zone color"
              active={showStopCP}
              btnRef={stopBtnRef}
              onClick={() => { setShowStopCP(v => !v); setShowProfitCP(false); setShowMore(false); }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <img src={ptBucketUrl} width={22} height={22} draggable={false}
                  style={{ filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} />
                <div style={{ width: 18, height: 3, borderRadius: 1.5, background: hexToRgba(stopHex, 0.95) }} />
              </div>
            </MbPtBtn>

            <MbPtSep />

            {/* Reverse long ↔ short */}
            <MbPtBtn
              title={drawing.toolType === "position_long" ? "Flip to Short" : "Flip to Long"}
              onClick={() => {
                const newType: ToolType = drawing.toolType === "position_long" ? "position_short" : "position_long";
                updateDrawing(drawing.id, { toolType: newType });
                fetch(`${BASE}/api/drawings/${drawing.id}`, {
                  method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ toolType: newType }),
                }).catch(() => {});
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4 4 4"/>
                <path d="M17 8v12m0 0 4-4m-4 4-4-4"/>
              </svg>
            </MbPtBtn>

            {/* Alert */}
            <MbPtBtn title="Create alert" onClick={() => onAlert(drawing)}>
              <img src={ptAlertUrl} width={22} height={22} draggable={false}
                style={{ filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} />
            </MbPtBtn>

            <MbPtSep />

            {/* Delete */}
            <MbPtBtn title="Delete position" danger onClick={() => { removeDrawing(drawing.id); setSelectedDrawingId(null); }}>
              <img src={ptBinUrl} width={22} height={22} draggable={false}
                style={{ filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} />
            </MbPtBtn>

            <MbPtSep />

            {/* More (dots) */}
            <MbPtBtn title="More options" active={showMore} onClick={() => setShowMore(v => !v)}>
              <img src={ptDotsUrl} width={20} height={7} draggable={false}
                style={{ filter: "brightness(0) invert(1)", opacity: 0.88, display: "block" }} />
            </MbPtBtn>

            {/* Spacer + Close */}
            <div style={{ flex: 1, minWidth: 4 }} />
            <MbPtBtn title="Deselect" onClick={() => setSelectedDrawingId(null)}>
              <svg width="17" height="17" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="2" y1="2" x2="12" y2="12"/>
                <line x1="12" y1="2" x2="2" y2="12"/>
              </svg>
            </MbPtBtn>
          </>
        ) : (
          /* ── Generic drawing controls — matches desktop FloatingMiniToolbar ── */
          <>
            {/* Pencil (line colour) + swatch */}
            <MbTvBtn
              title="Line colour"
              active={showColorPicker}
              btnRef={colorBtnRef}
              onClick={() => { setShowColorPicker(v => !v); setShowTextPicker(false); setShowMore(false); }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                <svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                  <path d="m15 5 4 4"/>
                </svg>
                <div style={{ width: 18, height: 3, borderRadius: 1.5, background: S.color ?? "#2962ff" }} />
              </div>
            </MbTvBtn>

            {/* Text / label colour + swatch */}
            <MbTvBtn
              title="Text colour / label"
              active={showTextPicker}
              btnRef={textBtnRef}
              onClick={() => { setShowTextPicker(v => !v); setShowColorPicker(false); setShowMore(false); }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                <span style={{ fontSize: 22, fontFamily: "Georgia,'Times New Roman',serif", fontWeight: 700, lineHeight: 1, color: "inherit", display: "block" }}>T</span>
                <div style={{ width: 18, height: 3, borderRadius: 1.5, background: S.labelColor ?? S.color ?? "#2962ff" }} />
              </div>
            </MbTvBtn>

            <MbPtSep />

            {/* Alert */}
            <MbTvBtn title="Add price alert" onClick={() => onAlert(drawing)}>
              <img src={icoAlertUrl} width={22} height={22} draggable={false}
                style={{ display: "block", filter: "brightness(0) invert(1)", opacity: 0.8, userSelect: "none", pointerEvents: "none" }} />
            </MbTvBtn>

            <MbPtSep />

            {/* Thickness — cycles */}
            <MbTvBtn title="Line thickness" wide onClick={() => onUpdate({ thickness: nextThick })}>
              <svg width="16" height="3" viewBox="0 0 16 3">
                <rect x="0" y="0.5" width="16" height={Math.min(S.thickness ?? 1, 2.5)} rx="1" fill="currentColor"/>
              </svg>
              <span style={{ fontSize: 12, fontFamily: "ui-monospace,monospace", whiteSpace: "nowrap" }}>{S.thickness ?? 1}px</span>
            </MbTvBtn>

            {/* Line style — cycles */}
            <MbTvBtn title="Line style" onClick={() => onUpdate({ lineStyle: nextLS })}>
              <svg width="26" height="8" viewBox="0 0 26 8">
                <line x1="0" y1="4" x2="26" y2="4" stroke="currentColor" strokeWidth="1.8"
                  strokeDasharray={S.lineStyle === "dashed" ? "6 3" : S.lineStyle === "dotted" ? "1.5 3" : undefined}
                  strokeLinecap="round"/>
              </svg>
            </MbTvBtn>

            <MbPtSep />

            {/* Delete */}
            <MbTvBtn title="Delete drawing" danger onClick={() => { removeDrawing(drawing.id); setSelectedDrawingId(null); }}>
              <img src={icoBinUrl} width={21} height={21} draggable={false}
                style={{ display: "block", filter: "brightness(0) invert(1)", opacity: 0.8, userSelect: "none", pointerEvents: "none" }} />
            </MbTvBtn>

            <MbPtSep />

            {/* More (3 dots) */}
            <MbTvBtn title="More options" active={showMore} onClick={() => setShowMore(v => !v)}>
              <img src={ico3DotsUrl} width={22} height={22} draggable={false}
                style={{ display: "block", filter: "brightness(0) invert(1)", opacity: showMore ? 1 : 0.8, userSelect: "none", pointerEvents: "none" }} />
            </MbTvBtn>

            {/* Spacer + Close */}
            <div style={{ flex: 1, minWidth: 4 }} />
            <MbTvBtn title="Deselect" onClick={() => setSelectedDrawingId(null)}>
              <svg width="17" height="17" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="2" y1="2" x2="12" y2="12"/>
                <line x1="12" y1="2" x2="2" y2="12"/>
              </svg>
            </MbTvBtn>
          </>
        )}
      </div>

      {/* ── More dropdown — generic tools only — matches desktop FloatingMiniToolbar more-menu */}
      {!isPosTool && showMore && (
        <div
          onClick={() => setShowMore(false)}
          style={{ position: "fixed", inset: 0, zIndex: 205 }}>
          <div
            data-drawing-popup
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            style={{
              position: "fixed", bottom: 62, left: "50%", transform: "translateX(-50%)",
              background: "rgba(16,18,21,0.98)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
              boxShadow: "0 8px 32px rgba(0,0,0,0.75)", padding: "4px",
              zIndex: 206, minWidth: 168,
              animation: "mbBarFlipIn .18s cubic-bezier(0.16,1,0.3,1) both",
            }}>
            {[
              {
                label: "Settings",
                icon: <img src={icoSettingUrl} width={14} height={14} draggable={false} style={{ filter: "brightness(0) invert(1)", opacity: 0.7 }} />,
                action: () => setShowMore(false),
                highlight: false,
              },
              {
                label: drawing.isLocked ? "Unlock" : "Lock",
                icon: <img src={icoLockUrl} width={14} height={14} draggable={false} style={{ filter: drawing.isLocked ? "brightness(0) saturate(100%) invert(48%) sepia(80%) saturate(400%) hue-rotate(195deg) brightness(110%)" : "brightness(0) invert(1)", opacity: 0.9 }} />,
                action: () => { updateDrawing(drawing.id, { isLocked: !drawing.isLocked }); setShowMore(false); },
                highlight: drawing.isLocked,
              },
            ].map(item => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "7px 10px", background: "transparent", border: "none",
                  cursor: "pointer", borderRadius: 7,
                  color: item.highlight ? "#60A5FA" : "rgba(200,205,215,0.85)",
                  fontSize: 12, textAlign: "left",
                }}
                onTouchStart={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                onTouchEnd={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ opacity: 0.8, display: "flex", alignItems: "center" }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Generic color pickers */}
      {showColorPicker && (
        <ColorPickerGlass
          value={S.color ?? "#2962ff"}
          onChange={c => onUpdate({ color: c })}
          onClose={() => setShowColorPicker(false)}
          anchorRect={colorBtnRef.current?.getBoundingClientRect() ?? null}
        />
      )}
      {showTextPicker && (
        <ColorPickerGlass
          value={S.labelColor ?? S.color ?? "#2962ff"}
          onChange={c => onUpdate({ labelColor: c })}
          onClose={() => setShowTextPicker(false)}
          anchorRect={textBtnRef.current?.getBoundingClientRect() ?? null}
        />
      )}

      {/* ── Position tool color pickers */}
      {showProfitCP && (
        <ColorPickerGlass
          value={S.profitColor ?? "#089981"}
          onChange={c => onUpdate({ profitColor: c })}
          onClose={() => setShowProfitCP(false)}
          anchorRect={profitBtnRef.current?.getBoundingClientRect() ?? null}
        />
      )}
      {showStopCP && (
        <ColorPickerGlass
          value={S.stopColor ?? "#f23645"}
          onChange={c => onUpdate({ stopColor: c })}
          onClose={() => setShowStopCP(false)}
          anchorRect={stopBtnRef.current?.getBoundingClientRect() ?? null}
        />
      )}
    </div>
  );
});

// ── Mini watchlist popup — compact floating panel anchored above symbol button ──

const MiniWatchlistRow = memo(function MiniWatchlistRow({
  item, isActive, onSelect,
}: {
  item: { symbol: string; badge: string; label?: string };
  isActive: boolean;
  onSelect: () => void;
}) {
  const tick = useSymbolTick(item.symbol);
  const price  = tick?.price ?? null;
  const pct    = tick?.changePct ?? 0;
  const isUp   = pct >= 0;

  return (
    <div
      onClick={onSelect}
      onTouchStart={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
      onTouchEnd={e => { (e.currentTarget as HTMLElement).style.background = isActive ? "rgba(255,255,255,0.06)" : "transparent"; }}
      style={{
        display:"flex", alignItems:"center", gap:10,
        padding:"9px 12px",
        background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
        borderBottom:"1px solid rgba(255,255,255,0.05)",
        cursor:"pointer",
        WebkitTapHighlightColor:"transparent",
        userSelect:"none",
        transition:"background 0.10s",
      }}
    >
      {/* Badge icon */}
      <div style={{
        width:34, height:34, borderRadius:"50%", flexShrink:0,
        background: isActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)",
        border: isActive ? "1px solid rgba(255,255,255,0.24)" : "1px solid rgba(255,255,255,0.08)",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize: item.badge.length > 4 ? 7 : item.badge.length > 3 ? 7.5 : 8,
        fontWeight:900, color: isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)",
        transition:"all 0.10s",
      }}>
        {item.badge.slice(0,5)}
      </div>

      {/* Name + label */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{
          fontSize:13, fontWeight:600,
          color: isActive ? "#fff" : "rgba(255,255,255,0.82)",
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
          display:"flex", alignItems:"center", gap:5, lineHeight:1.3,
        }}>
          {item.badge}
          {isActive && (
            <span style={{
              fontSize:7, padding:"1px 4px", borderRadius:3, flexShrink:0,
              background:"rgba(183,255,90,0.14)", color:"#B7FF5A", fontWeight:700, letterSpacing:"0.05em",
            }}>LIVE</span>
          )}
        </div>
        {item.label && (
          <div style={{ fontSize:10.5, color:"rgba(255,255,255,0.28)", marginTop:1.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {item.label}
          </div>
        )}
      </div>

      {/* Price / change */}
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <div style={{ fontSize:12.5, fontWeight:600, color:"rgba(255,255,255,0.88)", fontVariantNumeric:"tabular-nums", lineHeight:1.3 }}>
          {price !== null ? fmtPrice(price, item.symbol) : "—"}
        </div>
        <div style={{ fontSize:10.5, color: isUp ? "#00e676" : "#ff4d67", fontVariantNumeric:"tabular-nums", marginTop:1.5 }}>
          {isUp ? "+" : ""}{pct.toFixed(2)}%
        </div>
      </div>
    </div>
  );
});

// ── Market Watchlist Sheet ─────────────────────────────────────────────────
type MktTab = "Watchlist" | "Crypto" | "Forex" | "Metals" | "Commodities" | "Indices";
const MKT_TABS: MktTab[] = ["Watchlist", "Crypto", "Forex", "Metals", "Commodities", "Indices"];

const MKT_CONTRACT_LABELS: Record<string, string> = {
  perpetual_futures: "Perp",
  forex:             "FX",
  index:             "Index",
  commodity:         "Cmdty",
  metal:             "Metal",
  crypto:            "Perp",
  indices:           "Index",
  commodities:       "Cmdty",
};

function fmtMktPrice(price: number | undefined): string {
  if (!price) return "—";
  if (price >= 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (price >= 100)   return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)     return price.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return price.toLocaleString("en-US", { minimumFractionDigits: 5, maximumFractionDigits: 5 });
}

interface MktSymbolInfo {
  symbol: string;
  name: string;
  contractType: string;
}

const MktRow = memo(function MktRow({
  symbol, name, contractType, isFavorite, onStar, onTap,
}: {
  symbol: string;
  name: string;
  contractType: string;
  isFavorite: boolean;
  onStar: () => void;
  onTap: () => void;
}) {
  const tick      = useSymbolTick(symbol);
  const price     = tick?.price;
  const changePct = tick?.changePct ?? 0;
  const isUp      = changePct >= 0;
  const tag       = MKT_CONTRACT_LABELS[contractType] ?? contractType;

  // Optimistic star visual — fills at pointer-down, zero latency
  const [visualFav, setVisualFav] = useState(isFavorite);
  useEffect(() => { setVisualFav(isFavorite); }, [isFavorite]);

  const handleStarDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setVisualFav(v => !v);
    onStar();
  }, [onStar]);

  return (
    <div
      onClick={e => { if ((e.target as HTMLElement).closest("button")) return; onTap(); }}
      style={{
        display: "flex", alignItems: "center",
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        gap: 9, minHeight: 58, cursor: "pointer",
      }}
    >
      {/* Star — fires on pointer-down for instant response */}
      <button
        onPointerDown={handleStarDown}
        style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "6px 4px", flexShrink: 0, lineHeight: 0,
          touchAction: "manipulation",
        }}
      >
        <Star
          size={15}
          fill={visualFav ? "#f59e0b" : "rgba(148,163,184,0.15)"}
          color={visualFav ? "#f59e0b" : "rgba(148,163,184,0.35)"}
          strokeWidth={1.8}
          style={{ transition: "fill 0.08s, color 0.08s" }}
        />
      </button>

      {/* Symbol + name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: "0.01em" }}>{symbol}</span>
          <span style={{
            fontSize: 9, fontWeight: 600, color: "#94a3b8",
            background: "rgba(148,163,184,0.10)", border: "1px solid rgba(148,163,184,0.16)",
            borderRadius: 4, padding: "1px 4px", letterSpacing: "0.03em", flexShrink: 0,
          }}>
            {tag}
          </span>
        </div>
        <div style={{ color: "rgba(148,163,184,0.45)", fontSize: 10.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
      </div>

      {/* Price */}
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 72 }}>
        <div style={{ color: price ? "#fff" : "rgba(148,163,184,0.3)", fontWeight: 600, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
          {price ? `$${fmtMktPrice(price)}` : "—"}
        </div>
      </div>

      {/* Change badge */}
      <div style={{
        minWidth: 56, padding: "4px 6px", borderRadius: 6,
        textAlign: "center", fontSize: 11.5, fontWeight: 700,
        fontVariantNumeric: "tabular-nums", flexShrink: 0,
        background: tick ? (isUp ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)") : "rgba(148,163,184,0.07)",
        color: tick ? (isUp ? "#10b981" : "#ef4444") : "rgba(148,163,184,0.3)",
        border: tick
          ? (isUp ? "1px solid rgba(16,185,129,0.22)" : "1px solid rgba(239,68,68,0.22)")
          : "1px solid rgba(148,163,184,0.1)",
      }}>
        {tick ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
      </div>
    </div>
  );
});

function MarketWatchlistSheet({
  onSelect, onClose, activeSymbol,
}: {
  onSelect: (symbol: string) => void;
  onClose: () => void;
  activeSymbol: string;
}) {
  const [activeTab, setActiveTab]           = useState<MktTab>("Watchlist");
  const [search, setSearch]                 = useState("");
  const [deltaSymbols, setDeltaSymbols]     = useState<MktSymbolInfo[]>([]);
  const [loadingBroker, setLoadingBroker]   = useState(false);

  const { items: wlItems, addSymbol, toggleFavorite } = useBrokerWatchlistStore();

  const watchMap = useRef(new Map<string, typeof wlItems[0]>());
  useEffect(() => {
    const m = new Map<string, typeof wlItems[0]>();
    wlItems.forEach(i => m.set(i.symbol, i));
    watchMap.current = m;
  }, [wlItems]);

  useEffect(() => {
    setLoadingBroker(true);
    fetch(`${BASE}/api/symbols?broker=delta`).then(r => r.json())
      .then(d => {
        setDeltaSymbols((d as { symbols: MktSymbolInfo[] }).symbols ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingBroker(false));
  }, []);

  const handleStar = useCallback((symbol: string) => {
    const item = watchMap.current.get(symbol);
    if (item) toggleFavorite(item.id, item.isFavorite);
    else addSymbol(symbol, true);
  }, [addSymbol, toggleFavorite]);

  // Stable per-symbol callback cache so MktRow.memo works correctly
  const starCbCache = useRef(new Map<string, () => void>());
  const tapCbCache  = useRef(new Map<string, () => void>());

  const prevHandleStar = useRef(handleStar);
  const prevOnSelect   = useRef(onSelect);
  if (prevHandleStar.current !== handleStar || prevOnSelect.current !== onSelect) {
    prevHandleStar.current = handleStar;
    prevOnSelect.current   = onSelect;
    starCbCache.current.clear();
    tapCbCache.current.clear();
  }

  const getStarCb = useCallback((symbol: string) => {
    if (!starCbCache.current.has(symbol)) {
      starCbCache.current.set(symbol, () => handleStar(symbol));
    }
    return starCbCache.current.get(symbol)!;
  }, [handleStar]);

  const getTapCb = useCallback((symbol: string) => {
    if (!tapCbCache.current.has(symbol)) {
      tapCbCache.current.set(symbol, () => { onSelect(symbol); onClose(); });
    }
    return tapCbCache.current.get(symbol)!;
  }, [onSelect, onClose]);

  const rows = useMemo((): MktSymbolInfo[] => {
    let r: MktSymbolInfo[];
    if (activeTab === "Watchlist") {
      r = wlItems
        .filter(i => i.isFavorite)
        .map(i => ({ symbol: i.symbol, name: i.label, contractType: SYMBOL_CATALOG[i.symbol]?.market?.toLowerCase() ?? "other" }));
    } else if (activeTab === "Crypto") {
      r = deltaSymbols;
    } else if (activeTab === "Forex") {
      r = REGISTRY_FOREX;
    } else if (activeTab === "Metals") {
      r = REGISTRY_METALS;
    } else if (activeTab === "Commodities") {
      r = REGISTRY_COMMODITIES;
    } else {
      r = REGISTRY_INDICES;
    }
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      r = r.filter(row => row.symbol.toUpperCase().includes(q) || row.name.toUpperCase().includes(q));
    }
    return r;
  }, [activeTab, search, wlItems, deltaSymbols]);

  // ── Reuse the exact BottomSheet used by Drawing Tools ──────────────────────
  // Tabs + search + column headers are sticky inside the BottomSheet's scroll
  // area so they pin at the top while the symbol list scrolls in FULL state.
  return (
    <BottomSheet title="Market" onClose={onClose}>
      {/* ── Sticky header block: pinned to top of scroll area in FULL state ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 2,
        background: SHEET_BG,
      }}>
        {/* Search bar — always visible */}
        <div style={{ padding: "4px 12px 2px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 10, padding: "7px 12px",
          }}>
            <Search size={13} color="rgba(148,163,184,0.45)" style={{ flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${activeTab === "Watchlist" ? "symbols" : activeTab}…`}
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "#fff", fontSize: 13, caretColor: "#f59e0b", minWidth: 0,
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, color: "rgba(148,163,184,0.5)", flexShrink: 0 }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", padding: "0 6px" } as React.CSSProperties}>
          {MKT_TABS.map(tab => {
            const active = tab === activeTab;
            return (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSearch(""); }}
                style={{
                  flexShrink: 0, padding: "9px 13px 10px", border: "none",
                  background: "transparent", cursor: "pointer",
                  fontSize: 13, fontWeight: active ? 700 : 400,
                  color: active ? "#f59e0b" : "rgba(148,163,184,0.50)",
                  position: "relative", transition: "color 0.15s", whiteSpace: "nowrap",
                }}
              >
                {tab}
                {active && (
                  <div style={{
                    position: "absolute", bottom: 0,
                    left: "16%", right: "16%",
                    height: 2, borderRadius: "2px 2px 0 0", background: "#f59e0b",
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Column headers */}
        <div style={{
          display: "flex", alignItems: "center",
          padding: "4px 14px 5px",
          background: "rgba(255,255,255,0.02)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ width: 24, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 10.5, color: "rgba(148,163,184,0.4)", fontWeight: 500 }}>Contract</div>
          <div style={{ minWidth: 76, textAlign: "right", fontSize: 10.5, color: "rgba(148,163,184,0.4)", fontWeight: 500 }}>Price</div>
          <div style={{ minWidth: 64, textAlign: "center", marginLeft: 8, fontSize: 10.5, color: "rgba(148,163,184,0.4)", fontWeight: 500 }}>24h Chg.</div>
        </div>
      </div>

      {/* ── Symbol list — lives directly in BottomSheet's managed scroll area ── */}
      {loadingBroker && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "36px 0", gap: 8, color: "rgba(148,163,184,0.45)" }}>
          <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 13 }}>Loading…</span>
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {!loadingBroker && rows.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "52px 24px", color: "rgba(148,163,184,0.35)", gap: 10 }}>
          <TrendingUp size={30} strokeWidth={1} />
          <p style={{ fontSize: 13.5, margin: 0 }}>
            {activeTab === "Watchlist" ? "No favourites yet" : `No ${activeTab} symbols found`}
          </p>
          {activeTab === "Watchlist" && (
            <p style={{ fontSize: 12, margin: 0, color: "rgba(148,163,184,0.25)", textAlign: "center" }}>
              Tap ★ on any symbol to add it here
            </p>
          )}
        </div>
      )}

      {!loadingBroker && rows.map(row => {
        const wItem      = watchMap.current.get(row.symbol);
        const isFavorite = wItem?.isFavorite ?? false;
        return (
          <MktRow
            key={row.symbol}
            symbol={row.symbol}
            name={row.name}
            contractType={row.contractType}
            isFavorite={isFavorite}
            onStar={getStarCb(row.symbol)}
            onTap={getTapCb(row.symbol)}
          />
        );
      })}

      <div style={{ height: 20 }} />
    </BottomSheet>
  );
}

// ── MiniWatchlistPopup ─────────────────────────────────────────────────────
function MiniWatchlistPopup({
  items, activeSymbol, anchorRect, onSelect, onClose,
}: {
  items: { symbol: string; badge: string; label?: string }[];
  activeSymbol: string;
  anchorRect: DOMRect;
  onSelect: (sym: string) => void;
  onClose: () => void;
}) {
  // Delay backdrop so the opening tap can't instantly close the popup
  const backdropReadyRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { backdropReadyRef.current = true; }, 200);
    return () => clearTimeout(t);
  }, []);

  const POPUP_W    = 248;
  const POPUP_MAXH = 340;
  const left       = Math.max(8, Math.min(anchorRect.left, window.innerWidth - POPUP_W - 8));
  const bottom     = window.innerHeight - anchorRect.top + 8;

  return createPortal(
    <div
      onPointerDown={() => { if (backdropReadyRef.current) onClose(); }}
      style={{ position:"fixed", inset:0, zIndex:450 }}
    >
      <div
        onPointerDown={e => e.stopPropagation()}
        style={{
          position:"fixed", left, bottom,
          width:POPUP_W, maxHeight:POPUP_MAXH,
          background:"rgba(7,8,17,0.98)",
          backdropFilter:"blur(12px) saturate(160%)",
          WebkitBackdropFilter:"blur(12px) saturate(160%)",
          border:"1px solid rgba(255,255,255,0.12)",
          borderRadius:16,
          overflow:"hidden",
          display:"flex", flexDirection:"column",
          boxShadow:[
            "0 -8px 40px rgba(0,0,0,0.88)",
            "0 -2px 10px rgba(0,0,0,0.55)",
            "0 0 0 1px rgba(255,255,255,0.04) inset",
          ].join(","),
        }}
      >
        {/* Header */}
        <div style={{
          display:"flex", alignItems:"center",
          padding:"10px 12px 8px",
          borderBottom:"1px solid rgba(255,255,255,0.07)",
          flexShrink:0,
        }}>
          <span style={{
            flex:1, fontSize:10.5, fontWeight:700, letterSpacing:"0.08em",
            textTransform:"uppercase", color:"rgba(255,255,255,0.38)",
          }}>Watchlist</span>
          <button
            onClick={onClose}
            style={{
              width:22, height:22, borderRadius:6, cursor:"pointer",
              background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)",
              display:"flex", alignItems:"center", justifyContent:"center",
            }}
          >
            <X style={{ width:11, height:11, color:"rgba(255,255,255,0.40)" }} />
          </button>
        </div>

        {/* Scrollable list */}
        <div style={{ overflowY:"auto", flex:1, scrollbarWidth:"none", WebkitOverflowScrolling:"touch" } as React.CSSProperties}>
          {items.map(item => (
            <MiniWatchlistRow
              key={item.symbol}
              item={item}
              isActive={item.symbol === activeSymbol}
              onSelect={() => { onSelect(item.symbol); onClose(); }}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── MiniControlBar ─────────────────────────────────────────────────────────
// memo() is critical: this component sits outside the sheet tree but inside
// MobileChartLayout. Without memo, every parent state change (showSettings,
// showMoreSheet, etc.) re-renders it. With memo it only re-renders when its
// own props change — i.e. symbol/interval/watchlist/fullscreen/broker status.
const MiniControlBar = memo(function MiniControlBar({
  activeKey, badge, interval, watchlistItems,
  onSelectSymbol, onTF, onDraw, onBroker, onMore, onPrev, onNext, onFullscreen, isFullscreen,
  brokerConnected,
}: {
  activeKey: string; badge: string; interval: string;
  watchlistItems: { symbol: string; badge?: string }[];
  onSelectSymbol: (key: string) => void; onTF: () => void; onDraw: () => void;
  onBroker: () => void; onMore: () => void;
  onPrev: () => void; onNext: () => void;
  onFullscreen: () => void; isFullscreen: boolean;
  brokerConnected: boolean;
}) {
  const currentIdx = watchlistItems.findIndex(i => i.symbol === activeKey);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < watchlistItems.length - 1 && currentIdx >= 0;

  const [showMarketSheet, setShowMarketSheet] = useState(false);
  const symbolBtnRef = useRef<HTMLButtonElement>(null);

  const handleSymbolBtn = useCallback(() => {
    setShowMarketSheet(true);
  }, []);

  const handleSheetSelect = useCallback((sym: string) => {
    setShowMarketSheet(false);
    onSelectSymbol(sym);
  }, [onSelectSymbol]);

  const CtrlBtn = ({ onClick, children, active = false, disabled = false }: {
    onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      onPointerDown={e => {
        if (disabled) return;
        e.currentTarget.style.transition = "transform 0.09s ease";
        e.currentTarget.style.transform  = "scale(0.84)";
      }}
      onPointerUp={e => {
        e.currentTarget.style.transition = "transform 0.30s cubic-bezier(0.34,1.56,0.64,1)";
        e.currentTarget.style.transform  = "scale(1)";
      }}
      onPointerCancel={e => {
        e.currentTarget.style.transition = "transform 0.30s cubic-bezier(0.34,1.56,0.64,1)";
        e.currentTarget.style.transform  = "scale(1)";
      }}
      style={{
        width:40, height:40, borderRadius:11, cursor: disabled ? "default" : "pointer",
        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
        background: active ? GL_BTN_ACTIVE_BG : "transparent",
        border: active ? `1px solid ${GL_BTN_ACTIVE_BDR}` : "1px solid transparent",
        boxShadow: active ? GL_BTN_ACTIVE_GLOW : "none",
        opacity: disabled ? 0.22 : 1,
        transition:"background 0.15s, border-color 0.15s, box-shadow 0.15s",
      }}
    >
      {children}
    </button>
  );

  const divider = (
    <div style={{ width:1, height:18, flexShrink:0, margin:"0 2px", background: GL_DIV }} />
  );

  const pillPress = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.transition = "transform 0.09s ease, background 0.09s";
    el.style.transform  = "scale(0.91)";
    el.style.background = "rgba(255,255,255,0.12)";
  };
  const pillRelease = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.transition = "transform 0.30s cubic-bezier(0.34,1.56,0.64,1), background 0.18s";
    el.style.transform  = "scale(1)";
    el.style.background = GL_PILL_BG;
    el.style.borderColor = GL_PILL_BDR;
  };

  return (
    <div className="tj-pill-in" style={{ flexShrink:0, padding:"5px 8px", background:"transparent" }}>
      {/* Rotating gradient border wrapper */}
      <div className="tj-ctrl-bar-glow">
        <div className="tj-ctrl-bar-inner" style={{
          height:58, display:"flex", alignItems:"center",
          backdropFilter:"blur(12px) saturate(160%)", WebkitBackdropFilter:"blur(12px) saturate(160%)",
          paddingLeft:7, paddingRight:7, gap:2,
          overflowX:"auto", scrollbarWidth:"none",
        } as React.CSSProperties}>
        {/* Subtle top rim light — white glass gleam */}
        <div aria-hidden style={{
          position:"absolute", top:0, left:"15%", right:"15%", height:1, pointerEvents:"none", zIndex:2,
          background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.30),rgba(255,255,255,0.18),transparent)",
          borderRadius:1,
        }} />
        {/* Symbol button — opens mini watchlist popup */}
        <button
          ref={symbolBtnRef}
          onClick={handleSymbolBtn}
          onPointerDown={pillPress} onPointerUp={pillRelease} onPointerCancel={pillRelease}
          style={{
            height:36, padding:"0 10px", borderRadius:11, flexShrink:0,
            display:"flex", alignItems:"center", gap:6,
            background: showMarketSheet ? "rgba(255,255,255,0.12)" : GL_PILL_BG,
            border: showMarketSheet ? `1px solid rgba(255,255,255,0.28)` : `1px solid ${GL_PILL_BDR}`,
            cursor:"pointer", maxWidth:114,
            transition:"background 0.15s, border-color 0.15s",
          }}
        >
          <div style={{
            width:20, height:20, borderRadius:6, flexShrink:0,
            background:"rgba(255,255,255,0.10)", display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:7, fontWeight:900, color: GL_TEAL,
          }}>
            {badge.slice(0,3)}
          </div>
          <span style={{ fontSize:12.5, fontWeight:700, color: TEXT_HI, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:62 }}>
            {badge}
          </span>
          <ChevronDown style={{ width:11, height:11, color: GL_TEAL, flexShrink:0, opacity:0.85, transform: showMarketSheet ? "rotate(180deg)" : "rotate(0deg)", transition:"transform 0.18s" }} />
        </button>

        {/* TF button */}
        <button
          onClick={onTF}
          onPointerDown={pillPress} onPointerUp={pillRelease} onPointerCancel={pillRelease}
          style={{
            height:36, padding:"0 10px", borderRadius:11, flexShrink:0,
            display:"flex", alignItems:"center", gap:4,
            background: GL_PILL_BG, border:`1px solid ${GL_PILL_BDR}`, cursor:"pointer",
          }}
        >
          <span style={{ fontSize:12.5, fontWeight:700, color: TEXT_HI }}>{tfLabel(interval)}</span>
          <ChevronDown style={{ width:11, height:11, color: GL_TEAL, opacity:0.85 }} />
        </button>

        {divider}

        {/* Pencil / drawing tools */}
        <CtrlBtn onClick={onDraw}>
          <Pencil style={{ width:17, height:17, color: GL_TEAL }} />
        </CtrlBtn>

        {/* Broker connect */}
        <CtrlBtn onClick={onBroker}>
          <div style={{ position:"relative", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Plug style={{ width:17, height:17, color: brokerConnected ? "#B7FF5A" : GL_TEAL }} />
            <div style={{
              position:"absolute", top:-3, right:-4,
              width:7, height:7, borderRadius:"50%",
              background: brokerConnected ? "#22C55E" : "rgba(167,184,169,0.35)",
              border: "1.5px solid rgba(11,16,23,0.9)",
              boxShadow: brokerConnected ? "0 0 6px rgba(34,197,94,0.7)" : "none",
              transition: "background 0.3s, box-shadow 0.3s",
            }} />
          </div>
        </CtrlBtn>

        {/* More options */}
        <CtrlBtn onClick={onMore}>
          <MoreHorizontal style={{ width:17, height:17, color: GL_TEAL }} />
        </CtrlBtn>

        {divider}

        {/* Prev / Next symbol */}
        <CtrlBtn onClick={onPrev} disabled={!hasPrev}>
          <ChevronLeft style={{ width:18, height:18, color: TEXT_MED }} />
        </CtrlBtn>
        <CtrlBtn onClick={onNext} disabled={!hasNext}>
          <ChevronRight style={{ width:18, height:18, color: TEXT_MED }} />
        </CtrlBtn>

        {divider}

        {/* Fullscreen */}
        <CtrlBtn onClick={onFullscreen}>
          {isFullscreen
            ? <Minimize2 style={{ width:16, height:16, color: GL_TEAL }} />
            : <Maximize2 style={{ width:16, height:16, color: GL_TEAL }} />
          }
        </CtrlBtn>
        </div>{/* /tj-ctrl-bar-inner */}
      </div>{/* /tj-ctrl-bar-glow */}

      {/* Market watchlist sheet */}
      {showMarketSheet && (
        <MarketWatchlistSheet
          activeSymbol={activeKey}
          onSelect={handleSheetSelect}
          onClose={() => setShowMarketSheet(false)}
        />
      )}
    </div>
  );
});


// ── Props ──────────────────────────────────────────────────────────────────
export interface MobileChartLayoutProps {
  activeKey:           string;
  interval:            string;
  selectInterval:      (v: string) => void;
  selectSymbol:        (k: string) => void;
  chartSettings:       ChartSettings;
  handleSettings:      (s: ChartSettings) => void;
  handleSaveAsDefault: (s: ChartSettings) => void;
  replayBarSlice:      OHLCBar[] | null;
  alertDrawingIds:     Set<number>;
  handleDrawingAlert:  (d: Drawing) => void;
  addAlertDrawingId:   (id: number) => void;
  showIndicators:      boolean;
  setShowIndicators:   React.Dispatch<React.SetStateAction<boolean>>;
  showAlertCenter:     boolean;
  setShowAlertCenter:  React.Dispatch<React.SetStateAction<boolean>>;
  showQuickAlert:      boolean;
  setShowQuickAlert:   React.Dispatch<React.SetStateAction<boolean>>;
  alertDrawing:        Drawing | null;
  closeAlertModal:     () => void;
  openSidebar:         () => void;
  handleScreenshot:    () => void;
  chartAreaRef:        React.RefObject<HTMLDivElement | null>;
  onBarReplay?:        () => void;
  layoutCount:         ChartLayoutType;
  onLayoutChange:      (n: ChartLayoutType) => void;
  syncTF:              boolean;
  onSyncTFChange:      (v: boolean) => void;
  namedLayouts:        NamedLayout[];
  defaultLayoutName:   string;
  onSaveNamedLayout:   (name: string) => void;
  onLoadNamedLayout:   (layout: NamedLayout) => void;
  onRenameNamedLayout: (id: string, name: string) => void;
  onDeleteNamedLayout: (id: string) => void;
  activeLayoutId:      string | null;
}

// ── Main Component ─────────────────────────────────────────────────────────
export const MobileChartLayout = memo(function MobileChartLayout(props: MobileChartLayoutProps) {
  const {
    activeKey, interval, selectInterval, selectSymbol,
    chartSettings, handleSettings, handleSaveAsDefault,
    replayBarSlice, alertDrawingIds, handleDrawingAlert, addAlertDrawingId,
    showIndicators, setShowIndicators,
    showAlertCenter, setShowAlertCenter,
    showQuickAlert, setShowQuickAlert, alertDrawing, closeAlertModal,
    openSidebar, handleScreenshot, chartAreaRef,
    onBarReplay,
    layoutCount, onLayoutChange, syncTF, onSyncTFChange,
    namedLayouts, defaultLayoutName, onSaveNamedLayout, onLoadNamedLayout,
    onRenameNamedLayout, onDeleteNamedLayout, activeLayoutId,
  } = props;

  const [, navigate]  = useLocation();
  // Narrow selectors — only re-renders when these specific fields change.
  // Do NOT use useChartStore() (broad) — livePrice updates on every tick and
  // would re-render this 3000-line component on every market data event.
  const chartType            = useChartStore(s => s.chartType);
  const setChartType         = useChartStore(s => s.setChartType);
  const setMobileFullscreen  = useChartStore(s => s.setMobileChartFullscreen);
  const { wsStatus } = useLiveMarketContext();
  const { items: watchlistItems } = useWatchlist();
  // Narrow selectors: each field subscribed independently → re-renders ONLY when
  // that specific field changes. isDrawing/activeStyle/stayInDraw/canUndo/canRedo
  // no longer cause MobileChartLayout to re-render.
  const selectedDrawingId = useDrawingStore(s => s.selectedDrawingId);
  const drawings          = useDrawingStore(s => s.drawings);
  const activeTool        = useDrawingStore(s => s.activeTool);
  const setActiveTool     = useDrawingStore(s => s.setActiveTool);
  const selectedDrawing = drawings.find(d => d.id === selectedDrawingId) ?? null;
  const { openSelectModal, showSelectModal, showAuthModal, activeAccount, connectionStatus } = useBrokerStore();
  const brokerConnected = !!activeAccount && connectionStatus === "connected";

  // ── Sheet visibility ──
  const [showDrawingSheet,  setShowDrawingSheet]  = useState(false);
  const [showSettings,      setShowSettings]      = useState(false);
  const [showBrokerIntegration, setShowBrokerIntegration] = useState(false);
  const [showTFSheet,       setShowTFSheet]       = useState(false);
  const [showChartType,     setShowChartType]     = useState(false);
  const [showMoreSheet,     setShowMoreSheet]     = useState(false);
  const [showObjectTree,    setShowObjectTree]    = useState(false);
  const [showWatchlist,     setShowWatchlist]     = useState(false);
  const [showSymbolPicker,  setShowSymbolPicker]  = useState(false);
  const [isFullscreen,      setIsFullscreen]      = useState(false);
  const [showLayoutSheet,   setShowLayoutSheet]   = useState(false);
  const [activeChartSlot,   setActiveChartSlot]   = useState(0);
  const [slotSymbols,       setSlotSymbols]       = useState<string[]>(["ETHUSD", "SOLUSD", "DOGEUSD"]);
  const [slotIntervals,     setSlotIntervals]     = useState<string[]>(() => [interval, interval, interval]);
  const slotInitRef = useRef(false);

  // One-time init: seed slot symbols from watchlist when it first loads
  useEffect(() => {
    if (slotInitRef.current || watchlistItems.length === 0) return;
    slotInitRef.current = true;
    const candidates = watchlistItems.filter(w => w.symbol !== activeKey);
    setSlotSymbols([
      candidates[0]?.symbol ?? "ETHUSD",
      candidates[1]?.symbol ?? "SOLUSD",
      candidates[2]?.symbol ?? "DOGEUSD",
    ]);
  }, [watchlistItems.length]); // eslint-disable-line

  // ── Live price — NON-REACTIVE read via getSymbolTick ─────────────────────
  // Do NOT use useSymbolTick() here. It would subscribe the entire 3000-line
  // MobileChartLayout to tick updates, causing full re-renders on every tick.
  // getSymbolTick() reads the last known value non-reactively — the display
  // updates on any user-driven render. Price-color lag of ~5s is imperceptible.
  const connected      = wsStatus === "connected";
  const livePrice      = getSymbolTick(activeKey)?.price ?? null;
  const liveChangePct  = getSymbolTick(activeKey)?.changePct ?? 0;
  const isUp           = liveChangePct >= 0;

  // ── Symbol metadata ──
  const catEntry = SYMBOL_CATALOG[activeKey];
  const wlEntry  = watchlistItems.find(i => i.symbol === activeKey);
  const badge    = wlEntry?.badge ?? catEntry?.badge ?? activeKey.slice(0,4).toUpperCase();

  // ── Fix: BrokerAuthModal renders at zIndex 201, BrokerIntegrationModal at zIndex 9200.
  // Close the integration modal when the Delta auth modal opens so it's clearly visible.
  useEffect(() => {
    if (showAuthModal) setShowBrokerIntegration(false);
  }, [showAuthModal]);

  // ── Stable sheet close handlers — MUST be useCallback so memo'd sheets
  // don't re-render from a new inline-arrow onClose prop on every parent render ──
  const handleCloseDrawingSheet = useCallback(() => setShowDrawingSheet(false), []);
  const handleCloseSettings     = useCallback(() => setShowSettings(false),    []);
  const handleCloseObjectTree   = useCallback(() => setShowObjectTree(false),  []);
  const handleOpenSettings      = useCallback(() => { setShowSettings(true); }, []);

  // Routes symbol selection to the main chart (slot 0) or to a secondary MiniChart slot
  const handleSelectSymbol = useCallback((sym: string) => {
    if (activeChartSlot === 0 || layoutCount <= 1) {
      selectSymbol(sym);
    } else {
      setSlotSymbols(prev => {
        const next = [...prev];
        next[activeChartSlot - 1] = sym;
        return next;
      });
    }
  }, [activeChartSlot, layoutCount, selectSymbol]);

  // Routes TF selection to the main chart (slot 0) or to a secondary slot's interval
  const handleSelectInterval = useCallback((tf: string) => {
    if (activeChartSlot === 0 || layoutCount <= 1) {
      selectInterval(tf);
    } else {
      setSlotIntervals(prev => {
        const next = [...prev];
        next[activeChartSlot - 1] = tf;
        return next;
      });
    }
  }, [activeChartSlot, layoutCount, selectInterval]);

  // ── Prev / Next symbol — routes to the active slot ──
  const handlePrev = useCallback(() => {
    if (activeChartSlot > 0 && layoutCount > 1) {
      const curSym = slotSymbols[activeChartSlot - 1] ?? activeKey;
      const idx = watchlistItems.findIndex(i => i.symbol === curSym);
      if (idx > 0) handleSelectSymbol(watchlistItems[idx - 1].symbol);
    } else {
      const idx = watchlistItems.findIndex(i => i.symbol === activeKey);
      if (idx > 0) selectSymbol(watchlistItems[idx - 1].symbol);
    }
  }, [watchlistItems, activeKey, activeChartSlot, layoutCount, slotSymbols, handleSelectSymbol, selectSymbol]);

  const handleNext = useCallback(() => {
    if (activeChartSlot > 0 && layoutCount > 1) {
      const curSym = slotSymbols[activeChartSlot - 1] ?? activeKey;
      const idx = watchlistItems.findIndex(i => i.symbol === curSym);
      if (idx >= 0 && idx < watchlistItems.length - 1) handleSelectSymbol(watchlistItems[idx + 1].symbol);
    } else {
      const idx = watchlistItems.findIndex(i => i.symbol === activeKey);
      if (idx >= 0 && idx < watchlistItems.length - 1) selectSymbol(watchlistItems[idx + 1].symbol);
    }
  }, [watchlistItems, activeKey, activeChartSlot, layoutCount, slotSymbols, handleSelectSymbol, selectSymbol]);

  // ── Stable sheet-open handlers for MiniControlBar ────────────────────────
  // These MUST be useCallback so memo(MiniControlBar) can bail out when parent
  // state like showSettings / showMoreSheet changes. Inline arrows would create
  // new references on every render and defeat memo's equality check.
  const handleOpenTFSheet      = useCallback(() => setShowTFSheet(true),      []);
  const handleOpenDrawingSheet = useCallback(() => setShowDrawingSheet(true),  []);
  const handleOpenBrokerSheet  = useCallback(() => setShowBrokerIntegration(true), []);
  const handleOpenMoreSheet    = useCallback(() => setShowMoreSheet(true),     []);

  // Derive the symbol/badge/interval shown in the shared mini control bar for the active slot
  const activeSlotSymbol = (activeChartSlot === 0 || layoutCount <= 1)
    ? activeKey
    : (slotSymbols[activeChartSlot - 1] ?? activeKey);

  const activeSlotInterval = (activeChartSlot === 0 || layoutCount <= 1)
    ? interval
    : (slotIntervals[activeChartSlot - 1] ?? interval);
  const activeSlotBadge = (activeChartSlot === 0 || layoutCount <= 1)
    ? badge
    : (watchlistItems.find(i => i.symbol === activeSlotSymbol)?.badge
        ?? SYMBOL_CATALOG[activeSlotSymbol]?.badge
        ?? activeSlotSymbol.slice(0, 4).toUpperCase());

  // ── Reset chart zoom / fit all bars ───────────────────────────────────────
  const handleResetChart = useCallback(() => {
    window.dispatchEvent(new CustomEvent("tj:chart-reset"));
  }, []);

  // ── Fullscreen — sync to store so layout nav can hide ──
  const containerRef = useRef<HTMLDivElement>(null);
  const handleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      const next = !prev;
      setMobileFullscreen(next);
      return next;
    });
  }, [setMobileFullscreen]);

  // ── Reset store fullscreen flag when this layout unmounts (orientation change) ──
  useEffect(() => {
    return () => { setMobileFullscreen(false); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Main bar tab handler ──

  return (
    <div ref={containerRef} style={{ height:"100%", background:"#08090f", display:"flex", flexDirection:"column", touchAction:"none" }}>
      {/* ── Chart area ── */}
      <div ref={chartAreaRef} style={{ flex:1, minHeight:0, position:"relative", overflow:"hidden", touchAction:"none" }}>
        {/* Animated ambient mesh — subtle, behind the chart */}
        <AnimatedMeshBackground />

        <IndicatorTags topOffset={8} />

        {/* Inner absolutely-pinned container — CSS grid root in multi-chart mode.
            position:absolute + inset:0 gives explicit pixel dimensions so 1fr rows resolve. */}
        <div style={{
          position:"absolute", inset:0,
          ...(layoutCount > 1 ? {
            display:"grid",
            gridTemplateColumns: layoutCount === 3 ? "2fr 1fr" : "1fr 1fr",
            gridTemplateRows: layoutCount >= 3 ? "1fr 1fr" : "1fr",
            gap: 2,
            background: "rgba(255,255,255,0.05)",
          } : {}),
        }}>

          {/* Single chart layout */}
          {layoutCount === 1 && (
            <CustomChart settings={chartSettings} replayBars={replayBarSlice}>
              <DrawingOverlay symbol={activeKey} timeframe={interval} onDrawingAlert={handleDrawingAlert} alertDrawingIds={alertDrawingIds} />
              <IndicatorRenderer />
              <CustomIndicatorRenderer />
            </CustomChart>
          )}

          {/* Multi-chart grid */}
          {layoutCount > 1 && (
            <>
              {/* Slot 0: main chart (spans both rows in 3-chart layout) */}
              <div
                onPointerDownCapture={() => {
                  console.log("[PANE TAP]", 0);
                  setActiveChartSlot(0);
                  console.log("[ACTIVE CHART]", 0);
                }}
                style={{
                  position:"relative", overflow:"hidden", minHeight:0,
                  gridRow: layoutCount === 3 ? "1 / 3" : undefined,
                  cursor:"pointer",
                  outline: activeChartSlot === 0
                    ? "2px solid #38bdf8"
                    : "1px solid rgba(255,255,255,0.06)",
                  outlineOffset: "-1px",
                  boxShadow: activeChartSlot === 0
                    ? "0 0 0 4px rgba(56,189,248,0.18)"
                    : "none",
                  zIndex: activeChartSlot === 0 ? 2 : 1,
                  transition:"outline 0.15s, box-shadow 0.15s",
                }}
              >
                <CustomChart settings={chartSettings} replayBars={replayBarSlice}>
                  <DrawingOverlay symbol={activeKey} timeframe={interval} onDrawingAlert={handleDrawingAlert} alertDrawingIds={alertDrawingIds} />
                  <IndicatorRenderer />
                  <CustomIndicatorRenderer />
                </CustomChart>
              </div>

              {/* Extra MiniChart slots — full engine with DrawingOverlay + indicators */}
              {Array.from({ length: layoutCount - 1 }).map((_, i) => (
                <div
                  key={i}
                  onPointerDownCapture={() => {
                    console.log("[PANE TAP]", i + 1);
                    setActiveChartSlot(i + 1);
                    console.log("[ACTIVE CHART]", i + 1);
                  }}
                  style={{
                    position:"relative", overflow:"hidden", minHeight:0,
                    cursor:"pointer",
                    outline: activeChartSlot === i + 1
                      ? "2px solid #38bdf8"
                      : "1px solid rgba(255,255,255,0.06)",
                    outlineOffset: "-1px",
                    boxShadow: activeChartSlot === i + 1
                      ? "0 0 0 4px rgba(56,189,248,0.18)"
                      : "none",
                    zIndex: activeChartSlot === i + 1 ? 2 : 1,
                    transition:"outline 0.15s, box-shadow 0.15s",
                  }}
                >
                  <MiniChart
                    defaultSymbol={slotSymbols[i] ?? "ETHUSD"}
                    defaultInterval={interval}
                    syncedInterval={syncTF ? interval : undefined}
                    controlledInterval={syncTF ? undefined : slotIntervals[i]}
                    headerless={true}
                    controlledSymbol={slotSymbols[i]}
                    settings={chartSettings}
                  >
                    <DrawingOverlay
                      symbol={slotSymbols[i] ?? "ETHUSD"}
                      timeframe={syncTF ? interval : (slotIntervals[i] ?? interval)}
                      onDrawingAlert={handleDrawingAlert}
                      alertDrawingIds={alertDrawingIds}
                    />
                    <IndicatorRenderer />
                    <CustomIndicatorRenderer />
                  </MiniChart>
                </div>
              ))}
            </>
          )}

        </div>
      </div>

      {/* ── Mini control bar (swaps to drawing bar when drawing selected) ── */}
      {selectedDrawing ? (
        <DrawingMiniBar drawing={selectedDrawing} onAlert={handleDrawingAlert} />
      ) : (
        <MiniControlBar
          activeKey={activeSlotSymbol}
          badge={activeSlotBadge}
          interval={activeSlotInterval}
          watchlistItems={watchlistItems}
          onSelectSymbol={handleSelectSymbol}
          onTF={handleOpenTFSheet}
          onDraw={handleOpenDrawingSheet}
          onBroker={handleOpenBrokerSheet}
          onMore={handleOpenMoreSheet}
          onPrev={handlePrev}
          onNext={handleNext}
          onFullscreen={handleFullscreen}
          isFullscreen={isFullscreen}
          brokerConnected={brokerConnected}
        />
      )}

      {/* ── Main bar rendered by layout.tsx to avoid remount flash ── */}

      {/* ── Sheets & modals ── */}
      {showDrawingSheet && <DrawingToolsSheet onClose={handleCloseDrawingSheet} />}
      {showBrokerIntegration && <BrokerIntegrationModal onClose={() => setShowBrokerIntegration(false)} />}
      {showTFSheet      && <TFSheet interval={activeSlotInterval} onSelect={handleSelectInterval} onClose={() => setShowTFSheet(false)} />}
      {showChartType    && <ChartTypeSheet current={chartType ?? "candles"} onSelect={t => setChartType(t)} onClose={() => setShowChartType(false)} />}
      {showSelectModal  && <BrokerSelectModal />}
      {showAuthModal    && <BrokerAuthModal />}
      {showObjectTree   && <ObjectTreeSheet onClose={handleCloseObjectTree} />}
      {showMoreSheet && (
        <MoreOptionsSheet
          onClose={() => setShowMoreSheet(false)}
          onIndicators={() => setShowIndicators(v => !v)}
          onAlerts={() => setShowAlertCenter(true)}
          onBarReplay={onBarReplay}
          onChartType={() => setShowChartType(true)}
          onObjectTree={() => setShowObjectTree(true)}
          onSettings={handleOpenSettings}
          onScreenshot={handleScreenshot}
          onLayout={() => setShowLayoutSheet(true)}
          onFullscreen={handleFullscreen}
          isFullscreen={isFullscreen}
          onReset={handleResetChart}
        />
      )}
      {showLayoutSheet && (
        <LayoutBottomSheet
          current={layoutCount}
          onChange={onLayoutChange}
          syncTF={syncTF}
          onSyncTFChange={onSyncTFChange}
          onClose={() => setShowLayoutSheet(false)}
          namedLayouts={namedLayouts}
          defaultLayoutName={defaultLayoutName}
          onSaveNamedLayout={onSaveNamedLayout}
          onLoadNamedLayout={(layout) => { onLoadNamedLayout(layout); setShowLayoutSheet(false); }}
          onRenameNamedLayout={onRenameNamedLayout}
          onDeleteNamedLayout={onDeleteNamedLayout}
          activeLayoutId={activeLayoutId}
        />
      )}

      <MobileWatchlistOverlay
        visible={showWatchlist}
        activeSymbol={activeSlotSymbol}
        onClose={() => setShowWatchlist(false)}
        onSelect={handleSelectSymbol}
        onOpenChart={() => setShowWatchlist(false)}
      />

      {showIndicators  && <IndicatorsPanel anchorEl={null} onClose={() => setShowIndicators(false)} />}
      {showSettings    && <ChartSettingsSheet settings={chartSettings} onChange={handleSettings} onSaveAsDefault={handleSaveAsDefault} onClose={handleCloseSettings} />}
      {showAlertCenter && <AlertSheet onClose={() => setShowAlertCenter(false)} />}

      <SymbolPickerSheet
        visible={showSymbolPicker}
        activeSymbol={activeSlotSymbol}
        onClose={() => setShowSymbolPicker(false)}
        onSelect={handleSelectSymbol}
      />

      {(showQuickAlert || alertDrawing !== null) && (
        <DrawingAlertModal
          symbol={activeKey} currentInterval={interval} currentPrice={getSymbolTick(activeKey)?.price ?? null}
          prefillDrawing={alertDrawing ?? undefined} onClose={closeAlertModal}
          onCreated={() => { if (alertDrawing) addAlertDrawingId(alertDrawing.id); closeAlertModal(); }}
        />
      )}

    </div>
  );
});
