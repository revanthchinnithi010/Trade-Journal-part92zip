/**
 * BrokerConnectBottomSheet — React Native port of
 *   src/components/broker/BrokerConnectModal.tsx  (and BrokerAuthModal.tsx re-export)
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. Modal overlay + full-screen page → @gorhom/bottom-sheet BottomSheetModal.
 *    The web has two presentation modes (MobileBrokerConnectPage / DesktopBrokerConnectModal).
 *    On the tablet there is one: a BottomSheetModal that opens/dismisses based on
 *    the store's `showAuthModal` flag.  Snap points ["65%", "92%"] cover both short
 *    and tall broker forms.
 *
 * 2. localStorage → AsyncStorage
 *    The MT5 token is saved via AsyncStorage (awaited).
 *
 * 3. Relative fetch → getApiBase() prefix
 *    fetch("/api/broker-accounts", …) → fetch(`${getApiBase()}/api/broker-accounts`, …)
 *
 * 4. React.FormEvent → plain async function
 *    handleMt5Connect no longer takes a form event argument; it is called
 *    directly from the submit Pressable's onPress.
 *
 * 5. credentials: "include" → removed (not applicable in RN).
 *
 * 6. Lucide icons → Ionicons (@expo/vector-icons)
 *    CheckCircle2→checkmark-circle, XCircle→close-circle-outline,
 *    Loader2→ActivityIndicator, RefreshCw→refresh-outline,
 *    Eye/EyeOff→eye-outline/eye-off-outline,
 *    Server→server-outline, ShieldCheck→shield-checkmark-outline,
 *    Wifi→wifi-outline, ChevronLeft→chevron-back, X→close.
 *
 * 7. HTML elements → RN: div→View, p/h2/span→Text, input→TextInput,
 *    button→Pressable, scrollable div→BottomSheetScrollView.
 *
 * 8. useIsMobile → removed.  The bottom sheet covers both size cases.
 *
 * All business logic preserved exactly:
 *   - useBrokerConnect hook (authBrokerId, broker lookup, status machine,
 *     MT5 credentials state, handleMt5Connect, closeAuthModal, openSelectModal)
 *   - BrokerFormContent: Delta path (DeltaApiConnectForm) + MT5 path
 *   - SuccessBanner: green checkmark, broker name, Done button
 *   - Mt5CredentialsForm: Server, Login, Password, Label fields, error banner,
 *     Retry + Connect buttons, show-password toggle, loading state
 *   - Security badges (AES-256, Backend-only signing, Live WS sync)
 *
 * Exports:
 *   BrokerConnectBottomSheet  — main export
 *   BrokerAuthBottomSheet     — alias (API parity with web BrokerAuthModal)
 */

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BrokerLogo } from "@/components/broker/BrokerLogos";
import { DeltaApiConnectForm } from "@/components/broker/DeltaApiConnectForm";
import { BROKERS } from "@/types/broker";
import { useBrokerStore } from "@/store/brokerStore";
import type { BrokerAccount } from "@/types/broker";
import { getApiBase } from "@/lib/apiBase";

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = "idle" | "loading" | "success" | "error";

const LS_TOKEN_PREFIX = "tj_broker_token_";

// ── Shared logic hook ─────────────────────────────────────────────────────────

