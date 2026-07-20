/**
 * app/calculators/margin.tsx — Margin Calculator
 *
 * React Native port of artifacts/trading-journal/src/pages/calc-margin.tsx
 *
 * Web → RN replacements: standard (div→View, span→Text, button→Pressable, input→TextInput)
 * Gauge component: CSS width% + boxShadow → View with width style + no shadow
 * ALL calculation formulas preserved exactly:
 *   equity, tradeVal, margin, freeMargin, marginLvl, usedPct,
 *   pipVal, pipsToMC, pipsToSO, status ("safe"|"warning"|"danger")
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

const INSTRUMENTS = [
  { key: "forex",   label: "Forex",      lotValue: 100_000, pip: 0.0001 },
  { key: "gold",    label: "Gold (XAU)", lotValue: 100,     pip: 0.1   },
  { key: "indices", label: "Indices",    lotValue: 1,       pip: 1     },
  { key: "crypto",  label: "Crypto",     lotValue: 1,       pip: 1     },
];

const LEV_PRESETS = [10, 20, 30, 50, 100, 200, 500];

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
// Gauge — preserved from source; CSS width%→View style width; color logic identical
// ─────────────────────────────────────────────────────────────────────────────

function Gauge({ pct, label }: { pct: number; label: string }) {
  const capped = Math.min(pct, 100);
  const color  = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : ACCENT;
  return (
    <View style={s.gauge}>
      <View style={s.gaugeHeader}>
        <Text style={s.gaugeLabel}>{label}</Text>
        <Text style={[s.gaugePct, { color }]}>{fmt(pct, 1)}%</Text>
      </View>
      <View style={s.gaugeTrack}>
        <View style={[s.gaugeFill, { width: `${capped}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function CalcMargin() {
  const insets = useSafeAreaInsets();

  // State — mirrors web exactly
  const [instrument, setInstrument] = useState("forex");
  const [balance, setBalance]       = useState("10000");
  const [openPnl, setOpenPnl]       = useState("0");
  const [price, setPrice]           = useState("1.0850");
  const [lots, setLots]             = useState("0.1");
  const [lev, setLev]               = useState("100");
  const [marginCallLev, setMcLev]   = useState("100");
  const [stopOutLev, setSoLev]      = useState("50");

  const inst = INSTRUMENTS.find(i => i.key === instrument)!;

  // useMemo — formula preserved exactly from source
  const calc = useMemo(() => {
    const bal      = parseFloat(balance)       || 0;
    const pnl      = parseFloat(openPnl)       || 0;
    const priceN   = parseFloat(price)         || 0;
    const lotsN    = parseFloat(lots)          || 0;
    const leverage = parseFloat(lev)           || 1;
    const mcLev    = parseFloat(marginCallLev) || 100;
    const soLev    = parseFloat(stopOutLev)    || 50;

    const equity     = bal + pnl;
    const tradeVal   = lotsN * inst.lotValue * priceN;
    const margin     = leverage > 0 ? tradeVal / leverage : 0;
    const freeMargin = equity - margin;
    const marginLvl  = margin > 0 ? (equity / margin) * 100 : Infinity;
    const usedPct    = equity > 0 ? (margin / equity) * 100 : 0;

    // How many pips to margin call — preserved exactly
    const pipVal   = lotsN * inst.lotValue * inst.pip;
    const pipsToMC = pipVal > 0 && mcLev > 0
      ? (equity - margin * mcLev / 100) / pipVal
      : 0;
    const pipsToSO = pipVal > 0 && soLev > 0
      ? (equity - margin * soLev / 100) / pipVal
      : 0;

    const status: "safe" | "warning" | "danger" =
      marginLvl < soLev  ? "danger"
      : marginLvl < mcLev ? "warning"
      : "safe";

    return { equity, tradeVal, margin, freeMargin, marginLvl, usedPct, pipsToMC, pipsToSO, status };
  }, [balance, openPnl, price, lots, lev, marginCallLev, stopOutLev, inst]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={[s.root, { paddingTop: insets.top }]} contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={s.header}>
          <Text style={s.h1}>Margin Calculator</Text>
          <Text style={s.subtitle}>Calculate margin requirements, free margin, and margin level.</Text>
        </View>

        <View style={s.columns}>
          {/* ── Inputs ── */}
          <View style={s.inputsPanel}>

            {/* Instrument type */}
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>Instrument Type</Text>
              <View style={s.chipRow}>
                {INSTRUMENTS.map(i => (
                  <Pressable key={i.key} onPress={() => setInstrument(i.key)}
                    style={[s.chip, i.key === instrument ? s.chipActive : s.chipInactive]}>
                    <Text style={[s.chipText, i.key === instrument ? s.chipTextActive : s.chipTextInactive]}>{i.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Leverage presets */}
            <View style={s.inputGroup}>
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

            <View style={s.row2}>
              <View style={{ flex: 1 }}><NumInput label="Account Balance" value={balance} onChange={setBalance} suffix="$" /></View>
              <View style={{ flex: 1 }}><NumInput label="Open PnL" value={openPnl} onChange={setOpenPnl} suffix="$" help="unrealized" /></View>
            </View>
            <View style={s.row2}>
              <View style={{ flex: 1 }}><NumInput label="Current Price" value={price} onChange={setPrice} /></View>
              <View style={{ flex: 1 }}><NumInput label="Lot Size" value={lots} onChange={setLots} suffix="lots" /></View>
            </View>
            <View style={s.row2}>
              <View style={{ flex: 1 }}><NumInput label="Margin Call Level %" value={marginCallLev} onChange={setMcLev} suffix="%" /></View>
              <View style={{ flex: 1 }}><NumInput label="Stop Out Level %" value={stopOutLev} onChange={setSoLev} suffix="%" /></View>
            </View>

            {/* Gauge */}
            <View style={{ gap: 14, paddingTop: 4 }}>
              <Gauge pct={calc.usedPct} label="Margin Usage" />
              <Gauge pct={Math.min(calc.marginLvl, 300)} label={`Margin Level (${fmt(calc.marginLvl, 0)}%)`} />
            </View>

            {/* Status */}
            {calc.status === "danger" && (
              <View style={s.warnRow}>
                <Ionicons name="shield" size={15} color="#f87171" />
                <Text style={s.warnText}>Stop-out imminent — position may be auto-closed by broker!</Text>
              </View>
            )}
            {calc.status === "warning" && (
              <View style={s.amberRow}>
                <Ionicons name="warning" size={15} color="#fbbf24" />
                <Text style={s.amberText}>Margin Call level reached — deposit more funds or reduce position.</Text>
              </View>
            )}
            {calc.status === "safe" && calc.margin > 0 && (
              <View style={s.safeRow}>
                <Ionicons name="shield-checkmark" size={15} color="rgba(237,240,246,0.50)" />
                <Text style={s.safeText}>Margin level is healthy. Monitor if market moves against you.</Text>
              </View>
            )}
          </View>

          {/* ── Results ── */}
          <View style={s.resultsPanel}>
            <View style={s.resultsPanelInner}>
              <View style={s.resultsHeader}>
                <View style={s.resultsIcon}>
                  <Ionicons name="layers" size={14} color={ACCENT} />
                </View>
                <Text style={s.resultsTitle}>Margin Breakdown</Text>
              </View>

              {/* Row list — mirrors web exactly */}
              {[
                { label: "Equity",          value: fmtUSD(calc.equity),          accent: true,  warn: false },
                { label: "Trade Value",      value: fmtUSD(calc.tradeVal),        accent: false, warn: false },
                { label: "Margin Required",  value: fmtUSD(calc.margin),          accent: false, warn: false },
                { label: "Free Margin",      value: fmtUSD(calc.freeMargin),      accent: false, warn: calc.freeMargin < 0 },
                { label: "Margin Level",     value: `${fmt(calc.marginLvl, 0)}%`, accent: false, warn: calc.status !== "safe" },
                { label: "Margin Used",      value: `${fmt(calc.usedPct, 1)}%`,   accent: false, warn: calc.usedPct > 50 },
                { label: "Pips to MC",       value: calc.pipsToMC > 0 ? fmt(calc.pipsToMC, 1) : "N/A", accent: false, warn: calc.pipsToMC < 20 && calc.pipsToMC > 0 },
                { label: "Pips to Stop-Out", value: calc.pipsToSO > 0 ? fmt(calc.pipsToSO, 1) : "N/A", accent: false, warn: calc.pipsToSO < 10 && calc.pipsToSO > 0 },
              ].map((r, idx, arr) => (
                <View key={r.label} style={[s.resultRow, idx < arr.length - 1 ? s.resultRowBorder : null]}>
                  <Text style={s.resultRowLabel}>{r.label}</Text>
                  <Text style={[s.resultRowValue,
                    r.warn   ? s.resultRowWarn :
                    r.accent ? s.resultRowAccent : s.resultRowNormal
                  ]}>{r.value}</Text>
                </View>
              ))}
            </View>
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
  resultsPanel: { width: 340 },
  resultsPanelInner: { backgroundColor: BG_CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16 },
  row2: { flexDirection: "row", gap: 10 },
  inputGroup: { gap: 5 },
  inputLabelRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  inputLabel: { fontSize: 10, fontWeight: "700", color: MUTED, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  inputHelp: { fontSize: 10, color: "rgba(167,184,169,0.50)" },
  inputWrap: {},
  textInput: { height: 42, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, fontWeight: "500", color: TEXT_PRI, fontFamily: "Inter_500Medium", backgroundColor: BG_INPUT, borderWidth: 1, borderColor: BORDER40 },
  textInputSuffix: { paddingRight: 44 },
  suffix: { position: "absolute", right: 10, top: 0, bottom: 0, textAlignVertical: "center", fontSize: 11, color: MUTED, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  chipActive: { backgroundColor: "rgba(183,255,90,0.12)", borderColor: "rgba(183,255,90,0.40)" },
  chipInactive: { backgroundColor: BG_INPUT, borderColor: BORDER },
  chipText: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold" },
  chipTextActive: { color: ACCENT },
  chipTextInactive: { color: MUTED },
  gauge: { gap: 6 },
  gaugeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  gaugeLabel: { fontSize: 11, fontWeight: "700", color: MUTED, textTransform: "uppercase", letterSpacing: 0.7 },
  gaugePct: { fontSize: 13, fontWeight: "900" },
  gaugeTrack: { height: 8, backgroundColor: BG_INPUT, borderRadius: 4, overflow: "hidden", borderWidth: 1, borderColor: "rgba(57,91,67,0.25)" },
  gaugeFill: { height: "100%", borderRadius: 4 },
  warnRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.06)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" },
  warnText: { flex: 1, fontSize: 12, color: "#fca5a5", fontFamily: "Inter_400Regular" },
  amberRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(245,158,11,0.06)", borderWidth: 1, borderColor: "rgba(245,158,11,0.25)" },
  amberText: { flex: 1, fontSize: 12, color: "#fcd34d", fontFamily: "Inter_400Regular" },
  safeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  safeText: { flex: 1, fontSize: 12, color: "rgba(237,240,246,0.60)", fontFamily: "Inter_400Regular" },
  resultsHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  resultsIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: "rgba(183,255,90,0.10)", borderWidth: 1, borderColor: "rgba(183,255,90,0.20)", alignItems: "center", justifyContent: "center" },
  resultsTitle: { fontSize: 13, fontWeight: "700", color: TEXT_PRI, fontFamily: "Inter_700Bold" },
  resultRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  resultRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(57,91,67,0.20)" },
  resultRowLabel: { fontSize: 13, color: MUTED, fontFamily: "Inter_400Regular" },
  resultRowValue: { fontSize: 14, fontWeight: "900" },
  resultRowNormal: { color: TEXT_PRI },
  resultRowAccent: { color: ACCENT },
  resultRowWarn: { color: "#f87171" },
});
