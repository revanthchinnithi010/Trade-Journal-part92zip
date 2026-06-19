/**
 * BrokerIntegrationModal — full-screen bottom sheet for broker integrations.
 * Slides up from the bottom, covers the full viewport, safe-area aware.
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Wifi, Zap, Globe } from "lucide-react";
import { CtraderWidget } from "@/components/charts/CtraderWidget";
import { BrokerListContent } from "@/components/broker/BrokerSelectModal";
import { useBrokerStore } from "@/store/brokerStore";

type BrokerTab = "ctrader" | "delta" | "fusion";

const TABS: { id: BrokerTab; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: "ctrader", label: "cTrader", icon: Wifi             },
  { id: "delta",   label: "Delta",   icon: Zap,  badge: "Δ" },
  { id: "fusion",  label: "Fusion",  icon: Globe             },
];

function DeltaTabContent({ onClose }: { onClose: () => void }) {
  const { loadAccounts } = useBrokerStore();
  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  return <BrokerListContent onClose={onClose} />;
}

function FusionTabContent() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "60px 24px", gap: 14, textAlign: "center",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 16,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.18)",
      }}>
        <Globe style={{ width: 22, height: 22, color: "#60a5fa" }} />
      </div>
      <div>
        <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.82)" }}>
          Fusion Markets
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.50)", lineHeight: 1.6 }}>
          Integration coming soon.
          <br />
          Fusion Markets support will appear here when available.
        </p>
      </div>
      <span style={{
        padding: "5px 14px", borderRadius: 99,
        background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.16)",
        fontSize: 11, fontWeight: 600, color: "#60a5fa",
      }}>Coming Soon</span>
    </div>
  );
}

interface BrokerIntegrationModalProps {
  onClose: () => void;
  initialTab?: BrokerTab;
}

export function BrokerIntegrationModal({ onClose, initialTab = "ctrader" }: BrokerIntegrationModalProps) {
  const [activeTab, setActiveTab] = useState<BrokerTab>(initialTab);

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const modal = (
    <>
      {/* ── Backdrop (tap to close) ── */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 9200,
          background: "rgba(0,0,0,0.60)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          animation: "bimBdIn 0.20s ease both",
        }}
      />

      {/* ── Sheet ── */}
      <div
        style={{
          position: "fixed",
          left: 0, right: 0, bottom: 0,
          zIndex: 9201,
          // Full height minus a small peek at the top so users know they can dismiss
          height: "calc(100dvh - 44px)",
          display: "flex", flexDirection: "column",
          background: "#0b0f14",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          border: "1px solid rgba(255,255,255,0.09)",
          borderBottom: "none",
          boxShadow: "0 -16px 60px rgba(0,0,0,0.70)",
          overflow: "hidden",
          animation: "bimSheetIn 0.28s cubic-bezier(0.32,1.0,0.55,1) both",
        }}
      >
        {/* ── Drag handle ── */}
        <div style={{
          flexShrink: 0,
          display: "flex", justifyContent: "center", alignItems: "center",
          paddingTop: 10, paddingBottom: 4,
        }}>
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: "rgba(255,255,255,0.18)",
          }} />
        </div>

        {/* ── Header ── */}
        <div style={{
          flexShrink: 0,
          display: "flex", alignItems: "center",
          padding: "10px 16px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
              Broker Integrations
            </div>
            <div style={{ fontSize: 11, color: "rgba(148,163,184,0.38)", marginTop: 1 }}>
              Closing keeps your connections active
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.10)",
              cursor: "pointer", touchAction: "manipulation",
            }}
          >
            <X style={{ width: 15, height: 15, color: "rgba(255,255,255,0.55)" }} />
          </button>
        </div>

        {/* ── Segment tab bar ── */}
        <div style={{
          flexShrink: 0,
          padding: "10px 14px 0",
        }}>
          <div style={{
            display: "flex",
            background: "rgba(255,255,255,0.05)",
            borderRadius: 10, padding: 3,
            border: "1px solid rgba(255,255,255,0.07)",
            marginBottom: 10, gap: 2,
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
                    padding: "8px 6px",
                    border: "none", borderRadius: 7,
                    cursor: "pointer", touchAction: "manipulation",
                    fontSize: 12, fontWeight: active ? 700 : 500,
                    color: active ? "#f0c060" : "rgba(148,163,184,0.45)",
                    background: active ? "rgba(245,158,11,0.15)" : "transparent",
                    boxShadow: active ? "0 0 0 1px rgba(245,158,11,0.25)" : "none",
                    transition: "all 0.15s",
                    whiteSpace: "nowrap" as const, minWidth: 0,
                  }}
                >
                  <Icon style={{
                    width: 12, height: 12, flexShrink: 0,
                    color: active ? "#f59e0b" : "rgba(148,163,184,0.38)",
                  }} />
                  {tab.label}
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
          {/* thin rule */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 -14px" }} />
        </div>

        {/* ── Scrollable content ── */}
        <div style={{
          flex: 1, minHeight: 0,
          overflowY: "auto", overflowX: "hidden",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        } as React.CSSProperties}>
          <div style={{
            padding: "14px 14px",
            boxSizing: "border-box", width: "100%", maxWidth: "100%", overflow: "hidden",
          }}>
            {activeTab === "ctrader" && <CtraderWidget />}
            {activeTab === "delta"   && <DeltaTabContent onClose={onClose} />}
            {activeTab === "fusion"  && <FusionTabContent />}
          </div>
          {/* Home indicator spacer */}
          <div style={{ height: "max(20px, env(safe-area-inset-bottom))" }} />
        </div>
      </div>

      <style>{`
        @keyframes bimBdIn {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes bimSheetIn {
          from { transform: translateY(100%) }
          to   { transform: translateY(0) }
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
