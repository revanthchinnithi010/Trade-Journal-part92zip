/**
 * chart.tsx — React Native typed placeholder
 *
 * Web source: recharts (ResponsiveContainer, Tooltip, Legend, etc.)
 *
 * TODO: Rebuild after Phase 9/10 chart engine decision.
 *       recharts is a DOM-only library and cannot run on React Native / Hermes.
 *       Candidate replacements: victory-native, react-native-chart-kit,
 *       react-native-gifted-charts, or a custom SVG/Skia solution.
 *
 * This file preserves ALL public exports from the web chart.tsx so that
 * consumers compile without modification.  Every exported component renders
 * a labelled placeholder View in development and null in production.
 *
 * Preserved exports:
 *   ChartConfig (type)
 *   ChartContainer
 *   ChartTooltip
 *   ChartTooltipContent
 *   ChartLegend
 *   ChartLegendContent
 *   ChartStyle
 *   useChart (hook)
 */

import * as React from "react";
import { Text, View, type ViewProps } from "react-native";

// ─── ChartConfig (type) ───────────────────────────────────────────────────────

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<"light" | "dark", string> }
  );
};

// ─── Chart context ────────────────────────────────────────────────────────────

interface ChartContextProps {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextProps | null>(null);

export function useChart(): ChartContextProps {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error("useChart must be used within a <ChartContainer />");
  return ctx;
}

// ─── Placeholder renderer ─────────────────────────────────────────────────────

function Placeholder({ label }: { label: string }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <View className="items-center justify-center bg-muted/30 rounded-md p-4 border border-dashed border-border">
      <Text className="text-xs text-muted-foreground text-center">
        {`[${label}]\nTODO: Rebuild in Phase 9/10 after chart engine decision`}
      </Text>
    </View>
  );
}

// ─── ChartContainer ───────────────────────────────────────────────────────────

export interface ChartContainerProps extends ViewProps {
  config: ChartConfig;
  children?: React.ReactNode;
  id?: string;
}

const ChartContainer = React.forwardRef<View, ChartContainerProps>(
  ({ config, className, children: _children, id: _id, ...props }, ref) => (
    <ChartContext.Provider value={{ config }}>
      <View
        ref={ref}
        accessibilityRole="none"
        accessibilityLabel="Chart (not yet implemented)"
        {...props}
      >
        <Placeholder label="ChartContainer" />
      </View>
    </ChartContext.Provider>
  ),
);
ChartContainer.displayName = "Chart";

// ─── ChartStyle ───────────────────────────────────────────────────────────────

function ChartStyle({ id: _id, config: _config }: { id: string; config: ChartConfig }) {
  // No-op: CSS style injection is DOM-only.
  // Color tokens should be applied via NativeWind / inline styles in Phase 9/10.
  return null;
}

// ─── ChartTooltip ─────────────────────────────────────────────────────────────

export interface ChartTooltipProps {
  active?: boolean;
  payload?: unknown[];
  label?: unknown;
  content?: React.ReactNode;
  [key: string]: unknown;
}

function ChartTooltip(_props: ChartTooltipProps) {
  // Tooltips require a real chart engine; placeholder only.
  return null;
}

// ─── ChartTooltipContent ──────────────────────────────────────────────────────

export interface ChartTooltipContentProps extends ViewProps {
  active?: boolean;
  payload?: unknown[];
  label?: unknown;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: "line" | "dot" | "dashed";
  nameKey?: string;
  labelKey?: string;
  formatter?: unknown;
  labelFormatter?: unknown;
  labelClassName?: string;
  color?: string;
}

const ChartTooltipContent = React.forwardRef<View, ChartTooltipContentProps>(
  (_props, _ref) => null,
);
ChartTooltipContent.displayName = "ChartTooltip";

// ─── ChartLegend ──────────────────────────────────────────────────────────────

export interface ChartLegendProps {
  payload?: unknown[];
  verticalAlign?: "top" | "middle" | "bottom";
  content?: React.ReactNode;
  [key: string]: unknown;
}

function ChartLegend(_props: ChartLegendProps) {
  return null;
}

// ─── ChartLegendContent ───────────────────────────────────────────────────────

export interface ChartLegendContentProps extends ViewProps {
  hideIcon?: boolean;
  payload?: unknown[];
  verticalAlign?: "top" | "bottom";
  nameKey?: string;
}

const ChartLegendContent = React.forwardRef<View, ChartLegendContentProps>(
  (_props, _ref) => null,
);
ChartLegendContent.displayName = "ChartLegend";

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};
