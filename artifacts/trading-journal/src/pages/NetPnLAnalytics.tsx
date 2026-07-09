// Net PNL Analytics page.
// Back button + "Net PNL Analytics" title are rendered by the shared Layout
// header (see components/layout.tsx, keyed on the "/net-pnl" pathname).
//
// Net PNL data is fetched directly from Supabase (trades table) via the
// browser client in @/lib/supabaseClient. No charts on this page — summary
// cards only.
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { TrendingUp, TrendingDown, Activity, BarChart2, CalendarDays, Zap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useCurrencyFormatter } from "@/store/currencyStore";
import { cardVariants } from "@/animations/motion";

// ── Time filter chips — UI only, not yet wired to data ──────────────────────
type TimeFilter = "today" | "7d" | "30d" | "3m" | "6m" | "1y" | "all";

const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d",   label: "7D"   },
  { id: "30d",  label: "30D"  },
  { id: "3m",   label: "3M"   },
  { id: "6m",   label: "6M"   },
  { id: "1y",   label: "1Y"   },
  { id: "all",  label: "All"  },
];

// ── Local date helpers (avoid UTC drift) ────────────────────────────────────
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Summary card — mirrors the existing KpiCard design (see pnl-analytics.tsx) ──
function KpiCard({ label, value, sub, positive, icon: Icon, index }: {
  label: string; value: string; sub?: string; positive?: boolean;
  icon: React.ElementType; index: number;
}) {
  return (
    <motion.div
      variants={cardVariants} custom={index}
      initial="hidden" animate="visible"
      className="glass-card p-4 relative overflow-hidden group"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
      </div>
      <div className={`text-[22px] font-black leading-none tracking-tight ${
        positive === true  ? "text-emerald-400" :
        positive === false ? "text-red-400"     : "text-foreground"
      }`}>
        {value}
      </div>
      {sub && <p className="text-[10px] text-muted-foreground/60 mt-1.5">{sub}</p>}
    </motion.div>
  );
}

// ── Row shape returned from the trades table ────────────────────────────────
interface TradeRow {
  pnl: number;
  exit_date: string; // ISO timestamp
}

export default function NetPnLAnalytics() {
  const fc  = useCurrencyFormatter();
  const now = useMemo(() => new Date(), []);

  // UI-only state — selection is not yet wired to the cards/data above.
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const [trades, setTrades]   = useState<TradeRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("trades")
          .select("pnl, exit_date");

        if (cancelled) return;
        if (error) {
          setError(error.message);
          setTrades([]);
        } else {
          setTrades((data ?? []) as TradeRow[]);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setTrades([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const todayStr    = useMemo(() => localDateStr(now), [now]);
  const weekCutoff   = useMemo(() => {
    const d   = new Date(now);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return localDateStr(d);
  }, [now]);
  const monthCutoff = useMemo(() => todayStr.slice(0, 7), [todayStr]);
  const yearStr     = useMemo(() => String(now.getFullYear()), [now]);

  const { netPnl, todayPnl, weekPnl, monthPnl, yearPnl } = useMemo(() => {
    let netPnl = 0, todayPnl = 0, weekPnl = 0, monthPnl = 0, yearPnl = 0;
    for (const t of trades ?? []) {
      const date = localDateStr(new Date(t.exit_date));
      netPnl += t.pnl;
      if (date === todayStr)            todayPnl += t.pnl;
      if (date >= weekCutoff)           weekPnl  += t.pnl;
      if (date.startsWith(monthCutoff)) monthPnl += t.pnl;
      if (date.startsWith(yearStr))     yearPnl  += t.pnl;
    }
    return { netPnl, todayPnl, weekPnl, monthPnl, yearPnl };
  }, [trades, todayStr, weekCutoff, monthCutoff, yearStr]);

  const pnlSign = (v: number) => (v > 0 ? "+" : "");
  const fmt = (v: number) => (loading ? "…" : fc(v));

  return (
    <div className="px-4 py-4 sm:px-6 space-y-4">
      {error && (
        <div
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[11px] font-semibold"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.22)",
            color: "rgba(248,113,113,0.9)",
          }}
        >
          Failed to load Net PNL data from Supabase: {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard
          index={0} label="Net PNL" icon={netPnl >= 0 ? TrendingUp : TrendingDown}
          value={fmt(netPnl)}
          positive={loading ? undefined : netPnl > 0 ? true : netPnl < 0 ? false : undefined}
          sub="All time"
        />
        <KpiCard
          index={1} label="Today" icon={Activity}
          value={loading ? "…" : `${pnlSign(todayPnl)}${fc(todayPnl)}`}
          positive={loading ? undefined : todayPnl > 0 ? true : todayPnl < 0 ? false : undefined}
          sub={todayStr}
        />
        <KpiCard
          index={2} label="This Week" icon={BarChart2}
          value={loading ? "…" : `${pnlSign(weekPnl)}${fc(weekPnl)}`}
          positive={loading ? undefined : weekPnl > 0 ? true : weekPnl < 0 ? false : undefined}
        />
        <KpiCard
          index={3} label="This Month" icon={CalendarDays}
          value={loading ? "…" : `${pnlSign(monthPnl)}${fc(monthPnl)}`}
          positive={loading ? undefined : monthPnl > 0 ? true : monthPnl < 0 ? false : undefined}
          sub={now.toLocaleDateString("en-US", { month: "long" })}
        />
        <KpiCard
          index={4} label="This Year" icon={Zap}
          value={loading ? "…" : `${pnlSign(yearPnl)}${fc(yearPnl)}`}
          positive={loading ? undefined : yearPnl > 0 ? true : yearPnl < 0 ? false : undefined}
          sub={yearStr}
        />
      </div>

      {/* ── Time filter chips — UI only, not yet connected to data ── */}
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
              background:  timeFilter === f.id ? "hsl(var(--primary) / 0.15)" : "rgba(255,255,255,0.04)",
              border:      timeFilter === f.id ? "1px solid hsl(var(--primary) / 0.35)" : "1px solid rgba(255,255,255,0.07)",
              color:       timeFilter === f.id ? "hsl(var(--primary))" : "hsl(128 8% 42%)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
