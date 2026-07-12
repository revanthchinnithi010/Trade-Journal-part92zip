import { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  motion,
  AnimatePresence,
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

/* ─── time helper ─────────────────────────────────────────────────────────── */

function fmtRelTime(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60)  return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ─── type config ─────────────────────────────────────────────────────────── */

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

/* ─── snap configuration ──────────────────────────────────────────────────── */

// y = distance from top of screen to top of sheet (sheet is 100dvh, fixed at top:0)
// visible height = windowH − y
//   collapsed → y = 62 % · wH  →  38 % visible
//   half       → y = 30 % · wH  →  70 % visible
//   full       → y = 0           → 100 % visible
const SNAP_FRACS    = [0.62, 0.30, 0.0] as const;
const IDX_COLLAPSED = 0;
const IDX_HALF      = 1;
const IDX_FULL      = 2;

const SPRING_OPEN  = { type: "spring", stiffness: 320, damping: 34, mass: 1 } as const;
const SPRING_SNAP  = { type: "spring", stiffness: 340, damping: 36, mass: 1 } as const;
const SPRING_CLOSE = { type: "spring", stiffness: 380, damping: 40, mass: 1 } as const;

// Rubber-band resistance factor beyond limits
const RESISTANCE = 0.18;

/* ─── sub-components ──────────────────────────────────────────────────────── */

function NotifItem({ n, onRead }: { n: AppNotification; onRead: (id: string) => void }) {
  const cfg  = TYPE_CONFIG[n.type];
  const Icon = cfg.icon;
  return (
    <div
      onClick={() => onRead(n.id)}
      className="flex gap-3 p-3 cursor-pointer transition-colors duration-150"
      style={{ background: "rgba(255,255,255,0.03)", borderRadius: 18 }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.055)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
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
          {!n.read && (
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#22C55E" }} />
          )}
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
}

function EmptyState() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center text-center"
      style={{ padding: "20px 32px 32px" }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
          flexShrink: 0,
        }}
      >
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
}

