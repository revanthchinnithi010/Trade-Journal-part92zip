import { useState, useEffect, useRef, useCallback } from "react";
import {
  Database, Activity, Bot, Copy, Check,
  Download, Upload, Server, RefreshCw, Wifi, WifiOff, Radio, Eye, EyeOff, X, Loader2,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface SystemStatus {
  db:       "ok" | "error" | "loading";
  delta:    "connected" | "disconnected" | "loading";
  telegram: "configured" | "not_configured" | "loading";
  finnhub:  "connected" | "connecting" | "disconnected" | "invalid_key" | "error" | "loading";
}

interface FinnhubStatus {
  configured: boolean;
  status:     string;
  keyMasked:  string | null;
  source:     "db" | "env" | "none";
}

interface ServerInfo {
  ip:      string | null;
  loading: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const DOT_COLOR: Record<string, string> = {
  ok:             "#10b981",
  connected:      "#10b981",
  configured:     "#10b981",
  error:          "#ef4444",
  invalid_key:    "#ef4444",
  disconnected:   "#ef4444",
  connecting:     "#f59e0b",
  not_configured: "#94a3b8",
  loading:        "#94a3b8",
};

const BADGE_LABEL: Record<string, string> = {
  ok:             "Connected",
  connected:      "Connected",
  configured:     "Configured",
  connecting:     "Connecting…",
  error:          "Error",
  invalid_key:    "Invalid Key",
  disconnected:   "Disconnected",
  not_configured: "Not Configured",
  loading:        "…",
};

const BADGE_COLOR: Record<string, { bg: string; text: string }> = {
  ok:             { bg: "rgba(16,185,129,0.14)", text: "#34d399" },
  connected:      { bg: "rgba(16,185,129,0.14)", text: "#34d399" },
  configured:     { bg: "rgba(16,185,129,0.14)", text: "#34d399" },
  connecting:     { bg: "rgba(245,158,11,0.14)", text: "#fbbf24" },
  error:          { bg: "rgba(239,68,68,0.14)",  text: "#f87171" },
  invalid_key:    { bg: "rgba(239,68,68,0.14)",  text: "#f87171" },
  disconnected:   { bg: "rgba(239,68,68,0.14)",  text: "#f87171" },
  not_configured: { bg: "rgba(148,163,184,0.10)", text: "#94a3b8" },
  loading:        { bg: "rgba(148,163,184,0.10)", text: "#94a3b8" },
};

function StatusRow({
  icon: Icon,
  label,
  status,
}: {
  icon: React.ElementType;
  label: string;
  status: string;
}) {
  const badge = BADGE_COLOR[status] ?? BADGE_COLOR.loading!;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 10px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.025)",
      }}
    >
      <div
        style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Icon style={{ width: 13, height: 13, color: "rgba(148,163,184,0.70)" }} />
      </div>
      <span style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>
        {label}
      </span>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "2px 8px", borderRadius: 99,
          background: badge.bg,
        }}
      >
        <span
          style={{
            width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
            background: DOT_COLOR[status] ?? "#94a3b8",
            boxShadow: status === "connected" || status === "ok" || status === "configured"
              ? "0 0 6px rgba(16,185,129,0.60)" : "none",
          }}
        />
        <span style={{ fontSize: 10, fontWeight: 600, color: badge.text }}>
          {BADGE_LABEL[status] ?? "…"}
        </span>
      </div>
    </div>
  );
}

