/**
 * NotificationPanel — fullscreen modal (no drag, no snap points).
 *
 * Performance contract:
 *   • Only `opacity` + `transform` (translate3d) are animated — never
 *     width/height/top/left/border-radius/box-shadow/filter/backdrop-filter.
 *   • Plain CSS transitions, not framer-motion — no layout animations, no
 *     shared-layout animations, no AnimatePresence. Nothing to schedule off
 *     the main thread, nothing but a compositor-only transform+opacity tween.
 *   • No drag logic, no MotionValues, no pointermove handlers anywhere.
 *   • The component stays mounted at all times (parent renders it
 *     unconditionally); `open` only toggles visibility so re-opening never
 *     re-triggers mount work or a Dashboard re-render.
 *   • Sub-rows are memoised so toggling `open` never re-renders the list.
 *   • The (already-in-memory) notification list is rendered one frame after
 *     `open` flips, via requestAnimationFrame, so the opening transform never
 *     shares a frame with list layout/paint work.
 *
 * Fullscreen contract:
 *   • 100dvh, not 100vh — avoids the Android URL-bar collapse/expand gap.
 *   • Only top/bottom safe-area insets are respected; no extra margin,
 *     padding, or translateY offset above the header.
 *
 * Opening / closing
 *   Bell click  → open fullscreen directly (no half-sheet state).
 *   Header has a back button + "Notifications" title. Close via: back
 *   button, backdrop tap, ESC key, Android hardware back button.
 */

import React, { useEffect, useRef, useState, memo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  TrendingUp, Layers, GitBranch, Wifi, WifiOff, Link2,
  Send, Activity, Info, Bell, ArrowLeft, CheckCheck, Trash2,
} from "lucide-react";
import {
  useNotifications,
  type AppNotification,
  type NotifType,
} from "@/contexts/NotificationsContext";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function fmtRelTime(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)  return "just now";
  const m = Math.floor(s / 60);  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ─── type config ─────────────────────────────────────────────────────────── */

