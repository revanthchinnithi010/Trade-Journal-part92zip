/**
 * DeltaApiConnectForm — React Native port of src/components/broker/DeltaApiConnectForm.tsx
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. localStorage → AsyncStorage
 *    Token persistence uses @react-native-async-storage/async-storage.
 *
 * 2. window.open + window.addEventListener("message") → expo-web-browser polling
 *    The web opens an OAuth popup and listens for a cross-window postMessage.
 *    On RN, expo-web-browser's openBrowserAsync() opens the in-app browser.
 *    After the browser is dismissed, the store polls /api/delta/oauth/pending-account
 *    to retrieve the completed OAuth result — identical auth flow, different IPC.
 *    The popupRef and message listener are removed; they have no RN equivalent.
 *
 * 3. credentials: "include" → removed
 *    React Native's fetch() has no cookie-based auth; session is via headers/tokens.
 *
 * 4. Relative fetch URLs → getApiBase() prefix
 *    All /api/… paths are prefixed with getApiBase() so fetch resolves correctly.
 *
 * 5. React.FormEvent / form onSubmit → Pressable onPress
 *    No <form> in RN; handleConnect called directly from the submit button's onPress.
 *
 * 6. Lucide icons → Ionicons (@expo/vector-icons)
 *    Key→key-outline, Lock→lock-closed-outline, Tag→pricetag-outline,
 *    Loader2→ActivityIndicator, CheckCircle2→checkmark-circle,
 *    XCircle→close-circle, ExternalLink→open-outline,
 *    Zap→flash-outline, Shield→shield-outline.
 *
 * 7. <a href> → Linking.openURL()
 *
 * 8. <input> → TextInput  |  <button> → Pressable  |  <div> → View
 *
 * All business logic is preserved exactly:
 *   - oauthConfigured + hasImported detection on mount
 *   - startDeltaOAuth flow (open browser → poll pending-account → finishOAuthConnect)
 *   - handleConnectImported (one-click imported credentials)
 *   - handleConnect (manual API key + secret form)
 *   - finishOAuthConnect: loadAccounts → connect → start WS → onSuccess
 *   - balanceInfo display after success
 *   - status: idle | connecting | success | error
 *   - canSubmit guard
 *   - errorMsg display
 */

import { useState, useEffect } from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet,
  ActivityIndicator, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useBrokerStore } from "@/store/brokerStore";
import type { BrokerAccount } from "@/types/broker";
import { getApiBase } from "@/lib/apiBase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeltaApiConnectFormProps {
  onSuccess: () => void;
  onError:   (msg: string) => void;
}

type FormStatus = "idle" | "connecting" | "success" | "error";

const LS_TOKEN_PREFIX = "tj_broker_token_";

// ── Component ─────────────────────────────────────────────────────────────────

