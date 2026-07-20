/**
 * app/calculators/forex.tsx — Forex / Indices / Commodities Calculator
 *
 * React Native port of artifacts/trading-journal/src/pages/calc-forex.tsx
 *
 * Web → RN replacements: same as crypto.tsx
 * ALL calculation formulas preserved exactly:
 *   riskAmount, pipCost, estLoss, estProfit, rr, recLots,
 *   tradeValue, marginReq, marginPct, highMargin, overLev
 */

import React, { useMemo, useState, useCallback, memo } from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTickStore } from "@/store/tickStore";
import { fmtPrice } from "@/lib/fmtPrice";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — preserved exactly from source
// ─────────────────────────────────────────────────────────────────────────────

const PAIRS: Record<string, { label: string; pipSize: number; lotPipValue: number; dp: number; defaultEntry: number; defaultSL: number }> = {
  EURUSD: { label: "EUR/USD", pipSize: 0.0001, lotPipValue: 10,  dp: 4, defaultEntry: 1.0850, defaultSL: 20  },
  GBPJPY: { label: "GBP/JPY", pipSize: 0.01,   lotPipValue: 8.5, dp: 2, defaultEntry: 195.50, defaultSL: 30  },
  XAUUSD: { label: "XAU/USD", pipSize: 0.1,    lotPipValue: 10,  dp: 1, defaultEntry: 2320.0, defaultSL: 15  },
  NAS100: { label: "NAS100",  pipSize: 1,       lotPipValue: 1,   dp: 0, defaultEntry: 18500,  defaultSL: 50  },
  US30:   { label: "US30",    pipSize: 1,       lotPipValue: 1,   dp: 0, defaultEntry: 39500,  defaultSL: 50  },
  USOIL:  { label: "US Oil",  pipSize: 0.01,    lotPipValue: 10,  dp: 2, defaultEntry: 82.50,  defaultSL: 30  },
  UKOIL:  { label: "UK Oil",  pipSize: 0.01,    lotPipValue: 10,  dp: 2, defaultEntry: 86.50,  defaultSL: 30  },
};

const RISK_PRESETS = [0.5, 1, 1.5, 2, 3];
const LEV_PRESETS  = [10, 20, 30, 50, 100, 200, 500];
const LOT_PRESETS  = [0.01, 0.05, 0.1, 0.5, 1];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — preserved exactly from source
// ─────────────────────────────────────────────────────────────────────────────

