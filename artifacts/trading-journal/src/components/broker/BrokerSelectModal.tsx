import { useEffect } from "react";
import { X, Plug, Trash2 } from "lucide-react";
import { BROKERS } from "@/types/broker";
import { useBrokerStore } from "@/store/brokerStore";

export function BrokerSelectModal() {
  const {
    accounts, loadAccounts, connect, deleteAccount,
    closeSelectModal, openAuthModal, activeAccount,
  } = useBrokerStore();

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) closeSelectModal(); }}
    >
      <div
        className="w-full sm:w-[400px] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{
          background: "hsl(var(--background))",
          border: "1px solid var(--surface-btn-border)",
          maxHeight: "85dvh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(57,91,67,0.15)" }}>
          <div className="flex items-center gap-2">
            <Plug className="w-4 h-4" style={{ color: "#B7FF5A" }} />
            <span className="text-sm font-bold text-white">Connect Broker</span>
          </div>
          <button onClick={closeSelectModal}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.07] text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 min-h-0" style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
          {/* Saved accounts */}
          {accounts.length > 0 && (
            <div className="px-5 pt-4 pb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "rgba(167,184,169,0.5)" }}>
                Saved Accounts
              </p>
              <div className="flex flex-col gap-2">
                {accounts.map(acc => {
                  const broker = BROKERS.find(b => b.id === acc.broker_id);
                  const isActive = activeAccount?.id === acc.id;
                  return (
                    <div key={acc.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: isActive ? "rgba(183,255,90,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${isActive ? "rgba(183,255,90,0.25)" : "rgba(57,91,67,0.2)"}` }}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-black overflow-hidden"
                        style={{ background: broker?.image ? "transparent" : broker?.color + "22", color: broker?.color }}>
                        {broker?.image ? <img src={broker.image} alt={broker.name} className="w-full h-full object-cover" /> : broker?.logo}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-white leading-none">{broker?.name}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "rgba(167,184,169,0.5)" }}>
                          {acc.label || "No label"} {isActive && <span style={{ color: "#B7FF5A" }}>• Connected</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isActive && (
                          <button
                            onClick={() => { connect(acc); closeSelectModal(); }}
                            className="h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors"
                            style={{ background: "#B7FF5A", color: "#07110D" }}>
                            Connect
                          </button>
                        )}
                        <button
                          onClick={() => deleteAccount(acc.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition-colors"
                          style={{ color: "rgba(239,68,68,0.6)" }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add new broker */}
          <div className="px-5 pt-4 pb-6">
            <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "rgba(167,184,169,0.5)" }}>
              Add Account
            </p>
            <div className="flex flex-col gap-2">
              {BROKERS.map(broker => (
                <button key={broker.id}
                  onClick={() => openAuthModal(broker.id)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-left group"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(57,91,67,0.2)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg font-black overflow-hidden"
                    style={{ background: broker.image ? "transparent" : broker.color + "22", color: broker.color }}>
                    {broker.image ? <img src={broker.image} alt={broker.name} className="w-full h-full object-cover" /> : broker.logo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-white">{broker.name}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(167,184,169,0.55)" }}>{broker.description}</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full shrink-0"
                    style={{ background: "rgba(57,91,67,0.2)", color: "rgba(167,184,169,0.7)" }}>
                    + Add
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