function useBrokerConnect() {
  const {
    authBrokerId, closeAuthModal, openSelectModal, loadAccounts, connect,
  } = useBrokerStore();

  const broker = BROKERS.find(b => b.id === authBrokerId);

  const [status,       setStatus]       = useState<Status>("idle");
  const [errorMsg,     setErrorMsg]     = useState("");
  const [mt5Server,    setMt5Server]    = useState("");
  const [mt5Login,     setMt5Login]     = useState("");
  const [mt5Password,  setMt5Password]  = useState("");
  const [mt5Label,     setMt5Label]     = useState("");
  const [showMt5Pass,  setShowMt5Pass]  = useState(false);

  // Reset form state whenever the broker changes
  useEffect(() => {
    setStatus("idle");
    setErrorMsg("");
    setMt5Server("");
    setMt5Login("");
    setMt5Password("");
    setMt5Label("");
    setShowMt5Pass(false);
  }, [authBrokerId]);

  async function handleMt5Connect() {
    if (!mt5Server.trim() || !mt5Login.trim() || !mt5Password.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`${getApiBase()}/api/broker-accounts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          broker_id:    "mt5",
          mt5_server:   mt5Server.trim(),
          mt5_login:    mt5Login.trim(),
          mt5_password: mt5Password.trim(),
          label:        mt5Label.trim() || "MT5 Account",
        }),
      });
      const data = await res.json() as {
        ok: boolean; account?: BrokerAccount; api_token?: string; error?: string;
      };
      if (!data.ok || !data.account || !data.api_token) {
        setStatus("error");
        setErrorMsg(data.error ?? "Connection failed");
        return;
      }
      try {
        await AsyncStorage.setItem(`${LS_TOKEN_PREFIX}${data.account.id}`, data.api_token);
      } catch { /* ignore */ }
      setStatus("success");
      await loadAccounts();
      setTimeout(() => {
        connect({ ...data.account!, api_token: data.api_token! });
        closeAuthModal();
      }, 1200);
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
    }
  }

  return {
    broker, status, setStatus, errorMsg, setErrorMsg,
    mt5Server, setMt5Server, mt5Login, setMt5Login,
    mt5Password, setMt5Password, mt5Label, setMt5Label,
    showMt5Pass, setShowMt5Pass,
    handleMt5Connect,
    closeAuthModal, openSelectModal,
  };
}

// ── Security badges row ───────────────────────────────────────────────────────

const SECURITY_BADGES = [
  { icon: "shield-checkmark-outline" as const, label: "AES-256 encrypted" },
  { icon: "server-outline"            as const, label: "Backend-only signing" },
  { icon: "wifi-outline"              as const, label: "Live WS sync" },
];

function SecurityBadges() {
  return (
    <View style={styles.badgesRow}>
      {SECURITY_BADGES.map(({ icon, label }) => (
        <View key={label} style={styles.badgeItem}>
          <Ionicons name={icon} size={12} color="rgba(0,255,180,0.7)" />
          <Text style={styles.badgeText}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Shared broker form content ────────────────────────────────────────────────

function BrokerFormContent({
  broker, status, setStatus, errorMsg, setErrorMsg,
  mt5Server, setMt5Server, mt5Login, setMt5Login,
  mt5Password, setMt5Password, mt5Label, setMt5Label,
  showMt5Pass, setShowMt5Pass,
  handleMt5Connect,
  onDone,
}: ReturnType<typeof useBrokerConnect> & { onDone: () => void }) {
  if (!broker) return null;

  return (
    <View style={styles.formContent}>
      <SecurityBadges />

      {/* Delta */}
      {broker.id === "delta" && (
        status === "success"
          ? <SuccessBanner broker={broker} onClose={onDone} />
          : <DeltaApiConnectForm
              onSuccess={onDone}
              onError={msg => { setStatus("error"); setErrorMsg(msg); }}
            />
      )}

      {/* MT5 */}
      {broker.id === "mt5" && (
        status === "success"
          ? <SuccessBanner broker={broker} onClose={onDone} />
          : <Mt5CredentialsForm
              status={status} errorMsg={errorMsg}
              mt5Server={mt5Server}      setMt5Server={setMt5Server}
              mt5Login={mt5Login}        setMt5Login={setMt5Login}
              mt5Password={mt5Password}  setMt5Password={setMt5Password}
              mt5Label={mt5Label}        setMt5Label={setMt5Label}
              showPass={showMt5Pass}     setShowPass={setShowMt5Pass}
              onSubmit={handleMt5Connect}
              onRetry={() => { setStatus("idle"); setErrorMsg(""); }}
            />
      )}

      {/* cTrader — no API key form; handled by OAuth in a separate flow */}
      {broker.id === "ctrader" && (
        <View style={styles.ctraderPlaceholder}>
          <Ionicons name="information-circle-outline" size={24} color="rgba(59,130,246,0.6)" />
          <Text style={styles.ctraderText}>
            cTrader uses OAuth via Spotware. Open the cTrader widget to connect.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Main bottom sheet ─────────────────────────────────────────────────────────

export function BrokerConnectBottomSheet() {
  const { showAuthModal, authBrokerId, closeAuthModal } = useBrokerStore();
  const ctx = useBrokerConnect();

  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints     = useMemo(() => ["65%", "92%"], []);

  // Bridge store flag → imperative present/dismiss
  useEffect(() => {
    if (showAuthModal && authBrokerId) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [showAuthModal, authBrokerId]);

  const handleDismiss = useCallback(() => {
    closeAuthModal();
  }, [closeAuthModal]);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.72}
      pressBehavior="close"
    />
  ), []);

  const broker = ctx.broker;

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      index={1}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      {/* Sheet header */}
      <View style={styles.sheetHeader}>
        <Pressable
          onPress={() => { ctx.closeAuthModal(); ctx.openSelectModal(); }}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.8)" />
        </Pressable>

        {broker ? (
          <View style={styles.brokerMeta}>
            <View style={styles.brokerLogoWrap}>
              <BrokerLogo brokerId={broker.id} size={30} />
            </View>
            <View>
              <Text style={styles.brokerName}>Connect {broker.name}</Text>
              <Text style={styles.brokerDesc}>{broker.description}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.brokerName}>Connect Broker</Text>
        )}

        <Pressable
          onPress={ctx.closeAuthModal}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
        </Pressable>
      </View>

      {/* Top accent line */}
      {broker && (
        <View
          style={[
            styles.accentLine,
            { backgroundColor: broker.color + "60" },
          ]}
        />
      )}

      {/* Form content */}
      <BottomSheetScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <BrokerFormContent {...ctx} onDone={ctx.closeAuthModal} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ── Alias export (web API parity: BrokerAuthModal → BrokerAuthBottomSheet) ─────
export { BrokerConnectBottomSheet as BrokerAuthBottomSheet };

// ── Success banner ────────────────────────────────────────────────────────────

const SuccessBanner = memo(function SuccessBanner({
  broker, onClose,
}: {
  broker: { name: string };
  onClose: () => void;
}) {
  return (
    <View style={styles.successContainer}>
      <View style={styles.successIconWrap}>
        <Ionicons name="checkmark-circle" size={32} color="#00FFB4" />
      </View>
      <View style={styles.successText}>
        <Text style={styles.successTitle}>Connected to {broker.name}</Text>
        <Text style={styles.successSub}>Syncing positions, orders &amp; balance…</Text>
      </View>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [styles.successBtn, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.successBtnText}>Done</Text>
      </Pressable>
    </View>
  );
});

// ── MT5 credentials form ──────────────────────────────────────────────────────

interface Mt5FormProps {
  status: Status;
  errorMsg: string;
  mt5Server: string;   setMt5Server:   (v: string) => void;
  mt5Login: string;    setMt5Login:    (v: string) => void;
  mt5Password: string; setMt5Password: (v: string) => void;
  mt5Label: string;    setMt5Label:    (v: string) => void;
  showPass: boolean;   setShowPass:    (v: boolean) => void;
  onSubmit: () => void;
  onRetry:  () => void;
}

function Mt5CredentialsForm({
  status, errorMsg,
  mt5Server, setMt5Server, mt5Login, setMt5Login,
  mt5Password, setMt5Password, mt5Label, setMt5Label,
  showPass, setShowPass, onSubmit, onRetry,
}: Mt5FormProps) {
  const isLoading = status === "loading";

  return (
    <View style={styles.mt5Form}>
      <View style={styles.mt5Fields}>
        {/* Server */}
        <View style={styles.mt5FieldGroup}>
          <Text style={styles.mt5Label}>SERVER</Text>
          <TextInput
            value={mt5Server}
            onChangeText={setMt5Server}
            placeholder="e.g. MetaQuotes-Demo"
            placeholderTextColor="rgba(255,255,255,0.25)"
            editable={!isLoading}
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.mt5Input}
          />
        </View>

        {/* Login */}
        <View style={styles.mt5FieldGroup}>
          <Text style={styles.mt5Label}>LOGIN</Text>
          <TextInput
            value={mt5Login}
            onChangeText={setMt5Login}
            placeholder="Account number"
            placeholderTextColor="rgba(255,255,255,0.25)"
            editable={!isLoading}
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="numeric"
            style={styles.mt5Input}
          />
        </View>

        {/* Password */}
        <View style={styles.mt5FieldGroup}>
          <Text style={styles.mt5Label}>PASSWORD</Text>
          <View style={styles.mt5PasswordRow}>
            <TextInput
              value={mt5Password}
              onChangeText={setMt5Password}
              placeholder="Account password"
              placeholderTextColor="rgba(255,255,255,0.25)"
              editable={!isLoading}
              secureTextEntry={!showPass}
              autoCorrect={false}
              autoCapitalize="none"
              style={[styles.mt5Input, { flex: 1 }]}
            />
            <Pressable
              onPress={() => setShowPass(!showPass)}
              hitSlop={8}
              style={styles.mt5EyeBtn}
            >
              <Ionicons
                name={showPass ? "eye-off-outline" : "eye-outline"}
                size={14}
                color="rgba(255,255,255,0.4)"
              />
            </Pressable>
          </View>
        </View>

        {/* Label (optional) */}
        <View style={styles.mt5FieldGroup}>
          <Text style={styles.mt5Label}>
            LABEL{" "}
            <Text style={styles.mt5LabelOptional}>(optional)</Text>
          </Text>
          <TextInput
            value={mt5Label}
            onChangeText={setMt5Label}
            placeholder="My MT5 Account"
            placeholderTextColor="rgba(255,255,255,0.25)"
            editable={!isLoading}
            style={styles.mt5Input}
          />
        </View>
      </View>

      {/* Error banner */}
      {status === "error" && (
        <View style={styles.mt5ErrorBox}>
          <Ionicons
            name="close-circle-outline"
            size={15}
            color="#EF4444"
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          <Text style={styles.mt5ErrorText}>{errorMsg}</Text>
        </View>
      )}

      {/* Buttons */}
      <View style={styles.mt5Buttons}>
        {status === "error" && (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="refresh-outline" size={13} color="rgba(255,255,255,0.6)" />
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onSubmit}
          disabled={isLoading}
          style={({ pressed }) => [
            styles.mt5SubmitBtn,
            isLoading && styles.mt5SubmitBtnDisabled,
            pressed && !isLoading && { opacity: 0.85 },
          ]}
        >
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" style={{ marginRight: 8 }} />
              <Text style={styles.mt5SubmitBtnTextDisabled}>Connecting…</Text>
            </>
          ) : (
            <Text style={styles.mt5SubmitBtnText}>Connect MT5</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Bottom sheet ───────────────────────────────────────────────────────────
  sheetBackground: {
    backgroundColor: "#0B1017",
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    borderWidth:   1,
    borderColor:   "rgba(255,255,255,0.08)",
  },
  handleIndicator: {
    backgroundColor: "rgba(255,255,255,0.18)",
    width: 40,
  },

  // ── Sheet header ───────────────────────────────────────────────────────────
  sheetHeader: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            12,
    paddingHorizontal: 16,
    paddingVertical:   14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backBtn: {
    width:           36,
    height:          36,
    borderRadius:    10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems:      "center",
    justifyContent:  "center",
    flexShrink:      0,
  },
  brokerMeta: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           10,
    flex:          1,
  },
  brokerLogoWrap: {
    width:          30,
    height:         30,
    borderRadius:   8,
    flexShrink:     0,
    overflow:       "hidden",
    alignItems:     "center",
    justifyContent: "center",
  },
  brokerName: {
    fontSize:   15,
    fontWeight: "700",
    color:      "#fff",
    lineHeight: 18,
  },
  brokerDesc: {
    fontSize:  11,
    color:     "rgba(167,184,169,0.5)",
    marginTop: 2,
  },
  closeBtn: {
    padding:    6,
    flexShrink: 0,
  },
  accentLine: {
    height: 1,
  },

  // ── Scroll content ─────────────────────────────────────────────────────────
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop:        20,
    paddingBottom:     40,
  },

  // ── Form content wrapper ───────────────────────────────────────────────────
  formContent: {
    gap: 20,
  },

  // ── Security badges ────────────────────────────────────────────────────────
  badgesRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           16,
    flexWrap:      "wrap",
  },
  badgeItem: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
  },
  badgeText: {
    fontSize: 12,
    color:    "rgba(255,255,255,0.35)",
  },

  // ── cTrader placeholder ────────────────────────────────────────────────────
  ctraderPlaceholder: {
    alignItems:     "center",
    justifyContent: "center",
    gap:            12,
    paddingVertical: 32,
  },
  ctraderText: {
    fontSize:  13,
    color:     "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 18,
  },

  // ── Success banner ─────────────────────────────────────────────────────────
  successContainer: {
    alignItems:     "center",
    gap:            16,
    paddingVertical: 32,
  },
  successIconWrap: {
    width:           64,
    height:          64,
    borderRadius:    32,
    backgroundColor: "rgba(0,255,180,0.1)",
    borderWidth:     1.5,
    borderColor:     "rgba(0,255,180,0.3)",
    alignItems:      "center",
    justifyContent:  "center",
  },
  successText: {
    alignItems: "center",
    gap:        6,
  },
  successTitle: {
    fontSize:   15,
    fontWeight: "600",
    color:      "#00FFB4",
    textAlign:  "center",
  },
  successSub: {
    fontSize:  13,
    color:     "rgba(255,255,255,0.45)",
    textAlign: "center",
  },
  successBtn: {
    marginTop:         8,
    paddingHorizontal: 20,
    paddingVertical:   8,
    borderRadius:      10,
    backgroundColor:   "rgba(0,255,180,0.1)",
    borderWidth:       1,
    borderColor:       "rgba(0,255,180,0.25)",
  },
  successBtnText: {
    fontSize:   13,
    fontWeight: "500",
    color:      "#00FFB4",
  },

  // ── MT5 form ───────────────────────────────────────────────────────────────
  mt5Form: {
    gap: 14,
  },
  mt5Fields: {
    gap: 10,
  },
  mt5FieldGroup: {
    gap: 5,
  },
  mt5Label: {
    fontSize:      11,
    fontWeight:    "600",
    color:         "rgba(255,255,255,0.45)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  mt5LabelOptional: {
    color:      "rgba(255,255,255,0.25)",
    fontWeight: "400",
  },
  mt5Input: {
    height:          40,
    paddingHorizontal: 12,
    borderRadius:    9,
    fontSize:        13,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.10)",
    color:           "#fff",
  },
  mt5PasswordRow: {
    flexDirection: "row",
    alignItems:    "center",
  },
  mt5EyeBtn: {
    position: "absolute",
    right:    10,
    padding:  4,
  },
  mt5ErrorBox: {
    flexDirection:   "row",
    alignItems:      "flex-start",
    gap:             8,
    padding:         12,
    borderRadius:    10,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth:     1,
    borderColor:     "rgba(239,68,68,0.2)",
  },
  mt5ErrorText: {
    flex:       1,
    fontSize:   13,
    color:      "#EF4444",
    lineHeight: 18,
  },
  mt5Buttons: {
    flexDirection: "row",
    gap:           10,
  },
  retryBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             6,
    paddingHorizontal: 16,
    paddingVertical:   10,
    borderRadius:    10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.08)",
  },
  retryBtnText: {
    fontSize:   13,
    color:      "rgba(255,255,255,0.6)",
  },
  mt5SubmitBtn: {
    flex:            1,
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    paddingVertical: 14,
    borderRadius:    12,
    backgroundColor: "#22C55E",
  },
  mt5SubmitBtnDisabled: {
    backgroundColor: "rgba(34,197,94,0.2)",
  },
  mt5SubmitBtnText: {
    fontSize:   14,
    fontWeight: "600",
    color:      "#fff",
  },
  mt5SubmitBtnTextDisabled: {
    fontSize:   14,
    fontWeight: "600",
    color:      "rgba(255,255,255,0.4)",
  },
});
