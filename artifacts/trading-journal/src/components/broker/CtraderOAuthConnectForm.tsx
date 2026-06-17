import { useState, useEffect, useRef } from "react";
import { ExternalLink, Loader2, CheckCircle2, XCircle, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { useBrokerStore } from "@/store/brokerStore";
import type { BrokerAccount } from "@/types/broker";

type OAuthStatus = "idle" | "configuring" | "waiting" | "success" | "error" | "not_configured";

interface CtraderOAuthResult {
  type: "ctrader_oauth_result";
  status: "success" | "error";
  message: string | null;
  accountId: number | null;
  apiToken: string | null;
  label: string | null;
}

interface Props {
  onSuccess: () => void;
  onError: (msg: string) => void;
}

export function CtraderOAuthConnectForm({ onSuccess, onError }: Props) {
  const { loadAccounts, connect, closeAuthModal } = useBrokerStore();
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchConfig();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    function onMessage(evt: MessageEvent) {
      const data = evt.data as CtraderOAuthResult;
      if (!data || data.type !== "ctrader_oauth_result") return;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (data.status === "success" && data.accountId && data.apiToken && data.label) {
        handleOAuthSuccess(data.accountId, data.apiToken, data.label);
      } else {
        const msg = data.message ?? "OAuth failed";
        setErrorMsg(msg);
        setOauthStatus("error");
        onError(msg);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function fetchConfig() {
    setOauthStatus("configuring");
    try {
      const res = await fetch("/api/ctrader/oauth/config", { credentials: "include" });
      const data = await res.json() as { configured: boolean; authUrl: string | null };
      if (!data.configured || !data.authUrl) {
        setOauthStatus("not_configured");
        return;
      }
      setAuthUrl(data.authUrl);
      setOauthStatus("idle");
    } catch {
      setOauthStatus("not_configured");
    }
  }

  async function handleOAuthSuccess(accountId: number, apiToken: string, label: string) {
    setOauthStatus("success");
    try {
      await loadAccounts();
      const account: BrokerAccount = {
        id: accountId,
        broker_id: "ctrader",
        label,
        is_active: true,
        api_token: apiToken,
        created_at: new Date().toISOString(),
      };
      connect(account);
      setTimeout(() => {
        onSuccess();
        closeAuthModal();
      }, 1200);
    } catch {
      setErrorMsg("Connected but failed to load account");
      setOauthStatus("error");
    }
  }

  function openOAuthPopup() {
    if (!authUrl) return;
    setOauthStatus("waiting");
    setErrorMsg("");

    const w = 520, h = 680;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open(
      authUrl,
      "ctrader_oauth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`,
    );
    popupRef.current = popup;

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (popup && popup.closed) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        if (oauthStatus === "waiting") {
          setOauthStatus("idle");
        }
      }
    }, 800);
  }

  function handleRetry() {
    setOauthStatus("idle");
    setErrorMsg("");
    fetchConfig();
  }

  if (oauthStatus === "configuring") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 0", color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
        <Loader2 size={16} className="animate-spin" />
        Checking configuration…
      </div>
    );
  }

  if (oauthStatus === "not_configured") {
    return (
      <div style={{
        padding: "20px 16px", borderRadius: 12,
        background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={15} style={{ color: "#F59E0B", flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#F59E0B" }}>cTrader not configured</span>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.6 }}>
          Set <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>CTRADER_CLIENT_ID</code> and{" "}
          <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>CTRADER_CLIENT_SECRET</code> in your environment secrets to enable OAuth.
        </p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: 0 }}>
          Note: OAuth only works from a deployed <code style={{ fontSize: 10 }}>.replit.app</code> domain.
        </p>
      </div>
    );
  }

  if (oauthStatus === "success") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0", textAlign: "center" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 64, height: 64, borderRadius: "50%",
          background: "rgba(37,99,235,0.12)", border: "1.5px solid rgba(37,99,235,0.4)",
        }}>
          <CheckCircle2 size={32} style={{ color: "#60A5FA" }} />
        </div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#60A5FA", margin: 0 }}>cTrader Connected!</p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "6px 0 0" }}>Loading your account…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{
        padding: "16px", borderRadius: 12,
        background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={14} style={{ color: "#60A5FA", flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>Spotware OAuth 2.0</span>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0, lineHeight: 1.6 }}>
          You'll be redirected to the Spotware authorization page in a popup window. Sign in with your cTrader ID to grant access.
        </p>
      </div>

      {oauthStatus === "error" && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: 10,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <XCircle size={14} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: "#EF4444", margin: 0, lineHeight: 1.5 }}>{errorMsg}</p>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          onClick={openOAuthPopup}
          disabled={oauthStatus === "waiting" || !authUrl}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 12,
            fontSize: 14, fontWeight: 600,
            background: oauthStatus === "waiting"
              ? "rgba(37,99,235,0.2)"
              : "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
            color: oauthStatus === "waiting" ? "rgba(255,255,255,0.4)" : "#fff",
            border: "none", cursor: oauthStatus === "waiting" ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: oauthStatus === "waiting" ? "none" : "0 0 24px rgba(37,99,235,0.3)",
            transition: "all 0.2s",
          }}
        >
          {oauthStatus === "waiting" ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Waiting for authorization…
            </>
          ) : (
            <>
              <ExternalLink size={15} />
              Connect with cTrader
            </>
          )}
        </button>

        {oauthStatus === "error" && (
          <button
            onClick={handleRetry}
            style={{
              width: "100%", padding: "10px 0", borderRadius: 10,
              fontSize: 13, fontWeight: 500,
              background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <RefreshCw size={13} /> Try Again
          </button>
        )}
      </div>

      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textAlign: "center", margin: 0, lineHeight: 1.5 }}>
        OAuth login requires a deployed <code style={{ fontSize: 10 }}>.replit.app</code> domain.
        <br />Credentials are encrypted and stored server-side.
      </p>
    </div>
  );
}
