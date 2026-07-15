import { memo, useMemo, useEffect, useRef, useState } from "react";
import {
  useListTrades,
  useGetCalendarHeatmap,
} from "@workspace/api-client-react";
import { useCurrencyFormatter, useCurrencyAxisFormatter } from "@/store/currencyStore";
import { TrendingUp, Activity, ChevronRight } from "lucide-react";
import AccountValueWidget from "@/components/AccountValueWidget";
import DashboardSegmentedControl from "@/components/DashboardSegmentedControl";
import { useCombinedPortfolio } from "@/store/combinedPortfolioStore";
import { useBrokerStore } from "@/store/brokerStore";
import { Link } from "wouter";
import { BROKER_MAP, BROKER_INFO } from "@/data/sampleData";
import { useTickStore } from "@/store/tickStore";
import {
  PageTransition,
  AnimatedCard,
} from "@/components/animations";

const DASHBOARD_TIMEOUT_MS = 2_000;

const DEFAULT_TRADES = { trades: [], total: 0 };

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  borderColor: "rgba(57, 91, 67, 0.3)",
  borderRadius: "12px",
  boxShadow: "0 8px 28px rgba(7, 17, 13, 0.65)",
  fontSize: "12px",
  padding: "8px 12px",
};


// ── Calendar Heatmap ──────────────────────────────────────────────────────────
const CalendarHeatmap = memo(function CalendarHeatmap({
  data, year, month,
}: { data: Array<{ date: string; pnl: number; trades: number }>; year: number; month: number }) {
  const fc            = useCurrencyFormatter();
  const axisFormatter = useCurrencyAxisFormatter();
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
            {entry.pnl > 0 ? "+" : ""}{axisFormatter(Math.abs(entry.pnl))}
          </span>
        )}
        {entry && entry.trades > 0 && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 hidden group-hover/cell:block pointer-events-none">
            <div className="dash-card px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-xl">
              <p className={`font-bold ${entry.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fc(entry.pnl)}</p>
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

const Dashboard = memo(function Dashboard() {
  const mountTimeRef  = useRef(performance.now());
  const [timedOut,          setTimedOut]          = useState(false);
  const ticks         = useTickStore(s => s.ticks);
  const fc            = useCurrencyFormatter();

  useEffect(() => {
    console.log("[Dashboard] mount");
    const t = setTimeout(() => {
      console.log("[Dashboard] loading timeout reached — rendering with available data");
      setTimedOut(true);
    }, DASHBOARD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const { data: recentTrades, isLoading: tradesLoading, isError: tradesError }
    = useListTrades({ limit: 10 });

  const combined = useCombinedPortfolio();
  const brokerOrdersCount = useBrokerStore(s =>
    Object.values(s.brokerOrders).reduce((sum, o) => sum + o.length, 0));

  useEffect(() => {
    if (!tradesLoading && !timedOut) {
      const elapsed = Math.round(performance.now() - mountTimeRef.current);
      console.log(`[Dashboard] loading complete in ${elapsed}ms — trades:${!tradesError}`);
      setTimedOut(true);
    }
  }, [tradesLoading, timedOut, tradesError]);

  const now = useMemo(() => new Date(), []);
  const { data: calData } = useGetCalendarHeatmap({ year: now.getFullYear(), month: now.getMonth() + 1 });

  const isStillLoading = !timedOut && tradesLoading;

  const resolvedTrades = recentTrades ?? DEFAULT_TRADES;

  const openTrades = useMemo(() => {
    return resolvedTrades.trades.filter((t) => (t as { exitPrice?: number | null }).exitPrice == null);
  }, [resolvedTrades.trades]);

  const totalValue = useMemo(() => {
    return openTrades.reduce((sum, t) => {
      const ep = (t as { entryPrice?: number }).entryPrice ?? 0;
      const qty = (t as { quantity?: number; size?: number }).quantity
        ?? (t as { quantity?: number; size?: number }).size
        ?? 1;
      return sum + ep * qty;
    }, 0);
  }, [openTrades]);

  const upnlUSD = useMemo(() => {
    return openTrades.reduce((sum, t) => {
      const symbol     = (t as { symbol?: string }).symbol ?? "";
      const side       = (t as { side?: string }).side ?? "";
      const entryPrice = (t as { entryPrice?: number }).entryPrice ?? 0;
      const liveTick   = ticks[symbol.toUpperCase()];
      const livePrice  = liveTick?.price ?? null;
      if (livePrice == null || entryPrice === 0) return sum;
      const isLong = side === "long";
      return sum + (isLong ? livePrice - entryPrice : entryPrice - livePrice);
    }, 0);
  }, [openTrades, ticks]);

  if (isStillLoading) {
    // Structurally mirrors every section of the real content below, at the
    // same fixed heights (AccountValueWidget ≈176px, calendar card ≈302px,
    // recent trades table). Matching heights exactly means the eventual
    // swap to real content never shifts layout — this only ever runs once
    // now that Dashboard is kept mounted (see DASHBOARD_NODE in App.tsx),
    // not on every tab switch.
    return (
      <div className="min-h-full space-y-4 pb-12" style={{ background: "#000000" }}>
        <div className="dash-card shimmer-loading" style={{ height: 176 }} />
        <div className="dash-card shimmer-loading" style={{ height: 302 }} />
        <div className="dash-card shimmer-loading" style={{ height: 340 }} />
      </div>
    );
  }

  const apiOffline = tradesError;

  return (
    <PageTransition className="space-y-4 pb-12" style={{ minHeight: "100%", background: "#000000" }} fill={false}>

      {apiOffline && (
        <div className="dash-card px-5 py-3 flex items-center gap-3 border-amber-500/20 bg-amber-500/[0.04]">
          <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <p className="text-[12px] text-amber-400 font-medium">
            API server offline — dashboard showing cached or empty data
          </p>
        </div>
      )}

      {/* ── Segmented control — Dashboard / Reports ──
          Selection is derived from the current route, not local state, so
          it self-corrects when the user navigates back from Reports. */}
      <DashboardSegmentedControl />

      {/* ── Account Value Widget ──
          accountValue/upnl/pnl are sourced ONLY from combinedPortfolio
          (Delta Exchange + cTrader combined). The `Display` props are already
          converted using per-broker rates (Delta=fixed ₹85, cTrader=live).
          AccountValueWidget uses them directly — it must NOT re-multiply by
          the global exchange rate or Delta amounts will be double-converted. */}
      <AccountValueWidget
        accountValueUSD={combined.usd.accountValue}
        accountValueDisplay={combined.display.accountValue}
        upnlUSD={combined.usd.unrealizedPnl}
        upnlDisplay={combined.display.unrealizedPnl}
        realizedPnlUSD={combined.usd.realizedPnl}
        realizedPnlDisplay={combined.display.realizedPnl}
        netPnlUSD={combined.usd.netPnl}
        netPnlDisplay={combined.display.netPnl}
        openPositions={openTrades.length}
        openOrders={brokerOrdersCount}
      />

      {/* ── Trading Calendar ── */}
      <AnimatedCard index={1} className="dash-card overflow-hidden">
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
      </AnimatedCard>

      {/* ── Recent Trades ── */}
      <AnimatedCard index={2} className="dash-card overflow-hidden">
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
                          {pnl > 0 ? "+" : ""}{fc(pnl)}
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
      </AnimatedCard>
    </PageTransition>
  );
});

export default Dashboard;
