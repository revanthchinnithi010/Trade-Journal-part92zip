/**
 * NotificationsSettingsPage — alert sound, ringtone, and duration settings.
 * Slides in from the right. Same GPU-only animation as sibling pages.
 * All preferences persisted to localStorage under "tj_notification_prefs".
 */

import React, { memo, useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft, Volume2, VolumeX, Music, Timer, ChevronRight, Check,
} from "lucide-react";

const EASE_OPEN  = "cubic-bezier(0.22,1,0.36,1)";
const EASE_CLOSE = "cubic-bezier(0.4,0,0.6,1)";
const DUR_OPEN   = 240;
const DUR_CLOSE  = 210;

const LS_KEY = "tj_notification_prefs";

const SOUNDS   = ["Default", "Chime", "Ping", "Bell", "Ding"] as const;
const DURATIONS = ["3 seconds", "5 seconds", "10 seconds", "30 seconds"] as const;
type SoundType    = typeof SOUNDS[number];
type DurationType = typeof DURATIONS[number];

interface NotifPrefs {
  soundEnabled: boolean;
  sound:        SoundType;
  duration:     DurationType;
}

function loadPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { soundEnabled: true, sound: "Default", duration: "5 seconds", ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { soundEnabled: true, sound: "Default", duration: "5 seconds" };
}

function savePrefs(p: NotifPrefs) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

/* ── subpage for choosing from a list ────────────────────────────────────── */

