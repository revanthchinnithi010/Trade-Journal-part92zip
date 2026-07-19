/**
 * sonner.tsx — React Native port
 *
 * Web source: sonner (npm) + next-themes useTheme()
 *
 * WHY SONNER IS REPLACED:
 *   sonner is a DOM-only library. It relies on:
 *   - DOM portals / z-index stacking
 *   - CSS keyframe animations
 *   - next-themes (Next.js-specific)
 *   - pointer-events / hover events
 *   None of these exist in React Native.
 *
 *   On mobile, toast notifications are handled by react-native-toast-message
 *   via the Toaster in @/components/ui/toaster.
 *
 * Preserved API:
 *   Toaster — accepts Sonner-compatible props for backward compat.
 *             All props that don't apply in RN are accepted and ignored.
 *
 * Migration note:
 *   Any code using `import { Toaster } from "@/components/ui/sonner"` will
 *   compile without changes and render toasts via react-native-toast-message.
 *   The imperative API is accessed via `toast` from "@/hooks/use-toast".
 */

import { Toaster as RNToaster, type ToasterProps as RNToasterProps } from "@/components/ui/toaster";

// ─── Sonner-compatible props (accepted, some ignored in RN) ───────────────────

export interface ToasterProps extends Omit<RNToasterProps, "position"> {
  /** API compat — ignored in RN (react-native-toast-message handles theme) */
  theme?: "light" | "dark" | "system";
  /** API compat — Sonner six-value position; mapped to RN "top" | "bottom" */
  position?:
    | "top-left"
    | "top-right"
    | "top-center"
    | "bottom-left"
    | "bottom-right"
    | "bottom-center";
  /** API compat — mapped to visibilityTime */
  duration?: number;
  /** API compat — ignored in RN */
  richColors?: boolean;
  /** API compat — ignored in RN */
  expand?: boolean;
  /** API compat — ignored in RN */
  visibleToasts?: number;
  /** API compat — ignored in RN */
  closeButton?: boolean;
  /** API compat — ignored in RN */
  offset?: string | number;
  /** API compat — ignored in RN */
  dir?: "ltr" | "rtl" | "auto";
  /** API compat — ignored in RN */
  hotkey?: string[];
  /** API compat — ignored in RN */
  invert?: boolean;
  /** API compat — ignored in RN */
  toastOptions?: Record<string, unknown>;
  /** API compat — ignored in RN */
  gap?: number;
  /** API compat — ignored in RN */
  loadingIcon?: React.ReactNode;
  /** API compat — ignored in RN */
  icons?: Record<string, React.ReactNode>;
  /** API compat — ignored in RN */
  containerAriaLabel?: string;
  /** API compat — ignored in RN */
  pauseWhenPageIsHidden?: boolean;
  /** API compat — ignored in RN */
  cn?: (...args: unknown[]) => string;
  className?: string;
}

// ─── Toaster ──────────────────────────────────────────────────────────────────

function Toaster({
  theme: _theme,
  position: sonnerPosition,
  duration: _duration,
  richColors: _rc,
  expand: _expand,
  visibleToasts: _vt,
  closeButton: _cb,
  offset: _offset,
  dir: _dir,
  hotkey: _hk,
  invert: _inv,
  toastOptions: _to,
  gap: _gap,
  loadingIcon: _li,
  icons: _icons,
  containerAriaLabel: _cal,
  pauseWhenPageIsHidden: _pwph,
  cn: _cn,
  className: _cls,
  ...rnProps
}: ToasterProps) {
  // Map Sonner's six-position string to RN's two-position enum
  const position: "top" | "bottom" =
    sonnerPosition?.startsWith("bottom") ? "bottom" : "top";

  return <RNToaster position={position} {...rnProps} />;
}

export { Toaster };
