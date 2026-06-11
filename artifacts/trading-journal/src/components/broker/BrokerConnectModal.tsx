import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, CheckCircle2, XCircle, Loader2, ExternalLink,
  RefreshCw, Eye, EyeOff, Server, ShieldCheck, Wifi,
} from "lucide-react";
import { BROKERS } from "@/types/broker";
import { useBrokerStore } from "@/store/brokerStore";
import type { BrokerAccount } from "@/types/broker";
import { DeltaApiConnectForm } from "./DeltaApiConnectForm";

type Status = "idle" | "loading" | "waiting_oauth" | "success" | "error";

const LS_TOKEN_PREFIX = "tj_broker_token_";

export function BrokerConnectModal() {
  const { authBrokerId, closeAuthModal, loadAccounts, connect } = useBrokerStore();
  const broker = BROKERS.find(b => b.id === authBrokerId);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const [mt5Server, setMt5Server] = useState("");
  const [mt5Login, setMt5Login] = useState("");
  const [mt5Password, setMt5Password] = useState("");
  const [mt5Label, setMt5Label] = useState("");
  const [showMt5Pass, setShowMt5Pass] = useState(false);

  const popupRef = useRef<Window | null>(null);
  const popupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<Status>("idle");

  const stopPopupPoll = useCallback(() => {
    if (popupPollRef.current) { clearInterval(popupPollRef.current); popupPollRef.current = null; }
  }, []);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => () => stopPopupPoll(), [stopPopupPoll]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data) return;
      if (e.data.type === "ctrader_oauth_result") {
        stopPopupPoll();
        popupRef.current?.close();
        popupRef.current = null;
        if (e.data.status === "success") handleCTraderOAuthSuccess();
        else { setStatus("error"); setErrorMsg(String(e.data.message || "cTrader OAuth failed")); }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!broker || !authBrokerId) return null;

  function openOAuthPopup(url: string, windowName: string): Window | null {
    const popup = window.open(url, windowName, "width=560,height=700,resizable=yes,scrollbars=yes");
    if (!popup) {
      setStatus("error");
      setErrorMsg("Popup was blocked. Allow popups for this site and try again.");
      return null;
    }
    popupRef.current = popup;
    setStatus("waiting_oauth");
    popupPollRef.current = setInterval(() => {
      try {
        if (popup.closed && statusRef.current === "waiting_oauth") {
          stopPopupPoll();
          setStatus("error");
          setErrorMsg("OAuth window was closed before completing.");
        }
      } catch { /* cross-origin */ }
    }, 800);
    return popup;
  }

  async function startCTraderOAuth() {
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/ctrader/config", { credentials: "include" });
      const data = await res.json() as { configured: boolean; authUrl: string | null; error?: string };
      if (!data.configured || !data.authUrl) {
        setStatus("error");
        setErrorMsg(
          !data.configured
            ? "cTrader OAuth is not configured. Set CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET."
            : "Could not generate OAuth URL — try again",
        );
        return;
      }
      openOAuthPopup(data.authUrl, "ctrader_oauth");
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
    }
  }

  async function handleCTraderOAuthSuccess() {
    setStatus("loading");
    try {
      const res = await fetch("/api/ctrader/pending-account", { credentials: "include" });
      const data = await res.json() as {
        ok: boolean; accountId?: number; apiToken?: string; label?: string; error?: string;
      };
      if (!data.ok || !data.accountId || !data.apiToken) {
        setStatus("error");
        setErrorMsg(data.error ?? "Could not retrieve account details — try again");
        return;
      }
      try { localStorage.setItem(`${LS_TOKEN_PREFIX}${data.accountId}`, data.apiToken); } catch { /* ignore */ }
      setStatus("success");
      await loadAccounts();
      setTimeout(() => {
        connect({
          id: data.accountId!,
          broker_id: "ctrader",
          label: data.label ?? "cTrader",
          is_active: true,
          api_token: data.apiToken!,
          created_at: new Date().toISOString(),
        });
        closeAuthModal();
      }, 1200);
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
    }
  }

  async function handleMt5Connect(e: React.FormEvent) {
    e.preventDefault();
    if (!mt5Server.trim() || !mt5Login.trim() || !mt5Password.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/broker-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          broker_id: "mt5",
          mt5_server: mt5Server.trim(),
          mt5_login: mt5Login.trim(),
          mt5_password: mt5Password.trim(),
          label: mt5Label.trim() || "MT5 Account",
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
      try { localStorage.setItem(`${LS_TOKEN_PREFIX}${data.account.id}`, data.api_token); } catch { /* ignore */ }
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

  const glassStyle: React.CSSProperties = {
    background: "rgba(18,18,18,0.72)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  };

  const brokerGlow = broker.color + "18";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) closeAuthModal(); }}
    >
      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl flex flex-col"
        style={{ ...glassStyle, boxShadow: `0 0 60px ${brokerGlow}, 0 24px 48px rgba(0,0,0,0.6)`, maxHeight: "90dvh" }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${broker.color}60, transparent)` }}
        />

        <div className="p-6 pb-0 shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-11 h-11 rounded-xl text-lg font-bold flex-shrink-0"
                style={{
                  background: broker.color + "18",
                  border: `1.5px solid ${broker.color}30`,
                  color: broker.color,
                  fontFamily: "monospace",
                }}
              >
                {broker.logo}
              </div>
              <div>
                <h2 className="text-base font-semibold" style={{ color: "rgba(255,255,255,0.95)" }}>
                  {broker.id === "delta" ? "Connect Delta Exchange" :
                   broker.id === "ctrader" ? "Connect cTrader" : "Connect MetaTrader 5"}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {broker.description}
                </p>
              </div>
            </div>
            <button
              onClick={closeAuthModal}
              className="flex-shrink-0 p-1.5 rounded-lg transition-colors ml-3"
              style={{ color: "rgba(255,255,255,0.4)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex items-center gap-4 mt-5 pb-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {[
              { icon: <ShieldCheck size={13} />, label: "AES-256 encrypted" },
              { icon: <Server size={13} />, label: "Backend-only signing" },
              { icon: <Wifi size={13} />, label: "Live WS sync" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span style={{ color: "rgba(0,255,180,0.7)" }}>{item.icon}</span>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
          {broker.id === "delta" && (
            status === "success" ? (
              <SuccessBanner broker={broker} onClose={closeAuthModal} />
            ) : (
              <DeltaApiConnectForm
                onSuccess={closeAuthModal}
                onError={msg => { setStatus("error"); setErrorMsg(msg); }}
              />
            )
          )}

          {broker.id === "ctrader" && (
            status === "success" ? (
              <SuccessBanner broker={broker} onClose={closeAuthModal} />
            ) : (
              <CTraderOAuthPanel
                status={status}
                errorMsg={errorMsg}
                onConnect={startCTraderOAuth}
                onRetry={() => { setStatus("idle"); setErrorMsg(""); }}
              />
            )
          )}

          {broker.id === "mt5" && (
            status === "success" ? (
              <SuccessBanner broker={broker} onClose={closeAuthModal} />
            ) : (
              <Mt5CredentialsForm
                status={status}
                errorMsg={errorMsg}
                mt5Server={mt5Server} setMt5Server={setMt5Server}
                mt5Login={mt5Login} setMt5Login={setMt5Login}
                mt5Password={mt5Password} setMt5Password={setMt5Password}
                mt5Label={mt5Label} setMt5Label={setMt5Label}
                showPass={showMt5Pass} setShowPass={setShowMt5Pass}
                onSubmit={handleMt5Connect}
                onRetry={() => { setStatus("idle"); setErrorMsg(""); }}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function SuccessBanner({ broker, onClose }: { broker: { name: string }; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div
        className="flex items-center justify-center w-16 h-16 rounded-full"
        style={{ background: "rgba(0,255,180,0.1)", border: "1.5px solid rgba(0,255,180,0.3)" }}
      >
        <CheckCircle2 size={32} style={{ color: "#00FFB4" }} />
      </div>
      <div>
        <p className="text-base font-semibold" style={{ color: "#00FFB4" }}>
          Connected to {broker.name}
        </p>
        <p className="mt-1.5 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          Syncing positions, orders & balance…
        </p>
      </div>
      <button
        onClick={onClose}
        className="mt-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{ background: "rgba(0,255,180,0.1)", color: "#00FFB4", border: "1px solid rgba(0,255,180,0.25)" }}
      >
        Done
      </button>
    </div>
  );
}

function CTraderOAuthPanel({
  status, errorMsg, onConnect, onRetry,
}: {
  status: Status;
  errorMsg: string;
  onConnect: () => void;
  onRetry: () => void;
}) {
  const isLoading = status === "loading" || status === "waiting_oauth";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>HOW IT WORKS</p>
        {["You'll be redirected to cTrader to authorize", "We store an encrypted OAuth token", "Live trades, positions & balance sync via WS"].map((step, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span
              className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold mt-0.5"
              style={{ background: "rgba(239,68,68,0.15)", color: "#EF4444" }}
            >{i + 1}</span>
            <span className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{step}</span>
          </div>
        ))}
      </div>

      {status === "waiting_oauth" && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <Loader2 size={15} className="animate-spin" style={{ color: "#EF4444" }} />
          <span className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>Waiting for OAuth authorization…</span>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <XCircle size={15} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
          <p className="text-sm" style={{ color: "#EF4444" }}>{errorMsg}</p>
        </div>
      )}

      <div className="flex gap-3">
        {status === "error" && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <RefreshCw size={13} /> Retry
          </button>
        )}
        <button
          onClick={onConnect}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: isLoading ? "rgba(239,68,68,0.2)" : "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)",
            color: isLoading ? "rgba(255,255,255,0.4)" : "#fff",
            cursor: isLoading ? "not-allowed" : "pointer",
            boxShadow: isLoading ? "none" : "0 0 24px rgba(239,68,68,0.25)",
          }}
        >
          {isLoading ? <><Loader2 size={14} className="animate-spin" /> Connecting…</> : <>
            <ExternalLink size={14} /> Connect via cTrader OAuth
          </>}
        </button>
      </div>
    </div>
  );
}

function Mt5CredentialsForm({
  status, errorMsg, mt5Server, setMt5Server, mt5Login, setMt5Login,
  mt5Password, setMt5Password, mt5Label, setMt5Label,
  showPass, setShowPass, onSubmit, onRetry,
}: {
  status: Status;
  errorMsg: string;
  mt5Server: string; setMt5Server: (v: string) => void;
  mt5Login: string; setMt5Login: (v: string) => void;
  mt5Password: string; setMt5Password: (v: string) => void;
  mt5Label: string; setMt5Label: (v: string) => void;
  showPass: boolean; setShowPass: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onRetry: () => void;
}) {
  const isLoading = status === "loading";
  const canSubmit = mt5Server.trim() && mt5Login.trim() && mt5Password.trim() && !isLoading;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" autoComplete="off">
      {[
        { label: "SERVER", placeholder: "e.g. MetaQuotes-Demo", value: mt5Server, onChange: setMt5Server, type: "text" },
        { label: "LOGIN", placeholder: "e.g. 123456789", value: mt5Login, onChange: setMt5Login, type: "text" },
      ].map(({ label, placeholder, value, onChange, type }) => (
        <div key={label} className="flex flex-col gap-1.5">
          <label className="text-xs font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</label>
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <input
              type={type}
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={isLoading}
              autoComplete="off"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[rgba(255,255,255,0.25)]"
              style={{ color: "rgba(255,255,255,0.9)" }}
            />
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>PASSWORD</label>
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input
            type={showPass ? "text" : "password"}
            value={mt5Password}
            onChange={e => setMt5Password(e.target.value)}
            placeholder="MT5 account password"
            disabled={isLoading}
            autoComplete="new-password"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[rgba(255,255,255,0.25)]"
            style={{ color: "rgba(255,255,255,0.9)" }}
          />
          <button type="button" onClick={() => setShowPass(!showPass)} style={{ color: "rgba(255,255,255,0.35)" }}>
            {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
          LABEL <span style={{ color: "rgba(255,255,255,0.28)" }}>(optional)</span>
        </label>
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input
            type="text"
            value={mt5Label}
            onChange={e => setMt5Label(e.target.value)}
            placeholder="e.g. Main MT5"
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[rgba(255,255,255,0.25)]"
            style={{ color: "rgba(255,255,255,0.9)" }}
          />
        </div>
      </div>

      {status === "error" && (
        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <XCircle size={15} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
          <p className="text-sm leading-snug" style={{ color: "#EF4444" }}>{errorMsg}</p>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {status === "error" && (
          <button type="button" onClick={onRetry} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <RefreshCw size={13} /> Retry
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: canSubmit ? "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)" : "rgba(34,197,94,0.2)",
            color: canSubmit ? "#fff" : "rgba(255,255,255,0.4)",
            cursor: canSubmit ? "pointer" : "not-allowed",
            boxShadow: canSubmit ? "0 0 24px rgba(34,197,94,0.25)" : "none",
          }}
        >
          {isLoading ? <><Loader2 size={14} className="animate-spin" /> Connecting…</> : "Connect MetaTrader 5"}
        </button>
      </div>
    </form>
  );
}
