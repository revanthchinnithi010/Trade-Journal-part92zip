import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
import { getSymbolBreakdown, getGetSymbolBreakdownQueryKey } from "@workspace/api-client-react";

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
const Portfolio    = lazy(() => import("@/pages/portfolio"));
const Balances     = lazy(() => import("@/pages/balances"));
const PnlAnalytics = lazy(() => import("@/pages/pnl-analytics"));
const NetPnl       = lazy(() => import("@/pages/NetPnLAnalytics"));
const Trade        = lazy(() => import("@/pages/trade"));
const NotFound      = lazy(() => import("@/pages/not-found"));
const CtraderTest      = lazy(() => import("@/pages/ctrader-test"));
const PositionDetail   = lazy(() => import("@/pages/position-detail"));

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
 * Scroll positions are cached per-pathname across mount/unmount cycles. Each
 * StandardPageWrapper instance is destroyed when its page exits (AnimatePresence
 * mode="wait" fully unmounts non-keep-alive pages), so React state can't carry
 * the scroll offset — a module-level cache survives the unmount and lets a page
 * restore exactly where the user left it when they navigate back.
 */
const scrollPositions = new Map<string, number>();

/**
 * StandardPageWrapper — scroll container for regular (non-full-height) pages.
 *
 * `bottomPad` overrides the default 40px bottom spacing. Pass 80 on mobile so
 * the last content item scrolls above the fixed bottom nav bar.
 *
 * `pathname` keys the scroll-position cache so returning to this route restores
 * the exact scroll offset the user had before navigating away.
 */
