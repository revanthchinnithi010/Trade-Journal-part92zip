/**
 * app/calculators/risk.tsx — Risk Calculator
 *
 * React Native port of artifacts/trading-journal/src/pages/calc-risk.tsx
 *
 * Web → RN replacements:
 *   PageTransition / AnimatedCard / AnimatedList /
 *   AnimatedListItem / NumberCounter / AnimatedButton → View / Pressable
 *   (animation wrappers removed per tablet pattern)
 *   cn() → inline conditional styles
 *   grid grid-cols-[1fr_1fr] → flexDirection:"row" two-column layout
 *
 * ALL calculation formulas preserved exactly:
 *   riskAmt, profitAmt, breakEven, breakEvenPct
 *   Consecutive loss simulation: compound balance erosion loop (up to min(lossN,20))
 *     loss[i] = runBalance * rPct/100; runBalance -= loss; drawdown = (bal-runBalance)/bal*100
 *   winsNeeded = ceil((bal*dTarget/100) / profitAmt)
 *   tradesNeeded = ceil(winsNeeded / breakEven)
 *   ruinPct = (q/winRate)^(100/rPct)  [simplified formula]
 *   maxDrawdown from last lossRow
 *   Recovery table: recovery = dd/(100-dd)*100 for dd in [5,10,15,20,25,30,40,50]
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

const RISK_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3];
const RR_PRESETS   = [1, 1.5, 2, 2.5, 3, 4];

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

const NumInput = memo(function NumInput({ label, value, onChange, suffix }: {
  label: string; value: string; onChange: (v: string) => void; suffix?: string;
}) {
  return (
    <View style={s.inputGroup}>
      <Text style={s.inputLabel}>{label}</Text>
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
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function CalcRisk() {
  const insets = useSafeAreaInsets();

  // State — mirrors web exactly
  const [balance, setBalance]         = useState("10000");
  const [risk, setRisk]               = useState("1");
  const [rr, setRr]                   = useState("2");
  const [losses, setLosses]           = useState("5");
  const [dailyTarget, setDailyTarget] = useState("3");

  // useMemo — formula preserved exactly from source
  const calc = useMemo(() => {
    const bal    = parseFloat(balance)      || 0;
    const rPct   = parseFloat(risk)         || 0;
    const rrN    = parseFloat(rr)           || 1;
    const lossN  = parseFloat(losses)       || 0;
    const dTarget= parseFloat(dailyTarget)  || 0;

    const riskAmt      = bal * rPct / 100;
    const profitAmt    = riskAmt * rrN;
    const breakEven    = 1 / (1 + rrN);
    const breakEvenPct = breakEven * 100;

    // Consecutive loss simulation — preserved exactly
    let runBalance = bal;
    const lossRows: { n: number; bal: number; loss: number; drawdown: number }[] = [];
    for (let i = 1; i <= Math.min(lossN, 20); i++) {
      const loss = runBalance * rPct / 100;
      runBalance -= loss;
      lossRows.push({ n: i, bal: runBalance, loss, drawdown: ((bal - runBalance) / bal) * 100 });
    }

    // Daily target scenarios — preserved exactly
    const winsNeeded   = dTarget > 0 && riskAmt > 0 ? Math.ceil((bal * dTarget / 100) / profitAmt) : 0;
    const tradesNeeded = dTarget > 0 ? Math.ceil(winsNeeded / breakEven) : 0;

    // Risk of ruin approximation — preserved exactly (simplified formula)
    const winRate    = breakEven;
    const q          = 1 - winRate;
    const ruinPct    = Math.pow(q / winRate, 100 / rPct);
    const maxDrawdown = lossRows.length > 0 ? lossRows[lossRows.length - 1].drawdown : 0;

    return { riskAmt, profitAmt, breakEvenPct, lossRows, winsNeeded, tradesNeeded, maxDrawdown, ruinPct };
  }, [balance, risk, rr, losses, dailyTarget]);

  const highRisk = parseFloat(risk) > 2;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={[s.root, { paddingTop: insets.top }]} contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={s.header}>
          <Text style={s.h1}>Risk Calculator</Text>
          <Text style={s.subtitle}>Model drawdown scenarios, break-even rates, and daily targets.</Text>
        </View>

        <View style={s.columns}>
          {/* ── Left: Inputs + Key Metrics ── */}
          <View style={s.leftCol}>

            {/* Input card */}
            <View style={s.card}>
              <NumInput label="Account Balance" value={balance} onChange={setBalance} suffix="$" />

              {/* Risk per trade with presets */}
              <View style={s.inputGroup}>
                <Text style={s.inputLabel}>Risk Per Trade</Text>
                <View style={s.chipRow}>
                  {RISK_PRESETS.map(p => (
                    <Pressable key={p} onPress={() => setRisk(String(p))}
                      style={[s.chip, String(p) === risk ? s.chipActive : s.chipInactive]}>
                      <Text style={[s.chipText, String(p) === risk ? s.chipTextActive : s.chipTextInactive]}>{p}%</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={[s.inputWrap, { marginTop: 6 }]}>
                  <TextInput style={[s.textInput, s.textInputSuffix]}
                    value={risk} onChangeText={setRisk}
                    keyboardType="numeric" returnKeyType="done" placeholderTextColor={MUTED} />
                  <Text style={s.suffix}>%</Text>
                </View>
              </View>

              {/* Risk:Reward with presets */}
              <View style={s.inputGroup}>
                <Text style={s.inputLabel}>Risk : Reward</Text>
                <View style={s.chipRow}>
                  {RR_PRESETS.map(p => (
                    <Pressable key={p} onPress={() => setRr(String(p))}
                      style={[s.chip, String(p) === rr ? s.chipActive : s.chipInactive]}>
                      <Text style={[s.chipText, String(p) === rr ? s.chipTextActive : s.chipTextInactive]}>1:{p}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={[s.inputWrap, { marginTop: 6 }]}>
                  <TextInput style={[s.textInput, s.textInputSuffix]}
                    value={rr} onChangeText={setRr}
                    keyboardType="numeric" returnKeyType="done" placeholderTextColor={MUTED} />
                  <Text style={s.suffix}>R</Text>
                </View>
              </View>

              <View style={s.row2}>
                <View style={{ flex: 1 }}><NumInput label="Consecutive Losses" value={losses} onChange={setLosses} suffix="trades" /></View>
                <View style={{ flex: 1 }}><NumInput label="Daily Target %" value={dailyTarget} onChange={setDailyTarget} suffix="%" /></View>
              </View>

              {highRisk && (
                <View style={s.warnRow}>
                  <Ionicons name="warning" size={15} color="#f87171" />
                  <Text style={s.warnText}>Risk above 2% accelerates drawdown exponentially. Professional traders use 0.5–1%.</Text>
                </View>
              )}
            </View>

            {/* Key Metrics card */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Key Metrics</Text>
              <View style={s.metricsGrid}>
                {[
                  { label: "Risk Per Trade",    value: fmtUSD(calc.riskAmt),           accent: false, warn: false },
                  { label: "Profit Per Win",    value: fmtUSD(calc.profitAmt),          accent: true,  warn: false },
                  { label: "Break-Even Rate",   value: `${fmt(calc.breakEvenPct, 1)}%`, accent: false, warn: false },
                  { label: "Max Drawdown",      value: `${fmt(calc.maxDrawdown, 1)}%`,  accent: false, warn: calc.maxDrawdown > 15 },
                  { label: "Wins for Target",   value: `${calc.winsNeeded} wins`,        accent: true,  warn: false },
                  { label: "Trades for Target", value: `~${calc.tradesNeeded} trades`,  accent: false, warn: false },
                ].map(m => (
                  <View key={m.label} style={[s.metricCard, m.warn ? s.metricCardWarn : m.accent ? s.metricCardAccent : s.metricCardNormal]}>
                    <Text style={s.metricLabel}>{m.label}</Text>
                    <Text style={[s.metricValue,
                      m.warn ? s.metricValueWarn : m.accent ? s.metricValueAccent : s.metricValueNormal
                    ]}>{m.value}</Text>
                  </View>
                ))}
              </View>
              {!highRisk && calc.riskAmt > 0 && (
                <View style={s.safeRow}>
                  <Ionicons name="shield-checkmark" size={15} color="rgba(237,240,246,0.50)" />
                  <Text style={s.safeText}>
                    Risk profile looks sustainable. Break-even at {fmt(calc.breakEvenPct, 0)}% win rate.
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Right: Simulation tables ── */}
          <View style={s.rightCol}>

            {/* Consecutive Loss Simulation */}
            <View style={s.card}>
              <View style={s.tableHeader}>
                <View style={s.tableIcon}>
                  <Ionicons name="trending-down" size={14} color="#f87171" />
                </View>
                <Text style={s.tableTitle}>Consecutive Loss Simulation</Text>
              </View>

              {/* Column headers */}
              <View style={s.tblHead}>
                {["Loss #", "Balance", "Lost", "Drawdown"].map(h => (
                  <Text key={h} style={s.tblHeadCell}>{h}</Text>
                ))}
              </View>

              {calc.lossRows.map(row => (
                <View key={row.n} style={[s.tblRow,
                  row.drawdown > 20 ? s.tblRowDanger :
                  row.drawdown > 10 ? s.tblRowWarn : null]}>
                  <Text style={s.tblCellMuted}>L{row.n}</Text>
                  <Text style={[s.tblCellBold, row.drawdown > 20 ? s.tblCellRed : s.tblCellWhite]}>{fmtUSD(row.bal)}</Text>
                  <Text style={s.tblCellRed}>-{fmtUSD(row.loss)}</Text>
                  <Text style={[s.tblCellBold,
                    row.drawdown > 20 ? s.tblCellRed :
                    row.drawdown > 10 ? s.tblCellAmber : s.tblCellMuted]}>{fmt(row.drawdown, 1)}%</Text>
                </View>
              ))}
            </View>

            {/* Recovery table — preserved exactly from source */}
            <View style={s.card}>
              <View style={s.tableHeader}>
                <View style={[s.tableIcon, { backgroundColor: "rgba(183,255,90,0.10)", borderColor: "rgba(183,255,90,0.20)" }]}>
                  <Ionicons name="analytics" size={14} color={ACCENT} />
                </View>
                <Text style={s.tableTitle}>Recovery Needed</Text>
              </View>

              <View style={s.tblHead}>
                {["Drawdown", "Loss", "Recovery Needed"].map(h => (
                  <Text key={h} style={[s.tblHeadCell, { flex: 1 }]}>{h}</Text>
                ))}
              </View>

              {[5, 10, 15, 20, 25, 30, 40, 50].map(dd => {
                const loss     = parseFloat(balance) * dd / 100;
                const recovery = dd / (100 - dd) * 100;
                return (
                  <View key={dd} style={[s.tblRow, s.tblRow3,
                    dd >= 30 ? s.tblRowDanger :
                    dd >= 20 ? s.tblRowWarn : null]}>
                    <Text style={[s.tblCellBold, s.tblCellMuted, { flex: 1 }]}>{dd}%</Text>
                    <Text style={[s.tblCellRed, { flex: 1 }]}>-{fmtUSD(loss)}</Text>
                    <Text style={[s.tblCellBold, { flex: 1 },
                      dd >= 30 ? s.tblCellRed :
                      dd >= 20 ? s.tblCellAmber : s.tblCellWhite]}>{fmt(recovery, 1)}%</Text>
                  </View>
                );
              })}
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
  leftCol:  { flex: 1, gap: 12 },
  rightCol: { flex: 1, gap: 12 },
  card: { backgroundColor: BG_CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 14 },
  row2: { flexDirection: "row", gap: 10 },
  inputGroup: { gap: 5 },
  inputLabel: { fontSize: 10, fontWeight: "700", color: MUTED, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  inputWrap: {},
  textInput: { height: 42, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, fontWeight: "500", color: TEXT_PRI, fontFamily: "Inter_500Medium", backgroundColor: BG_INPUT, borderWidth: 1, borderColor: BORDER40 },
  textInputSuffix: { paddingRight: 32 },
  suffix: { position: "absolute", right: 10, top: 0, bottom: 0, textAlignVertical: "center", fontSize: 11, color: MUTED, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  chipActive: { backgroundColor: "rgba(183,255,90,0.15)", borderColor: "rgba(183,255,90,0.50)" },
  chipInactive: { backgroundColor: BG_INPUT, borderColor: BORDER },
  chipText: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold" },
  chipTextActive: { color: ACCENT },
  chipTextInactive: { color: MUTED },
  warnRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.06)", borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" },
  warnText: { flex: 1, fontSize: 12, color: "#fca5a5", fontFamily: "Inter_400Regular" },
  safeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  safeText: { flex: 1, fontSize: 12, color: "rgba(237,240,246,0.60)", fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricCard: { width: "47%", borderRadius: 10, padding: 12, borderWidth: 1 },
  metricCardNormal: { backgroundColor: BG_INPUT, borderColor: "rgba(57,91,67,0.25)" },
  metricCardAccent: { backgroundColor: "rgba(183,255,90,0.06)", borderColor: "rgba(183,255,90,0.25)" },
  metricCardWarn: { backgroundColor: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.20)" },
  metricLabel: { fontSize: 10, fontWeight: "700", color: MUTED, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 3 },
  metricValue: { fontSize: 16, fontWeight: "900" },
  metricValueNormal: { color: TEXT_PRI },
  metricValueAccent: { color: ACCENT },
  metricValueWarn: { color: "#f87171" },
  tableHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  tableIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.10)", borderWidth: 1, borderColor: "rgba(239,68,68,0.20)", alignItems: "center", justifyContent: "center" },
  tableTitle: { fontSize: 13, fontWeight: "700", color: TEXT_PRI, fontFamily: "Inter_700Bold" },
  tblHead: { flexDirection: "row", paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  tblHeadCell: { flex: 1, fontSize: 10, fontWeight: "700", color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  tblRow: { flexDirection: "row", paddingHorizontal: 8, paddingVertical: 8, borderRadius: 8 },
  tblRow3: { flexDirection: "row" },
  tblRowDanger: { backgroundColor: "rgba(239,68,68,0.05)" },
  tblRowWarn: { backgroundColor: "rgba(245,158,11,0.04)" },
  tblCellBold: { flex: 1, fontSize: 12, fontWeight: "700" },
  tblCellMuted: { flex: 1, fontSize: 12, color: MUTED },
  tblCellWhite: { color: TEXT_PRI },
  tblCellRed: { flex: 1, fontSize: 12, color: "rgba(248,113,113,0.80)" },
  tblCellAmber: { color: "#fbbf24" },
});
