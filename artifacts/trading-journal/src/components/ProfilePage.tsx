/**
 * ProfilePage — full-screen profile experience for mobile.
 *
 * NAVIGATION MODEL: ProfilePage is the single navigation controller for the
 * entire profile session. It owns a `navStack` string array that grows as the
 * user navigates deeper and shrinks as they go back.
 *
 *   navStack = []                           → Profile root
 *   navStack = ["settings"]                → Settings
 *   navStack = ["settings","appearance"]   → Appearance
 *   navStack = ["settings","notifications"]→ Notifications
 *   navStack = ["settings","notifications","picker_sound"] → Ringtone picker
 *
 * One history entry is pushed per depth level, all tagged { tjProfileNav: true, depth: N }.
 * A single popstate listener in ProfilePage slices the stack to the new depth.
 * Sub-pages are pure controlled components — they never call pushState or listen
 * for popstate events.
 *
 * ANIMATION ENGINE: pure CSS transitions on `transform: translateX` only.
 * Runs on the GPU compositor thread — completely independent of JavaScript,
 * the chart tick engine, and any RAF loops. Zero frame drops guaranteed.
 *
 *   Enter: translateX(-100%) → translateX(0)   230ms cubic-bezier(0.22,1,0.36,1)
 *   Exit:  translateX(0)     → translateX(-100%) 210ms cubic-bezier(0.4,0,0.6,1)
 */

import React, {
  memo, useEffect, useRef, useState, useCallback,
} from "react";
import {
  ArrowLeft, Settings, Camera,
  Download, LogOut, ChevronRight,
  Save,
} from "lucide-react";
import type { ProfileData } from "./ProfileMenu";
import { getInitials } from "./ProfileMenu";
import { ProfileSettingsPage }      from "./ProfileSettingsPage";
import { AppearanceSettingsPage }   from "./AppearanceSettingsPage";
import { NotificationsSettingsPage } from "./NotificationsSettingsPage";

/* ─── animation constants ──────────────────────────────────────────────────── */

const EASE_OPEN  = "cubic-bezier(0.22,1,0.36,1)";
const EASE_CLOSE = "cubic-bezier(0.4,0,0.6,1)";
const DUR_OPEN   = 230;
const DUR_CLOSE  = 210;

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

/* ─── props ──────────────────────────────────────────────────────────────────── */

export interface ProfilePageProps {
  open:     boolean;
  onClose:  () => void;
  profile:  ProfileData;
  onUpdate: (p: Partial<ProfileData>) => void;
}

/* ─── main component ─────────────────────────────────────────────────────────── */

