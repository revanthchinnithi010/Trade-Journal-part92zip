/**
 * app/(tabs)/markets.tsx — Markets tab stub
 *
 * Structural placeholder for the Markets / Watchlist screen.
 * Actual content will be migrated in a future phase.
 *
 * Web equivalent: artifacts/trading-journal/src/pages/markets.tsx
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function MarketsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Markets</Text>
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
