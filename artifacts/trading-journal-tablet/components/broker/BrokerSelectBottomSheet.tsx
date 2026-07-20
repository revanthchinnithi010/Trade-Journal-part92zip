/**
 * BrokerSelectBottomSheet — React Native port of
 *   src/components/broker/BrokerSelectModal.tsx
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. Modal overlay + full-screen page → @gorhom/bottom-sheet BottomSheetModal.
 *    The web has MobileBrokerSelectPage and DesktopBrokerSelectModal.
 *    On the tablet there is one presentation: a BottomSheetModal that opens when
 *    the store's `showSelectModal` flag is true.  Snap point ["70%", "92%"].
 *
 * 2. HTML elements → RN: div→View, span→Text, button→Pressable, p→Text,
 *    scrollable div→BottomSheetScrollView.
 *
 * 3. CSS / Tailwind → StyleSheet (all layout and color values preserved exactly).
 *
 * 4. Lucide icons → Ionicons (@expo/vector-icons):
 *    X→close, Plug→link-outline, ChevronLeft→chevron-back,
 *    CheckCircle2→checkmark-circle, AlertCircle→alert-circle,
 *    Loader2→ActivityIndicator, Wifi→wifi-outline, WifiOff→wifi-off-outline,
 *    RefreshCw→refresh-outline, Trash2→trash-outline.
 *
 * 5. broker.image/logo → BrokerLogo component (handles image + text fallback).
 *
 * 6. -webkit-line-clamp → numberOfLines={2} on Text.
 *
 * 7. touchAction: "manipulation" → no-op (RN has no touchAction).
 *    onTouchStart/onTouchEnd color flash → Pressable pressed state.
 *
 * 8. useIsMobile → removed.
 *
 * All business logic preserved exactly:
 *   - BrokerListContent: BROKERS.map, connectedAccounts, brokerStatuses,
 *     savedAccounts per broker, connect/disconnect, deleteAccount, openAuthModal,
 *     onConnectBroker optional override, connected broker count summary,
 *     Disconnect All action.
 *   - loadAccounts() on mount (useEffect).
 *   - openSelectModal / closeSelectModal store actions.
 *   - StatusBadge: connected/connecting/disconnected/error states.
 *
 * Exports:
 *   BrokerListContent          — exported for embedding in other screens (web parity)
 *   BrokerSelectBottomSheet    — main export
 */

import { useEffect, useRef, useCallback, useMemo, memo } from "react";
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { BrokerLogo } from "@/components/broker/BrokerLogos";
import { BROKERS } from "@/types/broker";
import { useBrokerStore } from "@/store/brokerStore";
import type { ConnectionStatus } from "@/types/broker";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_BADGE_CONFIG: Record<
  ConnectionStatus,
  { label: string; color: string; bg: string; iconName: React.ComponentProps<typeof Ionicons>["name"] }
> = {
  connected:    { label: "Connected",    color: "#22C55E",              bg: "rgba(34,197,94,0.12)",   iconName: "checkmark-circle"    },
  connecting:   { label: "Connecting…",  color: "#F59E0B",              bg: "rgba(245,158,11,0.12)",  iconName: "sync-outline"        },
  disconnected: { label: "Disconnected", color: "rgba(167,184,169,0.5)", bg: "rgba(255,255,255,0.05)", iconName: "remove-circle-outline" },
  error:        { label: "Error",        color: "#EF4444",              bg: "rgba(239,68,68,0.12)",   iconName: "alert-circle-outline" },
};

