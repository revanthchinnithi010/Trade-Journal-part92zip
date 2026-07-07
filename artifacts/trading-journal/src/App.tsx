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

// ── Keep-alive charts node ────────────────────────────────────────────────────
// Charts is rendered OUTSIDE the route Switch so wouter never unmounts it.
// The Layout component hides it with display:none when the user is on another
// page, so the LWC chart instance, canvas, and loaded candles all survive tab
// switches. Suspense fallback=null keeps the charts container empty-but-dark
// while the lazy JS bundle is still loading (invisible to the user since the
// container is hidden until they navigate to /charts).
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
    // chartsNode is always rendered (inside Layout) but hidden off-route.
    // All other pages are rendered below using per-route conditionals.
    <Layout chartsNode={CHARTS_NODE}>
      {/*
        AnimatePresence handles page exit before the next page enters.
        Each route is a SEPARATE conditional — NOT wrapped in a shared Switch.

        Why no Switch here:
        Switch re-evaluates routes against the current location on every render.
        When AnimatePresence keeps the OLD PageTransition alive for its exit
        animation, that PageTransition's Switch would re-match the NEW location
        and render the new page's content inside the exiting wrapper — causing
        the new page to appear twice simultaneously (once exiting, once entering).

        Individual conditionals fix this: each PageTransition renders one
        hardcoded component, so the exiting wrapper always shows the old page
        content regardless of what the current location becomes.

        `initial={false}` skips the animation on the very first render.
        Charts is excluded — it is a keep-alive node that never unmounts.
      */}
      <Suspense fallback={<PageLoader />}>
        <AnimatePresence mode="popLayout" initial={false}>
          {/*
            Standard pages use <StandardPageWrapper> which provides the
            overflow-auto scroll container + padding that previously lived
            on the Layout's location-based content wrapper. Portfolio and
            Markets manage their own layout internally and do NOT get the
            wrapper.  Charts is a keep-alive node outside AnimatePresence.
          */}
          {pathname === "/"             && <PageTransition key="/"             style={{ height: "100%" }}><StandardPageWrapper><Dashboard   /></StandardPageWrapper></PageTransition>}
          {pathname === "/markets"      && <PageTransition key="/markets"      style={{ height: "100%" }}><Markets     /></PageTransition>}
          {pathname === "/trades"       && <PageTransition key="/trades"       style={{ height: "100%" }}><StandardPageWrapper><Trades      /></StandardPageWrapper></PageTransition>}
          {pathname === "/brokers"      && <PageTransition key="/brokers"      style={{ height: "100%" }}><StandardPageWrapper><Brokers     /></StandardPageWrapper></PageTransition>}
          {pathname === "/alerts"       && <PageTransition key="/alerts"       style={{ height: "100%" }}><StandardPageWrapper><Alerts      /></StandardPageWrapper></PageTransition>}
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
