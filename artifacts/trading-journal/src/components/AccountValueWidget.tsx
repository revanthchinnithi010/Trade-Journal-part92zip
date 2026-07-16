import { useState } from "react";
import { Eye, EyeOff, ChevronRight, Layers } from "lucide-react";
import { motion } from "framer-motion";
import { useCurrencyStore, formatAmount } from "@/store/currencyStore";
import type { Currency } from "@/store/currencyStore";
import { useLocation } from "wouter";

function Dots({ count = 10 }: { count?: number }) {
  return (
    <span className="inline-flex items-center gap-[3px] align-middle">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="inline-block w-[6px] h-[6px] rounded-full bg-white/25" />
      ))}
    </span>
  );
}

/** Format a pre-converted display value with the sign prefix. */
function fmt(v: number, currency: Currency, masked: boolean): React.ReactNode {
  if (masked) return <Dots count={6} />;
  return `${v >= 0 ? "+" : ""}${formatAmount(v, currency)}`;
}

interface Props {
  /**
   * Raw USD totals — kept in the prop contract for callers (dashboard.tsx
   * passes them from useCombinedPortfolio()), but no longer rendered here:
   * the widget shows a single currency at a time, driven by the header's
   * $/₹ toggle, never both side-by-side.
   */
  accountValueUSD: number;
  upnlUSD: number;
  realizedPnlUSD?: number;
  netPnlUSD?: number;

  /**
   * Pre-converted display values already in the user's selected currency,
   * computed using per-broker conversion rates (Delta = fixed ₹85, cTrader =
   * live rate). Pass these from useCombinedPortfolio().display — do NOT
   * re-multiply by the global exchange rate.
   */
  accountValueDisplay: number;
  upnlDisplay: number;
  realizedPnlDisplay?: number;
  netPnlDisplay?: number;

  openPositions: number;
  openOrders: number;
}

export default function AccountValueWidget({
  accountValueDisplay,
  upnlDisplay,
  realizedPnlDisplay = 0,
  netPnlDisplay,
  openPositions,
  openOrders,
}: Props) {
  const [masked, setMasked] = useState(false);
  const [, navigate] = useLocation();
  const currency = useCurrencyStore(s => s.currency);

  const resolvedNetPnlDisplay = netPnlDisplay ?? (upnlDisplay + realizedPnlDisplay);

  const upPos      = upnlDisplay >= 0;
  const realPos    = realizedPnlDisplay >= 0;
  const netPos     = resolvedNetPnlDisplay >= 0;

  return (
    <div className="dash-account-card overflow-hidden">
      {/* ── Main section ── */}
      <div className="px-4 pt-4 pb-3">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-0.5 group" onClick={() => navigate("/balances")}>
              <span className="text-[13px] font-semibold transition-colors" style={{ color: "var(--stat-title)" }}>
                Account Value
              </span>
              <ChevronRight className="w-3.5 h-3.5 transition-colors" style={{ color: "var(--stat-icon)" }} />
            </button>
            <button
              onClick={() => setMasked(m => !m)}
              className="transition-colors"
              style={{ color: "var(--stat-icon)" }}
              aria-label={masked ? "Show" : "Hide"}
            >
              {masked ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            onClick={() => navigate("/portfolio?tab=positions")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px]"
            style={{
              fontWeight: 600,
              background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
              color: "#fff",
              boxShadow: "0 2px 10px rgba(249,115,22,0.35)",
            }}
          >
            <Layers className="w-3 h-3" />
            Show Positions
          </motion.button>
        </div>

        {/* Value row — single-currency display, driven entirely by the header's
            $/₹ toggle. No secondary amount in the other currency is ever shown. */}
        <div className="flex items-center">
          <span className="text-[28px] font-black tracking-tight leading-none" style={{ color: "var(--stat-value)" }}>
            {masked ? <Dots count={9} /> : formatAmount(accountValueDisplay, currency)}
          </span>
        </div>
      </div>

      {/* ── Sub-widget — combined across Delta Exchange + cTrader ── */}
      <div
        className="mx-3 mb-3 rounded-xl grid grid-cols-2 overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.09)",
        }}
      >
        {/* UPNL */}
        <div className="px-3.5 py-3 border-r border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/portfolio?tab=positions")}>
            <span className="text-[11px] font-semibold transition-colors" style={{ color: "var(--stat-sub)" }}>
              UPNL
            </span>
            <ChevronRight className="w-3 h-3" style={{ color: "var(--stat-icon)" }} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black leading-none" style={{ color: upPos ? "#34d399" : "#f87171" }}>
              {fmt(upnlDisplay, currency, masked)}
            </span>
          </div>
        </div>

        {/* Realized PNL */}
        <div className="px-3.5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/portfolio?tab=positions")}>
            <span className="text-[11px] font-semibold transition-colors" style={{ color: "var(--stat-sub)" }}>
              Realized PNL
            </span>
            <ChevronRight className="w-3 h-3" style={{ color: "var(--stat-icon)" }} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black leading-none" style={{ color: realPos ? "#34d399" : "#f87171" }}>
              {fmt(realizedPnlDisplay, currency, masked)}
            </span>
          </div>
        </div>

        {/* Net PNL — tapping navigates to the PNL Analytics page */}
        <div className="px-3.5 py-3 border-r" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/pnl")}>
            <span className="text-[11px] font-semibold transition-colors" style={{ color: "var(--stat-sub)" }}>
              Net PNL
            </span>
            <ChevronRight className="w-3 h-3" style={{ color: "var(--stat-icon)" }} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black leading-none" style={{ color: netPos ? "#34d399" : "#f87171" }}>
              {fmt(resolvedNetPnlDisplay, currency, masked)}
            </span>
          </div>
        </div>

        {/* Positions / Orders */}
        <div className="px-3.5 py-3">
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/portfolio?tab=positions")}>
            <span className="text-[11px] font-semibold transition-colors" style={{ color: "var(--stat-sub)" }}>
              Positions / Orders
            </span>
            <ChevronRight className="w-3 h-3" style={{ color: "var(--stat-icon)" }} />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-black leading-none" style={{ color: "var(--stat-value)" }}>{openPositions}</span>
            <span className="text-[15px] font-black leading-none" style={{ color: "var(--stat-sub)" }}>/</span>
            <span className="text-[15px] font-black leading-none" style={{ color: "var(--stat-value)" }}>{openOrders}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
