import { useState, useMemo } from "react";
import { useGetCalendarHeatmap } from "@workspace/api-client-react";
import { useCurrencyFormatter } from "@/store/currencyStore";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Calendar, BarChart2 } from "lucide-react";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getIntensityStyle(pnl: number, trades: number, maxAbs: number): React.CSSProperties {
  if (trades === 0) return {};
  const intensity = Math.min(Math.abs(pnl) / Math.max(maxAbs, 1), 1);
  if (pnl > 0) {
    return {
      backgroundColor: `rgba(52,211,153,${0.1 + intensity * 0.5})`,
      borderColor: `rgba(52,211,153,${0.2 + intensity * 0.4})`,
      boxShadow: intensity > 0.5 ? `0 0 12px rgba(52,211,153,${intensity * 0.2})` : "none",
    };
  }
  if (pnl < 0) {
    return {
      backgroundColor: `rgba(248,113,113,${0.1 + intensity * 0.5})`,
      borderColor: `rgba(248,113,113,${0.2 + intensity * 0.4})`,
      boxShadow: intensity > 0.5 ? `0 0 12px rgba(248,113,113,${intensity * 0.2})` : "none",
    };
  }
  return { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" };
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const fc = useCurrencyFormatter();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const { data: heatmap } = useGetCalendarHeatmap({ year, month });

  const prevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month, 1));

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();

  const dayMap = useMemo(() => {
    const m: Record<string, { pnl: number; trades: number }> = {};
    (heatmap ?? []).forEach((d) => { m[d.date.slice(0, 10)] = { pnl: d.pnl, trades: d.trades }; });
    return m;
  }, [heatmap]);

  const maxAbs = useMemo(() => Math.max(...Object.values(dayMap).map((d) => Math.abs(d.pnl)), 1), [dayMap]);

  const monthSummary = useMemo(() => {
    const entries = Object.values(dayMap).filter((d) => d.trades > 0);
    const totalPnl = entries.reduce((s, d) => s + d.pnl, 0);
    const totalTrades = entries.reduce((s, d) => s + d.trades, 0);
    const winDays = entries.filter((d) => d.pnl > 0).length;
    const lossDays = entries.filter((d) => d.pnl < 0).length;
    const tradingDays = entries.length;
    const winRate = tradingDays > 0 ? (winDays / tradingDays) * 100 : 0;
    return { totalPnl, totalTrades, winDays, lossDays, tradingDays, winRate };
  }, [dayMap]);

  const calendarCells = useMemo(() => {
    const cells: Array<null | { day: number; date: string; data: { pnl: number; trades: number } }> = [];
    for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      cells.push({ day: i, date: dateStr, data: dayMap[dateStr] || { pnl: 0, trades: 0 } });
    }
    return cells;
  }, [year, month, daysInMonth, firstDayOfMonth, dayMap]);

  const weeklyRows = useMemo(() => {
    const rows: Array<typeof calendarCells> = [];
    let row: typeof calendarCells = [];
    calendarCells.forEach((cell, i) => {
      row.push(cell);
      if ((i + 1) % 7 === 0) {
        rows.push(row);
        row = [];
      }
    });
    if (row.length > 0) rows.push(row);
    return rows;
  }, [calendarCells]);

  const monthName = currentDate.toLocaleString("default", { month: "long", year: "numeric" });
  const isCurrentMonth = new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <motion.div
      className="space-y-5 pb-12"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white mb-1">Trading Calendar</h1>
          <p className="text-sm text-muted-foreground">Daily performance heatmap · Click a day to inspect</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.08] text-muted-foreground hover:text-white hover:bg-white/[0.08] hover:border-white/[0.14] transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-4 py-2 glass-card text-[13px] font-semibold text-white min-w-[160px] text-center">
            {monthName}
          </div>
          <button
            onClick={nextMonth}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.08] text-muted-foreground hover:text-white hover:bg-white/[0.08] hover:border-white/[0.14] transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Monthly Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Month PNL",
            value: fc(monthSummary.totalPnl),
            positive: monthSummary.totalPnl >= 0,
            icon: monthSummary.totalPnl >= 0 ? TrendingUp : TrendingDown,
            color: monthSummary.totalPnl >= 0 ? "text-emerald-400" : "text-red-400",
          },
          {
            label: "Win Days",
            value: `${monthSummary.winDays} / ${monthSummary.tradingDays}`,
            positive: true,
            icon: Calendar,
            color: "text-emerald-400",
          },
          {
            label: "Day Win Rate",
            value: `${monthSummary.winRate.toFixed(0)}%`,
            positive: monthSummary.winRate >= 50,
            icon: BarChart2,
            color: monthSummary.winRate >= 50 ? "text-emerald-400" : "text-red-400",
          },
          {
            label: "Total Trades",
            value: `${monthSummary.totalTrades}`,
            positive: undefined,
            icon: BarChart2,
            color: "text-foreground",
          },
        ].map((s) => (
          <div key={s.label} className="glass-card p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center flex-shrink-0">
              <s.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{s.label}</p>
              <p className={`text-[15px] font-black leading-none ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="glass-card p-5">
        {/* Day headers */}
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 mb-2">
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className="text-center text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider py-1">
              {day}
            </div>
          ))}
          <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider py-1 text-right pr-1 hidden sm:block">
            Week
          </div>
        </div>

        {/* Rows */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${year}-${month}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="space-y-2"
          >
            {weeklyRows.map((row, rowIdx) => {
              const weekCells = row.filter((c) => c !== null);
              const weekPnl = weekCells.reduce((s, c) => s + (c?.data.pnl ?? 0), 0);
              const weekTrades = weekCells.reduce((s, c) => s + (c?.data.trades ?? 0), 0);

              return (
                <div key={rowIdx} className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 items-start">
                  {Array.from({ length: 7 }).map((_, colIdx) => {
                    const cell = row[colIdx];
                    if (!cell) return <div key={`empty-${rowIdx}-${colIdx}`} className="aspect-square" />;

                    const isToday = isCurrentMonth && cell.date === todayStr;
                    const isHovered = hoveredDate === cell.date;
                    const hasData = cell.data.trades > 0;

                    return (
                      <div
                        key={cell.date}
                        className="relative aspect-square rounded-xl border border-transparent flex flex-col p-2 cursor-default transition-all duration-200 hover:scale-[1.04] hover:z-10"
                        style={hasData ? getIntensityStyle(cell.data.pnl, cell.data.trades, maxAbs) : {
                          backgroundColor: isToday ? "rgba(183,255,90,0.07)" : "rgba(255,255,255,0.025)",
                          borderColor: isToday ? "rgba(183,255,90,0.28)" : "rgba(255,255,255,0.05)",
                        }}
                        onMouseEnter={() => setHoveredDate(cell.date)}
                        onMouseLeave={() => setHoveredDate(null)}
                      >
                        <div className={`text-[11px] font-semibold leading-none ${
                          isToday ? "text-primary" :
                          hasData ? (cell.data.pnl >= 0 ? "text-white/80" : "text-white/80") :
                          "text-muted-foreground/50"
                        }`}>
                          {cell.day}
                        </div>

                        {hasData && (
                          <div className="mt-auto">
                            <div className={`text-[10px] font-bold leading-tight ${cell.data.pnl >= 0 ? "text-emerald-400" : "text-red-400"} hidden sm:block`}>
                              {cell.data.pnl >= 0 ? "+" : ""}{Math.abs(cell.data.pnl) >= 1000
                                ? `$${(Math.abs(cell.data.pnl) / 1000).toFixed(1)}k`
                                : `$${Math.abs(cell.data.pnl).toFixed(0)}`}
                            </div>
                            <div className="text-[9px] text-white/40 leading-none hidden sm:block">
                              {cell.data.trades}t
                            </div>
                          </div>
                        )}

                        {/* Tooltip */}
                        {isHovered && hasData && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 pointer-events-none">
                            <div className="glass-modal px-3 py-2 text-[11px] whitespace-nowrap rounded-xl">
                              <p className="text-muted-foreground mb-1">{new Date(cell.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
                              <p className={`font-bold text-[13px] ${cell.data.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {cell.data.pnl >= 0 ? "+" : ""}{fc(cell.data.pnl)}
                              </p>
                              <p className="text-muted-foreground">{cell.data.trades} trade{cell.data.trades !== 1 ? "s" : ""}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Weekly sum */}
                  <div className="hidden sm:flex flex-col items-end justify-center py-1 min-w-[56px]">
                    {weekTrades > 0 ? (
                      <>
                        <span className={`text-[11px] font-bold ${weekPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {weekPnl >= 0 ? "+" : ""}{fc(weekPnl)}
                        </span>
                        <span className="text-[9px] text-muted-foreground/50">{weekTrades}t</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/30">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {/* Legend */}
        <div className="flex items-center justify-end gap-4 mt-4 pt-4 border-t border-white/[0.05]">
          <span className="text-[11px] text-muted-foreground">Intensity scale:</span>
          <div className="flex items-center gap-1">
            {[0.15, 0.3, 0.5, 0.7, 0.9].map((op) => (
              <div key={op} className="w-4 h-4 rounded-sm" style={{ backgroundColor: `rgba(52,211,153,${op})` }} />
            ))}
            <span className="text-[10px] text-muted-foreground ml-1">Profit</span>
          </div>
          <div className="flex items-center gap-1">
            {[0.15, 0.3, 0.5, 0.7, 0.9].map((op) => (
              <div key={op} className="w-4 h-4 rounded-sm" style={{ backgroundColor: `rgba(248,113,113,${op})` }} />
            ))}
            <span className="text-[10px] text-muted-foreground ml-1">Loss</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
