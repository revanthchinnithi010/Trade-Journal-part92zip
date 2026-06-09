import { memo, useMemo, useEffect, useRef, useState } from "react";
import {
  useGetStatsSummary,
  useGetEquityCurve,
  useGetWeeklyPnl,
  useListTrades,
  useGetCalendarHeatmap,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import {
  ArrowUpRight, ArrowDownRight, TrendingUp, Percent, Layers,
  BarChart2, Activity, Target, Flame, ChevronRight,
  Radio, Bell, Zap, ServerCog, X,
} from "lucide-react";
import { ProviderStatusCards } from "@/components/ProviderStatusCards";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Bar, BarChart as RechartsBarChart, Cell, PieChart, Pie, Legend,
} from "recharts";
import { Link } from "wouter";
import { BROKER_MAP, BROKER_INFO } from "@/data/sampleData";
import {
  useLiveMarketContext, fmtPrice, fmtTickAge, SYMBOL_PROVIDERS,
  type TickState,
} from "@/contexts/LiveMarketContext";
import { useTickStore } from "@/store/tickStore";

const DASHBOARD_TIMEOUT_MS = 2_000;


const GREEN = "hsl(145 58% 52%)";
const RED   = "hsl(0 68% 58%)";
const PURPLE = "#00E5B0";
const MUTED_CLR = "hsl(128 8% 38%)";

const DEFAULT_STATS = {
  netPnl: 0, winRate: 0, profitFactor: 0, averageRR: 0,
  totalTrades: 0, winCount: 0, lossCount: 0, breakevenCount: 0,
};
const DEFAULT_EQUITY: Array<{ date: string; equity: number }> = [];
const DEFAULT_WEEKLY: Array<{ week: string; pnl: number }> = [];
const DEFAULT_TRADES = { trades: [], total: 0 };

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  borderColor: "rgba(57, 91, 67, 0.3)",
  borderRadius: "12px",
  boxShadow: "0 8px 28px rgba(7, 17, 13, 0.65)",
  fontSize: "12px",
  padding: "8px 12px",
};

const CustomEquityTooltip = memo(function CustomEquityTooltip({
  active, payload, label,
}: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipStyle} className="border border-white/[0.08]">
      <p className="text-muted-foreground text-[11px] mb-1">
        {label ? new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
      </p>
      <p className="font-bold text-sm text-white">{formatCurrency(payload[0].value)}</p>
    </div>
  );
});

const CustomPnlTooltip = memo(function CustomPnlTooltip({
  active, payload, label,
}: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div style={tooltipStyle} className="border border-white/[0.08]">
      <p className="text-muted-foreground text-[11px] mb-1">Week of {label}</p>
      <p className={`font-bold text-sm ${val >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {val >= 0 ? "+" : ""}{formatCurrency(val)}
      </p>
    </div>
  );
});

const StatCard = memo(function StatCard({
  label, value, sub, icon: Icon, positive, accent, bar, trend,
}: {
  label: string; value: string; sub?: React.ReactNode; icon: React.ElementType;
  positive?: boolean; accent?: boolean; bar?: number; trend?: string;
}) {
  return (
    <div className="glass-card stat-card-glow h-full relative overflow-hidden group hover:border-white/[0.12] transition-colors duration-200 p-5">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-primary/[0.04] pointer-events-none" />

      <div className="relative flex items-start justify-between mb-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
        <div className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] group-hover:bg-primary/10 group-hover:border-primary/20 transition-colors duration-200">
          <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors duration-200" />
        </div>
      </div>

      <div className={`relative text-[26px] font-black tracking-tight mb-1.5 leading-none ${
        accent ? "text-foreground" :
        positive === true ? "text-emerald-400" :
        positive === false ? "text-red-400" :
        "text-foreground"
      }`}>
        {value}
      </div>

      {bar !== undefined && (
        <div className="mt-2.5 mb-2 h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(bar, 100)}%`,
              background: bar >= 55
                ? "linear-gradient(90deg, hsl(145 58% 38%), hsl(145 58% 54%))"
                : bar >= 40
                ? `linear-gradient(90deg, ${PURPLE}, hsl(161 72% 72%))`
                : "linear-gradient(90deg, hsl(0 68% 44%), hsl(0 68% 60%))",
            }}
          />
        </div>
      )}

      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      {trend && <p className="text-[11px] text-emerald-400 font-medium mt-0.5">{trend}</p>}
    </div>
  );
});

