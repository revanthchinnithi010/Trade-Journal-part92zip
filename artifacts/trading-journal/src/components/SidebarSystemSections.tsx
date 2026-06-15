import { useState, useEffect, useRef, useCallback } from "react";
import {
  Database, Activity, Bot, Copy, Check,
  Download, Upload, Server, RefreshCw, Wifi, WifiOff,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface SystemStatus {
  db:       "ok" | "error" | "loading";
  ctrader:  "connected" | "disconnected" | "loading";
  delta:    "connected" | "disconnected" | "loading";
  telegram: "configured" | "not_configured" | "loading";
}

interface ServerInfo {
  ip:          string | null;
  redirectUri: string | null;
  loading:     boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const DOT_COLOR: Record<string, string> = {
  ok:             "#10b981",
  connected:      "#10b981",
  configured:     "#10b981",
  error:          "#ef4444",
  disconnected:   "#ef4444",
  not_configured: "#94a3b8",
  loading:        "#94a3b8",
};

const BADGE_LABEL: Record<string, string> = {
  ok:             "Connected",
  connected:      "Connected",
  configured:     "Configured",
  error:          "Error",
  disconnected:   "Disconnected",
  not_configured: "Not Configured",
  loading:        "…",
};

const BADGE_COLOR: Record<string, { bg: string; text: string }> = {
  ok:             { bg: "rgba(16,185,129,0.14)", text: "#34d399" },
  connected:      { bg: "rgba(16,185,129,0.14)", text: "#34d399" },
  configured:     { bg: "rgba(16,185,129,0.14)", text: "#34d399" },
  error:          { bg: "rgba(239,68,68,0.14)",  text: "#f87171" },
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

// ── Shared section header ────────────────────────────────────────────────────

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

export function SidebarSystemSections({ open }: Props) {
  const [status, setStatus] = useState<SystemStatus>({
    db:       "loading",
    ctrader:  "loading",
    delta:    "loading",
    telegram: "loading",
  });
  const [serverInfo, setServerInfo] = useState<ServerInfo>({ ip: null, redirectUri: null, loading: true });
  const [exportBusy, setExportBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [exportResult, setExportResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const [health, ct, dlt, tg] = await Promise.all([
        fetch("/api/health").then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/ctrader/status").then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/delta/status").then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/telegram/status").then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (!mountedRef.current) return;
      setStatus({
        db:       health?.database?.connected ? "ok" : "error",
        ctrader:  ct?.connected ? "connected" : "disconnected",
        delta:    dlt?.connected ? "connected" : "disconnected",
        telegram: tg?.configured ? "configured" : "not_configured",
      });
    } catch { /* ignore */ }
  }, []);

  const fetchServerInfo = useCallback(async () => {
    try {
      const [ipRes, cfgRes] = await Promise.all([
        fetch("/api/my-ip").then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/ctrader/config").then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (!mountedRef.current) return;
      setServerInfo({
        ip:          ipRes?.ip ?? null,
        redirectUri: cfgRes?.redirectUri ?? null,
        loading:     false,
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
    pollingRef.current = setInterval(fetchStatus, 30_000);
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [open, fetchStatus, fetchServerInfo]);

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

      {/* ── Divider ── */}
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
          <StatusRow icon={Activity}  label="cTrader"         status={status.ctrader}  />
          <StatusRow icon={Wifi}      label="Delta Exchange"  status={status.delta}    />
          <StatusRow icon={Bot}       label="Telegram"        status={status.telegram} />
        </div>
      </div>

      {/* ── Section 2: Server IP & Redirect URL ── */}
      <div>
        <SectionLabel>Server Info</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px" }}>
          <CopyField label="Backend Server IP"         value={serverInfo.ip}          loading={serverInfo.loading} />
          <CopyField label="cTrader Redirect URL"      value={serverInfo.redirectUri} loading={serverInfo.loading} />
        </div>
      </div>

      {/* ── Section 3: Backup & Restore ── */}
      <div>
        <SectionLabel>Backup & Restore</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 4px" }}>
          {/* Toast */}
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

          {/* Export */}
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

          {/* Import */}
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
