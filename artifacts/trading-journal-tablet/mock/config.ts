// ─────────────────────────────────────────────────────────────────────────────
// DEV MOCK DATA — single on/off switch
//
// React Native port of src/mock/config.ts
//
// RN compatibility changes vs the web original
// ─────────────────────────────────────────────
// • `import.meta.env.DEV`                    → `__DEV__`
//   __DEV__ is a Metro/Expo global (boolean) that is statically true in
//   development builds and false in production — identical dead-code-
//   elimination semantics to Vite's import.meta.env.DEV.
//
// • `import.meta.env.VITE_DISABLE_MOCK_DATA` → `process.env.EXPO_PUBLIC_DISABLE_MOCK_DATA`
//   Expo exposes only EXPO_PUBLIC_* variables at runtime; VITE_* prefixes
//   are not recognised by Metro.  Set EXPO_PUBLIC_DISABLE_MOCK_DATA=true in
//   .env.local to test against the real API while still running `expo start`.
//
// Flip `DEV_MODE` to false (or remove this whole `mock/` folder + the two
// call sites in `app/_layout.tsx`) to fully remove the mock data layer.
// ─────────────────────────────────────────────────────────────────────────────
export const DEV_MODE: boolean =
  __DEV__ && process.env.EXPO_PUBLIC_DISABLE_MOCK_DATA !== "true";
