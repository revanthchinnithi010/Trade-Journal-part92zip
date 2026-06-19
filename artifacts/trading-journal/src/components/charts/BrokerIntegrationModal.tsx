/**
 * BrokerIntegrationModal — centered sheet popup for broker integrations.
 * Mobile-first: centered dialog, safe area support, no horizontal overflow.
 * Responsive from 320px to 430px (and beyond).
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Wifi, Zap, Globe } from "lucide-react";
import { CtraderWidget } from "@/components/charts/CtraderWidget";
import { BrokerListContent } from "@/components/broker/BrokerSelectModal";
import { useBrokerStore } from "@/store/brokerStore";

type BrokerTab = "ctrader" | "delta" | "fusion";

const TABS: { id: BrokerTab; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: "ctrader", label: "cTrader", icon: Wifi    },
  { id: "delta",   label: "Delta",   icon: Zap,    badge: "Δ" },
  { id: "fusion",  label: "Fusion",  icon: Globe             },
];

function DeltaTabContent({ onClose }: { onClose: () => void }) {
  const { loadAccounts } = useBrokerStore();
  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  return (
    <div style={{ padding: "0 0 8px" }}>
      <BrokerListContent onClose={onClose} />
    </div>
  );
}

function FusionTabContent() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "48px 20px", gap: 14, textAlign: "center",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.16)",
      }}>
        <Globe style={{ width: 20, height: 20, color: "#60a5fa" }} />
      </div>
      <div>
        <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.80)" }}>
          Fusion Markets
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.50)", lineHeight: 1.6 }}>
          Integration coming soon.
          <br />
          Fusion Markets support will appear here when available.
        </p>
      </div>
      <div style={{
        padding: "5px 14px", borderRadius: 99,
        background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.15)",
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#60a5fa" }}>Coming Soon</span>
      </div>
    </div>
  );
}

interface BrokerIntegrationModalProps {
  onClose: () => void;
  initialTab?: BrokerTab;
}

export function BrokerIntegrationModal({ onClose, initialTab = "ctrader" }: BrokerIntegrationModalProps) {
  const [activeTab, setActiveTab] = useState<BrokerTab>(initialTab);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const modal = (
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 9200,
          background: "rgba(5,6,10,0.85)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          animation: "bimBackdropIn 0.18s ease both",
        }}
      />

      {/* ── Centering wrapper ── */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9201,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Safe area padding so dialog stays away from notch/home bar
          paddingTop: "max(12px, env(safe-area-inset-top))",
          paddingRight: "max(12px, env(safe-area-inset-right))",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          paddingLeft: "max(12px, env(safe-area-inset-left))",
          boxSizing: "border-box",
          pointerEvents: "none",
        }}
      >
        {/* ── Dialog card ── */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            // Width: fills viewport on small phones, capped at 520px on larger ones
            width: "min(calc(100vw - 24px), 520px)",
            // Height: up to 88% of dynamic viewport height
            maxHeight: "min(88dvh, 680px)",
            background: "rgba(10,12,16,0.99)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 20,
            boxShadow: [
              "0 0 0 1px rgba(255,255,255,0.04) inset",
              "0 24px 80px rgba(0,0,0,0.75)",
              "0 4px 24px rgba(0,0,0,0.50)",
            ].join(","),
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            pointerEvents: "auto",
            animation: "bimDialogIn 0.22s cubic-bezier(0.32,1.0,0.60,1) both",
            // Hard cap on width to prevent overflow on very narrow screens
            maxWidth: "calc(100vw - 24px)",
            boxSizing: "border-box",
          }}
        >
          {/* ── Header ── */}
          <div style={{
            flexShrink: 0,
            display: "flex", alignItems: "center",
            padding: "14px 14px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            gap: 10,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15, fontWeight: 700,
                color: "rgba(255,255,255,0.90)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                Broker Integrations
              </div>
              <div style={{ fontSize: 10, color: "rgba(148,163,184,0.35)", marginTop: 1 }}>
                Closing keeps your connection active
              </div>
            </div>
            {/* Close — always visible */}
            <button
              onClick={onClose}
              style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.10)",
                cursor: "pointer", touchAction: "manipulation",
              }}
              title="Close"
            >
              <X style={{ width: 15, height: 15, color: "rgba(255,255,255,0.55)" }} />
            </button>
          </div>

          {/* ── Tab segment control ── */}
          <div style={{
            flexShrink: 0,
            padding: "10px 12px 0",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{
              display: "flex",
              background: "rgba(255,255,255,0.05)",
              borderRadius: 10,
              padding: 3,
              border: "1px solid rgba(255,255,255,0.07)",
              marginBottom: 10,
              gap: 2,
            }}>
              {TABS.map(tab => {
                const active = tab.id === activeTab;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      flex: 1, display: "flex", alignItems: "center",
                      justifyContent: "center", gap: 5,
                      padding: "7px 6px",
                      border: "none", borderRadius: 7,
                      cursor: "pointer", touchAction: "manipulation",
                      fontSize: 12, fontWeight: active ? 700 : 500,
                      color: active ? "#fff" : "rgba(148,163,184,0.45)",
                      background: active ? "rgba(245,158,11,0.18)" : "transparent",
                      boxShadow: active ? "0 0 0 1px rgba(245,158,11,0.28)" : "none",
                      transition: "all 0.15s",
                      minWidth: 0, overflow: "hidden",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Icon style={{
                      width: 12, height: 12, flexShrink: 0,
                      color: active ? "#f59e0b" : "rgba(148,163,184,0.38)",
                    }} />
                    <span style={{
                      overflow: "hidden", textOverflow: "ellipsis",
                      color: active ? "#f0c060" : undefined,
                    }}>
                      {tab.label}
                    </span>
                    {tab.badge && (
                      <span style={{
                        fontSize: 8.5, fontWeight: 700,
                        color: active ? "#f59e0b" : "rgba(148,163,184,0.28)",
                        background: active ? "rgba(245,158,11,0.12)" : "rgba(148,163,184,0.06)",
                        border: `1px solid ${active ? "rgba(245,158,11,0.22)" : "rgba(148,163,184,0.08)"}`,
                        borderRadius: 4, padding: "1px 3px", flexShrink: 0,
                      }}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Scrollable content ── */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            // Prevent children from blowing out the width
            maxWidth: "100%",
            boxSizing: "border-box",
          } as React.CSSProperties}>
            <div style={{
              padding: "14px 12px",
              boxSizing: "border-box",
              width: "100%",
              maxWidth: "100%",
              overflow: "hidden",
            }}>
              {activeTab === "ctrader" && <CtraderWidget />}
              {activeTab === "delta"   && <DeltaTabContent onClose={onClose} />}
              {activeTab === "fusion"  && <FusionTabContent />}
            </div>

            {/* Safe area bottom spacer */}
            <div style={{ height: "max(16px, env(safe-area-inset-bottom))" }} />
          </div>
        </div>
      </div>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes bimBackdropIn {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes bimDialogIn {
          from { opacity: 0; transform: translateY(32px) scale(0.97) }
          to   { opacity: 1; transform: translateY(0)    scale(1)    }
        }
        @keyframes spin {
          from { transform: rotate(0deg) }
          to   { transform: rotate(360deg) }
        }
      `}</style>
    </>
  );

  return createPortal(modal, document.body);
}
