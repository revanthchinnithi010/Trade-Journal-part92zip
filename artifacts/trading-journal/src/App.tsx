import { lazy, Suspense, useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { popupManager } from "@/lib/popupManager";
import { Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { LiveMarketProvider } from "@/contexts/LiveMarketContext";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { AnimatePresence } from "motion/react";
import { PageTransition } from "@/components/animations/PageTransition";
import { SplashScreen } from "@/components/animations/SplashScreen";

const Dashboard   = lazy(() => import("@/pages/dashboard"));
const Markets     = lazy(() => import("@/pages/markets"));
const Trades      = lazy(() => import("@/pages/trades"));
const Reports     = lazy(() => import("@/pages/reports"));
const Calendar    = lazy(() => import("@/pages/calendar"));
const Notebook    = lazy(() => import("@/pages/notebook"));
const Settings    = lazy(() => import("@/pages/settings"));
const Brokers     = lazy(() => import("@/pages/brokers"));
const Alerts      = lazy(() => import("@/pages/alerts"));
const CalcCrypto  = lazy(() => import("@/pages/calc-crypto"));
const CalcForex   = lazy(() => import("@/pages/calc-forex"));
const CalcPosition= lazy(() => import("@/pages/calc-position"));
const CalcMargin  = lazy(() => import("@/pages/calc-margin"));
const CalcRisk    = lazy(() => import("@/pages/calc-risk"));
// Charts is kept alive permanently — never unmounts on tab switch.
// Using lazy() still splits the bundle (fast initial load), but the module
// is preloaded eagerly in the background so the first tap to /charts is instant.
const Charts      = lazy(() => import("@/pages/charts"));
const Portfolio   = lazy(() => import("@/pages/portfolio"));
const Trade       = lazy(() => import("@/pages/trade"));
const NotFound      = lazy(() => import("@/pages/not-found"));
const CtraderTest   = lazy(() => import("@/pages/ctrader-test"));

const FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      retryDelay: 500,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      networkMode: "always",
    },
  },
});

(queryClient as unknown as { fetchWithTimeout: typeof fetchWithTimeout }).fetchWithTimeout = fetchWithTimeout;

function PageLoader() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-28 rounded-2xl bg-white/[0.03]" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-white/[0.03]" />)}
      </div>
    </div>
  );
}

/**
 * StandardPageWrapper — scroll container + padding for regular (non-full-height) pages.
 *
 * Previously these styles lived on the Layout's location-based content wrapper.
 * Moving them here means the Layout always renders a single stable wrapper div
 * regardless of the current route, preventing the mid-transition container
 * switch that caused the Dashboard zoom/resize bug when opening Portfolio.
 *
 * Portfolio and Markets do NOT use this wrapper — they manage their own
 * height-filling flex layout internally.
 */
/**
 * StandardPageWrapper — scroll container for regular (non-full-height) pages.
 *
 * `bottomPad` overrides the default 40px bottom spacing. Pass 80 on mobile so
 * the last content item scrolls above the fixed bottom nav bar.
 */
function StandardPageWrapper({ children, bottomPad = 40 }: { children: React.ReactNode; bottomPad?: number }) {
  return (
    <div style={{ height: "100%", overflowY: "auto" }} className="scroll-container">
      <div
        className="p-5 md:p-6 mx-auto max-w-[1400px] min-h-full"
        style={{ paddingBottom: bottomPad }}
      >
        {children}
      </div>
    </div>
  );
}

// Charts is the only keep-alive page — its LWC instance must never remount.
// All other pages mount/unmount normally via AnimatePresence.
const CHARTS_NODE = (
  <Suspense fallback={null}>
    <Charts />
  </Suspense>
);

// Known pathnames — used to decide whether to render NotFound.
const KNOWN_PATHS = new Set([
  "/", "/markets", "/trades", "/brokers", "/alerts", "/reports",
  "/calendar", "/notebook", "/settings",
  "/calc/crypto", "/calc/forex", "/calc/position", "/calc/margin", "/calc/risk",
  "/portfolio", "/trade", "/ctrader-test", "/charts",
]);

/**
 * Bottom-tab order. The delta between prev and next index determines horizontal
 * slide direction: positive = navigate right (enter from right), negative = navigate left.
 * /charts is intentionally in the list so crossing it counts as a tab transition.
 */
const TAB_ORDER: string[] = ["/", "/markets", "/charts", "/trades", "/alerts"];

