/**
 * NotificationPanel — native iOS/Android-style bottom sheet.
 *
 * Performance contract (half → full must hit 60 fps):
 *   • Only `transform: translateY` is animated on the RAF hot path.
 *   • React state (`snap`) is NEVER updated while an animation is running —
 *     only after it settles. This prevents the main-thread layout
 *     recalculation that the overflow/touchAction flip would otherwise
 *     trigger in the middle of the spring.
 *   • No useVelocity / useTransform subscribers on `y` — all derivative
 *     values are either static or CSS-transition-driven.
 *   • Backdrop blur is a static CSS layer; the dark tint is a plain CSS
 *     transition. No MotionValue drives the backdrop at all.
 *
 * Snap states
 *   closed  y = windowH + 20   off-screen
 *   half    y = windowH × 0.55  45 % visible
 *   full    y = 0              100 % visible
 *
 * Transition rules
 *   bell → half
 *   half + drag-up   → full
 *   full + drag-down → half
 *   half + drag-down → closed
 *   X / backdrop / ESC → closed
 */

import React, {
  useRef, useEffect, useState, useCallback, memo,
} from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValue, animate } from "framer-motion";
import {
  TrendingUp, Layers, GitBranch, Wifi, WifiOff, Link2,
  Send, Activity, Info, CheckCheck, Trash2, X, Bell,
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

/* ─── animation constants ─────────────────────────────────────────────────── */

const EASE_OPEN  = [0.22, 1, 0.36, 1] as const;
const SPRING_MID = { type: "spring", stiffness: 340, damping: 34, mass: 0.8 } as const;

const RESIST_TOP = 0.08;
const RESIST_BOT = 0.22;

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

/* ─── snap state ──────────────────────────────────────────────────────────── */

type Snap = "closed" | "half" | "full";

/* ─── component ───────────────────────────────────────────────────────────── */

interface Props { open: boolean; onClose: () => void; }

export function NotificationPanel({ open, onClose }: Props) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();

  /* window height */
  const [windowH, setWindowH] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800);
  useEffect(() => {
    const h = () => setWindowH(window.innerHeight);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  /* snap Y positions */
  const HALF_Y   = windowH * 0.55;
  const FULL_Y   = 0;
  const CLOSED_Y = windowH + 20;

  /* ── y MotionValue — the ONLY thing on the RAF hot path ── */
  const y = useMotionValue(CLOSED_Y);

  /* ── snap state:
        snapRef  = updated immediately (controls drag logic, no re-render)
        snap     = React state, updated ONLY after animation settles
                   (controls overflow/touchAction — changing it mid-spring
                    triggers a layout recalc that drops frames)
  ── */
  const snapRef = useRef<Snap>("closed");
  const [snap, setSnap] = useState<Snap>("closed");

  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef   = useRef<{ stop: () => void } | null>(null);

  /* ── animate to a y target, settle snap state when done ── */
  function goTo(
    targetY:    number,
    opts:       object,
    nextSnap?:  Snap,      // if provided, setSnap fires after animation
    onDone?:    () => void,
  ) {
    animRef.current?.stop();
    const anim = animate(y, targetY, opts);
    animRef.current = anim;
    anim.then(() => {
      if (nextSnap !== undefined) setSnap(nextSnap);
      onDone?.();
    });
  }

  /* ── user-initiated close ── */
  const closeSheet = useCallback((vel = 0) => {
    // Close: update both ref AND state immediately so pointer-events go to
    // none right away — prevents accidental re-trigger during exit animation.
    snapRef.current = "closed";
    setSnap("closed");
    goTo(CLOSED_Y, { duration: 0.18, ease: EASE_OPEN, velocity: vel }, undefined, onClose);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, CLOSED_Y]);

  /* ── open / external-close ── */
  const openRef = useRef(open);
  useEffect(() => {
    const was = openRef.current;
    openRef.current = open;
    if (open && !was) {
      animRef.current?.stop();
      y.set(CLOSED_Y);
      snapRef.current = "half";
      setSnap("half");
      goTo(HALF_Y, { duration: 0.22, ease: EASE_OPEN });
    } else if (!open && was) {
      animRef.current?.stop();
      y.set(CLOSED_Y);
      snapRef.current = "closed";
      setSnap("closed");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* body scroll lock */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("tj-modal-open");
    return () => { document.body.style.overflow = prev; document.body.classList.remove("tj-modal-open"); };
  }, [open]);

  /* ESC */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") closeSheet(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, closeSheet]);

  /* ── raw pointer drag ─────────────────────────────────────────────────────
     Every pointermove calls y.set() directly — no framer event system,
     no React, zero overhead. Velocity is tracked manually (no useVelocity
     subscriber) so there are zero derived MotionValues on the hot path.
  ── */
  const startDrag = useCallback((e: React.PointerEvent | PointerEvent) => {
    if ((e as PointerEvent).button > 0) return;
    animRef.current?.stop();

    const startClientY = e.clientY;
    const startY       = y.get();
    const fromSnap     = snapRef.current;

    /* manual velocity tracking — no useVelocity subscriber */
    let lastY    = e.clientY;
    let lastT    = performance.now();
    let velocity = 0;

    function clamp(raw: number): number {
      if (raw < FULL_Y) return FULL_Y + (raw - FULL_Y) * RESIST_TOP;
      if (fromSnap === "full"  && raw > HALF_Y + 60) return HALF_Y + 60 + (raw - HALF_Y - 60) * RESIST_BOT;
      if (fromSnap === "half"  && raw > HALF_Y + 80) return HALF_Y + 80 + (raw - HALF_Y - 80) * RESIST_BOT;
      return raw;
    }

    function onMove(ev: PointerEvent) {
      const now = performance.now();
      const dt  = now - lastT;
      if (dt > 0) velocity = (ev.clientY - lastY) / dt * 1000;
      lastT = now; lastY = ev.clientY;
      y.set(clamp(startY + (ev.clientY - startClientY)));
    }

    function onUp() {
      document.removeEventListener("pointermove",   onMove);
      document.removeEventListener("pointerup",     onUp);
      document.removeEventListener("pointercancel", onUp);

      const curY = y.get();

      if (fromSnap === "full") {
        /* Full → Half */
        if (velocity > 600 || curY > HALF_Y * 0.4) {
          snapRef.current = "half";
          goTo(HALF_Y, { ...SPRING_MID, velocity }, "half");
        } else {
          goTo(FULL_Y, { ...SPRING_MID, velocity });   // bounce back to full
        }
      } else if (fromSnap === "half") {
        /* Half → Full */
        if (velocity < -500 || curY < HALF_Y * 0.6) {
          snapRef.current = "full";
          goTo(FULL_Y, { ...SPRING_MID, velocity }, "full");
        /* Half → Closed */
        } else if (velocity > 500 || curY > HALF_Y + windowH * 0.10) {
          closeSheet(velocity);
        /* Stay half */
        } else {
          goTo(HALF_Y, { ...SPRING_MID, velocity });
        }
      }
    }

    document.addEventListener("pointermove",   onMove,  { passive: true });
    document.addEventListener("pointerup",     onUp);
    document.addEventListener("pointercancel", onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, HALF_Y, FULL_Y, CLOSED_Y, closeSheet]);

  /* content area drag interlock */
  function onContentPointerDown(e: React.PointerEvent) {
    if (snapRef.current === "half") { startDrag(e); return; }
    if (snapRef.current === "full" && (scrollRef.current?.scrollTop ?? 0) < 2) startDrag(e);
  }

  const isOpen = snap !== "closed";

  /* ── render ───────────────────────────────────────────────────────────────
     No MotionValues on the backdrop at all.
     - Blur layer:      static CSS, opacity CSS-transitioned on open/close only
     - Dark tint layer: CSS-transitioned, no RAF involvement
     Sheet: only `y` (transform) is RAF-driven. Nothing else changes per frame.
  ── */
  return createPortal(
    <>
      {/* ── Blur layer: always static, CSS transition on open/close only ── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 55,
        backdropFilter:       "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        opacity:    isOpen ? 1 : 0,
        transition: `opacity ${isOpen ? "0.22s" : "0.18s"} ease`,
        pointerEvents: "none",
      }} />

      {/* ── Dark tint: CSS transition, no MotionValue ── */}
      <div
        onClick={() => { if (isOpen) closeSheet(); }}
        style={{
          position: "fixed", inset: 0, zIndex: 55,
          background: "rgba(0,0,0,0.55)",
          opacity:    isOpen ? 1 : 0,
          transition: `opacity ${isOpen ? "0.22s" : "0.18s"} ease`,
          pointerEvents: isOpen ? "auto" : "none",
        }}
      />

      {/* ── Sheet ─────────────────────────────────────────────────────────
          One animated property: `y` (transform: translateY).
          Everything else is static — no per-frame paints or layouts.
      ── */}
      <motion.div
        className="fixed left-0 right-0 flex flex-col"
        style={{
          top: 0, height: "100dvh",
          y,
          borderTopLeftRadius:  28,
          borderTopRightRadius: 28,
          zIndex:     56,
          background: "#121316",
          borderTop:  "1px solid rgba(255,255,255,0.07)",
          boxShadow:  "0 -8px 32px rgba(0,0,0,0.5)",
          willChange: "transform",
          touchAction: "none",
          pointerEvents: isOpen ? "auto" : "none",
        }}
      >
        {/* Handle */}
        <div
          onPointerDown={startDrag}
          className="w-full flex items-center justify-center shrink-0 select-none"
          style={{ height: 24, paddingTop: 10, cursor: "grab" }}
        >
          <div style={{ width: 42, height: 5, borderRadius: 999, background: "rgba(255,255,255,0.18)" }} />
        </div>

        {/* Header */}
        <div
          onPointerDown={startDrag}
          className="flex items-center justify-between px-4 pb-3 shrink-0 select-none"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "grab" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <Bell className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.72)" }} />
            </div>
            <span className="text-[15px] font-semibold" style={{ color: "#fff" }}>Notifications</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white leading-none"
                style={{ background: "#EF4444" }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5" onPointerDown={e => e.stopPropagation()}>
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
            <button onClick={() => closeSheet()}
              className="w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.72)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notification list
            overflow and touchAction only flip AFTER the animation settles
            (driven by React `snap` state which is set in anim.then()),
            so no layout recalculation fires during the spring. */}
        <div
          ref={scrollRef}
          onPointerDown={onContentPointerDown}
          className="flex-1 flex flex-col"
          style={{
            minHeight: 0,
            overflowY: snap === "full" ? "auto" : "hidden",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            touchAction: snap === "full" ? "pan-y" : "none",
            padding: notifications.length === 0 ? 0 : "10px 12px 96px",
            gap: 6, display: "flex", flexDirection: "column",
          }}
        >
          {notifications.length === 0
            ? <EmptyState />
            : notifications.map(n => <NotifItem key={n.id} n={n} onRead={markRead} />)
          }
        </div>
      </motion.div>
    </>,
    document.body,
  );
}
