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
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        onClick={closeSelectModal}
      />

      {/* Bottom sheet — always anchored to bottom on mobile, centered on desktop */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 51,
          height: "60vh",
          display: "flex",
          flexDirection: "column",
          background: "hsl(var(--background))",
          border: "1px solid var(--surface-btn-border)",
          borderRadius: "24px 24px 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, paddingBottom: 6, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px 14px",
          borderBottom: "1px solid rgba(57,91,67,0.15)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Plug style={{ width: 16, height: 16, color: "#B7FF5A" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Connect Broker</span>
          </div>
          <button
            onClick={closeSelectModal}
            style={{
              width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
              background: "transparent", display: "flex", alignItems: "center", justifyContent: "center",
              color: "rgba(167,184,169,0.6)",
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        } as React.CSSProperties}>

          {/* Saved accounts */}
          {accounts.length > 0 && (
            <div style={{ padding: "16px 20px 8px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(167,184,169,0.5)", marginBottom: 8 }}>
                Saved Accounts
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {accounts.map(acc => {
                  const broker = BROKERS.find(b => b.id === acc.broker_id);
                  const isActive = activeAccount?.id === acc.id;
                  return (
                    <div key={acc.id} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                      borderRadius: 14,
                      background: isActive ? "rgba(183,255,90,0.08)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isActive ? "rgba(183,255,90,0.25)" : "rgba(57,91,67,0.2)"}`,
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: broker?.image ? "transparent" : (broker?.color ?? "") + "22",
                        color: broker?.color, fontSize: 12, fontWeight: 900,
                        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                      }}>
                        {broker?.image ? <img src={broker.image} alt={broker.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : broker?.logo}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "#fff", margin: 0, lineHeight: 1 }}>{broker?.name}</p>
                        <p style={{ fontSize: 10, color: "rgba(167,184,169,0.5)", margin: "3px 0 0" }}>
                          {acc.label || "No label"} {isActive && <span style={{ color: "#B7FF5A" }}>• Connected</span>}
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {!isActive && (
                          <button
                            onClick={() => { connect(acc); closeSelectModal(); }}
                            style={{
                              height: 28, padding: "0 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                              background: "#B7FF5A", color: "#07110D", border: "none", cursor: "pointer",
                            }}>
                            Connect
                          </button>
                        )}
                        <button
                          onClick={() => deleteAccount(acc.id)}
                          style={{
                            width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
                            background: "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                            color: "rgba(239,68,68,0.6)",
                          }}>
                          <Trash2 style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add new broker */}
          <div style={{ padding: "16px 20px 24px" }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(167,184,169,0.5)", marginBottom: 10 }}>
              Add Account
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {BROKERS.map(broker => (
                <button key={broker.id}
                  onClick={() => openAuthModal(broker.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 16px",
                    borderRadius: 14, border: "1px solid rgba(57,91,67,0.2)",
                    background: "rgba(255,255,255,0.03)",
                    cursor: "pointer", textAlign: "left", width: "100%",
                  }}
                  onTouchStart={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
                  onTouchEnd={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: broker.image ? "transparent" : broker.color + "22",
                    color: broker.color, fontSize: 17, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                  }}>
                    {broker.image ? <img src={broker.image} alt={broker.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : broker.logo}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0 }}>{broker.name}</p>
                    <p style={{ fontSize: 11, color: "rgba(167,184,169,0.55)", margin: "3px 0 0" }}>{broker.description}</p>
                  </div>
                  <span style={{
                    fontSize: 10, padding: "4px 10px", borderRadius: 20, flexShrink: 0,
                    background: "rgba(57,91,67,0.2)", color: "rgba(167,184,169,0.7)",
                  }}>
                    + Add
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
