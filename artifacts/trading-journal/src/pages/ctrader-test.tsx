import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Plug, PlugZap, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronRight, Copy, Check, FlaskConical,
  Loader2, Wifi, WifiOff, Key, Users, UserCheck, BookOpen,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type LogLevel = "info" | "success" | "error" | "warn" | "step";

interface LogEntry {
  ts:    number;
  level: LogLevel;
  msg:   string;
  data?: unknown;
}

interface OAuthConfig {
  configured:  boolean;
  redirectUri: string;
  authUrl:     string | null;
}

interface TokenStatus {
  ok:           boolean;
  masked_token: string | null;
  expires_at:   number;
  expired:      boolean;
  error?:       string;
}

interface OAuthStatus {
  connected:  boolean;
  expires_at?: number;
  expired?:    boolean;
  updated_at?: string;
  error?:      string;
}

interface AccountsResult {
  ok:           boolean;
  http_status:  number;
  accounts:     unknown;
  raw?:         string;
  note?:        string;
  error?:       string;
  endpoint_url?: string;
}

interface SymbolsResult {
  ok:          boolean;
  http_status?: number;
  count?:      number;
  sample?:     unknown[];
  raw?:        string;
  note?:       string;
  error?:      string;
}

type StepState = "idle" | "loading" | "success" | "error";

const LOG_COLORS: Record<LogLevel, string> = {
  info:    "rgba(148,163,184,0.85)",
  success: "#34d399",
  error:   "#f87171",
  warn:    "#fbbf24",
  step:    "#60a5fa",
};

const STEP_ICON: Record<string, React.ElementType> = {
  config:   Wifi,
  token:    Key,
  accounts: Users,
  auth:     UserCheck,
  symbols:  BookOpen,
};

function ts(epoch: number): string {
  return new Date(epoch * 1000).toLocaleString();
}

function fmtTime(epoch: number): string {
  const d = new Date(epoch);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
}

function StepCard({
  icon: Icon,
  title,
  state,
  children,
}: {
  icon: React.ElementType;
  title: string;
  state: StepState;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const stateColor =
    state === "success" ? "#34d399"
    : state === "error" ? "#f87171"
    : state === "loading" ? "#fbbf24"
    : "rgba(148,163,184,0.50)";

  const stateIcon =
    state === "success" ? CheckCircle2
    : state === "error" ? XCircle
    : state === "loading" ? Clock
    : Clock;
  const StateIcon = stateIcon;

  return (
    <div style={{
      background:   "rgba(255,255,255,0.03)",
      border:       `1px solid rgba(255,255,255,${state === "idle" ? "0.06" : "0.10"})`,
      borderRadius: 14,
      overflow:     "hidden",
    }}>
      <button
        onClick={() => setExpanded(p => !p)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <Icon style={{ width: 14, height: 14, color: "rgba(148,163,184,0.70)" }} />
        </div>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
          {title}
        </span>
        <StateIcon style={{ width: 15, height: 15, color: stateColor, flexShrink: 0 }} />
        {expanded
          ? <ChevronDown style={{ width: 13, height: 13, color: "rgba(148,163,184,0.40)" }} />
          : <ChevronRight style={{ width: 13, height: 13, color: "rgba(148,163,184,0.40)" }} />
        }
      </button>
      {expanded && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function MonoBox({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const doCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(148,163,184,0.45)" }}>
        {label}
      </span>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 6,
        background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "7px 10px",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <span style={{
          flex: 1, fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.70)",
          wordBreak: "break-all", lineHeight: 1.5,
        }}>
          {value}
        </span>
        {copyable && (
          <button
            onClick={doCopy}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, marginTop: 1 }}
          >
            {copied
              ? <Check style={{ width: 12, height: 12, color: "#34d399" }} />
              : <Copy style={{ width: 12, height: 12, color: "rgba(148,163,184,0.40)" }} />
            }
          </button>
        )}
      </div>
    </div>
  );
}

function Badge({
  label, color, bg, dot = true,
}: { label: string; color: string; bg: string; dot?: boolean }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 99, background: bg,
      border: `1px solid ${color}33`,
    }}>
      {dot && (
        <span style={{
          width: 5, height: 5, borderRadius: "50%", background: color,
          boxShadow: `0 0 6px ${color}99`, flexShrink: 0,
        }} />
      )}
      <span style={{ fontSize: 10, fontWeight: 600, color }}>{label}</span>
    </div>
  );
}

