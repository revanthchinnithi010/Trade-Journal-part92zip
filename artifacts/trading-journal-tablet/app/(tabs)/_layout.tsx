/**
 * app/(tabs)/_layout.tsx — Native Navigation Shell
 *
 * Structural reference: artifacts/trading-journal/src/components/MobileBottomNav.tsx
 *
 * Mirrors exactly:
 *   • Tab order   — Home / Markets / Trade / Charts / Alerts  (MobileBottomNav TABS)
 *   • Icons       — Ionicons equivalents for each Lucide icon used in TABS
 *   • Labels      — identical strings ("Home", "Markets", "Trade", "Charts", "Alerts")
 *   • Active/inactive styling — colours extracted from MobileBottomNav palette objects
 *   • Badge behaviour — Alerts tab badge mirrors unreadCount (stub: 0 until
 *                       NotificationsContext is migrated in a future phase)
 *   • Dark theme  — default; light palette ready for theme switching
 *
 * NOT yet migrated:
 *   • MobileBottomNav bubble/glow animation (Framer Motion → Reanimated, future phase)
 *   • Tab screen content (each screen is a stub; actual pages migrated separately)
 *
 * Icon mapping (Lucide → Ionicons):
 *   LayoutDashboard → home / home-outline
 *   Globe           → globe / globe-outline
 *   ArrowLeftRight  → swap-horizontal / swap-horizontal-outline
 *   BarChart2       → bar-chart / bar-chart-outline
 *   Bell            → notifications / notifications-outline
 */

import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/ThemeContext";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — sourced from MobileBottomNav
// ─────────────────────────────────────────────────────────────────────────────

/** Tab bar pill height — mirrors BAR_H = 62 in MobileBottomNav */
const TAB_BAR_HEIGHT = 62;

// ─────────────────────────────────────────────────────────────────────────────
// Palette — extracted from MobileBottomNav's dark/light theme objects
//
// Dark (default):
//   pillBg        rgba(12,14,19,0.97)
//   activeIcon    #ffffff
//   inactiveIcon  rgba(148,163,184,0.44)  ← #94A3B8 at 44%
//   activeLabel   rgba(255,255,255,0.92)
//   inactiveLabel rgba(148,163,184,0.40)
//   wrapper       boxShadow: 0 0 0 1px rgba(255,255,255,0.06), ...
//
// Light:
//   pillBg        rgba(255,255,255,0.99)
//   activeIcon    #7C3AED
//   inactiveIcon  #9CA3AF
//   activeLabel   #7C3AED
//   inactiveLabel #9CA3AF
// ─────────────────────────────────────────────────────────────────────────────

interface TabPalette {
  tabBarBg:         string;
  activeIcon:       string;
  inactiveIcon:     string;
  activeLabel:      string;
  inactiveLabel:    string;
  borderTop:        string;
  badgeBg:          string;
  // iOS shadow
  shadowColor:      string;
  shadowOpacity:    number;
  // Android elevation
  elevation:        number;
}

const DARK_PALETTE: TabPalette = {
  tabBarBg:      "rgba(12,14,19,0.97)",
  activeIcon:    "#ffffff",
  inactiveIcon:  "rgba(148,163,184,0.44)",
  activeLabel:   "rgba(255,255,255,0.92)",
  inactiveLabel: "rgba(148,163,184,0.40)",
  borderTop:     "rgba(255,255,255,0.06)",  // --surface-btn-border dark
  badgeBg:       "#ef4444",
  shadowColor:   "#000000",
  shadowOpacity: 0.65,
  elevation:     24,
};

