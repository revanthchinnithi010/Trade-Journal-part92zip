/**
 * app/(tabs)/alerts.tsx — Alerts tab stub
 *
 * Structural placeholder for the Alerts screen.
 * Actual content will be migrated in a future phase.
 *
 * Web equivalent: artifacts/trading-journal/src/pages/alerts.tsx
 *
 * Badge wiring:
 *   The Alerts tab badge is driven by `unreadCount` from NotificationsContext
 *   in the web app. Badge count is managed in the parent (tabs)/_layout.tsx
 *   via `tabBarBadge`. This screen does not need to do anything for the badge.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Alerts</Text>
      <Text style={styles.subtitle}>Migration in progress</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05070A",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    color: "#EDF0F6",
    fontSize: 20,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    color: "rgba(148,163,184,0.60)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
