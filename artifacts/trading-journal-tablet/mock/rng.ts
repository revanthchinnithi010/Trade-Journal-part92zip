/**
 * Deterministic seeded PRNG (mulberry32) — React Native port of src/mock/rng.ts
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * None. All APIs used (Math.imul, bitwise ops, unsigned right-shift) are
 * standard ECMAScript and are fully supported by the Hermes engine.
 *
 * Seeded behaviour is preserved verbatim — identical seed → identical output
 * on every reload, on every platform.
 */

// Deterministic seeded PRNG (mulberry32) so mock data is identical on every
// reload — required by the "deterministic mock data" requirement.
export function createRng(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function range(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}
