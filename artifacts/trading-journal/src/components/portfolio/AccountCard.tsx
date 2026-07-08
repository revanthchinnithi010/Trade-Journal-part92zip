import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Wifi, WifiOff, Loader2, ChevronDown } from "lucide-react";
import { useCurrencyStore, formatAmount } from "@/store/currencyStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cardVariants } from "@/animations/motion";
import type { AccountSnapshot } from "@/store/accountTypes";

function DualAmount({
  usd, toINR, color,
}: { usd: number; toINR: (v: number) => number; color?: string }) {
  const currency = useCurrencyStore(s => s.currency);
  const native = currency === "INR" ? toINR(usd) : usd;
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="font-black leading-none text-[18px] text-foreground"
        style={color ? { color } : undefined}
      >
        {formatAmount(native, currency)}
      </span>
      {currency === "INR" && (
        <span className="font-semibold text-muted-foreground/50 text-[12px]">
          {formatAmount(usd, "USD")}
        </span>
      )}
    </div>
  );
}

function MetricRow({
  label, usd, toINR, color,
}: { label: string; usd: number; toINR: (v: number) => number; color?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-b-0">
      <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
      <DualAmount usd={usd} toINR={toINR} color={color} />
    </div>
  );
}

const BROKER_ACCENT: Record<string, string> = {
  delta: "#f97316",
  ctrader: "#3b82f6",
};

interface Props {
  account: AccountSnapshot;
  index?: number;
}

export default function AccountCard({ account, index = 0 }: Props) {
  const [isExpanded, setIsExpanded] = useState(true);
  const reduced = useReducedMotion();
  const accent = BROKER_ACCENT[account.brokerId] ?? "#f97316";

  const StatusIcon = account.connectionStatus === "connecting"
    ? Loader2
    : account.isConnected ? Wifi : WifiOff;

  const content = (
    <div className="glass-card overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        {/* Left: accent dot + broker name */}
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
          />
          <span className="text-[13.5px] font-bold text-foreground">{account.label}</span>
        </div>

        {/* Right: connection status + chevron */}
        <div className="flex items-center gap-2">
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
              {account.isConnected
                ? "Connected"
                : account.connectionStatus === "connecting"
                ? "Connecting"
                : "Offline"}
            </span>
          </div>

          {/* Chevron — sole expand/collapse control */}
          <button
            type="button"
            onClick={() => setIsExpanded(e => !e)}
            className="p-1 rounded-lg hover:bg-white/[0.07] transition-colors"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse card" : "Expand card"}
          >
            <motion.div
              animate={{ rotate: isExpanded ? 0 : -90 }}
              transition={{ duration: 0.27, ease: "easeInOut" }}
            >
              <ChevronDown className="w-4 h-4 text-muted-foreground/60" />
            </motion.div>
          </button>
        </div>
      </div>

      {/* Account value — always visible */}
      <div className="px-4 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">
          Account Value
        </p>
        <DualAmount usd={account.accountValueUSD} toINR={account.toINR} />
        <p className="text-[10px] text-muted-foreground/40 mt-1">{account.rateLabel}</p>
      </div>

      {/* Collapsible metrics */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="metrics"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.27, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="mx-3 mb-3 rounded-xl overflow-hidden bg-muted/30 border border-border/50">
              <MetricRow
                label="Available Balance"
                usd={account.availableBalanceUSD}
                toINR={account.toINR}
              />
              <MetricRow
                label="Margin Used"
                usd={account.marginUsedUSD}
                toINR={account.toINR}
              />
              <MetricRow
                label="Unrealized PNL"
                usd={account.unrealizedPnlUSD}
                toINR={account.toINR}
                color={account.unrealizedPnlUSD >= 0 ? "#34d399" : "#f87171"}
              />
              <MetricRow
                label="Realized PNL"
                usd={account.realizedPnlUSD}
                toINR={account.toINR}
                color={account.realizedPnlUSD >= 0 ? "#34d399" : "#f87171"}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (reduced) return content;

  return (
    <motion.div
      variants={cardVariants}
      custom={index}
      initial="hidden"
      animate="visible"
      className="h-full"
    >
      {content}
    </motion.div>
  );
}
