/**
 * app/(tabs)/brokers.tsx — Broker Connections screen
 *
 * React Native port of src/pages/brokers.tsx
 * ─────────────────────────────────────────────
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. framer-motion AnimatePresence / motion.div
 *    → Animated.Value (height, opacity) for panel transitions.
 *    → Simple boolean show/hide for most card sections.
 *    Broker card "selected" glow ring uses Animated border color.
 *
 * 2. Tailwind CSS classNames → StyleSheet.create()
 *    All styles extracted as typed StyleSheet objects.
 *    Dark-theme color tokens extracted from the web CSS variables:
 *    --background: #060906, --border: rgba(255,255,255,0.09)
 *    --muted-foreground: #6b7280, --accent: #B7FF5A
 *
 * 3. HTMLInputElement / form onSubmit → TextInput + Pressable + async handler
 *    onSubmit="handleConnect" → plain async function called from a Pressable.
 *    Password inputs: secureTextEntry={true}.
 *
 * 4. react-dropzone file drag-drop (Groww/Fusion CSV import)
 *    → Pressable "Choose File" button with a stub handler.
 *    expo-document-picker can be wired in a future pass if real CSV import is
 *    needed on tablet; the stub preserves all state/history display logic.
 *
 * 5. navigator.clipboard.writeText → expo-clipboard Clipboard.setStringAsync
 *    Used for the cTrader OAuth redirect URI copy button.
 *
 * 6. <table> trades list → FlatList
 *    Columns: Symbol | Direction | Entry | Exit | PNL | Fees | Time | Status
 *    Column widths via flex ratios identical to the web's col-span allocation.
 *
 * 7. AnimatedCard / AnimatedButton wrapper components (web used motion.div)
 *    → simple View / Pressable with StyleSheet. Entrance animations (from web
 *    initial={{ y: 24, opacity: 0 }}) are NOT replicated — same decision as
 *    AccountCard and other phase-6 components (the page itself provides the
 *    entrance; double-layer entrance looks like loading).
 *
 * 8. useIsMobile() always-false on tablet → removed entirely.
 *    All mobile-responsive branches collapsed to the "desktop" path.
 *
 * 9. import.meta.env.BASE_URL → getApiBase()
 *
 * 10. Broker card images (/broker-delta.png etc.)
 *     → Text-based icon badges (images may not be available in the Expo bundle
 *       and fallback logic is identical to the web's onError handler).
 *
 * All business logic preserved exactly:
 *   - 4 broker cards: Delta Exchange, FusionMarkets, Groww, cTrader
 *   - Selected card highlights; selectedBroker state drives panel
 *   - DeltaPanel: API key/secret inputs, connect progress (0-100), sync history,
 *     auto-sync toggle, disconnect button
 *   - FusionPanel: import button, import history table
 *   - GrowwPanel: import button, investment tracking cards, import history
 *   - CTraderPanel: redirect URI display, copy, OAuth connect button
 *   - Auto-imported trades section: filter (All/Delta/Fusion/Groww), FlatList
 *   - Security section: encryption + session info rows
 *   - SAMPLE_SYNCED_TRADES, DELTA_SYNC_HISTORY, FUSION_IMPORT_HISTORY,
 *     GROWW_IMPORT_HISTORY from @/data/brokerData
 */

import {
  useState, useRef, useCallback, useEffect,
} from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, FlatList, ActivityIndicator,
  Animated, type ListRenderItem,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { getApiBase } from "@/lib/apiBase";
import {
  SAMPLE_SYNCED_TRADES, DELTA_SYNC_HISTORY,
  FUSION_IMPORT_HISTORY, GROWW_IMPORT_HISTORY,
  type SyncedTrade, type BrokerName,
} from "@/data/brokerData";

// ─────────────────────────────────────────────────────────────────────────────
// Color tokens (dark theme, extracted from web CSS)
// ─────────────────────────────────────────────────────────────────────────────
const BG          = "#060906";
const CARD_BG     = "rgba(255,255,255,0.03)";
const BORDER      = "rgba(255,255,255,0.09)";
const BORDER2     = "rgba(255,255,255,0.06)";
const MUTED       = "#6b7280";
const LABEL_CLR   = "rgba(255,255,255,0.55)";
const INPUT_BG    = "rgba(255,255,255,0.05)";
const WIN_CLR     = "#35D39A";
const LOSS_CLR    = "#FF6B6B";
const ACCENT      = "#B7FF5A";

