import { useEffect } from "react";
import { X, Plug, Trash2, ChevronLeft } from "lucide-react";
import { BROKERS } from "@/types/broker";
import { useBrokerStore } from "@/store/brokerStore";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Shared broker list content ──────────────────────────────────────────────
function BrokerListContent({ onClose }: { onClose: () => void }) {
  const { accounts, connect, deleteAccount, openAuthModal, activeAccount } = useBrokerStore();

  return (
    <>
      {/* Saved accounts */}
      {accounts.length > 0 && (
        <div style={{ padding: "16px 20px 8px" }}>
          <p style={{
            fontSize: 10, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.08em", color: "rgba(167,184,169,0.5)", marginBottom: 10,
          }}>
            Saved Accounts
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {accounts.map(acc => {
              const broker = BROKERS.find(b => b.id === acc.broker_id);
              const isActive = activeAccount?.id === acc.id;
              return (
                <div key={acc.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                  borderRadius: 14,
                  background: isActive ? "rgba(183,255,90,0.08)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isActive ? "rgba(183,255,90,0.25)" : "rgba(57,91,67,0.2)"}`,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: broker?.image ? "transparent" : (broker?.color ?? "") + "22",
                    color: broker?.color, fontSize: 13, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                  }}>
                    {broker?.image
                      ? <img src={broker.image} alt={broker.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : broker?.logo}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: 0, lineHeight: 1 }}>{broker?.name}</p>
                    <p style={{ fontSize: 11, color: "rgba(167,184,169,0.5)", margin: "4px 0 0" }}>
                      {acc.label || "No label"}
                      {isActive && <span style={{ color: "#B7FF5A" }}> • Connected</span>}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {!isActive && (
                      <button
                        onClick={() => { connect(acc); onClose(); }}
                        style={{
                          height: 30, padding: "0 14px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                          background: "#B7FF5A", color: "#07110D", border: "none", cursor: "pointer",
                        }}>
                        Connect
                      </button>
                    )}
                    <button
                      onClick={() => deleteAccount(acc.id)}
                      style={{
                        width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer",
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
      <div style={{ padding: "16px 20px 32px" }}>
        <p style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "rgba(167,184,169,0.5)", marginBottom: 12,
        }}>
          Add Account
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {BROKERS.map(broker => (
            <button key={broker.id}
              onClick={() => openAuthModal(broker.id)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "16px 18px",
                borderRadius: 16, border: "1px solid rgba(57,91,67,0.2)",
                background: "rgba(255,255,255,0.03)",
                cursor: "pointer", textAlign: "left", width: "100%",
              }}
              onTouchStart={e => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
              onTouchEnd={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                background: broker.image ? "transparent" : broker.color + "22",
                color: broker.color, fontSize: 18, fontWeight: 900,
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
              }}>
                {broker.image
                  ? <img src={broker.image} alt={broker.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : broker.logo}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>{broker.name}</p>
                <p style={{ fontSize: 12, color: "rgba(167,184,169,0.55)", margin: "4px 0 0", lineHeight: 1.4 }}>{broker.description}</p>
              </div>
              <span style={{
                fontSize: 11, padding: "5px 12px", borderRadius: 20, flexShrink: 0,
                background: "rgba(183,255,90,0.1)", color: "#B7FF5A",
                border: "1px solid rgba(183,255,90,0.2)",
                fontWeight: 600,
              }}>
                + Add
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Mobile: full-screen page ─────────────────────────────────────────────────
function MobileBrokerSelectPage() {
  const { closeSelectModal, loadAccounts } = useBrokerStore();
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 200,
      background: "#0B1017",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Mobile header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "0 16px",
        height: 56,
        flexShrink: 0,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(11,16,23,0.98)",
      }}>
        <button
          onClick={closeSelectModal}
          style={{
            width: 36, height: 36, borderRadius: 10, border: "none", cursor: "pointer",
            background: "rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.8)", flexShrink: 0,
          }}
        >
          <ChevronLeft style={{ width: 20, height: 20 }} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <Plug style={{ width: 16, height: 16, color: "#B7FF5A" }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Connect Broker</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1, minHeight: 0,
        overflowY: "auto",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
      } as React.CSSProperties}>
        <BrokerListContent onClose={closeSelectModal} />
      </div>
    </div>
  );
}

// ── Desktop: modal overlay ───────────────────────────────────────────────────
function DesktopBrokerSelectModal() {
  const { closeSelectModal, loadAccounts } = useBrokerStore();
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={e => { if (e.target === e.currentTarget) closeSelectModal(); }}
    >
      <div style={{
        width: 420, maxHeight: "80vh",
        borderRadius: 20,
        background: "hsl(var(--background))",
        border: "1px solid var(--surface-btn-border)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(57,91,67,0.15)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Plug style={{ width: 16, height: 16, color: "#B7FF5A" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Connect Broker</span>
          </div>
          <button onClick={closeSelectModal} style={{
            width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
            background: "transparent", display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(167,184,169,0.6)",
          }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <BrokerListContent onClose={closeSelectModal} />
        </div>
      </div>
    </div>
  );
}

// ── Entry point ──────────────────────────────────────────────────────────────
export function BrokerSelectModal() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileBrokerSelectPage /> : <DesktopBrokerSelectModal />;
}
