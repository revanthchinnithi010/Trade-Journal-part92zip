import { useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useDragControls, type PanInfo } from "framer-motion";
import {
  TrendingUp, Layers, GitBranch, Wifi, WifiOff, Link2,
  Send, Activity, Info, CheckCheck, Trash2, X, Bell,
} from "lucide-react";
import {
  useNotifications,
  type AppNotification,
  type NotifType,
} from "@/contexts/NotificationsContext";
import { useIsMobile } from "@/hooks/use-mobile";

function fmtRelTime(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60)  return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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

// Premium, no-bounce ease — matches the app's other sheets/menus.
const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

const backdropVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1 },
};

const sheetVariants = {
  hidden:  { y: "100%", opacity: 0, scale: 0.98, transition: { duration: 0.20, ease: PREMIUM_EASE } },
  visible: { y: 0,       opacity: 1, scale: 1,    transition: { duration: 0.28, ease: PREMIUM_EASE } },
};

function NotifItem({ n, onRead }: { n: AppNotification; onRead: (id: string) => void }) {
  const cfg  = TYPE_CONFIG[n.type];
  const Icon = cfg.icon;

  return (
    <div
      onClick={() => onRead(n.id)}
      className="flex gap-3 p-3 cursor-pointer transition-colors duration-150"
      style={{
        background:   "rgba(255,255,255,0.03)",
        borderRadius: 18,
      }}
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
    <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ padding: 32 }}>
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Bell className="w-7 h-7" style={{ color: "rgba(255,255,255,0.30)" }} strokeWidth={1.5} />
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

interface Props {
  open: boolean;
  onClose: () => void;
}

const SWIPE_CLOSE_DISTANCE = 120;
const SWIPE_CLOSE_VELOCITY = 500;

export function NotificationPanel({ open, onClose }: Props) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const isMobile = useIsMobile();
  const dragControls = useDragControls();

  // ESC closes on desktop.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Suppress glass-card blur elsewhere while open, matching the app's other
  // premium overlays (ProfileMenu) — cheap to animate, avoids re-blurring
  // the live-ticking dashboard/chart underneath every frame.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("tj-modal-open");
    return () => document.body.classList.remove("tj-modal-open");
  }, [open]);

  function handleDragEnd(_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    if (info.offset.y > SWIPE_CLOSE_DISTANCE || info.velocity.y > SWIPE_CLOSE_VELOCITY) {
      onClose();
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — fades independently of the sheet's transform. */}
          <motion.div
            key="notif-backdrop"
            className="fixed inset-0"
            style={{
              zIndex:               55,
              background:           "rgba(0,0,0,0.55)",
              backdropFilter:       "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              willChange:           "opacity",
            }}
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.20, ease: PREMIUM_EASE }}
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            key="notif-sheet"
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
            className="fixed left-0 right-0 bottom-0 flex flex-col"
            style={{
              zIndex:       56,
              width:        "100%",
              minHeight:    "35vh",
              maxHeight:    "75vh",
              background:   "#121316",
              borderTop:    "1px solid rgba(255,255,255,0.06)",
              borderTopLeftRadius:  28,
              borderTopRightRadius: 28,
              boxShadow:    "0 -16px 48px rgba(0,0,0,0.45)",
              willChange:   "transform, opacity",
              touchAction:  "none",
            }}
          >
            {/* Grab handle — the only drag-initiation surface, so internal
                list scroll never fights the sheet's swipe-to-close gesture. */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="w-full flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing"
              style={{ height: 20, touchAction: "none" }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.16)" }} />
            </div>

            {/* Header */}
            <div
              className="flex items-center justify-between px-4 pb-3 shrink-0"
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
              <div className="flex items-center gap-1.5">
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
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.72)" }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content — internal scroll only; page/bottom nav stay put. */}
            <div
              className="flex-1 overflow-y-auto flex flex-col"
              style={{
                minHeight: 0,
                padding: notifications.length === 0 ? 0 : "10px 12px",
                paddingBottom: notifications.length === 0 ? 0 : (isMobile ? 96 : 16),
                gap: 6,
                display: "flex",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {notifications.length === 0 ? (
                <EmptyState />
              ) : (
                notifications.map(n => <NotifItem key={n.id} n={n} onRead={markRead} />)
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
