import { useState } from "react";
import { Eye, EyeOff, ChevronRight, Plus } from "lucide-react";
import { useCurrencyStore } from "@/store/currencyStore";
import { useLocation } from "wouter";

const USD_TO_INR_FALLBACK = 85;

function fINR(value: number): string {
  const abs = Math.abs(value);
  const s = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(abs);
  return value < 0 ? `-${s}` : s;
}

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

interface Props {
  accountValueUSD: number;
  upnlUSD: number;
  openPositions: number;
  openOrders: number;
}

export default function AccountValueWidget({ accountValueUSD, upnlUSD, openPositions, openOrders }: Props) {
  const [masked, setMasked] = useState(false);
  const [, navigate]  = useLocation();
  const exchangeRate = useCurrencyStore(s => s.exchangeRate) || USD_TO_INR_FALLBACK;

  const acINR  = accountValueUSD * exchangeRate;
  const upINR  = upnlUSD * exchangeRate;
  const upPos  = upnlUSD >= 0;

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

        {/* Value row */}
        <div className="flex items-center gap-3">
          <span className="text-[28px] font-black tracking-tight leading-none text-white">
            {masked ? <Dots count={9} /> : fINR(acINR)}
          </span>
          <span className="text-[14px] font-semibold text-white/25 leading-none mt-1">
            {masked ? <Dots count={6} /> : fUSD(accountValueUSD)}
          </span>
          <button
            onClick={() => setMasked(m => !m)}
            className="ml-0.5 mt-1 text-white/30 hover:text-white/50 transition-colors"
            aria-label={masked ? "Show" : "Hide"}
          >
            {masked
              ? <EyeOff className="w-4 h-4" />
              : <Eye className="w-4 h-4" />
            }
          </button>
        </div>
      </div>

      {/* ── Sub-widget ── */}
      <div
        className="mx-3 mb-3 rounded-xl grid grid-cols-2 overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Left: UPNL */}
        <div className="px-3.5 py-3 border-r border-white/[0.06]">
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/portfolio?tab=positions")}>
            <span className="text-[11px] font-semibold text-white/40 group-hover:text-white/60 transition-colors">
              UPNL
            </span>
            <ChevronRight className="w-3 h-3 text-white/30" />
          </button>
          <div className="flex items-center gap-2">
            <span
              className="text-[15px] font-black leading-none"
              style={{ color: upPos ? "#34d399" : "#f87171" }}
            >
              {masked ? <Dots count={6} /> : `${upPos ? "+" : ""}${fINR(upINR)}`}
            </span>
            <span className="text-[11px] font-semibold text-white/25 leading-none">
              {masked ? <Dots count={4} /> : `${upPos ? "+" : ""}${fUSD(upnlUSD)}`}
            </span>
          </div>
        </div>

        {/* Right: Positions / Orders */}
        <div className="px-3.5 py-3">
          <button className="flex items-center gap-0.5 mb-1.5 group" onClick={() => navigate("/portfolio?tab=positions")}>
            <span className="text-[11px] font-semibold text-white/40 group-hover:text-white/60 transition-colors">
              Positions / Orders
            </span>
            <ChevronRight className="w-3 h-3 text-white/30" />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-black leading-none text-white/80">
              {openPositions}
            </span>
            <span className="text-[15px] font-black leading-none text-white/25">/</span>
            <span className="text-[15px] font-black leading-none text-white/80">
              {openOrders}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
