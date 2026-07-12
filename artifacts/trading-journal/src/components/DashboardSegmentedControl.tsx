import { memo } from "react";
import { useLocation } from "wouter";
import { motion } from "motion/react";
import { EASE_OUT_EXPO } from "@/animations/motion";

/**
 * Full-width iOS-style segmented control shown above the Account Value card.
 * Selected state is derived from the current route (not local state) so it
 * always reflects reality — navigating back from Reports automatically
 * re-selects Dashboard without any extra bookkeeping.
 *
 * The pill indicator is a single absolutely-positioned layer that slides
 * between the two tab slots via `x` transform (GPU-accelerated, no layout
 * properties animate), using Motion.dev's layout-aware `motion.div` so the
 * transform is computed from actual slot geometry rather than hardcoded %.
 */
const TABS = [
  { key: "dashboard", label: "Dashboard", href: "/" },
  { key: "reports",   label: "Reports",   href: "/reports" },
] as const;

const PILL_TRANSITION = { duration: 0.2, ease: EASE_OUT_EXPO };

const DashboardSegmentedControl = memo(function DashboardSegmentedControl() {
  const [location, navigate] = useLocation();
  const pathname = location.split("?")[0];
  const activeKey = pathname === "/reports" ? "reports" : "dashboard";

  return (
    <div
      role="tablist"
      aria-label="Dashboard sections"
      className="relative w-full grid grid-cols-2"
      style={{
        height:       46,
        borderRadius: 16,
        background:   "#2A2A2F",
        padding:       4,
        // Isolate this node's paint/layout from the rest of the (heavy,
        // constantly-ticking) dashboard tree — without this, the browser's
        // paint-invalidation region for our animation can balloon to
        // whatever ancestor established the last containing block, which is
        // what caused the frame drops.
        contain:       "layout paint",
      }}
    >
      {/* Sliding pill indicator — the ONLY animated node here, and the only
          property that ever changes is `transform` (via `x`), which is
          GPU-compositable and never triggers layout or paint on siblings.
          `willChange: transform` promotes it to its own compositor layer
          up front instead of on first animation frame, avoiding a layer-
          promotion stall right as the slide starts. */}
      <motion.div
        className="absolute top-1 left-1"
        style={{
          width:        "calc(50% - 4px)",
          height:       "calc(100% - 8px)",
          borderRadius: 15,
          background:   "#050505",
          willChange:   "transform",
        }}
        initial={false}
        animate={{ x: activeKey === "reports" ? "100%" : "0%" }}
        transition={PILL_TRANSITION}
      />

      {TABS.map((tab) => {
        const selected = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              if (tab.href !== pathname) navigate(tab.href);
            }}
            className="relative z-10 flex items-center justify-center text-[14px] font-semibold transition-colors duration-150 ease-out"
            style={{ color: selected ? "#FFFFFF" : "#B5B5B5" }}
          >
            {/* Plain CSS color transition, not a per-frame JS-driven one —
                `color` isn't GPU-compositable, so animating it through
                Motion.dev meant restyling on every rAF tick, which competed
                with the dashboard's own live-tick/chart RAF loops and was
                the actual source of the dropped frames. A native CSS
                transition is cheap: the browser interpolates it without
                round-tripping through React/JS at all. */}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
});

export default DashboardSegmentedControl;
