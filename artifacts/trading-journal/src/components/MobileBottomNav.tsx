import { useRef, useState, useEffect, useCallback } from "react";
import { motion, useAnimation } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Globe,
  ArrowLeftRight,
  BarChart2,
  Bell,
} from "lucide-react";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useChartStore } from "@/store/chartStore";
import { useTheme } from "@/contexts/ThemeContext";

type NavTab =
  | { kind: "link"; href: string; label: string; Icon: React.ElementType }
  | { kind: "action"; label: string; Icon: React.ElementType; onTap: () => void };

const TABS: NavTab[] = [
  { kind: "link", href: "/",        label: "Home",    Icon: LayoutDashboard },
  { kind: "link", href: "/markets", label: "Markets", Icon: Globe           },
  { kind: "link", href: "/trades",  label: "Trade",   Icon: ArrowLeftRight  },
  { kind: "link", href: "/charts",  label: "Charts",  Icon: BarChart2       },
  { kind: "link", href: "/alerts",  label: "Alerts",  Icon: Bell            },
];

const N          = TABS.length;
const BAR_H      = 62;
const BUBBLE_W   = 64;
const BUBBLE_H   = 52;
const BUBBLE_R   = 16;
const PROTRUDE   = (BUBBLE_H - BAR_H) / 2;
const CIRCLE_D   = BUBBLE_W;
const TRAVEL_SCALE = 1.03;

const CSS_ID = "tj-circle-nav-v2";
function ensureCSS() {
  if (typeof document === "undefined" || document.getElementById(CSS_ID)) return;
  const s = document.createElement("style");
  s.id = CSS_ID;
  s.textContent = `
    .tj-cnav-entrance {
      animation: tj-cnav-in 0.50s cubic-bezier(0.34,1.52,0.64,1) both;
    }
    @keyframes tj-cnav-in {
      from { transform: translateY(110%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    @keyframes tj-cnav-bub-a {
      0%   { transform: scale(0.2) translateY(0);       opacity: 0.88; }
      45%  { transform: scale(1.0) translateY(-22px);   opacity: 0.65; }
      100% { transform: scale(0.1) translateY(-52px);   opacity: 0;    }
    }
    @keyframes tj-cnav-bub-b {
      0%   { transform: scale(0.15) translateY(0) translateX(0);    opacity: 0.78; }
      42%  { transform: scale(0.85) translateY(-16px) translateX(5px); opacity: 0.55; }
      100% { transform: scale(0.08) translateY(-44px) translateX(-4px); opacity: 0;  }
    }
    @keyframes tj-cnav-bub-c {
      0%   { transform: scale(0.12) translateY(0) translateX(0);    opacity: 0.70; }
      50%  { transform: scale(0.70) translateY(-11px) translateX(-6px); opacity: 0.42; }
      100% { transform: scale(0.06) translateY(-38px) translateX(3px); opacity: 0;  }
    }
    .tj-cnav-bubble {
      position: absolute;
      border-radius: 50%;
      pointer-events: none;
      z-index: 20;
    }
    .tj-cnav-bubble-dark {
      background: radial-gradient(
        circle at 32% 28%,
        rgba(255,255,255,0.72) 0%,
        rgba(165,180,252,0.46) 28%,
        rgba(99,102,241,0.22) 62%,
        rgba(6,182,212,0.10) 100%
      );
      border: 1px solid rgba(165,180,252,0.48);
      box-shadow:
        inset 0 1px 3px rgba(255,255,255,0.35),
        0 2px 8px rgba(99,102,241,0.26);
    }
    .tj-cnav-bubble-light {
      background: radial-gradient(
        circle at 32% 28%,
        rgba(124,58,237,0.55) 0%,
        rgba(124,58,237,0.28) 35%,
        rgba(124,58,237,0.10) 70%,
        transparent 100%
      );
      border: 1px solid rgba(124,58,237,0.35);
      box-shadow:
        inset 0 1px 3px rgba(255,255,255,0.55),
        0 2px 8px rgba(124,58,237,0.22);
    }
    .tj-cnav-tab:active { transform: scale(0.88) !important; }
  `;
  document.head.appendChild(s);
}