function StandardPageWrapper({ children, bottomPad = 40, pathname }: { children: React.ReactNode; bottomPad?: number; pathname: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = scrollPositions.get(pathname);
    if (saved) el.scrollTop = saved;

    const onScroll = () => { scrollPositions.set(pathname, el.scrollTop); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      // Capture the final position on unmount too, in case no scroll event
      // fired after the last programmatic update.
      scrollPositions.set(pathname, el.scrollTop);
      el.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  return (
    <div ref={scrollRef} style={{ height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }} className="scroll-container">
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

/**
 * Dashboard keep-alive wrapper — mirrors the Charts pattern.
 *
 * Previously Dashboard was rendered inside the single AnimatePresence flow
 * like every other tab page, meaning it fully unmounted the instant you
 * navigated away and remounted from scratch every time you came back:
 * react-query refetched stats/equity/weekly/trades, all useMemo caches were
 * thrown away, and the component replayed its internal loading-skeleton →
 * ready-content swap (a full subtree replacement) on every single visit —
 * that swap is exactly what looked like a "first-frame flash / layout jump".
 *
 * Keeping Dashboard permanently mounted (like Charts) means navigating to
 * "/" is just an instant display:flex toggle on an already fully-rendered,
 * up-to-date tree — no refetch, no remount, no skeleton replay, no jump.
 *
 * isMobile is read here (not in Router) so this element's identity never
 * changes across renders — same stability guarantee as CHARTS_NODE.
 */
function DashboardKeepAlive() {
  const isMobile = useIsMobile();
  const bp = isMobile ? 80 : 40;
  return (
    <StandardPageWrapper bottomPad={bp} pathname="/">
      <Dashboard />
    </StandardPageWrapper>
  );
}

const DASHBOARD_NODE = (
  <Suspense fallback={<PageLoader />}>
    <DashboardKeepAlive />
  </Suspense>
);

/**
 * Reports keep-alive wrapper — same pattern as DashboardKeepAlive.
 *
 * Reports previously mounted fresh on every navigation (via AnimatePresence,
 * like most other pages): its lazy chunk had to resolve, then its four
 * react-query hooks had to fetch, and until both settled the component's own
 * early-return replaced the ENTIRE tree — header, segmented control, and all
 * — with a bare shimmer grid. On a cold cache that produced exactly the
 * "blank/full-page loader on first open" symptom. Keeping Reports mounted
 * permanently (like Dashboard/Charts) means the first real navigation to
 * /reports is just a display:flex toggle on an already-rendered tree.
 *
 * Mounting is deliberately delayed a beat past initial paint (see
 * `ReportsPreload` below) so Reports' own chunk fetch + queries don't compete
 * with Dashboard's critical first-load network/render work.
 */
function ReportsKeepAlive() {
  const isMobile = useIsMobile();
  const bp = isMobile ? 80 : 40;
  return (
    <StandardPageWrapper bottomPad={bp} pathname="/reports">
      <Reports />
    </StandardPageWrapper>
  );
}

/**
 * Gates when the Reports keep-alive subtree actually mounts in the
 * background. Rendering `null` until `ready` flips means React never even
 * calls the lazy import for Reports' chunk until this timer fires — the two
 * Suspense boundaries (Dashboard's and this one) never contend for the same
 * tick of work.
 *
 * Critical: if the user actually navigates to /reports before that timer
 * fires, we must NOT keep waiting — Layout already flips the wrapper div to
 * display:flex the instant pathname === "/reports", so returning `null` past
 * that point would show a blank, seemingly-stuck panel. Checking the live
 * pathname here means a real navigation always short-circuits straight to
 * mounting, and only the *background* pre-mount (while still on "/") is
 * deferred.
 */
function ReportsPreload() {
  const [location] = useLocation();
  const onReportsRoute = location.split("?")[0] === "/reports";
  const [ready, setReady] = useState(onReportsRoute);
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(id);
  }, [ready]);
  if (!ready && !onReportsRoute) return null;
  return <ReportsKeepAlive />;
}

const REPORTS_NODE = (
  <Suspense fallback={<PageLoader />}>
    <ReportsPreload />
  </Suspense>
);

// Known pathnames — used to decide whether to render NotFound.
const KNOWN_PATHS = new Set([
  "/", "/markets", "/trades", "/brokers", "/alerts", "/reports",
  "/calendar", "/notebook", "/settings",
  "/calc/crypto", "/calc/forex", "/calc/position", "/calc/margin", "/calc/risk",
  "/portfolio", "/balances", "/pnl", "/net-pnl", "/trade", "/ctrader-test", "/charts",
  "/position-detail",
]);

/**
 * Bottom-tab order. The delta between prev and next index determines horizontal
 * slide direction: positive = navigate right (enter from right), negative = navigate left.
 * /charts is intentionally in the list so crossing it counts as a tab transition.
 * /reports is NOT in this list — Dashboard ↔ Reports switching is driven by
 * DashboardSegmentedControl's own click animation (the pill + press feedback),
 * not a page-level slide, so /reports uses the plain "page" transition below.
 */
const TAB_ORDER: string[] = ["/", "/markets", "/charts", "/trades", "/alerts"];

function Router() {
  const [location] = useLocation();
  const isMobile   = useIsMobile();

  useEffect(() => {
    // Prefetch Reports' one unique query (stats/equity/weekly are already
    // shared with — and kept warm by — the always-mounted Dashboard). Timed
    // to land just after ReportsPreload mounts the keep-alive subtree, so by
    // the time a user actually taps the Reports card the cache is populated
    // and Reports renders with real data on the very first paint.
    const id = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: getGetSymbolBreakdownQueryKey(),
        queryFn: () => getSymbolBreakdown(),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    // Eagerly preload every route's lazy chunk shortly after the initial render.
    // Previously only Charts was preloaded — every other page stayed unresolved
    // until its route was first visited. Navigating to an unresolved route makes
    // its lazy import suspend *during* the navigation transition; React then keeps
    // the previously-committed page on screen (to avoid a flash of blank content)
    // until the new chunk resolves. That is exactly what produced the bug: the
    // URL/active-tab already pointed at the destination page, but the old page's
    // content kept rendering underneath until its module finished loading —
    // looking like "Dashboard shows Alerts content" or vice versa. Preloading
    // every chunk up front means every route's module is already resolved by the
    // time the user navigates, so Suspense never has anything to wait on and the
    // previous page is never left on screen past its own exit animation.
    const modules = [
      () => import("@/pages/charts"),
      () => import("@/pages/dashboard"),
      () => import("@/pages/markets"),
      () => import("@/pages/trades"),
      () => import("@/pages/reports"),
      () => import("@/pages/calendar"),
      () => import("@/pages/notebook"),
      () => import("@/pages/settings"),
      () => import("@/pages/brokers"),
      () => import("@/pages/alerts"),
      () => import("@/pages/calc-crypto"),
      () => import("@/pages/calc-forex"),
      () => import("@/pages/calc-position"),
      () => import("@/pages/calc-margin"),
      () => import("@/pages/calc-risk"),
      () => import("@/pages/portfolio"),
      () => import("@/pages/balances"),
      () => import("@/pages/pnl-analytics"),
      () => import("@/pages/NetPnLAnalytics"),
      () => import("@/pages/trade"),
      () => import("@/pages/ctrader-test"),
      () => import("@/pages/position-detail"),
    ];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const id = setTimeout(() => {
      modules.forEach((load, i) => {
        // Stagger slightly so this never competes with the initial route's
        // own network/render work.
        timers.push(setTimeout(() => { load().catch(() => {}); }, i * 30));
      });
    }, 80);
    return () => {
      clearTimeout(id);
      timers.forEach(clearTimeout);
    };
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

  return (
    // Charts is the only keep-alive node — its LWC chart instance must survive
    // tab switches. Every other page mounts fresh and unmounts on navigation.
    <Layout chartsNode={CHARTS_NODE} dashboardNode={DASHBOARD_NODE} reportsNode={REPORTS_NODE}>
      {/*
        ── Single AnimatePresence (mode="wait") ────────────────────────────
        All pages — tab pages, sidebar pages, detail pages — live in ONE
        AnimatePresence so only a single page is ever in the DOM at a time.
        This prevents the cross-group stacking bug where a tab page (absolute)
        floated on top of a sidebar page (flow) during their concurrent exit/enter.

        mode="wait": current page fully exits before the next one enters, so
        the previous page is unmounted before the destination page mounts —
        never both at once.

        Each branch below carries its own <Suspense key={pathname}>, keyed by
        the route itself. Previously a single Suspense wrapped the *entire*
        AnimatePresence — if the destination page's lazy chunk hadn't resolved
        yet, that one shared boundary would suspend for the whole tree. React
        avoids flashing blank content by leaving the last *committed* tree
        (the PREVIOUS page) on screen until the new chunk resolves. That is
        what produced the bug: the URL/active tab already pointed at the new
        route, but the old page's DOM (and its stale props/state) kept
        rendering underneath it. Giving each route its own uniquely-keyed
        Suspense boundary means a still-loading destination page suspends
        *only its own* boundary — it can never keep the old page's boundary
        (and therefore its component tree) alive past the exit animation.
        Combined with eager-preloading every route's chunk on mount (see
        above), this boundary should essentially never need to show its
        fallback in practice — it exists purely as a correctness backstop.

        All PageTransitions use position:absolute;inset:0 — they fill the
        absolute container in layout.tsx and layer correctly.

        `custom={dir}` at the AP level so the EXITING page reads the correct
        direction even after pathname has changed. `initial={false}` skips
        the enter animation on the very first load.
      */}
      <AnimatePresence mode="wait" custom={dir} initial={false}>
        {/* ── Tab pages — direction-aware fade-shift ──
             Dashboard ("/") is intentionally NOT rendered here — it is a
             permanently-mounted keep-alive node (see DASHBOARD_NODE / Layout),
             exactly like Charts. It never enters/exits this AnimatePresence. */}
        {pathname === "/markets" && <Suspense key="/markets" fallback={<PageLoader />}><PageTransition key="/markets" variant="tab" custom={dir}><Markets /></PageTransition></Suspense>}
        {pathname === "/trades"  && <Suspense key="/trades"  fallback={<PageLoader />}><PageTransition key="/trades"  variant="tab" custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/trades"><Trades    /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/alerts"  && <Suspense key="/alerts"  fallback={<PageLoader />}><PageTransition key="/alerts"  variant="tab" custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/alerts"><Alerts    /></StandardPageWrapper></PageTransition></Suspense>}

        {/* ── Sidebar / utility pages — fade + slide-up ──
             /reports is intentionally NOT branched here — it is a
             permanently-mounted keep-alive node (REPORTS_NODE / Layout),
             exactly like Dashboard and Charts. It never enters/exits this
             AnimatePresence; switching to/from it is an instant
             display:flex toggle driven by DashboardSegmentedControl. */}
        {pathname === "/brokers"       && <Suspense key="/brokers"       fallback={<PageLoader />}><PageTransition key="/brokers"      custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/brokers"><Brokers     /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/calendar"      && <Suspense key="/calendar"      fallback={<PageLoader />}><PageTransition key="/calendar"     custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/calendar"><Calendar    /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/notebook"      && <Suspense key="/notebook"      fallback={<PageLoader />}><PageTransition key="/notebook"     custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/notebook"><Notebook    /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/settings"      && <Suspense key="/settings"      fallback={<PageLoader />}><PageTransition key="/settings"     custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/settings"><Settings    /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/calc/crypto"   && <Suspense key="/calc/crypto"   fallback={<PageLoader />}><PageTransition key="/calc/crypto"  custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/calc/crypto"><CalcCrypto  /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/calc/forex"    && <Suspense key="/calc/forex"    fallback={<PageLoader />}><PageTransition key="/calc/forex"   custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/calc/forex"><CalcForex   /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/calc/position" && <Suspense key="/calc/position" fallback={<PageLoader />}><PageTransition key="/calc/position"custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/calc/position"><CalcPosition/></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/calc/margin"   && <Suspense key="/calc/margin"   fallback={<PageLoader />}><PageTransition key="/calc/margin"  custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/calc/margin"><CalcMargin  /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/calc/risk"     && <Suspense key="/calc/risk"     fallback={<PageLoader />}><PageTransition key="/calc/risk"    custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/calc/risk"><CalcRisk    /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/trade"         && <Suspense key="/trade"         fallback={<PageLoader />}><PageTransition key="/trade"        custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/trade"><Trade       /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/ctrader-test"  && <Suspense key="/ctrader-test"  fallback={<PageLoader />}><PageTransition key="/ctrader-test" custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/ctrader-test"><CtraderTest /></StandardPageWrapper></PageTransition></Suspense>}

        {/* ── Detail pages — fade + scale ──
             Portfolio manages its own internal scroll region (tab content
             area) inside a fixed-height flex column, so it is NOT wrapped in
             StandardPageWrapper — it needs the PageTransition's absolute-fill
             box directly as its height reference, not an outer page-scroll
             container. */}
        {pathname === "/portfolio"        && <Suspense key="/portfolio"        fallback={<PageLoader />}><PageTransition key="/portfolio"        variant="detail" custom={dir}><Portfolio /></PageTransition></Suspense>}
        {/* Balances manages its own full-height black scroll region (matching
             the forced-black secondary header in Layout.tsx) instead of
             StandardPageWrapper's themed page background, so there's no
             light/dark seam between the header and the content below it. */}
        {pathname === "/balances"         && <Suspense key="/balances"         fallback={<PageLoader />}><PageTransition key="/balances"         variant="detail" custom={dir}><Balances /></PageTransition></Suspense>}
        {pathname === "/position-detail"  && <Suspense key="/position-detail"  fallback={<PageLoader />}><PageTransition key="/position-detail"  variant="slide"  custom={1}><PositionDetail /></PageTransition></Suspense>}
        {pathname === "/pnl"              && <Suspense key="/pnl"              fallback={<PageLoader />}><PageTransition key="/pnl"              variant="detail" custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/pnl"><PnlAnalytics /></StandardPageWrapper></PageTransition></Suspense>}
        {pathname === "/net-pnl"          && <Suspense key="/net-pnl"          fallback={<PageLoader />}><PageTransition key="/net-pnl"          variant="detail" custom={dir}><StandardPageWrapper bottomPad={bp} pathname="/net-pnl"><NetPnl /></StandardPageWrapper></PageTransition></Suspense>}

        {/* ── 404 ── */}
        {!KNOWN_PATHS.has(pathname)    && <Suspense key="not-found" fallback={<PageLoader />}><PageTransition key="not-found"  custom={dir}><StandardPageWrapper bottomPad={bp} pathname="not-found"><NotFound    /></StandardPageWrapper></PageTransition></Suspense>}
      </AnimatePresence>
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
