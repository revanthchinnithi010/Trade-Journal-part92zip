import { lazy, Suspense, useEffect } from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { popupManager } from "@/lib/popupManager";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { LiveMarketProvider } from "@/contexts/LiveMarketContext";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";

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
const NotFound    = lazy(() => import("@/pages/not-found"));

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

function Router() {
  useEffect(() => {
    // Eagerly trigger the Charts lazy-import after the initial render so the
    // module is in the browser cache before the user taps the Charts tab.
    // This eliminates the dynamic-import round-trip (~50-200ms) on first visit.
    const id = setTimeout(() => { import("@/pages/charts").catch(() => {}); }, 80);
    return () => clearTimeout(id);
  }, []);

  return (
    // chartsNode is always rendered (inside Layout) but hidden off-route.
    // children (the Switch) only gets rendered for non-charts pages.
    <Layout chartsNode={CHARTS_NODE}>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/">{() => <Dashboard />}</Route>
          <Route path="/markets">{() => <Markets />}</Route>
          <Route path="/trades">{() => <Trades />}</Route>
          <Route path="/brokers">{() => <Brokers />}</Route>
          <Route path="/alerts">{() => <Alerts />}</Route>
          <Route path="/reports">{() => <Reports />}</Route>
          <Route path="/calendar">{() => <Calendar />}</Route>
          <Route path="/notebook">{() => <Notebook />}</Route>
          <Route path="/settings">{() => <Settings />}</Route>
          <Route path="/calc/crypto">{() => <CalcCrypto />}</Route>
          <Route path="/calc/forex">{() => <CalcForex />}</Route>
          <Route path="/calc/position">{() => <CalcPosition />}</Route>
          <Route path="/calc/margin">{() => <CalcMargin />}</Route>
          <Route path="/calc/risk">{() => <CalcRisk />}</Route>
          {/* /charts is handled by chartsNode above — this empty route prevents
              the NotFound catchall from matching when path === /charts */}
          <Route path="/charts">{() => null}</Route>
          <Route path="/portfolio">{() => <Portfolio />}</Route>
          <Route path="/trade">{() => <Trade />}</Route>
          <Route>{() => <NotFound />}</Route>
        </Switch>
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
