// Net PNL Analytics — Net PNL Report
// Header, back button, and page title are rendered by the shared Layout
// (see components/layout.tsx, keyed on the "/net-pnl" pathname).
import { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";

// ── Types ─────────────────────────────────────────────────────────────────────
type TimeFilter = "today" | "7d" | "30d" | "3m" | "1y" | "all";

interface TradeRow {
  pnl: number;
  exit_date: string;
}

/** Raw bucket before zero-crossing split */
interface RawPoint {
  label:   string;
  cumPnl:  number;
  sortKey: number;
}

/**
 * Final point fed to Recharts.
 * greenPnl / redPnl are null where the other series owns the value,
 * except at zero-crossing anchors where both hold 0 so the lines connect.
 */
interface ChartPoint {
  label:    string;
  cumPnl:   number;
  sortKey:  number;
  greenPnl: number | null;
  redPnl:   number | null;
}

// ── Time filter config ────────────────────────────────────────────────────────
const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d",   label: "7D"   },
  { id: "30d",  label: "30D"  },
  { id: "3m",   label: "3M"   },
  { id: "1y",   label: "1Y"   },
  { id: "all",  label: "All"  },
];

// ── Date helpers ──────────────────────────────────────────────────────────────
function getStartIso(filter: TimeFilter): string | null {
  const now = new Date();
  switch (filter) {
    case "today": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d.toISOString();
    }
    case "7d": {
      const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString();
    }
    case "30d": {
      const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString();
    }
    case "3m": {
      const d = new Date(now); d.setMonth(d.getMonth() - 3); return d.toISOString();
    }
    case "1y": {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString();
    }
    case "all":
      return null;
  }
}