function CopyField({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | null;
  loading: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(148,163,184,0.45)" }}>
        {label}
      </span>
      <button
        onClick={copy}
        disabled={!value || loading}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 8, padding: "7px 10px", cursor: value ? "pointer" : "default",
          textAlign: "left", width: "100%",
          transition: "background 0.12s",
        }}
        title={value ? "Tap to copy" : undefined}
      >
        <span style={{
          flex: 1, fontSize: 10.5, color: loading ? "rgba(148,163,184,0.40)" : "rgba(255,255,255,0.72)",
          fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.4,
        }}>
          {loading ? "Loading…" : (value ?? "Unavailable")}
        </span>
        {value && (
          <span style={{ flexShrink: 0, color: copied ? "#34d399" : "rgba(148,163,184,0.50)" }}>
            {copied
              ? <Check style={{ width: 13, height: 13 }} />
              : <Copy style={{ width: 13, height: 13 }} />
            }
          </span>
        )}
      </button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
      textTransform: "uppercase", padding: "4px 8px 6px",
      color: "rgba(148,163,184,0.45)", lineHeight: 1,
    }}>
      {children}
    </p>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props {
  open: boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function SidebarSystemSections({ open }: Props) {
  const [status, setStatus] = useState<SystemStatus>({
    db:       "loading",
    delta:    "loading",
    telegram: "loading",
    finnhub:  "loading",
  });
  const [serverInfo, setServerInfo] = useState<ServerInfo>({ ip: null, loading: true });
  const [exportBusy, setExportBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [exportResult, setExportResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // ── Finnhub config state ──────────────────────────────────────────────────
  const [finnhubDetail, setFinnhubDetail]     = useState<FinnhubStatus | null>(null);
  const [finnhubExpanded, setFinnhubExpanded] = useState(false);
  const [finnhubKey, setFinnhubKey]           = useState("");
  const [showKey, setShowKey]                 = useState(false);
  const [finnhubBusy, setFinnhubBusy]         = useState(false);
  const [finnhubMsg, setFinnhubMsg]           = useState<{ ok: boolean; text: string } | null>(null);

  const fetchFinnhubStatus = useCallback(async () => {
    try {
      const data = await fetch(`${BASE}/api/finnhub/status`).then(r => r.ok ? r.json() : null).catch(() => null) as FinnhubStatus | null;
      if (!mountedRef.current || !data) return;
      setFinnhubDetail(data);
      setStatus(p => ({ ...p, finnhub: (data.status as SystemStatus["finnhub"]) ?? "disconnected" }));
    } catch { /* ignore */ }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const [health, dlt, tg] = await Promise.all([
        fetch(`${BASE}/api/health`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BASE}/api/delta/status`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BASE}/api/telegram/status`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (!mountedRef.current) return;
      setStatus(p => ({
        ...p,
        db:       health?.database?.connected ? "ok" : "error",
        delta:    dlt?.connected ? "connected" : "disconnected",
        telegram: tg?.configured ? "configured" : "not_configured",
      }));
    } catch { /* ignore */ }
    fetchFinnhubStatus().catch(() => {});
  }, [fetchFinnhubStatus]);

  const fetchServerInfo = useCallback(async () => {
    try {
      const ipRes = await fetch(`${BASE}/api/my-ip`).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!mountedRef.current) return;
      setServerInfo({
        ip:      ipRes?.ip ?? null,
        loading: false,
      });
    } catch {
      if (mountedRef.current) setServerInfo(p => ({ ...p, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (!open) {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      return;
    }
    fetchStatus();
    fetchServerInfo();
    pollingRef.current = setInterval(fetchStatus, 15_000);
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [open, fetchStatus, fetchServerInfo]);

  const handleFinnhubConnect = useCallback(async () => {
    if (!finnhubKey.trim() || finnhubBusy) return;
    setFinnhubBusy(true);
    setFinnhubMsg(null);
    try {
      const res  = await fetch(`${BASE}/api/finnhub/config`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ apiKey: finnhubKey.trim() }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (!mountedRef.current) return;
      if (data.success) {
        setFinnhubMsg({ ok: true, text: "Finnhub connected!" });
        setFinnhubKey("");
        await fetchFinnhubStatus();
      } else {
        setFinnhubMsg({ ok: false, text: data.error ?? "Connection failed" });
      }
    } catch (err) {
      if (mountedRef.current) setFinnhubMsg({ ok: false, text: String(err) });
    } finally {
      if (mountedRef.current) setFinnhubBusy(false);
      setTimeout(() => { if (mountedRef.current) setFinnhubMsg(null); }, 4000);
    }
  }, [finnhubKey, finnhubBusy, fetchFinnhubStatus]);

  const handleFinnhubDisconnect = useCallback(async () => {
    if (finnhubBusy) return;
    setFinnhubBusy(true);
    try {
      await fetch(`${BASE}/api/finnhub/config`, { method: "DELETE" });
      if (!mountedRef.current) return;
      setFinnhubMsg({ ok: true, text: "Disconnected" });
      await fetchFinnhubStatus();
    } catch { /* ignore */ } finally {
      if (mountedRef.current) setFinnhubBusy(false);
      setTimeout(() => { if (mountedRef.current) setFinnhubMsg(null); }, 3000);
    }
  }, [finnhubBusy, fetchFinnhubStatus]);

  const handleExport = useCallback(async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setExportResult(null);
    try {
      const res = await fetch("/api/backup/export");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      const today = new Date().toISOString().split("T")[0];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `tradevault-backup-${today}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      if (mountedRef.current) setExportResult({ ok: true, msg: "Backup downloaded" });
    } catch (err) {
      if (mountedRef.current) setExportResult({ ok: false, msg: String(err) });
    } finally {
      if (mountedRef.current) setExportBusy(false);
      setTimeout(() => { if (mountedRef.current) setExportResult(null); }, 3500);
    }
  }, [exportBusy]);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportBusy(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res  = await fetch("/api/backup/import", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      if (mountedRef.current) setImportResult({ ok: true, msg: "Restore complete" });
    } catch (err) {
      if (mountedRef.current) setImportResult({ ok: false, msg: String(err) });
    } finally {
      if (mountedRef.current) setImportBusy(false);
      setTimeout(() => { if (mountedRef.current) setImportResult(null); }, 4000);
    }
  }, []);

  const DIVIDER = "rgba(255,255,255,0.07)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>

      <div style={{ height: 1, background: DIVIDER, marginLeft: 8, marginRight: 8 }} />

      {/* ── Section 1: System Status ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 8 }}>
          <SectionLabel>System Status</SectionLabel>
          <button
            onClick={fetchStatus}
            title="Refresh"
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
              color: "rgba(148,163,184,0.45)", display: "flex", alignItems: "center",
            }}
          >
            <RefreshCw style={{ width: 11, height: 11 }} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "0 4px" }}>
          <StatusRow icon={Database}  label="Database"        status={status.db}       />
          <StatusRow icon={Wifi}      label="Delta Exchange"  status={status.delta}    />
          <StatusRow icon={Bot}       label="Telegram"        status={status.telegram} />
          <StatusRow icon={Radio}     label="Finnhub Feed"    status={status.finnhub}  />
        </div>
      </div>

      {/* ── Section 1b: Finnhub Config ── */}
      <div>
        <div
          onClick={() => setFinnhubExpanded(p => !p)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer", userSelect: "none",
          }}
        >
          <SectionLabel>Finnhub / Market Feed</SectionLabel>
          <span style={{ fontSize: 9, color: "rgba(148,163,184,0.40)", paddingRight: 8 }}>
            {finnhubExpanded ? "▲" : "▼"}
          </span>
        </div>

        {finnhubExpanded && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px" }}>
            {finnhubDetail?.configured && (
              <div style={{
                display: "flex", flexDirection: "column", gap: 4,
                padding: "8px 10px", borderRadius: 10,
                background: "rgba(59,130,246,0.07)",
                border: "1px solid rgba(59,130,246,0.16)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "rgba(148,163,184,0.70)" }}>Key</span>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.60)" }}>
                    {finnhubDetail.keyMasked ?? "—"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "rgba(148,163,184,0.70)" }}>Source</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.50)" }}>
                    {finnhubDetail.source === "env" ? "Env variable" : finnhubDetail.source === "db" ? "Database" : "—"}
                  </span>
                </div>
                {finnhubDetail.source !== "env" && (
                  <button
                    onClick={handleFinnhubDisconnect}
                    disabled={finnhubBusy}
                    style={{
                      marginTop: 4, padding: "5px 10px", borderRadius: 8,
                      fontSize: 11, fontWeight: 600, cursor: finnhubBusy ? "default" : "pointer",
                      background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.20)",
                      color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      opacity: finnhubBusy ? 0.6 : 1,
                    }}
                  >
                    {finnhubBusy
                      ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />
                      : <X style={{ width: 11, height: 11 }} />
                    }
                    Disconnect
                  </button>
                )}
              </div>
            )}

            {(!finnhubDetail?.configured || finnhubDetail.source === "db") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {!finnhubDetail?.configured && (
                  <p style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", lineHeight: 1.5, margin: 0 }}>
                    Enter your <a href="https://finnhub.io" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>Finnhub</a> API key to stream real-time prices for Forex, Indices, and Metals.
                  </p>
                )}
                <div style={{ position: "relative" }}>
                  <input
                    type={showKey ? "text" : "password"}
                    value={finnhubKey}
                    onChange={e => setFinnhubKey(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleFinnhubConnect()}
                    placeholder="API key…"
                    style={{
                      width: "100%", boxSizing: "border-box",
                      padding: "7px 32px 7px 10px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.80)",
                      outline: "none", fontFamily: "monospace",
                    }}
                  />
                  <button
                    onClick={() => setShowKey(p => !p)}
                    style={{
                      position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer",
                      color: "rgba(148,163,184,0.45)", padding: 0, display: "flex",
                    }}
                  >
                    {showKey
                      ? <EyeOff style={{ width: 12, height: 12 }} />
                      : <Eye style={{ width: 12, height: 12 }} />
                    }
                  </button>
                </div>
                <button
                  onClick={handleFinnhubConnect}
                  disabled={!finnhubKey.trim() || finnhubBusy}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "7px 12px", borderRadius: 9, fontSize: 12, fontWeight: 600,
                    cursor: (!finnhubKey.trim() || finnhubBusy) ? "default" : "pointer",
                    background: "rgba(59,130,246,0.14)", border: "1px solid rgba(59,130,246,0.28)",
                    color: "#60a5fa", opacity: (!finnhubKey.trim() || finnhubBusy) ? 0.5 : 1,
                    transition: "opacity 0.12s",
                  }}
                >
                  {finnhubBusy
                    ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
                    : <Wifi style={{ width: 12, height: 12 }} />
                  }
                  {finnhubBusy ? "Connecting…" : "Connect"}
                </button>
              </div>
            )}

            {finnhubMsg && (
              <div style={{
                padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500,
                background: finnhubMsg.ok ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)",
                color: finnhubMsg.ok ? "#34d399" : "#f87171",
                border: `1px solid ${finnhubMsg.ok ? "rgba(16,185,129,0.20)" : "rgba(239,68,68,0.20)"}`,
              }}>
                {finnhubMsg.text}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 2: Server IP ── */}
      <div>
        <SectionLabel>Server Info</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px" }}>
          <CopyField label="Backend Server IP" value={serverInfo.ip} loading={serverInfo.loading} />
        </div>
      </div>

      {/* ── Section 3: Backup & Restore ── */}
      <div>
        <SectionLabel>Backup & Restore</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 4px" }}>
          {(exportResult || importResult) && (
            <div style={{
              padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500,
              background: (exportResult?.ok ?? importResult?.ok)
                ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)",
              color: (exportResult?.ok ?? importResult?.ok) ? "#34d399" : "#f87171",
              border: `1px solid ${(exportResult?.ok ?? importResult?.ok) ? "rgba(16,185,129,0.20)" : "rgba(239,68,68,0.20)"}`,
            }}>
              {exportResult?.msg ?? importResult?.msg}
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={exportBusy}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600,
              cursor: exportBusy ? "default" : "pointer",
              background: exportBusy ? "rgba(96,165,250,0.08)" : "rgba(96,165,250,0.12)",
              border: "1px solid rgba(96,165,250,0.22)",
              color: "#60a5fa",
              transition: "background 0.12s",
              opacity: exportBusy ? 0.6 : 1,
            }}
          >
            <Download style={{ width: 13, height: 13, flexShrink: 0 }} />
            {exportBusy ? "Exporting…" : "Export Backup"}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importBusy}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "8px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600,
              cursor: importBusy ? "default" : "pointer",
              background: importBusy ? "rgba(165,180,252,0.06)" : "rgba(165,180,252,0.08)",
              border: "1px solid rgba(165,180,252,0.18)",
              color: "#a5b4fc",
              transition: "background 0.12s",
              opacity: importBusy ? 0.6 : 1,
            }}
          >
            <Upload style={{ width: 13, height: 13, flexShrink: 0 }} />
            {importBusy ? "Restoring…" : "Import Backup"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />
          <p style={{ fontSize: 9.5, color: "rgba(148,163,184,0.35)", padding: "2px 2px 0", lineHeight: 1.4 }}>
            Import merges data without deleting existing records.
          </p>
        </div>
      </div>

      <div style={{ height: 4 }} />
    </div>
  );
}