export const ProfilePage = memo(function ProfilePage({
  open, onClose, profile, onUpdate,
}: ProfilePageProps) {
  const [rendered, setRendered] = useState(open);
  const [visible,  setVisible]  = useState(false);

  /* ── Navigation stack ──────────────────────────────────────────────────────
     navStack is the React state driving renders. navStackRef is a ref that
     always holds the latest value so callbacks/effects never see stale data.
     closingRef prevents the popstate handler from firing after we've already
     initiated a close sequence. ─────────────────────────────────────────── */
  const [navStack, _setNavStack] = useState<string[]>([]);
  const navStackRef = useRef<string[]>([]);
  const closingRef  = useRef(false);

  const setNavStack = useCallback((next: string[]) => {
    navStackRef.current = next;
    _setNavStack(next);
  }, []);

  /* local edit state */
  const [name,   setName]   = useState(profile.name);
  const [email,  setEmail]  = useState(profile.email);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  /* sync name/email when profile prop changes externally */
  useEffect(() => {
    setName(profile.name);
    setEmail(profile.email);
  }, [profile.name, profile.email]);

  /* ── Navigation callbacks ───────────────────────────────────────────────── */

  /**
   * Push a page onto the stack and record a history entry.
   * Called by buttons that navigate deeper (Settings gear, Appearance row, etc.)
   */
  const pushPage = useCallback((name: string) => {
    const next = [...navStackRef.current, name];
    window.history.pushState({ tjProfileNav: true, depth: next.length }, "");
    navStackRef.current = next;
    _setNavStack(next);
  }, []);

  /**
   * Go back one entry. Sub-page Back buttons call this.
   * It triggers the browser to fire popstate, which the handler below
   * uses to slice the stack — closing exactly the topmost page.
   */
  const popPage = useCallback(() => {
    window.history.back();
  }, []);

  /**
   * Close the entire Profile session (Back on root, Sign Out, ESC).
   * Goes back by (stack depth + 1) entries to clean up all pushed history.
   * Then notifies the parent to set open=false.
   */
  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const totalEntries = navStackRef.current.length + 1; // sub-pages + root
    navStackRef.current = [];
    _setNavStack([]);
    if ((window.history.state as Record<string, unknown> | null)?.tjProfileNav) {
      window.history.go(-totalEntries);
    }
    onCloseRef.current();
  }, []);

  /* ── Mount/unmount & navigation lifecycle ───────────────────────────────── */
  useEffect(() => {
    if (open) {
      /* ── Opening ─────────────────────────────────────────────────────────
         Reset navigation state so Profile always opens at root.            */
      closingRef.current = false;
      navStackRef.current = [];
      _setNavStack([]);
      setRendered(true);

      /* Push the root history entry for this session. */
      window.history.pushState({ tjProfileNav: true, depth: 0 }, "");

      /* Double-RAF triggers the CSS enter transition. */
      const rafId = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true))
      );

      /* Single popstate handler for the ENTIRE profile navigation session.
         All sub-pages are controlled by this handler — none register their own. */
      const h = (e: PopStateEvent) => {
        if (closingRef.current) return;
        const state = e.state as { tjProfileNav?: boolean; depth?: number } | null;

        if (!state?.tjProfileNav) {
          /* Navigated past our root entry → close Profile. */
          closingRef.current = true;
          navStackRef.current = [];
          _setNavStack([]);
          onCloseRef.current();
          return;
        }

        /* Navigated to one of our intermediate entries → pop stack to that depth. */
        const depth = (state.depth as number) ?? 0;
        const next  = navStackRef.current.slice(0, depth);
        navStackRef.current = next;
        _setNavStack(next);
      };

      window.addEventListener("popstate", h);

      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("popstate", h);
      };

    } else {
      /* ── Closing ──────────────────────────────────────────────────────────
         open=false set externally (route change, etc.) while sub-pages may
         still be open. Clean up any remaining history entries first.        */
      if (!closingRef.current) {
        closingRef.current = true;
        const totalEntries = navStackRef.current.length + 1;
        navStackRef.current = [];
        if ((window.history.state as Record<string, unknown> | null)?.tjProfileNav) {
          window.history.go(-totalEntries);
        }
      }
      _setNavStack([]);
      setVisible(false);
      const id = setTimeout(() => {
        setRendered(false);
        closingRef.current = false;
      }, DUR_CLOSE + 40);
      return () => clearTimeout(id);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── ESC closes Profile ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, handleClose]);

  /* ── Avatar upload ──────────────────────────────────────────────────────── */
  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onUpdate({ avatarDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }, [onUpdate]);

  /* ── Save profile ───────────────────────────────────────────────────────── */
  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 300));
    onUpdate({ name: name.trim(), email: email.trim() });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [name, email, onUpdate]);

  /* ── Export profile data ────────────────────────────────────────────────── */
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

  /* ── Derived nav state ──────────────────────────────────────────────────── */
  const settingsVisible      = navStack.length >= 1 && navStack[0] === "settings";
  const appearanceVisible    = navStack.length >= 2 && navStack[1] === "appearance";
  const notificationsVisible = navStack.length >= 2 && navStack[1] === "notifications";
  const pickerPage           = navStack.length >= 3 ? navStack[2] : null;

  const initials = getInitials(profile.name);

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <>
      {/* ── Profile overlay ─────────────────────────────────────────────────── */}
      {rendered && (
        <div
          style={{
            position:                 "fixed",
            inset:                    0,
            zIndex:                   200,
            background:               "#000000",
            transform:                visible ? "translateX(0)" : "translateX(-100%)",
            transition:               visible
              ? `transform ${DUR_OPEN}ms ${EASE_OPEN}`
              : `transform ${DUR_CLOSE}ms ${EASE_CLOSE}`,
            willChange:               "transform",
            backfaceVisibility:       "hidden",
            WebkitBackfaceVisibility: "hidden",
            display:                  "flex",
            flexDirection:            "column",
            overflow:                 "hidden",
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
              background:    "#000000",
              borderBottom:  "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Back — closes Profile and returns to previous app screen */}
            <button
              onClick={handleClose}
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

            <span style={{
              fontSize: 16, fontWeight: 700,
              color: "rgba(255,255,255,0.92)",
              letterSpacing: "-0.02em",
            }}>
              Profile
            </span>

            {/* Settings gear — pushes Settings onto the nav stack */}
            <button
              onClick={() => pushPage("settings")}
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
                <div
                  style={{ position: "relative", cursor: "pointer" }}
                  onClick={() => fileRef.current?.click()}
                >
                  <div style={{
                    width: 88, height: 88, borderRadius: "50%",
                    overflow: "hidden",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--surface-avatar-bg)",
                    border:     "2.5px solid rgba(255,255,255,0.14)",
                    boxShadow:  "0 8px 32px rgba(0,0,0,0.55)",
                  }}>
                    {profile.avatarDataUrl
                      ? <img src={profile.avatarDataUrl} alt={profile.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 30, fontWeight: 700, color: "var(--surface-avatar-text)", lineHeight: 1 }}>{initials}</span>
                    }
                  </div>
                  <div style={{
                    position:  "absolute", bottom: 2, right: 2,
                    width:     28, height: 28, borderRadius: "50%",
                    background: "rgba(165,180,252,0.88)",
                    border:     "2px solid #000000",
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
                        background: "#1A1A1A",
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
                        background: "#1A1A1A",
                        border: "1px solid rgba(255,255,255,0.09)",
                        borderRadius: 12, padding: "10px 14px",
                        fontSize: 14, color: "rgba(255,255,255,0.88)",
                        outline: "none",
                      }}
                      onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(165,180,252,0.50)"; }}
                      onBlur={e  => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.09)"; }}
                    />
                  </div>
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

              {/* ── Sign Out ────────────────────────────────────────────────────── */}
              <Card noPad style={{ marginBottom: 8 }}>
                <button
                  onClick={handleClose}
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
      )}

      {/* ── Sub-page overlays ─────────────────────────────────────────────────
          These are rendered at the same DOM level as the Profile div so they
          appear on top of it. Each manages its own rendered/visible animation
          lifecycle via the open prop. ProfilePage's navStack controls open.  */}

      <ProfileSettingsPage
        open={settingsVisible}
        onClose={popPage}
        onOpenAppearance={() => pushPage("appearance")}
        onOpenNotifications={() => pushPage("notifications")}
      />

      <AppearanceSettingsPage
        open={appearanceVisible}
        onClose={popPage}
      />

      <NotificationsSettingsPage
        open={notificationsVisible}
        onClose={popPage}
        pickerPage={pickerPage}
        onOpenPicker={pushPage}
        onClosePicker={popPage}
      />
    </>
  );
});
