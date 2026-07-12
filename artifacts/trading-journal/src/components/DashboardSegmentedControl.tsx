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
      }}
    >
      {/* Sliding pill indicator — a single persistent layer (never
          conditionally unmounted) that animates its `x` transform between
          the two slots. GPU-only: left/width/top/bottom are fixed at mount,
          only `transform: translateX()` ever changes, so this never
          triggers layout/paint on the surrounding grid — no layout shift,
          no dropped frames. translateX(100%) shifts by exactly the pill's
          own width, which lands it flush in the second slot regardless of
          the container's actual pixel width (the 4px inset cancels out). */}
      <motion.div
        className="absolute top-1 left-1"
        style={{
          width:        "calc(50% - 4px)",
          height:       "calc(100% - 8px)",
          borderRadius: 15,
          background:   "#050505",
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
            className="relative z-10 flex items-center justify-center text-[14px]"
          >
            {/* Label animates color + a tiny scale pop on the switch itself
                (not just a passive CSS color fade), so the tab you land on
                visibly "arrives" in sync with the pill sliding under it.
                fontWeight stays fixed at 600 always — animating it would
                reflow text width every frame and fight the GPU-only pill. */}
            <motion.span
              initial={false}
              animate={{
                color: selected ? "#FFFFFF" : "#B5B5B5",
                scale: selected ? 1 : 0.97,
              }}
              transition={PILL_TRANSITION}
              style={{ fontWeight: 600, display: "inline-block" }}
            >
              {tab.label}
            </motion.span>
          </button>
        );
      })}
    </div>
  );
});

export default DashboardSegmentedControl;
