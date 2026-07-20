/**
 * CredentialImportModal — React Native port of
 *   src/components/broker/CredentialImportModal.tsx
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. File drag-and-drop / <input type="file"> → TextInput + expo-clipboard paste
 *    Mobile has no file system drag-and-drop for arbitrary text files.
 *    Users paste .env content directly into a multiline TextInput, or tap
 *    "Paste from Clipboard" to auto-populate it from the clipboard.
 *    parseCredentialsFile() logic is preserved exactly — it still parses the
 *    same KEY=VALUE text format regardless of how the text arrived.
 *
 * 2. localStorage → AsyncStorage
 *    Not directly used in this component; brokerStore handles all token storage.
 *
 * 3. credentials: "include" → removed (not applicable in React Native fetch).
 *
 * 4. Relative fetch URLs → getApiBase() prefix
 *    All /api/… paths are prefixed with getApiBase() so fetch resolves
 *    to the correct absolute URL in React Native.
 *
 * 5. useIsMobile() → removed.
 *    The tablet always uses the centered-dialog layout (desktop web equivalent).
 *
 * 6. Lucide icons → Ionicons (@expo/vector-icons)
 *    ShieldCheck    → shield-checkmark-outline
 *    Upload         → cloud-upload-outline
 *    FileText       → document-text-outline
 *    CheckCircle2   → checkmark-circle-outline
 *    XCircle        → close-circle-outline
 *    AlertTriangle  → warning-outline
 *    Lock           → lock-closed-outline
 *    Eye            → eye-outline
 *    EyeOff         → eye-off-outline
 *    ChevronRight   → chevron-forward
 *    X              → close
 *    Loader2        → ActivityIndicator (built-in RN spinner)
 *    Wifi           → wifi-outline
 *    Database       → server-outline
 *    RefreshCw      → refresh-outline
 *    Key            → key-outline
 *
 * 7. Modal overlay → Modal (react-native)
 *    onBackdropPress mirrors the web's onClick outside-to-close behaviour.
 *
 * 8. HTML elements → RN primitives
 *    div → View  |  p/span → Text  |  button → Pressable  |  pre → Text (monospace)
 *    form → View  |  input → TextInput  |  scrollable div → ScrollView
 *
 * All business logic preserved exactly:
 *   - parseCredentialsFile()             — same KEY=VALUE parsing, same supported keys
 *   - groupDetected()                    — same credential-group detection
 *   - CredentialImportModal screens      — upload → review → confirm → done
 *   - handleConfirm() POST /api/credentials/import
 *   - ConnectionStatusPanel              — load(), runDeltaTest(), testTelegram()
 *   - CheckChip                         — status machine: idle | running | ok | fail
 *   - Delta 3-check sub-row             — API Key, WebSocket, Account Data chips + Retry
 *   - All loading states, error states, retry logic, success flow
 *   - All brokerStore interactions       — wsClientStates, brokerBalances, connectedAccounts
 *   - All TypeScript types preserved     — ParsedCredentials, CredStatus, Screen, CheckStatus, etc.
 *
 * Exports:
 *   CredentialImportModal      — modal dialog (upload → review → confirm → done)
 *   ConnectionStatusPanel      — inline status card (used on the brokers screen)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet,
  Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useBrokerStore } from "@/store/brokerStore";
import { getApiBase } from "@/lib/apiBase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedCredentials {
  BROKER_ENCRYPTION_KEY?: string;
  DELTA_API_KEY?: string;
  DELTA_API_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  SESSION_SECRET?: string;
  DATABASE_URL?: string;
}

interface CredStatus {
  BROKER_ENCRYPTION_KEY: boolean;
  DELTA_API_KEY: boolean;
  DELTA_API_SECRET: boolean;
  TELEGRAM_BOT_TOKEN: boolean;
  TELEGRAM_CHAT_ID: boolean;
  SESSION_SECRET: boolean;
  DATABASE_URL: boolean;
  [key: string]: boolean;
}

type Screen = "upload" | "review" | "confirm" | "done";

type CheckStatus = "idle" | "running" | "ok" | "fail";

// ── Constants ─────────────────────────────────────────────────────────────────

const CREDENTIAL_GROUPS = [
  {
    label: "Delta Exchange Credentials",
    keys: ["DELTA_API_KEY", "DELTA_API_SECRET"] as const,
    color: "#F97316",
    bg: "rgba(249,115,22,0.12)",
  },
  {
    label: "Telegram Credentials",
    keys: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] as const,
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.12)",
  },
  {
    label: "Database URL",
    keys: ["DATABASE_URL"] as const,
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.12)",
  },
  {
    label: "Security Keys",
    keys: ["BROKER_ENCRYPTION_KEY", "SESSION_SECRET"] as const,
    color: "#00FFB4",
    bg: "rgba(0,255,180,0.10)",
  },
] as const;

// ── Pure helpers (preserved exactly from the web original) ────────────────────

function parseCredentialsFile(content: string): ParsedCredentials {
  const parsed: ParsedCredentials = {};
  const supported = [
    "BROKER_ENCRYPTION_KEY",
    "DELTA_API_KEY", "DELTA_API_SECRET", "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID", "SESSION_SECRET", "DATABASE_URL",
  ];
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (supported.includes(key) && value) {
      (parsed as Record<string, string>)[key] = value;
    }
  }
  return parsed;
}

function groupDetected(creds: ParsedCredentials) {
  return CREDENTIAL_GROUPS.map((g) => ({
    ...g,
    detected: g.keys.some((k) => !!(creds as Record<string, string | undefined>)[k]),
    count: g.keys.filter((k) => !!(creds as Record<string, string | undefined>)[k]).length,
  }));
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onImported: () => void;
}

// ── CredentialImportModal ─────────────────────────────────────────────────────

export function CredentialImportModal({ onClose, onImported }: Props) {
  const [screen,     setScreen]     = useState<Screen>("upload");
  const [parsed,     setParsed]     = useState<ParsedCredentials>({});
  const [fileName,   setFileName]   = useState("");
  const [fileError,  setFileError]  = useState("");
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState("");
  const [showValues, setShowValues] = useState(false);

  // ── Handle text content (replaces the web's FileReader path) ─────────────
  const handleContent = useCallback((content: string, sourceName: string) => {
    setFileError("");
    const result = parseCredentialsFile(content);
    const hasAny = Object.keys(result).length > 0;
    if (!hasAny) {
      setFileError("No recognised credentials found. Check the KEY=VALUE format.");
      return;
    }
    setParsed(result);
    setFileName(sourceName);
    setScreen("review");
  }, []);

  // ── Confirm → POST /api/credentials/import ────────────────────────────────
  async function handleConfirm() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`${getApiBase()}/api/credentials/import`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ credentials: parsed }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) {
        setSaveError(data.error ?? "Import failed");
        setSaving(false);
        return;
      }
      setScreen("done");
      onImported();
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Dialog card — stopPropagation so tapping inside doesn't close */}
        <Pressable style={styles.card} onPress={e => e.stopPropagation()}>
          {/* Top accent line */}
          <View style={styles.topAccent} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="shield-checkmark-outline" size={17} color="#00FFB4" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Import Credentials</Text>
              <Text style={styles.headerSub}>
                Paste a .env file — secrets are encrypted before storage
              </Text>
            </View>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]} hitSlop={8}>
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>

          {/* Body */}
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {screen === "upload" && (
                <UploadScreen
                  fileError={fileError}
                  onContent={handleContent}
                  onError={setFileError}
                />
              )}

              {screen === "review" && (
                <ReviewScreen
                  parsed={parsed}
                  fileName={fileName}
                  showValues={showValues}
                  onToggleValues={() => setShowValues(v => !v)}
                  onBack={() => setScreen("upload")}
                  onNext={() => setScreen("confirm")}
                />
              )}

              {screen === "confirm" && (
                <ConfirmScreen
                  parsed={parsed}
                  saving={saving}
                  saveError={saveError}
                  onBack={() => setScreen("review")}
                  onConfirm={handleConfirm}
                />
              )}

              {screen === "done" && (
                <DoneScreen onClose={onClose} />
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── UploadScreen ──────────────────────────────────────────────────────────────
// RN replacement for the web's drag-and-drop / file input.
// Users paste .env content into the multiline TextInput or tap
// "Paste from Clipboard" to populate it automatically.

function UploadScreen({
  fileError, onContent, onError,
}: {
  fileError: string;
  onContent: (content: string, sourceName: string) => void;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState("");

  async function handlePasteClipboard() {
    try {
      const content = await Clipboard.getStringAsync();
      if (!content.trim()) {
        onError("Clipboard is empty.");
        return;
      }
      setText(content);
      onError("");
    } catch {
      onError("Could not read clipboard.");
    }
  }

  function handleImport() {
    if (!text.trim()) {
      onError("Please paste your .env content first.");
      return;
    }
    onContent(text, "Pasted credentials");
  }

  return (
    <View style={uploadStyles.container}>
      {/* Security note */}
      <View style={uploadStyles.securityNote}>
        <Ionicons name="lock-closed-outline" size={14} color="#00FFB4" style={{ flexShrink: 0, marginTop: 1 }} />
        <Text style={uploadStyles.securityText}>
          Credentials are encrypted with AES-256-CBC before storage. They are never displayed or logged after import.
        </Text>
      </View>

      {/* Paste area */}
      <View style={uploadStyles.pasteArea}>
        <View style={uploadStyles.pasteHeader}>
          <Ionicons name="cloud-upload-outline" size={22} color="#00FFB4" />
          <Text style={uploadStyles.pasteTitle}>Paste your .env content</Text>
          <Text style={uploadStyles.pasteSub}>
            Copy your credentials file and paste below, or use the button.
          </Text>
        </View>

        <TextInput
          value={text}
          onChangeText={t => { setText(t); onError(""); }}
          placeholder={"DELTA_API_KEY=your_api_key\nDELTA_API_SECRET=your_api_secret\n..."}
          placeholderTextColor="rgba(255,255,255,0.2)"
          multiline
          numberOfLines={6}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          style={uploadStyles.textArea}
        />

        <Pressable
          onPress={handlePasteClipboard}
          style={({ pressed }) => [uploadStyles.pasteBtn, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="clipboard-outline" size={14} color="#00FFB4" />
          <Text style={uploadStyles.pasteBtnText}>Paste from Clipboard</Text>
        </Pressable>
      </View>

      {fileError ? (
        <View style={uploadStyles.errorBox}>
          <Ionicons name="warning-outline" size={14} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <Text style={uploadStyles.errorText}>{fileError}</Text>
        </View>
      ) : null}

      {/* Expected format */}
      <View style={uploadStyles.formatBox}>
        <Text style={uploadStyles.formatLabel}>EXPECTED FORMAT</Text>
        <Text style={uploadStyles.formatPre}>
          {`BROKER_ENCRYPTION_KEY=your_key\n\nDELTA_API_KEY=your_api_key\nDELTA_API_SECRET=your_api_secret\n\nTELEGRAM_BOT_TOKEN=your_token\nTELEGRAM_CHAT_ID=your_chat_id\n\nDATABASE_URL=postgresql://...`}
        </Text>
      </View>

      <Pressable
        onPress={handleImport}
        style={({ pressed }) => [uploadStyles.importBtn, !text.trim() && uploadStyles.importBtnDisabled, pressed && text.trim() && { opacity: 0.85 }]}
        disabled={!text.trim()}
      >
        <Text style={[uploadStyles.importBtnText, !text.trim() && uploadStyles.importBtnTextDisabled]}>
          Review Credentials
        </Text>
        <Ionicons name="chevron-forward" size={15} color={text.trim() ? "#00FFB4" : "rgba(0,255,180,0.3)"} />
      </Pressable>
    </View>
  );
}

// ── ReviewScreen ──────────────────────────────────────────────────────────────

function ReviewScreen({
  parsed, fileName, showValues, onToggleValues, onBack, onNext,
}: {
  parsed: ParsedCredentials;
  fileName: string;
  showValues: boolean;
  onToggleValues: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const groups         = groupDetected(parsed);
  const totalDetected  = Object.keys(parsed).length;

  return (
    <View style={reviewStyles.container}>
      {/* File info */}
      <View style={reviewStyles.fileInfo}>
        <Ionicons name="document-text-outline" size={15} color="rgba(255,255,255,0.5)" style={{ flexShrink: 0 }} />
        <Text style={reviewStyles.fileName} numberOfLines={1}>{fileName}</Text>
        <View style={reviewStyles.keysBadge}>
          <Text style={reviewStyles.keysBadgeText}>{totalDetected} keys</Text>
        </View>
      </View>

      {/* Detected groups */}
      <View style={reviewStyles.groupsContainer}>
        <Text style={reviewStyles.sectionLabel}>DETECTED CREDENTIALS</Text>
        {groups.map((g) => (
          <View
            key={g.label}
            style={[
              reviewStyles.groupRow,
              { backgroundColor: g.detected ? g.bg : "rgba(255,255,255,0.02)", borderColor: g.detected ? g.color + "30" : "rgba(255,255,255,0.06)", opacity: g.detected ? 1 : 0.45 },
            ]}
          >
            <View style={[reviewStyles.groupIconWrap, { backgroundColor: g.detected ? g.color + "20" : "rgba(255,255,255,0.05)" }]}>
              {g.detected
                ? <Ionicons name="checkmark-circle-outline" size={14} color={g.color} />
                : <Ionicons name="close-circle-outline"     size={14} color="rgba(255,255,255,0.2)" />}
            </View>
            <Text style={[reviewStyles.groupLabel, { fontWeight: g.detected ? "600" : "400", color: g.detected ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)" }]}>
              {g.label}
            </Text>
            {g.detected && (
              <Text style={[reviewStyles.groupCount, { color: g.color }]}>
                {g.count}/{g.keys.length}
              </Text>
            )}
          </View>
        ))}
      </View>

      {/* Show values toggle */}
      <View style={reviewStyles.toggleRow}>
        <Text style={reviewStyles.toggleLabel}>Credential values (masked for security)</Text>
        <Pressable
          onPress={onToggleValues}
          style={({ pressed }) => [reviewStyles.toggleBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name={showValues ? "eye-off-outline" : "eye-outline"} size={12} color="rgba(255,255,255,0.5)" />
          <Text style={reviewStyles.toggleBtnText}>{showValues ? "Hide" : "Show"}</Text>
        </Pressable>
      </View>

      {showValues && (
        <View style={reviewStyles.valuesBox}>
          {Object.entries(parsed).map(([key, val]) => (
            <View key={key} style={reviewStyles.valueRow}>
              <Text style={reviewStyles.valueKey}>{key}</Text>
              <Text style={reviewStyles.valueVal}>
                {val ? val.slice(0, 6) + "••••••" + val.slice(-4) : ""}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={reviewStyles.actions}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [reviewStyles.backBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={reviewStyles.backBtnText}>Back</Text>
        </Pressable>
        <Pressable
          onPress={onNext}
          style={({ pressed }) => [reviewStyles.nextBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={reviewStyles.nextBtnText}>Review & Confirm</Text>
          <Ionicons name="chevron-forward" size={15} color="#00FFB4" />
        </Pressable>
      </View>
    </View>
  );
}

// ── ConfirmScreen ─────────────────────────────────────────────────────────────

function ConfirmScreen({
  parsed, saving, saveError, onBack, onConfirm,
}: {
  parsed: ParsedCredentials;
  saving: boolean;
  saveError: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const count = Object.keys(parsed).length;

  return (
    <View style={confirmStyles.container}>
      {/* Warning */}
      <View style={confirmStyles.warningBox}>
        <Ionicons name="warning-outline" size={15} color="#F97316" style={{ flexShrink: 0, marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={confirmStyles.warningTitle}>Confirm Import</Text>
          <Text style={confirmStyles.warningBody}>
            You are about to save{" "}
            <Text style={confirmStyles.warningCount}>{count} credentials</Text>
            {" "}to encrypted storage. Existing values for matching keys will be overwritten.
          </Text>
        </View>
      </View>

      {/* What happens next */}
      <View style={confirmStyles.infoBox}>
        <Text style={confirmStyles.infoLabel}>WHAT HAPPENS AFTER IMPORT</Text>
        {[
          { icon: "lock-closed-outline" as const, text: "All secrets encrypted with AES-256-CBC before storage" },
          { icon: "server-outline"      as const, text: "Credentials never displayed again after this screen" },
          { icon: "wifi-outline"        as const, text: "Delta Exchange: one-click connect using imported key" },
        ].map((item, i) => (
          <View key={i} style={[confirmStyles.infoRow, i < 2 && { marginBottom: 8 }]}>
            <Ionicons name={item.icon} size={13} color="#00FFB4" style={{ flexShrink: 0, marginTop: 1 }} />
            <Text style={confirmStyles.infoText}>{item.text}</Text>
          </View>
        ))}
      </View>

      {saveError ? (
        <View style={confirmStyles.errorBox}>
          <Ionicons name="close-circle-outline" size={14} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <Text style={confirmStyles.errorText}>{saveError}</Text>
        </View>
      ) : null}

      {/* Actions */}
      <View style={confirmStyles.actions}>
        <Pressable
          onPress={onBack}
          disabled={saving}
          style={({ pressed }) => [confirmStyles.backBtn, saving && { opacity: 0.5 }, pressed && !saving && { opacity: 0.7 }]}
        >
          <Text style={confirmStyles.backBtnText}>Back</Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          disabled={saving}
          style={({ pressed }) => [
            confirmStyles.confirmBtn,
            saving && confirmStyles.confirmBtnSaving,
            pressed && !saving && { opacity: 0.85 },
          ]}
        >
          {saving ? (
            <>
              <ActivityIndicator size="small" color="rgba(0,255,180,0.5)" style={{ marginRight: 8 }} />
              <Text style={confirmStyles.confirmBtnTextSaving}>Encrypting & Saving…</Text>
            </>
          ) : (
            <>
              <Ionicons name="shield-checkmark-outline" size={15} color="#0B1017" style={{ marginRight: 6 }} />
              <Text style={confirmStyles.confirmBtnText}>Encrypt & Save Credentials</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ── DoneScreen ────────────────────────────────────────────────────────────────

function DoneScreen({ onClose }: { onClose: () => void }) {
  return (
    <View style={doneStyles.container}>
      <View style={doneStyles.iconWrap}>
        <Ionicons name="checkmark-circle-outline" size={32} color="#00FFB4" />
      </View>
      <View style={doneStyles.textWrap}>
        <Text style={doneStyles.title}>Credentials Imported</Text>
        <Text style={doneStyles.sub}>
          All secrets have been encrypted and saved.{"\n"}
          You can now connect your brokers with one click.
        </Text>
      </View>
      <View style={doneStyles.hintBox}>
        <Text style={doneStyles.hintText}>
          Use <Text style={doneStyles.hintEmphasis}>Connect Delta Exchange</Text> to activate your broker connections.
        </Text>
      </View>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [doneStyles.doneBtn, pressed && { opacity: 0.85 }]}
      >
        <Text style={doneStyles.doneBtnText}>Done</Text>
      </Pressable>
    </View>
  );
}

// ── ConnectionStatusPanel ─────────────────────────────────────────────────────
// Inline status card — not a modal; rendered directly in the brokers screen.

interface ConnectionStatusPanelProps {
  onImport?: () => void;
}

interface StatusState {
  loaded: boolean;
  status: Partial<CredStatus>;
}

interface DeltaTestResult {
  ok: boolean;
  error?: string;
  envName?: string;
  usdtBalance?: string;
}

// ── CheckChip (sub-component for ConnectionStatusPanel) ───────────────────────

function CheckChip({
  label, status, ionIcon,
}: {
  label: string;
  status: CheckStatus;
  ionIcon: React.ComponentProps<typeof Ionicons>["name"];
}) {
  const color =
    status === "ok"      ? "#00FFB4"               :
    status === "fail"    ? "#EF4444"               :
    status === "running" ? "rgba(255,255,255,0.45)" :
                           "rgba(255,255,255,0.2)";
  const bg =
    status === "ok"   ? "rgba(0,255,180,0.08)"  :
    status === "fail" ? "rgba(239,68,68,0.08)"  :
                        "rgba(255,255,255,0.04)";
  const borderColor =
    status === "ok"   ? "rgba(0,255,180,0.2)"  :
    status === "fail" ? "rgba(239,68,68,0.2)"  :
                        "rgba(255,255,255,0.07)";

  return (
    <View style={[chipStyles.chip, { backgroundColor: bg, borderColor }]}>
      {status === "running" ? (
        <ActivityIndicator size={9} color={color} />
      ) : (
        <Ionicons
          name={
            status === "ok"   ? "checkmark-circle-outline" :
            status === "fail" ? "close-circle-outline"     :
            ionIcon
          }
          size={9}
          color={color}
        />
      )}
      <Text style={[chipStyles.chipLabel, { color }]}>{label}</Text>
    </View>
  );
}

// ── ConnectionStatusPanel component ──────────────────────────────────────────

export function ConnectionStatusPanel({ onImport: _onImport }: ConnectionStatusPanelProps) {
  const [st,           setSt]          = useState<StatusState>({ loaded: false, status: {} });
  const [deltaApiStatus,   setDeltaApiStatus]   = useState<CheckStatus>("idle");
  const [deltaTestResult,  setDeltaTestResult]  = useState<DeltaTestResult | null>(null);
  const [telegramTesting,  setTelegramTesting]  = useState(false);
  const [telegramResult,   setTelegramResult]   = useState<boolean | null>(null);

  // Live broker state for WS + account data checks
  const wsClientStates    = useBrokerStore(s => s.wsClientStates);
  const brokerBalances    = useBrokerStore(s => s.brokerBalances);
  const connectedAccounts = useBrokerStore(s => s.connectedAccounts);

  const deltaWsConnected = wsClientStates.delta?.status === "connected";
  const deltaHasBalance  = !!(brokerBalances["delta"] || connectedAccounts["delta"]);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`${getApiBase()}/api/credentials/status`);
      const data = await res.json() as { ok: boolean; status: CredStatus };
      if (data.ok) setSt({ loaded: true, status: data.status });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runDeltaTest = useCallback(async () => {
    setDeltaApiStatus("running");
    setDeltaTestResult(null);
    try {
      const res  = await fetch(`${getApiBase()}/api/credentials/test/delta`, { method: "POST" });
      const data = await res.json() as DeltaTestResult;
      setDeltaTestResult(data);
      setDeltaApiStatus(data.ok ? "ok" : "fail");
    } catch {
      setDeltaTestResult({ ok: false, error: "Network error" });
      setDeltaApiStatus("fail");
    }
  }, []);

  // Auto-run Delta test once credentials are confirmed present
  const deltaConfigured = !!(st.status.DELTA_API_KEY && st.status.DELTA_API_SECRET);
  useEffect(() => {
    if (st.loaded && deltaConfigured) {
      void runDeltaTest();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.loaded, deltaConfigured]);

  async function testTelegram() {
    setTelegramTesting(true);
    setTelegramResult(null);
    try {
      const res  = await fetch(`${getApiBase()}/api/credentials/test/telegram`, { method: "POST" });
      const data = await res.json() as { ok: boolean };
      setTelegramResult(data.ok);
    } catch {
      setTelegramResult(false);
    } finally {
      setTelegramTesting(false);
    }
  }

  const services = [
    {
      key: "delta",
      label: "Delta Exchange",
      configured: deltaConfigured,
      color: "#F97316",
    },
    {
      key: "telegram",
      label: "Telegram",
      configured: !!(st.status.TELEGRAM_BOT_TOKEN && st.status.TELEGRAM_CHAT_ID),
      color: "#3B82F6",
    },
    {
      key: "database",
      label: "Database URL",
      configured: !!st.status.DATABASE_URL,
      color: "#8B5CF6",
    },
    {
      key: "encryption",
      label: "Encryption Key",
      configured: !!st.status.BROKER_ENCRYPTION_KEY,
      color: "#00FFB4",
    },
  ];

  const anyConfigured = services.some(s => s.configured);

  return (
    <View style={panelStyles.card}>
      {/* Panel header */}
      <View style={panelStyles.panelHeader}>
        <View style={panelStyles.panelHeaderIcon}>
          <Ionicons name="shield-checkmark-outline" size={13} color="#00FFB4" />
        </View>
        <Text style={panelStyles.panelHeaderTitle}>Connection Status</Text>
      </View>

      {/* Service rows */}
      <View style={panelStyles.serviceList}>
        {services.map((svc, i) => (
          <View key={svc.key}>
            {/* Main service row */}
            <View style={[panelStyles.serviceRow, i < services.length - 1 && !((svc.key === "delta") && svc.configured) && panelStyles.serviceRowBorder]}>
              {/* Status dot */}
              <View
                style={[
                  panelStyles.dot,
                  {
                    backgroundColor: svc.configured ? svc.color : "rgba(255,255,255,0.15)",
                    shadowColor:     svc.configured ? svc.color : "transparent",
                    shadowOpacity:   svc.configured ? 0.4 : 0,
                    shadowRadius:    svc.configured ? 4 : 0,
                    elevation:       0,
                  },
                ]}
              />
              <Text style={panelStyles.serviceLabel}>{svc.label}</Text>

              {!st.loaded ? (
                <Text style={panelStyles.loadingDots}>…</Text>
              ) : (
                <View style={panelStyles.serviceRight}>
                  {/* Telegram: single test button */}
                  {svc.key === "telegram" && svc.configured && (
                    <>
                      <Pressable
                        onPress={testTelegram}
                        disabled={telegramTesting}
                        style={({ pressed }) => [panelStyles.testBtn, pressed && { opacity: 0.7 }]}
                      >
                        {telegramTesting
                          ? <ActivityIndicator size={10} color="rgba(255,255,255,0.4)" />
                          : <Ionicons name="wifi-outline" size={10} color="rgba(255,255,255,0.4)" />}
                        <Text style={panelStyles.testBtnText}>Test</Text>
                      </Pressable>
                      {telegramResult !== null && (
                        <Text style={[panelStyles.testResult, { color: telegramResult ? "#00FFB4" : "#EF4444" }]}>
                          {telegramResult ? "✓ OK" : "✗ Fail"}
                        </Text>
                      )}
                    </>
                  )}
                  <Text style={[panelStyles.configuredText, { color: svc.configured ? svc.color : "rgba(255,255,255,0.25)" }]}>
                    {svc.configured ? "Configured" : "Not Configured"}
                  </Text>
                </View>
              )}
            </View>

            {/* Delta 3-check sub-row */}
            {svc.key === "delta" && svc.configured && st.loaded && (
              <View style={[panelStyles.deltaSubRow, i < services.length - 1 && panelStyles.serviceRowBorder]}>
                <CheckChip
                  label="API Key"
                  status={deltaApiStatus}
                  ionIcon="key-outline"
                />
                <CheckChip
                  label="WebSocket"
                  status={
                    deltaApiStatus === "idle" || deltaApiStatus === "running"
                      ? "idle"
                      : deltaWsConnected ? "ok" : "fail"
                  }
                  ionIcon="wifi-outline"
                />
                <CheckChip
                  label="Account Data"
                  status={
                    deltaApiStatus === "idle" || deltaApiStatus === "running"
                      ? "idle"
                      : deltaHasBalance ? "ok" : "fail"
                  }
                  ionIcon="server-outline"
                />
                {/* Retry button */}
                <Pressable
                  onPress={runDeltaTest}
                  disabled={deltaApiStatus === "running"}
                  style={({ pressed }) => [panelStyles.retryBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={9}
                    color="rgba(255,255,255,0.3)"
                    style={{ opacity: deltaApiStatus === "running" ? 0.4 : 1 }}
                  />
                  <Text style={panelStyles.retryBtnText}>Retry</Text>
                </Pressable>

                {/* Error detail */}
                {deltaApiStatus === "fail" && deltaTestResult?.error && (
                  <Text style={panelStyles.deltaDetail} numberOfLines={2}>
                    {deltaTestResult.error.length > 100
                      ? deltaTestResult.error.slice(0, 100) + "…"
                      : deltaTestResult.error}
                  </Text>
                )}

                {/* Success detail */}
                {deltaApiStatus === "ok" && deltaTestResult?.usdtBalance && (
                  <Text style={panelStyles.deltaDetailSuccess}>
                    {deltaTestResult.envName === "india" ? "India" : "International"}
                    {" · USDT balance: "}{deltaTestResult.usdtBalance}
                  </Text>
                )}
              </View>
            )}
          </View>
        ))}
      </View>

      {/* No credentials banner */}
      {st.loaded && !anyConfigured && (
        <View style={panelStyles.noneConfigured}>
          <Ionicons name="warning-outline" size={12} color="rgba(249,115,22,0.7)" style={{ flexShrink: 0 }} />
          <Text style={panelStyles.noneConfiguredText}>
            No credentials configured. Import a file to enable broker connections.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "92%",
    backgroundColor: "rgba(13,17,23,0.97)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
    // shadow
    shadowColor: "#00FFB4",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 60,
    elevation: 20,
  },
  topAccent: {
    height: 1,
    backgroundColor: "rgba(0,255,180,0.4)",
    // gradient approximation via a thin colored line
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 4,
    flexShrink: 0,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(0,255,180,0.1)",
    borderWidth: 1,
    borderColor: "rgba(0,255,180,0.2)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  headerSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 0,
  },
});

// ── Upload screen styles ───────────────────────────────────────────────────────

const uploadStyles = StyleSheet.create({
  container: { gap: 16 },
  securityNote: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0,255,180,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,255,180,0.12)",
    alignItems: "flex-start",
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 18,
  },
  pasteArea: {
    gap: 12,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    borderStyle: "dashed",
    backgroundColor: "rgba(255,255,255,0.02)",
    alignItems: "center",
  },
  pasteHeader: {
    alignItems: "center",
    gap: 6,
  },
  pasteTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
  },
  pasteSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
  },
  textArea: {
    width: "100%",
    minHeight: 120,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    textAlignVertical: "top",
  },
  pasteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0,255,180,0.08)",
    borderWidth: 1,
    borderColor: "rgba(0,255,180,0.2)",
  },
  pasteBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#00FFB4",
  },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
    alignItems: "flex-start",
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: "#EF4444",
    lineHeight: 16,
  },
  formatBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  formatLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  formatPre: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 11,
    backgroundColor: "rgba(0,255,180,0.2)",
    borderWidth: 1,
    borderColor: "rgba(0,255,180,0.3)",
  },
  importBtnDisabled: {
    backgroundColor: "rgba(0,255,180,0.06)",
    borderColor: "rgba(0,255,180,0.12)",
  },
  importBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00FFB4",
  },
  importBtnTextDisabled: {
    color: "rgba(0,255,180,0.3)",
  },
});

// ── Review screen styles ───────────────────────────────────────────────────────

const reviewStyles = StyleSheet.create({
  container: { gap: 16 },
  fileInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  fileName: {
    flex: 1,
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  keysBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(0,255,180,0.1)",
  },
  keysBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#00FFB4",
  },
  groupsContainer: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 0.8,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  groupIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  groupLabel: {
    fontSize: 13,
    flex: 1,
  },
  groupCount: {
    fontSize: 10,
    fontWeight: "600",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  toggleBtnText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
  },
  valuesBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 6,
  },
  valueRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  valueKey: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "rgba(255,255,255,0.4)",
    flexShrink: 0,
    minWidth: 180,
  },
  valueVal: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "rgba(255,255,255,0.65)",
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 4,
  },
  backBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
  },
  nextBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 11,
    backgroundColor: "rgba(0,255,180,0.2)",
    borderWidth: 1,
    borderColor: "rgba(0,255,180,0.3)",
  },
  nextBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00FFB4",
  },
});

// ── Confirm screen styles ──────────────────────────────────────────────────────

const confirmStyles = StyleSheet.create({
  container: { gap: 16 },
  warningBox: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(249,115,22,0.07)",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.2)",
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#F97316",
  },
  warningBody: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
    lineHeight: 18,
  },
  warningCount: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
  },
  infoBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
    alignItems: "flex-start",
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: "#EF4444",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 4,
  },
  backBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
  },
  confirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 11,
    backgroundColor: "#00FFB4",
    shadowColor: "#00FFB4",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 6,
  },
  confirmBtnSaving: {
    backgroundColor: "rgba(0,255,180,0.1)",
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0B1017",
  },
  confirmBtnTextSaving: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(0,255,180,0.5)",
  },
});

// ── Done screen styles ─────────────────────────────────────────────────────────

const doneStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0,255,180,0.1)",
    borderWidth: 1.5,
    borderColor: "rgba(0,255,180,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    alignItems: "center",
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#00FFB4",
  },
  sub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
  },
  hintBox: {
    width: "100%",
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(0,255,180,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,255,180,0.12)",
  },
  hintText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 18,
  },
  hintEmphasis: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
  },
  doneBtn: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 11,
    backgroundColor: "rgba(0,255,180,0.1)",
    borderWidth: 1,
    borderColor: "rgba(0,255,180,0.25)",
    alignItems: "center",
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00FFB4",
  },
});

