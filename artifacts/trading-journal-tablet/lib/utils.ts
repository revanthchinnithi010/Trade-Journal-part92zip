/**
 * Core utilities — React Native port of src/lib/utils.ts
 *
 * Replacements made vs the web original
 * ──────────────────────────────────────
 * cn()
 *   Web:  clsx(inputs) → twMerge(...)
 *         Depends on `clsx` and `tailwind-merge`.  Both are Tailwind/DOM-free
 *         packages but are not installed and have no purpose until NativeWind
 *         is added to the project.
 *   RN:   Inline `cn()` with an identical name and signature.
 *         • Accepts the same ClassValue union (string | number | boolean |
 *           null | undefined | nested arrays) so every call-site migrates
 *           without change.
 *         • Flattens arrays, discards falsy values, joins with a space —
 *           exactly what clsx does.
 *         • No deduplication / conflict-resolution (twMerge behaviour) is
 *           needed without NativeWind; adding the packages later is a
 *           one-line swap here, nothing breaks upstream.
 *
 * formatCurrency() / formatPercentage() / formatNumber()
 *   Web + RN:  Identical — Intl.NumberFormat is fully supported in Hermes
 *              (React Native's JS engine) since RN 0.70.  This project
 *              targets RN 0.81.5, so no polyfill or replacement is required.
 *              No DOM APIs are used by any of these helpers.
 */

// ---------------------------------------------------------------------------
// ClassValue type — mirrors the clsx export so callers need no changes when
// clsx is eventually added as a real dependency.
// ---------------------------------------------------------------------------
export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ClassValue[];

// ---------------------------------------------------------------------------
// cn — className utility (NativeWind-ready)
//
// Identical behaviour to clsx(): flattens nested arrays, drops falsy values,
// returns a single space-separated string.  When NativeWind and tailwind-merge
// are added, replace the body with: return twMerge(clsx(inputs));
// ---------------------------------------------------------------------------
export function cn(...inputs: ClassValue[]): string {
  const result: string[] = [];

  function collect(value: ClassValue): void {
    if (!value && value !== 0) return; // null | undefined | false | ""
    if (typeof value === "string") {
      result.push(value);
    } else if (typeof value === "number") {
      result.push(String(value));
    } else if (Array.isArray(value)) {
      for (const item of value) collect(item);
    }
    // boolean true is intentionally ignored (same as clsx)
  }

  for (const input of inputs) collect(input);
  return result.join(" ");
}

// ---------------------------------------------------------------------------
// formatCurrency
//
// Formats a numeric USD value with a leading minus sign for negatives.
// Intl.NumberFormat is available in Hermes (RN ≥ 0.70) with no polyfill.
// ---------------------------------------------------------------------------
export function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return value < 0 ? `-${formatted}` : formatted;
}

// ---------------------------------------------------------------------------
// formatPercentage
//
// Returns a sign-prefixed percentage string, e.g. "+1.23%" or "-0.50%".
// ---------------------------------------------------------------------------
export function formatPercentage(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// formatNumber
//
// Returns a decimal string rounded to `decimals` places (default 2).
// ---------------------------------------------------------------------------
export function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}
