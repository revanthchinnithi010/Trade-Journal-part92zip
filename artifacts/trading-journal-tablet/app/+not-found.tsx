import { Feather } from "@expo/vector-icons";
import { Link, Stack } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

// ─────────────────────────────────────────────────────────────────────────────
// 404 — Not Found
//
// Shown by Expo Router whenever no route matches the current URL/path.
// Matches the dark theme and typography of the rest of the app.
// ─────────────────────────────────────────────────────────────────────────────

export default function NotFoundScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  return (
    <>
      {/* Suppress the default Expo Router header — we own the whole screen. */}
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.background,
            paddingTop:    insets.top    + 24,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        {/* Icon */}
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather
            name="compass"
            size={40}
            color={colors.mutedForeground}
          />
        </View>

        {/* Numeric code */}
        <Text style={[styles.code, { color: colors.mutedForeground }]}>
          404
        </Text>

        {/* Heading */}
        <Text style={[styles.heading, { color: colors.foreground }]}>
          Page not found
        </Text>

        {/* Subtitle */}
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          The screen you&apos;re looking for doesn&apos;t exist or has been
          moved.
        </Text>

        {/* CTA */}
        <Link href="/" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to home screen"
            style={({ pressed }) => [
              styles.btn,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
                // Android elevation for native shadow
                elevation: 4,
                // iOS shadow
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: Platform.OS === "ios" ? 0.20 : 0,
                shadowRadius: 6,
              },
            ]}
          >
            <Feather
              name="home"
              size={16}
              color={colors.primaryForeground}
              style={styles.btnIcon}
            />
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
              Go to home
            </Text>
          </Pressable>
        </Link>
      </View>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  code: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  heading: {
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 34,
  },
  sub: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
    marginTop: 4,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    minWidth: 180,
    marginTop: 16,
    gap: 8,
  },
  btnIcon: {
    // gap handled above; this just ensures no extra margin
  },
  btnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