/* ─── main component ──────────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotificationPanel({ open, onClose }: Props) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();

  // ── window height (refresh on resize)
  const [windowH, setWindowH] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800,
  );
  useEffect(() => {
    function onResize() { setWindowH(window.innerHeight); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const snapPoints = SNAP_FRACS.map((f) => windowH * f);

  // ── y MotionValue — the ONLY thing we animate; no React state during drag
  const y         = useMotionValue(windowH);
  const yVelocity = useVelocity(y);

  // ── derived transforms (MotionValue chain — zero React renders)
  const borderRadiusValue = useTransform(y, [0, windowH * 0.08], [0, 28]);
  const backdropOpacity   = useTransform(
    y,
    [snapPoints[IDX_COLLAPSED] + 120, snapPoints[IDX_COLLAPSED]],
    [0, 1],
  );

  // ── snap index (React state only for scroll-enable / CSS toggling)
  const [snapIdx, setSnapIdx]   = useState(IDX_COLLAPSED);
  const snapIdxRef              = useRef(IDX_COLLAPSED);

  // ── scroll container
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── animation handle so we can stop in-flight springs when drag starts
  const animRef = useRef<{ stop: () => void } | null>(null);

  /* ── snap helper ── */
  const snapTo = useCallback(
    (idx: number, vel = 0) => {
      animRef.current?.stop();
      snapIdxRef.current = idx;
      setSnapIdx(idx);
      animRef.current = animate(y, snapPoints[idx], { ...SPRING_SNAP, velocity: vel });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapPoints, y],
  );

  /* ── close helper ── */
  const closeSheet = useCallback(
    (vel = 0) => {
      animRef.current?.stop();
      animRef.current = animate(y, windowH + 40, { ...SPRING_CLOSE, velocity: vel });
      // call onClose once the spring settles
      animRef.current.then(onClose);
    },
    [y, windowH, onClose],
  );

  /* ── open / close effect ── */
  useEffect(() => {
    if (open) {
      animRef.current?.stop();
      y.set(windowH + 40);
      snapIdxRef.current = IDX_COLLAPSED;
      setSnapIdx(IDX_COLLAPSED);
      animRef.current = animate(y, snapPoints[IDX_COLLAPSED], SPRING_OPEN);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  /* ── ESC closes ── */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeSheet(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeSheet]);

  /* ── raw pointer drag ────────────────────────────────────────────────────
     Direct MotionValue mutation — no framer drag machinery, zero latency.
  ── */
  const startDrag = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      // Only primary pointer (left mouse / first touch)
      if ((e as PointerEvent).button > 0) return;

      // Stop any in-flight spring immediately
      animRef.current?.stop();

      const startClientY   = e.clientY;
      const startMotionY   = y.get();
      const topLimit       = snapPoints[IDX_FULL];       // 0 — can't go above full screen
      const bottomSoftStop = snapPoints[IDX_COLLAPSED];  // rubber-band kicks in here

      function applyRubberBand(raw: number): number {
        if (raw < topLimit) {
          // above full: very stiff resistance
          return topLimit + (raw - topLimit) * RESISTANCE;
        }
        if (raw > bottomSoftStop) {
          // below collapsed: moderate resistance (pre-close feedback)
          const excess = raw - bottomSoftStop;
          return bottomSoftStop + excess * (RESISTANCE * 2);
        }
        return raw;
      }

      function onMove(ev: PointerEvent) {
        const delta = ev.clientY - startClientY;
        y.set(applyRubberBand(startMotionY + delta));
      }

      function onUp(_ev: PointerEvent) {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup",   onUp);
        document.removeEventListener("pointercancel", onUp);

        const currentY = y.get();
        const vel      = yVelocity.get();

        // Fast swipe-down at or below half → close
        if (vel > 700 && currentY > snapPoints[IDX_HALF]) {
          closeSheet(vel);
          return;
        }
        // Dragged well below collapsed → close
        if (currentY > bottomSoftStop + 80) {
          closeSheet(vel);
          return;
        }

        // Find nearest snap point (bias toward velocity direction)
        let bestIdx = IDX_COLLAPSED;
        snapPoints.forEach((sp, i) => {
          if (Math.abs(currentY - sp) < Math.abs(currentY - snapPoints[bestIdx])) {
            bestIdx = i;
          }
        });

        snapTo(bestIdx, vel);
      }

      document.addEventListener("pointermove",   onMove,  { passive: true });
      document.addEventListener("pointerup",     onUp);
      document.addEventListener("pointercancel", onUp);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapPoints, y, yVelocity, closeSheet, snapTo],
  );

  /* ── content area: only initiate drag when not fully expanded or at scroll top ── */
  function onContentPointerDown(e: React.PointerEvent) {
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    if (snapIdxRef.current < IDX_FULL || scrollTop === 0) {
      startDrag(e);
    }
  }

  const isFullyExpanded = snapIdx === IDX_FULL;

  /* ── render ── */
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            key="notif-backdrop"
            className="fixed inset-0"
            style={{
              zIndex:               55,
              background:           "rgba(0,0,0,0.55)",
              backdropFilter:       "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              willChange:           "opacity",
              opacity:              backdropOpacity,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => closeSheet()}
          />

          {/* ── Bottom sheet ──
              Position: fixed top:0, full height.
              Transform y shifts it down so only the bottom portion is visible.
              No framer-motion drag — raw pointer events write to y directly.
          ── */}
          <motion.div
            key="notif-sheet"
            className="fixed left-0 right-0 flex flex-col"
            style={{
              top:                  0,
              height:               "100dvh",
              y,
              borderTopLeftRadius:  borderRadiusValue,
              borderTopRightRadius: borderRadiusValue,
              zIndex:               56,
              background:           "#121316",
              borderTop:            "1px solid rgba(255,255,255,0.06)",
              boxShadow:            "0 -20px 60px rgba(0,0,0,0.55)",
              willChange:           "transform",
              // touchAction none so pointer events fire without 300ms tap delay
              touchAction:          "none",
            }}
          >
            {/* ── Drag handle ── */}
            <div
              onPointerDown={startDrag}
              className="w-full flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing select-none"
              style={{ height: 22, paddingTop: 8 }}
            >
              <div
                style={{
                  width:        44,
                  height:       5,
                  borderRadius: 999,
                  background:   "rgba(255,255,255,0.18)",
                }}
              />
            </div>

            {/* ── Header ── */}
            <div
              onPointerDown={startDrag}
              className="flex items-center justify-between px-4 pb-3 shrink-0 cursor-grab active:cursor-grabbing select-none"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <Bell className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.72)" }} />
                </div>
                <span className="text-[15px] font-semibold" style={{ color: "#FFFFFF" }}>Notifications</span>
                {unreadCount > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white leading-none"
                    style={{ background: "#EF4444" }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>

              {/* Buttons — stop propagation so taps don't initiate drag */}
              <div
                className="flex items-center gap-1.5"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)" }}
                    title="Mark all read"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.55)" }}
                    title="Clear all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => closeSheet()}
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.72)" }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── Scroll content ── */}
            <div
              ref={scrollRef}
              onPointerDown={onContentPointerDown}
              className="flex-1 flex flex-col"
              style={{
                minHeight:               0,
                overflowY:               isFullyExpanded ? "auto" : "hidden",
                overflowX:               "hidden",
                WebkitOverflowScrolling: "touch",
                // pan-y lets the browser scroll the list; drag handled above
                touchAction:             isFullyExpanded ? "pan-y" : "none",
                padding:                 notifications.length === 0 ? 0 : "10px 12px 96px",
                gap:                     6,
                display:                 "flex",
                flexDirection:           "column",
              }}
            >
              {notifications.length === 0 ? (
                <EmptyState />
              ) : (
                notifications.map((n) => (
                  <NotifItem key={n.id} n={n} onRead={markRead} />
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
