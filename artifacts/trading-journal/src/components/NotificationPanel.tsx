/**
 * NotificationPanel — native iOS/Android-style bottom sheet.
 *
 * Three snap states:
 *   closed  → y = windowH + 20   (off-screen below)
 *   half    → y = windowH * 0.55  (45 % of screen visible)
 *   full    → y = 0              (100 % visible, safe-area respected)
 *
 * Transition rules:
 *   bell click           → half
 *   half  + drag up      → full
 *   full  + drag down    → half
 *   half  + drag down    → closed
 *   backdrop / X / ESC   → closed
 *
 * Always mounted — visibility is driven by the y MotionValue, never by
 * React conditional rendering. No layout shifts, no Dashboard re-renders.
 */

import React, { useRef, useEffect, useState, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import {
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  animate,
} from "framer-motion";
import {
  TrendingUp, Layers, GitBranch, Wifi, WifiOff, Link2,
  Send, Activity, Info, CheckCheck, Trash2, X, Bell,
} from "lucide-react";
import {
  useNotifications,
  type AppNotification,
  type NotifType,
} from "@/contexts/NotificationsContext";

/* ─── helpers ──────────────────────────────────────────────────────────────── */

function fmtRelTime(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60)  return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs  = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ─── type config ──────────────────────────────────────────────────────────── */

const TYPE_CONFIG: Record<NotifType, { icon: React.ElementType; color: string; bg: string }> = {
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

/* ─── animation constants ──────────────────────────────────────────────────── */

// cubic-bezier(0.22, 1, 0.36, 1) — premium deceleration used by iOS
const EASE_PREMIUM = [0.22, 1, 0.36, 1] as const;

// Spring for half↔full transitions
const SPRING_MID = { type: "spring", stiffness: 340, damping: 34, mass: 0.8 } as const;

// Rubber-band resistance when dragging past hard limits
const RESISTANCE_TOP    = 0.08;  // very stiff above full-screen
const RESISTANCE_BOTTOM = 0.22;  // moderate below half (gives close-feedback feel)

/* ─── sub-components (memoised) ────────────────────────────────────────────── */

const NotifItem = memo(function NotifItem({
  n, onRead,
}: { n: AppNotification; onRead: (id: string) => void }) {
  const cfg  = TYPE_CONFIG[n.type];
  const Icon = cfg.icon;
  return (
    <div
      onClick={() => onRead(n.id)}
      className="flex gap-3 p-3 cursor-pointer"
      style={{ background: "rgba(255,255,255,0.03)", borderRadius: 18, transition: "background 120ms" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.055)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";  }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: cfg.bg }}
      >
        <Icon className="w-4 h-4" style={{ color: cfg.color }} />
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
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 14, flexShrink: 0,
      }}>
        <Bell style={{ width: 28, height: 28, color: "rgba(255,255,255,0.28)" }} strokeWidth={1.5} />
      </div>
      <p className="text-[15px] font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
        No Notifications
      </p>
      <p className="text-[13px] mt-1.5 max-w-[260px] leading-snug" style={{ color: "rgba(255,255,255,0.45)" }}>
        Price alerts, executions and system updates will appear here.
      </p>
    </div>
  );
});

/* ─── snap state ───────────────────────────────────────────────────────────── */

type SheetSnap = "closed" | "half" | "full";

/* ─── main component ───────────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotificationPanel({ open, onClose }: Props) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();

  /* ── window height ── */
  const [windowH, setWindowH] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800,
  );
  useEffect(() => {
    const h = () => setWindowH(window.innerHeight);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  /* ── snap positions (y = distance from top of screen to top of sheet) ──
     Sheet is 100dvh tall, positioned at top:0.
     Visible height  =  windowH − y
       half   →  y = 0.55 × windowH  →  45 % visible
       full   →  y = 0               → 100 % visible
       closed →  y = windowH + 20    →   0 % visible (off-screen)
  ── */
  const HALF_Y   = windowH * 0.55;
  const FULL_Y   = 0;
  const CLOSED_Y = windowH + 20;

  /* ── motion values ── */
  const y         = useMotionValue(CLOSED_Y);
  const yVelocity = useVelocity(y);

  /* ── backdrop dark-tint opacity — MotionValue chain, NO blur on this layer ── */
  const backdropOpacity = useTransform(
    y,
    [CLOSED_Y, HALF_Y, FULL_Y],
    [0,       0.55,    0.72],
  );

  /* ── snap state — React state only for scroll-mode toggling ── */
  const [snap, setSnap]   = useState<SheetSnap>("closed");
  const snapRef           = useRef<SheetSnap>("closed");

  /* ── scroll container ── */
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ── animation handle ── */
  const animRef = useRef<{ stop: () => void } | null>(null);

  /* ── helpers ── */

  function commitSnap(s: SheetSnap) {
    snapRef.current = s;
    setSnap(s);
  }

  function animateTo(targetY: number, opts: object, onDone?: () => void) {
    animRef.current?.stop();
    const anim = animate(y, targetY, opts);
    animRef.current = anim;
    if (onDone) anim.then(onDone);
  }

  /* ── open / external-close driven by prop ── */
  const openRef = useRef(open);
  useEffect(() => {
    const wasOpen = openRef.current;
    openRef.current = open;

    if (open && !wasOpen) {
      // Closed → Half  (tween, 0.22 s)
      y.set(CLOSED_Y);
      commitSnap("half");
      animateTo(HALF_Y, { duration: 0.22, ease: EASE_PREMIUM });
    } else if (!open && wasOpen) {
      // External close (navigation, prop forced to false) — instant hide
      animRef.current?.stop();
      y.set(CLOSED_Y);
      commitSnap("closed");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ── user-initiated close (drag / X / backdrop / ESC) ── */
  const closeSheet = useCallback((vel = 0) => {
    commitSnap("closed");
    animateTo(
      CLOSED_Y,
      { duration: 0.18, ease: EASE_PREMIUM, velocity: vel },
      onClose,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, CLOSED_Y]);

  /* ── body scroll lock ── */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("tj-modal-open");
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("tj-modal-open");
    };
  }, [open]);

  /* ── ESC ── */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") closeSheet(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, closeSheet]);

  /* ── raw pointer drag ─────────────────────────────────────────────────────
     Direct y.set() on every pointermove — zero framer-motion overhead,
     guaranteed 60 fps. Springs fire only on pointerup.
  ── */
  const startDrag = useCallback((e: React.PointerEvent | PointerEvent) => {
    if ((e as PointerEvent).button > 0) return;

    animRef.current?.stop();

    const startClientY = e.clientY;
    const startY       = y.get();
    const fromSnap     = snapRef.current;

    /* resistance: clamp y so it can't overshoot hard limits */
    function clamp(raw: number): number {
      if (raw < FULL_Y) {
        // Dragging above full-screen edge
        return FULL_Y + (raw - FULL_Y) * RESISTANCE_TOP;
      }
      if (fromSnap === "full" && raw > HALF_Y + 60) {
        // At full, dragging toward half and beyond — light resistance
        const excess = raw - (HALF_Y + 60);
        return HALF_Y + 60 + excess * RESISTANCE_BOTTOM;
      }
      if (fromSnap === "half" && raw > HALF_Y + 80) {
        // At half, dragging toward close — moderate resistance
        const excess = raw - (HALF_Y + 80);
        return HALF_Y + 80 + excess * RESISTANCE_BOTTOM;
      }
      return raw;
    }

    function onMove(ev: PointerEvent) {
      y.set(clamp(startY + (ev.clientY - startClientY)));
    }

    function onUp() {
      document.removeEventListener("pointermove",   onMove);
      document.removeEventListener("pointerup",     onUp);
      document.removeEventListener("pointercancel", onUp);

      const curY = y.get();
      const vel  = yVelocity.get(); // px/s; positive = moving down

      if (fromSnap === "full") {
        /* Full → Half  (drag down past midpoint or fast swipe down) */
        const threshold = HALF_Y * 0.4;            // 40 % of the way to half
        if (vel > 600 || curY > threshold) {
          commitSnap("half");
          animateTo(HALF_Y, { ...SPRING_MID, velocity: vel });
        } else {
          animateTo(FULL_Y, { ...SPRING_MID, velocity: vel });
        }
      } else if (fromSnap === "half") {
        /* Half → Full  (drag up past midpoint or fast swipe up) */
        const upThreshold   = HALF_Y * 0.6;        // still 60 % of half-y remaining
        /* Half → Closed (drag down far or fast swipe down) */
        const downThreshold = HALF_Y + windowH * 0.10;

        if (vel < -500 || curY < upThreshold) {
          commitSnap("full");
          animateTo(FULL_Y, { ...SPRING_MID, velocity: vel });
        } else if (vel > 500 || curY > downThreshold) {
          closeSheet(vel);
        } else {
          animateTo(HALF_Y, { ...SPRING_MID, velocity: vel });
        }
      }
    }

    document.addEventListener("pointermove",   onMove,  { passive: true });
    document.addEventListener("pointerup",     onUp);
    document.addEventListener("pointercancel", onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, yVelocity, HALF_Y, FULL_Y, closeSheet]);

  /* content area: propagate drag only when appropriate */
  function onContentPointerDown(e: React.PointerEvent) {
    if (snapRef.current === "half") {
      // Half: content doesn't scroll → always start drag
      startDrag(e);
    } else if (snapRef.current === "full") {
      // Full: only start drag when list is scrolled to very top
      if ((scrollRef.current?.scrollTop ?? 0) < 2) startDrag(e);
    }
  }

  /* ── backdrop pointer-events: none when sheet is off-screen ── */
  const isOpen = snap !== "closed";

  /* ── render ───────────────────────────────────────────────────────────────
     Both backdrop and sheet are ALWAYS in the DOM.
     Visibility is driven purely by y (MotionValue) — no mount/unmount.
  ── */
  return createPortal(
    <>
      {/* ── Backdrop layer 1: static blur — CSS transition only, never RAF ── */}
      <div
        style={{
          position:             "fixed",
          inset:                0,
          zIndex:               55,
          backdropFilter:       "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          opacity:              isOpen ? 1 : 0,
          transition:           "opacity 0.18s ease",
          pointerEvents:        "none",   // clicks fall through to layer 2
        }}
      />

      {/* ── Backdrop layer 2: dark tint — RAF-driven opacity, zero blur cost ── */}
      <motion.div
        style={{
          position:      "fixed",
          inset:         0,
          zIndex:        55,
          background:    "rgba(0,0,0,0.55)",
          opacity:       backdropOpacity,
          pointerEvents: isOpen ? "auto" : "none",
          willChange:    "opacity",
        }}
        onClick={() => { if (isOpen) closeSheet(); }}
      />

      {/* ── Sheet ──────────────────────────────────────────────────────────
          Fixed at top:0, full dvh height.
          The y MotionValue pushes it below the viewport when closed.
          Only transform is animated — no height / top / bottom changes.
      ── */}
      <motion.div
        className="fixed left-0 right-0 flex flex-col"
        style={{
          top:                  0,
          height:               "100dvh",
          y,
          /* Static radius — never changes during animation.
             When fully expanded the rounded corners sit above the viewport
             so they're invisible anyway. Animating border-radius costs a
             CSS repaint every RAF tick — that's the primary lag source. */
          borderTopLeftRadius:  28,
          borderTopRightRadius: 28,
          zIndex:               56,
          background:           "#121316",
          borderTop:            "1px solid rgba(255,255,255,0.07)",
          boxShadow:            "0 -24px 64px rgba(0,0,0,0.6)",
          willChange:           "transform",
          touchAction:          "none",
          pointerEvents:        isOpen ? "auto" : "none",
        }}
      >
        {/* ── Handle bar ── */}
        <div
          onPointerDown={startDrag}
          className="w-full flex items-center justify-center shrink-0 select-none"
          style={{ height: 24, paddingTop: 10, cursor: "grab" }}
        >
          <div style={{
            width: 42, height: 5,
            borderRadius: 999,
            background: "rgba(255,255,255,0.18)",
          }} />
        </div>

        {/* ── Header ── */}
        <div
          onPointerDown={startDrag}
          className="flex items-center justify-between px-4 pb-3 shrink-0 select-none"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "grab" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              <Bell className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.72)" }} />
            </div>
            <span className="text-[15px] font-semibold" style={{ color: "#fff" }}>Notifications</span>
            {unreadCount > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white leading-none"
                style={{ background: "#EF4444" }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>

          {/* Action buttons — stop propagation so taps don't start a drag */}
          <div className="flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)" }}
                title="Mark all read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)" }}
                title="Clear all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => closeSheet()}
              className="w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.72)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Notification list ───────────────────────────────────────────
            At half:  overflow hidden, touch-action none → list doesn't scroll,
                      drag travels through to the sheet.
            At full:  overflow auto, touch-action pan-y → list scrolls normally.
        ── */}
        <div
          ref={scrollRef}
          onPointerDown={onContentPointerDown}
          className="flex-1 flex flex-col"
          style={{
            minHeight:               0,
            overflowY:               snap === "full" ? "auto" : "hidden",
            overflowX:               "hidden",
            WebkitOverflowScrolling: "touch",
            touchAction:             snap === "full" ? "pan-y" : "none",
            padding:                 notifications.length === 0 ? 0 : "10px 12px 96px",
            gap:                     6,
            display:                 "flex",
            flexDirection:           "column",
          }}
        >
          {notifications.length === 0
            ? <EmptyState />
            : notifications.map((n) => (
                <NotifItem key={n.id} n={n} onRead={markRead} />
              ))
          }
        </div>
      </motion.div>
    </>,
    document.body,
  );
}