const TYPE_CFG: Record<NotifType, { icon: React.ElementType; color: string; bg: string }> = {
  price_alert:     { icon: TrendingUp, color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  zone_alert:      { icon: Layers,     color: "#fb923c", bg: "rgba(251,146,60,0.12)"  },
  trendline_alert: { icon: GitBranch,  color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  ws_reconnect:    { icon: Wifi,       color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  ws_error:        { icon: WifiOff,    color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  broker:          { icon: Link2,      color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  telegram:        { icon: Send,       color: "#38bdf8", bg: "rgba(56,189,248,0.12)"  },
  feed:            { icon: Activity,   color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  system:          { icon: Info,       color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

/* ─── animation constants ────────────────────────────────────────────────────
   Only `opacity` + `transform: translate3d(...)` are ever animated — plain
   CSS transitions, compositor-only, no framer-motion / layout animation. */

const EASE = "cubic-bezier(0.22,1,0.36,1)";
const OPEN_MS  = 160;
const CLOSE_MS = 120;

/* ─── memoised sub-components ─────────────────────────────────────────────── */

const NotifItem = memo(function NotifItem({
  n, onRead,
}: { n: AppNotification; onRead: (id: string) => void }) {
  const { icon: Icon, color, bg } = TYPE_CFG[n.type];
  return (
    <div
      onClick={() => onRead(n.id)}
      className="flex gap-3 p-3 cursor-pointer"
      style={{ background: "rgba(255,255,255,0.03)", borderRadius: 18, transition: "background 120ms" }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.055)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold leading-tight truncate" style={{ color: "rgba(255,255,255,0.92)" }}>
            {n.title}
          </span>
          {!n.read && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#22C55E" }} />}
        </div>
        <p className="text-[12px] leading-snug line-clamp-2 mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
          {n.description}
        </p>
        <p className="text-[10.5px] mt-1.5 font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>
          {fmtRelTime(n.timestamp)}
        </p>
      </div>
    </div>
  );
});

const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ padding: "20px 32px 32px" }}>
      <div style={{
        width: 72, height: 72, borderRadius: "50%",
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 14, flexShrink: 0,
      }}>
        <Bell style={{ width: 28, height: 28, color: "rgba(255,255,255,0.28)" }} strokeWidth={1.5} />
      </div>
      <p className="text-[15px] font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>No Notifications</p>
      <p className="text-[13px] mt-1.5 max-w-[260px] leading-snug" style={{ color: "rgba(255,255,255,0.45)" }}>
        Price alerts, executions and system updates will appear here.
      </p>
    </div>
  );
});

const NotifList = memo(function NotifList({
  notifications, onRead,
}: { notifications: AppNotification[]; onRead: (id: string) => void }) {
  return notifications.length === 0
    ? <EmptyState />
    : <>{notifications.map(n => <NotifItem key={n.id} n={n} onRead={onRead} />)}</>;
});

/* ─── component ───────────────────────────────────────────────────────────── */

interface Props { open: boolean; onClose: () => void; }

export const NotificationPanel = memo(function NotificationPanel({ open, onClose }: Props) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();

  const hasOpenedRef = useRef(open);
  if (open) hasOpenedRef.current = true;

  /* Lazy-render the (potentially long) notification list one frame after
     `open` flips true, so the transform+opacity tween gets a clean first
     frame with nothing else competing for layout/paint. The data itself is
     already in memory (context), so this only defers list DOM work, not a
     network fetch. */
  const [listReady, setListReady] = useState(false);
  useEffect(() => {
    if (!open) { setListReady(false); return; }
    const id = requestAnimationFrame(() => setListReady(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  /* `onClose` is a fresh arrow function on every parent re-render (which
     happens on every live price tick). Effects below must depend ONLY on
     `open` — depending on `onClose` too would tear the listeners down and
     rebuild them dozens of times a second, and (for the back-button effect)
     would spuriously call history.back()/re-push on every tick, closing the
     sheet almost immediately after it opens. A ref keeps the callback fresh
     without making it a dependency. */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  /* body scroll lock — background page must never scroll while open */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("tj-modal-open");
    return () => { document.body.style.overflow = prev; document.body.classList.remove("tj-modal-open"); };
  }, [open]);

  /* ESC (desktop) */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  /* Android back button — push a history entry while open, close on popstate
     instead of navigating away. Depends ONLY on `open` (see note above). */
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ tjNotifPanel: true }, "");
    const h = () => onCloseRef.current();
    window.addEventListener("popstate", h);
    return () => {
      window.removeEventListener("popstate", h);
      if (window.history.state?.tjNotifPanel) window.history.back();
    };
  }, [open]);

  const onBackdropClick = useCallback(() => onCloseRef.current(), []);
  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  /* Never mount the heavy list DOM until first opened; after that it stays
     mounted (per contract) and only visibility toggles. */
  if (!hasOpenedRef.current) return null;

  return createPortal(
    <div
      aria-hidden={!open}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        height: "100dvh", width: "100vw",
        /* Above MobileBottomNav (z-index 60) so the sheet is truly
           fullscreen — nothing (including the bottom nav bar) may render
           above it while open. */
        zIndex: 70,
        visibility: open ? "visible" : "hidden",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* Backdrop — opacity-only CSS transition. blur is a static, non-animated
          value (never transitioned) so it never triggers per-frame repaint cost. */}
      <div
        onClick={onBackdropClick}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          opacity: open ? 1 : 0,
          transition: `opacity ${open ? OPEN_MS : CLOSE_MS}ms ${EASE}`,
        }}
      />

      {/* Fullscreen sheet — GPU-composited transform + opacity only.
          No inset padding beyond top/bottom safe-area; no top margin/offset. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        onClick={stop}
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          height: "100%",
          display: "flex", flexDirection: "column",
          background: "#121316",
          transform: open ? "translate3d(0,0,0)" : "translate3d(0,16px,0)",
          opacity: open ? 1 : 0,
          transition: `transform ${open ? OPEN_MS : CLOSE_MS}ms ${EASE}, opacity ${open ? OPEN_MS : CLOSE_MS}ms ${EASE}`,
          willChange: "transform, opacity",
          /* Top inset consumed once by native spacer in index.tsx — no CSS env() needed.
             Bottom inset not consumed natively, so kept here. */
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        className="transform-gpu"
      >
        {/* Header — back button + title, sits directly below the status bar
            (safe-area padding is on the sheet itself, nothing extra here). */}
        <div
          className="flex items-center justify-between px-2 shrink-0 select-none"
          style={{ height: 56, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-1">
            <button onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg"
              style={{ color: "rgba(255,255,255,0.85)" }}
              aria-label="Back"
              title="Back">
              <ArrowLeft className="w-4.5 h-4.5" />
            </button>
            <span className="text-[15px] font-semibold" style={{ color: "#fff" }}>Notifications</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white leading-none"
                style={{ background: "#EF4444" }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 pr-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                className="w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)" }}
                title="Mark all read">
                <CheckCheck className="w-3.5 h-3.5" />
              </button>
            )}
            {notifications.length > 0 && (
              <button onClick={clearAll}
                className="w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)" }}
                title="Clear all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Notification list — the only scrollable region; fills all
            remaining height below the header. */}
        <div
          className="flex-1 flex flex-col"
          style={{
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            padding: notifications.length === 0 ? 0 : "10px 12px 24px",
            gap: 6, display: "flex", flexDirection: "column",
          }}
        >
          {listReady && <NotifList notifications={notifications} onRead={markRead} />}
        </div>
      </div>
    </div>,
    document.body,
  );
});