const StatusBadge = memo(function StatusBadge({ status }: { status: ConnectionStatus }) {
  const cfg = STATUS_BADGE_CONFIG[status] ?? {
    label: status, color: "rgba(167,184,169,0.5)", bg: "rgba(255,255,255,0.05)", iconName: "wifi-outline" as const,
  };

  return (
    <View
      style={[
        styles.statusBadge,
        { backgroundColor: cfg.bg, borderColor: cfg.color + "33" },
      ]}
    >
      {status === "connecting" ? (
        <ActivityIndicator size={10} color={cfg.color} />
      ) : (
        <Ionicons name={cfg.iconName} size={11} color={cfg.color} />
      )}
      <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
});

// ── Main broker list content ──────────────────────────────────────────────────

export interface BrokerListContentProps {
  onClose: () => void;
  /**
   * Optional override for the "Connect X" / "Add Another Account" button.
   * When provided, this is called instead of openAuthModal so that callers
   * (e.g. BrokerIntegrationModal) can handle navigation internally.
   */
  onConnectBroker?: (brokerId: string) => void;
}

export function BrokerListContent({ onClose, onConnectBroker }: BrokerListContentProps) {
  const {
    accounts, connect, deleteAccount, openAuthModal,
    connectedAccounts, brokerStatuses, disconnectBroker,
  } = useBrokerStore();

  return (
    <View style={styles.listContent}>
      {BROKERS.map(broker => {
        const connectedAccount = connectedAccounts[broker.id];
        const status: ConnectionStatus = brokerStatuses[broker.id] ?? "disconnected";
        const isConnected  = !!connectedAccount;
        const isConnecting = status === "connecting";

        const savedAccounts = accounts.filter(a => a.broker_id === broker.id);

        return (
          <View
            key={broker.id}
            style={[
              styles.brokerCard,
              isConnected ? styles.brokerCardConnected : styles.brokerCardIdle,
            ]}
          >
            {/* Broker header row */}
            <View style={styles.brokerHeader}>
              {/* Logo */}
              <View
                style={[
                  styles.brokerLogoWrap,
                  {
                    backgroundColor: broker.image ? "transparent" : broker.color + "22",
                    shadowColor:     isConnected ? broker.color : "transparent",
                  },
                ]}
              >
                <BrokerLogo brokerId={broker.id} size={40} />
              </View>

              {/* Name + description + status */}
              <View style={styles.brokerInfo}>
                <View style={styles.brokerNameRow}>
                  <Text style={styles.brokerNameText} numberOfLines={1}>
                    {broker.name}
                  </Text>
                  <StatusBadge status={status} />
                </View>
                <Text style={styles.brokerDescText} numberOfLines={2}>
                  {broker.description}
                </Text>
              </View>
            </View>

            {/* Connected account info + actions */}
            {isConnected && connectedAccount && (
              <View style={styles.connectedRow}>
                <Text style={styles.activeLabel} numberOfLines={1}>
                  Active:{" "}
                  <Text style={styles.activeName}>
                    {connectedAccount.label || "Account"}
                  </Text>
                </Text>
                <Pressable
                  onPress={() => disconnectBroker(broker.id)}
                  style={({ pressed }) => [styles.disconnectBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="stop-circle-outline" size={11} color="#EF4444" />
                  <Text style={styles.disconnectBtnText}>Disconnect</Text>
                </Pressable>
              </View>
            )}

            {/* Error state */}
            {!isConnected && status === "error" && (
              <View style={styles.errorRow}>
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={13} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                  <Text style={styles.errorText}>
                    Connection error — check credentials
                  </Text>
                </View>
              </View>
            )}

            {/* Saved accounts list + add button (when not connected or connecting) */}
            {!isConnected && !isConnecting && (
              <View style={styles.savedAccountsSection}>
                {savedAccounts.length > 0 && (
                  <View style={styles.savedAccountsList}>
                    {savedAccounts.map(acc => (
                      <View key={acc.id} style={styles.savedAccountRow}>
                        <Text style={styles.savedAccountLabel} numberOfLines={1}>
                          {acc.label || "Account"}
                        </Text>
                        <Pressable
                          onPress={() => { connect(acc); onClose(); }}
                          style={({ pressed }) => [styles.connectSmallBtn, pressed && { opacity: 0.7 }]}
                        >
                          <Text style={styles.connectSmallBtnText}>Connect</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => deleteAccount(acc.id)}
                          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
                          hitSlop={8}
                        >
                          <Ionicons name="trash-outline" size={12} color="rgba(239,68,68,0.55)" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

                <Pressable
                  onPress={() => {
                    if (onConnectBroker) onConnectBroker(broker.id);
                    else openAuthModal(broker.id as import("@/types/broker").BrokerId);
                  }}
                  style={({ pressed }) => [
                    styles.addAccountBtn,
                    { marginTop: savedAccounts.length > 0 ? 0 : 10 },
                    pressed && { backgroundColor: "rgba(183,255,90,0.15)" },
                  ]}
                >
                  <Text style={styles.addAccountPlus}>+</Text>
                  <Text style={styles.addAccountText}>
                    {savedAccounts.length > 0 ? "Add Another Account" : `Connect ${broker.name}`}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Connecting spinner */}
            {isConnecting && (
              <View style={styles.connectingRow}>
                <ActivityIndicator size="small" color="#F59E0B" />
                <Text style={styles.connectingText}>Establishing connection…</Text>
              </View>
            )}
          </View>
        );
      })}

      {/* Connected broker count summary */}
      {Object.keys(connectedAccounts).length > 0 && (
        <View style={styles.summaryRow}>
          <Ionicons name="wifi-outline" size={13} color="#22C55E" style={{ flexShrink: 0 }} />
          <Text style={styles.summaryText}>
            <Text style={styles.summaryCount}>
              {Object.keys(connectedAccounts).length}
            </Text>
            {" "}broker{Object.keys(connectedAccounts).length !== 1 ? "s" : ""} connected
          </Text>
          <Pressable
            onPress={() => useBrokerStore.getState().disconnectAll()}
            style={({ pressed }) => [styles.disconnectAllBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.disconnectAllText}>Disconnect All</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Main bottom sheet ─────────────────────────────────────────────────────────

export function BrokerSelectBottomSheet() {
  const { showSelectModal, closeSelectModal, loadAccounts } = useBrokerStore();

  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints     = useMemo(() => ["70%", "92%"], []);

  // Load accounts when the sheet opens
  useEffect(() => {
    if (showSelectModal) {
      loadAccounts();
    }
  }, [showSelectModal, loadAccounts]);

  // Bridge store flag → imperative present/dismiss
  useEffect(() => {
    if (showSelectModal) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [showSelectModal]);

  const handleDismiss = useCallback(() => {
    closeSelectModal();
  }, [closeSelectModal]);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.72}
      pressBehavior="close"
    />
  ), []);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      index={1}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      {/* Header */}
      <View style={styles.sheetHeader}>
        <Ionicons name="link-outline" size={16} color="#B7FF5A" />
        <Text style={styles.sheetTitle}>Connect Brokers</Text>
        <Pressable
          onPress={closeSelectModal}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Ionicons name="close" size={18} color="rgba(167,184,169,0.6)" />
        </Pressable>
      </View>

      <BottomSheetScrollView contentContainerStyle={styles.scrollContent}>
        <BrokerListContent onClose={closeSelectModal} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Sheet ──────────────────────────────────────────────────────────────────
  sheetBackground: {
    backgroundColor:       "#0B1017",
    borderTopLeftRadius:   20,
    borderTopRightRadius:  20,
    borderWidth:  1,
    borderColor:  "rgba(255,255,255,0.08)",
  },
  handleIndicator: {
    backgroundColor: "rgba(255,255,255,0.18)",
    width: 40,
  },
  sheetHeader: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               8,
    paddingHorizontal: 20,
    paddingVertical:   16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(57,91,67,0.15)",
  },
  sheetTitle: {
    flex:       1,
    fontSize:   15,
    fontWeight: "700",
    color:      "#fff",
  },
  closeBtn: {
    padding:    4,
    flexShrink: 0,
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // ── List content ───────────────────────────────────────────────────────────
  listContent: {
    padding: 12,
    gap:     10,
  },

  // ── Broker card ────────────────────────────────────────────────────────────
  brokerCard: {
    borderRadius:  16,
    borderWidth:   1,
    overflow:      "hidden",
  },
  brokerCardConnected: {
    borderColor:     "rgba(34,197,94,0.25)",
    backgroundColor: "rgba(34,197,94,0.04)",
  },
  brokerCardIdle: {
    borderColor:     "rgba(57,91,67,0.2)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  brokerHeader: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           12,
    padding:       14,
  },
  brokerLogoWrap: {
    width:          40,
    height:         40,
    borderRadius:   12,
    flexShrink:     0,
    alignItems:     "center",
    justifyContent: "center",
    overflow:       "hidden",
    shadowOffset:   { width: 0, height: 0 },
    shadowOpacity:  0.3,
    shadowRadius:   7,
  },
  brokerInfo: {
    flex:    1,
    minWidth: 0,
  },
  brokerNameRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
    flexWrap:      "wrap",
    marginBottom:  3,
  },
  brokerNameText: {
    fontSize:   13,
    fontWeight: "700",
    color:      "#fff",
  },

  brokerDescText: {
    fontSize:  11,
    color:     "rgba(167,184,169,0.55)",
    lineHeight: 15,
  },

  // ── Status badge ───────────────────────────────────────────────────────────
  statusBadge: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               4,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      20,
    borderWidth:       1,
  },
  statusBadgeText: {
    fontSize:   10,
    fontWeight: "600",
  },

  // ── Connected row ──────────────────────────────────────────────────────────
  connectedRow: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             8,
    flexWrap:        "wrap",
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderTopWidth:   1,
    borderTopColor:   "rgba(34,197,94,0.12)",
  },
  activeLabel: {
    fontSize: 11,
    color:    "rgba(255,255,255,0.55)",
    flex:     1,
    minWidth: 0,
  },
  activeName: {
    color:      "#fff",
    fontWeight: "600",
  },
  disconnectBtn: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               5,
    height:            30,
    paddingHorizontal: 12,
    borderRadius:      8,
    backgroundColor:   "rgba(239,68,68,0.1)",
    borderWidth:       1,
    borderColor:       "rgba(239,68,68,0.2)",
    flexShrink:        0,
  },
  disconnectBtnText: {
    fontSize:   11,
    fontWeight: "600",
    color:      "#EF4444",
  },

  // ── Error row ──────────────────────────────────────────────────────────────
  errorRow: {
    paddingHorizontal: 14,
    paddingBottom:     12,
    borderTopWidth:    1,
    borderTopColor:    "rgba(239,68,68,0.15)",
  },
  errorBox: {
    flexDirection:     "row",
    alignItems:        "flex-start",
    gap:               8,
    paddingHorizontal: 10,
    paddingVertical:   8,
    borderRadius:      10,
    backgroundColor:   "rgba(239,68,68,0.08)",
    borderWidth:       1,
    borderColor:       "rgba(239,68,68,0.15)",
    marginTop:         10,
  },
  errorText: {
    fontSize:  11,
    color:     "#EF4444",
    lineHeight: 15,
  },

  // ── Saved accounts ─────────────────────────────────────────────────────────
  savedAccountsSection: {
    paddingHorizontal: 14,
    paddingBottom:     12,
    borderTopWidth:    1,
    borderTopColor:    "rgba(57,91,67,0.1)",
  },
  savedAccountsList: {
    gap:       6,
    marginTop: 10,
    marginBottom: 10,
  },
  savedAccountRow: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               8,
    paddingHorizontal: 10,
    paddingVertical:   8,
    borderRadius:      10,
    backgroundColor:   "rgba(255,255,255,0.04)",
    borderWidth:       1,
    borderColor:       "rgba(57,91,67,0.15)",
  },
  savedAccountLabel: {
    flex:       1,
    fontSize:   12,
    color:      "rgba(255,255,255,0.75)",
    fontWeight: "500",
    minWidth:   0,
  },
  connectSmallBtn: {
    height:            26,
    paddingHorizontal: 10,
    borderRadius:      7,
    backgroundColor:   "#B7FF5A",
    alignItems:        "center",
    justifyContent:    "center",
    flexShrink:        0,
  },
  connectSmallBtnText: {
    fontSize:   11,
    fontWeight: "600",
    color:      "#07110D",
  },
  deleteBtn: {
    width:          26,
    height:         26,
    borderRadius:   7,
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
  },
  addAccountBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    gap:             6,
    paddingVertical: 9,
    borderRadius:    10,
    backgroundColor: "rgba(183,255,90,0.08)",
    borderWidth:     1,
    borderColor:     "rgba(183,255,90,0.2)",
  },
  addAccountPlus: {
    fontSize:   14,
    lineHeight: 14,
    color:      "#B7FF5A",
    flexShrink: 0,
  },
  addAccountText: {
    fontSize:   12,
    fontWeight: "600",
    color:      "#B7FF5A",
  },

  // ── Connecting spinner row ─────────────────────────────────────────────────
  connectingRow: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               8,
    paddingHorizontal: 18,
    paddingVertical:   12,
    borderTopWidth:    1,
    borderTopColor:    "rgba(245,158,11,0.15)",
  },
  connectingText: {
    fontSize: 12,
    color:    "rgba(245,158,11,0.8)",
  },

  // ── Summary row ────────────────────────────────────────────────────────────
  summaryRow: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               8,
    paddingHorizontal: 12,
    paddingVertical:   9,
    borderRadius:      12,
    backgroundColor:   "rgba(34,197,94,0.06)",
    borderWidth:       1,
    borderColor:       "rgba(34,197,94,0.15)",
    marginTop:         4,
    flexWrap:          "wrap",
  },
  summaryText: {
    fontSize: 11,
    color:    "rgba(255,255,255,0.7)",
    flex:     1,
    minWidth: 0,
  },
  summaryCount: {
    color:      "#22C55E",
    fontWeight: "700",
  },
  disconnectAllBtn: {
    flexShrink:        0,
    paddingHorizontal: 10,
    paddingVertical:   3,
    borderRadius:      6,
    backgroundColor:   "rgba(239,68,68,0.1)",
    borderWidth:       1,
    borderColor:       "rgba(239,68,68,0.15)",
  },
  disconnectAllText: {
    fontSize:   10,
    fontWeight: "600",
    color:      "rgba(239,68,68,0.7)",
  },
});
