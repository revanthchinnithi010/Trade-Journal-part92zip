import { lazy, Suspense, useEffect } from "react";
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

  // On mobile the fixed bottom nav bar is ~80px tall; pages need that clearance.
  const bp = isMobile ? 80 : 40;

  return (
    // Charts is the only keep-alive node — its LWC chart instance must survive
    // tab switches. Every other page mounts fresh and unmounts on navigation.
    <Layout chartsNode={CHARTS_NODE}>
      {/*
        AnimatePresence with mode="wait" — the exiting page fully unmounts before
        the entering page mounts. Every page has a unique key so AnimatePresence
        correctly tracks enter/exit.

        Bottom-tab pages (Dashboard, Markets, Trades, Alerts) are included here
        so they unmount completely when the user navigates away — no hidden DOM,
        no stale renders behind the active page.

        Markets has no StandardPageWrapper and no top header (Layout hides it).
        It fills the full viewport height on its own.

        `initial={false}` skips the animation on the very first render.
      */}
      <Suspense fallback={<PageLoader />}>
        <AnimatePresence mode="wait" initial={false}>
          {/* ── Bottom-tab pages ── */}
          {pathname === "/"         && <PageTransition key="/"         style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Dashboard  /></StandardPageWrapper></PageTransition>}
          {pathname === "/markets"  && <PageTransition key="/markets"  style={{ height: "100%" }}><Markets /></PageTransition>}
          {pathname === "/trades"   && <PageTransition key="/trades"   style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Trades     /></StandardPageWrapper></PageTransition>}
          {pathname === "/alerts"   && <PageTransition key="/alerts"   style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Alerts     /></StandardPageWrapper></PageTransition>}
          {/* ── Sidebar pages ── */}
          {pathname === "/brokers"       && <PageTransition key="/brokers"      style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Brokers     /></StandardPageWrapper></PageTransition>}
          {pathname === "/reports"       && <PageTransition key="/reports"      style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Reports     /></StandardPageWrapper></PageTransition>}
          {pathname === "/calendar"      && <PageTransition key="/calendar"     style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Calendar    /></StandardPageWrapper></PageTransition>}
          {pathname === "/notebook"      && <PageTransition key="/notebook"     style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Notebook    /></StandardPageWrapper></PageTransition>}
          {pathname === "/settings"      && <PageTransition key="/settings"     style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Settings    /></StandardPageWrapper></PageTransition>}
          {pathname === "/calc/crypto"   && <PageTransition key="/calc/crypto"  style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><CalcCrypto  /></StandardPageWrapper></PageTransition>}
          {pathname === "/calc/forex"    && <PageTransition key="/calc/forex"   style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><CalcForex   /></StandardPageWrapper></PageTransition>}
          {pathname === "/calc/position" && <PageTransition key="/calc/position"style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><CalcPosition/></StandardPageWrapper></PageTransition>}
          {pathname === "/calc/margin"   && <PageTransition key="/calc/margin"  style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><CalcMargin  /></StandardPageWrapper></PageTransition>}
          {pathname === "/calc/risk"     && <PageTransition key="/calc/risk"    style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><CalcRisk    /></StandardPageWrapper></PageTransition>}
          {pathname === "/portfolio"     && <PageTransition key="/portfolio"    style={{ height: "100%" }} variant="detail"><Portfolio /></PageTransition>}
          {pathname === "/trade"         && <PageTransition key="/trade"        style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><Trade       /></StandardPageWrapper></PageTransition>}
          {pathname === "/ctrader-test"  && <PageTransition key="/ctrader-test" style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><CtraderTest /></StandardPageWrapper></PageTransition>}
          {!KNOWN_PATHS.has(pathname)    && <PageTransition key="not-found"    style={{ height: "100%" }}><StandardPageWrapper bottomPad={bp}><NotFound    /></StandardPageWrapper></PageTransition>}
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