function Router() {
  const [location] = useLocation();
  const isMobile   = useIsMobile();

  useEffect(() => {
    // Eagerly trigger the Charts lazy-import after the initial render so the
    // module is in the browser cache before the user taps the Charts tab.
    // This eliminates the dynamic-import round-trip (~50-200ms) on first visit.
    const id = setTimeout(() => { import("@/pages/charts").catch(() => {}); }, 80);
    return () => clearTimeout(id);
  }, []);

  // Strip query-string so "/portfolio?tab=positions" matches "/portfolio".
  const pathname = location.split("?")[0];

  // ── Direction tracking (synchronous, ref-based) ─────────────────────────
  // Computed during render so the correct direction is available on the very
  // first paint with the new pathname — before any useLayoutEffect would run.
  // prevPathRef tracks the pathname from the previous render.
  const prevPathRef = useRef(pathname);
  const dirRef      = useRef(0);

  if (prevPathRef.current !== pathname) {
    const pi = TAB_ORDER.indexOf(prevPathRef.current);
    const ni = TAB_ORDER.indexOf(pathname);
    // Both routes are tab pages → horizontal slide; otherwise → opacity fade.
    dirRef.current      = (pi !== -1 && ni !== -1) ? (ni > pi ? 1 : -1) : 0;
    prevPathRef.current = pathname;
  }
  const dir = dirRef.current;

  // On mobile the fixed bottom nav bar is ~80px tall; pages need that clearance.
  const bp = isMobile ? 80 : 40;

  // Whether the current route is a bottom-tab page.
  const isTabPage = TAB_ORDER.includes(pathname) && pathname !== "/charts";

  return (
    // Charts is the only keep-alive node — its LWC chart instance must survive
    // tab switches. Every other page mounts fresh and unmounts on navigation.
    <Layout chartsNode={CHARTS_NODE}>
      <Suspense fallback={<PageLoader />}>
        {/*
          ── Tab pages: AnimatePresence mode="sync" ──────────────────────────
          Both the exiting and entering pages are in the DOM simultaneously so
          they can slide past each other like a native tab bar. mode="sync" is
          required for this — mode="wait" would serialise them, killing the effect.

          Each PageTransition uses variant="tab" which sets position:absolute;inset:0
          so the two overlapping pages clip inside the overflow:hidden container.

          `custom` (the direction integer) is passed at the AnimatePresence level so
          Motion uses the latest value for the EXITING page's exit animation even
          though that component was last rendered with the previous dir.
          `initial={false}` skips the slide-in on the very first page load.
        */}
        <AnimatePresence mode="sync" custom={dir} initial={false}>
          {pathname === "/"        && <PageTransition key="/"        variant="tab" custom={dir}><StandardPageWrapper bottomPad={bp}><Dashboard /></StandardPageWrapper></PageTransition>}
          {pathname === "/markets" && <PageTransition key="/markets" variant="tab" custom={dir}><Markets /></PageTransition>}
          {pathname === "/trades"  && <PageTransition key="/trades"  variant="tab" custom={dir}><StandardPageWrapper bottomPad={bp}><Trades    /></StandardPageWrapper></PageTransition>}
          {pathname === "/alerts"  && <PageTransition key="/alerts"  variant="tab" custom={dir}><StandardPageWrapper bottomPad={bp}><Alerts    /></StandardPageWrapper></PageTransition>}
        </AnimatePresence>

        {/*
          ── Sidebar / detail pages: AnimatePresence mode="wait" ────────────
          These use the default opacity cross-fade. mode="wait" serialises
          exit → enter so they never overlap (no absolute positioning needed).
          These pages are not part of the tab order so direction is always 0.

          NotFound renders here too — if the path is unknown AND not a tab page
          (tab AP already renders nothing for unknown paths).
        */}
        <AnimatePresence mode="wait" initial={false}>
          {!isTabPage && pathname === "/brokers"       && <PageTransition key="/brokers"       style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Brokers     /></StandardPageWrapper></PageTransition>}
          {!isTabPage && pathname === "/reports"       && <PageTransition key="/reports"       style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Reports     /></StandardPageWrapper></PageTransition>}
          {!isTabPage && pathname === "/calendar"      && <PageTransition key="/calendar"      style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Calendar    /></StandardPageWrapper></PageTransition>}
          {!isTabPage && pathname === "/notebook"      && <PageTransition key="/notebook"      style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Notebook    /></StandardPageWrapper></PageTransition>}
          {!isTabPage && pathname === "/settings"      && <PageTransition key="/settings"      style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Settings    /></StandardPageWrapper></PageTransition>}
          {!isTabPage && pathname === "/calc/crypto"   && <PageTransition key="/calc/crypto"   style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><CalcCrypto  /></StandardPageWrapper></PageTransition>}
          {!isTabPage && pathname === "/calc/forex"    && <PageTransition key="/calc/forex"    style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><CalcForex   /></StandardPageWrapper></PageTransition>}
          {!isTabPage && pathname === "/calc/position" && <PageTransition key="/calc/position" style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><CalcPosition/></StandardPageWrapper></PageTransition>}
          {!isTabPage && pathname === "/calc/margin"   && <PageTransition key="/calc/margin"   style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><CalcMargin  /></StandardPageWrapper></PageTransition>}
          {!isTabPage && pathname === "/calc/risk"     && <PageTransition key="/calc/risk"     style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><CalcRisk    /></StandardPageWrapper></PageTransition>}
          {!isTabPage && pathname === "/portfolio"     && <PageTransition key="/portfolio"     style={{ height: "100%" }} variant="detail"><Portfolio /></PageTransition>}
          {!isTabPage && pathname === "/trade"         && <PageTransition key="/trade"         style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Trade       /></StandardPageWrapper></PageTransition>}
          {!isTabPage && pathname === "/ctrader-test"  && <PageTransition key="/ctrader-test"  style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><CtraderTest /></StandardPageWrapper></PageTransition>}
          {!isTabPage && !KNOWN_PATHS.has(pathname)    && <PageTransition key="not-found"      style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><NotFound    /></StandardPageWrapper></PageTransition>}
        </AnimatePresence>
      </Suspense>
    </Layout>
  );
}

function App() {
  useEffect(() => { popupManager.init(); }, []);
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <LiveMarketProvider>
        <NotificationsProvider>
          <WatchlistProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                {/* Splash screen: shows once per session, dismissed after ~1.6 s */}
                <SplashScreen />
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </WatchlistProvider>
        </NotificationsProvider>
      </LiveMarketProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
