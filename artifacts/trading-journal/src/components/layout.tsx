import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, LineChart, BarChart2, Calendar as CalendarIcon,
  BookOpen, Settings, Menu, X, Zap, Search, Bell, ChevronDown,
  TrendingUp, Link2, BellRing, Bitcoin, Globe, Crosshair,
  Layers, ShieldCheck, CandlestickChart, WifiOff, Loader2,
  Sun, Moon, FlaskConical, ArrowLeft,
} from "lucide-react";
import { memo, useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { compositorPanelTransition, compositorFadeTransition } from "@/animations/motion";
import { useBrokerWs } from "@/hooks/useBrokerWs";
import { useBrokerStore } from "@/store/brokerStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { useLiveMarketContext } from "@/contexts/LiveMarketContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { NotificationPanel } from "./NotificationPanel";
import { ProfileDropdown, useProfile, getInitials, type ProfileData } from "./ProfileMenu";
import { ChartFocusContext } from "@/contexts/ChartFocusContext";
import { MobileBottomNav } from "./MobileBottomNav";
import { SidebarSystemSections } from "./SidebarSystemSections";
import { useTheme } from "@/contexts/ThemeContext";
import { useChartStore } from "@/store/chartStore";
import { useCurrencyStore, CURRENCY_META } from "@/store/currencyStore";

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { href: "/",         label: "Dashboard",         icon: LayoutDashboard  },
      { href: "/trades",   label: "Trades",             icon: LineChart        },
      { href: "/brokers",  label: "Broker Connections", icon: Link2            },
      { href: "/alerts",   label: "Alerts Center",      icon: BellRing         },
      { href: "/reports",  label: "Reports",            icon: BarChart2        },
      { href: "/charts",   label: "Charts",             icon: CandlestickChart },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/calendar",      label: "Calendar",          icon: CalendarIcon  },
      { href: "/notebook",      label: "Notebook",          icon: BookOpen      },
      { href: "/settings",      label: "Settings",          icon: Settings      },
      { href: "/ctrader-test",  label: "cTrader Connect",   icon: FlaskConical  },
    ],
  },
  {
    label: "Calculators",
    items: [
      { href: "/calc/crypto",   label: "Crypto Calc",  icon: Bitcoin          },
      { href: "/calc/forex",    label: "Forex Calc",   icon: Globe            },
      { href: "/calc/position", label: "Position Size",icon: Crosshair        },
      { href: "/calc/margin",   label: "Margin Calc",  icon: Layers           },
      { href: "/calc/risk",     label: "Risk Calc",    icon: ShieldCheck      },
    ],
  },
];

const BADGES: Record<string, React.ReactNode> = {
  "/brokers": (
    <span className="ml-auto flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#94a3b8", boxShadow: "0 0 6px rgba(148,163,184,0.35)" }} />
      <span className="text-[9px] font-bold" style={{ color: "#94a3b8" }}>2</span>
    </span>
  ),
  "/alerts": (
    <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-rose-500/90 text-[8px] font-bold text-white shadow-sm shadow-rose-500/40">
      3
    </span>
  ),
};

const NavItem = memo(function NavItem({
  href, label, icon: Icon, isActive, badge, onClick,
}: {
  href: string; label: string; icon: React.ElementType;
  isActive: boolean; badge?: React.ReactNode; onClick?: () => void;
}) {
  return (
    <Link href={href} onClick={onClick}>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-[10px] rounded-2xl text-[13px] font-medium transition-all duration-150 cursor-pointer relative group",
          isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        style={isActive ? {
          background: "linear-gradient(135deg, var(--surface-btn-active-bg) 0%, var(--surface-btn-hover) 100%)",
          border:     "1px solid var(--surface-btn-active-border)",
        } : {
          border: "1px solid transparent",
        }}
      >
        {!isActive && (
          <div
            className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            style={{ background: "var(--surface-btn-hover)" }}
          />
        )}
        <Icon
          className={cn(
            "w-[15px] h-[15px] shrink-0 relative transition-colors duration-150",
            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )}
        />
        <span className="relative leading-none">{label}</span>
        {badge}
      </div>
    </Link>
  );
});