function PickerPage<T extends string>({
  open, onClose, title, options, selected, onSelect,
}: {
  open:     boolean;
  onClose:  () => void;
  title:    string;
  options:  readonly T[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  const [rendered, setRendered] = useState(open);
  const [visible,  setVisible]  = useState(false);
  const [pressed,  setPressed]  = useState<T | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const histKey = `tjPicker_${title.replace(/\s+/g, "")}`;

  useEffect(() => {
    if (open) {
      setRendered(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const id = setTimeout(() => setRendered(false), DUR_CLOSE + 40);
      return () => clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ [histKey]: true }, "");
    const h = (e: PopStateEvent) => {
      if ((e.state as Record<string, unknown> | null)?.[histKey]) return;
      onCloseRef.current();
    };
    window.addEventListener("popstate", h);
    return () => {
      window.removeEventListener("popstate", h);
      if ((window.history.state as Record<string, unknown> | null)?.[histKey])
        window.history.back();
    };
  }, [open, histKey]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!rendered) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 204,
      background: "#000000",
      transform:  visible ? "translateX(0)" : "translateX(100%)",
      transition: visible
        ? `transform ${DUR_OPEN}ms ${EASE_OPEN}`
        : `transform ${DUR_CLOSE}ms ${EASE_CLOSE}`,
      willChange: "transform",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
      display: "flex", flexDirection: "column", overflow: "hidden",
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      <header style={{
        height: 60, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 12px",
        background: "#000000",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <button onClick={onClose} aria-label="Back" style={{
          width: 40, height: 40, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.09)",
          color: "rgba(255,255,255,0.72)", cursor: "pointer",
        }}>
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.02em" }}>
          {title}
        </span>
        <div style={{ width: 40 }} />
      </header>

      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
          textTransform: "uppercase",
          padding: "24px 24px 10px",
          color: "rgba(148,163,184,0.40)", lineHeight: 1,
        }}>
          Select {title}
        </p>

        {options.map((opt, i) => {
          const active = selected === opt;
          const isPressed = pressed === opt;
          return (
            <React.Fragment key={opt}>
              <button
                onPointerDown={() => setPressed(opt)}
                onPointerUp={  () => setPressed(null)}
                onPointerLeave={() => setPressed(null)}
                onClick={() => { onSelect(opt); onClose(); }}
                style={{
                  display: "flex", alignItems: "center",
                  padding: "0 24px", height: 64, width: "100%",
                  background: isPressed ? "rgba(255,255,255,0.04)" : "transparent",
                  border: "none", cursor: "pointer", gap: 16,
                  transition: "background 60ms",
                }}
              >
                <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.88)" }}>
                  {opt}
                </span>
                {active && (
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: "#a5b4fc",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Check style={{ width: 11, height: 11, color: "#1e1b4b", strokeWidth: 3 }} />
                  </div>
                )}
              </button>
              {i < options.length - 1 && (
                <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginLeft: 24 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ── Toggle row ─────────────────────────────────────────────────────────── */
function ToggleRow({
  icon: Icon, iconColor, iconBg, label, sub, value, onChange, showDivider,
}: {
  icon: React.ElementType; iconColor: string; iconBg: string;
  label: string; sub?: string; value: boolean;
  onChange: (v: boolean) => void; showDivider: boolean;
}) {
  return (
    <>
      <button
        onClick={() => onChange(!value)}
        style={{
          display: "flex", alignItems: "center",
          padding: "0 24px", height: 68, width: "100%",
          background: "transparent", border: "none", cursor: "pointer", gap: 16,
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: iconBg,
        }}>
          <Icon style={{ width: 18, height: 18, color: iconColor }} />
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.90)", lineHeight: 1.3 }}>{label}</p>
          {sub && <p style={{ fontSize: 12, color: "rgba(148,163,184,0.55)", marginTop: 2 }}>{sub}</p>}
        </div>
        {/* Toggle pill */}
        <div
          style={{
            width: 46, height: 26, borderRadius: 13, flexShrink: 0,
            background: value ? "#a5b4fc" : "rgba(255,255,255,0.12)",
            position: "relative",
            transition: "background 200ms",
          }}
        >
          <div style={{
            position: "absolute",
            top: 3, left: value ? 23 : 3,
            width: 20, height: 20, borderRadius: "50%",
            background: value ? "#1e1b4b" : "rgba(255,255,255,0.70)",
            transition: "left 200ms cubic-bezier(0.22,1,0.36,1)",
          }} />
        </div>
      </button>
      {showDivider && <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginLeft: 80 }} />}
    </>
  );
}

/* ── Nav row ────────────────────────────────────────────────────────────── */
function NavRow({
  icon: Icon, iconColor, iconBg, label, value, onClick, showDivider, disabled,
}: {
  icon: React.ElementType; iconColor: string; iconBg: string;
  label: string; value?: string; onClick: () => void;
  showDivider: boolean; disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <>
      <button
        onPointerDown={() => !disabled && setPressed(true)}
        onPointerUp={  () => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onClick={onClick}
        disabled={disabled}
        style={{
          display: "flex", alignItems: "center",
          padding: "0 24px", height: 68, width: "100%",
          background: pressed ? "rgba(255,255,255,0.04)" : "transparent",
          border: "none", cursor: disabled ? "default" : "pointer", gap: 16,
          transition: "background 60ms",
          opacity: disabled ? 0.40 : 1,
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: iconBg,
        }}>
          <Icon style={{ width: 18, height: 18, color: iconColor }} />
        </div>
        <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.90)" }}>
          {label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {value && <span style={{ fontSize: 13, color: "rgba(148,163,184,0.65)" }}>{value}</span>}
          <ChevronRight style={{ width: 16, height: 16, color: "rgba(148,163,184,0.30)" }} />
        </div>
      </button>
      {showDivider && <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginLeft: 80 }} />}
    </>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */

export interface NotificationsSettingsPageProps {
  open:    boolean;
  onClose: () => void;
}

export const NotificationsSettingsPage = memo(function NotificationsSettingsPage({
  open, onClose,
}: NotificationsSettingsPageProps) {
  const [rendered, setRendered] = useState(open);
  const [visible,  setVisible]  = useState(false);
  const [prefs, setPrefs]       = useState<NotifPrefs>(loadPrefs);
  const [pickerOpen, setPickerOpen] = useState<"sound" | "duration" | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const updatePrefs = useCallback((patch: Partial<NotifPrefs>) => {
    setPrefs(p => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  /* ── lifecycle ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (open) {
      setRendered(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const id = setTimeout(() => setRendered(false), DUR_CLOSE + 40);
      return () => clearTimeout(id);
    }
  }, [open]);

  /* ── Android back ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ tjNotificationsPage: true }, "");
    const h = (e: PopStateEvent) => {
      if ((e.state as Record<string, unknown> | null)?.tjNotificationsPage) return;
      onCloseRef.current();
    };
    window.addEventListener("popstate", h);
    return () => {
      window.removeEventListener("popstate", h);
      if ((window.history.state as Record<string, unknown> | null)?.tjNotificationsPage)
        window.history.back();
    };
  }, [open]);

  /* ── ESC ────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!rendered) return null;

  return (
    <>
      <div style={{
        position: "fixed", inset: 0, zIndex: 203,
        background: "#000000",
        transform:  visible ? "translateX(0)" : "translateX(100%)",
        transition: visible
          ? `transform ${DUR_OPEN}ms ${EASE_OPEN}`
          : `transform ${DUR_CLOSE}ms ${EASE_CLOSE}`,
        willChange: "transform",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        display: "flex", flexDirection: "column", overflow: "hidden",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <header style={{
          height: 60, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 12px",
          background: "#000000",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <button onClick={onClose} aria-label="Back" style={{
            width: 40, height: 40, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.09)",
            color: "rgba(255,255,255,0.72)", cursor: "pointer",
          }}>
            <ArrowLeft style={{ width: 18, height: 18 }} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.02em" }}>
            Notifications
          </span>
          <div style={{ width: 40 }} />
        </header>

        {/* ── Scrollable content ───────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>

          {/* Section: ALERTS */}
          <p style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
            textTransform: "uppercase", padding: "24px 24px 10px",
            color: "rgba(148,163,184,0.40)", lineHeight: 1,
          }}>Alerts</p>

          <ToggleRow
            icon={prefs.soundEnabled ? Volume2 : VolumeX}
            iconColor={prefs.soundEnabled ? "#34d399" : "#94a3b8"}
            iconBg={prefs.soundEnabled ? "rgba(16,185,129,0.14)" : "rgba(148,163,184,0.10)"}
            label="Alert Sounds"
            sub="Play a sound when alerts trigger"
            value={prefs.soundEnabled}
            onChange={v => updatePrefs({ soundEnabled: v })}
            showDivider
          />

          <NavRow
            icon={Music}
            iconColor="#a78bfa"
            iconBg="rgba(139,92,246,0.14)"
            label="Alert Ringtone"
            value={prefs.sound}
            onClick={() => setPickerOpen("sound")}
            showDivider
            disabled={!prefs.soundEnabled}
          />

          <NavRow
            icon={Timer}
            iconColor="#fbbf24"
            iconBg="rgba(245,158,11,0.14)"
            label="Alert Duration"
            value={prefs.duration}
            onClick={() => setPickerOpen("duration")}
            showDivider={false}
          />

        </div>
      </div>

      {/* ── Ringtone picker sub-page ─────────────────────────────────────────── */}
      <PickerPage
        open={pickerOpen === "sound"}
        onClose={() => setPickerOpen(null)}
        title="Alert Ringtone"
        options={SOUNDS}
        selected={prefs.sound}
        onSelect={v => updatePrefs({ sound: v })}
      />

      {/* ── Duration picker sub-page ─────────────────────────────────────────── */}
      <PickerPage
        open={pickerOpen === "duration"}
        onClose={() => setPickerOpen(null)}
        title="Alert Duration"
        options={DURATIONS}
        selected={prefs.duration}
        onSelect={v => updatePrefs({ duration: v })}
      />
    </>
  );
});
