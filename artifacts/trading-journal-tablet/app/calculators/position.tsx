/**
 * app/calculators/position.tsx — Position Size Calculator
 *
 * React Native port of artifacts/trading-journal/src/pages/calc-position.tsx
 *
 * Web → RN replacements: standard
 * ALL calculation formulas preserved exactly:
 *   forex:  lotSize, positionSize, unitRisk, tpDist, estProfit, rr, tradeValue, marginReq
 *   crypto: slFrac, pricePerUnit, positionSize, tpPct, estProfit, rr, tradeValue, marginReq
 *   stocks: positionSize, unitRisk, tpDist, estProfit, rr, tradeValue, marginReq
 *   marginPct, highRisk, break-even win rate: 100/(1+rr)
 */

import React, { useMemo, useState, memo } from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — preserved exactly from source
// ─────────────────────────────────────────────────────────────────────────────

const ASSET_TYPES = [
  { key: "forex",  label: "Forex / Indices",  pipLabel: "pips",   pipHelp: "e.g. 20 pips" },
  { key: "crypto", label: "Crypto / Linear",  pipLabel: "% move", pipHelp: "e.g. 1.5%" },
  { key: "stocks", label: "Stocks / Futures", pipLabel: "$ move", pipHelp: "e.g. 2.50" },
] as const;

const RISK_PRESETS   = [0.25, 0.5, 1, 1.5, 2, 3];
const BROKER_PRESETS = [
  { label: "Conservative", risk: 0.5 },
  { label: "Standard",     risk: 1   },
  { label: "Aggressive",   risk: 2   },
];

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
// NumInput
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

// ─────────────────────────────────────────────────────────────────────────────
// ResultRow
// ─────────────────────────────────────────────────────────────────────────────

