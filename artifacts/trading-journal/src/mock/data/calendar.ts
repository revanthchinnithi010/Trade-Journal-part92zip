import { createRng, range } from "../rng";
import { MOCK_CLOSED_TRADES } from "./trades";

export interface MockCalendarDay {
  date: string; // yyyy-mm-dd
  pnl: number;
  trades: number;
}

// Aggregate the 60 generated trades by exit date, then backfill the last
// 3 months with a light scatter of extra days so the calendar heatmap looks
// populated even outside the trade-cluster window.
export function buildCalendarDays(monthsBack: number, endDate: Date): MockCalendarDay[] {
  const byDay = new Map<string, { pnl: number; trades: number }>();

  for (const t of MOCK_CLOSED_TRADES) {
    const day = t.exitDate.slice(0, 10);
    const existing = byDay.get(day);
    if (existing) { existing.pnl += t.pnl; existing.trades += 1; }
    else byDay.set(day, { pnl: t.pnl, trades: 1 });
  }

  const rng = createRng(20260710 + monthsBack);
  const start = new Date(endDate);
  start.setMonth(start.getMonth() - monthsBack);

  for (let d = new Date(start); d <= endDate; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    if (byDay.has(key)) continue;
    // Skip most days without trades to keep the heatmap realistic.
    if (rng() > 0.35) continue;
    const trades = 1 + Math.floor(rng() * 3);
    const pnl = Math.round(range(rng, -180, 260) * 100) / 100;
    byDay.set(key, { pnl, trades });
  }

  return Array.from(byDay.entries())
    .map(([date, v]) => ({ date, pnl: Math.round(v.pnl * 100) / 100, trades: v.trades }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const ANCHOR_NOW = new Date("2026-07-10T09:30:00Z");
export const MOCK_CALENDAR_DAYS: MockCalendarDay[] = buildCalendarDays(3, ANCHOR_NOW);
