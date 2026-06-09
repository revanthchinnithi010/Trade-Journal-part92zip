import { useRef, useEffect } from "react";
import {
  TrendingUp, Layers, GitBranch, Wifi, WifiOff, Link2,
  Send, Activity, Info, CheckCheck, Trash2, X,
} from "lucide-react";
import icoBellUrl from "@assets/bell1_1780282162732.svg";
import {
  useNotifications,
  type AppNotification,
  type NotifType,
  type NotifSeverity,
} from "@/contexts/NotificationsContext";

function fmtRelTime(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60)  return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_CONFIG: Record<NotifType, { icon: React.ElementType; color: string; glow: string }> = {
  price_alert:     { icon: TrendingUp, color: "#60a5fa", glow: "rgba(96,165,250,0.18)"  },
  zone_alert:      { icon: Layers,     color: "#fb923c", glow: "rgba(251,146,60,0.18)"  },
  trendline_alert: { icon: GitBranch,  color: "#a78bfa", glow: "rgba(167,139,250,0.18)" },
  ws_reconnect:    { icon: Wifi,       color: "#34d399", glow: "rgba(52,211,153,0.18)"  },
  ws_error:        { icon: WifiOff,    color: "#f87171", glow: "rgba(248,113,113,0.18)" },
  broker:          { icon: Link2,      color: "#34d399", glow: "rgba(52,211,153,0.18)"  },
  telegram:        { icon: Send,       color: "#38bdf8", glow: "rgba(56,189,248,0.18)"  },
  feed:            { icon: Activity,   color: "#fbbf24", glow: "rgba(251,191,36,0.18)"  },
  system:          { icon: Info,       color: "#94a3b8", glow: "rgba(148,163,184,0.18)" },
};

const SEVERITY_BG: Record<NotifSeverity, string> = {
  success: "rgba(52,211,153,0.06)",
  warning: "rgba(251,191,36,0.06)",
  error:   "rgba(248,113,113,0.06)",
  info:    "rgba(96,165,250,0.06)",
};

const SEVERITY_BORDER: Record<NotifSeverity, string> = {
  success: "rgba(52,211,153,0.18)",
  warning: "rgba(251,191,36,0.18)",
  error:   "rgba(248,113,113,0.18)",
  info:    "rgba(96,165,250,0.18)",
};

function NotifItem({ n, onRead }: { n: AppNotification; onRead: (id: string) => void }) {
  const cfg  = TYPE_CONFIG[n.type];
  const Icon = cfg.icon;

  return (
    <div
      className="flex gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150"
      style={{
        background: n.read ? "transparent" : SEVERITY_BG[n.severity],
        border:     n.read ? "1px solid transparent" : `1px solid ${SEVERITY_BORDER[n.severity]}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-btn-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = n.read ? "transparent" : SEVERITY_BG[n.severity]; }}
      onClick={() => onRead(n.id)}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: cfg.glow, border: `1px solid ${cfg.glow}` }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-[12px] font-semibold text-white/90 leading-tight truncate">{n.title}</span>
          {!n.read && (
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.color }} />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{n.description}</p>
        <p className="text-[10px] mt-1" style={{ color: "rgba(148,163,184,0.5)" }}>{fmtRelTime(n.timestamp)}</p>
      </div>
    </div>
  );
}

interface Props {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function NotificationPanel({ onClose, anchorRef }: Props) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current  && !panelRef.current.contains(target) &&
        anchorRef.current && !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={panelRef}
      className="notif-panel absolute top-[calc(100%+10px)] right-0 w-[370px] max-h-[520px] flex flex-col z-50 rounded-2xl overflow-hidden"
      style={{
        background:          "var(--surface-header)",
        backdropFilter:      "blur(24px)",
        WebkitBackdropFilter:"blur(24px)",
        border:              "1px solid var(--surface-btn-border)",
        boxShadow:           "0 24px 64px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--surface-divider)" }}
      >
        <div className="flex items-center gap-2">
          <img src={icoBellUrl} alt="" draggable={false} style={{ width: 16, height: 16, display: "block", filter: "brightness(0) invert(1)", userSelect: "none", pointerEvents: "none" }} />
          <span className="text-[13px] font-semibold text-white">Notifications</span>
          {unreadCount > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white leading-none"
              style={{ background: "hsl(0,68%,58%)" }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-muted-foreground hover:text-white transition-colors"
              style={{ background: "var(--surface-btn-hover)" }}
            >
              <CheckCheck className="w-3 h-3" />
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-muted-foreground hover:text-red-400 transition-colors"
              style={{ background: "var(--surface-btn-hover)" }}
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white transition-colors"
            style={{ background: "var(--surface-btn-hover)" }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1 scroll-container">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--surface-btn-hover)", border: "1px solid rgba(57,91,67,0.28)" }}
            >
              <img src={icoBellUrl} alt="" draggable={false} style={{ width: 20, height: 20, display: "block", filter: "brightness(0) invert(1)", opacity: 0.35, userSelect: "none", pointerEvents: "none" }} />
            </div>
            <div className="text-center">
              <p className="text-[12px] font-medium text-white/50">No notifications yet</p>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5">Alert triggers and feed events appear here</p>
            </div>
          </div>
        ) : (
          notifications.map(n => <NotifItem key={n.id} n={n} onRead={markRead} />)
        )}
      </div>

      {notifications.length > 0 && (
        <div
          className="px-4 py-2.5 shrink-0"
          style={{ borderTop: "1px solid var(--surface-divider)" }}
        >
          <p className="text-[10px] text-center" style={{ color: "rgba(148,163,184,0.4)" }}>
            {notifications.length} notification{notifications.length !== 1 ? "s" : ""} · real-time via WebSocket
          </p>
        </div>
      )}
    </div>
  );
}