function spawnBubbles(container: HTMLElement, cx: number, cy: number, isLight: boolean) {
  const cfgs = [
    { size: 13, delay: 0,  anim: "tj-cnav-bub-a", dur: 340 },
    { size:  9, delay: 30, anim: "tj-cnav-bub-b", dur: 300 },
    { size:  6, delay: 60, anim: "tj-cnav-bub-c", dur: 260 },
  ];
  cfgs.forEach(({ size, delay, anim, dur }) => {
    const b = document.createElement("div");
    b.className = `tj-cnav-bubble ${isLight ? "tj-cnav-bubble-light" : "tj-cnav-bubble-dark"}`;
    const jx = (Math.random() - 0.5) * 10;
    b.style.cssText = `
      width:${size}px; height:${size}px;
      left:${cx - size / 2 + jx}px;
      top:${cy - size / 2}px;
      animation:${anim} ${dur}ms ${delay}ms ease-out forwards;
    `;
    container.appendChild(b);
    setTimeout(() => b.remove(), dur + delay + 40);
  });
}

export function MobileBottomNav() {
  const [location] = useLocation();
  const { unreadCount } = useNotifications();
  const mobileChartFullscreen = useChartStore(s => s.mobileChartFullscreen);
  const { theme } = useTheme();
  const isLight = theme === "light";

  const pillRef    = useRef<HTMLDivElement>(null);
  const outerRef   = useRef<HTMLDivElement>(null);
  const [tabW, setTabW] = useState(0);
  const controls    = useAnimation();
  const initialized = useRef(false);
  const prevCircleX = useRef<number | null>(null);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeIdx = TABS.findIndex(t => t.kind === "link" && t.href === location);
  const [visualIdx, setVisualIdx] = useState(activeIdx >= 0 ? activeIdx : 0);

  useEffect(() => {
    ensureCSS();
    const update = () => {
      if (pillRef.current) setTabW(pillRef.current.clientWidth / N);
    };
    update();
    const ro = new ResizeObserver(update);
    if (pillRef.current) ro.observe(pillRef.current);
    return () => {
      ro.disconnect();
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, []);

  useEffect(() => {
    if (activeIdx >= 0 && !mobileChartFullscreen) {
      if (revertTimer.current) {
        clearTimeout(revertTimer.current);
        revertTimer.current = null;
      }
      setVisualIdx(activeIdx);
    }
  }, [activeIdx, mobileChartFullscreen]);

  const circleX = tabW > 0 && visualIdx >= 0
    ? visualIdx * tabW + (tabW - CIRCLE_D) / 2
    : 0;

  useEffect(() => {
    if (tabW === 0) return;
    if (!initialized.current) {
      controls.set({ x: circleX, scale: 1, opacity: 1 });
      initialized.current = true;
      prevCircleX.current = circleX;
      return;
    }
    if (prevCircleX.current === circleX) return;
    prevCircleX.current = circleX;
    controls.start({
      x:     circleX,
      scale: [1, TRAVEL_SCALE, 1],
      transition: {
        x:     { type: "tween", duration: 0.22, ease: [0.25, 1, 0.35, 1] },
        scale: { type: "spring", stiffness: 900, damping: 85, mass: 0.8 },
      },
    });
  }, [circleX, tabW, controls]);

  const handleTap = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const outer = outerRef.current;
    if (!outer) return;
    const rect = outer.getBoundingClientRect();
    spawnBubbles(outer, e.clientX - rect.left, e.clientY - rect.top, isLight);
  }, [isLight]);

  /* ── Light-theme palette ── */
  const pillBg         = isLight ? "rgba(255,255,255,0.99)"      : "rgba(12,14,19,0.97)";
  const pillInsetShadow = isLight
    ? "inset 0 1px 0 rgba(0,0,0,0.04), inset 0 -1px 0 rgba(0,0,0,0.03)"
    : "inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.3)";
  const wrapperGradient = isLight
    ? "linear-gradient(135deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.04) 30%, rgba(0,0,0,0.02) 58%, rgba(0,0,0,0.09) 100%)"
    : "linear-gradient(135deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.14) 30%, rgba(255,255,255,0.06) 58%, rgba(255,255,255,0.28) 100%)";
  const wrapperShadow = isLight
    ? [
        "0 0 0 1px rgba(0,0,0,0.06)",
        "0 -1px 0 #E5E7EB",
        "0 8px 32px rgba(0,0,0,0.10)",
        "0 2px 10px rgba(0,0,0,0.06)",
      ].join(",")
    : [
        "0 0 0 1px rgba(255,255,255,0.06)",
        "0 12px 40px rgba(0,0,0,0.65)",
        "0 0 20px rgba(0,0,0,0.30)",
        "0 2px 10px rgba(0,0,0,0.40)",
      ].join(",");

  const bubbleBg     = isLight ? "rgba(124,58,237,0.07)"      : "rgba(200,210,255,0.06)";
  const bubbleGlow = isLight
    ? [
        "0 0 0 0.5px rgba(124,58,237,0.18)",
        "0 0 12px rgba(124,58,237,0.18)",
        "inset 0 0 0 1px rgba(255,255,255,0.15)",
        "0 4px 16px rgba(0,0,0,0.08)",
      ].join(",")
    : [
        "0 0 0 0.5px rgba(99,102,241,0.28)",
        "0 0 12px rgba(165,180,252,0.24)",
        "inset 0 0 0 1px rgba(255,255,255,0.08)",
        "0 4px 16px rgba(0,0,0,0.28)",
      ].join(",");

  const activeIconColor   = isLight ? "#7C3AED"                  : "#ffffff";
  const inactiveIconColor = isLight ? "#9CA3AF"                  : "rgba(148,163,184,0.44)";
  const activeIconFilter  = isLight
    ? "drop-shadow(0 0 5px rgba(124,58,237,0.70)) drop-shadow(0 0 11px rgba(124,58,237,0.40))"
    : "drop-shadow(0 0 5px rgba(200,215,255,0.90)) drop-shadow(0 0 11px rgba(165,180,252,0.55)) drop-shadow(0 0 20px rgba(99,102,241,0.32))";
  const activeLabelColor   = isLight ? "#7C3AED"                  : "rgba(255,255,255,0.92)";
  const inactiveLabelColor = isLight ? "#9CA3AF"                  : "rgba(148,163,184,0.40)";
  const badgeBorder        = isLight ? "rgba(255,255,255,0.95)"   : "rgba(12,14,19,0.9)";

  return (
    <div
      className="tj-cnav-entrance"
      style={{
        flexShrink:    0,
        padding:       `${PROTRUDE + 2}px 14px`,
        paddingBottom: `calc(10px + env(safe-area-inset-bottom, 0px))`,
        background:    "transparent",
        position:      "relative",
      }}
    >
      <div
        ref={outerRef}
        style={{
          borderRadius: 9999,
          padding:      "1px",
          background:   wrapperGradient,
          boxShadow:    wrapperShadow,
          position:     "relative",
        }}
      >
        {tabW > 0 && (
          <motion.div
            animate={controls}
            style={{
              position:      "absolute",
              top:           1 + (BAR_H - BUBBLE_H) / 2,
              left:          1,
              width:         BUBBLE_W,
              height:        BUBBLE_H,
              borderRadius:  BUBBLE_R,
              zIndex:        5,
              pointerEvents: "none",
              background:    bubbleBg,
              willChange:    "transform",
              boxShadow:     bubbleGlow,
            }}
          >
            <div style={{
              position:     "absolute",
              top:          "10%",
              left:         "14%",
              width:        "44%",
              height:       "24%",
              borderRadius: "50%",
              background:   isLight
                ? "radial-gradient(ellipse at 38% 38%, rgba(255,255,255,0.80) 0%, rgba(255,255,255,0.30) 55%, transparent 100%)"
                : "radial-gradient(ellipse at 38% 38%, rgba(255,255,255,0.60) 0%, rgba(255,255,255,0.16) 55%, transparent 100%)",
              transform:    "rotate(-24deg)",
            }} />
            <div style={{
              position:     "absolute",
              bottom:       "12%",
              right:        "12%",
              width:        "26%",
              height:       "14%",
              borderRadius: "50%",
              background:   isLight
                ? "radial-gradient(ellipse, rgba(124,58,237,0.22) 0%, transparent 100%)"
                : "radial-gradient(ellipse, rgba(165,180,252,0.35) 0%, transparent 100%)",
            }} />
            <div style={{
              position:     "absolute",
              top:          4,
              left:         "25%",
              right:        "25%",
              height:       1.5,
              borderRadius: 1,
              background:   "linear-gradient(90deg, transparent, rgba(255,255,255,0.60), transparent)",
            }} />
            <div style={{
              position:     "absolute",
              bottom:       0,
              left:         0,
              right:        0,
              height:       "30%",
              borderRadius: `0 0 ${BUBBLE_R}px ${BUBBLE_R}px`,
              background:   isLight
                ? "linear-gradient(0deg, rgba(124,58,237,0.08) 0%, transparent 100%)"
                : "linear-gradient(0deg, rgba(99,102,241,0.10) 0%, transparent 100%)",
            }} />
          </motion.div>
        )}

        <div
          ref={pillRef}
          style={{
            height:               BAR_H,
            borderRadius:         9999,
            background:           pillBg,
            backdropFilter:       isLight ? "none" : "blur(28px) saturate(190%)",
            WebkitBackdropFilter: isLight ? "none" : "blur(28px) saturate(190%)",
            boxShadow:            pillInsetShadow,
            position:             "relative",
            overflow:             "hidden",
            display:              "flex",
          }}
        >
          {TABS.map((tab, idx) => {
            const active   = idx === visualIdx;
            const isAlerts = tab.kind === "link" && tab.href === "/alerts";
            const badge    = isAlerts && unreadCount > 0 ? unreadCount : 0;

            return (
              <Link
                key={tab.kind === "link" ? tab.href : `action-${idx}`}
                href={tab.kind === "link" ? tab.href : "/"}
                style={{
                  flex:                    1,
                  display:                 "flex",
                  textDecoration:          "none",
                  WebkitTapHighlightColor: "transparent",
                  outline:                 "none",
                  position:                "relative",
                  zIndex:                  10,
                } as React.CSSProperties}
              >
                <motion.div
                  className="tj-cnav-tab"
                  onPointerDown={handleTap}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "tween", duration: 0.09, ease: "easeOut" }}
                  style={{
                    width:          "100%",
                    height:         "100%",
                    display:        "flex",
                    flexDirection:  "column",
                    alignItems:     "center",
                    justifyContent: "center",
                    gap:            4,
                    cursor:         "pointer",
                    userSelect:     "none",
                  }}
                >
                  <motion.div
                    animate={{ scale: active ? 1.16 : 1 }}
                    transition={{ type: "spring", stiffness: 550, damping: 28 }}
                    style={{ position: "relative" }}
                  >
                    <tab.Icon
                      style={{
                        width:      22,
                        height:     22,
                        flexShrink: 0,
                        color:      active ? activeIconColor : inactiveIconColor,
                        filter:     active ? activeIconFilter : "none",
                        transition: "color 0.22s ease, filter 0.22s ease",
                        display:    "block",
                      }}
                    />
                    {badge > 0 && (
                      <span style={{
                        position:        "absolute",
                        top:             -5,
                        right:           -6,
                        minWidth:        14,
                        height:          14,
                        borderRadius:    9999,
                        background:      "#ef4444",
                        boxShadow:       "0 0 6px rgba(239,68,68,0.55)",
                        display:         "flex",
                        alignItems:      "center",
                        justifyContent:  "center",
                        fontSize:        8,
                        fontWeight:      700,
                        color:           "#fff",
                        lineHeight:      1,
                        padding:         "0 3px",
                        border:          `1.5px solid ${badgeBorder}`,
                        pointerEvents:   "none",
                      }}>
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </motion.div>
                  <span
                    style={{
                      fontSize:      10,
                      lineHeight:    1,
                      fontWeight:    active ? 600 : 400,
                      color:         active ? activeLabelColor : inactiveLabelColor,
                      letterSpacing: active ? "0.04em" : "0.01em",
                      transition:    "color 0.22s ease",
                      whiteSpace:    "nowrap",
                    }}
                  >
                    {tab.label}
                  </span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
