/**
 * ProfileMenu — 60 FPS profile dropdown for mobile + desktop.
 *
 * Performance contract:
 *   RAF hot path animates ONLY: opacity, scale, translateY on ONE motion.div.
 *   Everything else (blur, border, shadow, border-radius) is static — never
 *   touched during an animation frame.
 *
 * Architecture:
 *   • Always mounted — no AnimatePresence, no DOM insertion/removal.
 *   • Backdrop: plain <div>, opacity controlled via CSS transition (not RAF).
 *   • Blur layer: static <div> sibling behind the animated panel — blur is
 *     never inside the composited animation layer, so no recomposite per frame.
 *   • Panel content: one <motion.div> driven by three useMotionValue instances
 *     (opacity, scale, y). animate() writes to the DOM directly; zero React
 *     re-renders during the animation.
 *   • No per-item animations. No stagger. Panel fades/scales as a unit.
 *   • No whileTap gesture subscriptions. Plain CSS active states.
 */

import React, {
  useRef, useEffect, useState, useCallback, memo,
} from "react";
import { motion, useMotionValue, animate } from "motion/react";
import {
  User, Settings, Palette, Download, LogOut,
  X, Camera, Eye, EyeOff, ChevronRight, ChevronLeft,
  Sun, Moon, Monitor, Check,
} from "lucide-react";
import { SidebarSystemSections } from "./SidebarSystemSections";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeMode } from "@/contexts/ThemeContext";
import { AnimatedModal } from "@/components/animations";

/* ─── types ─────────────────────────────────────────────────────────────────── */

export interface ProfileData {
  name: string;
  email: string;
  avatarDataUrl: string | null;
}

/* ─── profile persistence ────────────────────────────────────────────────────── */

function loadProfile(): ProfileData {
  try {
    const raw = localStorage.getItem("tradevault_profile");
    if (raw) return JSON.parse(raw) as ProfileData;
  } catch { /**/ }
  return { name: "Trader", email: "", avatarDataUrl: null };
}

function saveProfile(p: ProfileData) {
  try { localStorage.setItem("tradevault_profile", JSON.stringify(p)); } catch { /**/ }
}

export function useProfile() {
  const [profile, setProfile] = useState<ProfileData>(loadProfile);
  const update = useCallback((p: Partial<ProfileData>) => {
    setProfile(prev => {
      const next = { ...prev, ...p };
      saveProfile(next);
      return next;
    });
  }, []);
  return { profile, update };
}

export function getInitials(name: string): string {
  return name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

/* ─── static data ────────────────────────────────────────────────────────────── */

const MENU_ITEMS = [
  { icon: User,     label: "My Profile",  action: "profile",    danger: false },
  { icon: Settings, label: "Settings",    action: "settings",   danger: false },
  { icon: Palette,  label: "Appearance",  action: "appearance", danger: false },
  { icon: Download, label: "Export Data", action: "export",     danger: false },
  { icon: LogOut,   label: "Sign Out",    action: "signout",    danger: true  },
] as const;

const THEME_OPTIONS: { mode: ThemeMode; label: string; sub: string; Icon: React.ElementType }[] = [
  { mode: "light",  label: "Light",          sub: "Always use light theme",   Icon: Sun     },
  { mode: "dark",   label: "Dark",           sub: "Always use dark theme",    Icon: Moon    },
  { mode: "system", label: "System Default", sub: "Follow device preference", Icon: Monitor },
];

/* ─── animation constants ────────────────────────────────────────────────────── */

// Premium deceleration — same curve used across all app animations.
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const OPEN_OPTS  = { duration: 0.18, ease: EASE } as const;
const CLOSE_OPTS = { duration: 0.12, ease: EASE } as const;

/* ─── sub-components (memoised — render only when their own props change) ────── */

interface ThemeRowProps {
  mode: ThemeMode; label: string; sub: string;
  Icon: React.ElementType; active: boolean;
  onSelect: (m: ThemeMode) => void;
}

const ThemeRow = memo(function ThemeRow({ mode, label, sub, Icon, active, onSelect }: ThemeRowProps) {
  return (
    <button
      onClick={() => onSelect(mode)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
      style={{
        background: active ? "rgba(165,180,252,0.10)" : "transparent",
        border:     active ? "1px solid rgba(165,180,252,0.22)" : "1px solid transparent",
        transition: "background 100ms, border-color 100ms",
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--surface-btn-hover)"; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: active ? "rgba(165,180,252,0.18)" : "var(--surface-btn-hover)",
          border:     active ? "1px solid rgba(165,180,252,0.30)" : "1px solid var(--surface-btn-border)",
        }}>
        <Icon className="w-3.5 h-3.5" style={{ color: active ? "#a5b4fc" : "hsl(var(--muted-foreground))" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium leading-tight"
          style={{ color: active ? "#e0e7ff" : "hsl(var(--foreground))" }}>
          {label}
        </p>
        <p className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5">{sub}</p>
      </div>
      {active && (
        <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0"
          style={{ background: "#a5b4fc" }}>
          <Check className="w-2.5 h-2.5 text-[#1e1b4b]" style={{ strokeWidth: 3 }} />
        </div>
      )}
    </button>
  );
});

const AppearancePanel = memo(function AppearancePanel({ onBack }: { onBack: () => void }) {
  const { themeMode, setThemeMode } = useTheme();
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-3"
        style={{ borderBottom: "1px solid var(--surface-divider)" }}>
        <button
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white transition-colors"
          style={{ background: "var(--surface-btn-hover)" }}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: "rgba(165,180,252,0.12)", border: "1px solid rgba(165,180,252,0.20)" }}>
            <Palette className="w-3 h-3" style={{ color: "#a5b4fc" }} />
          </div>
          <span className="text-[13px] font-semibold text-white/90">Appearance</span>
        </div>
      </div>
      <div className="p-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] px-2 pt-1 pb-2"
          style={{ color: "rgba(148,163,184,0.45)" }}>
          Theme Mode
        </p>
        <div className="space-y-0.5">
          {THEME_OPTIONS.map(o => (
            <ThemeRow key={o.mode} {...o} active={themeMode === o.mode} onSelect={setThemeMode} />
          ))}
        </div>
      </div>
    </div>
  );
});

