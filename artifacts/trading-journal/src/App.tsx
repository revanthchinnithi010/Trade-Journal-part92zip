import { lazy, Suspense, useEffect } from "react";
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
function StandardPageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", overflowY: "auto" }} className="scroll-container">
      <div className="p-5 md:p-6 pb-10 mx-auto max-w-[1400px] min-h-full">
        {children}
      </div>
    </div>
  );
}

// ── Keep-alive bottom-tab nodes ───────────────────────────────────────────────
// All five bottom-tab pages are rendered OUTSIDE AnimatePresence so wouter
// never unmounts them on a tab switch. Layout shows the active one with
// display:flex and hides others with display:none, preserving scroll position,
// component state, and — critically — preventing staggered card animations
// (cardVariants y:20 + delay:i*0.055) from re-running on every tab visit.
//
// Suspense fallback=null keeps each container empty while the lazy bundle loads
// (invisible to the user since the container is hidden until they navigate).
const DASHBOARD_NODE = (
  <Suspense fallback={null}>
    <StandardPageWrapper><Dashboard /></StandardPageWrapper>
  </Suspense>
);
const MARKETS_NODE = (
  <Suspense fallback={null}>
    <Markets />
  </Suspense>
);
const TRADES_NODE = (
  <Suspense fallback={null}>
    <StandardPageWrapper><Trades /></StandardPageWrapper>
  </Suspense>
);
const ALERTS_NODE = (
  <Suspense fallback={null}>
    <StandardPageWrapper><Alerts /></StandardPageWrapper>
  </Suspense>
);
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

function Router() {
  const [location] = useLocation();

  useEffect(() => {
    // Eagerly trigger the Charts lazy-import after the initial render so the
    // module is in the browser cache before the user taps the Charts tab.
    // This eliminates the dynamic-import round-trip (~50-200ms) on first visit.
    const id = setTimeout(() => { import("@/pages/charts").catch(() => {}); }, 80);
    return () => clearTimeout(id);
  }, []);

  // Strip query-string so "/portfolio?tab=positions" matches "/portfolio".
  const pathname = location.split("?")[0];

  return (
    // Bottom-tab pages (Dashboard, Markets, Trades, Charts, Alerts) are passed
    // as always-mounted keep-alive nodes. Layout toggles them with display:none/flex.
    // Sidebar pages (Brokers, Reports, Settings, etc.) are still rendered through
    // AnimatePresence so they get a clean fade transition and are unmounted when left.
    <Layout
      chartsNode={CHARTS_NODE}
      dashboardNode={DASHBOARD_NODE}
      marketsNode={MARKETS_NODE}
      tradesNode={TRADES_NODE}
      alertsNode={ALERTS_NODE}
    >
      {/*
        AnimatePresence handles enter/exit only for SIDEBAR pages — pages reachable
        via the hamburger sidebar, not the bottom tab bar. Tab pages are excluded
        because they must never unmount; their staggered card animations would
        re-run on every tab visit if they were inside AnimatePresence.

        Each route is a SEPARATE conditional (not Switch) so AnimatePresence
        can keep the exiting element alive without re-matching the new location.

        `initial={false}` skips the animation on the very first render.
      */}
      <Suspense fallback={<PageLoader />}>
        <AnimatePresence mode="popLayout" initial={false}>
          {pathname === "/brokers"      && <PageTransition key="/brokers"      style={{ height: "100%" }}><StandardPageWrapper><Brokers     /></StandardPageWrapper></PageTransition>}
          {pathname === "/reports"      && <PageTransition key="/reports"      style={{ height: "100%" }}><StandardPageWrapper><Reports     /></StandardPageWrapper></PageTransition>}
          {pathname === "/calendar"     && <PageTransition key="/calendar"     style={{ height: "100%" }}><StandardPageWrapper><Calendar    /></StandardPageWrapper></PageTransition>}
          {pathname === "/notebook"     && <PageTransition key="/notebook"     style={{ height: "100%" }}><StandardPageWrapper><Notebook    /></StandardPageWrapper></PageTransition>}
          {pathname === "/settings"     && <PageTransition key="/settings"     style={{ height: "100%" }}><StandardPageWrapper><Settings    /></StandardPageWrapper></PageTransition>}
          {pathname === "/calc/crypto"  && <PageTransition key="/calc/crypto"  style={{ height: "100%" }}><StandardPageWrapper><CalcCrypto  /></StandardPageWrapper></PageTransition>}
          {pathname === "/calc/forex"   && <PageTransition key="/calc/forex"   style={{ height: "100%" }}><StandardPageWrapper><CalcForex   /></StandardPageWrapper></PageTransition>}
          {pathname === "/calc/position"&& <PageTransition key="/calc/position"style={{ height: "100%" }}><StandardPageWrapper><CalcPosition/></StandardPageWrapper></PageTransition>}
          {pathname === "/calc/margin"  && <PageTransition key="/calc/margin"  style={{ height: "100%" }}><StandardPageWrapper><CalcMargin  /></StandardPageWrapper></PageTransition>}
          {pathname === "/calc/risk"    && <PageTransition key="/calc/risk"    style={{ height: "100%" }}><StandardPageWrapper><CalcRisk    /></StandardPageWrapper></PageTransition>}
          {pathname === "/portfolio"    && <PageTransition key="/portfolio"    style={{ height: "100%" }} variant="detail"><Portfolio   /></PageTransition>}
          {pathname === "/trade"        && <PageTransition key="/trade"        style={{ height: "100%" }}><StandardPageWrapper><Trade       /></StandardPageWrapper></PageTransition>}
          {pathname === "/ctrader-test" && <PageTransition key="/ctrader-test" style={{ height: "100%" }}><StandardPageWrapper><CtraderTest /></StandardPageWrapper></PageTransition>}
          {!KNOWN_PATHS.has(pathname)   && <PageTransition key="not-found"    style={{ height: "100%" }}><StandardPageWrapper><NotFound    /></StandardPageWrapper></PageTransition>}
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
