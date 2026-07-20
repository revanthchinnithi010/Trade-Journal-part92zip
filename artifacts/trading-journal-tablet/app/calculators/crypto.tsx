/**
 * app/calculators/crypto.tsx — Crypto Position Calculator
 *
 * React Native port of artifacts/trading-journal/src/pages/calc-crypto.tsx
 *
 * Web → RN replacements:
 *   div / span / button / input → View / Text / Pressable / TextInput
 *   CSS className               → StyleSheet.create()
 *   lucide-react icons          → @expo/vector-icons Ionicons
 *   cn()                        → inline conditional style arrays
 *   framer-motion / animations  → none (tablet pattern)
 *   grid grid-cols-[1fr_380px]  → flexDirection:"row" two-column layout
 *   overflow-y-auto             → ScrollView
 *   animate-ping live dot       → static dot (no CSS animation in RN)
 *   fmtPrice(web context)       → @/lib/fmtPrice
 *   useTickStore(web)           → @/store/tickStore
 *
 * ALL calculation formulas preserved exactly from the web source:
 *   slDist, tpDist, riskAmount, lossPerLot, recLots,
 *   positionSize, tradeValue, marginUsed, estLoss, estProfit,
 *   rr, liqPrice, marginPct, overLev, highMargin
 */

import React, { useMemo, useState, useCallback, memo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTickStore } from "@/store/tickStore";
import { fmtPrice } from "@/lib/fmtPrice";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — preserved exactly from source
// ─────────────────────────────────────────────────────────────────────────────

const COINS: Record<string, { name: string; lotSize: number; lotLabel: string; defaultEntry: number; step: number }> = {
  BTCUSD:  { name: "Bitcoin",  lotSize: 0.001,     lotLabel: "BTC", defaultEntry: 65000,   step: 0.001     },
  ETHUSD:  { name: "Ethereum", lotSize: 0.01,      lotLabel: "ETH", defaultEntry: 3200,    step: 0.01      },
  SOLUSD:  { name: "Solana",   lotSize: 1,         lotLabel: "SOL", defaultEntry: 155,     step: 0.1       },
  DOGEUSD: { name: "Dogecoin", lotSize: 100,       lotLabel: "DOGE",defaultEntry: 0.38,    step: 0.0001    },
  PEPEUSD: { name: "Pepe",     lotSize: 1_000_000, lotLabel: "PEPE",defaultEntry: 0.00001, step: 0.0000001 },
};

const RISK_PRESETS = [0.5, 1, 1.5, 2, 3];
const LEV_PRESETS  = [5, 10, 20, 50, 100];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — preserved exactly from source
// ─────────────────────────────────────────────────────────────────────────────