interface MenuItemRowProps {
  icon: React.ElementType;
  label: string;
  action: string;
  danger: boolean;
  isLast: boolean;
  onClick: (action: string) => void;
}

const MenuItemRow = memo(function MenuItemRow({ icon: Icon, label, action, danger, isLast, onClick }: MenuItemRowProps) {
  return (
    <div>
      {isLast && (
        <div className="my-1.5 mx-2" style={{ height: "1px", background: "var(--surface-divider)" }} />
      )}
      <button
        onClick={() => onClick(action)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-medium"
        style={{
          color:      danger ? "#f87171" : "hsl(var(--muted-foreground))",
          background: "transparent",
          transition: "background 100ms, color 100ms",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = danger ? "rgba(248,113,113,0.09)" : "var(--surface-btn-hover)";
          el.style.color      = danger ? "#fca5a5" : "hsl(var(--foreground))";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = "transparent";
          el.style.color      = danger ? "#f87171" : "hsl(var(--muted-foreground))";
        }}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
        {!danger && <ChevronRight className="w-3 h-3 ml-auto opacity-25" />}
      </button>
    </div>
  );
});

/* ─── main dropdown ──────────────────────────────────────────────────────────── */

interface DropdownProps {
  open: boolean;
  profile: ProfileData;
  onUpdate: (p: Partial<ProfileData>) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export const ProfileDropdown = memo(function ProfileDropdown({
  open, profile, onUpdate, onClose,
}: DropdownProps) {
  const [, navigate] = useLocation();
  const [showModal, setShowModal] = useState(false);
  const [panel, setPanel]         = useState<"menu" | "appearance">("menu");

  /* ── MotionValues — ONLY things on the RAF hot path ── */
  const mvOpacity = useMotionValue(0);
  const mvScale   = useMotionValue(0.96);
  const mvY       = useMotionValue(-10);

  /* stop handle to cancel in-flight animation before starting the reverse */
  const stopRef = useRef<(() => void) | null>(null);

  /* ── animate on open/close prop change ── */
  useEffect(() => {
    stopRef.current?.();

    if (open) {
      /* ⚠️  Do NOT call .set() here.
         Calling mvOpacity.set(0) / mvScale.set(0.96) / mvY.set(-10) before
         animate() writes to the DOM synchronously, causing the element to
         snap to its "from" state one frame before the animation starts —
         that one-frame visual discontinuity is the intermittent stutter.
         The MotionValues are already at their closed values (initialised
         below, and restored by every close animation), so animate() can
         start from the current value with zero pre-work. */
      const a1 = animate(mvOpacity, 1, OPEN_OPTS);
      const a2 = animate(mvScale,   1, OPEN_OPTS);
      const a3 = animate(mvY,       0, OPEN_OPTS);
      stopRef.current = () => { a1.stop(); a2.stop(); a3.stop(); };
    } else {
      /* Reset panel to "menu" HERE (on close) — not on open.
         Resetting on open schedules a React re-render on the same frame
         the opening animation starts, competing with the animation on
         the main thread. Resetting on close happens while the menu is
         going invisible so there is nothing visible to stutter. */
      setPanel("menu");
      const a1 = animate(mvOpacity, 0,    CLOSE_OPTS);
      const a2 = animate(mvScale,   0.96, CLOSE_OPTS);
      const a3 = animate(mvY,       -10,  CLOSE_OPTS);
      stopRef.current = () => { a1.stop(); a2.stop(); a3.stop(); };
    }

    return () => stopRef.current?.();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── suppress glass-card blurs elsewhere while open (same convention as
     NotificationPanel) — prevents the live-tick RAF loop from fighting
     backdrop-filter recomposites across the whole page ── */
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("tj-modal-open");
    return () => document.body.classList.remove("tj-modal-open");
  }, [open]);

  /* ── ESC ── */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  /* ── actions ── */
  const handleAction = useCallback((action: string) => {
    if (action === "settings")   { navigate("/settings"); onClose(); return; }
    if (action === "profile")    { setShowModal(true); return; }
    if (action === "appearance") { setPanel("appearance"); return; }
    if (action === "export") {
      const blob = new Blob(
        [JSON.stringify({ profile: { name: profile.name, email: profile.email }, exportedAt: new Date().toISOString() }, null, 2)],
        { type: "application/json" },
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "tradevault-profile.json";
      a.click();
      return;
    }
    if (action === "signout") { onClose(); return; }
  }, [navigate, onClose, profile.name, profile.email]);

  const initials = getInitials(profile.name);

  return (
    <>
      {/*
        ╔══════════════════════════════════════════════════════════════════╗
        ║ BACKDROP — always mounted, pure CSS transition, zero RAF cost.  ║
        ║ opacity: 0 → 0.45 over 140 ms on open; reverse on close.       ║
        ╚══════════════════════════════════════════════════════════════════╝
      */}
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position:      "fixed",
          inset:         0,
          zIndex:        40,
          background:    "#000",
          opacity:       open ? 0.45 : 0,
          transition:    open ? "opacity 0.14s ease" : "opacity 0.12s ease",
          pointerEvents: open ? "auto" : "none",
        }}
      />

      {/*
        ╔══════════════════════════════════════════════════════════════════╗
        ║ MENU CONTAINER — absolute, always mounted.                      ║
        ║ Two layers:                                                     ║
        ║   1. Blur layer  — static div, CSS transition opacity only.     ║
        ║      Blur is NEVER inside the composited animation layer, so    ║
        ║      the GPU never recomputes it during the scale animation.    ║
        ║   2. Content layer — motion.div, RAF-driven opacity/scale/y.    ║
        ║      Only GPU-composited props change per frame.                ║
        ╚══════════════════════════════════════════════════════════════════╝
      */}
      <div
        className="absolute top-[calc(100%+10px)] right-0 w-[276px]"
        style={{
          zIndex:        50,
          pointerEvents: open ? "auto" : "none",
          /* Isolate this subtree from the page layout so internal changes
             (panel switch, scroll) never trigger a full-page recalculation. */
          contain: "layout style",
        }}
      >
        {/* Layer 1: blur + background — static, CSS transition, zero RAF */}
        <div
          aria-hidden
          style={{
            position:             "absolute",
            inset:                0,
            borderRadius:         24,
            background:           "rgba(18,18,20,0.92)",
            backdropFilter:       "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border:               "1px solid rgba(255,255,255,0.06)",
            boxShadow:            "0 20px 60px rgba(0,0,0,0.45)",
            /* CSS transition — fires once per open/close, never per frame */
            opacity:              open ? 1 : 0,
            transition:           open ? "opacity 0.14s ease" : "opacity 0.12s ease",
            pointerEvents:        "none",
          }}
        />

        {/* Layer 2: content — one motion.div, only opacity/scale/y animate */}
        <motion.div
          style={{
            opacity:         mvOpacity,
            scale:           mvScale,
            y:               mvY,
            transformOrigin: "top right",
            willChange:      "transform, opacity",
            /* backfaceVisibility: hidden forces a persistent 3D stacking
               context. Android Chrome evicts will-change compositor layers
               when the element is idle — this prevents that eviction, so
               the GPU layer is always warm and the first animation frame
               never has to re-promote (which is what causes the
               "sometimes stutter, sometimes smooth" pattern). */
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            /* position: relative so it stacks above the blur layer */
            position:   "relative",
            zIndex:     1,
            borderRadius: 24,
            /* overflow:hidden clips the rounded-corner shape;
               inner scroll div handles maxHeight / overflowY */
            overflow:   "hidden",
          }}
        >
          <div style={{ maxHeight: "min(88vh, 700px)", overflowY: "auto", overflowX: "hidden" }}>

            {/* ── Appearance sub-panel ── */}
            {panel === "appearance" && (
              <AppearancePanel onBack={() => setPanel("menu")} />
            )}

            {/* ── Main menu ── */}
            {panel === "menu" && (
              <>
                {/* Profile header */}
                <div className="flex items-center gap-3 p-3.5"
                  style={{ borderBottom: "1px solid var(--surface-divider)" }}>
                  <div
                    className="w-10 h-10 rounded-xl shrink-0 overflow-hidden flex items-center justify-center"
                    style={{
                      background: "var(--surface-avatar-bg)",
                      border:     "1.5px solid var(--surface-avatar-border)",
                      boxShadow:  "0 4px 12px rgba(16,185,129,0.12)",
                    }}
                  >
                    {profile.avatarDataUrl
                      ? <img src={profile.avatarDataUrl} alt={profile.name} className="w-full h-full object-cover" />
                      : <span className="text-[13px] font-bold" style={{ color: "var(--surface-avatar-text)" }}>{initials}</span>
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white/90 truncate leading-tight">{profile.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{profile.email}</p>
                  </div>
                </div>

                {/* Menu items — no individual animations, no stagger */}
                <div className="p-1.5 space-y-0.5">
                  {MENU_ITEMS.map((item, i) => (
                    <MenuItemRow
                      key={item.action}
                      icon={item.icon}
                      label={item.label}
                      action={item.action}
                      danger={item.danger}
                      isLast={i === MENU_ITEMS.length - 1}
                      onClick={handleAction}
                    />
                  ))}
                </div>

                {/* System status / backend info */}
                <div className="px-1.5 pb-2">
                  <SidebarSystemSections open={true} />
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* Profile edit modal */}
      <AnimatedModal
        open={showModal}
        onClose={() => { setShowModal(false); onClose(); }}
        title="Edit Profile"
      >
        <ProfileModal
          profile={profile}
          onUpdate={onUpdate}
          onClose={() => { setShowModal(false); onClose(); }}
        />
      </AnimatedModal>
    </>
  );
});

/* ─── profile edit modal ─────────────────────────────────────────────────────── */

interface ModalProps {
  profile: ProfileData;
  onUpdate: (p: Partial<ProfileData>) => void;
  onClose: () => void;
}

function ProfileModal({ profile, onUpdate, onClose }: ModalProps) {
  const [name,     setName]     = useState(profile.name);
  const [email,    setEmail]    = useState(profile.email);
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onUpdate({ avatarDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 350));
    onUpdate({ name: name.trim(), email: email.trim() });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const initials = getInitials(name || "RC");

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(10px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-[400px] rounded-2xl overflow-hidden"
        style={{
          background: "hsl(var(--popover))",
          border:     "1px solid var(--surface-btn-border)",
          boxShadow:  "0 32px 80px rgba(0,0,0,0.65)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--surface-divider)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "var(--surface-avatar-bg)", border: "1px solid var(--surface-avatar-border)" }}>
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-[14px] font-semibold text-white">Edit Profile</span>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white transition-colors"
            style={{ background: "var(--surface-btn-hover)" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer shrink-0" onClick={() => fileRef.current?.click()}>
              <div className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center"
                style={{
                  background: "var(--surface-avatar-bg)",
                  border:     "2px solid var(--surface-avatar-border)",
                  boxShadow:  "0 4px 16px rgba(16,185,129,0.10)",
                }}>
                {profile.avatarDataUrl
                  ? <img src={profile.avatarDataUrl} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-[20px] font-bold" style={{ color: "var(--surface-avatar-text)" }}>{initials}</span>
                }
              </div>
              <div className="absolute inset-0 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: "rgba(0,0,0,0.58)" }}>
                <Camera className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <p className="text-[13px] font-medium text-white/75">Profile Photo</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Click avatar to upload</p>
              {profile.avatarDataUrl && (
                <button onClick={() => onUpdate({ avatarDataUrl: null })}
                  className="text-[11px] text-red-400 hover:text-red-300 mt-1.5 transition-colors">
                  Remove photo
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Full Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="rounded-xl h-10 text-sm"
                style={{ background: "var(--surface-input-bg)", border: "1px solid var(--surface-input-border)" }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Email Address</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="rounded-xl h-10 text-sm"
                style={{ background: "var(--surface-input-bg)", border: "1px solid var(--surface-input-border)" }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                New Password <span className="normal-case text-muted-foreground/45 font-normal">(optional)</span>
              </Label>
              <div className="relative">
                <Input type={showPw ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="rounded-xl h-10 pr-10 text-sm"
                  style={{ background: "var(--surface-input-bg)", border: "1px solid var(--surface-input-border)" }} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving || !name.trim()}
              className="flex-1 h-9 rounded-xl text-sm font-medium"
              style={{
                background: saving || !name.trim() ? "rgba(16,185,129,0.20)" : "rgba(16,185,129,0.75)",
                color: "white", border: "1px solid rgba(16,185,129,0.30)",
              }}>
              {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={onClose}
              className="h-9 px-4 rounded-xl text-sm text-muted-foreground"
              style={{ background: "transparent", border: "1px solid var(--surface-btn-border)" }}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
