import { useState, useMemo } from "react";
import { Eye, EyeOff, TrendingUp, TrendingDown, Plus, ArrowUpRight } from "lucide-react";
import { useCurrencyStore } from "@/store/currencyStore";
import { Link } from "wouter";

const USD_TO_INR_FALLBACK = 85;

function formatINR(value: number): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return value < 0 ? `-${formatted}` : formatted;
}

function formatUSD(value: number): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return value < 0 ? `-${formatted}` : formatted;
}

function MaskValue({ masked, children }: { masked: boolean; children: string }) {
  if (!masked) return <>{children}</>;
  const len = Math.max(8, children.replace(/[^0-9.,]/g, "").length + 2);
  return (
    <span className="inline-flex items-center gap-[3px] align-middle" style={{ letterSpacing: 2 }}>
      {Array.from({ length: Math.min(len, 12) }).map((_, i) => (
        <span
          key={i}
          className="inline-block rounded-full bg-white/20"
          style={{ width: 7, height: 7, flexShrink: 0 }}
        />
      ))}
    </span>
  );
}

interface AccountValueWidgetProps {
  accountValueUSD: number;
  netPnlUSD: number;
  totalTrades: number;
}

export default function AccountValueWidget({
  accountValueUSD,
  netPnlUSD,
  totalTrades,
}: AccountValueWidgetProps) {
  const [masked, setMasked] = useState(false);
  const exchangeRate = useCurrencyStore(s => s.exchangeRate) || USD_TO_INR_FALLBACK;
  const currency     = useCurrencyStore(s => s.currency);

  const accountValueINR = accountValueUSD * exchangeRate;
  const pnlINR          = netPnlUSD * exchangeRate;
  const pnlPositive     = netPnlUSD >= 0;
  const pnlPct          = accountValueUSD > 0
    ? (netPnlUSD / (accountValueUSD - netPnlUSD)) * 100
    : 0;

  const primaryDisplay  = currency === "INR" ? formatINR(accountValueINR) : formatUSD(accountValueUSD);
  const secondaryLabel  = currency === "INR" ? "USD equivalent" : "INR equivalent";
  const secondaryValue  = currency === "INR" ? formatUSD(accountValueUSD) : formatINR(accountValueINR);
  const pnlDisplay      = currency === "INR" ? formatINR(pnlINR) : formatUSD(netPnlUSD);

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: "linear-gradient(135deg, rgba(18,22,20,0.97) 0%, rgba(22,27,23,0.97) 50%, rgba(16,20,18,0.97) 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 4px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {/* Ambient top-left glow */}
      <div
        className="absolute -top-12 -left-12 w-48 h-48 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(var(--primary-rgb,87,168,112),0.08) 0%, transparent 70%)" }}
      />
      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative px-5 pt-5 pb-5">
        {/* ── Header row ── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div
              className="w-1.5 h-5 rounded-full"
              style={{ background: "linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.3) 100%)" }}
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
              Account Value
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMasked(m => !m)}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              aria-label={masked ? "Show values" : "Hide values"}
            >
              {masked
                ? <EyeOff className="w-3.5 h-3.5 text-white/40" />
                : <Eye className="w-3.5 h-3.5 text-white/40" />
              }
            </button>
            <Link href="/trades">
              <button
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/[0.08]"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-white/40" />
              </button>
            </Link>
          </div>
        </div>

        {/* ── Primary value ── */}
        <div className="mb-1.5">
          <div
            className="font-black tracking-tight leading-none"
            style={{ fontSize: "clamp(28px, 8vw, 36px)", color: "rgba(255,255,255,0.95)" }}
          >
            <MaskValue masked={masked}>{primaryDisplay}</MaskValue>
          </div>
        </div>

        {/* ── Secondary currency row ── */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-[11px] text-white/30">{secondaryLabel}</span>
          <span className="text-[11px] font-semibold text-white/50">
            <MaskValue masked={masked}>{secondaryValue}</MaskValue>
          </span>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            1 USD = ₹{exchangeRate.toFixed(2)}
          </span>
        </div>

        {/* ── Divider ── */}
        <div className="mb-4" style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

        {/* ── PnL row ── */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{
                background: pnlPositive ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
                border: `1px solid ${pnlPositive ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`,
              }}
            >
              {pnlPositive
                ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                : <TrendingDown className="w-3 h-3 text-red-400" />
              }
            </div>
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold leading-none mb-0.5">
                All-time PnL
              </p>
              <p
                className="text-[13px] font-black leading-none"
                style={{ color: pnlPositive ? "#34d399" : "#f87171" }}
              >
                <MaskValue masked={masked}>
                  {`${pnlPositive ? "+" : ""}${pnlDisplay}`}
                </MaskValue>
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold leading-none mb-0.5">
              Return
            </p>
            <p
              className="text-[13px] font-black leading-none"
              style={{ color: pnlPositive ? "#34d399" : "#f87171" }}
            >
              <MaskValue masked={masked}>
                {`${pnlPositive ? "+" : ""}${pnlPct.toFixed(2)}%`}
              </MaskValue>
            </p>
          </div>

          <div className="text-right">
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold leading-none mb-0.5">
              Trades
            </p>
            <p className="text-[13px] font-black leading-none text-white/70">
              {totalTrades}
            </p>
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="flex gap-2.5">
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.8) 100%)",
              color: "rgba(0,0,0,0.85)",
              boxShadow: "0 2px 12px hsl(var(--primary)/0.25)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Funds
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-[0.98]"
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.55)",
              border: "1px solid rgba(255,255,255,0.09)",
            }}
          >
            Withdraw
          </button>
        </div>
      </div>
    </div>
  );
}
