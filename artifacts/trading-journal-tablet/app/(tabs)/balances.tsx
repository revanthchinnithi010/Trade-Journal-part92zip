/**
 * app/(tabs)/balances.tsx — Balances screen
 *
 * React Native port of src/pages/balances.tsx
 * ─────────────────────────────────────────────
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. wouter useLocation + navigate("/") → Expo Router router.back()
 *    Web: `const [, navigate] = useLocation(); navigate("/")` for the back arrow.
 *    RN:  `router.back()` from expo-router. Behaves identically — pops to the
 *         previous screen in the navigation stack.
 *
 * 2. div flex flex-col h-full (CSS layout) → View flex:1 (RN layout)
 *    The root View is flex:1 which fills the available tab area, matching the
 *    web's h-full on a page mounted with inset:0.
 *
 * 3. Secondary header: div h-56 flex items-center →
 *    View with explicit height:56 and flexDirection:row.
 *    Back arrow, title, and USD/INR toggle are positioned identically.
 *
 * 4. Pressable instead of button (consistent with rest of tablet UI).
 *    active:scale-95 → Pressable's built-in opacity feedback.
 *
 * 5. ArrowLeft → Ionicons arrow-back-outline.
 *
 * 6. div overflow-y-auto scroll area → ScrollView with bounces enabled.
 *    paddingBottom: isMobile ? 80 : 40 → 40 (tablet always non-mobile).
 *    max-w-[1400px] mx-auto → no max-width needed; tablet uses full width.
 *
 * 7. grid grid-cols-1 sm:grid-cols-2 gap-3
 *    → two AccountCards laid out side-by-side in a row (tablet width supports it).
 *    On small screens (portrait mode) they stack vertically. Same as the web's
 *    responsive sm:grid-cols-2 behaviour.
 *
 * 8. AccountCard migrated as @/components/portfolio/AccountCard (Phase 6.6).
 *    useDeltaAccount, useCtraderAccount, useCurrencyStore, CURRENCY_META all
 *    fully ported from previous phases.
 *
 * All business logic preserved exactly:
 *   - deltaAccount from useDeltaAccount()
 *   - ctraderAccount from useCtraderAccount()
 *   - currency/setCurrency from useCurrencyStore()
 *   - Currency toggle: USD ↔ INR on right-side button
 *   - CURRENCY_META[currency].symbol for the toggle label
 *   - back navigation to "/" (root)
 *   - pure-black (#000000) background on the scroll area
 *   - border bottom on the header (#262626)
 */

import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useDeltaAccount } from "@/store/deltaAccountStore";
import { useCtraderAccount } from "@/store/ctraderAccountStore";
import { useCurrencyStore, CURRENCY_META } from "@/store/currencyStore";
import AccountCard from "@/components/portfolio/AccountCard";

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function Balances() {
  const deltaAccount   = useDeltaAccount();
  const ctraderAccount = useCtraderAccount();
  const { currency, setCurrency } = useCurrencyStore();

  return (
    <View style={styles.root}>

      {/* ── Secondary header ── */}
      <View style={styles.header}>
        {/* Back arrow */}
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back-outline" size={20} color="#E8E8E8" />
        </Pressable>

        {/* Title (centred) */}
        <Text style={styles.title}>Balances</Text>

        {/* USD / INR toggle */}
        <Pressable
          onPress={() => setCurrency(currency === "USD" ? "INR" : "USD")}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel={`Switch to ${currency === "USD" ? "INR" : "USD"}`}
        >
          <Text style={styles.currencySymbol}>
            {CURRENCY_META[currency].symbol}
          </Text>
        </Pressable>
      </View>

      {/* ── Scroll area ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* Two AccountCards — side by side on tablet, stacked on narrow portrait */}
        <View style={styles.cardsRow}>
          <View style={styles.cardWrapper}>
            <AccountCard account={deltaAccount}   index={0} />
          </View>
          <View style={styles.cardWrapper}>
            <AccountCard account={ctraderAccount} index={1} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: "#000000",
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    height:            56,
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
    flexShrink:        0,
  },
  headerBtn: {
    width:          32,
    height:         32,
    alignItems:     "center",
    justifyContent: "center",
    borderRadius:   16,
  },
  title: {
    fontSize:   17,
    fontWeight: "600",
    color:      "#F3F3F3",
  },
  currencySymbol: {
    fontSize:   15,
    fontWeight: "700",
    color:      "#E8E8E8",
  },

  // ── Scroll ───────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop:        16,
    paddingBottom:     40,
  },

  // ── Cards ──────────────────────────────────────────────────────────────────
  cardsRow: {
    flexDirection: "row",
    gap:           12,
  },
  cardWrapper: {
    // Exactly matches web's sm:grid-cols-2: each card takes 50% of the row.
    flex: 1,
  },
});
