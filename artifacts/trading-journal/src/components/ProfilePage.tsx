/**
 * ProfilePage — full-screen profile experience for mobile.
 *
 * ANIMATION ENGINE: pure CSS transitions on `transform: translateX` only.
 * Runs on the GPU compositor thread — completely independent of JavaScript,
 * the chart tick engine, and any RAF loops. Zero frame drops guaranteed.
 *
 *   Enter: translateX(-100%) → translateX(0)   230ms cubic-bezier(0.22,1,0.36,1)
 *   Exit:  translateX(0)     → translateX(-100%) 210ms cubic-bezier(0.4,0,0.6,1)
 *
 * Lifecycle:
 *   open=true  → set rendered=true, double-RAF → set visible=true (enter transition)
 *   open=false → set visible=false (exit transition), 250ms later rendered=false
 *
 * Android back:
 *   Pushes a history entry on open; listens for popstate to call onClose.
 *   Mirrors the NavigationDrawer pattern exactly.
 */

import React, {
  memo, useEffect, useRef, useState, useCallback,
} from "react";
import {
  ArrowLeft, Settings, Camera,
  Sun, Moon, Monitor, Check,
  Download, LogOut, ChevronRight,
  Save,
} from "lucide-react";
import { useLocation } from "wouter";
import { SidebarSystemSections } from "./SidebarSystemSections";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeMode } from "@/contexts/ThemeContext";
import type { ProfileData } from "./ProfileMenu";
import { getInitials } from "./ProfileMenu";

/* ─── animation constants ──────────────────────────────────────────────────── */

const EASE_OPEN  = "cubic-bezier(0.22,1,0.36,1)";
const EASE_CLOSE = "cubic-bezier(0.4,0,0.6,1)";
const DUR_OPEN   = 230;
const DUR_CLOSE  = 210;

/* ─── theme options ─────────────────────────────────────────────────────────── */

const THEME_OPTIONS: {
  mode: ThemeMode; label: string; sub: string; Icon: React.ElementType;
}[] = [
  { mode: "light",  label: "Light",          sub: "Always use light theme",   Icon: Sun     },
  { mode: "dark",   label: "Dark",           sub: "Always use dark theme",    Icon: Moon    },
  { mode: "system", label: "System Default", sub: "Follow device preference", Icon: Monitor },
];

/* ─── small layout helpers ──────────────────────────────────────────────────── */

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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.50)",
      textTransform: "uppercase", letterSpacing: "0.10em",
    }}>
      {children}
    </label>
  );
}

/* ─── Card wrapper ─────────────────────────────────────────────────────────── */

