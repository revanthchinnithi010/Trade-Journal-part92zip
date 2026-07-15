import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  useListTrades,
  useCreateTrade,
  useDeleteTrade,
  getListTradesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrencyFormatter } from "@/store/currencyStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, Trash2, Eye, ExternalLink, ImageIcon, TrendingUp,
  X, ChevronDown, Tag, AlertTriangle, FileText, Link as LinkIcon,
  SlidersHorizontal,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  BROKER_MAP,
  ALL_SYMBOLS,
  SETUP_TAG_OPTIONS,
  MISTAKE_TAG_OPTIONS,
  TV_LINKS
} from "@/data/sampleData";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  PageTransition,
  AnimatedList,
  AnimatedListItem,
  AnimatedPresenceList,
  AnimatedButton,
  AnimatedIconButton,
  LoadingSpinner,
  FadeIn
} from "@/components/animations";

const tradeSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  side: z.enum(["long", "short"]),
  entryPrice: z.coerce.number().min(0),
  exitPrice: z.coerce.number().min(0),
  quantity: z.coerce.number().min(1),
  stopLoss: z.coerce.number().optional().nullable(),
  takeProfit: z.coerce.number().optional().nullable(),
  entryDate: z.string().min(1, "Entry date is required"),
  exitDate: z.string().min(1, "Exit date is required"),
  tvLink: z.string().optional().nullable(),
  screenshot: z.string().optional().nullable(),
  setupTags: z.string().optional().nullable(),
  mistakeTags: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type TradeFormValues = z.infer<typeof tradeSchema>;

type ModalTab = "details" | "analysis";