// ── Mini Sparkline ────────────────────────────────────────────────────────────
function MiniSparkline({ data, positive, width = 72, height = 28 }: {
  data: number[]; positive: boolean; width?: number; height?: number;
}) {
  if (data.length < 2) return <div style={{ width, height }} />;
  const min   = Math.min(...data);
  const max   = Math.max(...data);
  const range = max - min || 1;
  const pts   = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 3) - 1.5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <polyline
        points={pts} fill="none"
        stroke={positive ? "#B7FF5A" : "#ef4444"}
        strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85}
      />
    </svg>
  );
}

// ── All tracked symbols ───────────────────────────────────────────────────────
const ALL_LIVE_SYMBOLS = [
  { key: "BTCUSD",  label: "BTC/USD",  badge: "BTC"  },
  { key: "ETHUSD",  label: "ETH/USD",  badge: "ETH"  },
  { key: "SOLUSD",  label: "SOL/USD",  badge: "SOL"  },
  { key: "DOGEUSD", label: "DOGE/USD", badge: "DOGE" },
  { key: "PEPEUSD", label: "PEPE/USD", badge: "PEPE" },
  { key: "EURUSD",  label: "EUR/USD",  badge: "EUR"  },
  { key: "GBPJPY",  label: "GBP/JPY",  badge: "GBP"  },
  { key: "XAUUSD",  label: "XAU/USD",  badge: "GOLD" },
  { key: "NAS100",  label: "NAS100",   badge: "NAS"  },
  { key: "US30",    label: "US30",     badge: "DJI"  },
  { key: "USOIL",   label: "US Oil",   badge: "OIL"  },
  { key: "UKOIL",   label: "UK Oil",   badge: "UKOIL"},
];

