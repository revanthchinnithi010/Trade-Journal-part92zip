// Net PNL Analytics — Net PNL Report.
// Header, back button, and page title are rendered by the shared Layout
// (see components/layout.tsx, keyed on the "/net-pnl" pathname).
import { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { curveCardinal } from "d3-shape";
import { supabase } from "@/lib/supabaseClient";

// ── Cardinal smooth curve ────────────────────────────────────────────────────
const cardinal = curveCardinal.tension(0.2);

// ── Time filter ──────────────────────────────────────────────────────────────
type TimeFilter = "today" | "7d" | "30d" | "3m" | "1y" | "all";

const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d",   label: "7D"   },
  { id: "30d",  label: "30D"  },
  { id: "3m",   label: "3M"   },
  { id: "1y",   label: "1Y"   },
  { id: "all",  label: "All"  },
];

// ── Supabase row shape ───────────────────────────────────────────────────────
interface TradeRow {
  pnl: number;
  exit_date: string;
}

// ── Chart data point ─────────────────────────────────────────────────────────
interface ChartPoint {
  label: string;
  cumPnl: number;
  sortKey: number;
}

// ── Date range helper: returns ISO string for gte filter, or null for "all" ──
function getStartIso(filter: TimeFilter): string | null {
  const now = new Date();
  switch (filter) {
    case "today": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d.toISOString();
    }
    case "7d": {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    case "30d": {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      return d.toISOString();
    }
    case "3m": {
      const d = new Date(now); d.setMonth(d.getMonth() - 3);
      return d.toISOString();
    }
    case "1y": {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1);
      return d.toISOString();
    }
    case "all":
      return null;
  }
}

