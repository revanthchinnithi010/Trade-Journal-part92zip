import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, LineChart, BarChart2, Calendar as CalendarIcon,
  BookOpen, Settings, Menu, X, Zap, Search, Bell, ChevronDown,
  TrendingUp, Link2, BellRing, Bitcoin, Globe, Crosshair,
  Layers, ShieldCheck, CandlestickChart, WifiOff, Loader2,
  Sun, Moon,
} from "lucide-react";
import { memo, useState, useRef, useEffect, useCallback } from "react";
import { useBrokerWs } from "@/hooks/useBrokerWs";
import { useBrokerStore } from "@/store/brokerStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { useLiveMarketContext } from "@/contexts/LiveMarketContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { NotificationPanel } from "./NotificationPanel";
import { ProfileDropdown, useProfile, getInitials } from "./ProfileMenu";
import { ChartFocusContext } from "@/contexts/ChartFocusContext";
import { MobileBottomNav } from "./MobileBottomNav";
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
      { href: "/calendar", label: "Calendar",           icon: CalendarIcon     },
      { href: "/notebook", label: "Notebook",           icon: BookOpen         },
      { href: "/settings", label: "Settings",           icon: Settings         },
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

export const Layout = memo(function Layout({ children, chartsNode }: { children: React.ReactNode; chartsNode?: React.ReactNode }) {
  useBrokerWs();
  const isMobile                = useIsMobile();
  const mobileChartFullscreen   = useChartStore(s => s.mobileChartFullscreen);
  const [location]    = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bellShake,   setBellShake]   = useState(false);

  const openSidebar  = useCallback(() => setSidebarOpen(true),  []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Detect cTrader same-tab OAuth redirect:
  //   ?ctrader_connected=true  — from popup opener navigation (desktop fallback)
  //   ?ctrader_error=<msg>     — from popup opener navigation on failure
  // Note: ?ctrader=connected is handled by brokers.tsx FusionPanel directly.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("ctrader_connected");
    const error     = params.get("ctrader_error");
    if (connected === "true" || error) {
      console.log("[cTrader OAuth] ✅ OAuth Success — URL param detected, redirecting to brokers");
      // Strip params from URL before doing anything else
      const clean = new URL(window.location.href);
      clean.searchParams.delete("ctrader_connected");
      clean.searchParams.delete("ctrader_error");
      // Navigate to /brokers so user lands on the broker page
      clean.pathname = "/brokers";
      window.history.replaceState({}, "", clean.toString());
      // Signal to BrokerConnectModal via sessionStorage so it knows to auto-resume
      if (connected === "true") {
        sessionStorage.setItem("ctrader_oauth_resume", "true");
        console.log("[cTrader OAuth] Token Saved — ctrader_oauth_resume flag set");
      } else if (error) {
        sessionStorage.setItem("ctrader_oauth_error", error);
      }
      // Open the cTrader auth modal so BrokerConnectModal can auto-resume
      useBrokerStore.getState().openAuthModal("ctrader");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close sidebar on route change
  const prevLocationRef = useRef(location);
  useEffect(() => {
    if (location !== prevLocationRef.current) setSidebarOpen(false);
    prevLocationRef.current = location;
  }, [location]);

  // Close sidebar on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

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

  const currentPageLabel =
    NAV_SECTIONS.flatMap(s => s.items).find(item => item.href === location)?.label || "TradeVault";

  const { theme, toggleTheme } = useTheme();
  const { currency, setCurrency, fetchRate } = useCurrencyStore();

  useEffect(() => { fetchRate(); }, [fetchRate]);

  const initials   = getInitials(profile.name);
  const badgeCount = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <ChartFocusContext.Provider value={{ openSidebar }}>
    <div
      className="h-[100dvh] w-full text-foreground overflow-hidden relative"
      style={{ background: "var(--body-bg)" }}
    >

      {/* ── Backdrop — click-to-close; no blur/dim on charts page ── */}
      <div
        onClick={closeSidebar}
        style={{
          position:      "fixed",
          inset:         0,
          zIndex:        49,
          background:    location === "/charts" ? "transparent" : "var(--surface-backdrop)",
          backdropFilter:       location === "/charts" ? "none" : "blur(2px)",
          WebkitBackdropFilter: location === "/charts" ? "none" : "blur(2px)",
          opacity:       sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? "all" : "none",
          transition:    "opacity 180ms ease",
        }}
      />

      {/* ── Sidebar — GPU-accelerated fixed overlay drawer ── */}
      <aside
        style={{
          position:   "fixed",
          top:        0,
          left:       0,
          bottom:     0,
          width:      264,
          zIndex:     50,
          display:    "flex",
          flexDirection: "column",
          transform:  sidebarOpen ? "translate3d(0,0,0)" : "translate3d(-100%,0,0)",
          willChange: "transform",
          transition: "transform 185ms cubic-bezier(0.4, 0, 0.2, 1)",
          background: "var(--surface-sidebar-bg)",
          borderRight: "1px solid var(--surface-sidebar-border)",
          boxShadow:  sidebarOpen ? "4px 0 32px rgba(0,0,0,0.5)" : "none",
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
              className="signature-shimmer text-[13px] leading-none mt-[5px]"
              style={{ color: "rgba(148,163,184,0.72)" }}
            >
              Revanth Chinnithi
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-muted-foreground hover:text-white shrink-0"
            onClick={closeSidebar}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-5 overflow-y-auto">
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
                    isActive={location === navItem.href}
                    onClick={closeSidebar}
                    badge={BADGES[navItem.href]}
                  />
                ))}
              </div>
            </div>
          ))}
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
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#94a3b8", boxShadow: "0 0 6px rgba(148,163,184,0.30)" }} />
                <span className="text-[10px] text-muted-foreground font-medium">Account Balance</span>
              </div>
              <TrendingUp className="w-2.5 h-2.5 text-muted-foreground/50" />
            </div>
            <p className="text-[15px] font-bold text-foreground tracking-tight leading-none">$12,453.20</p>
            <div className="flex items-center justify-between mt-2">
              <span
                className="text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full text-foreground/60"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border:     "1px solid rgba(255, 255, 255, 0.10)",
                }}
              >
                Pro Plan
              </span>
              <span className="text-[10px] font-semibold text-emerald-400">+$1,986 MTD</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content — always full width ── */}
      <main className="absolute inset-0 flex flex-col overflow-hidden">
        <ReconnectBanner />

        {/* Top Header — all non-chart/portfolio/markets pages */}
        {location !== "/charts" && location !== "/portfolio" && location !== "/markets" && (
          <header
            className="flex h-[60px] shrink-0 items-center justify-between px-4 z-30 sticky top-0 gap-3"
            style={{
              background:           "var(--surface-header)",
              backdropFilter:       "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderBottom:         "1px solid var(--surface-header-border)",
            }}
          >
            {/* Left: hamburger + page name */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={openSidebar}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:text-white transition-all duration-150 shrink-0"
                style={{ border: "1px solid var(--surface-btn-border)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-btn-hover)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--surface-btn-active-border)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "var(--surface-btn-border)"; }}
              >
                <Menu className="w-[17px] h-[17px]" />
              </button>
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
                {notifOpen && (
                  <NotificationPanel
                    onClose={() => setNotifOpen(false)}
                    anchorRef={bellBtnRef as React.RefObject<HTMLElement | null>}
                  />
                )}
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
                {profileOpen && (
                  <ProfileDropdown
                    profile={profile}
                    onUpdate={updateProfile}
                    onClose={() => setProfileOpen(false)}
                    anchorRef={profileBtnRef as React.RefObject<HTMLElement | null>}
                  />
                )}
              </div>
            </div>
          </header>
        )}

        {/* ── Charts page — always mounted, hidden off-route ───────────────────────
            display:none removes the element from layout entirely (zero height,
            zero pointer events) while keeping the React subtree alive in memory.
            The LWC chart instance, loaded candles, drawings, and all gesture
            state survive tab switches — no re-init, no re-fetch.
            The ResizeObserver inside CustomChart fires automatically when this
            container changes from display:none → display:flex, so LWC resizes
            itself to the correct dimensions without any manual nudge. */}
        {chartsNode && (
          <div
            className="flex-1 overflow-hidden"
            style={{
              display:            location === "/charts" ? "flex" : "none",
              flexDirection:      "column",
              touchAction:        "none",
              overscrollBehavior: "none",
              paddingBottom:      (isMobile && !mobileChartFullscreen) ? 80 : 0,
            }}
          >
            {chartsNode}
          </div>
        )}

        {/* Page Content — non-charts pages */}
        {location !== "/charts" && (
          location === "/markets" ? (
            <div
              className="flex-1 overflow-hidden flex flex-col"
              style={isMobile ? { paddingBottom: 80 } : undefined}
            >
              {children}
            </div>
          ) : location === "/portfolio" ? (
            <div
              className="flex-1 overflow-hidden flex flex-col"
              style={isMobile ? { paddingBottom: 56 } : undefined}
            >
              <div className="p-4 md:p-6 pb-2 mx-auto w-full max-w-[1400px] flex flex-col flex-1 min-h-0">
                {children}
              </div>
            </div>
          ) : (
            <div
              className="flex-1 overflow-auto scroll-container"
              style={isMobile ? { paddingBottom: 56 } : undefined}
            >
              <div className="p-5 md:p-6 pb-10 mx-auto max-w-[1400px] min-h-full">
                {children}
              </div>
            </div>
          )
        )}
      </main>

      {/* ── Mobile bottom navigation bar ── */}
      {isMobile && !mobileChartFullscreen && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60 }}>
          <MobileBottomNav />
        </div>
      )}
    </div>
    </ChartFocusContext.Provider>
  );
});