function getBucketLabel(date: Date, filter: TimeFilter): string {
  switch (filter) {
    case "today":
      return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
    case "7d":
      return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    case "30d":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "3m": {
      const tmp = new Date(date);
      tmp.setHours(0, 0, 0, 0);
      tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
      const jan4 = new Date(tmp.getFullYear(), 0, 4);
      const wk   = 1 + Math.round(
        ((tmp.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7,
      );
      return `W${wk} ${tmp.getFullYear()}`;
    }
    case "1y":
      return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    case "all":
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
      const wk   = 1 + Math.round(
        ((tmp.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7,
      );
      return tmp.getFullYear() * 1000 + wk;
    }
    case "1y":
      return date.getFullYear() * 12 + date.getMonth();
    case "all":
      return date.getFullYear();
  }
}

// ── Data builders ─────────────────────────────────────────────────────────────
function bucketTrades(trades: TradeRow[], filter: TimeFilter): RawPoint[] {
  const buckets = new Map<string, { pnl: number; sortKey: number }>();
  for (const t of trades) {
    const date    = new Date(t.exit_date);
    const label   = getBucketLabel(date, filter);
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

/**
 * Splits raw points into green/red series so the line color changes at zero.
 *
 * Rules:
 *   cumPnl > 0  → greenPnl only, redPnl = null
 *   cumPnl < 0  → redPnl only,   greenPnl = null
 *   cumPnl === 0 → shared anchor (both = 0) — lines connect without gaps
 *   strict sign flip (+→- or -→+): inject an extra shared-zero anchor between
 *   the two adjacent points so both series meet cleanly at y = 0.
 */
function splitAtZero(raw: RawPoint[]): ChartPoint[] {
  if (raw.length === 0) return [];

  const out: ChartPoint[] = [];

  for (let i = 0; i < raw.length; i++) {
    const curr = raw[i];
    const prev = i > 0 ? raw[i - 1] : null;

    // Inject a shared zero anchor for strict sign crossings (bypassing exact-zero
    // points, which are handled as shared anchors in the assignment below).
    if (prev !== null) {
      const pv = prev.cumPnl;
      const cv = curr.cumPnl;
      if ((pv > 0 && cv < 0) || (pv < 0 && cv > 0)) {
        const t = pv / (pv - cv);          // fraction where value = 0
        out.push({
          label:    "",                      // empty → hidden in tooltip / axis
          cumPnl:   0,
          sortKey:  prev.sortKey + t * (curr.sortKey - prev.sortKey),
          greenPnl: 0,
          redPnl:   0,
        });
      }
    }

    // Assign to the correct series; exact-zero is shared so both lines connect.
    if (curr.cumPnl === 0) {
      out.push({ ...curr, greenPnl: 0, redPnl: 0 });
    } else if (curr.cumPnl > 0) {
      out.push({ ...curr, greenPnl: curr.cumPnl, redPnl: null });
    } else {
      out.push({ ...curr, greenPnl: null, redPnl: curr.cumPnl });
    }
  }

  return out;
}

function buildChartData(trades: TradeRow[], filter: TimeFilter): ChartPoint[] {
  return splitAtZero(bucketTrades(trades, filter));
}

// ── Formatters ────────────────────────────────────────────────────────────────
function yAxisFmt(v: number): string {
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v}`;
}

function fmtUsd(v: number): string {
  return (v >= 0 ? "+" : "−") + "$" +
    Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
interface TooltipPayloadEntry {
  value:    number | null;
  dataKey:  string;
}

function NetPnLTooltip({
  active,
  payload,
  label,
}: {
  active?:   boolean;
  payload?:  TooltipPayloadEntry[];
  label?:    string;
}) {
  if (!active || !payload?.length) return null;

  // Pick whichever series has a non-null value
  const entry  = payload.find(p => p.value !== null && p.value !== undefined);
  const value  = entry?.value ?? null;
  if (value === null) return null;

  const isPos  = value >= 0;
  const color  = isPos ? "#22c55e" : "#ef4444";

  return (
    <div
      style={{
        background:       "rgba(10,12,16,0.97)",
        border:           "1px solid rgba(255,255,255,0.09)",
        borderRadius:     10,
        padding:          "10px 14px",
        backdropFilter:   "blur(16px)",
        boxShadow:        "0 8px 28px rgba(0,0,0,0.55)",
        minWidth:         140,
      }}
    >
      <p style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, fontWeight: 500 }}>
        {label}
      </p>
      <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 3 }}>Net PNL</p>
      <p style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {fmtUsd(value)}
      </p>
      <p style={{ fontSize: 10, color: "#4b5563", marginTop: 4 }}>
        Profit / Loss (USD)
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NetPnLAnalytics() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [trades,     setTrades]     = useState<TradeRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

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
        if (sbErr) { setError(sbErr.message); setTrades([]); return; }
        const valid = (data ?? []).filter((r: Record<string, unknown>) => {
          if (typeof r.pnl !== "number" || isNaN(r.pnl as number)) return false;
          if (!r.exit_date) return false;
          const d = new Date(r.exit_date as string);
          return !isNaN(d.getTime());
        }) as TradeRow[];
        setTrades(valid);
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

  const chartData = useMemo(() => buildChartData(trades, timeFilter), [trades, timeFilter]);
  const lastVal   = chartData.length > 0 ? chartData[chartData.length - 1].cumPnl : null;
  const isEmpty   = !loading && !error && chartData.length === 0;

  // ── Axis style tokens ────────────────────────────────────────────────────
  const axisColor  = "rgba(255,255,255,0.12)";
  const tickStyle  = { fill: "#9ca3af", fontSize: 11, fontWeight: 500 };
  const gridColor  = "rgba(255,255,255,0.055)";

  return (
    <div className="py-4 space-y-4 w-full">

      {/* ── Chips — keep inner padding ── */}
      <div className="px-4 sm:px-6">
        {/* ── Time filter chips ── */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
          style={{ scrollbarWidth: "none" }}
        >
          {TIME_FILTERS.map(f => {
            const active = timeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setTimeFilter(f.id)}
                className="shrink-0 px-4 py-1.5 rounded-xl text-[12px] font-bold transition-all duration-150"
                style={{
                  background: active ? "hsl(var(--primary) / 0.15)" : "rgba(255,255,255,0.04)",
                  border:     active ? "1px solid hsl(var(--primary) / 0.35)" : "1px solid rgba(255,255,255,0.07)",
                  color:      active ? "hsl(var(--primary))" : "#6b7280",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Chart — full bleed, no horizontal padding ── */}
      <div className="h-[380px] md:h-[450px] lg:h-[520px] w-full">
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
              Log trades or connect a broker to see your Net PNL
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 8, left: 0, bottom: 10 }}
            >
              {/* Grid — both horizontal and vertical */}
              <CartesianGrid
                stroke={gridColor}
                strokeDasharray="0"
                horizontal={true}
                vertical={true}
              />

              {/* X-Axis */}
              <XAxis
                dataKey="label"
                axisLine={{ stroke: axisColor }}
                tickLine={{ stroke: axisColor }}
                tick={tickStyle}
                interval="preserveStartEnd"
                minTickGap={48}
              />

              {/* Y-Axis */}
              <YAxis
                axisLine={{ stroke: axisColor }}
                tickLine={{ stroke: axisColor }}
                tick={tickStyle}
                tickFormatter={yAxisFmt}
                width={44}
              />

              {/* Tooltip */}
              <Tooltip
                content={<NetPnLTooltip />}
                cursor={{ stroke: "rgba(255,255,255,0.10)", strokeWidth: 1, strokeDasharray: "4 3" }}
              />

              {/* Green line — cumPnl ≥ 0 segments */}
              <Line
                dataKey="greenPnl"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#22c55e", stroke: "#0a0c10", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={true}
                animationDuration={700}
                animationEasing="ease-out"
              />

              {/* Red line — cumPnl < 0 segments */}
              <Line
                dataKey="redPnl"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#ef4444", stroke: "#0a0c10", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={true}
                animationDuration={700}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