const LIGHT_PALETTE: TabPalette = {
  tabBarBg:      "rgba(255,255,255,0.99)",
  activeIcon:    "#7C3AED",
  inactiveIcon:  "#9CA3AF",
  activeLabel:   "#7C3AED",
  inactiveLabel: "#9CA3AF",
  borderTop:     "rgba(0,0,0,0.06)",        // --surface-btn-border light
  badgeBg:       "#ef4444",
  shadowColor:   "#000000",
  shadowOpacity: 0.10,
  elevation:     8,
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions — mirrors TABS array in MobileBottomNav exactly
// ─────────────────────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

interface TabDef {
  /** Expo Router screen name (filename without extension inside (tabs)/) */
  name:         string;
  /** Displayed label — identical to MobileBottomNav tab.label */
  label:        string;
  /** Ionicons icon when the tab is focused */
  iconActive:   IoniconName;
  /** Ionicons icon when the tab is not focused */
  iconInactive: IoniconName;
}

/**
 * Mirrors MobileBottomNav TABS order exactly:
 *   Home → Markets → Trade → Charts → Alerts
 */
const TABS: TabDef[] = [
  {
    name:         "index",
    label:        "Home",
    iconActive:   "home",
    iconInactive: "home-outline",
  },
  {
    name:         "markets",
    label:        "Markets",
    iconActive:   "globe",
    iconInactive: "globe-outline",
  },
  {
    name:         "trades",
    label:        "Trade",
    iconActive:   "swap-horizontal",
    iconInactive: "swap-horizontal-outline",
  },
  {
    name:         "charts",
    label:        "Charts",
    iconActive:   "bar-chart",
    iconInactive: "bar-chart-outline",
  },
  {
    name:         "alerts",
    label:        "Alerts",
    iconActive:   "notifications",
    iconInactive: "notifications-outline",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tab label — respects active/inactive font weight difference
//
// MobileBottomNav:
//   active   fontWeight: 600, letterSpacing: "0.04em"
//   inactive fontWeight: 400, letterSpacing: "0.01em"
// ─────────────────────────────────────────────────────────────────────────────

function makeTabLabel(palette: TabPalette) {
  return function TabLabel({
    focused,
    color,
    children,
  }: {
    focused:  boolean;
    color:    string;
    children: React.ReactNode;
  }) {
    // colour is already controlled by tabBarActiveTintColor / tabBarInactiveTintColor;
    // override here for explicit label-specific colour from palette.
    const labelColor = focused ? palette.activeLabel : palette.inactiveLabel;
    return (
      <Text
        style={[
          styles.tabLabel,
          {
            color:          labelColor,
            fontWeight:     focused ? "600" : "400",
            letterSpacing:  focused ? 0.4  : 0.1,
            fontFamily:     focused
              ? "Inter_600SemiBold"
              : "Inter_400Regular",
          },
        ]}
        numberOfLines={1}
      >
        {children}
      </Text>
    );
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout component
// ─────────────────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const { theme }  = useTheme();
  const insets     = useSafeAreaInsets();
  const palette    = theme === "light" ? LIGHT_PALETTE : DARK_PALETTE;

  // Safe-area bottom padding mirrors MobileBottomNav:
  //   paddingBottom: `calc(10px + env(safe-area-inset-bottom, 0px))`
  const safePaddingBottom = Math.max(insets.bottom, 10);
  const totalTabBarHeight = TAB_BAR_HEIGHT + safePaddingBottom;

  // Shared label renderer — avoids re-creating the component on every render
  const TabLabel = React.useMemo(() => makeTabLabel(palette), [palette]);

  // ── Badge count for Alerts ─────────────────────────────────────────────
  // TODO (future phase): wire to NotificationsContext once migrated.
  //   import { useNotifications } from "@/contexts/NotificationsContext";
  //   const { unreadCount } = useNotifications();
  const alertBadgeCount = 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        // ── Tab bar appearance ─────────────────────────────────────────────
        tabBarStyle: {
          backgroundColor:  palette.tabBarBg,
          borderTopWidth:   StyleSheet.hairlineWidth,
          borderTopColor:   palette.borderTop,
          height:           totalTabBarHeight,
          paddingBottom:    safePaddingBottom,
          paddingTop:       4,
          // iOS shadow (mirrors wrapperShadow dark: "0 12px 40px rgba(0,0,0,0.65)")
          shadowColor:      palette.shadowColor,
          shadowOffset:     { width: 0, height: -4 },
          shadowOpacity:    palette.shadowOpacity,
          shadowRadius:     20,
          // Android elevation
          elevation:        palette.elevation,
        },

        // ── Icon colours ───────────────────────────────────────────────────
        tabBarActiveTintColor:   palette.activeIcon,
        tabBarInactiveTintColor: palette.inactiveIcon,

        // ── Label ─────────────────────────────────────────────────────────
        tabBarLabel: TabLabel,

        // ── Item layout ────────────────────────────────────────────────────
        tabBarItemStyle: {
          paddingVertical: 4,
        },

        // Dismiss keyboard when switching tabs
        tabBarHideOnKeyboard: true,
      }}
    >
      {TABS.map((tab) => {
        const isAlerts = tab.name === "alerts";

        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.label,

              // ── Icon ────────────────────────────────────────────────────
              tabBarIcon: ({
                focused,
                color,
              }: {
                focused: boolean;
                color:   string;
                size:    number;
              }) => (
                <Ionicons
                  name={focused ? tab.iconActive : tab.iconInactive}
                  // Fixed 22px mirrors MobileBottomNav icon width/height: 22
                  size={22}
                  color={color}
                />
              ),

              // ── Badge (Alerts only) ──────────────────────────────────────
              // Mirrors: badge = isAlerts && unreadCount > 0 ? unreadCount : 0
              ...(isAlerts && alertBadgeCount > 0
                ? {
                    tabBarBadge:      alertBadgeCount > 99 ? "99+" : alertBadgeCount,
                    tabBarBadgeStyle: {
                      backgroundColor: palette.badgeBg,
                      // Mirror badge font from MobileBottomNav:
                      //   fontSize: 8, fontWeight: 700
                      fontSize:   8,
                      fontWeight: "700" as const,
                      minWidth:   14,
                      height:     14,
                      // RN doesn't support box-shadow on badge; elevation used instead
                      ...(Platform.OS === "android" ? { elevation: 2 } : {}),
                    },
                  }
                : {}),
            }}
          />
        );
      })}
    </Tabs>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabLabel: {
    fontSize:  10,
    lineHeight: 14,
    // fontFamily and fontWeight are set inline (dynamic per focused state)
  },
});