const ResultRow = memo(function ResultRow({ label, value, accent, warn, last }: {
  label: string; value: string; accent?: boolean; warn?: boolean; last?: boolean;
}) {
  return (
    <View style={[s.resultRow, !last ? s.resultRowBorder : null]}>
      <Text style={s.resultRowLabel}>{label}</Text>
      <Text style={[s.resultRowValue,
        warn ? s.resultRowWarn : accent ? s.resultRowAccent : s.resultRowNormal
      ]}>{value}</Text>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function CalcPosition() {
  const insets = useSafeAreaInsets();

  // State — mirrors web exactly
  const [assetType, setAssetType] = useState<"forex" | "crypto" | "stocks">("forex");
  const [account, setAccount]     = useState("10000");
  const [risk, setRisk]           = useState("1");
  const [pipValue, setPipValue]   = useState("10");
  const [slMove, setSlMove]       = useState("20");
  const [entry, setEntry]         = useState("1.0850");
  const [tp, setTp]               = useState("1.1050");
  const [leverage, setLeverage]   = useState("100");

  const cfg = ASSET_TYPES.find(a => a.key === assetType)!;

  // useMemo — formula preserved exactly from source
  const calc = useMemo(() => {
    const acc  = parseFloat(account)  || 0;
    const rPct = parseFloat(risk)     || 0;
    const pv   = parseFloat(pipValue) || 0;
    const slM  = parseFloat(slMove)   || 0;
    const entP = parseFloat(entry)    || 0;
    const tpP  = parseFloat(tp)       || 0;
    const lev  = parseFloat(leverage) || 1;

    const riskAmount = acc * rPct / 100;

    let positionSize = 0;
    let lotSize      = 0;
    let tpDist       = 0;
    let estProfit    = 0;
    let rr           = 0;
    let tradeValue   = 0;
    let marginReq    = 0;
    let unitRisk     = 0;

    if (assetType === "forex") {
      // forex: pv = pip value per lot, slMove = pips
      lotSize      = slM > 0 && pv > 0 ? riskAmount / (slM * pv) : 0;
      positionSize = lotSize * 100_000;
      unitRisk     = slM * pv * lotSize;
      tpDist       = Math.abs(tpP - entP) / 0.0001; // in pips (rough for EUR/USD)
      estProfit    = tpDist * pv * lotSize;
      rr           = unitRisk > 0 ? estProfit / unitRisk : 0;
      tradeValue   = lotSize * 100_000;
      marginReq    = tradeValue / lev;
    } else if (assetType === "crypto") {
      // slMove = % move, pv = price per unit
      const slFrac      = slM / 100;
      const pricePerUnit = pv;
      positionSize = slFrac > 0 && pricePerUnit > 0 ? riskAmount / (slFrac * pricePerUnit) : 0;
      unitRisk     = positionSize * slFrac * pricePerUnit;
      const tpPct  = entP > 0 ? Math.abs(tpP - entP) / entP : 0;
      estProfit    = positionSize * tpPct * pricePerUnit;
      rr           = unitRisk > 0 ? estProfit / unitRisk : 0;
      tradeValue   = positionSize * pricePerUnit;
      marginReq    = tradeValue / lev;
      lotSize      = positionSize;
    } else {
      // stocks: slMove = $ per share, pv = price per share (optional)
      positionSize = slM > 0 ? riskAmount / slM : 0;
      unitRisk     = positionSize * slM;
      tpDist       = Math.abs(tpP - entP);
      estProfit    = positionSize * tpDist;
      rr           = unitRisk > 0 ? estProfit / unitRisk : 0;
      tradeValue   = positionSize * entP;
      marginReq    = tradeValue / lev;
      lotSize      = positionSize;
    }

    const marginPct = acc > 0 ? (marginReq / acc) * 100 : 0;
    const highRisk  = rPct > 2;

    return { riskAmount, positionSize, lotSize, unitRisk, estProfit, rr, tradeValue, marginReq, marginPct, highRisk };
  }, [account, risk, pipValue, slMove, entry, tp, leverage, assetType]);

  const highRisk = parseFloat(risk) > 2;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={[s.root, { paddingTop: insets.top }]} contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={s.header}>
          <Text style={s.h1}>Position Size Calculator</Text>
          <Text style={s.subtitle}>Calculate the exact position size to risk a defined % of your account.</Text>
        </View>

        <View style={s.columns}>
          {/* ── Inputs ── */}
          <View style={s.inputsPanel}>

            {/* Asset Type */}
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Asset Type</Text>
              <View style={s.row3}>
                {ASSET_TYPES.map(a => (
                  <Pressable key={a.key} onPress={() => setAssetType(a.key)}
                    style={[s.assetBtn, assetType === a.key ? s.assetBtnActive : s.assetBtnInactive]}>
                    <Text style={[s.assetBtnText, assetType === a.key ? s.assetBtnTextActive : s.assetBtnTextInactive]}>
                      {a.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Broker presets */}
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Broker / Risk Profile</Text>
              <View style={s.row3}>
                {BROKER_PRESETS.map(b => (
                  <Pressable key={b.label} onPress={() => setRisk(String(b.risk))}
                    style={[s.brokerBtn, String(b.risk) === risk ? s.brokerBtnActive : s.brokerBtnInactive]}>
                    <Text style={[s.brokerBtnText, String(b.risk) === risk ? s.brokerBtnTextActive : s.brokerBtnTextInactive]}>
                      {b.label}
                    </Text>
                    <Text style={[s.brokerBtnSub, String(b.risk) === risk ? s.brokerBtnSubActive : s.brokerBtnSubInactive]}>
                      {b.risk}%
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Risk presets */}
            <View style={s.inputGroup}>
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

            <View style={s.row2}>
              <View style={{ flex: 1 }}><NumInput label="Account Balance" value={account} onChange={setAccount} suffix="$" /></View>
              <View style={{ flex: 1 }}><NumInput label="Risk %" value={risk} onChange={setRisk} suffix="%" /></View>
            </View>

            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <NumInput
                  label={assetType === "forex" ? "Pip Value / Lot" : assetType === "crypto" ? "Price Per Unit ($)" : "Share Price ($)"}
                  value={pipValue} onChange={setPipValue}
                  help={assetType === "forex" ? "e.g. $10 for EUR/USD" : undefined}
                  suffix={assetType === "forex" ? "$/pip" : "$"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <NumInput
                  label={`SL Distance (${cfg.pipLabel})`}
                  value={slMove} onChange={setSlMove}
                  help={cfg.pipHelp} suffix={cfg.pipLabel}
                />
              </View>
            </View>

            <View style={s.row3}>
              <View style={{ flex: 1 }}><NumInput label="Entry Price" value={entry} onChange={setEntry} /></View>
              <View style={{ flex: 1 }}><NumInput label="Take Profit" value={tp} onChange={setTp} /></View>
              <View style={{ flex: 1 }}><NumInput label="Leverage" value={leverage} onChange={setLeverage} suffix="x" /></View>
            </View>

            {highRisk && (
              <View style={s.warnRow}>
                <Ionicons name="warning" size={15} color="#f87171" />
                <Text style={s.warnText}>Risk % above 2% — high drawdown risk. Consider reducing position.</Text>
              </View>
            )}
          </View>

          {/* ── Results ── */}
          <View style={s.resultsPanel}>
            <View style={s.resultsPanelInner}>
              <View style={s.resultsHeader}>
                <View style={s.resultsIcon}>
                  <Ionicons name="locate" size={14} color={ACCENT} />
                </View>
                <Text style={s.resultsTitle}>Position Sizing Result</Text>
              </View>

              {/* Hero result */}
              <View style={s.hero}>
                <View>
                  <Text style={s.heroLabel}>
                    {assetType === "forex" ? "Recommended Lot Size" : "Recommended Position"}
                  </Text>
                  <Text style={s.heroValue}>
                    {assetType === "forex"
                      ? fmt(calc.lotSize, 2)
                      : fmt(calc.positionSize, assetType === "crypto" ? 4 : 0)}
                  </Text>
                  <Text style={s.heroUnit}>
                    {assetType === "forex" ? "lots" : assetType === "crypto" ? "units" : "shares"}
                  </Text>
                </View>
                <Ionicons name="radio-button-on" size={32} color="rgba(183,255,90,0.30)" />
              </View>

              <ResultRow label="Risk Amount ($)"     value={fmtUSD(calc.riskAmount)}  accent />
              <ResultRow label="Estimated Loss"      value={fmtUSD(calc.unitRisk)}    warn />
              <ResultRow label="Estimated Profit"    value={fmtUSD(calc.estProfit)}   accent />
              <ResultRow label="Risk / Reward"       value={`1 : ${fmt(calc.rr, 2)}`} accent={calc.rr >= 2} />
              <ResultRow label="Trade Value"         value={fmtUSD(calc.tradeValue)} />
              <ResultRow label="Margin Required"     value={fmtUSD(calc.marginReq)}   warn={calc.marginPct > 20} />
              <ResultRow label="Margin Used %"       value={`${fmt(calc.marginPct, 1)}%`} warn={calc.marginPct > 20} last />
            </View>

            {/* Break-even suggestion — preserved exactly from source */}
            {calc.lotSize > 0 && (
              <View style={s.breakEven}>
                <View>
                  <Text style={s.breakEvenSub}>Break-even win rate for {fmt(calc.rr, 1)}:1 RR</Text>
                  <Text style={s.breakEvenValue}>
                    {calc.rr > 0 ? fmt(100 / (1 + calc.rr), 1) : "—"}%
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(183,255,90,0.40)" />
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
  resultsPanel: { width: 320, gap: 10 },
  resultsPanelInner: { backgroundColor: BG_CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16 },
  row2: { flexDirection: "row", gap: 10 },
  row3: { flexDirection: "row", gap: 8 },
  inputGroup: { gap: 5 },
  inputLabelRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  inputLabel: { fontSize: 10, fontWeight: "700", color: MUTED, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  inputHelp: { fontSize: 10, color: "rgba(167,184,169,0.50)" },
  inputWrap: {},
  textInput: { height: 42, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, fontWeight: "500", color: TEXT_PRI, fontFamily: "Inter_500Medium", backgroundColor: BG_INPUT, borderWidth: 1, borderColor: BORDER40 },
  textInputSuffix: { paddingRight: 52 },
  suffix: { position: "absolute", right: 10, top: 0, bottom: 0, textAlignVertical: "center", fontSize: 11, color: MUTED, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  chipActive: { backgroundColor: "rgba(183,255,90,0.15)", borderColor: "rgba(183,255,90,0.50)" },
  chipInactive: { backgroundColor: BG_INPUT, borderColor: BORDER },
  chipText: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold" },
  chipTextActive: { color: ACCENT },
  chipTextInactive: { color: MUTED },
  assetBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  assetBtnActive: { backgroundColor: "rgba(183,255,90,0.12)", borderColor: "rgba(183,255,90,0.40)" },
  assetBtnInactive: { backgroundColor: BG_INPUT, borderColor: BORDER },
  assetBtnText: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  assetBtnTextActive: { color: ACCENT },
  assetBtnTextInactive: { color: MUTED },
  brokerBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  brokerBtnActive: { backgroundColor: "rgba(183,255,90,0.12)", borderColor: "rgba(183,255,90,0.40)" },
  brokerBtnInactive: { backgroundColor: BG_INPUT, borderColor: BORDER },
  brokerBtnText: { fontSize: 11, fontWeight: "700" },
  brokerBtnTextActive: { color: ACCENT },
  brokerBtnTextInactive: { color: MUTED },
  brokerBtnSub: { fontSize: 10, marginTop: 1 },
  brokerBtnSubActive: { color: "rgba(183,255,90,0.60)" },
  brokerBtnSubInactive: { color: "rgba(167,184,169,0.60)" },
  warnRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.06)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" },
  warnText: { flex: 1, fontSize: 12, color: "#fca5a5", fontFamily: "Inter_400Regular" },
  resultsHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  resultsIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: "rgba(183,255,90,0.10)", borderWidth: 1, borderColor: "rgba(183,255,90,0.20)", alignItems: "center", justifyContent: "center" },
  resultsTitle: { fontSize: 13, fontWeight: "700", color: TEXT_PRI, fontFamily: "Inter_700Bold" },
  hero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(183,255,90,0.08)", borderWidth: 1, borderColor: "rgba(183,255,90,0.25)", borderRadius: 10, padding: 14, marginBottom: 12 },
  heroLabel: { fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: "700", marginBottom: 4 },
  heroValue: { fontSize: 28, fontWeight: "900", color: ACCENT, fontFamily: "Inter_700Bold", lineHeight: 30 },
  heroUnit: { fontSize: 11, color: "rgba(167,184,169,0.70)", marginTop: 3 },
  resultRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  resultRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(57,91,67,0.20)" },
  resultRowLabel: { fontSize: 13, color: MUTED, fontFamily: "Inter_400Regular" },
  resultRowValue: { fontSize: 14, fontWeight: "900" },
  resultRowNormal: { color: TEXT_PRI },
  resultRowAccent: { color: ACCENT },
  resultRowWarn: { color: "#f87171" },
  breakEven: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "rgba(183,255,90,0.20)", backgroundColor: "rgba(183,255,90,0.05)" },
  breakEvenSub: { fontSize: 11, color: MUTED },
  breakEvenValue: { fontSize: 15, fontWeight: "900", color: ACCENT, fontFamily: "Inter_700Bold" },
});
