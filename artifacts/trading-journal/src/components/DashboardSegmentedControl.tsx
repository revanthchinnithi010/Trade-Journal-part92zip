import { memo } from "react";
import { useLocation } from "wouter";

/**
 * Full-width iOS-style segmented control shown above the Account Value card
 * (and mirrored on the Reports page). Selected state is derived from the
 * current route (not local state) so it always reflects reality — navigating
 * back from Reports automatically re-selects Dashboard without any extra
 * bookkeeping.
 *
 * The pill is a plain CSS `transform: translate3d` transition, deliberately
 * NOT driven by Motion.dev/React state interpolation. Reports→Dashboard is
 * the moment the kept-alive Dashboard subtree flips from `display:none` back
 * to visible and resumes its own live-tick/chart RAF work — a big, unavoidable
 * chunk of main-thread work lands on the exact same frame the pill starts
 * moving. A JS-driven animation (even one that *can* offload to the
 * compositor) still depends on the main thread being free to schedule that
 * first tick; a native CSS transition on `transform` is handed to the
 * compositor thread as soon as the style is committed and then runs
 * completely independently of main-thread congestion, so it can't drop
 * frames no matter how busy the rest of the page is at that moment.
 */
const TABS = [
  { key: "dashboard", label: "Dashboard", href: "/" },
  { key: "reports",   label: "Reports",   href: "/reports" },
] as const;

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
        borderRadius: 12,
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
      {/* Sliding pill indicator — a plain div, CSS-only transition, always
          on its own compositor layer (translate3d + backface-visibility
          promote it at mount, not on first animation frame). The only
          property that ever changes is `transform` — never left/width/right
          — so this can never trigger layout or paint on its siblings. */}
      <div
        className="absolute top-1 left-1"
        style={{
          width:               "calc(50% - 4px)",
          height:              "calc(100% - 8px)",
          borderRadius:        9,
          background:          "#050505",
          transform:           `translate3d(${activeKey === "reports" ? "100%" : "0%"}, 0, 0)`,
          transition:          "transform 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          willChange:          "transform",
          backfaceVisibility:  "hidden",
        }}
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