function MultiSelectChips({
  options,
  value,
  onChange,
  activeClass = "bg-primary/20 text-primary border-primary/35",
  inactiveClass = "bg-white/[0.04] border-white/[0.08] text-muted-foreground hover:text-white hover:bg-white/[0.08]"
}: {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  activeClass?: string;
  inactiveClass?: string;
}) {
  const selected = value ? value.split(",").filter(Boolean) : [];
  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter(s => s !== opt).join(","));
    else onChange([...selected, opt].join(","));
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => {
        const isSelected = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all duration-150 ${isSelected ? activeClass : inactiveClass}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function FilterPill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  const isMobile = useIsMobile();

  const mobileActiveStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(220,228,255,0.92) 50%, rgba(255,255,255,0.88) 100%)",
    border: "1.5px solid rgba(255,255,255,0.85)",
    color: "#0a0a0f",
    boxShadow: "0 2px 12px rgba(255,255,255,0.22), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(190,205,255,0.35)",
  };

  return (
    <button
      onClick={onClick}
      style={active && isMobile ? mobileActiveStyle : undefined}
      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 ${
        active
          ? "bg-primary/15 text-primary border-primary/30 shadow-sm shadow-primary/10"
          : "bg-white/[0.03] border-white/[0.07] text-muted-foreground hover:text-white hover:bg-white/[0.06]"
      }`}
    >
      {label}
    </button>
  );
}

// ── FilterBottomSheet — mobile-only filter panel ──────────────────────────
// Opens from below with a spring slide. All filters live here on mobile.
// Uses draft state: changes are staged until "Apply" is tapped.

const BROKER_OPTS = [
  { value: "all",            label: "All",           color: undefined },
  { value: "Delta Exchange", label: "Delta",         color: "#f97316" },
  { value: "FusionMarkets",  label: "Fusion Markets",color: "#3b82f6" },
  { value: "cTrader",        label: "cTrader",       color: "#a78bfa" },
] as const;

function FilterBottomSheet({
  open,
  onClose,
  outcomeFilter,
  sideFilter,
  brokerFilter,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  outcomeFilter: string;
  sideFilter: string;
  brokerFilter: string;
  onApply: (outcome: string, side: string, broker: string) => void;
}) {
  const [draftOutcome, setDraftOutcome] = useState(outcomeFilter);
  const [draftSide,    setDraftSide]    = useState(sideFilter);
  const [draftBroker,  setDraftBroker]  = useState(brokerFilter);

  // Sync draft when sheet opens (so it reflects current applied state)
  const prevOpenRef = useState(false);
  if (prevOpenRef[0] !== open) {
    prevOpenRef[1](open);
    if (open) {
      setDraftOutcome(outcomeFilter);
      setDraftSide(sideFilter);
      setDraftBroker(brokerFilter);
    }
  }

  const handleReset = () => {
    setDraftOutcome("all");
    setDraftSide("all");
    setDraftBroker("all");
  };

  const handleApply = () => {
    onApply(draftOutcome, draftSide, draftBroker);
    onClose();
  };

  // ── Chip helper ──────────────────────────────────────────────────────────
  const Chip = ({
    label, active, accent, onClick,
  }: { label: string; active: boolean; accent?: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      style={active && accent ? {
        background: `${accent}18`,
        border: `1.5px solid ${accent}55`,
        color: accent,
      } : active ? {
        background: "rgba(255,255,255,0.12)",
        border: "1.5px solid rgba(255,255,255,0.40)",
        color: "#ffffff",
      } : undefined}
      className={`px-3.5 py-1.5 rounded-xl text-[12.5px] font-semibold border transition-all duration-150 ${
        active
          ? ""
          : "bg-white/[0.04] border-white/[0.09] text-white/50 hover:text-white hover:bg-white/[0.08]"
      }`}
    >
      {label}
    </button>
  );

  // ── Section header ────────────────────────────────────────────────────────
  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(148,163,184,0.5)", marginBottom: 8, textTransform: "uppercase" }}>
      {children}
    </p>
  );

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="fs-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, zIndex: 400,
              background: "rgba(0,0,0,0.72)",
            }}
          />

          {/* Sheet */}
          <motion.div
            key="fs-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340, mass: 0.9 }}
            onClick={e => e.stopPropagation()}
            style={{
              position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 401,
              background: "#0d0f13",
              borderTop: "1px solid rgba(255,255,255,0.09)",
              borderRadius: "20px 20px 0 0",
              boxShadow: "0 -16px 64px rgba(0,0,0,0.85)",
              paddingBottom: "max(env(safe-area-inset-bottom, 16px), 16px)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Handle pill */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4 }}>
              <div style={{ width: 36, height: 4, borderRadius: 9999, background: "rgba(255,255,255,0.18)" }} />
            </div>

            {/* Title row */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 18px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.01em" }}>
                Filters
              </span>
              <button
                onClick={onClose}
                style={{
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 8, padding: "6px 8px", cursor: "pointer", lineHeight: 0,
                  color: "rgba(148,163,184,0.55)",
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Filter groups */}
            <div style={{ padding: "18px 18px 8px", display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Trade Result */}
              <div>
                <SectionLabel>Trade Result</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { v: "all",       label: "All" },
                    { v: "win",       label: "Win",       accent: "#10b981" },
                    { v: "loss",      label: "Loss",      accent: "#ef4444" },
                    { v: "breakeven", label: "Breakeven", accent: "#f59e0b" },
                  ].map(({ v, label, accent }) => (
                    <Chip
                      key={v} label={label} accent={accent}
                      active={draftOutcome === v}
                      onClick={() => setDraftOutcome(v)}
                    />
                  ))}
                </div>
              </div>

              {/* Trade Side */}
              <div>
                <SectionLabel>Trade Side</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { v: "all",   label: "All Sides" },
                    { v: "long",  label: "Long",  accent: "#60a5fa" },
                    { v: "short", label: "Short", accent: "#f97316" },
                  ].map(({ v, label, accent }) => (
                    <Chip
                      key={v} label={label} accent={accent}
                      active={draftSide === v}
                      onClick={() => setDraftSide(v)}
                    />
                  ))}
                </div>
              </div>

              {/* Broker */}
              <div>
                <SectionLabel>Broker</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {BROKER_OPTS.map(({ value, label, color }) => (
                    <Chip
                      key={value} label={label} accent={color as string | undefined}
                      active={draftBroker === value}
                      onClick={() => setDraftBroker(value)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div style={{
              display: "flex", gap: 10, padding: "14px 18px 4px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              marginTop: 4,
            }}>
              <button
                onClick={handleReset}
                style={{
                  flex: 1, height: 44, borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "rgba(148,163,184,0.8)", fontSize: 13.5, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Reset Filters
              </button>
              <button
                onClick={handleApply}
                style={{
                  flex: 2, height: 44, borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(220,228,255,0.92) 50%, rgba(255,255,255,0.88) 100%)",
                  border: "1.5px solid rgba(255,255,255,0.85)",
                  color: "#0a0a0f", fontSize: 13.5, fontWeight: 700,
                  boxShadow: "0 2px 12px rgba(255,255,255,0.18), inset 0 1px 0 rgba(255,255,255,1)",
                  cursor: "pointer",
                }}
              >
                Apply
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

const modalOverlayVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

const modalContentVariants: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 24 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 0.8, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, scale: 0.96, y: 16, transition: { duration: 0.18, ease: "easeIn" } },
};

const glossyWhiteStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(220,228,255,0.92) 50%, rgba(255,255,255,0.88) 100%)",
  border: "1.5px solid rgba(255,255,255,0.85)",
  color: "#0a0a0f",
  boxShadow: "0 2px 12px rgba(255,255,255,0.22), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(190,205,255,0.35)",
};

export default function Trades() {
  const [page, setPage] = useState(1);
  const [symbolFilter, setSymbolFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [sideFilter, setSideFilter] = useState<string>("all");
  const [brokerFilter, setBrokerFilter] = useState<string>("all");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<ModalTab>("details");
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const fc       = useCurrencyFormatter();

  // Count non-default active filters for the badge
  const activeFilterCount =
    (outcomeFilter !== "all" ? 1 : 0) +
    (sideFilter    !== "all" ? 1 : 0) +
    (brokerFilter  !== "all" ? 1 : 0);

  const queryClient = useQueryClient();

  const { data: tradesResponse } = useListTrades({
    page,
    limit: 20,
    symbol: symbolFilter || undefined,
    outcome: outcomeFilter !== "all" ? (outcomeFilter as "win" | "loss" | "breakeven") : undefined,
  });

  const createTrade = useCreateTrade({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
        setIsModalOpen(false);
        setModalTab("details");
        form.reset();
      }
    }
  });

  const deleteTrade = useDeleteTrade({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
        setSelectedTradeId(null);
      }
    }
  });

  const form = useForm<TradeFormValues>({
    resolver: zodResolver(tradeSchema),
    defaultValues: {
      symbol: "NAS100",
      side: "long",
      entryPrice: 0,
      exitPrice: 0,
      quantity: 1,
      entryDate: new Date().toISOString().slice(0, 16),
      exitDate: new Date().toISOString().slice(0, 16),
      tvLink: "",
      screenshot: "",
      setupTags: "",
      mistakeTags: "",
      notes: "",
    }
  });

  const watchedSymbol = form.watch("symbol");
  const watchedSide = form.watch("side");
  const screenshotUrl = form.watch("screenshot");
  const setupTagsVal = form.watch("setupTags") ?? "";
  const mistakeTagsVal = form.watch("mistakeTags") ?? "";

  const onSubmit = (data: TradeFormValues) => {
    createTrade.mutate({ data });
  };

  const openModal = () => {
    setModalTab("details");
    setIsModalOpen(true);
  };

  const selectedTrade = tradesResponse?.trades.find(t => t.id === selectedTradeId);

  const filteredTrades = useMemo(() => {
    if (!tradesResponse) return [];
    return tradesResponse.trades.filter(t => {
      const broker = BROKER_MAP[t.symbol] || "";
      return t.exitPrice != null &&
             (sideFilter === "all" || t.side === sideFilter) &&
             (brokerFilter === "all" || broker === brokerFilter);
    });
  }, [tradesResponse, sideFilter, brokerFilter]);

  const inputCls = "bg-white/[0.04] border-white/[0.09] rounded-xl h-10 text-[13px] focus:border-primary/50 focus:ring-0 placeholder:text-muted-foreground/50 transition-colors";
  const labelCls = "text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#000000" }}>

      {/* ── Secondary header ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-5"
        style={{ height: 56, borderBottom: "1px solid #262626" }}
      >
        <span className="font-semibold" style={{ color: "#F3F3F3", fontSize: 17 }}>Trades</span>
        <div className="flex items-center gap-2">
          {/* Filter icon with active-count badge */}
          <AnimatedIconButton
            onClick={() => setFilterSheetOpen(true)}
            className="relative flex items-center justify-center w-9 h-9 rounded-xl border border-white/[0.10] bg-white/[0.04] text-muted-foreground hover:text-white hover:bg-white/[0.08] transition-all shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-black"
                style={{ background: "rgba(255,255,255,0.92)" }}
              >
                {activeFilterCount}
              </span>
            )}
          </AnimatedIconButton>
          {/* Log Trade */}
          <AnimatedButton
            onClick={openModal}
            className="flex items-center gap-1.5 px-3.5 h-9 rounded-xl border-2 border-white bg-white text-black text-[13px] font-semibold hover:bg-white/90 shadow-md shadow-black/10 shrink-0"
          >
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-black">
              <Plus className="w-2.5 h-2.5 text-white" />
            </span>
            Log
          </AnimatedButton>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div
        className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        <div
          className="p-5 space-y-4 mx-auto max-w-[1400px]"
          style={{ paddingBottom: isMobile ? 80 : 40 }}
        >

          {/* ── Search + desktop filter pills ── */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
              <Input
                placeholder="Search symbol…"
                className="pl-8.5 w-full bg-white/[0.04] border-white/[0.08] rounded-xl h-10 text-[13px] focus:border-primary/40 placeholder:text-muted-foreground/50"
                value={symbolFilter}
                onChange={(e) => { setSymbolFilter(e.target.value); setPage(1); }}
              />
            </div>
            {!isMobile && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  {["all", "win", "loss", "breakeven"].map(v => (
                    <FilterPill
                      key={v}
                      label={v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
                      active={outcomeFilter === v}
                      onClick={() => { setOutcomeFilter(v); setPage(1); }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 ml-1">
                  {["all", "long", "short"].map(v => (
                    <FilterPill
                      key={v}
                      label={v === "all" ? "All Sides" : v.charAt(0).toUpperCase() + v.slice(1)}
                      active={sideFilter === v}
                      onClick={() => setSideFilter(v)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 ml-1">
                  <span className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-wider">Broker:</span>
                  {[
                    { value: "all",            label: "All" },
                    { value: "Delta Exchange", label: "Delta" },
                    { value: "FusionMarkets",  label: "Fusion" },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setBrokerFilter(value)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 ${
                        brokerFilter === value
                          ? value === "Delta Exchange" ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                          : value === "FusionMarkets"  ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                          : "bg-primary/15 text-primary border-primary/30 shadow-sm shadow-primary/10"
                          : "bg-white/[0.03] border-white/[0.07] text-muted-foreground hover:text-white hover:bg-white/[0.06]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

      {/* ── Mobile filter bottom sheet ── */}
      <FilterBottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        outcomeFilter={outcomeFilter}
        sideFilter={sideFilter}
        brokerFilter={brokerFilter}
        onApply={(outcome, side, broker) => {
          setOutcomeFilter(outcome);
          setSideFilter(side);
          setBrokerFilter(broker);
          setPage(1);
        }}
      />

      {/* ── Trade list ── */}
      <div>

        {/* Loading skeleton */}
        {!tradesResponse ? (
          <div>
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 18px",
                  borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.055)" : "none",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 w-28 rounded-lg shimmer-loading" />
                  <div className="h-4 w-16 rounded-lg shimmer-loading" />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="h-3 w-20 rounded shimmer-loading" />
                  <div className="h-3 w-14 rounded shimmer-loading" />
                </div>
              </div>
            ))}
          </div>

        ) : filteredTrades.length === 0 ? (
          <div className="px-5 py-16 text-center text-muted-foreground text-sm">
            No trades match your filters.
          </div>

        ) : (
          <div>
            {filteredTrades.map((trade, idx) => {
              const isLast    = idx === filteredTrades.length - 1;
              const rr        = trade.riskRewardRatio || 0;
              const setupTags = trade.setupTags ? trade.setupTags.split(",").filter(Boolean) : [];
              const isWin     = trade.pnl >= 0;
              const pnlColor  = isWin ? "#35C37A" : "#E0524F";
              const dateStr   = new Date(trade.entryDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
              const fPrice    = (v: number) => v < 1 ? v.toFixed(4) : v.toLocaleString(undefined, { maximumFractionDigits: 1 });

              return (
                <div
                  key={trade.id}
                  onClick={() => setSelectedTradeId(trade.id)}
                  className="cursor-pointer"
                  style={{
                    padding:                 "12px 18px",
                    borderBottom:            isLast ? "none" : "1px solid rgba(255,255,255,0.12)",
                    WebkitTapHighlightColor: "transparent",
                    transition:              "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Row 1 — Symbol + side badge | PNL */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-semibold leading-none"
                        style={{ fontSize: 15, color: "#F0F0F0" }}
                      >
                        {trade.symbol}
                      </span>
                      <span
                        className="font-semibold leading-none"
                        style={{
                          fontSize:      10,
                          color:         trade.side === "long" ? "#35C37A" : "#E0524F",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {trade.side === "long" ? "LONG" : "SHORT"}
                      </span>
                    </div>
                    <span
                      className="font-semibold leading-none tabular-nums"
                      style={{ fontSize: 15, color: "rgba(255,255,255,0.55)" }}
                    >
                      {isWin ? "+" : ""}{fc(trade.pnl)}
                    </span>
                  </div>

                  {/* Row 2 — Entry price + meta | Date */}
                  <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
                    <div className="flex items-center gap-0.5">
                      <span
                        className="font-medium tabular-nums"
                        style={{ fontSize: 12, color: "#6B6B6B" }}
                      >
                        {fPrice(trade.entryPrice)}
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: "0 2px" }}>→</span>
                      <span
                        className="font-medium tabular-nums"
                        style={{ fontSize: 12, color: "#6B6B6B" }}
                      >
                        {trade.exitPrice != null ? fPrice(trade.exitPrice) : "—"}
                      </span>
                    </div>
                    <span
                      className="font-medium tabular-nums"
                      style={{ fontSize: 12, color: "#6B6B6B" }}
                    >
                      {dateStr}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {tradesResponse && tradesResponse.total > 20 && (
          <div
            className="flex items-center justify-between"
            style={{ padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.055)" }}
          >
            <p className="text-[12px] text-muted-foreground">
              {(page - 1) * 20 + 1}–{Math.min(page * 20, tradesResponse.total)} of {tradesResponse.total}
            </p>
            <div className="flex gap-2">
              <AnimatedButton variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="rounded-xl border-white/[0.08] bg-white/[0.03] h-8 text-xs hover:bg-white/[0.07]">
                Previous
              </AnimatedButton>
              <AnimatedButton variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * 20 >= tradesResponse.total}
                className="rounded-xl border-white/[0.08] bg-white/[0.03] h-8 text-xs hover:bg-white/[0.07]">
                Next
              </AnimatedButton>
            </div>
          </div>
        )}

      </div>{/* /glass-card */}
        </div>{/* /inner padding div */}
      </div>{/* /scroll container */}

      {/* ── Framer Motion Log Trade Modal ── */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            variants={modalOverlayVariants}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/65 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />

            {/* Modal Content */}
            <motion.div
              className="glass-modal relative w-full max-w-[680px] max-h-[90vh] flex flex-col z-10"
              variants={modalContentVariants}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.08]">
                <div>
                  <h2 className="text-lg font-black text-white tracking-tight">Log New Trade</h2>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Record your trade details and analysis</p>
                </div>
                <AnimatedIconButton
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-white hover:bg-white/[0.07] transition-all"
                >
                  <X className="w-4 h-4" />
                </AnimatedIconButton>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 px-6 pt-4">
                {(["details", "analysis"] as ModalTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setModalTab(tab)}
                    className={`relative px-4 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                      modalTab === tab
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-white hover:bg-white/[0.05]"
                    }`}
                  >
                    {tab === "details" ? "Trade Details" : "Analysis & Tags"}
                    {modalTab === tab && (
                      <motion.div layoutId="modalTabIndicator" className="absolute inset-0 rounded-xl border border-primary/25" style={{ zIndex: -1 }} />
                    )}
                  </button>
                ))}
              </div>

              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <Form {...form}>
                  <form id="tradeForm" onSubmit={form.handleSubmit(onSubmit)}>
                    <AnimatePresence mode="wait">
                      {modalTab === "details" && (
                        <motion.div
                          key="details"
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={{ duration: 0.18 }}
                          className="space-y-4"
                        >
                          {/* Symbol + Side + Broker preview */}
                          <div className="grid grid-cols-3 gap-3">
                            <FormField control={form.control} name="symbol" render={({ field }) => (
                              <FormItem>
                                <FormLabel className={labelCls}>Asset</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className={inputCls}>
                                      <SelectValue placeholder="Select asset" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="border-0 rounded-xl" style={{ background: "hsl(var(--card))", border: "1px solid var(--surface-btn-border)" }}>
                                    {ALL_SYMBOLS.map(sym => (
                                      <SelectItem key={sym} value={sym} className="text-[13px]">{sym}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="side" render={({ field }) => (
                              <FormItem>
                                <FormLabel className={labelCls}>Direction</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className={inputCls}>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="border-0 rounded-xl" style={{ background: "hsl(var(--card))", border: "1px solid var(--surface-btn-border)" }}>
                                    <SelectItem value="long" className="text-[13px]">Long (Buy)</SelectItem>
                                    <SelectItem value="short" className="text-[13px]">Short (Sell)</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <div>
                              <p className={`${labelCls} mb-1.5`}>Broker</p>
                              <div className={`${inputCls} flex items-center gap-2 px-3 border`}>
                                <span className={`w-2 h-2 rounded-full shrink-0 ${
                                  BROKER_MAP[watchedSymbol] === "Delta Exchange" ? "bg-orange-400" :
                                  BROKER_MAP[watchedSymbol] === "FusionMarkets" ? "bg-blue-400" :
                                  BROKER_MAP[watchedSymbol] === "Groww" ? "bg-teal-400" :
                                  "bg-muted-foreground/40"
                                }`} />
                                <span className="text-[13px] text-muted-foreground truncate">
                                  {BROKER_MAP[watchedSymbol] || "Auto-detected"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Source Badge */}
                          <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                            <span className="text-[11px] text-muted-foreground font-medium">Source:</span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.09] text-[11px] font-bold text-white/80">
                              <FileText className="w-3 h-3 text-muted-foreground" />
                              Manual Entry
                            </span>
                            <span className="ml-auto text-[10px] text-muted-foreground/60">Sync source: Manual</span>
                          </div>

                          {/* Entry / Exit / Qty */}
                          <div className="grid grid-cols-3 gap-3">
                            <FormField control={form.control} name="entryPrice" render={({ field }) => (
                              <FormItem>
                                <FormLabel className={labelCls}>Entry Price</FormLabel>
                                <FormControl><Input type="number" step="0.0001" {...field} className={inputCls} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="exitPrice" render={({ field }) => (
                              <FormItem>
                                <FormLabel className={labelCls}>Exit Price</FormLabel>
                                <FormControl><Input type="number" step="0.0001" {...field} className={inputCls} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="quantity" render={({ field }) => (
                              <FormItem>
                                <FormLabel className={labelCls}>Qty / Lots</FormLabel>
                                <FormControl><Input type="number" step="0.01" {...field} className={inputCls} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>

                          {/* SL / TP */}
                          <div className="grid grid-cols-2 gap-3">
                            <FormField control={form.control} name="stopLoss" render={({ field }) => (
                              <FormItem>
                                <FormLabel className={labelCls}>Stop Loss</FormLabel>
                                <FormControl><Input type="number" step="0.0001" placeholder="Optional" {...field} value={field.value ?? ""} className={inputCls} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="takeProfit" render={({ field }) => (
                              <FormItem>
                                <FormLabel className={labelCls}>Take Profit</FormLabel>
                                <FormControl><Input type="number" step="0.0001" placeholder="Optional" {...field} value={field.value ?? ""} className={inputCls} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>

                          {/* Dates */}
                          <div className="grid grid-cols-2 gap-3">
                            <FormField control={form.control} name="entryDate" render={({ field }) => (
                              <FormItem>
                                <FormLabel className={labelCls}>Entry Date & Time</FormLabel>
                                <FormControl><Input type="datetime-local" {...field} className={inputCls} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="exitDate" render={({ field }) => (
                              <FormItem>
                                <FormLabel className={labelCls}>Exit Date & Time</FormLabel>
                                <FormControl><Input type="datetime-local" {...field} className={inputCls} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>
                        </motion.div>
                      )}

                      {modalTab === "analysis" && (
                        <motion.div
                          key="analysis"
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={{ duration: 0.18 }}
                          className="space-y-5"
                        >
                          {/* TradingView Link */}
                          <FormField control={form.control} name="tvLink" render={({ field }) => (
                            <FormItem>
                              <FormLabel className={labelCls + " flex items-center gap-1.5"}>
                                <LinkIcon className="w-3 h-3" /> TradingView Chart Link
                              </FormLabel>
                              <div className="relative">
                                <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary/60" />
                                <FormControl>
                                  <Input
                                    placeholder="https://www.tradingview.com/chart/..."
                                    {...field}
                                    value={field.value ?? ""}
                                    className={`${inputCls} pl-9`}
                                  />
                                </FormControl>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )} />

                          {/* Screenshot */}
                          <FormField control={form.control} name="screenshot" render={({ field }) => (
                            <FormItem>
                              <FormLabel className={labelCls + " flex items-center gap-1.5"}>
                                <ImageIcon className="w-3 h-3" /> Screenshot URL
                              </FormLabel>
                              <div className="relative">
                                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                                <FormControl>
                                  <Input
                                    placeholder="https://..."
                                    {...field}
                                    value={field.value ?? ""}
                                    className={`${inputCls} pl-9`}
                                  />
                                </FormControl>
                              </div>
                              {screenshotUrl && (
                                <div className="mt-2 rounded-xl overflow-hidden border border-white/[0.08] aspect-video max-h-36">
                                  <img
                                    src={screenshotUrl}
                                    alt="Preview"
                                    className="w-full h-full object-cover"
                                    onError={(e) => (e.currentTarget.style.display = "none")}
                                  />
                                </div>
                              )}
                              <FormMessage />
                            </FormItem>
                          )} />

                          {/* Setup Tags */}
                          <FormField control={form.control} name="setupTags" render={({ field }) => (
                            <FormItem>
                              <FormLabel className={labelCls + " flex items-center gap-1.5"}>
                                <Tag className="w-3 h-3" /> Setup Tags
                              </FormLabel>
                              <FormControl>
                                <MultiSelectChips
                                  options={SETUP_TAG_OPTIONS}
                                  value={setupTagsVal}
                                  onChange={field.onChange}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />

                          {/* Mistake Tags */}
                          <FormField control={form.control} name="mistakeTags" render={({ field }) => (
                            <FormItem>
                              <FormLabel className={labelCls + " flex items-center gap-1.5"}>
                                <AlertTriangle className="w-3 h-3 text-red-400/70" /> Mistake Tags
                              </FormLabel>
                              <FormControl>
                                <MultiSelectChips
                                  options={MISTAKE_TAG_OPTIONS}
                                  value={mistakeTagsVal}
                                  onChange={field.onChange}
                                  activeClass="bg-red-500/15 text-red-400 border-red-500/30"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />

                          {/* Notes */}
                          <FormField control={form.control} name="notes" render={({ field }) => (
                            <FormItem>
                              <FormLabel className={labelCls + " flex items-center gap-1.5"}>
                                <FileText className="w-3 h-3" /> Journal Notes
                              </FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="What was your thesis? How did the trade go?"
                                  {...field}
                                  value={field.value ?? ""}
                                  rows={4}
                                  className="bg-white/[0.04] border-white/[0.09] rounded-xl text-[13px] focus:border-primary/50 focus:ring-0 resize-none placeholder:text-muted-foreground/40"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </form>
                </Form>
              </div>

              {/* Modal Footer */}
              <div className="px-6 pb-5 pt-4 border-t border-white/[0.08] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                    watchedSide === "long" ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400"
                  }`}>
                    {watchedSide?.toUpperCase()}
                  </span>
                  <span className="text-[13px] font-bold text-white">{watchedSymbol}</span>
                  {modalTab === "analysis" && (setupTagsVal || mistakeTagsVal) && (
                    <span className="text-[11px] text-muted-foreground">
                      · {setupTagsVal.split(",").filter(Boolean).length + mistakeTagsVal.split(",").filter(Boolean).length} tag{setupTagsVal.split(",").filter(Boolean).length + mistakeTagsVal.split(",").filter(Boolean).length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {modalTab === "details" ? (
                    <button
                      type="button"
                      onClick={() => setModalTab("analysis")}
                      className="px-4 h-9 rounded-xl border border-white/[0.1] bg-white/[0.04] text-[13px] font-semibold text-muted-foreground hover:text-white hover:bg-white/[0.08] transition-all"
                    >
                      Next: Analysis
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setModalTab("details")}
                      className="px-4 h-9 rounded-xl border border-white/[0.1] bg-white/[0.04] text-[13px] font-semibold text-muted-foreground hover:text-white hover:bg-white/[0.08] transition-all"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="submit"
                    form="tradeForm"
                    disabled={createTrade.isPending}
                    className="px-5 h-9 rounded-xl bg-primary text-white text-[13px] font-bold hover:bg-primary/85 active:scale-[0.98] transition-all shadow-md shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createTrade.isPending ? "Saving..." : "Save Trade"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Trade Detail Drawer ── */}
      <Sheet open={!!selectedTradeId} onOpenChange={(open) => !open && setSelectedTradeId(null)}>
        <SheetContent className="w-full sm:max-w-[420px] p-0 flex flex-col overflow-hidden" style={{ background: "hsl(var(--card))", borderLeft: "1px solid var(--surface-sidebar-border)" }}>
          {selectedTrade && (
            <>
              {/* Drawer Header */}
              <div className="relative px-6 pt-6 pb-5 border-b border-white/[0.07]">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.07] to-transparent pointer-events-none" />
                <div className="relative flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                      {BROKER_MAP[selectedTrade.symbol] || "Broker"} · {new Date(selectedTrade.entryDate).toLocaleDateString()}
                    </p>
                    <h2 className="text-3xl font-black tracking-tight text-foreground leading-none">{selectedTrade.symbol}</h2>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 mt-1">
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                      selectedTrade.side === "long" ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400"
                    }`}>
                      {selectedTrade.side.toUpperCase()}
                    </span>
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                      selectedTrade.outcome === "win" ? "bg-emerald-500/10 text-emerald-400" :
                      selectedTrade.outcome === "loss" ? "bg-red-500/10 text-red-400" :
                      "bg-white/[0.05] text-muted-foreground"
                    }`}>
                      {selectedTrade.outcome.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className={`text-2xl font-black ${selectedTrade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {selectedTrade.pnl >= 0 ? "+" : ""}{fc(selectedTrade.pnl)}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: "Entry", value: fc(selectedTrade.entryPrice), mono: true },
                    { label: "Exit", value: selectedTrade.exitPrice == null ? "—" : fc(selectedTrade.exitPrice), mono: true },
                    { label: "Risk / Reward", value: selectedTrade.riskRewardRatio ? `${selectedTrade.riskRewardRatio.toFixed(2)}R` : "—", mono: true },
                    { label: "Quantity", value: String(selectedTrade.quantity), mono: true },
                    { label: "Stop Loss", value: selectedTrade.stopLoss ? fc(selectedTrade.stopLoss) : "—", mono: true },
                    { label: "Take Profit", value: selectedTrade.takeProfit ? fc(selectedTrade.takeProfit) : "—", mono: true },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1">{label}</p>
                      <p className={`text-[14px] font-bold ${mono ? "font-mono" : ""} text-white leading-tight`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* TradingView Link */}
                <div className="space-y-2.5">
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Analysis</p>
                  {(selectedTrade.tvLink || TV_LINKS[selectedTrade.symbol]) ? (
                    <button
                      className="tv-chart-btn w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[13px] font-semibold"
                      onClick={() => window.open(selectedTrade.tvLink || TV_LINKS[selectedTrade.symbol], "_blank")}
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Open TradingView Chart
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </button>
                  ) : (
                    <div className="px-4 py-2.5 rounded-xl border border-dashed border-white/[0.08] text-[12px] text-muted-foreground/60 italic">
                      No chart linked for this trade
                    </div>
                  )}

                  {/* Screenshot */}
                  {selectedTrade.screenshot ? (
                    <div
                      className="rounded-xl overflow-hidden border border-white/[0.08] cursor-pointer group relative"
                      onClick={() => window.open(selectedTrade.screenshot!, "_blank")}
                    >
                      <img
                        src={selectedTrade.screenshot}
                        alt="Trade Screenshot"
                        className="w-full max-h-44 object-cover group-hover:opacity-90 transition-opacity"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        <ExternalLink className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="h-20 rounded-xl border border-dashed border-white/[0.07] flex items-center justify-center gap-2 text-[12px] text-muted-foreground/50 italic">
                      <ImageIcon className="w-4 h-4 opacity-50" /> No screenshot attached
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Tags</p>
                  {selectedTrade.setupTags && (
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Tag className="w-3 h-3" /> Setup
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTrade.setupTags.split(",").filter(Boolean).map(tag => (
                          <span key={tag} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-primary/12 text-primary border border-primary/20">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedTrade.mistakeTags && (
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-red-400/70" /> Mistakes
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTrade.mistakeTags.split(",").filter(Boolean).map(tag => (
                          <span key={tag} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!selectedTrade.setupTags && !selectedTrade.mistakeTags && (
                    <p className="text-[12px] text-muted-foreground/50 italic">No tags recorded</p>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Journal Notes
                  </p>
                  {selectedTrade.notes ? (
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.07] text-[13px] leading-relaxed text-foreground/80">
                      {selectedTrade.notes}
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground/50 italic">No notes recorded for this trade.</p>
                  )}
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="px-6 py-4 border-t border-white/[0.07] flex gap-2">
                <button
                  onClick={() => deleteTrade.mutate({ id: selectedTrade.id })}
                  disabled={deleteTrade.isPending}
                  className="flex-1 h-9 rounded-xl border border-red-500/20 bg-red-500/8 text-red-400 text-[13px] font-semibold hover:bg-red-500/15 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Trade
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
