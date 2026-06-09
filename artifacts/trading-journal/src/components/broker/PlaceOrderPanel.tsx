import { useState } from "react";
import { X, ShoppingCart, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";

interface Props {
  symbol: string;
}

export function PlaceOrderPanel({ symbol }: Props) {
  const { setShowPlaceOrder, placeOrder, activeAccount } = useBrokerStore();
  const ticks = useTickStore(s => s.ticks);

  const [side, setSide] = useState<"Buy" | "Sell">("Buy");
  const [orderType, setOrderType] = useState<"Market" | "Limit">("Market");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg, setMsg] = useState("");

  const symKey = symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD";
  const tick = ticks[symKey];
  const livePrice = tick?.price;

  const broker = activeAccount?.broker_id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qty || parseFloat(qty) <= 0) return;
    setStatus("loading");
    setMsg("");
    const result = await placeOrder({
      symbol,
      side,
      orderType,
      qty,
      price: orderType === "Limit" && price ? price : undefined,
      stopLoss: stopLoss || undefined,
      takeProfit: takeProfit || undefined,
      category: "linear",
    });
    if (result.ok) {
      setStatus("success");
      setMsg("Order placed successfully!");
      setQty(""); setPrice(""); setStopLoss(""); setTakeProfit("");
      setTimeout(() => setStatus("idle"), 2500);
    } else {
      setStatus("error");
      setMsg(result.error ?? "Order failed");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const inputCls = {
    background: "#0D1C16",
    border: "1px solid rgba(57,91,67,0.3)",
    borderRadius: 8,
    color: "#F3FFF3",
    fontSize: 12,
    padding: "0 10px",
    height: 34,
    width: "100%",
    outline: "none",
  } as React.CSSProperties;

  const labelCls = "block text-[10px] font-semibold mb-1" as const;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        background: "rgba(5,14,10,0.98)",
        border: "1px solid rgba(57,91,67,0.25)",
        borderRadius: 16,
        width: 280,
        minWidth: 280,
        maxHeight: "calc(100vh - 140px)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(57,91,67,0.15)" }}>
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-3.5 h-3.5" style={{ color: "#B7FF5A" }} />
          <span className="text-[12px] font-bold text-white">Place Order</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
            style={{ background: "rgba(183,255,90,0.1)", color: "#B7FF5A" }}>
            {symbol}
          </span>
        </div>
        <button onClick={() => setShowPlaceOrder(false)}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.06]"
          style={{ color: "rgba(167,184,169,0.5)" }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {/* Live price */}
        {livePrice && (
          <div className="text-center py-1">
            <span className="text-[11px]" style={{ color: "rgba(167,184,169,0.5)" }}>Live: </span>
            <span className="text-[13px] font-bold" style={{ color: "#B7FF5A" }}>
              ${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* Side toggle */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(57,91,67,0.3)" }}>
          {(["Buy", "Sell"] as const).map(s => (
            <button
              key={s} type="button" onClick={() => setSide(s)}
              className="flex-1 h-8 text-[12px] font-bold transition-all"
              style={{
                background: side === s
                  ? s === "Buy" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"
                  : "transparent",
                color: side === s
                  ? s === "Buy" ? "#4ade80" : "#f87171"
                  : "rgba(167,184,169,0.5)",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Order type */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(57,91,67,0.3)" }}>
          {(["Market", "Limit"] as const).map(t => (
            <button
              key={t} type="button" onClick={() => setOrderType(t)}
              className="flex-1 h-7 text-[11px] font-semibold transition-all"
              style={{
                background: orderType === t ? "rgba(183,255,90,0.12)" : "transparent",
                color: orderType === t ? "#B7FF5A" : "rgba(167,184,169,0.5)",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Qty */}
        <div>
          <label className={labelCls} style={{ color: "rgba(167,184,169,0.7)" }}>
            {broker === "delta" ? "Contracts (Qty)" : "Qty (USDT or contracts)"}
          </label>
          <input value={qty} onChange={e => setQty(e.target.value)}
            placeholder="0.001" type="number" min="0" step="any" required style={inputCls} />
        </div>

        {/* Price (only for Limit) */}
        {orderType === "Limit" && (
          <div>
            <label className={labelCls} style={{ color: "rgba(167,184,169,0.7)" }}>Limit Price</label>
            <input value={price} onChange={e => setPrice(e.target.value)}
              placeholder={livePrice ? String(Math.round(livePrice)) : "0"}
              type="number" min="0" step="any" style={inputCls} />
          </div>
        )}

        {/* SL / TP */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls} style={{ color: "rgba(167,184,169,0.7)" }}>Stop Loss</label>
            <input value={stopLoss} onChange={e => setStopLoss(e.target.value)}
              placeholder="Optional" type="number" min="0" step="any" style={inputCls} />
          </div>
          <div>
            <label className={labelCls} style={{ color: "rgba(167,184,169,0.7)" }}>Take Profit</label>
            <input value={takeProfit} onChange={e => setTakeProfit(e.target.value)}
              placeholder="Optional" type="number" min="0" step="any" style={inputCls} />
          </div>
        </div>

        {/* Status */}
        {status === "success" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: "rgba(183,255,90,0.08)", border: "1px solid rgba(183,255,90,0.2)" }}>
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#B7FF5A" }} />
            <p className="text-[11px]" style={{ color: "#B7FF5A" }}>{msg}</p>
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <XCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "#ef4444" }} />
            <p className="text-[11px]" style={{ color: "#f87171" }}>{msg}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={status === "loading" || !qty}
          className="h-9 rounded-xl text-[12px] font-bold transition-all flex items-center justify-center gap-2"
          style={{
            background: side === "Buy" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)",
            color: side === "Buy" ? "#4ade80" : "#f87171",
            border: `1px solid ${side === "Buy" ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
            opacity: !qty ? 0.5 : 1,
          }}
        >
          {status === "loading"
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Placing…</>
            : `${side} ${orderType}`}
        </button>
      </form>
    </div>
  );
}