// ── Live Symbol Card (inside modal) ──────────────────────────────────────────
const LiveSymbolCard = memo(function LiveSymbolCard({
  sym, tick, now,
}: {
  sym: typeof ALL_LIVE_SYMBOLS[number];
  tick: TickState | null;
  now: number;
}) {
  const hasPrice   = tick !== null && tick.price > 0;
  const isPositive = (tick?.changePct ?? 0) >= 0;
  const provider   = SYMBOL_PROVIDERS[sym.key] ?? "—";

  return (
    <div
      className="rounded-xl p-3 border transition-all"
      style={{ background: "#0D1C16", borderColor: "rgba(57,91,67,0.35)" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black"
            style={{ background: "rgba(183,255,90,0.1)", color: "#B7FF5A", border: "1px solid rgba(183,255,90,0.2)" }}
          >
            {sym.badge.slice(0, 3)}
          </div>
          <div>
            <p className="text-[12px] font-bold text-[#F3FFF3] leading-none">{sym.badge}</p>
            <p className="text-[9px] text-[#A7B8A9]/60 leading-none mt-0.5">{sym.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: hasPrice ? "#34d399" : "#6b7280",
              boxShadow:  hasPrice ? "0 0 5px #34d399" : "none",
            }}
          />
          <span
            className="text-[8.5px] font-bold px-1.5 py-0.5 rounded"
            style={{
              background: provider === "Finnhub" ? "rgba(59,130,246,0.12)" : "rgba(183,255,90,0.1)",
              color:      provider === "Finnhub" ? "#60a5fa" : "#B7FF5A",
              border:     `1px solid ${provider === "Finnhub" ? "rgba(59,130,246,0.25)" : "rgba(183,255,90,0.2)"}`,
            }}
          >
            {provider}
          </span>
        </div>
      </div>

      {/* Price + sparkline */}
      <div className="flex items-end justify-between">
        <div>
          {hasPrice ? (
            <>
              <p
                key={tick!.flashKey}
                className={`font-mono font-black leading-none ${
                  tick!.flashDir === "up"   ? "tick-flash-up"   :
                  tick!.flashDir === "down" ? "tick-flash-down" : ""
                }`}
                style={{ fontSize: 15, color: "#F3FFF3" }}
              >
                {fmtPrice(tick!.price, sym.key)}
              </p>
              <p
                className="text-[10px] font-bold mt-1 leading-none"
                style={{ color: isPositive ? "#B7FF5A" : "#ef4444" }}
              >
                {isPositive ? "▲ +" : "▼ "}{tick!.changePct.toFixed(3)}%
              </p>
            </>
          ) : (
            <p className="text-[12px] text-[#A7B8A9]/40 font-mono">No data</p>
          )}
        </div>
        {hasPrice && tick!.history.length >= 2 && (
          <MiniSparkline data={tick!.history} positive={isPositive} width={72} height={28} />
        )}
      </div>

      {/* Footer */}
      {hasPrice && (
        <div className="flex items-center justify-between mt-2 pt-1.5" style={{ borderTop: "1px solid rgba(57,91,67,0.18)" }}>
          <span className="text-[8.5px] text-[#A7B8A9]/50">
            {tick!.tickCount} ticks
          </span>
          <span className="text-[8.5px] text-[#A7B8A9]/50">
            {fmtTickAge(tick!.lastTick)}
          </span>
        </div>
      )}
    </div>
  );
});

// ── Live Symbols Modal ────────────────────────────────────────────────────────
function LiveSymbolsModal({ ticks, onClose }: {
  ticks: Record<string, TickState>;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const liveCount = ALL_LIVE_SYMBOLS.filter(s => ticks[s.key]?.price > 0).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-12 pb-4 px-4"
      style={{ background: "rgba(7,17,13,0.88)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border overflow-hidden"
        style={{
          background:   "#0A1610",
          borderColor:  "rgba(57,91,67,0.4)",
          boxShadow:    "0 24px 80px rgba(0,0,0,0.7)",
          maxHeight:    "calc(100vh - 64px)",
          overflowY:    "auto",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 sticky top-0 z-10"
          style={{ background: "#0A1610", borderBottom: "1px solid rgba(57,91,67,0.25)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Radio className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-[14px] font-black text-[#F3FFF3]">Live Market Symbols</p>
              <p className="text-[10px] text-[#A7B8A9]/60">{liveCount} of {ALL_LIVE_SYMBOLS.length} streaming</p>
            </div>
            <span className="relative flex h-2.5 w-2.5 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-400" />
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: "rgba(57,91,67,0.15)", border: "1px solid rgba(57,91,67,0.3)" }}
          >
            <X className="w-4 h-4" style={{ color: "#A7B8A9" }} />
          </button>
        </div>

        {/* Symbol grid */}
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {ALL_LIVE_SYMBOLS.map(sym => (
            <LiveSymbolCard
              key={sym.key}
              sym={sym}
              tick={ticks[sym.key] ?? null}
              now={now}
            />
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex items-center gap-2 text-[10px] text-[#A7B8A9]/50"
          style={{ borderTop: "1px solid rgba(57,91,67,0.18)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
          Prices update tick-by-tick via Finnhub OANDA feed + Delta Exchange WebSocket
        </div>
      </div>
    </div>
  );
}

// ── Calendar Heatmap ──────────────────────────────────────────────────────────
const CalendarHeatmap = memo(function CalendarHeatmap({
  data, year, month,
}: { data: Array<{ date: string; pnl: number; trades: number }>; year: number; month: number }) {
  const dayMap = useMemo(() => {
    const m: Record<string, { pnl: number; trades: number }> = {};
    data.forEach((d) => { m[d.date] = { pnl: d.pnl, trades: d.trades }; });
    return m;
  }, [data]);

  const maxAbs = useMemo(() => Math.max(...data.map((d) => Math.abs(d.pnl)), 1), [data]);
  const firstDay = useMemo(() => new Date(year, month - 1, 1).getDay(), [year, month]);
  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const monthName = useMemo(
    () => new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [year, month]
  );

  const cellStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    Object.entries(dayMap).forEach(([dateStr, d]) => {
      if (!d || d.trades === 0) return;
      const intensity = Math.min(Math.abs(d.pnl) / maxAbs, 1);
      if (d.pnl > 0) styles[dateStr] = { backgroundColor: `rgba(52,211,153,${0.12 + intensity * 0.55})`, borderColor: `rgba(52,211,153,${0.2 + intensity * 0.3})` };
      else if (d.pnl < 0) styles[dateStr] = { backgroundColor: `rgba(248,113,113,${0.12 + intensity * 0.55})`, borderColor: `rgba(248,113,113,${0.2 + intensity * 0.3})` };
      else styles[dateStr] = { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" };
    });
    return styles;
  }, [dayMap, maxAbs]);

  const days: React.ReactNode[] = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const entry = dayMap[dateStr];
    days.push(
      <div
        key={dateStr}
        className="relative rounded-lg aspect-square flex flex-col items-center justify-center cursor-default group/cell border border-transparent"
        style={cellStyles[dateStr]}
      >
        <span className="text-[10px] font-semibold leading-none text-foreground/60">{d}</span>
        {entry && entry.trades > 0 && (
          <span className={`text-[8px] font-bold leading-none mt-0.5 ${entry.pnl > 0 ? "text-emerald-400" : "text-red-400"}`}>
            {entry.pnl > 0 ? "+" : ""}{Math.abs(entry.pnl) >= 100 ? `$${Math.round(Math.abs(entry.pnl))}` : `$${Math.abs(entry.pnl).toFixed(0)}`}
          </span>
        )}
        {entry && entry.trades > 0 && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 hidden group-hover/cell:block pointer-events-none">
            <div className="glass-card px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-xl border-white/10">
              <p className={`font-bold ${entry.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(entry.pnl)}</p>
              <p className="text-muted-foreground">{entry.trades} trade{entry.trades !== 1 ? "s" : ""}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-3">{monthName}</p>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground/60 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">{days}</div>
    </div>
  );
});

export default function Dashboard() {
  const mountTimeRef = useRef(performance.now());
  const [timedOut,          setTimedOut]          = useState(false);
  const [showLiveSymbols,   setShowLiveSymbols]   = useState(false);
  const [activeAlertCount,  setActiveAlertCount]  = useState<number | null>(null);
  const { wsStatus, latencyMs }                   = useLiveMarketContext();
  const ticks = useTickStore(s => s.ticks);
  const liveSymbolCount = Object.values(ticks).filter(t => t.price > 0).length;

  useEffect(() => {
    const fetchAlertCount = () => {
      Promise.all([
        fetch("/api/alerts").then(r => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/zones").then(r => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/trendlines").then(r => r.ok ? r.json() : []).catch(() => []),
      ]).then(([pa, za, ta]) => {
        setActiveAlertCount(
          (pa as unknown[]).length + (za as unknown[]).length + (ta as unknown[]).length
        );
      }).catch(() => {});
    };
    fetchAlertCount();
    const t = setInterval(fetchAlertCount, 30_000);
    return () => clearInterval(t);
  }, []);

  const wsStatusValue = wsStatus === "connected" ? "Live" : wsStatus === "connecting" ? "···" : "Off";
  const wsStatusColor = wsStatus === "connected" ? "text-emerald-400" : wsStatus === "connecting" ? "text-yellow-400" : "text-red-400";
  const wsStatusDot   = wsStatus === "connected" ? "bg-emerald-400" : wsStatus === "connecting" ? "bg-yellow-400" : "bg-red-400";

  const quickStats = [
    {
      label: "Feed Status",
      value: wsStatusValue,
      sub: wsStatus === "connected" ? "Streaming live" : wsStatus === "connecting" ? "Reconnecting…" : "No feed active",
      icon: Radio,
      color: wsStatusColor,
      dot: wsStatusDot,
      pulse: wsStatus === "connected",
    },
    {
      label: "Live Symbols",
      value: String(liveSymbolCount),
      sub: liveSymbolCount > 0 ? "Tick data streaming" : "Waiting for feed",
      icon: Activity,
      color: "text-blue-400",
      dot: "bg-blue-400",
      pulse: liveSymbolCount > 0,
    },
    {
      label: "Active Alerts",
      value: activeAlertCount !== null ? String(activeAlertCount) : "—",
      sub: activeAlertCount !== null ? `${activeAlertCount} configured` : "Loading…",
      icon: Bell,
      color: "text-primary",
      dot: "bg-primary",
      pulse: false,
    },
    {
      label: "WS Latency",
      value: wsStatus === "connected" && latencyMs !== null ? `${latencyMs}ms` : "—",
      sub: wsStatus === "connected" ? "WebSocket ping ●" : "Not connected",
      icon: Zap,
      color: "text-teal-400",
      dot: "bg-teal-400",
      pulse: false,
    },
  ];

  useEffect(() => {
    console.log("[Dashboard] mount");
    const t = setTimeout(() => {
      console.log("[Dashboard] loading timeout reached — rendering with available data");
      setTimedOut(true);
    }, DASHBOARD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const { data: stats, isLoading: statsLoading, isError: statsError }
    = useGetStatsSummary();
  const { data: equity, isLoading: equityLoading, isError: equityError }
    = useGetEquityCurve();
  const { data: weeklyPnl, isLoading: weeklyLoading, isError: weeklyError }
    = useGetWeeklyPnl();
  const { data: recentTrades, isLoading: tradesLoading, isError: tradesError }
    = useListTrades({ limit: 10 });

  useEffect(() => {
    const anyLoading = statsLoading || equityLoading || weeklyLoading || tradesLoading;
    if (!anyLoading && !timedOut) {
      const elapsed = Math.round(performance.now() - mountTimeRef.current);
      console.log(`[Dashboard] loading complete in ${elapsed}ms — stats:${!statsError} equity:${!equityError} weekly:${!weeklyError} trades:${!tradesError}`);
      setTimedOut(true);
    }
  }, [statsLoading, equityLoading, weeklyLoading, tradesLoading, timedOut, statsError, equityError, weeklyError, tradesError]);

  const now = useMemo(() => new Date(), []);
  const { data: calData } = useGetCalendarHeatmap({ year: now.getFullYear(), month: now.getMonth() + 1 });

  const isStillLoading = !timedOut && (statsLoading || equityLoading || weeklyLoading || tradesLoading);

  const resolvedStats = stats ?? DEFAULT_STATS;
  const resolvedEquity = equity ?? DEFAULT_EQUITY;
  const resolvedWeekly = weeklyPnl ?? DEFAULT_WEEKLY;
  const resolvedTrades = recentTrades ?? DEFAULT_TRADES;

  const weeklyLabels = useMemo(() => {
    return resolvedWeekly.map((w) => {
      const d = new Date(w.week);
      return { ...w, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
    });
  }, [resolvedWeekly]);

  const winLossData = useMemo(() => {
    return [
      { name: "Win",  value: resolvedStats.winCount,       color: GREEN     },
      { name: "Loss", value: resolvedStats.lossCount,      color: RED       },
      { name: "BE",   value: resolvedStats.breakevenCount, color: MUTED_CLR },
    ].filter((d) => d.value > 0);
  }, [resolvedStats]);

  if (isStillLoading) {
    return (
      <div className="space-y-5 pb-12">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl shimmer-loading" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-64 rounded-2xl shimmer-loading" />
          <div className="h-64 rounded-2xl shimmer-loading" />
        </div>
      </div>
    );
  }

  const apiOffline = statsError && equityError && weeklyError && tradesError;

  return (
    <div className="space-y-4 pb-12">

      {showLiveSymbols && (
        <LiveSymbolsModal
          ticks={ticks}
          onClose={() => setShowLiveSymbols(false)}
        />
      )}

      {apiOffline && (
        <div className="glass-card px-5 py-3 flex items-center gap-3 border-amber-500/20 bg-amber-500/[0.04]">
          <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <p className="text-[12px] text-amber-400 font-medium">
            API server offline — dashboard showing cached or empty data
          </p>
        </div>
      )}

      {/* ── Quick Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickStats.map((w) => {
          const Icon    = w.icon;
          const isLive  = w.label === "Live Symbols";
          return (
            <div
              key={w.label}
              onClick={isLive ? () => setShowLiveSymbols(true) : undefined}
              className={`glass-card px-4 py-3.5 flex items-center gap-3 group hover:border-white/[0.12] transition-colors duration-200 relative overflow-hidden ${isLive ? "cursor-pointer active:scale-[0.98]" : ""}`}
              style={isLive ? { borderColor: "rgba(59,130,246,0.25)" } : {}}
            >
              <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 group-hover:border-primary/20 transition-colors duration-200">
                <Icon className={`w-4 h-4 ${w.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold text-muted-foreground/55 uppercase tracking-widest truncate">{w.label}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className={`text-[17px] font-black leading-none ${w.color}`}>{w.value}</p>
                  {w.pulse && (
                    <span className="relative flex h-2 w-2 flex-shrink-0">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${w.dot} opacity-60`} />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${w.dot}`} />
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/45 truncate mt-0.5">{w.sub}</p>
              </div>
              {isLive && (
                <div className="text-[9px] text-blue-400/60 font-semibold shrink-0">tap ↗</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Provider Status Cards ── */}
      <div className="glass-card">
        <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-white/[0.05]">
          <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
            <ServerCog className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-[13px] font-semibold text-white">Live Market Feeds</span>
          <span className="text-[10px] text-muted-foreground bg-white/[0.04] rounded-full px-2 py-0.5 border border-white/[0.06] ml-auto">
            Multi-Provider
          </span>
        </div>
        <div className="p-4">
          <ProviderStatusCards />
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Net PNL"
          value={formatCurrency(resolvedStats.netPnl)}
          icon={resolvedStats.netPnl >= 0 ? ArrowUpRight : ArrowDownRight}
          positive={resolvedStats.netPnl > 0 ? true : resolvedStats.netPnl < 0 ? false : undefined}
          sub={<span className="flex items-center gap-1"><span className={resolvedStats.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}>{resolvedStats.netPnl >= 0 ? "▲" : "▼"}</span>All time</span>}
        />
        <StatCard
          label="Win Rate"
          value={`${resolvedStats.winRate.toFixed(1)}%`}
          icon={Percent}
          accent
          bar={resolvedStats.winRate}
          sub={`${resolvedStats.winCount}W · ${resolvedStats.lossCount}L · ${resolvedStats.breakevenCount}BE`}
        />
        <StatCard
          label="Profit Factor"
          value={resolvedStats.profitFactor.toFixed(2)}
          icon={TrendingUp}
          accent
          positive={resolvedStats.profitFactor >= 1.5 ? true : resolvedStats.profitFactor < 1 ? false : undefined}
          sub="Gross Win / Gross Loss"
        />
        <StatCard
          label="Avg RR"
          value={`${resolvedStats.averageRR.toFixed(2)}R`}
          icon={Target}
          accent
          positive={resolvedStats.averageRR >= 2 ? true : resolvedStats.averageRR < 1 ? false : undefined}
          sub="Reward / Risk ratio"
        />
        <StatCard
          label="Total Trades"
          value={`${resolvedStats.totalTrades}`}
          icon={Layers}
          accent
          sub={<span><span className="text-emerald-400 font-semibold">{resolvedStats.winCount}W</span>{" · "}<span className="text-red-400 font-semibold">{resolvedStats.lossCount}L</span>{resolvedStats.breakevenCount > 0 && <span className="text-muted-foreground"> · {resolvedStats.breakevenCount}BE</span>}</span>}
        />
      </div>

      {/* ── Equity Curve + Weekly PNL ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="glass-card h-full">
            <div className="p-5 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-[13px] font-semibold text-white">Equity Curve</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-white/[0.04] rounded-lg px-2.5 py-1 border border-white/[0.06]">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                Account Balance
              </div>
            </div>
            <div className="h-[200px] px-1 pb-3">
              {resolvedEquity.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground/50">
                  No equity data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={resolvedEquity} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PURPLE} stopOpacity={0.28} />
                        <stop offset="60%" stopColor={PURPLE} stopOpacity={0.04} />
                        <stop offset="100%" stopColor={PURPLE} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="transparent" tick={{ fill: "hsl(128 8% 42%)", fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                    <YAxis stroke="transparent" tick={{ fill: "hsl(128 8% 42%)", fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                    <Tooltip content={<CustomEquityTooltip />} />
                    <Area type="monotone" dataKey="equity" stroke={PURPLE} strokeWidth={2} fill="url(#equityGrad)" dot={false}
                      activeDot={{ r: 4, fill: PURPLE, stroke: "hsl(var(--background))", strokeWidth: 2 }}
                      isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="glass-card h-full">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <BarChart2 className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Weekly PNL</span>
            </div>
            <div className="h-[200px] px-1 pb-3">
              {weeklyLabels.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground/50">
                  No weekly data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={weeklyLabels} margin={{ top: 8, right: 12, left: -24, bottom: 0 }}>
                    <XAxis dataKey="label" stroke="transparent" tick={{ fill: "hsl(220 10% 42%)", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomPnlTooltip />} cursor={{ fill: "rgba(255,255,255,0.025)" }} />
                    <Bar dataKey="pnl" radius={[4, 4, 2, 2]} maxBarSize={24} isAnimationActive={false}>
                      {weeklyLabels.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? GREEN : RED} fillOpacity={0.88} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Win/Loss Pie + Calendar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <div className="glass-card h-full">
            <div className="p-5 pb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                <Flame className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-[13px] font-semibold text-white">Win vs Loss</span>
            </div>
            <div className="h-[190px] px-1">
              {winLossData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground/50">
                  No trade data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={winLossData} cx="50%" cy="48%" innerRadius={52} outerRadius={76}
                      paddingAngle={4} dataKey="value" strokeWidth={0}
                      isAnimationActive={false}
                    >
                      {winLossData.map((entry, index) => (
                        <Cell key={`pie-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "hsl(220 15% 88%)" }}
                      formatter={(value: number, name: string) => [`${value} trades`, name]} />
                    <Legend iconType="circle" iconSize={7}
                      formatter={(value) => <span style={{ fontSize: 11, color: "hsl(220 10% 55%)" }}>{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex justify-around text-center mx-5 mb-5 border-t border-white/[0.06] pt-3">
              <div>
                <p className="text-base font-bold text-emerald-400">{resolvedStats.winCount}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Wins</p>
              </div>
              <div className="w-px bg-white/[0.06]" />
              <div>
                <p className="text-base font-bold text-red-400">{resolvedStats.lossCount}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Losses</p>
              </div>
              <div className="w-px bg-white/[0.06]" />
              <div>
                <p className="text-base font-bold text-foreground">{resolvedStats.breakevenCount}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Even</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="glass-card h-full">
            <div className="p-5 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-[13px] font-semibold text-white">Trading Calendar</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-emerald-400/60 inline-block" /> Profit
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-red-400/60 inline-block" /> Loss
                </span>
              </div>
            </div>
            <div className="px-5 pb-5">
              {calData ? (
                <CalendarHeatmap data={calData} year={now.getFullYear()} month={now.getMonth() + 1} />
              ) : (
                <CalendarHeatmap data={[]} year={now.getFullYear()} month={now.getMonth() + 1} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Trades ── */}
      <div className="glass-card">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-[13px] font-semibold text-white">Recent Trades</span>
            <span className="text-[11px] text-muted-foreground bg-white/[0.04] rounded-full px-2 py-0.5 border border-white/[0.06]">
              Last {resolvedTrades.trades.length}
            </span>
          </div>
          <Link href="/trades">
            <span className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5 cursor-pointer">
              View all <ChevronRight className="w-3 h-3" />
            </span>
          </Link>
        </div>
        {resolvedTrades.trades.length === 0 ? (
          <div className="px-5 pb-6 pt-2 text-center text-[12px] text-muted-foreground/50">
            No trades recorded yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.015]">
                  {["Symbol", "Side", "Entry", "Exit", "PNL", "RR", "Date"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resolvedTrades.trades.slice(0, 8).map((trade) => {
                  const brokerName = BROKER_MAP[(trade as { symbol?: string }).symbol ?? ""];
                  const broker = brokerName ? BROKER_INFO[brokerName] : undefined;
                  const pnl = (trade as { pnl?: number }).pnl ?? 0;
                  const rr = (trade as { rr?: number }).rr ?? 0;
                  const side = (trade as { side?: string }).side ?? "";
                  const symbol = (trade as { symbol?: string }).symbol ?? "";
                  const entryPrice = (trade as { entryPrice?: number }).entryPrice ?? 0;
                  const exitPrice = (trade as { exitPrice?: number }).exitPrice ?? null;
                  const entryTime = (trade as { entryTime?: string }).entryTime ?? "";
                  const id = (trade as { id?: number }).id ?? 0;
                  return (
                    <tr key={id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold text-white">{symbol}</span>
                          {broker && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: `${broker.color}18`, color: broker.color, border: `1px solid ${broker.color}30` }}>
                              {broker.short}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                          side === "long"
                            ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                            : "text-red-400 bg-red-500/10 border border-red-500/20"
                        }`}>
                          {side?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-foreground/80 font-mono">
                        {entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-foreground/80 font-mono">
                        {exitPrice != null
                          ? exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })
                          : <span className="text-amber-400 text-[11px] font-semibold">Open</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[13px] font-bold ${pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-red-400" : "text-foreground/60"}`}>
                          {pnl > 0 ? "+" : ""}{formatCurrency(pnl)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-foreground/70">
                        {rr > 0 ? `${rr.toFixed(2)}R` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-muted-foreground">
                        {entryTime ? new Date(entryTime).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
