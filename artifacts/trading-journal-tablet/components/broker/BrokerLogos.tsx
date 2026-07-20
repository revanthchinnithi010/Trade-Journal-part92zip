/**
 * BrokerLogos — React Native port of src/components/broker/BrokerLogos.tsx
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. <img> → react-native <Image> with URI source.
 *    The broker image paths (e.g. "/broker-delta.png") are web-relative; on RN
 *    they are constructed as absolute URIs via getApiBase().
 *
 * 2. DOM onError mutation → React state-based fallback.
 *    The web onError handler directly mutated the DOM to inject a fallback div.
 *    In RN, <Image onError> sets local `imgError` state; when true, the text
 *    logo fallback View is rendered instead.  Identical user-visible behaviour.
 *
 * 3. div / className → View / Text with inline styles.
 *    The `className` prop is dropped (not applicable in RN).
 *
 * Preserved exactly:
 *   - BrokerLogoProps interface (brokerId, size)
 *   - BROKERS lookup + null guard
 *   - Fallback text logo with broker.color background
 *   - borderRadius = size * 0.2,  fontSize = size * 0.38
 *   - minWidth / minHeight constraints
 *   - memo wrapping
 */

import { memo, useState } from "react";
import { View, Text, Image } from "react-native";
import { BrokerId, BROKERS } from "@/types/broker";
import { getApiBase } from "@/lib/apiBase";

// ── Public props ─────────────────────────────────────────────────────────────

interface BrokerLogoProps {
  brokerId: BrokerId;
  size?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const BrokerLogo = memo(function BrokerLogo({
  brokerId,
  size = 32,
}: BrokerLogoProps) {
  const broker    = BROKERS.find(b => b.id === brokerId);
  const [imgError, setImgError] = useState(false);

  if (!broker) return null;

  const sizeStyle = {
    width:     size,
    height:    size,
    minWidth:  size,
    minHeight: size,
  } as const;

  const borderRadius = Math.round(size * 0.2);
  const fontSize     = Math.round(size * 0.38);

  // ── Image path available and not errored ──────────────────────────────────
  if (broker.image && !imgError) {
    return (
      <Image
        source={{ uri: `${getApiBase()}${broker.image}` }}
        style={sizeStyle}
        onError={() => setImgError(true)}
        resizeMode="cover"
      />
    );
  }

  // ── Text-logo fallback ────────────────────────────────────────────────────
  return (
    <View
      style={[
        sizeStyle,
        {
          borderRadius,
          backgroundColor: broker.color,
          alignItems:      "center",
          justifyContent:  "center",
          flexShrink:      0,
        },
      ]}
    >
      <Text
        style={{
          color:      "#fff",
          fontWeight: "700",
          fontSize,
        }}
      >
        {broker.logo}
      </Text>
    </View>
  );
});