export function DeltaApiConnectForm({ onSuccess, onError }: DeltaApiConnectFormProps) {
  const { loadAccounts, connect } = useBrokerStore();

  const [apiKey,          setApiKey]          = useState("");
  const [apiSecret,       setApiSecret]       = useState("");
  const [label,           setLabel]           = useState("");
  const [showSecret,      setShowSecret]      = useState(false);
  const [status,          setStatus]          = useState<FormStatus>("idle");
  const [errorMsg,        setErrorMsg]        = useState("");
  const [balanceInfo,     setBalanceInfo]     = useState<string | null>(null);
  const [hasImported,     setHasImported]     = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);

  // ── Detect imported credentials and OAuth config on mount ─────────────────
  useEffect(() => {
    fetch(`${getApiBase()}/api/credentials/status`)
      .then(r => r.json())
      .then((d: { ok: boolean; status?: Record<string, boolean> }) => {
        if (d.ok && d.status?.DELTA_API_KEY && d.status?.DELTA_API_SECRET) {
          setHasImported(true);
        }
      })
      .catch(() => {});

    fetch(`${getApiBase()}/api/delta/oauth/config`)
      .then(r => r.json())
      .then((d: { configured: boolean }) => {
        setOauthConfigured(d.configured);
      })
      .catch(() => {});
  }, []);

  // ── Finish OAuth flow (shared by both paths) ──────────────────────────────
  async function finishOAuthConnect(
    accountId: number, apiToken: string, accountLabel: string,
  ) {
    try {
      await AsyncStorage.setItem(`${LS_TOKEN_PREFIX}${accountId}`, apiToken);
    } catch { /* ignore */ }

    setStatus("success");
    await loadAccounts();

    const account: BrokerAccount = {
      id:         accountId,
      broker_id:  "delta",
      label:      accountLabel,
      is_active:  true,
      api_token:  apiToken,
      created_at: new Date().toISOString(),
    };
    connect(account);

    try {
      await fetch(`${getApiBase()}/api/broker/delta/ws/start`, {
        method:  "POST",
        headers: {
          "X-Broker-Account-Id": String(accountId),
          "X-Broker-Token":      apiToken,
        },
      });
    } catch { /* non-fatal */ }

    setTimeout(() => { onSuccess(); }, 1200);
  }

  // ── OAuth flow — opens in-app browser, polls pending-account on close ─────
  async function startDeltaOAuth() {
    setStatus("connecting");
    setErrorMsg("");

    try {
      const res  = await fetch(`${getApiBase()}/api/delta/oauth/config`);
      const data = await res.json() as { configured: boolean; authUrl: string | null };

      if (!data.configured || !data.authUrl) {
        const msg = "Delta OAuth is not configured. Set DELTA_CLIENT_ID and DELTA_CLIENT_SECRET.";
        setStatus("error");
        setErrorMsg(msg);
        onError(msg);
        return;
      }

      // Open the OAuth authorization URL in the RN in-app browser.
      // The web version uses window.open() + postMessage; on RN we open
      // the browser and poll /api/delta/oauth/pending-account after it closes.
      await WebBrowser.openBrowserAsync(data.authUrl, {
        showTitle:             true,
        enableDefaultShareMenuItem: false,
      });

      // Browser dismissed — poll for the completed account
      const pendRes  = await fetch(`${getApiBase()}/api/delta/oauth/pending-account`);
      const pendData = await pendRes.json() as {
        ok: boolean; accountId?: number; apiToken?: string;
        label?: string; error?: string;
      };

      if (!pendData.ok || !pendData.accountId || !pendData.apiToken) {
        const msg = pendData.error ?? "Could not retrieve Delta account after OAuth";
        setStatus("error");
        setErrorMsg(msg);
        onError(msg);
        return;
      }

      finishOAuthConnect(
        pendData.accountId, pendData.apiToken, pendData.label ?? "Delta Exchange",
      );
    } catch (err) {
      const msg = `Network error: ${String(err)}`;
      setStatus("error");
      setErrorMsg(msg);
      onError(msg);
    }
  }

  // ── One-click connect via imported credentials ────────────────────────────
  async function handleConnectImported() {
    setStatus("connecting");
    setErrorMsg("");
    setBalanceInfo(null);

    try {
      const res  = await fetch(`${getApiBase()}/api/credentials/connect/delta`, {
        method: "POST",
      });
      const data = await res.json() as {
        ok: boolean; accountId?: number; apiToken?: string;
        error?: string; usdtBalance?: string; envName?: string;
      };

      if (!data.ok || !data.accountId || !data.apiToken) {
        const msg = data.error ?? "Connection failed — check imported credentials";
        setStatus("error");
        setErrorMsg(msg);
        onError(msg);
        return;
      }

      try {
        await AsyncStorage.setItem(`${LS_TOKEN_PREFIX}${data.accountId}`, data.apiToken);
      } catch { /* ignore */ }

      if (data.usdtBalance !== undefined) {
        setBalanceInfo(
          `USDT Balance: ${parseFloat(data.usdtBalance).toFixed(2)}${data.envName ? ` · ${data.envName}` : ""}`,
        );
      }

      setStatus("success");
      await loadAccounts();

      const account: BrokerAccount = {
        id:         data.accountId,
        broker_id:  "delta",
        label:      "Delta Exchange",
        is_active:  true,
        api_token:  data.apiToken,
        created_at: new Date().toISOString(),
      };
      connect(account);

      try {
        await fetch(`${getApiBase()}/api/broker/delta/ws/start`, {
          method:  "POST",
          headers: {
            "X-Broker-Account-Id": String(data.accountId),
            "X-Broker-Token":      data.apiToken,
          },
        });
      } catch { /* non-fatal */ }

      setTimeout(() => { onSuccess(); }, 1200);
    } catch (err) {
      const msg = `Network error: ${String(err)}`;
      setStatus("error");
      setErrorMsg(msg);
      onError(msg);
    }
  }

  // ── Manual API key + secret form submission ───────────────────────────────
  async function handleConnect() {
    if (!canSubmit) return;

    setStatus("connecting");
    setErrorMsg("");
    setBalanceInfo(null);

    try {
      const res  = await fetch(`${getApiBase()}/api/broker-accounts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          broker_id:  "delta",
          api_key:    apiKey.trim(),
          api_secret: apiSecret.trim(),
          label:      label.trim() || "Delta Exchange",
        }),
      });

      const data = await res.json() as {
        ok: boolean;
        account?: BrokerAccount & {
          id: number; broker_id: "delta"; label: string;
          is_active: boolean; created_at: string;
        };
        api_token?:    string;
        error?:        string;
        usdtBalance?:  string;
      };

      if (!data.ok || !data.account || !data.api_token) {
        const msg = data.error ?? "Connection failed — check your credentials";
        setStatus("error");
        setErrorMsg(msg);
        onError(msg);
        return;
      }

      const accountId = data.account.id;
      const apiToken  = data.api_token;

      try {
        await AsyncStorage.setItem(`${LS_TOKEN_PREFIX}${accountId}`, apiToken);
      } catch { /* ignore */ }

      if (data.usdtBalance !== undefined) {
        setBalanceInfo(`USDT Balance: ${parseFloat(data.usdtBalance).toFixed(2)}`);
      }

      setStatus("success");
      await loadAccounts();

      const account: BrokerAccount = {
        id:         accountId,
        broker_id:  "delta",
        label:      data.account.label ?? "Delta Exchange",
        is_active:  true,
        api_token:  apiToken,
        created_at: data.account.created_at ?? new Date().toISOString(),
      };

      connect(account);

      try {
        await fetch(`${getApiBase()}/api/broker/delta/ws/start`, {
          method:  "POST",
          headers: {
            "X-Broker-Account-Id": String(accountId),
            "X-Broker-Token":      apiToken,
          },
        });
      } catch { /* WS start failure is non-fatal — polling continues */ }

      setTimeout(() => { onSuccess(); }, 1200);
    } catch (err) {
      const msg = `Network error: ${String(err)}`;
      setStatus("error");
      setErrorMsg(msg);
      onError(msg);
    }
  }

  const isLoading = status === "connecting";
  const canSubmit = apiKey.trim().length > 0 && apiSecret.trim().length > 0 && !isLoading;

  // ── Success state ─────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successIconWrap}>
          <Ionicons name="checkmark-circle" size={32} color="#00FFB4" />
        </View>
        <View>
          <Text style={styles.successTitle}>Connected to Delta Exchange</Text>
          {balanceInfo && (
            <Text style={styles.successBalance}>{balanceInfo}</Text>
          )}
          <Text style={styles.successSubtitle}>
            Live positions, orders &amp; balance syncing…
          </Text>
        </View>
      </View>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.form}>

      {/* ── OAuth connect — shown when DELTA_CLIENT_ID + SECRET are configured */}
      {oauthConfigured && (
        <View style={styles.oauthBox}>
          <View style={styles.oauthHeader}>
            <Ionicons name="shield-outline" size={14} color="#B7FF5A" style={styles.oauthIcon} />
            <View>
              <Text style={styles.oauthTitle}>Connect via OAuth 2.0</Text>
              <Text style={styles.oauthSub}>
                Authorize securely without entering your API keys here.
              </Text>
            </View>
          </View>
          <Pressable
            onPress={startDeltaOAuth}
            disabled={isLoading}
            style={({ pressed }) => [
              styles.oauthBtn,
              isLoading && styles.oauthBtnDisabled,
              pressed && !isLoading && { opacity: 0.85 },
            ]}
          >
            {isLoading
              ? <><ActivityIndicator size="small" color="rgba(183,255,90,0.5)" style={{ marginRight: 8 }} /><Text style={styles.oauthBtnTextDisabled}>Authorizing…</Text></>
              : <Text style={styles.oauthBtnText}>Connect with OAuth</Text>
            }
          </Pressable>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or use API key below</Text>
            <View style={styles.dividerLine} />
          </View>
        </View>
      )}

      {/* ── One-click connect when credentials are already imported */}
      {hasImported && (
        <View style={styles.importedBox}>
          <View style={styles.importedHeader}>
            <Ionicons name="flash-outline" size={14} color="#00FFB4" style={styles.importedIcon} />
            <View>
              <Text style={styles.importedTitle}>Imported credentials found</Text>
              <Text style={styles.importedSub}>
                Connect instantly using your saved API key &amp; secret.
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleConnectImported}
            disabled={isLoading}
            style={({ pressed }) => [
              styles.importedBtn,
              isLoading && styles.importedBtnDisabled,
              pressed && !isLoading && { opacity: 0.85 },
            ]}
          >
            {isLoading
              ? <><ActivityIndicator size="small" color="rgba(0,255,180,0.5)" style={{ marginRight: 8 }} /><Text style={styles.importedBtnTextDisabled}>Connecting…</Text></>
              : <Text style={styles.importedBtnText}>Connect with Imported Key</Text>
            }
          </Pressable>
          {!oauthConfigured && (
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or enter manually below</Text>
              <View style={styles.dividerLine} />
            </View>
          )}
        </View>
      )}

      {/* ── API Key field */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>API KEY</Text>
        <View style={[styles.inputRow, apiKey ? styles.inputRowActive : null]}>
          <Ionicons name="key-outline" size={14} color="rgba(255,255,255,0.35)" style={styles.inputIcon} />
          <TextInput
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="Your Delta Exchange API Key"
            placeholderTextColor="rgba(255,255,255,0.25)"
            editable={!isLoading}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            style={styles.textInput}
          />
        </View>
      </View>

      {/* ── API Secret field */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>API SECRET</Text>
        <View style={[styles.inputRow, apiSecret ? styles.inputRowActive : null]}>
          <Ionicons name="lock-closed-outline" size={14} color="rgba(255,255,255,0.35)" style={styles.inputIcon} />
          <TextInput
            value={apiSecret}
            onChangeText={setApiSecret}
            placeholder="Your Delta Exchange API Secret"
            placeholderTextColor="rgba(255,255,255,0.25)"
            editable={!isLoading}
            secureTextEntry={!showSecret}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            style={[styles.textInput, { flex: 1 }]}
          />
          <Pressable
            onPress={() => setShowSecret(s => !s)}
            hitSlop={8}
            style={styles.eyeBtn}
          >
            <Ionicons
              name={showSecret ? "eye-off-outline" : "eye-outline"}
              size={14}
              color="rgba(255,255,255,0.35)"
            />
          </Pressable>
        </View>
        <Text style={styles.fieldHint}>
          Secret is encrypted before storage and never exposed in logs.
        </Text>
      </View>

      {/* ── Account Label field */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>
          ACCOUNT LABEL{" "}
          <Text style={styles.fieldLabelOptional}>(optional)</Text>
        </Text>
        <View style={styles.inputRow}>
          <Ionicons name="pricetag-outline" size={14} color="rgba(255,255,255,0.35)" style={styles.inputIcon} />
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Main Account"
            placeholderTextColor="rgba(255,255,255,0.25)"
            editable={!isLoading}
            style={styles.textInput}
          />
        </View>
      </View>

      {/* ── Error banner */}
      {status === "error" && (
        <View style={styles.errorBox}>
          <Ionicons name="close-circle-outline" size={15} color="#EF4444" style={styles.errorIcon} />
          <Text style={styles.errorMsg}>{errorMsg}</Text>
        </View>
      )}

      {/* ── Submit button */}
      <View style={styles.submitArea}>
        <Pressable
          onPress={handleConnect}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.submitBtn,
            !canSubmit && styles.submitBtnDisabled,
            pressed && canSubmit && { opacity: 0.85 },
          ]}
        >
          {isLoading ? (
            <View style={styles.submitInner}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnTextDisabled}>Validating credentials…</Text>
            </View>
          ) : (
            <Text style={canSubmit ? styles.submitBtnText : styles.submitBtnTextDisabled}>
              Connect to Delta Exchange
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() =>
            Linking.openURL("https://www.delta.exchange/app/account/manageapikeys")
          }
          style={({ pressed }) => [styles.externalLink, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="open-outline" size={11} color="rgba(255,255,255,0.35)" />
          <Text style={styles.externalLinkText}>Create API keys on delta.exchange</Text>
        </Pressable>
      </View>

    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Success state ──────────────────────────────────────────────────────────
  successContainer: {
    alignItems:     "center",
    gap:            16,
    paddingVertical: 32,
  },
  successIconWrap: {
    width:           64,
    height:          64,
    borderRadius:    32,
    backgroundColor: "rgba(0,255,180,0.12)",
    borderWidth:     1.5,
    borderColor:     "rgba(0,255,180,0.3)",
    alignItems:      "center",
    justifyContent:  "center",
  },
  successTitle: {
    fontSize:   15,
    fontWeight: "600",
    color:      "#00FFB4",
    textAlign:  "center",
  },
  successBalance: {
    marginTop: 4,
    fontSize:  13,
    color:     "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
  successSubtitle: {
    marginTop: 4,
    fontSize:  13,
    color:     "rgba(255,255,255,0.4)",
    textAlign: "center",
  },

  // ── Form wrapper ───────────────────────────────────────────────────────────
  form: {
    gap: 16,
  },

  // ── OAuth box ──────────────────────────────────────────────────────────────
  oauthBox: {
    padding:         14,
    borderRadius:    12,
    backgroundColor: "rgba(183,255,90,0.05)",
    borderWidth:     1,
    borderColor:     "rgba(183,255,90,0.2)",
    gap:             10,
  },
  oauthHeader: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  oauthIcon: {
    flexShrink: 0,
  },
  oauthTitle: {
    fontSize:   13,
    fontWeight: "600",
    color:      "#B7FF5A",
  },
  oauthSub: {
    fontSize:  11,
    color:     "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
  oauthBtn: {
    width:           "100%",
    paddingVertical: 10,
    borderRadius:    9,
    backgroundColor: "#B7FF5A",
    alignItems:      "center",
    justifyContent:  "center",
    flexDirection:   "row",
  },
  oauthBtnDisabled: {
    backgroundColor: "rgba(183,255,90,0.1)",
  },
  oauthBtnText: {
    fontSize:   13,
    fontWeight: "700",
    color:      "#0B1017",
  },
  oauthBtnTextDisabled: {
    fontSize:   13,
    fontWeight: "700",
    color:      "rgba(183,255,90,0.5)",
  },

  // ── Imported credentials box ───────────────────────────────────────────────
  importedBox: {
    padding:         14,
    borderRadius:    12,
    backgroundColor: "rgba(0,255,180,0.05)",
    borderWidth:     1,
    borderColor:     "rgba(0,255,180,0.2)",
    gap:             10,
  },
  importedHeader: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  importedIcon: {
    flexShrink: 0,
  },
  importedTitle: {
    fontSize:   13,
    fontWeight: "600",
    color:      "#00FFB4",
  },
  importedSub: {
    fontSize:  11,
    color:     "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
  importedBtn: {
    width:           "100%",
    paddingVertical: 10,
    borderRadius:    9,
    backgroundColor: "#00FFB4",
    alignItems:      "center",
    justifyContent:  "center",
    flexDirection:   "row",
  },
  importedBtnDisabled: {
    backgroundColor: "rgba(0,255,180,0.1)",
  },
  importedBtnText: {
    fontSize:   13,
    fontWeight: "700",
    color:      "#0B1017",
  },
  importedBtnTextDisabled: {
    fontSize:   13,
    fontWeight: "700",
    color:      "rgba(0,255,180,0.5)",
  },

  // ── Divider row (or use API key below) ─────────────────────────────────────
  dividerRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  dividerLine: {
    flex:            1,
    height:          1,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  dividerText: {
    fontSize:    10,
    color:       "rgba(255,255,255,0.25)",
    flexShrink:  0,
  },

  // ── Field ──────────────────────────────────────────────────────────────────
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize:      11,
    fontWeight:    "600",
    color:         "rgba(255,255,255,0.5)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  fieldLabelOptional: {
    color:      "rgba(255,255,255,0.28)",
    fontWeight: "400",
  },
  fieldHint: {
    fontSize: 11,
    color:    "rgba(255,255,255,0.28)",
  },

  // ── Input row ──────────────────────────────────────────────────────────────
  inputRow: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             10,
    paddingHorizontal: 14,
    paddingVertical:  10,
    borderRadius:    10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.08)",
  },
  inputRowActive: {
    borderColor: "rgba(249,115,22,0.4)",
  },
  inputIcon: {
    flexShrink: 0,
  },
  textInput: {
    flex:     1,
    color:    "rgba(255,255,255,0.9)",
    fontSize: 13,
  },
  eyeBtn: {
    padding:    4,
    flexShrink: 0,
  },

  // ── Error ──────────────────────────────────────────────────────────────────
  errorBox: {
    flexDirection:   "row",
    alignItems:      "flex-start",
    gap:             10,
    paddingHorizontal: 14,
    paddingVertical:  12,
    borderRadius:    10,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth:     1,
    borderColor:     "rgba(239,68,68,0.2)",
  },
  errorIcon: {
    flexShrink: 0,
    marginTop:  1,
  },
  errorMsg: {
    flex:       1,
    fontSize:   13,
    color:      "#EF4444",
    lineHeight: 18,
  },

  // ── Submit ─────────────────────────────────────────────────────────────────
  submitArea: {
    gap:       12,
    marginTop:  4,
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius:    10,
    backgroundColor: "#F97316",
    alignItems:      "center",
    justifyContent:  "center",
  },
  submitBtnDisabled: {
    backgroundColor: "rgba(249,115,22,0.2)",
  },
  submitInner: {
    flexDirection: "row",
    alignItems:    "center",
  },
  submitBtnText: {
    fontSize:   14,
    fontWeight: "600",
    color:      "#fff",
  },
  submitBtnTextDisabled: {
    fontSize:   14,
    fontWeight: "600",
    color:      "rgba(255,255,255,0.4)",
  },

  // ── External link ──────────────────────────────────────────────────────────
  externalLink: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            6,
  },
  externalLinkText: {
    fontSize: 12,
    color:    "rgba(255,255,255,0.35)",
  },
});
