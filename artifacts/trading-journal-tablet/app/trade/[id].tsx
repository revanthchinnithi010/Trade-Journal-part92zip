/**
 * app/trade/[id].tsx — Trade Detail Screen (stub)
 *
 * React Native port of artifacts/trading-journal/src/pages/trade.tsx
 *
 * The web source is an explicit "Coming soon" placeholder. This file
 * mirrors that exactly — no business logic, no data fetching.
 *
 * Full trade detail is displayed inline inside the Trades tab via
 * TradeDetailModal (see app/(tabs)/trades.tsx).
 */

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TradeDetailScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Text style={styles.headerTitle}>Trade Details</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Coming soon placeholder — matches web trade.tsx exactly */}
      <View style={styles.body}>
        <Ionicons name="grid-outline" size={48} color="rgba(148,163,184,0.35)" />
        <Text style={styles.label}>Trade Panel</Text>
        <Text style={styles.sub}>Coming soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: "500",
    color: "rgba(148,163,184,0.5)",
    fontFamily: "Inter_500Medium",
  },
  sub: {
    fontSize: 12,
    color: "rgba(148,163,184,0.35)",
    fontFamily: "Inter_400Regular",
  },
});