function Card({
  children, noPad, style,
}: {
  children: React.ReactNode;
  noPad?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background:   "rgba(255,255,255,0.03)",
        border:       "1px solid rgba(255,255,255,0.07)",
        borderRadius: 20,
        overflow:     "hidden",
        ...(!noPad ? { padding: "0 0 4px" } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ─── main component ─────────────────────────────────────────────────────────── */

export interface ProfilePageProps {
  open:     boolean;
  onClose:  () => void;
  profile:  ProfileData;
  onUpdate: (p: Partial<ProfileData>) => void;
}

export const ProfilePage = memo(function ProfilePage({
  open, onClose, profile, onUpdate,
}: ProfilePageProps) {
  const [, navigate]   = useLocation();
  const [rendered, setRendered] = useState(open);
  const [visible,  setVisible]  = useState(false);

  /* local edit state */
  const [name,    setName]    = useState(profile.name);
  const [email,   setEmail]   = useState(profile.email);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { themeMode, setThemeMode } = useTheme();

  /* keep latest onClose in a ref so effects never stale-close */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  /* sync name/email when profile prop changes externally */
  useEffect(() => {
    setName(profile.name);
    setEmail(profile.email);
  }, [profile.name, profile.email]);

  /* ── mount/unmount lifecycle ────────────────────────────────────────────── */
  useEffect(() => {
    if (open) {
      setRendered(true);
      /* Double-RAF: first RAF lets the browser paint the initial hidden state
         (translateX(-100%)). Second RAF then flips visible=true, which starts
         the CSS transition from the hidden position. Without the double-RAF the
         transition may not fire if the browser batches initial layout + the
         class change into a single frame. */
      const id = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true))
      );
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      /* Wait for exit transition to finish before unmounting */
      const id = setTimeout(() => setRendered(false), DUR_CLOSE + 40);
      return () => clearTimeout(id);
    }
  }, [open]);

  /* ── Android hardware back ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ tjProfilePage: true }, "");
    const h = () => onCloseRef.current();
    window.addEventListener("popstate", h);
    return () => {
      window.removeEventListener("popstate", h);
      if (window.history.state?.tjProfilePage) window.history.back();
    };
  }, [open]);

  /* ── ESC ───────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  /* ── avatar upload ──────────────────────────────────────────────────────── */
  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onUpdate({ avatarDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }, [onUpdate]);

  /* ── save profile ───────────────────────────────────────────────────────── */
  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 300));
    onUpdate({ name: name.trim(), email: email.trim() });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [name, email, onUpdate]);

  /* ── export profile data ────────────────────────────────────────────────── */
  const handleExportProfile = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify(
        { profile: { name: profile.name, email: profile.email }, exportedAt: new Date().toISOString() },
        null, 2,
      )],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tradevault-profile.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }, [profile.name, profile.email]);

  const initials = getInitials(profile.name);

  if (!rendered) return null;

  return (
    <div
      style={{
        /* ── fixed overlay covering the entire viewport ── */
        position:                 "fixed",
        inset:                    0,
        zIndex:                   200,

        /* ── solid background — dashboard never bleeds through ── */
        background:               "#0B0B0B",

        /* ── GPU compositor transition: transform only ── */
        transform:                visible ? "translateX(0)" : "translateX(-100%)",
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

        /* ── safe areas ──
           Top inset: consumed ONCE by the native <View style={{height:insets.top}}/>
           spacer above the WebView in trading-journal-tablet/app/index.tsx.
           The WebView frame already starts below the status bar, so position:fixed
           top:0 lands at the correct position — no CSS env(safe-area-inset-top) needed.
           Bottom inset: NOT consumed natively, so the web page handles it here. */
        paddingBottom:            "env(safe-area-inset-bottom)",
      }}
    >
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <header
        style={{
          height:        60,
          flexShrink:    0,
          display:       "flex",
          alignItems:    "center",
          justifyContent:"space-between",
          padding:       "0 12px",
          background:    "#0B0B0B",
          borderBottom:  "1px solid rgba(255,255,255,0.06)",
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
          Profile
        </span>

        {/* Settings shortcut */}
        <button
          onClick={() => { onClose(); setTimeout(() => navigate("/settings"), DUR_CLOSE + 10); }}
          aria-label="Settings"
          style={{
            width: 40, height: 40, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.06)",
            border:     "1px solid rgba(255,255,255,0.09)",
            color:      "rgba(255,255,255,0.72)",
            cursor:     "pointer",
          }}
        >
          <Settings style={{ width: 16, height: 16 }} />
        </button>
      </header>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
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
          {/* ── Avatar hero ─────────────────────────────────────────────── */}
          <div style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            12,
            padding:        "28px 0 8px",
          }}>
            {/* Avatar circle */}
            <div
              style={{ position: "relative", cursor: "pointer" }}
              onClick={() => fileRef.current?.click()}
            >
              <div
                style={{
                  width: 88, height: 88, borderRadius: "50%",
                  overflow: "hidden",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--surface-avatar-bg)",
                  border:     "2.5px solid rgba(255,255,255,0.14)",
                  boxShadow:  "0 8px 32px rgba(0,0,0,0.55)",
                }}
              >
                {profile.avatarDataUrl
                  ? <img src={profile.avatarDataUrl} alt={profile.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 30, fontWeight: 700, color: "var(--surface-avatar-text)", lineHeight: 1 }}>{initials}</span>
                }
              </div>
              {/* Camera badge */}
              <div style={{
                position:  "absolute", bottom: 2, right: 2,
                width:     28, height: 28, borderRadius: "50%",
                background: "rgba(165,180,252,0.88)",
                border:     "2px solid #0B0B0B",
                display:    "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Camera style={{ width: 13, height: 13, color: "#1e1b4b" }} />
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleAvatarChange}
            />
            {/* Name + email summary */}
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: "rgba(255,255,255,0.90)", letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                {profile.name}
              </p>
              {profile.email && (
                <p style={{ fontSize: 12, color: "rgba(148,163,184,0.60)", marginTop: 4 }}>
                  {profile.email}
                </p>
              )}
            </div>
            {profile.avatarDataUrl && (
              <button
                onClick={() => onUpdate({ avatarDataUrl: null })}
                style={{
                  fontSize: 11, color: "#f87171",
                  background: "none", border: "none", cursor: "pointer",
                  padding: "2px 8px",
                }}
              >
                Remove photo
              </button>
            )}
          </div>

          {/* ── Personal Info ──────────────────────────────────────────────── */}
          <Card>
            <SectionLabel>Personal Info</SectionLabel>
            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <FieldLabel>Full Name</FieldLabel>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: 12, padding: "10px 14px",
                    fontSize: 14, color: "rgba(255,255,255,0.88)",
                    outline: "none",
                  }}
                  onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(165,180,252,0.50)"; }}
                  onBlur={e  => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.09)"; }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <FieldLabel>Email Address</FieldLabel>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: 12, padding: "10px 14px",
                    fontSize: 14, color: "rgba(255,255,255,0.88)",
                    outline: "none",
                  }}
                  onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(165,180,252,0.50)"; }}
                  onBlur={e  => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.09)"; }}
                />
              </div>
              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "11px 20px", borderRadius: 14,
                  background: saved
                    ? "rgba(16,185,129,0.16)"
                    : "rgba(165,180,252,0.12)",
                  border: saved
                    ? "1px solid rgba(16,185,129,0.28)"
                    : "1px solid rgba(165,180,252,0.22)",
                  color: saved ? "#34d399" : "#a5b4fc",
                  fontSize: 13, fontWeight: 600,
                  cursor: saving || !name.trim() ? "default" : "pointer",
                  opacity: saving || !name.trim() ? 0.5 : 1,
                  transition: "background 150ms, border-color 150ms, color 150ms",
                }}
              >
                <Save style={{ width: 13, height: 13 }} />
                {saved ? "Saved" : saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </Card>

          {/* ── Appearance ─────────────────────────────────────────────────── */}
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

          {/* ── Export Data ─────────────────────────────────────────────────── */}
          <Card noPad>
            <button
              onClick={handleExportProfile}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "17px 20px", width: "100%",
                background: "none", border: "none", cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 13, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(96,165,250,0.10)",
                border:     "1px solid rgba(96,165,250,0.20)",
              }}>
                <Download style={{ width: 17, height: 17, color: "#60a5fa" }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", lineHeight: 1.3 }}>
                  Export Data
                </p>
                <p style={{ fontSize: 11, color: "rgba(148,163,184,0.55)", marginTop: 2 }}>
                  Download your profile as JSON
                </p>
              </div>
              <ChevronRight style={{ width: 16, height: 16, color: "rgba(148,163,184,0.30)", flexShrink: 0 }} />
            </button>
          </Card>

          {/* ── System Status + Backup ─────────────────────────────────────── */}
          <Card>
            <SectionLabel>System</SectionLabel>
            {/* Reuse the exact same SidebarSystemSections used in the nav drawer
                and the old popup — all status, server IP, and backup/restore
                functionality is preserved without any duplication. */}
            <div style={{ paddingBottom: 8 }}>
              <SidebarSystemSections open={open} />
            </div>
          </Card>

          {/* ── Sign Out ────────────────────────────────────────────────────── */}
          <Card noPad style={{ marginBottom: 8 }}>
            <button
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "17px 20px", width: "100%",
                background: "none", border: "none", cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 13, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(248,113,113,0.09)",
                border:     "1px solid rgba(248,113,113,0.18)",
              }}>
                <LogOut style={{ width: 17, height: 17, color: "#f87171" }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#f87171" }}>
                Sign Out
              </span>
            </button>
          </Card>

        </div>
      </div>
    </div>
  );
});
