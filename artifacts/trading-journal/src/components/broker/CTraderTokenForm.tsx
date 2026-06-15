import { useState } from "react";
import { Loader2, XCircle, Eye, EyeOff, RefreshCw, ExternalLink } from "lucide-react";

interface Props {
  onSuccess: () => void;
  onError: (msg: string) => void;
}

export function CTraderTokenForm({ onSuccess, onError }: Props) {
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  const canSubmit = accessToken.trim().length > 10 && !isLoading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/ctrader/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accessToken: accessToken.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        const msg = data.error ?? `HTTP ${res.status}: connection failed`;
        setLocalError(msg);
        onError(msg);
      } else {
        onSuccess();
      }
    } catch (err) {
      const msg = String(err);
      setLocalError(msg);
      onError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "12px 14px", borderRadius: 10,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  };
  const inputStyle: React.CSSProperties = {
    flex: 1, background: "transparent", border: "none", outline: "none",
    fontSize: 14, color: "rgba(255,255,255,0.9)",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase" as const, letterSpacing: "0.06em",
    marginBottom: 6, display: "block",
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }} autoComplete="off">
      {/* Instructions */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", borderRadius: 12,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", margin: 0, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
          How to get your access token
        </p>
        {[
          "Go to id.ctrader.com and sign in",
          "Open your app → Tokens → Create new token",
          "Copy the access token and paste it below",
        ].map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{
              flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              width: 20, height: 20, borderRadius: "50%", fontSize: 11, fontWeight: 600, marginTop: 1,
              background: "rgba(239,68,68,0.15)", color: "#EF4444",
            }}>{i + 1}</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>{step}</span>
          </div>
        ))}
        <a
          href="https://id.ctrader.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, color: "#EF4444", textDecoration: "none",
            marginTop: 4,
          }}
        >
          <ExternalLink size={12} /> Open id.ctrader.com
        </a>
      </div>

      {/* Token input */}
      <div>
        <label style={labelStyle}>Access Token</label>
        <div style={fieldStyle}>
          <input
            type={showToken ? "text" : "password"}
            value={accessToken}
            onChange={e => setAccessToken(e.target.value)}
            placeholder="Paste your cTrader access token"
            disabled={isLoading}
            autoComplete="new-password"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => setShowToken(v => !v)}
            style={{ color: "rgba(255,255,255,0.35)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {/* Error */}
      {localError && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <XCircle size={15} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: "#EF4444", margin: 0, lineHeight: 1.5 }}>{localError}</p>
        </div>
      )}

      {/* Submit */}
      <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
        {localError && (
          <button
            type="button"
            onClick={() => { setLocalError(""); setAccessToken(""); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10,
              fontSize: 13, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
            }}
          >
            <RefreshCw size={13} /> Retry
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "14px 0", borderRadius: 12, fontSize: 14, fontWeight: 600,
            background: canSubmit
              ? "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)"
              : "rgba(239,68,68,0.2)",
            color: canSubmit ? "#fff" : "rgba(255,255,255,0.4)",
            border: "none", cursor: canSubmit ? "pointer" : "not-allowed",
            boxShadow: canSubmit ? "0 0 24px rgba(239,68,68,0.25)" : "none",
          }}
        >
          {isLoading
            ? <><Loader2 size={15} className="animate-spin" /> Connecting…</>
            : "Connect cTrader"}
        </button>
      </div>
    </form>
  );
}
