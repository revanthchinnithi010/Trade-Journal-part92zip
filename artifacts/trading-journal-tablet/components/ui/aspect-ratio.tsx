/**
 * aspect-ratio.tsx — React Native port
 *
 * Web source used @radix-ui/react-aspect-ratio which works via CSS intrinsic
 * sizing. In React Native, the padding-top percentage trick replicates this:
 *   paddingTop = (1 / ratio) * 100 + '%'
 *
 * RN percentage padding is relative to the parent's WIDTH, so a View with
 * paddingTop="56.25%" inside a 100%-wide container produces a 16:9 box.
 * Children are positioned absolutely to fill the reserved space.
 *
 * Preserved API:
 *   ratio?: number   (default 1)
 *   style, children, ...ViewProps  (all forwarded to outer container)
 */

import * as React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

export interface AspectRatioProps extends ViewProps {
  /** Width-to-height ratio. Default: 1 (square). */
  ratio?: number;
}

const AspectRatio = React.forwardRef<View, AspectRatioProps>(
  ({ ratio = 1, style, children, ...props }, ref) => (
    <View ref={ref} style={[styles.root, style]} {...props}>
      {/* Spacer that creates the intrinsic height via padding-top percentage */}
      <View style={{ paddingTop: `${(1 / ratio) * 100}%` }} />
      {/* Content layer fills the full reserved area */}
      <View style={StyleSheet.absoluteFillObject}>
        {children}
      </View>
    </View>
  ),
);
AspectRatio.displayName = "AspectRatio";

const styles = StyleSheet.create({
  root: { width: "100%", position: "relative" },
});

export { AspectRatio };
