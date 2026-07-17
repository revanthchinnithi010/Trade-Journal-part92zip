import { memo, useMemo, useEffect, useRef, useState, useCallback } from "react";
import {
  useListTrades,
  useGetCalendarHeatmap,
} from "@workspace/api-client-react";
import { useCurrencyFormatter, useCurrencyAxisFormatter } from "@/store/currencyStore";
import { TrendingUp, Activity, ChevronRight, ChevronLeft, X, TrendingDown } from "lucide-react";
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
import {
  Drawer,
  DrawerContent,
  DrawerClose,
} from "@/components/ui/drawer";

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
// ── Day Detail Sheet ──────────────────────────────────────────────────────────
const DayDetailSheet = memo(function DayDetailSheet({
  date, dayData, open, onClose,
}: {
  date: string;
  dayData: { pnl: number; trades: number } | null;
  open: boolean;
  onClose: () => void;
}) {
  const fc  = useCurrencyFormatter();
  const { data, isLoading } = useListTrades(
    { date, limit: 100 },
    { query: { enabled: open && !!date } },
  );

  const trades = data?.trades ?? [];

  // Filter client-side to only the selected day's trades so the list and
  // all derived stats are always consistent with the chosen calendar date.
  const dayTrades = useMemo(() => {
    if (!date) return trades;
    return trades.filter((t) => {
      const raw = (t as { entryTime?: string | null }).entryTime;
      if (!raw) return false;
      // Slice the date portion directly to avoid UTC-conversion timezone shifts
      return raw.slice(0, 10) === date;
    });
  }, [trades, date]);

  const wins      = dayTrades.filter(t => t.outcome === "win").length;
  const losses    = dayTrades.filter(t => t.outcome === "loss").length;
  const dailyPnl  = dayTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  const label = useMemo(() => {
    if (!date) return "";
    return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  }, [date]);

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[85vh] bg-[#0d0d0d] border-white/10 rounded-t-2xl px-0 pb-0">
        {/* handle */}
        <div className="mx-auto mt-3 mb-4 h-1 w-10 rounded-full bg-white/20" />

        {/* header */}
        <div className="flex items-start justify-between px-5 mb-4">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest mb-0.5">Daily Summary</p>
            <p className="text-[15px] font-semibold text-white">{label}</p>
          </div>
          <DrawerClose asChild>
            <button className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 text-muted-foreground hover:text-white transition-colors mt-0.5">
              <X className="w-4 h-4" />
            </button>
          </DrawerClose>
        </div>

        {/* summary row */}
        <div className="flex gap-2 px-5 mb-4">
          <div className="flex-1 rounded-xl bg-white/5 border border-white/[0.07] p-3">
            <p className="text-[10px] text-muted-foreground mb-1">Net P&L</p>
            <p className={`text-[16px] font-bold ${dailyPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {dailyPnl >= 0 ? "+" : ""}{fc(dailyPnl)}
            </p>
          </div>
          <div className="flex-1 rounded-xl bg-white/5 border border-white/[0.07] p-3">
            <p className="text-[10px] text-muted-foreground mb-1">Trades</p>
            <p className="text-[16px] font-bold text-white">{dayTrades.length}</p>
          </div>
          <div className="flex-1 rounded-xl bg-white/5 border border-white/[0.07] p-3">
            <p className="text-[10px] text-muted-foreground mb-1">W / L</p>
            <p className="text-[16px] font-bold">
              <span className="text-emerald-400">{wins}</span>
              <span className="text-white/40 mx-1">/</span>
              <span className="text-red-400">{losses}</span>
            </p>
          </div>
        </div>

        {/* trade list */}
        <div className="px-5 pb-1 mb-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Trades</p>
        </div>
        <div className="overflow-y-auto px-5 pb-8" style={{ maxHeight: "calc(85vh - 240px)" }}>
          {isLoading && (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-16 rounded-xl bg-white/5 shimmer-loading" />
              ))}
            </div>
          )}
          {!isLoading && dayTrades.length === 0 && (
            <div className="text-center py-10">
              <p className="text-muted-foreground text-sm">No trades for this day.</p>
            </div>
          )}
          {!isLoading && dayTrades.map((trade) => (
            <div key={trade.id} className="flex items-center gap-3 py-3 border-b border-white/[0.06] last:border-0">
              {/* icon */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                trade.pnl >= 0 ? "bg-emerald-500/15" : "bg-red-500/15"
              }`}>
                {trade.pnl >= 0
                  ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                  : <TrendingDown className="w-4 h-4 text-red-400" />}
              </div>
              {/* info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[13px] font-semibold text-white">{trade.symbol}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                    trade.side === "long"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-red-500/20 text-red-400"
                  }`}>{trade.side}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {(trade.entryPrice ?? 0).toLocaleString()} → {(trade.exitPrice ?? 0).toLocaleString()}
                  <span className="ml-2 text-white/40">× {trade.quantity}</span>
                </p>
                {trade.setupTags && (
                  <p className="text-[10px] text-blue-400/70 mt-0.5 truncate">{trade.setupTags}</p>
                )}
              </div>
              {/* pnl */}
              <div className="text-right flex-shrink-0">
                <p className={`text-[14px] font-bold ${trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {trade.pnl >= 0 ? "+" : ""}{fc(trade.pnl)}
                </p>
                {trade.pnlPercent != null && (
                  <p className="text-[10px] text-muted-foreground">
                    {trade.pnlPercent >= 0 ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
});

// ── Calendar Heatmap ──────────────────────────────────────────────────────────
const CalendarHeatmap = memo(function CalendarHeatmap({
  data, year, month, onPrev, onNext, onDateClick,
}: { data: Array<{ date: string; pnl: number; trades: number }>; year: number; month: number; onPrev: () => void; onNext: () => void; onDateClick: (date: string) => void }) {
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

  const [statsTooltip, setStatsTooltip] = useState(false);

  useEffect(() => {
    if (!statsTooltip) return;
    const close = () => setStatsTooltip(false);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("touchmove", close, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("touchmove", close, { capture: true });
    };
  }, [statsTooltip]);

  const monthlyPnl = useMemo(() => data.reduce((sum, d) => sum + d.pnl, 0), [data]);

  const remainingDays = useMemo(() => {
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
    if (!isCurrentMonth) return 0;
    return daysInMonth - today.getDate();
  }, [year, month, daysInMonth]);

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
        onClick={() => onDateClick(dateStr)}
        className={`relative rounded-lg aspect-square flex flex-col items-center justify-center border border-transparent transition-opacity active:opacity-60 ${
          entry && entry.trades > 0 ? "cursor-pointer" : "cursor-default"
        }`}
        style={cellStyles[dateStr]}
      >
        <span className="text-[10px] font-semibold leading-none text-foreground/90">{d}</span>
        {entry && entry.trades > 0 && (
          <span className={`text-[8px] font-bold leading-none mt-0.5 ${entry.pnl > 0 ? "text-emerald-400" : "text-red-400"}`}>
            {entry.pnl > 0 ? "+" : ""}{axisFormatter(Math.abs(entry.pnl))}
          </span>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 flex items-center justify-between mb-3">
        {/* left: month navigator */}
        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-muted-foreground px-1">{monthName}</span>
          <button
            onClick={onNext}
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {/* right: monthly stats */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setStatsTooltip((v) => !v)}
              className="text-[11px] font-medium text-muted-foreground border-b border-dashed border-muted-foreground/50 leading-none pb-px cursor-pointer select-none"
            >
              Monthly stats:
            </button>
            {statsTooltip && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setStatsTooltip(false)} />
                <div className="absolute right-0 top-full mt-2 z-40 w-52 rounded-xl border border-white/[0.08] bg-[#111111] shadow-2xl px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-white mb-1">Monthly Stats</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Total realised P&L for the selected month, calculated from all closed trades on trading days.
                  </p>
                  {remainingDays > 0 && (
                    <p className="text-[10px] text-blue-300 mt-1.5">
                      {remainingDays} trading days remaining this month.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
          {data.length > 0 && (
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                monthlyPnl >= 0
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {monthlyPnl >= 0 ? "+" : ""}{axisFormatter(monthlyPnl)}
            </span>
          )}
          {remainingDays > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-900/70 text-white">
              {remainingDays} days
            </span>
          )}
        </div>
      </div>
      <div className="px-3">
        <div className="grid grid-cols-7 gap-1 mb-1.5">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-0.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">{days}</div>
      </div>
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
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);

  const handleCalPrev = useCallback(() => {
    setCalMonth((m) => { if (m === 1) { setCalYear((y) => y - 1); return 12; } return m - 1; });
  }, []);
  const handleCalNext = useCallback(() => {
    setCalMonth((m) => { if (m === 12) { setCalYear((y) => y + 1); return 1; } return m + 1; });
  }, []);

  const { data: calData } = useGetCalendarHeatmap({ year: calYear, month: calMonth });

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [sheetOpen,    setSheetOpen]    = useState(false);

  const handleDateClick = useCallback((date: string) => {
    const calMap = (calData ?? []).reduce<Record<string, { pnl: number; trades: number }>>((m, d) => {
      m[d.date] = { pnl: d.pnl, trades: d.trades };
      return m;
    }, {});
    const entry = calMap[date];
    if (!entry || entry.trades === 0) return; // only open for days with trades
    setSelectedDate(date);
    setSheetOpen(true);
  }, [calData]);

  const selectedDayData = useMemo(() => {
    if (!selectedDate || !calData) return null;
    return calData.find(d => d.date === selectedDate) ?? null;
  }, [selectedDate, calData]);

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

      {/* ── Account Value Widget — -mt-2 closes the gap with the segmented control ── */}
      <div className="-mt-2">
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
      </div>

      {/* ── Trading Calendar ── */}
      <div className="-mx-4">
        <p className="px-4 pb-2 text-[16px] font-semibold text-white">Trading Calendar</p>
        {calData ? (
          <CalendarHeatmap data={calData} year={calYear} month={calMonth} onPrev={handleCalPrev} onNext={handleCalNext} onDateClick={handleDateClick} />
        ) : (
          <CalendarHeatmap data={[]} year={calYear} month={calMonth} onPrev={handleCalPrev} onNext={handleCalNext} onDateClick={handleDateClick} />
        )}
      </div>

      {/* ── Day Detail Sheet ── */}
      <DayDetailSheet
        date={selectedDate}
        dayData={selectedDayData}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />

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
                        {(entryPrice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-foreground/80 font-mono">
                        {exitPrice != null
                          ? (exitPrice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })
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