// ── CheckChip styles ───────────────────────────────────────────────────────────

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  chipLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

// ── ConnectionStatusPanel styles ───────────────────────────────────────────────

const panelStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  panelHeaderIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(0,255,180,0.1)",
    borderWidth: 1,
    borderColor: "rgba(0,255,180,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  panelHeaderTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
  },
  serviceList: {},
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  serviceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  serviceLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    flex: 1,
  },
  loadingDots: {
    fontSize: 11,
    color: "rgba(255,255,255,0.2)",
  },
  serviceRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  testBtnText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
  },
  testResult: {
    fontSize: 10,
  },
  configuredText: {
    fontSize: 11,
    fontWeight: "600",
  },
  deltaSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 30,
    paddingRight: 16,
    paddingBottom: 10,
    paddingTop: 6,
    flexWrap: "wrap",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginLeft: "auto",
  },
  retryBtnText: {
    fontSize: 9,
    color: "rgba(255,255,255,0.3)",
  },
  deltaDetail: {
    width: "100%",
    marginTop: 4,
    fontSize: 10,
    color: "rgba(239,68,68,0.7)",
    lineHeight: 14,
  },
  deltaDetailSuccess: {
    width: "100%",
    marginTop: 4,
    fontSize: 10,
    color: "rgba(0,255,180,0.55)",
    lineHeight: 14,
  },
  noneConfigured: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  noneConfiguredText: {
    flex: 1,
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    lineHeight: 16,
  },
});
