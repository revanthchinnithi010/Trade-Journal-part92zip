import { motion } from "motion/react";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { useCurrencyStore, formatAmount } from "@/store/currencyStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cardVariants } from "@/animations/motion";
import type { AccountSnapshot } from "@/store/accountTypes";

function Dots() {
  return (
    <span className="inline-flex items-center gap-[3px] align-middle">
      {Array.from({ length: 7 }).map((_, i) => (
        <span key={i} className="inline-block w-[5px] h-[5px] rounded-full bg-muted-foreground/30" />
      ))}
    </span>
  );
}

function DualAmount({
  usd, toINR, masked, color,
}: { usd: number; toINR: (v: number) => number; masked: boolean; color?: string }) {
  const currency = useCurrencyStore(s => s.currency);
  const native = currency === "INR" ? toINR(usd) : usd;
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-black leading-none text-[18px] text-foreground" style={color ? { color } : undefined}>
        {masked ? <Dots /> : formatAmount(native, currency)}
      </span>
      {currency === "INR" && (
        <span className="font-semibold text-muted-foreground/50 text-[12px]">
          {masked ? <Dots /> : formatAmount(usd, "USD")}
        </span>
      )}
    </div>
  );
}

function MetricRow({
  label, usd, toINR, masked, color,
}: { label: string; usd: number; toINR: (v: number) => number; masked: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-b-0">
      <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
      <DualAmount usd={usd} toINR={toINR} masked={masked} color={color} />
    </div>
  );
}

const BROKER_ACCENT: Record<string, string> = {
  delta: "#f97316",
  ctrader: "#3b82f6",
};

interface Props {
  account: AccountSnapshot;
  masked: boolean;
  index?: number;
}

export default function AccountCard({ account, masked, index = 0 }: Props) {
  const reduced = useReducedMotion();
  const accent = BROKER_ACCENT[account.brokerId] ?? "#f97316";

  const StatusIcon = account.connectionStatus === "connecting"
    ? Loader2
    : account.isConnected ? Wifi : WifiOff;

  const content = (
    <div className="glass-card overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
          />
          <span className="text-[13.5px] font-bold text-foreground">{account.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusIcon
            className={`w-3.5 h-3.5 ${account.connectionStatus === "connecting" ? "animate-spin" : ""}`}
            style={{ color: account.isConnected ? "#34d399" : undefined }}
          />
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide ${
              account.isConnected ? "text-emerald-500" : "text-muted-foreground"
            }`}
          >
            {account.isConnected ? "Connected" : account.connectionStatus === "connecting" ? "Connecting" : "Offline"}
          </span>
        </div>
      </div>

      {/* Account value hero */}
      <div className="px-4 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Account Value</p>
        <DualAmount usd={account.accountValueUSD} toINR={account.toINR} masked={masked} />
        <p className="text-[10px] text-muted-foreground/40 mt-1">{account.rateLabel}</p>
      </div>

      {/* Metric rows */}
      <div className="mx-3 mb-3 rounded-xl overflow-hidden bg-muted/30 border border-border/50">
        <MetricRow label="Available Balance" usd={account.availableBalanceUSD} toINR={account.toINR} masked={masked} />
        <MetricRow label="Margin Used" usd={account.marginUsedUSD} toINR={account.toINR} masked={masked} />
        <MetricRow
          label="Unrealized PNL"
          usd={account.unrealizedPnlUSD}
          toINR={account.toINR}
          masked={masked}
          color={account.unrealizedPnlUSD >= 0 ? "#34d399" : "#f87171"}
        />
        <MetricRow
          label="Realized PNL"
          usd={account.realizedPnlUSD}
          toINR={account.toINR}
          masked={masked}
          color={account.realizedPnlUSD >= 0 ? "#34d399" : "#f87171"}
        />
      </div>
    </div>
  );

  if (reduced) return content;

  return (
    <motion.div variants={cardVariants} custom={index} initial="hidden" animate="visible" className="h-full">
      {content}
    </motion.div>
  );
}