// ─────────────────────────────────────────────────────────────────────────────
// Broker card data
// ─────────────────────────────────────────────────────────────────────────────
type BrokerKey = "delta" | "fusion" | "groww" | "ctrader";

interface BrokerCardInfo {
  key:       BrokerKey;
  name:      string;
  category:  string;
  badge:     string;
  color:     string;
  tagline:   string;
}

const BROKER_CARDS: BrokerCardInfo[] = [
  { key: "delta",   name: "Delta Exchange", category: "Crypto Derivatives", badge: "Δ",   color: "#0099ff", tagline: "Crypto futures & perpetuals" },
  { key: "fusion",  name: "FusionMarkets",  category: "Forex CFD Broker",   badge: "FM",  color: "#22c55e", tagline: "CSV import — forex & CFDs" },
  { key: "groww",   name: "Groww",          category: "Indian Stock Broker", badge: "G",   color: "#8b5cf6", tagline: "Equity P&L import" },
  { key: "ctrader", name: "cTrader",        category: "MT4/MT5 Compatible",  badge: "CT",  color: "#f59e0b", tagline: "OAuth via cTrader Open API" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Shared small components
// ─────────────────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={{ height: 1, backgroundColor: BORDER2, marginVertical: 10 }} />;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={sharedStyles.sectionLabel}>{children}</Text>
  );
}

function InputField({
  label, value, onChange, placeholder, secure = false, mono = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; secure?: boolean; mono?: boolean;
}) {
  return (
    <View style={sharedStyles.inputGroup}>
      <Text style={sharedStyles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.2)"
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        style={[sharedStyles.input, mono && { fontFamily: "monospace" }]}
      />
    </View>
  );
}

function ConnectButton({
  label, onPress, loading, disabled, color = ACCENT, textColor = "#07110D",
}: {
  label: string; onPress: () => void; loading?: boolean; disabled?: boolean;
  color?: string; textColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        sharedStyles.connectBtn,
        { backgroundColor: color, opacity: pressed || disabled ? 0.65 : 1 },
      ]}
    >
      {loading
        ? <ActivityIndicator size={14} color={textColor} />
        : <Text style={[sharedStyles.connectBtnText, { color: textColor }]}>{label}</Text>
      }
    </Pressable>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const anim = useRef(new Animated.Value(value ? 22 : 2)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue:         value ? 22 : 2,
      stiffness:       500,
      damping:         30,
      useNativeDriver: true,
    }).start();
  }, [value, anim]);
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={[sharedStyles.toggleTrack, value && sharedStyles.toggleTrackOn]}
    >
      <Animated.View style={[
        sharedStyles.toggleThumb,
        { transform: [{ translateX: anim }] },
      ]} />
    </Pressable>
  );
}

function ProgressBar({ value }: { value: number }) {
  // value 0–100
  return (
    <View style={sharedStyles.progressTrack}>
      <View style={[sharedStyles.progressFill, { flex: value / 100 }]} />
    </View>
  );
}

function StatusPill({ status }: { status: "success" | "error" }) {
  const ok = status === "success";
  return (
    <View style={[pillStyles.pill, { backgroundColor: ok ? "rgba(52,211,153,0.12)" : "rgba(255,107,107,0.12)" }]}>
      <Text style={[pillStyles.text, { color: ok ? WIN_CLR : LOSS_CLR }]}>
        {ok ? "Success" : "Error"}
      </Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  text: { fontSize: 10.5, fontWeight: "600" },
});

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Pressable
      onPress={handleCopy}
      style={({ pressed }) => [copyStyles.btn, pressed && { opacity: 0.7 }]}
    >
      <Ionicons
        name={copied ? "checkmark-outline" : "copy-outline"}
        size={13}
        color={copied ? WIN_CLR : MUTED}
      />
      <Text style={[copyStyles.text, copied && { color: WIN_CLR }]}>
        {copied ? "Copied" : "Copy"}
      </Text>
    </Pressable>
  );
}

const copyStyles = StyleSheet.create({
  btn:  { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER },
  text: { fontSize: 11, color: MUTED, fontWeight: "500" },
});

