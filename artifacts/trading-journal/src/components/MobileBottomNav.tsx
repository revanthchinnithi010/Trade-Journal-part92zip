/**
 * MobileBottomNav — Protruding Circle Bubble 2026
 *
 * Reference image spec:
 *   - Dark pill nav bar (no visible outer border)
 *   - Active indicator = large CIRCLE (not pill) that rises above the bar
 *   - Circle protrudes ~8px above bar top edge
 *   - Circle has a glowing rim border (indigo/cyan)
 *   - Active icon is bright white inside the dark circle
 *   - Spring-slides horizontally between tabs
 *   - Water bubbles rise on tap
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  LineChart,
  CandlestickChart,
  BellRing,
  Settings,
} from "lucide-react";

const TABS = [
  { href: "/",         label: "Home",     Icon: LayoutDashboard  },
  { href: "/trades",   label: "Trades",   Icon: LineChart         },
  { href: "/charts",   label: "Charts",   Icon: CandlestickChart  },
  { href: "/alerts",   label: "Alerts",   Icon: BellRing          },
  { href: "/settings", label: "Settings", Icon: Settings          },
] as const;

const N          = TABS.length;
const BAR_H      = 62;           // pill bar height
const BUBBLE_W   = 64;           // rounded-rect width
const BUBBLE_H   = 52;           // rounded-rect height
const BUBBLE_R   = 16;           // corner radius — slightly curved
const PROTRUDE   = (BUBBLE_H - BAR_H) / 2;   // protrudes equally top & bottom
const CIRCLE_TOP = -PROTRUDE;
// alias kept for circleX calc
const CIRCLE_D   = BUBBLE_W;

const CSS_ID = "tj-circle-nav-v1";
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

    /* Rotating gradient border on the circle indicator */
    @keyframes tj-cnav-spin {
      from { transform: translate(-50%,-50%) rotate(0deg); }
      to   { transform: translate(-50%,-50%) rotate(360deg); }
    }

    /* Water bubble rise */
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
    .tj-cnav-tab:active { transform: scale(0.88) !important; }
  `;
  document.head.appendChild(s);
}

function spawnBubbles(container: HTMLElement, cx: number, cy: number) {
  const cfgs = [
    { size: 13, delay: 0,  anim: "tj-cnav-bub-a", dur: 340 },
    { size:  9, delay: 30, anim: "tj-cnav-bub-b", dur: 300 },
    { size:  6, delay: 60, anim: "tj-cnav-bub-c", dur: 260 },
  ];
  cfgs.forEach(({ size, delay, anim, dur }) => {
    const b = document.createElement("div");
    b.className = "tj-cnav-bubble";
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
  const pillRef    = useRef<HTMLDivElement>(null);
  const outerRef   = useRef<HTMLDivElement>(null);
  const [tabW, setTabW] = useState(0);

  const activeIdx = TABS.findIndex(t => t.href === location);

  useEffect(() => {
    ensureCSS();
    const update = () => {
      if (pillRef.current) setTabW(pillRef.current.clientWidth / N);
    };
    update();
    const ro = new ResizeObserver(update);
    if (pillRef.current) ro.observe(pillRef.current);
    return () => ro.disconnect();
  }, []);

  // circle left edge: center it inside the tab slot
  const circleX = tabW > 0 && activeIdx >= 0
    ? activeIdx * tabW + (tabW - CIRCLE_D) / 2
    : 0;

  const handleTap = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const outer = outerRef.current;
    if (!outer) return;
    const rect = outer.getBoundingClientRect();
    spawnBubbles(outer, e.clientX - rect.left, e.clientY - rect.top);
  }, []);

  return (
    /* Outer spacer — transparent padding for safe area + circle protrusion room */
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
      {/* ── Floating pill — white glass gradient border wrapper ── */}
      <div
        style={{
          borderRadius: 9999,
          padding:      "1.5px",
          background:   "linear-gradient(135deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.04) 58%, rgba(255,255,255,0.22) 100%)",
          boxShadow: [
            "0 10px 40px rgba(0,0,0,0.62)",
            "0 2px 10px rgba(0,0,0,0.40)",
          ].join(","),
        }}
      >
      <div
        ref={pillRef}
        style={{
          height:               BAR_H,
          borderRadius:         9999,
          background:           "rgba(10,10,15,0.96)",
          backdropFilter:       "blur(28px) saturate(190%)",
          WebkitBackdropFilter: "blur(28px) saturate(190%)",
          boxShadow:            "inset 0 0.5px 0 rgba(255,255,255,0.07)",
          position:             "relative",
          overflow:             "hidden",
          display:              "flex",
        }}
      >
        {/* ── LAYER 1 (z-index 1): Transparent water bubble ──── */}
        {tabW > 0 && (
          <motion.div
            key={activeIdx}
            initial={{ x: circleX, scale: 0.65, opacity: 0.5 }}
            animate={{ x: circleX, scale: 1,    opacity: 1   }}
            transition={{ type: "spring", stiffness: 480, damping: 22, mass: 0.45 }}
            style={{
              position:        "absolute",
              top:             (BAR_H - BUBBLE_H) / 2,   // centred vertically
              left:            0,
              width:           BUBBLE_W,
              height:          BUBBLE_H,
              borderRadius:    BUBBLE_R,
              zIndex:          1,          // BELOW icons
              pointerEvents:   "none",
              /* Fully transparent water-bubble interior */
              background:      "rgba(200,210,255,0.04)",
              backdropFilter:  "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
              willChange:      "transform",
              /* Iridescent bubble wall */
              border:      "1.5px solid rgba(180,200,255,0.52)",
              boxShadow: [
                "0 0 0 0.5px rgba(99,102,241,0.28)",
                "0 0 12px rgba(165,180,252,0.24)",
                "inset 0 0 0 1px rgba(255,255,255,0.08)",
                "0 4px 16px rgba(0,0,0,0.28)",
              ].join(","),
            }}
          >
            {/* Top-left bright crescent — primary water-bubble specular */}
            <div style={{
              position:     "absolute",
              top:          "10%",
              left:         "14%",
              width:        "44%",
              height:       "24%",
              borderRadius: "50%",
              background:   "radial-gradient(ellipse at 38% 38%, rgba(255,255,255,0.60) 0%, rgba(255,255,255,0.16) 55%, transparent 100%)",
              transform:    "rotate(-24deg)",
            }} />
            {/* Bottom-right secondary shimmer */}
            <div style={{
              position:     "absolute",
              bottom:       "12%",
              right:        "12%",
              width:        "26%",
              height:       "14%",
              borderRadius: "50%",
              background:   "radial-gradient(ellipse, rgba(165,180,252,0.35) 0%, transparent 100%)",
            }} />
            {/* Top-centre thin rim highlight */}
            <div style={{
              position:     "absolute",
              top:          4,
              left:         "25%",
              right:        "25%",
              height:       1.5,
              borderRadius: 1,
              background:   "linear-gradient(90deg, transparent, rgba(255,255,255,0.50), transparent)",
            }} />
            {/* Bottom indigo tint */}
            <div style={{
              position:     "absolute",
              bottom:       0,
              left:         0,
              right:        0,
              height:       "30%",
              borderRadius: `0 0 ${BUBBLE_R}px ${BUBBLE_R}px`,
              background:   "linear-gradient(0deg, rgba(99,102,241,0.10) 0%, transparent 100%)",
            }} />
          </motion.div>
        )}

        {/* ── LAYER 2 (z-index 10): Icons + labels ────────────── */}
        {TABS.map(({ href, label, Icon }) => {
          const active = location === href;
          return (
            <Link
              key={href}
              href={href}
              style={{
                flex:                    1,
                display:                 "flex",
                textDecoration:          "none",
                WebkitTapHighlightColor: "transparent",
                outline:                 "none",
                position:                "relative",
                zIndex:                  10,    // always above the bubble
              } as React.CSSProperties}
            >
              <motion.div
                className="tj-cnav-tab"
                onPointerDown={handleTap}
                whileTap={{ scale: 0.88 }}
                transition={{ type: "spring", stiffness: 600, damping: 25 }}
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
                >
                  <Icon
                    style={{
                      width:      22,
                      height:     22,
                      flexShrink: 0,
                      color:      active ? "#ffffff" : "rgba(148,163,184,0.48)",
                      filter:     active
                        ? "drop-shadow(0 0 6px rgba(165,180,252,0.75)) drop-shadow(0 0 12px rgba(99,102,241,0.50))"
                        : "none",
                      transition: "color 0.22s ease, filter 0.22s ease",
                      display:    "block",
                    }}
                  />
                </motion.div>
                <span
                  style={{
                    fontSize:      10,
                    lineHeight:    1,
                    fontWeight:    active ? 600 : 400,
                    color:         active ? "rgba(255,255,255,0.92)" : "rgba(148,163,184,0.40)",
                    letterSpacing: active ? "0.04em" : "0.01em",
                    transition:    "color 0.22s ease",
                    whiteSpace:    "nowrap",
                  }}
                >
                  {label}
                </span>
              </motion.div>
            </Link>
          );
        })}
      </div>
      </div>{/* /gradient border wrapper */}
    </div>
  );
}