function ActionBtn({
  onClick, loading, disabled, children, variant = "primary",
}: {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "primary" | "danger" | "ghost";
}) {
  const styles: Record<string, { bg: string; border: string; color: string }> = {
    primary: { bg: "rgba(59,130,246,0.14)", border: "rgba(59,130,246,0.28)", color: "#60a5fa"  },
    danger:  { bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.22)",  color: "#f87171"  },
    ghost:   { bg: "rgba(255,255,255,0.05)",border: "rgba(255,255,255,0.10)",color: "rgba(255,255,255,0.65)" },
  };
  const s = styles[variant]!;
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "7px 13px", borderRadius: 9, fontSize: 12, fontWeight: 600,
        background: s.bg, border: `1px solid ${s.border}`, color: s.color,
        cursor: (loading || disabled) ? "default" : "pointer",
        opacity: (loading || disabled) ? 0.55 : 1,
        transition: "opacity 0.12s",
      }}
    >
      {loading
        ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
        : null
      }
      {children}
    </button>
  );
}

export default function CtraderTestPage() {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef      = useRef<HTMLDivElement>(null);
  const popupRef        = useRef<Window | null>(null);

  const [config,   setConfig]   = useState<OAuthConfig | null>(null);
  const [oaStatus, setOaStatus] = useState<OAuthStatus | null>(null);
  const [tokenSt,  setTokenSt]  = useState<TokenStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountsResult | null>(null);
  const [symbols,  setSymbols]  = useState<SymbolsResult | null>(null);
  const [accountIdInput, setAccountIdInput] = useState("");

  const [stepStates, setStepStates] = useState<Record<string, StepState>>({
    config: "idle", token: "idle", accounts: "idle", symbols: "idle",
  });
  const [oauthLoading,   setOauthLoading]   = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [symbolsLoading,  setSymbolsLoading]  = useState(false);

  const log = useCallback((level: LogLevel, msg: string, data?: unknown) => {
    const entry: LogEntry = { ts: Date.now(), level, msg, data };
    setLogs(p => [...p, entry]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const loadConfig = useCallback(async () => {
    log("step", "Fetching OAuth config…");
    setStepStates(p => ({ ...p, config: "loading" }));
    try {
      const res = await fetch(`${BASE}/api/ctrader/oauth/config`);
      const data = (await res.json()) as OAuthConfig;
      if (!mountedRef.current) return;
      setConfig(data);
      if (data.configured) {
        log("success", `Config OK — Redirect URI: ${data.redirectUri}`);
        setStepStates(p => ({ ...p, config: "success" }));
      } else {
        log("warn", "CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET not set in Secrets");
        setStepStates(p => ({ ...p, config: "error" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Config fetch failed: ${String(err)}`);
      setStepStates(p => ({ ...p, config: "error" }));
    }
  }, [log]);

  const loadStatus = useCallback(async () => {
    try {
      const [statusRes, tokenRes] = await Promise.all([
        fetch(`${BASE}/api/ctrader/oauth/status`),
        fetch(`${BASE}/api/ctrader/oauth/token`),
      ]);
      const statusData = (await statusRes.json()) as OAuthStatus;
      const tokenData  = (await tokenRes.json()) as TokenStatus;
      if (!mountedRef.current) return;
      setOaStatus(statusData);
      setTokenSt(tokenData);
      if (statusData.connected) {
        log("info", `Token in DB — expires ${ts(statusData.expires_at ?? 0)}${statusData.expired ? " [EXPIRED]" : ""}`);
        setStepStates(p => ({
          ...p,
          token: statusData.expired ? "error" : "success",
        }));
      } else {
        setStepStates(p => ({ ...p, token: "idle" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("warn", `Status fetch: ${String(err)}`);
    }
  }, [log]);

  useEffect(() => {
    log("info", "cTrader OAuth Test Page loaded");
    loadConfig();
    loadStatus();
  }, [loadConfig, loadStatus, log]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== "ctrader_oauth_result") return;
      if (e.data.status === "success") {
        log("success", `OAuth popup success — token: ${e.data.maskedToken ?? "?"}, expires: ${ts(e.data.expiresAt ?? 0)}`);
        popupRef.current = null;
        loadStatus();
      } else {
        log("error", `OAuth popup error: ${e.data.message ?? "unknown"}`);
      }
      setOauthLoading(false);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [loadStatus, log]);

  const startOAuth = useCallback(async () => {
    if (!config?.authUrl) {
      log("error", "No auth URL — ensure CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET are set");
      return;
    }
    if (oauthLoading) return;
    log("step", "Opening OAuth popup…");
    setOauthLoading(true);
    const w    = 520;
    const h    = 680;
    const left = Math.round(window.screenX + (window.outerWidth  - w) / 2);
    const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open(
      config.authUrl,
      "ctrader_oauth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`,
    );
    if (!popup) {
      log("error", "Popup blocked — allow popups for this page");
      setOauthLoading(false);
      return;
    }
    popupRef.current = popup;
    log("info", `Popup opened — URL: ${config.authUrl.slice(0, 80)}…`);
    const poll = setInterval(() => {
      if (popup.closed) {
        clearInterval(poll);
        if (mountedRef.current) {
          log("warn", "Popup closed (no postMessage received — check callback)");
          setOauthLoading(false);
          loadStatus();
        }
      }
    }, 600);
  }, [config, oauthLoading, loadStatus, log]);

  const handleRefresh = useCallback(async () => {
    if (refreshLoading) return;
    setRefreshLoading(true);
    log("step", "Requesting token refresh…");
    try {
      const res  = await fetch(`${BASE}/api/ctrader/oauth/refresh`, { method: "POST" });
      const data = await res.json() as { ok: boolean; expires_at?: number; error?: string };
      if (!mountedRef.current) return;
      if (data.ok) {
        log("success", `Token refreshed — expires: ${ts(data.expires_at ?? 0)}`);
        await loadStatus();
      } else {
        log("error", `Refresh failed: ${data.error}`);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Refresh error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setRefreshLoading(false);
    }
  }, [refreshLoading, loadStatus, log]);

  const handleDisconnect = useCallback(async () => {
    if (disconnectLoading) return;
    setDisconnectLoading(true);
    log("step", "Disconnecting — clearing stored tokens…");
    try {
      await fetch(`${BASE}/api/ctrader/oauth/disconnect`, { method: "POST" });
      if (!mountedRef.current) return;
      log("success", "Disconnected — tokens cleared from DB");
      setOaStatus(null);
      setTokenSt(null);
      setAccounts(null);
      setSymbols(null);
      setStepStates({ config: stepStates.config, token: "idle", accounts: "idle", symbols: "idle" });
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Disconnect error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setDisconnectLoading(false);
    }
  }, [disconnectLoading, stepStates.config, log]);

  const fetchAccounts = useCallback(async () => {
    if (accountsLoading) return;
    setAccountsLoading(true);
    log("step", "Fetching cTrader account list via REST API…");
    setStepStates(p => ({ ...p, accounts: "loading" }));
    try {
      const res  = await fetch(`${BASE}/api/ctrader/accounts`);
      const data = (await res.json()) as AccountsResult;
      if (!mountedRef.current) return;
      setAccounts(data);
      if (data.ok) {
        log("success", `Accounts received — HTTP ${data.http_status}`);
        log("info", `Raw response: ${(data.raw ?? "").slice(0, 300)}`);
        setStepStates(p => ({ ...p, accounts: "success" }));
      } else {
        log("warn", `Accounts HTTP ${data.http_status}: ${data.error ?? (data.raw ?? "").slice(0, 200)}`);
        if (data.note) log("info", `Note: ${data.note}`);
        setStepStates(p => ({ ...p, accounts: "error" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Account fetch error: ${String(err)}`);
      setStepStates(p => ({ ...p, accounts: "error" }));
    } finally {
      if (mountedRef.current) setAccountsLoading(false);
    }
  }, [accountsLoading, log]);

  const fetchSymbols = useCallback(async () => {
    if (symbolsLoading || !accountIdInput.trim()) return;
    setSymbolsLoading(true);
    const id = accountIdInput.trim();
    log("step", `Fetching symbol list for ctidTraderAccountId: ${id}`);
    setStepStates(p => ({ ...p, symbols: "loading" }));
    try {
      const res  = await fetch(`${BASE}/api/ctrader/oauth/symbols/${encodeURIComponent(id)}`);
      const data = (await res.json()) as SymbolsResult;
      if (!mountedRef.current) return;
      setSymbols(data);
      if (data.ok) {
        log("success", `Symbols received — ${data.count} total`);
        if (data.sample?.length) {
          log("info", `Sample: ${JSON.stringify(data.sample.slice(0, 5))}`);
        }
        setStepStates(p => ({ ...p, symbols: "success" }));
      } else {
        log("warn", `Symbols HTTP ${data.http_status ?? "?"}: ${data.error ?? (data.raw ?? "").slice(0, 200)}`);
        if (data.note) log("info", `Note: ${data.note}`);
        setStepStates(p => ({ ...p, symbols: "error" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Symbol fetch error: ${String(err)}`);
      setStepStates(p => ({ ...p, symbols: "error" }));
    } finally {
      if (mountedRef.current) setSymbolsLoading(false);
    }
  }, [symbolsLoading, accountIdInput, log]);

  const connected = oaStatus?.connected && !oaStatus.expired;

  return (
    <div style={{
      minHeight: "100%", padding: "24px 20px 32px",
      maxWidth: 820, margin: "0 auto",
      display: "flex", flexDirection: "column", gap: 20,
    }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(183,255,90,0.10)", border: "1px solid rgba(183,255,90,0.20)",
        }}>
          <FlaskConical style={{ width: 18, height: 18, color: "#B7FF5A" }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
            cTrader OAuth Test
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.65)", marginTop: 2 }}>
            Step-by-step OAuth 2.0 flow — uses the live .replit.app domain as redirect URI
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {connected && (
            <ActionBtn onClick={handleRefresh} loading={refreshLoading} variant="ghost">
              <RefreshCw style={{ width: 12, height: 12 }} />
              Refresh Token
            </ActionBtn>
          )}
          <ActionBtn onClick={loadConfig} variant="ghost">
            <RefreshCw style={{ width: 12, height: 12 }} />
            Reload Config
          </ActionBtn>
          {connected && (
            <ActionBtn onClick={handleDisconnect} loading={disconnectLoading} variant="danger">
              <WifiOff style={{ width: 12, height: 12 }} />
              Disconnect
            </ActionBtn>
          )}
        </div>
      </div>

      {/* ── Overall Status Banner ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "11px 14px", borderRadius: 12,
        background: connected
          ? "rgba(16,185,129,0.07)" : "rgba(148,163,184,0.05)",
        border: `1px solid ${connected ? "rgba(16,185,129,0.20)" : "rgba(255,255,255,0.08)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {connected
            ? <Plug style={{ width: 14, height: 14, color: "#34d399" }} />
            : <PlugZap style={{ width: 14, height: 14, color: "rgba(148,163,184,0.50)" }} />
          }
          <span style={{ fontSize: 12, fontWeight: 600, color: connected ? "#34d399" : "rgba(148,163,184,0.70)" }}>
            {connected ? "Connected" : oaStatus?.connected ? "Token Expired" : "Not Connected"}
          </span>
        </div>
        {config && (
          <Badge
            label={config.configured ? "Credentials Configured" : "Credentials Missing"}
            color={config.configured ? "#34d399" : "#f87171"}
            bg={config.configured ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"}
          />
        )}
        {oaStatus?.connected && oaStatus.expires_at && (
          <span style={{ fontSize: 11, color: "rgba(148,163,184,0.55)", marginLeft: "auto" }}>
            {oaStatus.expired ? "⚠️ Expired" : "Expires"}: {ts(oaStatus.expires_at)}
          </span>
        )}
      </div>

      {/* ── Step 1: OAuth Config ── */}
      <StepCard icon={STEP_ICON.config!} title="Step 1 — OAuth Configuration" state={stepStates.config!}>
        {config ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge
                label={config.configured ? "Client ID Set" : "Client ID Missing"}
                color={config.configured ? "#34d399" : "#f87171"}
                bg={config.configured ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"}
              />
              <Badge
                label={config.configured ? "Client Secret Set" : "Client Secret Missing"}
                color={config.configured ? "#34d399" : "#f87171"}
                bg={config.configured ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"}
              />
            </div>
            <MonoBox label="Redirect URI" value={config.redirectUri} copyable />
            {config.authUrl && (
              <MonoBox label="Auth URL Preview" value={config.authUrl.slice(0, 120) + (config.authUrl.length > 120 ? "…" : "")} />
            )}
            {!config.configured && (
              <div style={{
                padding: "10px 12px", borderRadius: 9, fontSize: 11, lineHeight: 1.6,
                background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)",
                color: "rgba(255,255,255,0.70)",
              }}>
                Set <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4 }}>CTRADER_CLIENT_ID</code> and{" "}
                <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4 }}>CTRADER_CLIENT_SECRET</code> in the{" "}
                <strong>Secrets</strong> panel, then reload config.
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(148,163,184,0.55)" }}>
            <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
            Loading config…
          </div>
        )}
      </StepCard>

      {/* ── Step 2: OAuth Flow ── */}
      <StepCard icon={STEP_ICON.token!} title="Step 2 — Run OAuth Flow" state={stepStates.token!}>
        {connected ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Badge label="Access Token Received" color="#34d399" bg="rgba(16,185,129,0.10)" />
              {oaStatus?.expired
                ? <Badge label="EXPIRED" color="#f87171" bg="rgba(239,68,68,0.10)" dot={false} />
                : <Badge label="Valid" color="#34d399" bg="rgba(16,185,129,0.10)" dot={false} />
              }
            </div>
            {tokenSt?.masked_token && (
              <MonoBox label="Access Token (masked)" value={tokenSt.masked_token} copyable />
            )}
            {oaStatus?.expires_at && (
              <MonoBox label="Expires At" value={ts(oaStatus.expires_at)} />
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.60)", lineHeight: 1.6 }}>
              Click <strong>Start OAuth</strong> to open the cTrader authorization popup.
              The redirect URI above must be registered in your cTrader Open API app settings.
            </p>
            <ActionBtn
              onClick={startOAuth}
              loading={oauthLoading}
              disabled={!config?.configured || !config.authUrl}
            >
              <PlugZap style={{ width: 13, height: 13 }} />
              {oauthLoading ? "Waiting for popup…" : "Start OAuth →"}
            </ActionBtn>
          </div>
        )}
        {/* Reconnect even when connected */}
        {connected && (
          <div style={{ marginTop: 4 }}>
            <ActionBtn
              onClick={startOAuth}
              loading={oauthLoading}
              disabled={!config?.configured || !config.authUrl}
              variant="ghost"
            >
              <RefreshCw style={{ width: 12, height: 12 }} />
              Reconnect (new OAuth flow)
            </ActionBtn>
          </div>
        )}
      </StepCard>

      {/* ── Step 3: Account List ── */}
      <StepCard icon={STEP_ICON.accounts!} title="Step 3 — Account List" state={stepStates.accounts!}>
        {!oaStatus?.connected ? (
          <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.50)" }}>
            Complete Step 2 first.
          </p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.60)", lineHeight: 1.6 }}>
              Calls <code style={{ background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4 }}>
                GET /v2/tradingaccounts?accessToken=…
              </code>
            </p>
            <ActionBtn onClick={fetchAccounts} loading={accountsLoading}>
              <Users style={{ width: 12, height: 12 }} />
              Fetch Accounts
            </ActionBtn>
            {accounts && (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge
                    label={`HTTP ${accounts.http_status}`}
                    color={accounts.ok ? "#34d399" : "#fbbf24"}
                    bg={accounts.ok ? "rgba(16,185,129,0.10)" : "rgba(245,158,11,0.10)"}
                    dot={false}
                  />
                  <Badge
                    label={accounts.ok ? "Success" : "Failed"}
                    color={accounts.ok ? "#34d399" : "#f87171"}
                    bg={accounts.ok ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"}
                  />
                </div>
                {accounts.error && (
                  <div style={{
                    padding: "10px 12px", borderRadius: 9, fontSize: 11, lineHeight: 1.6,
                    background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)",
                    color: "#f87171",
                  }}>
                    ❌ {accounts.error}
                  </div>
                )}
                {accounts.note && (
                  <div style={{
                    padding: "8px 10px", borderRadius: 8, fontSize: 11, lineHeight: 1.5,
                    background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)",
                    color: "#fbbf24",
                  }}>
                    ℹ️ {accounts.note}
                  </div>
                )}
                {/* Test API Response section */}
                <div style={{
                  display: "flex", flexDirection: "column", gap: 6,
                  padding: "10px 12px", borderRadius: 10,
                  background: "rgba(0,0,0,0.20)", border: "1px solid rgba(255,255,255,0.07)",
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(148,163,184,0.45)" }}>
                    Test API Response
                  </span>
                  {accounts.endpoint_url && (
                    <MonoBox label="Endpoint Called" value={accounts.endpoint_url} copyable />
                  )}
                  <MonoBox
                    label={`Raw Response (HTTP ${accounts.http_status})`}
                    value={
                      accounts.raw
                        ? accounts.raw.slice(0, 800) + (accounts.raw.length > 800 ? "\n…(truncated)" : "")
                        : "(empty response body)"
                    }
                    copyable
                  />
                  {accounts.ok && accounts.accounts !== null && (
                    <MonoBox
                      label="Parsed Accounts JSON"
                      value={JSON.stringify(accounts.accounts, null, 2).slice(0, 800)}
                      copyable
                    />
                  )}
                </div>
              </>
            )}
          </>
        )}
      </StepCard>

      {/* ── Step 4: Account Auth / Symbol List ── */}
      <StepCard icon={STEP_ICON.symbols!} title="Step 4 — Symbol List (ctidTraderAccountId)" state={stepStates.symbols!}>
        {!oaStatus?.connected ? (
          <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.50)" }}>
            Complete Step 2 first.
          </p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.60)", lineHeight: 1.6 }}>
              Calls{" "}
              <code style={{ background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4 }}>
                GET /v2/symbol?ctidTraderAccountId=…
              </code>.
              Enter the numeric account ID from Step 3.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="ctidTraderAccountId"
                value={accountIdInput}
                onChange={e => setAccountIdInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && fetchSymbols()}
                style={{
                  flex: 1, padding: "7px 10px", borderRadius: 8, fontSize: 12,
                  background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.80)", fontFamily: "monospace", outline: "none",
                }}
              />
              <ActionBtn
                onClick={fetchSymbols}
                loading={symbolsLoading}
                disabled={!accountIdInput.trim()}
              >
                <BookOpen style={{ width: 12, height: 12 }} />
                Fetch
              </ActionBtn>
            </div>
            {symbols && (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge
                    label={`HTTP ${symbols.http_status ?? "?"}`}
                    color={symbols.ok ? "#34d399" : "#fbbf24"}
                    bg={symbols.ok ? "rgba(16,185,129,0.10)" : "rgba(245,158,11,0.10)"}
                    dot={false}
                  />
                  {symbols.ok && symbols.count !== undefined && (
                    <Badge
                      label={`${symbols.count} symbols`}
                      color="#60a5fa"
                      bg="rgba(59,130,246,0.10)"
                    />
                  )}
                </div>
                {symbols.note && (
                  <div style={{
                    padding: "8px 10px", borderRadius: 8, fontSize: 11, lineHeight: 1.5,
                    background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.15)",
                    color: "#fbbf24",
                  }}>
                    ℹ️ {symbols.note}
                  </div>
                )}
                <MonoBox
                  label={`Raw Response (HTTP ${symbols.http_status ?? "?"})`}
                  value={
                    symbols.raw
                      ? symbols.raw.slice(0, 800) + (symbols.raw.length > 800 ? "\n…(truncated)" : "")
                      : "(empty response body)"
                  }
                  copyable
                />
              </>
            )}
          </>
        )}
      </StepCard>

      {/* ── Verbose Log Panel ── */}
      <div style={{
        background: "rgba(0,0,0,0.35)", borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(148,163,184,0.50)" }}>
            Verbose Log
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "rgba(148,163,184,0.35)" }}>{logs.length} entries</span>
            <button
              onClick={() => setLogs([])}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: "2px 8px",
                fontSize: 10, color: "rgba(148,163,184,0.40)", borderRadius: 5,
              }}
            >
              Clear
            </button>
          </div>
        </div>
        <div style={{
          maxHeight: 320, overflowY: "auto", padding: "10px 14px",
          display: "flex", flexDirection: "column", gap: 3,
          fontFamily: "monospace", fontSize: 11,
        }}>
          {logs.length === 0 && (
            <span style={{ color: "rgba(148,163,184,0.30)", fontSize: 11 }}>No log entries yet…</span>
          )}
          {logs.map((entry, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ color: "rgba(148,163,184,0.30)", flexShrink: 0, fontSize: 10, paddingTop: 1 }}>
                {fmtTime(entry.ts)}
              </span>
              <span style={{
                flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase", paddingTop: 1,
                color: LOG_COLORS[entry.level],
                minWidth: 44,
              }}>
                {entry.level}
              </span>
              <span style={{ color: LOG_COLORS[entry.level], lineHeight: 1.5, wordBreak: "break-all" }}>
                {entry.msg}
              </span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
