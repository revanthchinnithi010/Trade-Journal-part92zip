import { useState } from "react";
import { Eye, EyeOff, Key, Lock, Tag, Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { useBrokerStore } from "@/store/brokerStore";
import type { BrokerAccount } from "@/types/broker";

interface DeltaApiConnectFormProps {
  onSuccess: () => void;
  onError: (msg: string) => void;
}

type FormStatus = "idle" | "connecting" | "success" | "error";

const LS_TOKEN_PREFIX = "tj_broker_token_";

export function DeltaApiConnectForm({ onSuccess, onError }: DeltaApiConnectFormProps) {
  const { loadAccounts, connect } = useBrokerStore();

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [label, setLabel] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [balanceInfo, setBalanceInfo] = useState<string | null>(null);

  const isLoading = status === "connecting";
  const canSubmit = apiKey.trim().length > 0 && apiSecret.trim().length > 0 && !isLoading;

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("connecting");
    setErrorMsg("");
    setBalanceInfo(null);

    try {
      const res = await fetch("/api/broker-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          broker_id: "delta",
          api_key: apiKey.trim(),
          api_secret: apiSecret.trim(),
          label: label.trim() || "Delta Exchange",
        }),
      });

      const data = await res.json() as {
        ok: boolean;
        account?: BrokerAccount & { id: number; broker_id: "delta"; label: string; is_active: boolean; created_at: string };
        api_token?: string;
        error?: string;
        usdtBalance?: string;
      };

      if (!data.ok || !data.account || !data.api_token) {
        const msg = data.error ?? "Connection failed — check your credentials";
        setStatus("error");
        setErrorMsg(msg);
        onError(msg);
        return;
      }

      const accountId = data.account.id;
      const apiToken = data.api_token;

      try { localStorage.setItem(`${LS_TOKEN_PREFIX}${accountId}`, apiToken); } catch { /* ignore */ }

      if (data.usdtBalance !== undefined) {
        setBalanceInfo(`USDT Balance: ${parseFloat(data.usdtBalance).toFixed(2)}`);
      }

      setStatus("success");

      await loadAccounts();

      const account: BrokerAccount = {
        id: accountId,
        broker_id: "delta",
        label: data.account.label ?? "Delta Exchange",
        is_active: true,
        api_token: apiToken,
        created_at: data.account.created_at ?? new Date().toISOString(),
      };

      connect(account);

      try {
        await fetch("/api/broker/delta/ws/start", {
          method: "POST",
          credentials: "include",
          headers: {
            "X-Broker-Account-Id": String(accountId),
            "X-Broker-Token": apiToken,
          },
        });
      } catch { /* WS start failure is non-fatal — polling continues */ }

      setTimeout(() => {
        onSuccess();
      }, 1200);
    } catch (err) {
      const msg = `Network error: ${String(err)}`;
      setStatus("error");
      setErrorMsg(msg);
      onError(msg);
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div
          className="flex items-center justify-center w-16 h-16 rounded-full"
          style={{ background: "rgba(0,255,180,0.12)", border: "1.5px solid rgba(0,255,180,0.3)" }}
        >
          <CheckCircle2 size={32} style={{ color: "#00FFB4" }} />
        </div>
        <div>
          <p className="text-base font-semibold" style={{ color: "#00FFB4" }}>Connected to Delta Exchange</p>
          {balanceInfo && (
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>{balanceInfo}</p>
          )}
          <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            Live positions, orders & balance syncing…
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleConnect} className="flex flex-col gap-4" autoComplete="off">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
          API KEY
        </label>
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg transition-all"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: apiKey ? "1px solid rgba(249,115,22,0.4)" : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Key size={14} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
          <input
            type="text"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Your Delta Exchange API Key"
            disabled={isLoading}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[rgba(255,255,255,0.25)]"
            style={{ color: "rgba(255,255,255,0.9)", fontFamily: "monospace" }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
          API SECRET
        </label>
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg transition-all"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: apiSecret ? "1px solid rgba(249,115,22,0.4)" : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Lock size={14} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
          <input
            type={showSecret ? "text" : "password"}
            value={apiSecret}
            onChange={e => setApiSecret(e.target.value)}
            placeholder="Your Delta Exchange API Secret"
            disabled={isLoading}
            autoComplete="new-password"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[rgba(255,255,255,0.25)]"
            style={{ color: "rgba(255,255,255,0.9)", fontFamily: "monospace" }}
          />
          <button
            type="button"
            onClick={() => setShowSecret(s => !s)}
            className="flex-shrink-0 transition-opacity hover:opacity-80"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
          Secret is encrypted before storage and never exposed in logs.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
          ACCOUNT LABEL <span style={{ color: "rgba(255,255,255,0.28)" }}>(optional)</span>
        </label>
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Tag size={14} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Main Account"
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[rgba(255,255,255,0.25)]"
            style={{ color: "rgba(255,255,255,0.9)" }}
          />
        </div>
      </div>

      {status === "error" && (
        <div
          className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <XCircle size={15} style={{ color: "#EF4444", flexShrink: 0, marginTop: 1 }} />
          <p className="text-sm leading-snug" style={{ color: "#EF4444" }}>{errorMsg}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 pt-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: canSubmit
              ? "linear-gradient(135deg, #F97316 0%, #EA580C 100%)"
              : "rgba(249,115,22,0.2)",
            color: canSubmit ? "#fff" : "rgba(255,255,255,0.4)",
            cursor: canSubmit ? "pointer" : "not-allowed",
            boxShadow: canSubmit ? "0 0 24px rgba(249,115,22,0.25)" : "none",
          }}
        >
          {isLoading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Validating credentials…
            </>
          ) : (
            "Connect to Delta Exchange"
          )}
        </button>

        <a
          href="https://www.delta.exchange/app/account/manageapikeys"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs transition-opacity hover:opacity-80"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          <ExternalLink size={11} />
          Create API keys on delta.exchange
        </a>
      </div>
    </form>
  );
}
