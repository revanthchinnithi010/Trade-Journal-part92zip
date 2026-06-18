/**
 * BrokerIntegrationModal — full-screen popup for broker integrations.
 * Tab architecture: cTrader | Delta | Fusion Markets (future-ready).
 * Opened from the Plug button in MiniControlBar.
 * Closing the modal does NOT disconnect — connections survive.
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Wifi, Zap, Globe } from "lucide-react";
import { CtraderWidget } from "@/components/charts/CtraderWidget";
import { BrokerListContent } from "@/components/broker/BrokerSelectModal";
import { useBrokerStore } from "@/store/brokerStore";

type BrokerTab = "ctrader" | "delta" | "fusion";

const TABS: { id: BrokerTab; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: "ctrader", label: "cTrader",       icon: Wifi    },
  { id: "delta",   label: "Delta",          icon: Zap,   badge: "Δ" },
  { id: "fusion",  label: "Fusion Markets", icon: Globe              },
];

function DeltaTabContent({ onClose }: { onClose: () => void }) {
  const { loadAccounts } = useBrokerStore();
  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  return (
    <div style={{ padding: "0 0 16px" }}>
      <BrokerListContent onClose={onClose} />
    </div>
  );
}

function FusionTabContent() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "60px 24px", gap: 14, textAlign: "center",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 16, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.16)",
      }}>
        <Globe style={{ width: 22, height: 22, color: "#60a5fa" }} />
      </div>
      <div>
        <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.80)" }}>
          Fusion Markets
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.50)", lineHeight: 1.6 }}>
          Integration coming soon.<br />
          Fusion Markets support will appear here when available.
        </p>
      </div>
      <div style={{
        padding: "6px 14px", borderRadius: 99,
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

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const modal = (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9200,
        background: "rgba(8,9,15,0.96)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        display: "flex", flexDirection: "column",
        overflowY: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "center",
        padding: "14px 16px 0",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        {/* Title */}
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)" }}>
            Broker Integrations
          </span>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer", touchAction: "manipulation",
          }}
          title="Close (connection stays active)"
        >
          <X style={{ width: 16, height: 16, color: "rgba(255,255,255,0.60)" }} />
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "flex-end",
        padding: "0 4px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        {TABS.map(tab => {
          const active = tab.id === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "11px 14px 12px", border: "none", background: "transparent",
                cursor: "pointer", position: "relative", flexShrink: 0,
                touchAction: "manipulation",
              }}
            >
              <Icon style={{ width: 13, height: 13, color: active ? "#f59e0b" : "rgba(148,163,184,0.40)", flexShrink: 0 }} />
              <span style={{
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? "#f59e0b" : "rgba(148,163,184,0.50)",
                transition: "color 0.15s",
              }}>
                {tab.label}
              </span>
              {tab.badge && (
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: active ? "#f59e0b" : "rgba(148,163,184,0.30)",
                  background: active ? "rgba(245,158,11,0.12)" : "rgba(148,163,184,0.07)",
                  border: `1px solid ${active ? "rgba(245,158,11,0.22)" : "rgba(148,163,184,0.10)"}`,
                  borderRadius: 4, padding: "1px 4px",
                }}>
                  {tab.badge}
                </span>
              )}
              {active && (
                <div style={{
                  position: "absolute", bottom: 0, left: "12%", right: "12%",
                  height: 2, borderRadius: "2px 2px 0 0", background: "#f59e0b",
                }} />
              )}
            </button>
          );
        })}

        {/* Connection-survives hint */}
        <div style={{
          marginLeft: "auto", padding: "0 12px 10px",
          display: "flex", alignItems: "flex-end",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: "rgba(148,163,184,0.28)", fontStyle: "italic" }}>
            Closing keeps connection active
          </span>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 32px" }}>
        {activeTab === "ctrader" && <CtraderWidget />}
        {activeTab === "delta"   && <DeltaTabContent onClose={onClose} />}
        {activeTab === "fusion"  && <FusionTabContent />}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