/**
 * NavigationDrawer — left-side hamburger menu.
 *
 * Uses the EXACT same compositor CSS-transition system as ProfileMenu's
 * dropdown (see src/animations/motion.ts: compositorPanelTransition /
 * compositorFadeTransition — opacity+transform only, 180ms open / 120ms
 * close, cubic-bezier(0.22,1,0.36,1), running on the GPU compositor thread
 * rather than framer-motion's JS-driven animate()). The only difference
 * from the Profile dropdown is the transform axis: a left-edge drawer
 * slides in on X via translate3d, where the Profile dropdown slides/scales
 * from the top-right corner — same engine, same timing, direction adapted
 * to the drawer's geometry.
 *
 * Always mounted; `open` only toggles opacity/transform/pointer-events, so
 * re-opening never re-mounts nav items or re-triggers a Dashboard render.
 */
const NavigationDrawer = memo(function NavigationDrawer({
  open, onClose, pathname, profile,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  profile: ProfileData;
}) {
  const sidebarBalance          = useBrokerStore(s => s.balance);
  const sidebarConnectionStatus = useBrokerStore(s => s.connectionStatus);
  const sidebarActiveAccount    = useBrokerStore(s => s.activeAccount);

  /* `onClose` may be a fresh reference on some call sites — depend only on
     `open` in the effects below and read the callback via a ref (same
     pattern as NotificationPanel) so listeners never tear down/rebuild on
     unrelated re-renders. */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  /* ESC (desktop) */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  /* Android back button — push a history entry while open, close on
     popstate instead of navigating away. */
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ tjNavDrawer: true }, "");
    const h = () => onCloseRef.current();
    window.addEventListener("popstate", h);
    return () => {
      window.removeEventListener("popstate", h);
      if (window.history.state?.tjNavDrawer) window.history.back();
    };
  }, [open]);

  const onBackdropClick = useCallback(() => onCloseRef.current(), []);
  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  const panelTx = compositorPanelTransition(open);
  const fadeTx  = compositorFadeTransition(open);

  return (
    <>
      {/* Backdrop — opacity-only compositor fade, identical timing to the
          Profile Menu backdrop. */}
      <div
        aria-hidden
        onClick={onBackdropClick}
        style={{
          position:             "fixed",
          inset:                0,
          zIndex:               49,
          background:           pathname === "/charts" ? "transparent" : "rgba(0,0,0,0.45)",
          backdropFilter:       pathname === "/charts" ? "none" : "blur(2px)",
          WebkitBackdropFilter: pathname === "/charts" ? "none" : "blur(2px)",
          opacity:              open ? 1 : 0,
          transition:           fadeTx,
          pointerEvents:        open ? "auto" : "none",
        }}
      />

      {/* Drawer panel — GPU-composited transform + opacity only. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!open}
        onClick={stop}
        className="transform-gpu"
        style={{
          position:                 "fixed",
          top:                      0,
          left:                     0,
          bottom:                   0,
          width:                    "min(82vw, 360px)",
          zIndex:                   50,
          display:                  "flex",
          flexDirection:            "column",
          background:               "#121316",
          borderRight:              "1px solid rgba(255,255,255,0.06)",
          opacity:                  open ? 1 : 0,
          transform:                open ? "translate3d(0,0,0)" : "translate3d(-100%,0,0)",
          transition:               panelTx,
          willChange:               "transform, opacity",
          backfaceVisibility:       "hidden",
          WebkitBackfaceVisibility: "hidden",
          pointerEvents:            open ? "auto" : "none",
          paddingTop:               "env(safe-area-inset-top)",
          paddingBottom:            "env(safe-area-inset-bottom)",
        }}
      >
        {/* Logo + close */}
        <div
          className="flex h-[70px] shrink-0 items-center px-4 gap-3"
          style={{ borderBottom: "1px solid var(--surface-sidebar-logo-border)" }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(5,7,10,0.88) 100%)",
              boxShadow:  "0 4px 18px rgba(0,0,0,0.40), 0 1px 0 rgba(255,255,255,0.06) inset",
              border:     "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <Zap className="w-[18px] h-[18px] text-foreground/80" fill="currentColor" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold tracking-tight text-foreground leading-none">TradeVault</p>
            <p
              className="signature-shimmer text-[13px] leading-none mt-[5px] truncate"
              style={{ color: "rgba(148,163,184,0.72)" }}
            >
              {profile.name}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-muted-foreground hover:text-white shrink-0"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Nav — smooth scroll if items exceed viewport height */}
        <nav
          className="flex-1 px-3 py-3 overflow-y-auto"
          style={{
            display: "flex", flexDirection: "column", gap: 20,
            WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
          }}
        >
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p
                className="text-[9px] font-bold uppercase tracking-[0.14em] px-3 pb-2 leading-none"
                style={{ color: "rgba(148, 163, 184, 0.45)" }}
              >
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((navItem) => (
                  <NavItem
                    key={navItem.href}
                    href={navItem.href}
                    label={navItem.label}
                    icon={navItem.icon}
                    isActive={pathname === navItem.href}
                    onClick={onClose}
                    badge={BADGES[navItem.href]}
                  />
                ))}
              </div>
            </div>
          ))}
          <SidebarSystemSections open={open} />
        </nav>

        {/* Account Summary */}
        <div className="p-3" style={{ borderTop: "1px solid var(--surface-sidebar-logo-border)" }}>
          <div
            className="p-3.5 rounded-2xl relative overflow-hidden"
            style={{
              background: "var(--surface-btn-hover)",
              border:     "1px solid var(--surface-btn-border)",
            }}
          >
            {(() => {
              const connected = sidebarConnectionStatus === "connected";
              const bal       = sidebarBalance;
              const walletNum = bal ? parseFloat(bal.walletBalance) : null;
              const upnlNum   = bal ? parseFloat(bal.unrealisedPnl) : null;
              const dotColor  = connected ? "#34d399" : "#94a3b8";
              const dotGlow   = connected ? "0 0 6px rgba(52,211,153,0.55)" : "0 0 6px rgba(148,163,184,0.30)";
              const fmtUsd    = (n: number) =>
                n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
              const brokerLabel = sidebarActiveAccount?.label ?? (connected ? "Broker" : "No Broker");
              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor, boxShadow: dotGlow }} />
                      <span className="text-[10px] text-muted-foreground font-medium">Account Balance</span>
                    </div>
                    <TrendingUp className="w-2.5 h-2.5 text-muted-foreground/50" />
                  </div>
                  <p className="text-[15px] font-bold text-foreground tracking-tight leading-none">
                    {walletNum !== null && !isNaN(walletNum) ? fmtUsd(walletNum) : "—"}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className="text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full text-foreground/60 truncate max-w-[110px]"
                      style={{
                        background: "rgba(255, 255, 255, 0.05)",
                        border:     "1px solid rgba(255, 255, 255, 0.10)",
                      }}
                    >
                      {brokerLabel}
                    </span>
                    {upnlNum !== null && !isNaN(upnlNum) ? (
                      <span className={`text-[10px] font-semibold ${upnlNum >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {upnlNum >= 0 ? "+" : ""}{fmtUsd(upnlNum)} uPnL
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40">Not connected</span>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </aside>
    </>
  );
});

function ReconnectBanner() {
  const { wsStatus } = useLiveMarketContext();
  if (wsStatus === "connected" || wsStatus === "connecting") return null;

  const isReconnecting = wsStatus === "reconnecting";
  const isError        = wsStatus === "error";

  return (
    <div
      className="flex items-center justify-center gap-2 py-1.5 px-4 text-[11px] font-semibold z-50"
      style={{
        background:   isError ? "rgba(239,68,68,0.12)" : "rgba(251,191,36,0.10)",
        borderBottom: isError ? "1px solid rgba(239,68,68,0.22)" : "1px solid rgba(251,191,36,0.22)",
        color:        isError ? "#f87171" : "#fbbf24",
      }}
    >
      {isReconnecting
        ? <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        : <WifiOff className="w-3 h-3 shrink-0" />}
      {isError
        ? "WebSocket connection failed — live data unavailable. Refresh the page to retry."
        : "Live feed reconnecting — prices may be delayed…"}
    </div>
  );
}

export const Layout = memo(function Layout({
  children,
  chartsNode,
  dashboardNode,
  reportsNode,
}: {
  children:      React.ReactNode;
  chartsNode?:   React.ReactNode;
  dashboardNode?: React.ReactNode;
  reportsNode?:   React.ReactNode;
}) {
  useBrokerWs();
  const isMobile                = useIsMobile();
  const mobileChartFullscreen   = useChartStore(s => s.mobileChartFullscreen);
  const [location, navigate] = useLocation();
  // Strip query-string so "/markets?x=1" matches "/markets" in all comparisons.
  const pathname      = location.split("?")[0];
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bellShake,   setBellShake]   = useState(false);

  const openSidebar  = useCallback(() => setSidebarOpen(true),  []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Close sidebar on route change
  const prevLocationRef = useRef(location);
  useEffect(() => {
    if (location !== prevLocationRef.current) setSidebarOpen(false);
    prevLocationRef.current = location;
  }, [location]);

  // Open sidebar from mobile bottom-nav menu button
  useEffect(() => {
    const h = () => setSidebarOpen(true);
    window.addEventListener("tj:open-sidebar", h);
    return () => window.removeEventListener("tj:open-sidebar", h);
  }, []);

  const { unreadCount } = useNotifications();
  const { profile, update: updateProfile } = useProfile();

  const bellBtnRef    = useRef<HTMLButtonElement>(null);
  const profileBtnRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef(0);

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && !notifOpen) {
      setBellShake(true);
      const t = setTimeout(() => setBellShake(false), 700);
      return () => clearTimeout(t);
    }
    prevUnreadRef.current = unreadCount;
    return undefined;
  }, [unreadCount, notifOpen]);

  const toggleNotif = useCallback(() => {
    setNotifOpen(v => !v);
    setProfileOpen(false);
  }, []);

  const toggleProfile = useCallback(() => {
    setProfileOpen(v => !v);
    setNotifOpen(false);
  }, []);

  const closeNotif = useCallback(() => setNotifOpen(false), []);

  const currentPageLabel =
    pathname === "/portfolio"    ? "Portfolio"          :
    pathname === "/pnl"          ? "Net PNL Analytics"  :
    pathname === "/net-pnl"      ? "Net PNL Analytics"  :
    NAV_SECTIONS.flatMap(s => s.items).find(item => item.href === pathname)?.label || "TradeVault";

  const { theme, toggleTheme } = useTheme();
  const { currency, setCurrency, fetchRate } = useCurrencyStore();

  useEffect(() => {
    const id = setTimeout(() => { fetchRate(); }, 1500);
    return () => clearTimeout(id);
  }, [fetchRate]);

  const initials   = getInitials(profile.name);
  const badgeCount = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <ChartFocusContext.Provider value={{ openSidebar }}>
    <div
      className="h-[100dvh] w-full text-foreground overflow-hidden relative"
      style={{ background: "var(--body-bg)" }}
    >

      {/* ── Navigation Drawer — same compositor CSS-transition system as
          ProfileMenu's dropdown (see NavigationDrawer above). Always
          mounted; `open` only toggles visibility. ── */}
      <NavigationDrawer
        open={sidebarOpen}
        onClose={closeSidebar}
        pathname={pathname}
        profile={profile}
      />

      {/* ── Main Content — always full width ── */}
      <main className="absolute inset-0 flex flex-col overflow-hidden">
        <ReconnectBanner />

        {/* Top Header — hidden ONLY on /charts (gesture surface owns the full
            viewport). Every other page, including /portfolio, keeps this same
            header mounted at all times so it never disappears mid-navigation.
            Previously /portfolio hid this header and relied on its own inline
            back-button row instead — but that row lives inside the AnimatePresence
            content tree while this header lives in Layout (a separate, always-
            mounted tree). Toggling them on raw pathname change (instant) vs. the
            content's animated exit/enter (delayed ~200ms) caused a headerless
            flash while Dashboard's exit animation was still playing. Keeping one
            persistent header — swapping only its left control between hamburger
            and back-arrow — eliminates that gap entirely. */}
        {pathname !== "/charts" && (
          <header
            className="flex h-[60px] shrink-0 items-center justify-between px-4 z-30 sticky top-0 gap-3"
            style={{
              background:           "var(--surface-header)",
              backdropFilter:       "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderBottom:         "1px solid var(--surface-header-border)",
            }}
          >
            {/* Left: hamburger (or back-arrow on detail pages) + page name */}
            <div className="flex items-center gap-3 shrink-0">
              {(pathname === "/portfolio" || pathname === "/pnl" || pathname === "/net-pnl") ? (
                <button
                  onClick={() => navigate("/")}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:text-white transition-all duration-150 shrink-0"
                  style={{ border: "1px solid var(--surface-btn-border)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-btn-hover)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--surface-btn-active-border)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "var(--surface-btn-border)"; }}
                  aria-label="Back"
                >
                  <ArrowLeft className="w-[17px] h-[17px]" />
                </button>
              ) : (
                <button
                  onClick={openSidebar}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:text-white transition-all duration-150 shrink-0"
                  style={{ border: "1px solid var(--surface-btn-border)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-btn-hover)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--surface-btn-active-border)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "var(--surface-btn-border)"; }}
                >
                  <Menu className="w-[17px] h-[17px]" />
                </button>
              )}
              <h1 className="text-[15px] font-semibold text-foreground tracking-tight">
                {currentPageLabel}
              </h1>
            </div>

            {/* Center: Search — desktop only */}
            {!isMobile && (
              <div className="flex-1 flex items-center justify-center px-4 max-w-sm mx-auto">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                  <input
                    type="text"
                    placeholder="Search trades, symbols..."
                    className="w-full h-9 pl-9 pr-4 rounded-xl text-xs transition-all text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                    style={{
                      background: "var(--surface-input-bg)",
                      border:     "1px solid var(--surface-input-border)",
                      color:      "inherit",
                    }}
                    onFocus={e => { e.currentTarget.style.border = "1px solid var(--surface-input-focus)"; }}
                    onBlur={e  => { e.currentTarget.style.border = "1px solid var(--surface-input-border)"; }}
                  />
                </div>
              </div>
            )}

            {/* Right: Theme Toggle (desktop only) + Bell + Profile */}
            <div className="flex items-center gap-2 shrink-0">

              {/* Theme Toggle — hidden on mobile (use Profile → Appearance instead) */}
              {!isMobile && (
                <button
                  onClick={toggleTheme}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground transition-all duration-200"
                  style={{ border: "1px solid var(--surface-btn-border)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-btn-hover)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                  {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              )}

              {/* Currency Toggle */}
              <button
                onClick={() => setCurrency(currency === "USD" ? "INR" : "USD")}
                className="h-9 px-3 flex items-center gap-1 rounded-xl text-muted-foreground transition-all duration-200 text-[12px] font-bold tracking-tight"
                style={{ border: "1px solid var(--surface-btn-border)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-btn-hover)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                title={`Switch to ${currency === "USD" ? "INR (₹)" : "USD ($)"}`}
              >
                <span>{CURRENCY_META[currency].symbol}</span>
                <span className="hidden sm:inline">{currency}</span>
              </button>

              <div className="relative">
                <button
                  ref={bellBtnRef}
                  onClick={toggleNotif}
                  className="relative w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground transition-all duration-150"
                  style={{
                    border:     notifOpen ? "1px solid var(--surface-btn-active-border)" : "1px solid var(--surface-btn-border)",
                    background: notifOpen ? "var(--surface-btn-active-bg)" : "transparent",
                    color:      notifOpen ? "hsl(var(--foreground))" : undefined,
                  }}
                  onMouseEnter={e => { if (!notifOpen) (e.currentTarget as HTMLElement).style.background = "var(--surface-btn-hover)"; }}
                  onMouseLeave={e => { if (!notifOpen) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <Bell className={cn("w-4 h-4 transition-colors", bellShake && "bell-ring", notifOpen && "text-primary")} />
                  {badgeCount && (
                    <span
                      className="absolute top-0.5 right-0.5 flex items-center justify-center rounded-full text-[7px] font-bold text-white leading-none"
                      style={{
                        minWidth:   "14px",
                        height:     "14px",
                        padding:    "0 2px",
                        background: "hsl(0,68%,58%)",
                        border:     "1.5px solid var(--notification-badge-border)",
                        boxShadow:  "0 0 8px rgba(239,68,68,0.5)",
                      }}
                    >
                      {badgeCount}
                    </span>
                  )}
                </button>
                <NotificationPanel
                  open={notifOpen}
                  onClose={closeNotif}
                />
              </div>

              <div className="w-px h-5" style={{ background: "var(--surface-divider)" }} />

              <div className="relative">
                <div
                  ref={profileBtnRef}
                  className="flex items-center gap-2 cursor-pointer select-none group px-1 py-1 rounded-xl transition-all duration-150"
                  style={{
                    border:     profileOpen ? "1px solid var(--surface-btn-active-border)" : "1px solid transparent",
                    background: profileOpen ? "var(--surface-btn-active-bg)" : "transparent",
                  }}
                  onClick={toggleProfile}
                  onMouseEnter={e => { if (!profileOpen) (e.currentTarget as HTMLElement).style.background = "var(--surface-btn-hover)"; }}
                  onMouseLeave={e => { if (!profileOpen) (e.currentTarget as HTMLElement).style.background = profileOpen ? "var(--surface-btn-active-bg)" : "transparent"; }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                    style={{
                      background: "var(--surface-avatar-bg)",
                      border:     "1px solid var(--surface-avatar-border)",
                    }}
                  >
                    {profile.avatarDataUrl
                      ? <img src={profile.avatarDataUrl} alt={profile.name} className="w-full h-full object-cover" />
                      : <span className="text-[11px] font-bold" style={{ color: "var(--surface-avatar-text)" }}>{initials}</span>
                    }
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-[12px] font-semibold text-foreground/85 leading-tight group-hover:text-foreground transition-colors">
                      {profile.name.split(" ")[0]}
                    </p>
                    <p className="text-[9px] text-muted-foreground/60 leading-none">{profile.email.split("@")[0]}</p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 text-muted-foreground/60 hidden sm:block transition-transform duration-200",
                      profileOpen && "rotate-180"
                    )}
                  />
                </div>
                <ProfileDropdown
                  open={profileOpen}
                  profile={profile}
                  onUpdate={updateProfile}
                  onClose={() => setProfileOpen(false)}
                  anchorRef={profileBtnRef as React.RefObject<HTMLElement | null>}
                />
              </div>
            </div>
          </header>
        )}

        {/* ── Content area ─────────────────────────────────────────────────────────
            Charts is the only keep-alive page: its LWC instance must survive tab
            switches (resize + state would reset on remount). Every other page is
            rendered via AnimatePresence in App.tsx — it mounts on navigate-in and
            unmounts on navigate-out so only ONE page is ever in the DOM at a time.

            Markets removes the top header entirely (see condition above) so the
            flex-1 div here fills the full viewport height when on /markets. */}
        <div className="flex-1 overflow-hidden" style={{ position: "relative" }}>

          {/* Charts — keep-alive; touch/scroll locked for LWC gesture handling. */}
          {chartsNode && (
            <div style={{
              position:           "absolute",
              inset:              0,
              display:            pathname === "/charts" ? "flex" : "none",
              flexDirection:      "column",
              touchAction:        "none",
              overscrollBehavior: "none",
              paddingBottom:      (isMobile && !mobileChartFullscreen) ? 80 : 0,
            }}>
              {chartsNode}
            </div>
          )}

          {/* Dashboard — keep-alive, same pattern as Charts. Staying mounted
              permanently (instead of unmount/remount via AnimatePresence)
              means: no refetch of stats/equity/trades on every tab switch,
              no first-frame skeleton flash, no layout jump — switching to "/"
              is just an instant display:flex on an already fully-rendered
              tree. See .agents/memory dashboard-keep-alive notes. */}
          {dashboardNode && (
            <div style={{
              position:      "absolute",
              inset:         0,
              display:       pathname === "/" ? "flex" : "none",
              flexDirection: "column",
              overflow:      "hidden",
            }}>
              {dashboardNode}
            </div>
          )}

          {/* Reports — keep-alive, same pattern as Dashboard/Charts. Staying
              mounted (instead of unmount/remount via AnimatePresence) means:
              no re-fetch of stats/symbol-breakdown on every tab switch, no
              first-frame skeleton replay, no blank-page flash on first open
              — switching to "/reports" is just an instant display:flex on an
              already fully-rendered tree. See .agents/memory reports notes. */}
          {reportsNode && (
            <div style={{
              position:      "absolute",
              inset:         0,
              display:       pathname === "/reports" ? "flex" : "none",
              flexDirection: "column",
              overflow:      "hidden",
            }}>
              {reportsNode}
            </div>
          )}

          {/* All other pages — mounted/unmounted by AnimatePresence in App.tsx.
              The paddingBottom for the mobile nav bar is applied per-page in
              App.tsx via StandardPageWrapper or the page's own layout.

              This wrapper must stay mounted UNCONDITIONALLY — it hosts the
              single AnimatePresence from App.tsx, which decides on its own
              when a page is actually in the DOM (nothing renders here while
              pathname is "/" or "/charts", since those routes are excluded
              from the AnimatePresence branches and rendered via the
              keep-alive nodes above instead). Gating this div on
              `pathname !== "/"` used to unmount the whole AnimatePresence
              tree the instant you navigated back to Dashboard — before it
              ever got to run the outgoing page's exit animation — which is
              why the Reports → Dashboard transition appeared to have no
              animation at all. It sits after chartsNode/dashboardNode/reportsNode
              in DOM order, so it still paints on top of them while a page is
              genuinely present (entering/exiting), and is visually a no-op
              once AnimatePresence unmounts its child.

              pointerEvents must be "none" for every keep-alive route (/, /charts,
              /reports) — this div is unconditionally mounted and empty on those
              routes, but still sits on top in DOM order. Leaving pointerEvents
              "auto" there makes it an invisible full-viewport overlay that
              swallows every click/scroll aimed at the keep-alive content
              underneath — this is exactly what caused Reports to look "stuck"
              (unscrollable, unclickable) after it was converted to a keep-alive
              route without updating this list. */}
          <div style={{
            position:      "absolute",
            inset:         0,
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            pointerEvents: (pathname === "/" || pathname === "/charts" || pathname === "/reports") ? "none" : "auto",
          }}>
            {children}
          </div>
        </div>
      </main>

      {/* ── Mobile bottom navigation bar ── */}
      {/* Always mounted — visibility:hidden (not display:none) so the pill keeps
          its clientWidth, ResizeObserver never fires tabW=0, and animation state
          is fully preserved across fullscreen toggles. */}
      {isMobile && (
        <div style={{
          position:      "fixed",
          left:          0,
          right:         0,
          bottom:        0,
          zIndex:        60,
          visibility:    mobileChartFullscreen ? "hidden" : "visible",
          pointerEvents: mobileChartFullscreen ? "none"   : "auto",
        }}>
          <MobileBottomNav />
        </div>
      )}
    </div>
    </ChartFocusContext.Provider>
  );
});