function fmt(v: number, dp = 2): string {
  if (!isFinite(v) || isNaN(v)) return "—";
  if (dp === 0) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtUSD(v: number): string {
  if (!isFinite(v) || isNaN(v)) return "—";
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────────────────────────────────────
// NumInput
// ─────────────────────────────────────────────────────────────────────────────

interface NumInputProps {
  label: string; value: string; onChange: (v: string) => void;
  step?: number; min?: number; suffix?: string;
}
const NumInput = memo(function NumInput({ label, value, onChange, suffix }: NumInputProps) {
  return (
    <View style={s.inputGroup}>
      <Text style={s.inputLabel}>{label}</Text>
      <View style={s.inputWrap}>
        <TextInput
          style={[s.textInput, suffix ? s.textInputSuffix : null]}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          returnKeyType="done"
          placeholderTextColor={MUTED}
        />
        {suffix ? <Text style={s.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ResultCard
// ─────────────────────────────────────────────────────────────────────────────

interface ResultCardProps { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean; }
const ResultCard = memo(function ResultCard({ label, value, sub, accent, warn }: ResultCardProps) {
  return (
    <View style={[s.resultCard, warn ? s.rcWarn : accent ? s.rcAccent : s.rcNormal]}>
      <Text style={s.rcLabel}>{label}</Text>
      <Text style={[s.rcValue, warn ? s.rcValueWarn : accent ? s.rcValueAccent : s.rcValueNormal]}>{value}</Text>
      {sub ? <Text style={s.rcSub}>{sub}</Text> : null}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const BG_PAGE   = "#05070A";
const BG_CARD   = "#10251C";
const BG_INPUT  = "#0D1C16";
const BORDER    = "rgba(57,91,67,0.30)";
const BORDER40  = "rgba(57,91,67,0.40)";
const TEXT_PRI  = "#F3FFF3";
const MUTED     = "#A7B8A9";
const ACCENT    = "#B7FF5A";

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function CalcCrypto() {
  const insets = useSafeAreaInsets();
  const ticks  = useTickStore(st => st.ticks);

  // State — mirrors web exactly
  const [coin, setCoin]       = useState("BTCUSD");
  const [side, setSide]       = useState<"long" | "short">("long");
  const [capital, setCapital] = useState("10000");
  const [risk, setRisk]       = useState("1");
  const [lev, setLev]         = useState("10");
  const [entry, setEntry]     = useState("65000");
  const [sl, setSl]           = useState("64000");
  const [tp, setTp]           = useState("67000");
  const [lots, setLots]       = useState("1");

  const cfg       = COINS[coin];
  const liveTick  = ticks[coin] ?? null;
  const livePrice = liveTick?.price ?? null;

  // useMemo calculation — formula preserved exactly from source
  const calc = useMemo(() => {
    const cap      = parseFloat(capital) || 0;
    const rPct     = parseFloat(risk) || 0;
    const leverage = parseFloat(lev) || 1;
    const entryP   = parseFloat(entry) || 0;
    const slP      = parseFloat(sl) || 0;
    const tpP      = parseFloat(tp) || 0;
    const lotsN    = parseFloat(lots) || 1;
    const { lotSize } = cfg;

    if (!entryP || !slP) return null;

    const slDist = side === "long" ? entryP - slP : slP - entryP;
    const tpDist = side === "long" ? tpP - entryP : entryP - tpP;

    const riskAmount  = cap * rPct / 100;
    const lossPerLot  = lotSize * Math.max(slDist, 0);
    const recLots     = lossPerLot > 0 ? riskAmount / lossPerLot : 0;

    const useLots      = lotsN;
    const positionSize = useLots * lotSize;
    const tradeValue   = positionSize * entryP;
    const marginUsed   = tradeValue / leverage;
    const estLoss      = useLots * lossPerLot;
    const estProfit    = useLots * lotSize * Math.max(tpDist, 0);
    const rr           = estLoss > 0 ? estProfit / estLoss : 0;
    const liqPrice     = side === "long"
      ? entryP * (1 - 1 / leverage)
      : entryP * (1 + 1 / leverage);
    const marginPct  = cap > 0 ? (marginUsed / cap) * 100 : 0;
    const overLev    = leverage > 50;
    const highMargin = marginPct > 20;

    return { riskAmount, recLots, positionSize, tradeValue, marginUsed, estLoss, estProfit, rr, liqPrice, slDist, marginPct, overLev, highMargin };
  }, [capital, risk, lev, entry, sl, tp, lots, side, cfg]);

  const applyRecLots = useCallback(() => {
    if (calc && calc.recLots > 0) setLots(calc.recLots.toFixed(3));
  }, [calc]);

  const fillEntry = useCallback(() => {
    if (livePrice) setEntry(String(livePrice));
  }, [livePrice]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={[s.root, { paddingTop: insets.top }]}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.h1}>Crypto Calculator</Text>
          <Text style={s.subtitle}>Delta Exchange style position sizing for crypto perpetuals.</Text>
        </View>

        <View style={s.columns}>
          {/* ── Inputs ── */}
          <View style={s.inputsPanel}>

            {/* Coin + Side */}
            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Text style={s.inputLabel}>Coin</Text>
                <View style={s.chipRow}>
                  {Object.keys(COINS).map(c => (
                    <Pressable key={c} onPress={() => { setCoin(c); setEntry(String(COINS[c].defaultEntry)); }}
                      style={[s.chip, c === coin ? s.chipActive : s.chipInactive]}>
                      <Text style={[s.chipText, c === coin ? s.chipTextActive : s.chipTextInactive]}>
                        {c.replace("USD", "")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.inputLabel}>Side</Text>
                <View style={s.sideToggle}>
                  {(["long", "short"] as const).map(sd => (
                    <Pressable key={sd} onPress={() => setSide(sd)}
                      style={[s.sideBtn, sd === side
                        ? sd === "long" ? s.sideBtnLong : s.sideBtnShort
                        : s.sideBtnOff]}>
                      <Ionicons name={sd === "long" ? "trending-up" : "trending-down"} size={12}
                        color={sd === side ? (sd === "long" ? "#34d399" : "#f87171") : MUTED} />
                      <Text style={[s.sideBtnText, sd === side
                        ? sd === "long" ? s.sideBtnTextLong : s.sideBtnTextShort
                        : s.sideBtnTextOff]}>
                        {sd}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* Risk + Leverage presets */}
            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Text style={s.inputLabel}>Risk %</Text>
                <View style={s.chipRow}>
                  {RISK_PRESETS.map(p => (
                    <Pressable key={p} onPress={() => setRisk(String(p))}
                      style={[s.chip, String(p) === risk ? s.chipActive : s.chipInactive]}>
                      <Text style={[s.chipText, String(p) === risk ? s.chipTextActive : s.chipTextInactive]}>{p}%</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.inputLabel}>Leverage</Text>
                <View style={s.chipRow}>
                  {LEV_PRESETS.map(p => (
                    <Pressable key={p} onPress={() => setLev(String(p))}
                      style={[s.chip, String(p) === lev ? s.chipActive : s.chipInactive]}>
                      <Text style={[s.chipText, String(p) === lev ? s.chipTextActive : s.chipTextInactive]}>{p}x</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* Number inputs */}
            <View style={s.row2}>
              <View style={{ flex: 1 }}><NumInput label="Capital (USD)" value={capital} onChange={setCapital} suffix="$" /></View>
              <View style={{ flex: 1 }}><NumInput label="Risk %" value={risk} onChange={setRisk} suffix="%" /></View>
            </View>
            <View style={s.row2}>
              <View style={{ flex: 1 }}><NumInput label="Leverage" value={lev} onChange={setLev} suffix="x" /></View>
              <View style={{ flex: 1 }}><NumInput label="Lot Size" value={lots} onChange={setLots} suffix="lots" /></View>
            </View>

            {/* Live Price Banner */}
            {livePrice !== null && livePrice > 0 ? (
              <View style={s.liveBanner}>
                <View style={s.liveBannerLeft}>
                  <View style={s.liveDot} />
                  <Text style={s.liveLabel}>Live Market</Text>
                  <Text style={s.livePrice}>{fmtPrice(livePrice, coin)}</Text>
                  {liveTick && (
                    <Text style={[s.liveChg, { color: liveTick.changePct >= 0 ? ACCENT : "#ef4444" }]}>
                      {liveTick.changePct >= 0 ? "+" : ""}{liveTick.changePct.toFixed(2)}%
                    </Text>
                  )}
                </View>
                <Pressable onPress={fillEntry} style={s.fillBtn}>
                  <Text style={s.fillBtnText}>Fill Entry ↑</Text>
                </Pressable>
              </View>
            ) : (
              <View style={s.liveOffline}>
                <View style={s.liveOfflineDot} />
                <Text style={s.liveOfflineText}>Connecting to live feed…</Text>
              </View>
            )}

            <View style={s.row3}>
              <View style={{ flex: 1 }}><NumInput label="Entry Price" value={entry} onChange={setEntry} suffix="$" /></View>
              <View style={{ flex: 1 }}><NumInput label="Stop Loss" value={sl} onChange={setSl} suffix="$" /></View>
              <View style={{ flex: 1 }}><NumInput label="Take Profit" value={tp} onChange={setTp} suffix="$" /></View>
            </View>

            {/* Warnings */}
            {calc?.overLev && (
              <View style={s.warnRow}>
                <Ionicons name="warning" size={15} color="#f87171" />
                <Text style={s.warnText}>High leverage ({lev}x) detected — liquidation risk is elevated.</Text>
              </View>
            )}
            {calc?.highMargin && (
              <View style={s.amberRow}>
                <Ionicons name="warning" size={15} color="#fbbf24" />
                <Text style={s.amberText}>Margin usage is {fmt(calc.marginPct, 1)}% of capital — consider reducing position.</Text>
              </View>
            )}

            {/* Recommended lots */}
            {calc && calc.recLots > 0 && (
              <View style={s.recLots}>
                <View>
                  <Text style={s.recLotsLabel}>Recommended Lot Size</Text>
                  <Text style={s.recLotsValue}>{fmt(calc.recLots, 3)} lots</Text>
                </View>
                <Pressable onPress={applyRecLots} style={s.applyBtn}>
                  <Text style={s.applyBtnText}>Apply</Text>
                  <Ionicons name="chevron-forward" size={12} color={ACCENT} />
                </Pressable>
              </View>
            )}
          </View>

          {/* ── Results ── */}
          <View style={s.resultsPanel}>
            <View style={s.resultsPanelInner}>
              <View style={s.resultsHeader}>
                <View style={s.resultsIcon}>
                  <Ionicons name="logo-bitcoin" size={14} color={ACCENT} />
                </View>
                <Text style={s.resultsTitle}>{COINS[coin].name} — {side.toUpperCase()}</Text>
                <View style={s.levBadge}>
                  <Text style={s.levBadgeText}>{parseFloat(lev)}x lev</Text>
                </View>
              </View>
              <View style={s.resultGrid}>
                <ResultCard label="Risk Amount"      value={calc ? fmtUSD(calc.riskAmount)  : "—"} accent />
                <ResultCard label="Trade Value"      value={calc ? fmtUSD(calc.tradeValue)  : "—"} />
                <ResultCard label="Margin Used"      value={calc ? fmtUSD(calc.marginUsed)  : "—"} warn={calc?.highMargin} />
                <ResultCard label="Position Size"    value={calc ? `${fmt(calc.positionSize, 4)} ${cfg.lotLabel}` : "—"} />
                <ResultCard label="Est. Loss (SL)"   value={calc ? fmtUSD(calc.estLoss)     : "—"} warn={!!calc}
                  sub={calc ? `SL distance: ${fmt(calc.slDist, calc.slDist < 0.01 ? 6 : 2)}` : undefined} />
                <ResultCard label="Est. Profit (TP)" value={calc ? fmtUSD(calc.estProfit)   : "—"} accent={!!calc}
                  sub={calc ? `RR: 1 : ${fmt(calc.rr, 2)}` : undefined} />
                <ResultCard label="Liq. Price"       value={calc ? fmtUSD(calc.liqPrice)    : "—"} warn={calc?.overLev} />
                <ResultCard label="Margin Used %"    value={calc ? `${fmt(calc.marginPct, 1)}%` : "—"} warn={calc?.highMargin} />
              </View>
            </View>

            {/* RR Banner */}
            {calc && calc.rr > 0 && (
              <View style={[s.rrBanner, calc.rr >= 2 ? s.rrBannerGood : s.rrBannerWarn]}>
                <Ionicons name="flash" size={15} color={calc.rr >= 2 ? "#34d399" : "#fbbf24"} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.rrTitle, calc.rr >= 2 ? s.rrTitleGood : s.rrTitleWarn]}>
                    {calc.rr >= 2 ? "Good RR Ratio" : calc.rr >= 1 ? "Acceptable RR" : "Poor RR Ratio"}
                  </Text>
                  <Text style={s.rrSub}>
                    1 : {fmt(calc.rr, 2)} — {calc.rr >= 2 ? "Meets institutional standard" : "Aim for 1:2 or better"}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG_PAGE },
  scroll: { padding: 16 },

  header:   { marginBottom: 16 },
  h1:       { fontSize: 22, fontWeight: "900", color: TEXT_PRI, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: MUTED, fontFamily: "Inter_400Regular", marginTop: 2 },

  columns:      { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  inputsPanel:  { flex: 1, backgroundColor: BG_CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 14 },
  resultsPanel: { width: 340, gap: 10 },
  resultsPanelInner: { backgroundColor: BG_CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14 },

  row2: { flexDirection: "row", gap: 10 },
  row3: { flexDirection: "row", gap: 10 },

  inputGroup: { gap: 5 },
  inputLabel: { fontSize: 10, fontWeight: "700", color: MUTED, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  inputWrap:  { position: "relative" },
  textInput:  { height: 42, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, fontWeight: "500", color: TEXT_PRI, fontFamily: "Inter_500Medium", backgroundColor: BG_INPUT, borderWidth: 1, borderColor: BORDER40 },
  textInputSuffix: { paddingRight: 40 },
  suffix: { position: "absolute", right: 10, top: 0, bottom: 0, textAlignVertical: "center", fontSize: 11, color: MUTED, fontWeight: "700", fontFamily: "Inter_700Bold" },

  chipRow:  { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  chip:     { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  chipActive:   { backgroundColor: "rgba(183,255,90,0.15)", borderColor: "rgba(183,255,90,0.50)" },
  chipInactive: { backgroundColor: BG_INPUT, borderColor: BORDER },
  chipText:         { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold" },
  chipTextActive:   { color: ACCENT },
  chipTextInactive: { color: MUTED },

  sideToggle:       { flexDirection: "row", borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: BORDER, marginTop: 4 },
  sideBtn:          { flex: 1, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  sideBtnLong:      { backgroundColor: "rgba(52,211,153,0.15)" },
  sideBtnShort:     { backgroundColor: "rgba(248,113,113,0.15)" },
  sideBtnOff:       { backgroundColor: BG_INPUT },
  sideBtnText:      { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold", textTransform: "capitalize" },
  sideBtnTextLong:  { color: "#34d399" },
  sideBtnTextShort: { color: "#f87171" },
  sideBtnTextOff:   { color: MUTED },

  liveBanner:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(183,255,90,0.05)", borderWidth: 1, borderColor: "rgba(183,255,90,0.20)" },
  liveBannerLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  liveDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
  liveLabel:      { fontSize: 10, fontWeight: "700", color: "rgba(167,184,169,0.70)", textTransform: "uppercase", letterSpacing: 0.7 },
  livePrice:      { fontSize: 13, fontWeight: "900", color: TEXT_PRI, fontFamily: "Inter_700Bold" },
  liveChg:        { fontSize: 10, fontWeight: "700" },
  fillBtn:        { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(183,255,90,0.15)", borderWidth: 1, borderColor: "rgba(183,255,90,0.35)" },
  fillBtnText:    { fontSize: 10, fontWeight: "900", color: ACCENT, fontFamily: "Inter_700Bold" },
  liveOffline:    { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(57,91,67,0.20)", backgroundColor: BG_INPUT },
  liveOfflineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(167,184,169,0.30)" },
  liveOfflineText:{ fontSize: 10, color: "rgba(167,184,169,0.50)" },

  warnRow:    { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.06)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" },
  warnText:   { flex: 1, fontSize: 12, color: "#fca5a5", fontFamily: "Inter_400Regular" },
  amberRow:   { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(245,158,11,0.06)", borderWidth: 1, borderColor: "rgba(245,158,11,0.25)" },
  amberText:  { flex: 1, fontSize: 12, color: "#fcd34d", fontFamily: "Inter_400Regular" },

  recLots:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(183,255,90,0.20)", backgroundColor: "rgba(183,255,90,0.05)" },
  recLotsLabel: { fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: "700" },
  recLotsValue: { fontSize: 16, fontWeight: "900", color: ACCENT, fontFamily: "Inter_700Bold", marginTop: 2 },
  applyBtn:     { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(183,255,90,0.10)", borderWidth: 1, borderColor: "rgba(183,255,90,0.30)" },
  applyBtnText: { fontSize: 11, fontWeight: "700", color: ACCENT },

  resultsHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  resultsIcon:   { width: 26, height: 26, borderRadius: 8, backgroundColor: "rgba(183,255,90,0.10)", borderWidth: 1, borderColor: "rgba(183,255,90,0.20)", alignItems: "center", justifyContent: "center" },
  resultsTitle:  { flex: 1, fontSize: 13, fontWeight: "700", color: TEXT_PRI, fontFamily: "Inter_700Bold" },
  levBadge:      { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: BG_INPUT, borderWidth: 1, borderColor: BORDER },
  levBadgeText:  { fontSize: 10, color: MUTED },

  resultGrid:   { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  resultCard:   { width: "47%", borderRadius: 10, padding: 12, borderWidth: 1 },
  rcNormal:     { backgroundColor: BG_INPUT, borderColor: "rgba(57,91,67,0.30)" },
  rcAccent:     { backgroundColor: "rgba(183,255,90,0.06)", borderColor: "rgba(183,255,90,0.25)" },
  rcWarn:       { backgroundColor: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.20)" },
  rcLabel:      { fontSize: 10, fontWeight: "700", color: MUTED, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 3 },
  rcValue:      { fontSize: 17, fontWeight: "900", lineHeight: 20 },
  rcValueNormal:{ color: TEXT_PRI },
  rcValueAccent:{ color: ACCENT },
  rcValueWarn:  { color: "#f87171" },
  rcSub:        { fontSize: 10, color: "rgba(167,184,169,0.70)", marginTop: 2 },

  rrBanner:     { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  rrBannerGood: { backgroundColor: "rgba(52,211,153,0.06)", borderColor: "rgba(52,211,153,0.25)" },
  rrBannerWarn: { backgroundColor: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.25)" },
  rrTitle:      { fontSize: 12, fontWeight: "700" },
  rrTitleGood:  { color: "#6ee7b7" },
  rrTitleWarn:  { color: "#fcd34d" },
  rrSub:        { fontSize: 11, color: MUTED, fontFamily: "Inter_400Regular", marginTop: 1 },
});
