import { useState } from "react";
import { Eye, EyeOff, ChevronRight, Plus } from "lucide-react";
import { useCurrencyStore, formatAmount } from "@/store/currencyStore";
import type { Currency } from "@/store/currencyStore";
import { useLocation } from "wouter";

function fUSD(value: number): string {
  const abs = Math.abs(value);
  const s = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(abs);
  return value < 0 ? `-${s}` : s;
}

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
  /** Raw USD totals — for the secondary USD label shown in INR mode. */
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
  accountValueUSD,
  accountValueDisplay,
  upnlUSD,
  upnlDisplay,
  realizedPnlUSD = 0,
  realizedPnlDisplay = 0,
  netPnlUSD,
  netPnlDisplay,
  openPositions,
  openOrders,
}: Props) {
  const [masked, setMasked] = useState(false);
  const [, navigate] = useLocation();
  const currency = useCurrencyStore(s => s.currency);

  const resolvedNetPnlDisplay = netPnlDisplay ?? (upnlDisplay + realizedPnlDisplay);
  const resolvedNetPnlUSD     = netPnlUSD     ?? (upnlUSD + realizedPnlUSD);

  const upPos      = upnlDisplay >= 0;
  const realPos    = realizedPnlDisplay >= 0;
  const netPos     = resolvedNetPnlDisplay >= 0;
  const showUSD    = currency === "INR"; // dual display only in INR mode

  return (
    <div className="glass-card overflow-hidden">
      {/* ── Main section ── */}
      <div className="px-4 pt-4 pb-3">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <button className="flex items-center gap-0.5 group" onClick={() => navigate("/portfolio")}>
            <span className="text-[13px] font-semibold text-white/70 group-hover:text-white/90 transition-colors">
              Account Value
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-white/40 group-hover:text-white/60 transition-colors" />
          </button>
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all active:scale-[0.97]"
            style={{
              background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
              color: "#fff",
              boxShadow: "0 2px 10px rgba(249,115,22,0.35)",
            }}
          >
            <Plus className="w-3 h-3" />
            Add Funds
          </button>
        </div>

        {/* Value row — uses pre-converted display value, no extra conversion */}
        <div className="flex items-center gap-3">
          <span className="text-[28px] font-black tracking-tight leading-none text-white">
            {masked ? <Dots count={9} /> : formatAmount(accountValueDisplay, currency)}
          </span>
          {showUSD && (
            <span className="text-[14px] font-semibold text-white/25 leading-none mt-1">
              {masked ? <Dots count={6} /> : fUSD(accountValueUSD)}
            </span>
          )}
          <button
            onClick={() => setMasked(m => !m)}
            className="ml-0.5 mt-1 text-white/30 hover:text-white/50 transition-colors"
            aria-label={masked ? "Show" : "Hide"}
          >
            {masked ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Sub-widget — combined across Delta Exchange + cTrader ── */}
      <div
        className="mx-3 mb-3 rounded-xl grid grid-cols-2 overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* UPNL */}
        <div className="px-3.5 py-3 border-r border-b border-white/[0.06]">
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/portfolio?tab=positions")}>
            <span className="text-[11px] font-semibold text-white/40 group-hover:text-white/60 transition-colors">
              UPNL
            </span>
            <ChevronRight className="w-3 h-3 text-white/30" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black leading-none" style={{ color: upPos ? "#34d399" : "#f87171" }}>
              {fmt(upnlDisplay, currency, masked)}
            </span>
            {showUSD && (
              <span className="text-[11px] font-semibold text-white/25 leading-none">
                {masked ? <Dots count={4} /> : `${upPos ? "+" : ""}${fUSD(upnlUSD)}`}
              </span>
            )}
          </div>
        </div>

        {/* Realized PNL */}
        <div className="px-3.5 py-3 border-b border-white/[0.06]">
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/portfolio?tab=positions")}>
            <span className="text-[11px] font-semibold text-white/40 group-hover:text-white/60 transition-colors">
              Realized PNL
            </span>
            <ChevronRight className="w-3 h-3 text-white/30" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black leading-none" style={{ color: realPos ? "#34d399" : "#f87171" }}>
              {fmt(realizedPnlDisplay, currency, masked)}
            </span>
            {showUSD && (
              <span className="text-[11px] font-semibold text-white/25 leading-none">
                {masked ? <Dots count={4} /> : `${realPos ? "+" : ""}${fUSD(realizedPnlUSD)}`}
              </span>
            )}
          </div>
        </div>

        {/* Net PNL — tapping navigates to the PNL Analytics page */}
        <div className="px-3.5 py-3 border-r border-white/[0.06]">
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/pnl")}>
            <span className="text-[11px] font-semibold text-white/40 group-hover:text-white/60 transition-colors">
              Net PNL
            </span>
            <ChevronRight className="w-3 h-3 text-white/30" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black leading-none" style={{ color: netPos ? "#34d399" : "#f87171" }}>
              {fmt(resolvedNetPnlDisplay, currency, masked)}
            </span>
            {showUSD && (
              <span className="text-[11px] font-semibold text-white/25 leading-none">
                {masked ? <Dots count={4} /> : `${netPos ? "+" : ""}${fUSD(resolvedNetPnlUSD)}`}
              </span>
            )}
          </div>
        </div>

        {/* Positions / Orders */}
        <div className="px-3.5 py-3">
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/portfolio?tab=positions")}>
            <span className="text-[11px] font-semibold text-white/40 group-hover:text-white/60 transition-colors">
              Positions / Orders
            </span>
            <ChevronRight className="w-3 h-3 text-white/30" />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-black leading-none text-white/80">{openPositions}</span>
            <span className="text-[15px] font-black leading-none text-white/25">/</span>
            <span className="text-[15px] font-black leading-none text-white/80">{openOrders}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