function fmt(v: number, dp = 2): string {
  if (!isFinite(v) || isNaN(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtUSD(v: number): string {
  if (!isFinite(v) || isNaN(v)) return "—";
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const BG_PAGE  = "#05070A";
const BG_CARD  = "#10251C";
const BG_INPUT = "#0D1C16";
const BORDER   = "rgba(57,91,67,0.30)";
const BORDER40 = "rgba(57,91,67,0.40)";
const TEXT_PRI = "#F3FFF3";
const MUTED    = "#A7B8A9";
const ACCENT   = "#B7FF5A";

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

const NumInput = memo(function NumInput({ label, value, onChange, suffix, help }: {
  label: string; value: string; onChange: (v: string) => void; suffix?: string; help?: string;
}) {
  return (
    <View style={s.inputGroup}>
      <View style={s.inputLabelRow}>
        <Text style={s.inputLabel}>{label}</Text>
        {help ? <Text style={s.inputHelp}>{help}</Text> : null}
      </View>
      <View style={s.inputWrap}>
        <TextInput style={[s.textInput, suffix ? s.textInputSuffix : null]}
          value={value} onChangeText={onChange}
          keyboardType="numeric" returnKeyType="done" placeholderTextColor={MUTED} />
        {suffix ? <Text style={s.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
});

const ResultCard = memo(function ResultCard({ label, value, sub, accent, warn }: {
  label: string; value: string; sub?: string; accent?: boolean; warn?: boolean;
}) {
  return (
    <View style={[s.resultCard, warn ? s.rcWarn : accent ? s.rcAccent : s.rcNormal]}>
      <Text style={s.rcLabel}>{label}</Text>
      <Text style={[s.rcValue, warn ? s.rcValueWarn : accent ? s.rcValueAccent : s.rcValueNormal]}>{value}</Text>
      {sub ? <Text style={s.rcSub}>{sub}</Text> : null}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function CalcForex() {
  const insets = useSafeAreaInsets();
  const ticks  = useTickStore(st => st.ticks);

  // State — mirrors web exactly
  const [pair, setPair]       = useState("EURUSD");
  const [side, setSide]       = useState<"long" | "short">("long");
  const [capital, setCapital] = useState("10000");
  const [risk, setRisk]       = useState("1");
  const [lev, setLev]         = useState("100");
  const [lots, setLots]       = useState("0.1");
  const [slPips, setSlPips]   = useState("20");
  const [tpPips, setTpPips]   = useState("40");

  const cfg       = PAIRS[pair];
  const liveTick  = ticks[pair] ?? null;
  const livePrice = liveTick?.price ?? null;

  // useMemo — formula preserved exactly from source
  const calc = useMemo(() => {
    const cap      = parseFloat(capital) || 0;
    const rPct     = parseFloat(risk) || 0;
    const leverage = parseFloat(lev) || 1;
    const lotsN    = parseFloat(lots) || 0;
    const slP      = parseFloat(slPips) || 0;
    const tpP      = parseFloat(tpPips) || 0;
    const { lotPipValue } = cfg;

    const riskAmount  = cap * rPct / 100;
    const pipCost     = lotsN * lotPipValue;
    const estLoss     = slP * pipCost;
    const estProfit   = tpP * pipCost;
    const rr          = estLoss > 0 ? estProfit / estLoss : 0;
    const recLots     = slP > 0 && lotPipValue > 0 ? riskAmount / (slP * lotPipValue) : 0;
    const tradeValue  = lotsN * 100_000;
    const marginReq   = tradeValue / leverage;
    const marginPct   = cap > 0 ? (marginReq / cap) * 100 : 0;
    const highMargin  = marginPct > 25;
    const overLev     = leverage > 200;

    return { riskAmount, pipCost, estLoss, estProfit, rr, recLots, tradeValue, marginReq, marginPct, highMargin, overLev };
  }, [capital, risk, lev, lots, slPips, tpPips, cfg]);

  const applyRecLots = useCallback(() => {
    if (calc && calc.recLots > 0) setLots(calc.recLots.toFixed(2));
  }, [calc]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={[s.root, { paddingTop: insets.top }]} contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={s.header}>
          <Text style={s.h1}>Forex / Indices / Commodities</Text>
          <Text style={s.subtitle}>Pip-based position sizing for forex, gold, indices, and oil.</Text>
        </View>

        <View style={s.columns}>
          {/* ── Inputs ── */}
          <View style={s.inputsPanel}>

            {/* Pair selector */}
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Market</Text>
              <View style={s.chipRow}>
                {Object.entries(PAIRS).map(([k, v]) => (
                  <Pressable key={k} onPress={() => { setPair(k); setSlPips(String(v.defaultSL)); }}
                    style={[s.chip, k === pair ? s.chipActive : s.chipInactive]}>
                    <Text style={[s.chipText, k === pair ? s.chipTextActive : s.chipTextInactive]}>{v.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Direction */}
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Direction</Text>
              <View style={s.sideToggle}>
                {(["long", "short"] as const).map(sd => (
                  <Pressable key={sd} onPress={() => setSide(sd)}
                    style={[s.sideBtn, sd === side
                      ? sd === "long" ? s.sideBtnLong : s.sideBtnShort
                      : s.sideBtnOff]}>
                    <Ionicons name={sd === "long" ? "trending-up" : "trending-down"} size={12}
                      color={sd === side ? (sd === "long" ? "#60a5fa" : "#f87171") : MUTED} />
                    <Text style={[s.sideBtnText, sd === side
                      ? sd === "long" ? s.sideBtnTextLong : s.sideBtnTextShort
                      : s.sideBtnTextOff]}>{sd}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Risk + Lev presets */}
            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Text style={s.inputLabel}>Risk % Presets</Text>
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
                <Text style={s.inputLabel}>Leverage Presets</Text>
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

            <View style={s.row2}>
              <View style={{ flex: 1 }}><NumInput label="Capital (USD)" value={capital} onChange={setCapital} suffix="$" /></View>
              <View style={{ flex: 1 }}><NumInput label="Risk %" value={risk} onChange={setRisk} suffix="%" /></View>
            </View>

            <View style={s.row2}>
              <View style={{ flex: 1 }}><NumInput label="Leverage" value={lev} onChange={setLev} suffix="x" /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.inputLabel}>Lot Size</Text>
                <View style={s.chipRow}>
                  {LOT_PRESETS.map(p => (
                    <Pressable key={p} onPress={() => setLots(String(p))}
                      style={[s.chip, s.chipSm, String(p) === lots ? s.chipActive : s.chipInactive]}>
                      <Text style={[s.chipTextSm, String(p) === lots ? s.chipTextActive : s.chipTextInactive]}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={[s.inputWrap, { marginTop: 4 }]}>
                  <TextInput style={s.textInput} value={lots} onChangeText={setLots}
                    keyboardType="numeric" returnKeyType="done" placeholderTextColor={MUTED} />
                </View>
              </View>
            </View>

            <View style={s.row2}>
              <View style={{ flex: 1 }}><NumInput label="Stop Loss (Pips)" value={slPips} onChange={setSlPips} suffix="pips" /></View>
              <View style={{ flex: 1 }}><NumInput label="Take Profit (Pips)" value={tpPips} onChange={setTpPips} suffix="pips" /></View>
            </View>

            {/* Live Price Banner */}
            {livePrice !== null && livePrice > 0 ? (
              <View style={s.liveBanner}>
                <View style={s.liveBannerLeft}>
                  <View style={s.liveDot} />
                  <Text style={s.liveLabel}>Live {cfg.label}</Text>
                  <Text style={s.livePrice}>{fmtPrice(livePrice, pair)}</Text>
                  {liveTick && (
                    <Text style={[s.liveChg, { color: liveTick.changePct >= 0 ? ACCENT : "#ef4444" }]}>
                      {liveTick.changePct >= 0 ? "+" : ""}{liveTick.changePct.toFixed(2)}%
                    </Text>
                  )}
                </View>
                <Text style={s.liveHint}>use for SL/TP pip calc</Text>
              </View>
            ) : (
              <View style={s.liveOffline}>
                <View style={s.liveOfflineDot} />
                <Text style={s.liveOfflineText}>Connecting to live feed…</Text>
              </View>
            )}

            {/* Pip info */}
            <View style={s.pipInfo}>
              <Text style={s.pipInfoText}>
                <Text style={s.pipInfoAccent}>{cfg.label}</Text>
                {" — Pip size: "}{cfg.pipSize}{" · Pip value (1 lot): $"}{cfg.lotPipValue}
              </Text>
            </View>

            {/* Warnings */}
            {calc?.overLev && (
              <View style={s.warnRow}>
                <Ionicons name="warning" size={15} color="#f87171" />
                <Text style={s.warnText}>Over-leverage ({lev}x) — broker margin call risk is high.</Text>
              </View>
            )}
            {calc?.highMargin && (
              <View style={s.amberRow}>
                <Ionicons name="warning" size={15} color="#fbbf24" />
                <Text style={s.amberText}>Margin usage {fmt(calc.marginPct, 1)}% of capital — consider reducing lot size.</Text>
              </View>
            )}

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
                  <Ionicons name="globe" size={14} color={ACCENT} />
                </View>
                <Text style={s.resultsTitle}>{cfg.label} — {side.toUpperCase()}</Text>
                <View style={s.levBadge}><Text style={s.levBadgeText}>{parseFloat(lev)}x</Text></View>
              </View>
              <View style={s.resultGrid}>
                <ResultCard label="Risk Amount"      value={calc ? fmtUSD(calc.riskAmount)  : "—"} accent />
                <ResultCard label="Pip Cost"         value={calc ? fmtUSD(calc.pipCost)     : "—"} sub="per pip (current lots)" />
                <ResultCard label="Trade Value"      value={calc ? fmtUSD(calc.tradeValue)  : "—"} />
                <ResultCard label="Margin Req."      value={calc ? fmtUSD(calc.marginReq)   : "—"} warn={calc?.highMargin} />
                <ResultCard label="Est. Loss (SL)"   value={calc ? fmtUSD(calc.estLoss)     : "—"} warn={!!calc}
                  sub={`${slPips} pips × ${fmt(calc?.pipCost ?? 0, 2)} pip value`} />
                <ResultCard label="Est. Profit (TP)" value={calc ? fmtUSD(calc.estProfit)   : "—"} accent={!!calc}
                  sub={`${tpPips} pips × ${fmt(calc?.pipCost ?? 0, 2)} pip value`} />
                <ResultCard label="RR Ratio"         value={calc ? `1 : ${fmt(calc.rr, 2)}` : "—"} accent={!!calc && calc.rr >= 2} />
                <ResultCard label="Margin Used %"    value={calc ? `${fmt(calc.marginPct, 1)}%` : "—"} warn={calc?.highMargin} />
              </View>
            </View>

            {calc && calc.rr > 0 && (
              <View style={[s.rrBanner, calc.rr >= 2 ? s.rrBannerGood : s.rrBannerWarn]}>
                <Ionicons name="flash" size={15} color={calc.rr >= 2 ? "#60a5fa" : "#fbbf24"} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.rrTitle, calc.rr >= 2 ? s.rrTitleGood : s.rrTitleWarn]}>
                    {calc.rr >= 2 ? "Good RR Ratio" : calc.rr >= 1 ? "Acceptable RR" : "Poor RR — review setup"}
                  </Text>
                  <Text style={s.rrSub}>
                    1 : {fmt(calc.rr, 2)} — {calc.rr >= 2 ? "Sustainable long term" : "Consider improving TP target"}
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_PAGE },
  scroll: { padding: 16 },
  header: { marginBottom: 16 },
  h1: { fontSize: 22, fontWeight: "900", color: TEXT_PRI, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: MUTED, fontFamily: "Inter_400Regular", marginTop: 2 },
  columns: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  inputsPanel: { flex: 1, backgroundColor: BG_CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 14 },
  resultsPanel: { width: 340, gap: 10 },
  resultsPanelInner: { backgroundColor: BG_CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14 },
  row2: { flexDirection: "row", gap: 10 },
  inputGroup: { gap: 5 },
  inputLabelRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  inputLabel: { fontSize: 10, fontWeight: "700", color: MUTED, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  inputHelp: { fontSize: 10, color: "rgba(167,184,169,0.50)" },
  inputWrap: {},
  textInput: { height: 42, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, fontWeight: "500", color: TEXT_PRI, fontFamily: "Inter_500Medium", backgroundColor: BG_INPUT, borderWidth: 1, borderColor: BORDER40 },
  textInputSuffix: { paddingRight: 44 },
  suffix: { position: "absolute", right: 10, top: 0, bottom: 0, textAlignVertical: "center", fontSize: 11, color: MUTED, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  chipSm: { paddingHorizontal: 7, paddingVertical: 2 },
  chipActive: { backgroundColor: "rgba(183,255,90,0.15)", borderColor: "rgba(183,255,90,0.50)" },
  chipInactive: { backgroundColor: BG_INPUT, borderColor: BORDER },
  chipText: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold" },
  chipTextSm: { fontSize: 10, fontWeight: "700" },
  chipTextActive: { color: ACCENT },
  chipTextInactive: { color: MUTED },
  sideToggle: { flexDirection: "row", borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: BORDER, marginTop: 4, alignSelf: "flex-start" },
  sideBtn: { paddingHorizontal: 20, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 5 },
  sideBtnLong: { backgroundColor: "rgba(96,165,250,0.15)" },
  sideBtnShort: { backgroundColor: "rgba(248,113,113,0.15)" },
  sideBtnOff: { backgroundColor: BG_INPUT },
  sideBtnText: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold", textTransform: "capitalize" },
  sideBtnTextLong: { color: "#60a5fa" },
  sideBtnTextShort: { color: "#f87171" },
  sideBtnTextOff: { color: MUTED },
  liveBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(96,165,250,0.05)", borderWidth: 1, borderColor: "rgba(96,165,250,0.20)" },
  liveBannerLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#60a5fa" },
  liveLabel: { fontSize: 10, fontWeight: "700", color: "rgba(167,184,169,0.70)", textTransform: "uppercase", letterSpacing: 0.7 },
  livePrice: { fontSize: 13, fontWeight: "900", color: TEXT_PRI, fontFamily: "Inter_700Bold" },
  liveChg: { fontSize: 10, fontWeight: "700" },
  liveHint: { fontSize: 9, color: "rgba(167,184,169,0.50)" },
  liveOffline: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(57,91,67,0.20)", backgroundColor: BG_INPUT },
  liveOfflineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(167,184,169,0.30)" },
  liveOfflineText: { fontSize: 10, color: "rgba(167,184,169,0.50)" },
  pipInfo: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: BG_INPUT, borderWidth: 1, borderColor: "rgba(57,91,67,0.25)" },
  pipInfoText: { fontSize: 11, color: MUTED },
  pipInfoAccent: { color: ACCENT, fontWeight: "600" },
  warnRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.06)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" },
  warnText: { flex: 1, fontSize: 12, color: "#fca5a5", fontFamily: "Inter_400Regular" },
  amberRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(245,158,11,0.06)", borderWidth: 1, borderColor: "rgba(245,158,11,0.25)" },
  amberText: { flex: 1, fontSize: 12, color: "#fcd34d", fontFamily: "Inter_400Regular" },
  recLots: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(183,255,90,0.20)", backgroundColor: "rgba(183,255,90,0.05)" },
  recLotsLabel: { fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: "700" },
  recLotsValue: { fontSize: 16, fontWeight: "900", color: ACCENT, fontFamily: "Inter_700Bold", marginTop: 2 },
  applyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(183,255,90,0.10)", borderWidth: 1, borderColor: "rgba(183,255,90,0.30)" },
  applyBtnText: { fontSize: 11, fontWeight: "700", color: ACCENT },
  resultsHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  resultsIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: "rgba(183,255,90,0.10)", borderWidth: 1, borderColor: "rgba(183,255,90,0.20)", alignItems: "center", justifyContent: "center" },
  resultsTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: TEXT_PRI, fontFamily: "Inter_700Bold" },
  levBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: BG_INPUT, borderWidth: 1, borderColor: BORDER },
  levBadgeText: { fontSize: 10, color: MUTED },
  resultGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  resultCard: { width: "47%", borderRadius: 10, padding: 12, borderWidth: 1 },
  rcNormal: { backgroundColor: BG_INPUT, borderColor: BORDER },
  rcAccent: { backgroundColor: "rgba(183,255,90,0.06)", borderColor: "rgba(183,255,90,0.25)" },
  rcWarn: { backgroundColor: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.20)" },
  rcLabel: { fontSize: 10, fontWeight: "700", color: MUTED, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 3 },
  rcValue: { fontSize: 17, fontWeight: "900", lineHeight: 20 },
  rcValueNormal: { color: TEXT_PRI },
  rcValueAccent: { color: ACCENT },
  rcValueWarn: { color: "#f87171" },
  rcSub: { fontSize: 10, color: "rgba(167,184,169,0.70)", marginTop: 2 },
  rrBanner: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  rrBannerGood: { backgroundColor: "rgba(96,165,250,0.06)", borderColor: "rgba(96,165,250,0.25)" },
  rrBannerWarn: { backgroundColor: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.25)" },
  rrTitle: { fontSize: 12, fontWeight: "700" },
  rrTitleGood: { color: "#93c5fd" },
  rrTitleWarn: { color: "#fcd34d" },
  rrSub: { fontSize: 11, color: MUTED, marginTop: 1 },
});
