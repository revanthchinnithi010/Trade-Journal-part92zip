// Net PNL Analytics page.
// Header, back button, and page title are rendered by the shared Layout
// (see components/layout.tsx, keyed on the "/net-pnl" pathname).
//
// This page intentionally contains only the time filter chips for now.
// Recharts chart components will be added here in a follow-up task.
import { useState } from "react";

// ── Time filter chips ────────────────────────────────────────────────────────
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

export type { TimeFilter };
export { TIME_FILTERS };

export default function NetPnLAnalytics() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

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

      {/* ── Recharts components will be placed here ── */}
    </div>
  );
}
