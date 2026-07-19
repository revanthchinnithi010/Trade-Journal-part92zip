/**
 * resizable.tsx — React Native port
 *
 * Web source: react-resizable-panels (ResizablePrimitive)
 *
 * WHY RESIZE IS REMOVED:
 *   react-resizable-panels is a DOM-only library that relies on:
 *   - Mouse/pointer drag events
 *   - CSS resize handles
 *   - getBoundingClientRect / ResizeObserver
 *   None of these exist in React Native.
 *
 *   On mobile, panels have fixed or flex-based sizing. If dynamic layout is
 *   needed, use a draggable divider with PanResponder or Reanimated gesture
 *   in the specific screen that requires it.
 *
 * Preserved API:
 *   ResizablePanelGroup  — horizontal/vertical flex View
 *   ResizablePanel       — flex child View (defaultSize → flex ratio)
 *   ResizableHandle      — thin visual divider, no drag behaviour
 *
 * Props accepted for API compat (no-op in RN):
 *   PanelGroup: onLayout, storage, autoSaveId
 *   Panel: defaultSize, minSize, maxSize, id, order, collapsible,
 *          collapsedSize, onCollapse, onExpand, onResize, tagName
 *   Handle: withHandle, hitAreaMargins
 */

import * as React from "react";
import { View, type ViewProps } from "react-native";

import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PanelGroupDirection = "horizontal" | "vertical";

export interface ResizablePanelGroupProps extends Omit<ViewProps, "onLayout"> {
  direction: PanelGroupDirection;
  className?: string;
  /** API compat — the react-resizable-panels signature; ignored in RN */
  onLayout?: ((sizes: number[]) => void) | ViewProps["onLayout"];
  autoSaveId?: string;
  storage?: unknown;
  id?: string;
}

export interface ResizablePanelProps extends ViewProps {
  /** Maps to flex value: defaultSize / 100. e.g. defaultSize=30 → flex 0.3 */
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  id?: string;
  order?: number;
  collapsible?: boolean;
  collapsedSize?: number;
  onCollapse?: () => void;
  onExpand?: () => void;
  onResize?: (size: number, prevSize: number | undefined) => void;
  tagName?: string;
  className?: string;
}

export interface ResizableHandleProps extends ViewProps {
  /** When true renders a visible grip indicator */
  withHandle?: boolean;
  /** API compat — ignored in RN */
  hitAreaMargins?: { coarse?: number; fine?: number };
  id?: string;
  className?: string;
}

// ─── ResizablePanelGroup ──────────────────────────────────────────────────────

const ResizablePanelGroup = React.forwardRef<View, ResizablePanelGroupProps>(
  (
    {
      className,
      direction,
      onLayout: _onLayout,
      autoSaveId: _ai,
      storage: _s,
      children,
      ...props
    },
    ref,
  ) => (
    <View
      ref={ref}
      className={cn(
        "flex h-full w-full",
        direction === "vertical" ? "flex-col" : "flex-row",
        className,
      )}
      {...props}
    >
      {children}
    </View>
  ),
);
ResizablePanelGroup.displayName = "ResizablePanelGroup";

// ─── ResizablePanel ───────────────────────────────────────────────────────────

const ResizablePanel = React.forwardRef<View, ResizablePanelProps>(
  (
    {
      className,
      defaultSize,
      minSize: _min,
      maxSize: _max,
      id: _id,
      order: _ord,
      collapsible: _col,
      collapsedSize: _cs,
      onCollapse: _oc,
      onExpand: _oe,
      onResize: _or,
      tagName: _tag,
      children,
      style,
      ...props
    },
    ref,
  ) => {
    // Convert defaultSize (0–100 percentage) to a flex ratio
    const flex = defaultSize !== undefined ? defaultSize / 100 : 1;

    return (
      <View
        ref={ref}
        style={[{ flex }, style instanceof Object ? style : undefined]}
        className={cn("overflow-hidden", className)}
        {...props}
      >
        {children}
      </View>
    );
  },
);
ResizablePanel.displayName = "ResizablePanel";

// ─── ResizableHandle ──────────────────────────────────────────────────────────
// Visual divider only — no drag interaction in RN.

const ResizableHandle = React.forwardRef<View, ResizableHandleProps>(
  ({ className, withHandle, hitAreaMargins: _h, id: _id, ...props }, ref) => (
    <View
      ref={ref}
      className={cn(
        "relative flex items-center justify-center bg-border",
        // Vertical group → horizontal line; Horizontal group → vertical line
        "w-px self-stretch",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <View className="z-10 h-4 w-3 items-center justify-center rounded-sm border border-border bg-border">
          <View className="h-3 w-0.5 rounded-full bg-muted-foreground/50" />
        </View>
      )}
    </View>
  ),
);
ResizableHandle.displayName = "ResizableHandle";

// ─── Exports ──────────────────────────────────────────────────────────────────

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