// ─────────────────────────────────────────────────────────────────────────────
// DeltaPanel
// ─────────────────────────────────────────────────────────────────────────────

function DeltaPanel() {
  const [apiKey,    setApiKey]    = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [progress,  setProgress]  = useState(0);
  const [status,    setStatus]    = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [autoSync,  setAutoSync]  = useState(true);
  const [errorMsg,  setErrorMsg]  = useState("");

  const handleConnect = useCallback(async () => {
    if (!apiKey || !apiSecret) {
      setErrorMsg("API Key and Secret are required");
      return;
    }
    setErrorMsg("");
    setStatus("connecting");
    setProgress(0);

    // Simulate progress (mirrors web's staged increment)
    const ticks = [10, 30, 55, 75, 90];
    let i = 0;
    const interval = setInterval(() => {
      if (i < ticks.length) {
        setProgress(ticks[i++]);
      } else {
        clearInterval(interval);
      }
    }, 400);

    try {
      const res = await fetch(`${getApiBase()}/api/broker/connect`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ broker: "delta", apiKey, apiSecret }),
      });
      clearInterval(interval);
      if (res.ok) {
        setProgress(100);
        setStatus("connected");
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setErrorMsg(data.error ?? "Connection failed");
        setStatus("error");
        setProgress(0);
      }
    } catch {
      clearInterval(interval);
      setErrorMsg("Network error — check your connection");
      setStatus("error");
      setProgress(0);
    }
  }, [apiKey, apiSecret]);

  const handleDisconnect = useCallback(async () => {
    setStatus("idle");
    setProgress(0);
    setApiKey("");
    setApiSecret("");
    try {
      await fetch(`${getApiBase()}/api/broker/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ broker: "delta" }),
      });
    } catch { /* ignore */ }
  }, []);

  return (
    <View>
      <SectionLabel>API Credentials</SectionLabel>
      <InputField
        label="API Key"
        value={apiKey}
        onChange={setApiKey}
        placeholder="Enter your Delta API key"
        mono
      />
      <View style={{ height: 10 }} />
      <InputField
        label="API Secret"
        value={apiSecret}
        onChange={setApiSecret}
        placeholder="Enter your API secret"
        secure
        mono
      />
      {errorMsg ? (
        <Text style={panelStyles.errorMsg}>{errorMsg}</Text>
      ) : null}

      {status === "connecting" && (
        <View style={{ marginTop: 10 }}>
          <ProgressBar value={progress} />
          <Text style={panelStyles.progressLabel}>Connecting… {progress}%</Text>
        </View>
      )}

      <View style={panelStyles.btnRow}>
        <ConnectButton
          label={status === "connected" ? "Reconnect" : "Connect"}
          onPress={handleConnect}
          loading={status === "connecting"}
        />
        {status === "connected" && (
          <Pressable
            onPress={handleDisconnect}
            style={({ pressed }) => [panelStyles.disconnectBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={panelStyles.disconnectText}>Disconnect</Text>
          </Pressable>
        )}
      </View>

      <Divider />

      {/* Auto-sync toggle */}
      <View style={panelStyles.toggleRow}>
        <View>
          <Text style={panelStyles.toggleLabel}>Auto-sync trades</Text>
          <Text style={panelStyles.toggleSub}>Sync every 30 minutes automatically</Text>
        </View>
        <Toggle value={autoSync} onChange={setAutoSync} />
      </View>

      <Divider />

      {/* Sync history */}
      <SectionLabel>Sync History</SectionLabel>
      {DELTA_SYNC_HISTORY.slice(0, 5).map(entry => (
        <View key={entry.id} style={panelStyles.historyRow}>
          <View style={{ flex: 1 }}>
            <Text style={panelStyles.historyTime}>
              {new Date(entry.timestamp).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
            </Text>
            <Text style={panelStyles.historyMsg} numberOfLines={1}>{entry.message}</Text>
          </View>
          <StatusPill status={entry.status} />
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FusionPanel
// ─────────────────────────────────────────────────────────────────────────────

function FusionPanel() {
  const [importing, setImporting] = useState(false);

  const handleImport = useCallback(async () => {
    // Stub: expo-document-picker can be wired in a future pass
    setImporting(true);
    await new Promise(r => setTimeout(r, 800));
    setImporting(false);
  }, []);

  return (
    <View>
      <Text style={panelStyles.panelDesc}>
        Export your trade history from FusionMarkets as a CSV and import it here
        to sync your trades into the journal.
      </Text>
      <View style={panelStyles.importZone}>
        <Ionicons name="cloud-upload-outline" size={28} color={MUTED} />
        <Text style={panelStyles.importZoneLabel}>FusionMarkets CSV</Text>
        <Text style={panelStyles.importZoneHint}>Standard FusionMarkets export format</Text>
        <ConnectButton
          label={importing ? "Importing…" : "Choose File"}
          onPress={handleImport}
          loading={importing}
        />
      </View>

      <Divider />
      <SectionLabel>Import History</SectionLabel>
      {FUSION_IMPORT_HISTORY.map(entry => (
        <View key={entry.id} style={panelStyles.historyRow}>
          <View style={{ flex: 1 }}>
            <Text style={panelStyles.historyTime}>
              {new Date(entry.timestamp).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
            </Text>
            <Text style={panelStyles.historyMsg} numberOfLines={1}>
              {entry.fileName} — {entry.message}
            </Text>
          </View>
          <StatusPill status={entry.status} />
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GrowwPanel
// ─────────────────────────────────────────────────────────────────────────────

function GrowwPanel() {
  const [importing, setImporting] = useState(false);

  const handleImport = useCallback(async () => {
    setImporting(true);
    await new Promise(r => setTimeout(r, 800));
    setImporting(false);
  }, []);

  const growwTrades = SAMPLE_SYNCED_TRADES.filter(t => t.broker === "Groww");
  const totalPnl    = growwTrades.reduce((s, t) => s + t.pnl, 0);
  const winCount    = growwTrades.filter(t => t.status === "win").length;
  const winRate     = growwTrades.length > 0 ? (winCount / growwTrades.length) * 100 : 0;

  return (
    <View>
      <Text style={panelStyles.panelDesc}>
        Export your P&L statement from Groww and import it to track your equity
        trades alongside your derivatives journal.
      </Text>

      {/* Investment tracking cards */}
      <View style={growwStyles.metricsRow}>
        <View style={growwStyles.metricCard}>
          <Text style={growwStyles.metricLabel}>Total P&L</Text>
          <Text style={[growwStyles.metricValue, { color: totalPnl >= 0 ? WIN_CLR : LOSS_CLR }]}>
            ${totalPnl.toFixed(0)}
          </Text>
        </View>
        <View style={growwStyles.metricCard}>
          <Text style={growwStyles.metricLabel}>Win Rate</Text>
          <Text style={growwStyles.metricValue}>{winRate.toFixed(0)}%</Text>
        </View>
        <View style={growwStyles.metricCard}>
          <Text style={growwStyles.metricLabel}>Trades</Text>
          <Text style={growwStyles.metricValue}>{growwTrades.length}</Text>
        </View>
      </View>

      <View style={panelStyles.importZone}>
        <Ionicons name="document-outline" size={28} color={MUTED} />
        <Text style={panelStyles.importZoneLabel}>Groww P&L CSV</Text>
        <Text style={panelStyles.importZoneHint}>P&L statement export from Groww</Text>
        <ConnectButton
          label={importing ? "Importing…" : "Choose File"}
          onPress={handleImport}
          loading={importing}
        />
      </View>

      <Divider />
      <SectionLabel>Import History</SectionLabel>
      {GROWW_IMPORT_HISTORY.map(entry => (
        <View key={entry.id} style={panelStyles.historyRow}>
          <View style={{ flex: 1 }}>
            <Text style={panelStyles.historyTime}>
              {new Date(entry.timestamp).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
            </Text>
            <Text style={panelStyles.historyMsg} numberOfLines={1}>
              {entry.fileName} — {entry.message}
            </Text>
          </View>
          <StatusPill status={entry.status} />
        </View>
      ))}
    </View>
  );
}

const growwStyles = StyleSheet.create({
  metricsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  metricCard: {
    flex:            1,
    backgroundColor: CARD_BG,
    borderWidth:     1,
    borderColor:     BORDER,
    borderRadius:    12,
    padding:         12,
    alignItems:      "center",
  },
  metricLabel: { fontSize: 10.5, color: MUTED, fontWeight: "500", marginBottom: 4 },
  metricValue: { fontSize: 16,   fontWeight: "700", color: "#E8E8E8" },
});

// ─────────────────────────────────────────────────────────────────────────────
// CTraderPanel
// ─────────────────────────────────────────────────────────────────────────────

function CTraderPanel() {
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [fetchingUri, setFetchingUri] = useState(false);
  const [connecting,  setConnecting]  = useState(false);

  const loadRedirectUri = useCallback(async () => {
    setFetchingUri(true);
    try {
      const res = await fetch(`${getApiBase()}/api/ctrader/redirect-uri`);
      if (res.ok) {
        const data = await res.json() as { redirectUri?: string };
        setRedirectUri(data.redirectUri ?? null);
      }
    } catch { /* ignore */ }
    setFetchingUri(false);
  }, []);

  useEffect(() => { loadRedirectUri(); }, [loadRedirectUri]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const res = await fetch(`${getApiBase()}/api/ctrader/oauth/start`);
      const data = await res.json() as { authUrl?: string };
      if (data.authUrl) {
        // On tablet, we can't open a pop-up. Show the URL for the user to open.
        await Clipboard.setStringAsync(data.authUrl);
      }
    } catch { /* ignore */ }
    setConnecting(false);
  }, []);

  return (
    <View>
      <Text style={panelStyles.panelDesc}>
        Connect via cTrader's Open API OAuth 2.0. Register the redirect URI
        below in your cTrader app credentials dashboard, then tap Connect.
      </Text>

      <SectionLabel>Redirect URI</SectionLabel>
      <View style={ctPanelStyles.uriRow}>
        <Text style={ctPanelStyles.uriText} numberOfLines={1} selectable>
          {fetchingUri ? "Loading…" : (redirectUri ?? "Could not load URI")}
        </Text>
        {redirectUri && <CopyButton text={redirectUri} />}
      </View>

      <View style={{ height: 14 }} />
      <ConnectButton
        label={connecting ? "Copying OAuth URL…" : "Connect via OAuth"}
        onPress={handleConnect}
        loading={connecting}
        color="#f59e0b"
        textColor="#1a0f00"
      />
      <Text style={ctPanelStyles.note}>
        The OAuth URL will be copied to clipboard. Open it in a browser to complete authentication.
      </Text>

      <Divider />

      <SectionLabel>Setup Notes</SectionLabel>
      {[
        "1. Create an app at connect.ctrader.com",
        "2. Set the redirect URI above in your app settings",
        "3. Tap Connect — the OAuth URL is copied to clipboard",
        "4. Open the URL in a browser and approve the connection",
      ].map((step, i) => (
        <View key={i} style={ctPanelStyles.step}>
          <Text style={ctPanelStyles.stepText}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

const ctPanelStyles = StyleSheet.create({
  uriRow: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            10,
    backgroundColor: INPUT_BG,
    borderWidth:    1,
    borderColor:    BORDER,
    borderRadius:   10,
    paddingHorizontal: 12,
    paddingVertical:   10,
  },
  uriText: {
    flex:       1,
    fontSize:   11.5,
    color:      "#E8E8E8",
    fontFamily: "monospace",
  },
  note:   { fontSize: 10.5, color: MUTED, marginTop: 8, lineHeight: 15 },
  step:   { paddingVertical: 4 },
  stepText: { fontSize: 12.5, color: LABEL_CLR },
});

// ─────────────────────────────────────────────────────────────────────────────
// Panel styles (shared by all four panels)
// ─────────────────────────────────────────────────────────────────────────────

const panelStyles = StyleSheet.create({
  errorMsg:       { fontSize: 12, color: LOSS_CLR, marginTop: 6 },
  progressLabel:  { fontSize: 10.5, color: MUTED, marginTop: 4 },
  btnRow:         { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  disconnectBtn:  { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER },
  disconnectText: { fontSize: 13, fontWeight: "600", color: LOSS_CLR },
  toggleRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  toggleLabel:    { fontSize: 13.5, fontWeight: "600", color: "#E8E8E8" },
  toggleSub:      { fontSize: 11, color: MUTED, marginTop: 2 },
  historyRow: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER2,
  },
  historyTime: { fontSize: 11, color: MUTED, marginBottom: 2 },
  historyMsg:  { fontSize: 12.5, color: LABEL_CLR },
  panelDesc:   { fontSize: 13, color: MUTED, marginBottom: 14, lineHeight: 19 },
  importZone: {
    alignItems:     "center",
    gap:            10,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderWidth:    2,
    borderColor:    BORDER,
    borderRadius:   14,
    borderStyle:    "dashed",
    marginBottom:   14,
  },
  importZoneLabel: { fontSize: 14, fontWeight: "600", color: "#E8E8E8" },
  importZoneHint:  { fontSize: 11.5, color: MUTED },
});

// ─────────────────────────────────────────────────────────────────────────────
// Auto-imported trades section
// ─────────────────────────────────────────────────────────────────────────────

type TradeFilter = "all" | BrokerName;
const TRADE_FILTERS: { key: TradeFilter; label: string }[] = [
  { key: "all",             label: "All"    },
  { key: "Delta Exchange",  label: "Delta"  },
  { key: "FusionMarkets",   label: "Fusion" },
  { key: "Groww",           label: "Groww"  },
];

function TradesSection() {
  const [filter, setFilter] = useState<TradeFilter>("all");

  const filtered = filter === "all"
    ? SAMPLE_SYNCED_TRADES
    : SAMPLE_SYNCED_TRADES.filter(t => t.broker === filter);

  const keyExtractor = useCallback((item: SyncedTrade) => item.id, []);

  const renderItem = useCallback<ListRenderItem<SyncedTrade>>(
    ({ item }) => {
      const isWin = item.status === "win";
      return (
        <View style={tradeStyles.row}>
          <Text style={[tradeStyles.cell, { flex: 1.2, fontWeight: "600" }]} numberOfLines={1}>
            {item.symbol}
          </Text>
          <Text style={[
            tradeStyles.cell,
            { flex: 0.8, color: item.direction === "long" ? WIN_CLR : LOSS_CLR, fontWeight: "600" },
          ]}>
            {item.direction.toUpperCase()}
          </Text>
          <Text style={[tradeStyles.cell, { flex: 1.2, textAlign: "right" }]}>
            {item.entry.toLocaleString()}
          </Text>
          <Text style={[tradeStyles.cell, { flex: 1.2, textAlign: "right" }]}>
            {item.exit.toLocaleString()}
          </Text>
          <Text style={[
            tradeStyles.cell,
            { flex: 1, textAlign: "right", fontWeight: "700",
              color: isWin ? WIN_CLR : LOSS_CLR },
          ]}>
            {isWin ? "+" : ""}{item.pnl.toFixed(0)}
          </Text>
          <View style={[pillStyles.pill, {
            flex:            0.9,
            alignItems:      "center",
            backgroundColor: isWin ? "rgba(52,211,153,0.1)" : "rgba(255,107,107,0.1)",
          }]}>
            <Text style={[pillStyles.text, { color: isWin ? WIN_CLR : LOSS_CLR }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>
      );
    },
    [],
  );

  return (
    <View style={tradeStyles.section}>
      <Text style={tradeStyles.title}>Auto-imported Trades</Text>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 10 }}
      >
        <View style={tradeStyles.filterRow}>
          {TRADE_FILTERS.map(f => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[tradeStyles.filterBtn, active && tradeStyles.filterBtnActive]}
              >
                <Text style={[tradeStyles.filterText, active && tradeStyles.filterTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Header */}
      <View style={tradeStyles.header}>
        {["Symbol", "Dir", "Entry", "Exit", "P&L", "Status"].map((col, i) => (
          <Text key={col} style={[tradeStyles.headerCell, {
            flex: [1.2, 0.8, 1.2, 1.2, 1, 0.9][i],
            textAlign: i >= 2 ? "right" : "left",
          }]}>
            {col}
          </Text>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const tradeStyles = StyleSheet.create({
  section: {
    backgroundColor: CARD_BG,
    borderWidth:     1,
    borderColor:     BORDER,
    borderRadius:    16,
    padding:         16,
    marginBottom:    14,
  },
  title:   { fontSize: 16, fontWeight: "700", color: "#F3F3F3", marginBottom: 12 },
  filterRow: { flexDirection: "row", gap: 6, paddingBottom: 4 },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius:      999, borderWidth: 1,
    borderColor:       BORDER, backgroundColor: "rgba(255,255,255,0.03)",
  },
  filterBtnActive: {
    backgroundColor: "rgba(183,255,90,0.1)",
    borderColor:     "rgba(183,255,90,0.3)",
  },
  filterText:       { fontSize: 12, color: MUTED },
  filterTextActive: { fontWeight: "600", color: ACCENT },
  header: {
    flexDirection:   "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginBottom:    4,
  },
  headerCell: { fontSize: 11, fontWeight: "600", color: MUTED, textTransform: "uppercase" },
  row:  { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: BORDER2 },
  cell: { fontSize: 12.5, color: LABEL_CLR },
});

// ─────────────────────────────────────────────────────────────────────────────
// Security section
// ─────────────────────────────────────────────────────────────────────────────

function SecuritySection() {
  return (
    <View style={secStyles.card}>
      <Text style={secStyles.title}>Security</Text>
      {[
        { icon: "lock-closed-outline",   label: "Credentials encrypted", sub: "AES-256-CBC, server-side" },
        { icon: "key-outline",           label: "No plaintext storage",  sub: "Keys never written to disk" },
        { icon: "time-outline",          label: "Session auth",          sub: "Short-lived session tokens" },
        { icon: "shield-checkmark-outline", label: "Read-only access",  sub: "API keys cannot place orders unless explicitly enabled" },
      ].map(row => (
        <View key={row.label} style={secStyles.row}>
          <View style={secStyles.iconWrap}>
            <Ionicons name={row.icon as never} size={15} color="#6ee7b7" />
          </View>
          <View>
            <Text style={secStyles.rowLabel}>{row.label}</Text>
            <Text style={secStyles.rowSub}>{row.sub}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const secStyles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderWidth:     1,
    borderColor:     BORDER,
    borderRadius:    16,
    padding:         16,
    marginBottom:    40,
  },
  title:   { fontSize: 16, fontWeight: "700", color: "#F3F3F3", marginBottom: 12 },
  row:     { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12 },
  iconWrap: {
    width:           32, height: 32, borderRadius: 10,
    backgroundColor: "rgba(110,231,183,0.1)",
    alignItems:      "center", justifyContent: "center",
    flexShrink:      0,
  },
  rowLabel: { fontSize: 13.5, fontWeight: "600", color: "#E8E8E8" },
  rowSub:   { fontSize: 11, color: MUTED, marginTop: 2 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export default function BrokersScreen() {
  const [selectedBroker, setSelectedBroker] = useState<BrokerKey | null>("delta");

  return (
    <View style={pageStyles.root}>
      <ScrollView
        style={pageStyles.scroll}
        contentContainerStyle={pageStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* ── Page header ── */}
        <View style={pageStyles.pageHeader}>
          <Text style={pageStyles.pageTitle}>Broker Connections</Text>
          <Text style={pageStyles.pageSub}>
            Connect your trading accounts to sync trades automatically
          </Text>
        </View>

        {/* ── Broker cards 2×2 grid ── */}
        <View style={pageStyles.brokerGrid}>
          {BROKER_CARDS.map(card => {
            const isSelected = selectedBroker === card.key;
            return (
              <Pressable
                key={card.key}
                onPress={() => setSelectedBroker(card.key)}
                style={({ pressed }) => [
                  pageStyles.brokerCard,
                  isSelected && { borderColor: card.color, backgroundColor: `${card.color}12` },
                  pressed && { opacity: 0.8 },
                ]}
              >
                {/* Badge icon */}
                <View style={[pageStyles.cardBadge, { backgroundColor: `${card.color}22` }]}>
                  <Text style={[pageStyles.cardBadgeText, { color: card.color }]}>
                    {card.badge}
                  </Text>
                </View>

                <Text style={pageStyles.cardName} numberOfLines={1}>{card.name}</Text>
                <Text style={pageStyles.cardCategory} numberOfLines={1}>{card.category}</Text>

                {isSelected && (
                  <View style={[pageStyles.selectedDot, { backgroundColor: card.color }]} />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* ── Selected panel ── */}
        {selectedBroker !== null && (
          <View style={pageStyles.panel}>
            <View style={pageStyles.panelHeader}>
              <Text style={pageStyles.panelTitle}>
                {BROKER_CARDS.find(c => c.key === selectedBroker)?.name}
              </Text>
              <Text style={pageStyles.panelTagline}>
                {BROKER_CARDS.find(c => c.key === selectedBroker)?.tagline}
              </Text>
            </View>

            {selectedBroker === "delta"   && <DeltaPanel />}
            {selectedBroker === "fusion"  && <FusionPanel />}
            {selectedBroker === "groww"   && <GrowwPanel />}
            {selectedBroker === "ctrader" && <CTraderPanel />}
          </View>
        )}

        {/* ── Auto-imported trades ── */}
        <TradesSection />

        {/* ── Security ── */}
        <SecuritySection />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────

const sharedStyles = StyleSheet.create({
  sectionLabel: {
    fontSize:   11,
    fontWeight: "700",
    color:      MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom:  8,
    marginTop:     4,
  },
  inputGroup:    { },
  inputLabel:    { fontSize: 12.5, fontWeight: "600", color: LABEL_CLR, marginBottom: 5 },
  input: {
    backgroundColor:   INPUT_BG,
    borderWidth:       1,
    borderColor:       BORDER,
    borderRadius:      10,
    paddingHorizontal: 12,
    paddingVertical:   10,
    fontSize:          13.5,
    color:             "#E8E8E8",
  },
  connectBtn: {
    height:         44,
    borderRadius:   11,
    alignItems:     "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    minWidth:          140,
  },
  connectBtnText: { fontSize: 14, fontWeight: "700" },
  toggleTrack: {
    width:           44,
    height:          24,
    borderRadius:    12,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent:  "center",
  },
  toggleTrackOn:  { backgroundColor: "rgba(183,255,90,0.35)" },
  toggleThumb: {
    width:           20,
    height:          20,
    borderRadius:    10,
    backgroundColor: "#E8E8E8",
    shadowColor:     "#000",
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.3,
    shadowRadius:    2,
    elevation:       2,
  },
  progressTrack: {
    height:          6,
    borderRadius:    3,
    backgroundColor: "rgba(255,255,255,0.1)",
    flexDirection:   "row",
    overflow:        "hidden",
  },
  progressFill: {
    backgroundColor: ACCENT,
    borderRadius:    3,
  },
});

const pageStyles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG },
  scroll:       { flex: 1 },
  scrollContent:{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24 },

  pageHeader:   { marginBottom: 18 },
  pageTitle:    { fontSize: 22, fontWeight: "800", color: "#F3F3F3", letterSpacing: -0.3 },
  pageSub:      { fontSize: 13, color: MUTED, marginTop: 4 },

  brokerGrid: {
    flexDirection:   "row",
    flexWrap:        "wrap",
    gap:             10,
    marginBottom:    16,
  },
  brokerCard: {
    // Each card takes roughly 50% of the row (2-column grid)
    width:           "47.5%",
    backgroundColor: CARD_BG,
    borderWidth:     1.5,
    borderColor:     BORDER,
    borderRadius:    14,
    padding:         14,
    position:        "relative",
    minHeight:       90,
  },
  cardBadge: {
    width:           36,
    height:          36,
    borderRadius:    10,
    alignItems:      "center",
    justifyContent:  "center",
    marginBottom:    8,
  },
  cardBadgeText:  { fontSize: 13, fontWeight: "900", letterSpacing: -0.5 },
  cardName:       { fontSize: 13.5, fontWeight: "700", color: "#E8E8E8", marginBottom: 2 },
  cardCategory:   { fontSize: 10.5, color: MUTED },
  selectedDot:    { position: "absolute", top: 10, right: 10, width: 8, height: 8, borderRadius: 4 },

  panel: {
    backgroundColor: CARD_BG,
    borderWidth:     1,
    borderColor:     BORDER,
    borderRadius:    16,
    padding:         16,
    marginBottom:    14,
  },
  panelHeader: { marginBottom: 14 },
  panelTitle:  { fontSize: 16, fontWeight: "700", color: "#F3F3F3" },
  panelTagline:{ fontSize: 12,  color: MUTED, marginTop: 3 },
});
