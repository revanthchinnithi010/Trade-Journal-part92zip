/**
 * ProfileSettingsPage — full-screen settings overlay pushed from the Profile page.
 *
 * ANIMATION ENGINE: pure CSS transitions on `transform: translateX` only.
 * GPU compositor thread — zero JS frame budget consumed during animation.
 *
 *   Enter: translateX(+100%) → translateX(0)   240ms cubic-bezier(0.22,1,0.36,1)
 *   Exit:  translateX(0)     → translateX(+100%) 210ms cubic-bezier(0.4,0,0.6,1)
 *
 * Mirrors the ProfilePage lifecycle (double-RAF open, timeout close, popstate back).
 */

import React, { memo, useEffect, useRef, useState } from "react";
import { ArrowLeft, Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeMode } from "@/contexts/ThemeContext";
import { SidebarSystemSections } from "./SidebarSystemSections";

/* ─── animation constants ──────────────────────────────────────────────────── */

const EASE_OPEN  = "cubic-bezier(0.22,1,0.36,1)";
const EASE_CLOSE = "cubic-bezier(0.4,0,0.6,1)";
const DUR_OPEN   = 240;
const DUR_CLOSE  = 210;

/* ─── theme options ─────────────────────────────────────────────────────────── */

const THEME_OPTIONS: {
  mode: ThemeMode; label: string; sub: string; Icon: React.ElementType;
}[] = [
  { mode: "light",  label: "Light",          sub: "Always use light theme",   Icon: Sun     },
  { mode: "dark",   label: "Dark",           sub: "Always use dark theme",    Icon: Moon    },
  { mode: "system", label: "System Default", sub: "Follow device preference", Icon: Monitor },
];

/* ─── layout helpers ────────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.13em",
      textTransform: "uppercase", padding: "18px 20px 8px",
      color: "rgba(148,163,184,0.45)", lineHeight: 1,
    }}>
      {children}
    </p>
  );
}

function Card({
  children, noPad, style,
}: {
  children: React.ReactNode;
  noPad?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background:   "#121212",
      border:       "1px solid rgba(255,255,255,0.07)",
      borderRadius: 20,
      overflow:     "hidden",
      ...(!noPad ? { padding: "0 0 4px" } : {}),
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ─── props ─────────────────────────────────────────────────────────────────── */

export interface ProfileSettingsPageProps {
  open:    boolean;
  onClose: () => void;
}

/* ─── main component ─────────────────────────────────────────────────────────── */

export const ProfileSettingsPage = memo(function ProfileSettingsPage({
  open, onClose,
}: ProfileSettingsPageProps) {
  const [rendered, setRendered] = useState(open);
  const [visible,  setVisible]  = useState(false);

  const { themeMode, setThemeMode } = useTheme();

  /* keep latest onClose in a ref so effects never stale-close */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  /* ── mount/unmount lifecycle ──────────────────────────────────────────────── */
  useEffect(() => {
    if (open) {
      setRendered(true);
      /* Double-RAF: let browser paint the initial off-screen position first,
         then trigger the CSS transition from translateX(100%) → 0. */
      const id = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true))
      );
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const id = setTimeout(() => setRendered(false), DUR_CLOSE + 40);
      return () => clearTimeout(id);
    }
  }, [open]);

  /* ── Android hardware back ────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ tjProfileSettings: true }, "");
    const h = () => onCloseRef.current();
    window.addEventListener("popstate", h);
    return () => {
      window.removeEventListener("popstate", h);
      if (window.history.state?.tjProfileSettings) window.history.back();
    };
  }, [open]);

  /* ── ESC ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!rendered) return null;

  return (
    <div
      style={{
        /* ── fixed overlay — sits on top of ProfilePage ── */
        position:                 "fixed",
        inset:                    0,
        zIndex:                   201,           /* one above ProfilePage's 200 */

        /* ── AMOLED black — identical to ProfilePage ── */
        background:               "#000000",

        /* ── GPU compositor transition: slide from right ── */
        transform:                visible ? "translateX(0)" : "translateX(100%)",
        transition:               visible
          ? `transform ${DUR_OPEN}ms ${EASE_OPEN}`
          : `transform ${DUR_CLOSE}ms ${EASE_CLOSE}`,
        willChange:               "transform",
        backfaceVisibility:       "hidden",
        WebkitBackfaceVisibility: "hidden",

        /* ── layout ── */
        display:                  "flex",
        flexDirection:            "column",
        overflow:                 "hidden",
        paddingBottom:            "env(safe-area-inset-bottom)",
      }}
    >
      {/* ── Sticky header ───────────────────────────────────────────────────── */}
      <header
        style={{
          height:         60,
          flexShrink:     0,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        "0 12px",
          background:     "#000000",
          borderBottom:   "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Back */}
        <button
          onClick={onClose}
          aria-label="Back"
          style={{
            width: 40, height: 40, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.06)",
            border:     "1px solid rgba(255,255,255,0.09)",
            color:      "rgba(255,255,255,0.72)",
            cursor:     "pointer",
          }}
        >
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </button>

        {/* Title */}
        <span style={{
          fontSize: 16, fontWeight: 700,
          color: "rgba(255,255,255,0.92)",
          letterSpacing: "-0.02em",
        }}>
          Settings
        </span>

        {/* Right placeholder — keeps title visually centered */}
        <div style={{ width: 40 }} />
      </header>

      {/* ── Scrollable content ──────────────────────────────────────────────── */}
      <div
        style={{
          flex:                    1,
          overflowY:               "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior:      "contain",
        }}
      >
        <div
          style={{
            maxWidth:      480,
            margin:        "0 auto",
            padding:       "0 16px 32px",
            display:       "flex",
            flexDirection: "column",
            gap:           16,
          }}
        >
          {/* ── Appearance ──────────────────────────────────────────────────── */}
          <Card>
            <SectionLabel>Appearance</SectionLabel>
            <div style={{ padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
              {THEME_OPTIONS.map(({ mode, label, sub, Icon }) => {
                const active = themeMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setThemeMode(mode)}
                    style={{
                      display: "flex", alignItems: "center", gap: 13,
                      padding: "11px 12px", borderRadius: 14,
                      background: active ? "rgba(165,180,252,0.10)" : "transparent",
                      border:     active ? "1px solid rgba(165,180,252,0.22)" : "1px solid transparent",
                      cursor: "pointer", transition: "background 100ms",
                      textAlign: "left", width: "100%",
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: active ? "rgba(165,180,252,0.18)" : "rgba(255,255,255,0.06)",
                      border:     active ? "1px solid rgba(165,180,252,0.30)" : "1px solid rgba(255,255,255,0.09)",
                    }}>
                      <Icon style={{ width: 15, height: 15, color: active ? "#a5b4fc" : "rgba(148,163,184,0.70)" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: active ? "#e0e7ff" : "rgba(255,255,255,0.80)" }}>
                        {label}
                      </p>
                      <p style={{ fontSize: 11, color: "rgba(148,163,184,0.55)", marginTop: 2 }}>
                        {sub}
                      </p>
                    </div>
                    {active && (
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: "#a5b4fc", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Check style={{ width: 11, height: 11, color: "#1e1b4b", strokeWidth: 3 }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* ── System Status + Backup ───────────────────────────────────────── */}
          <Card>
            <SectionLabel>System</SectionLabel>
            <div style={{ paddingBottom: 8 }}>
              <SidebarSystemSections open={open} />
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
});