// ── Bucketing: group trades into the right granularity for each filter ────────
function getBucketLabel(date: Date, filter: TimeFilter): string {
  switch (filter) {
    case "today":
      // Hours: "9 AM", "2 PM"
      return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
    case "7d":
      // Short weekday + date: "Mon Jul 7"
      return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    case "30d":
      // "Jul 1", "Jul 15"
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "3m": {
      // ISO week: "W28 2026"
      const tmp = new Date(date);
      tmp.setHours(0, 0, 0, 0);
      tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
      const jan4 = new Date(tmp.getFullYear(), 0, 4);
      const wk = 1 + Math.round(
        ((tmp.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7,
      );
      return `W${wk} ${tmp.getFullYear()}`;
    }
    case "1y":
      // "Jan 2026"
      return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    case "all":
      // "2024", "2025"
      return String(date.getFullYear());
  }
}

function getBucketSortKey(date: Date, filter: TimeFilter): number {
  switch (filter) {
    case "today":
      return date.getHours() * 60 + date.getMinutes();
    case "7d":
    case "30d":
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    case "3m": {
      const tmp = new Date(date);
      tmp.setHours(0, 0, 0, 0);
      tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
      const jan4 = new Date(tmp.getFullYear(), 0, 4);
      const wk = 1 + Math.round(
        ((tmp.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7,
      );
      return tmp.getFullYear() * 1000 + wk;
    }
    case "1y":
      return date.getFullYear() * 12 + date.getMonth();
    case "all":
      return date.getFullYear();
  }
}

function buildChartData(trades: TradeRow[], filter: TimeFilter): ChartPoint[] {
  const buckets = new Map<string, { pnl: number; sortKey: number }>();
  for (const t of trades) {
    const date = new Date(t.exit_date);
    const label = getBucketLabel(date, filter);
    const sortKey = getBucketSortKey(date, filter);
    const existing = buckets.get(label);
    if (existing) {
      existing.pnl += t.pnl;
    } else {
      buckets.set(label, { pnl: t.pnl, sortKey });
    }
  }

  const sorted = Array.from(buckets.entries()).sort((a, b) => a[1].sortKey - b[1].sortKey);

  let cum = 0;
  return sorted.map(([label, { pnl, sortKey }]) => {
    cum += pnl;
    return { label, cumPnl: Math.round(cum * 100) / 100, sortKey };
  });
}

// ── Y-axis tick formatter ────────────────────────────────────────────────────
function yAxisFmt(v: number): string {
  return "$" + v.toLocaleString("en-US");
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
function NetPnLTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  const isPos = value >= 0;
  return (
    <div
      className="px-3 py-2 rounded-xl text-[12px]"
      style={{
        background: "rgba(10,12,16,0.95)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <p
        className="font-bold tabular-nums"
        style={{ color: isPos ? "#22c55e" : "#ef4444" }}
      >
        {isPos ? "+" : "−"}$
        {Math.abs(value).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function NetPnLAnalytics() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [trades, setTrades]         = useState<TradeRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Re-fetch whenever the filter changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        let q = supabase
          .from("trades")
          .select("pnl, exit_date")
          .order("exit_date", { ascending: true });

        const startIso = getStartIso(timeFilter);
        if (startIso) q = q.gte("exit_date", startIso);

        const { data, error: sbErr } = await q;
        if (cancelled) return;
        if (sbErr) { setError(sbErr.message); setTrades([]); }
        else        setTrades((data ?? []) as TradeRow[]);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
        setTrades([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [timeFilter]);

  const chartData  = useMemo(() => buildChartData(trades, timeFilter), [trades, timeFilter]);
  const lastVal    = chartData.length > 0 ? chartData[chartData.length - 1].cumPnl : null;
  const isEmpty    = !loading && !error && chartData.length === 0;
  const chartColor = lastVal !== null && lastVal < 0 ? "#ef4444" : "#22c55e";

  return (
    <div className="px-4 py-4 sm:px-6 space-y-4">

      {/* ── Time filter chips ── */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
        style={{ scrollbarWidth: "none" }}
      >
        {TIME_FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setTimeFilter(f.id)}
            className="shrink-0 px-4 py-1.5 rounded-xl text-[12px] font-bold transition-all duration-150"
            style={{
              background: timeFilter === f.id
                ? "hsl(var(--primary) / 0.15)"
                : "rgba(255,255,255,0.04)",
              border: timeFilter === f.id
                ? "1px solid hsl(var(--primary) / 0.35)"
                : "1px solid rgba(255,255,255,0.07)",
              color: timeFilter === f.id
                ? "hsl(var(--primary))"
                : "hsl(128 8% 42%)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Chart card ── */}
      <div className="glass-card overflow-hidden">

        {/* Card header */}
        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-white">Net PNL Report</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cumulative equity curve
            </p>
          </div>
          {lastVal !== null && !loading && (
            <span
              className="text-[15px] font-black tabular-nums"
              style={{ color: lastVal >= 0 ? "#22c55e" : "#ef4444" }}
            >
              {lastVal >= 0 ? "+" : "−"}$
              {Math.abs(lastVal).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          )}
        </div>

        {/* Chart body */}
        <div className="h-[380px] w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center px-8">
              <p className="text-[12px] text-red-400/70 text-center">{error}</p>
            </div>
          ) : isEmpty ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 px-8">
              <p className="text-[13px] text-muted-foreground text-center">
                No trades found for this period
              </p>
              <p className="text-[11px] text-muted-foreground/50 text-center">
                Log trades or connect a broker to see your equity curve
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 16, right: 20, left: 8, bottom: 12 }}
              >
                <defs>
                  <linearGradient id="netPnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={chartColor} stopOpacity={0.32} />
                    <stop offset="55%"  stopColor={chartColor} stopOpacity={0.07} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0}    />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />

                <XAxis
                  dataKey="label"
                  stroke="none"
                  tick={{ fill: "hsl(128 8% 40%)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />

                <YAxis
                  stroke="none"
                  tick={{ fill: "hsl(128 8% 40%)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={yAxisFmt}
                  width={72}
                />

                <Tooltip
                  content={<NetPnLTooltip />}
                  cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
                />

                <Area
                  type={cardinal as any}
                  dataKey="cumPnl"
                  stroke={chartColor}
                  strokeWidth={2}
                  fill="url(#netPnlGrad)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: chartColor,
                    stroke: "#0a0c10",
                    strokeWidth: 2,
                  }}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
