/**
 * AuthContext — Architecture scaffold for authentication.
 *
 * This context defines the authentication interface for the Trading Journal
 * mobile app. All methods that require a backend throw intentionally —
 * this is a deliberate design contract, not an oversight.
 *
 * When the backend is implemented:
 *   1. Replace the throw bodies in signIn / signUp / signOut with real API calls.
 *   2. Update restoreSession() to read a persisted token and hydrate `user`.
 *   3. Add AsyncStorage / SecureStore for token persistence at that point.
 *
 * NOT yet implemented:
 *   - AsyncStorage / SecureStore
 *   - JWT tokens or refresh tokens
 *   - Any API calls
 *   - Session persistence across restarts
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string;
  email: string;
  displayName?: string;
};

interface AuthCtx {
  /** The currently authenticated user, or null if not signed in. */
  user: AuthUser | null;
  /**
   * True while an auth operation (signIn / signUp / signOut / restoreSession)
   * is in progress. Disable submit buttons while loading.
   */
  loading: boolean;
  /** Derived convenience — true when `user` is non-null. */
  isAuthenticated: boolean;
  /**
   * Sign in with email + password.
   * @throws {Error} "Authentication backend not implemented yet"
   */
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Create a new account.
   * @throws {Error} "Authentication backend not implemented yet"
   */
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<void>;
  /**
   * Sign out the current user.
   * @throws {Error} "Authentication backend not implemented yet"
   */
  signOut: () => Promise<void>;
  /**
   * Attempt to restore a previously-persisted session on app launch.
   * Currently a no-op that sets loading → false immediately.
   * Future: read token from SecureStore, validate with backend, hydrate user.
   */
  restoreSession: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthCtx | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);

  // Suppress "setUser is never read" lint — it will be used when the backend
  // is implemented. The assignment is intentional dead code for now.
  void setUser;

  const signIn = useCallback(
    async (_email: string, _password: string): Promise<void> => {
      throw new Error("Authentication backend not implemented yet");
    },
    [],
  );

  const signUp = useCallback(
    async (
      _email: string,
      _password: string,
      _displayName?: string,
    ): Promise<void> => {
      throw new Error("Authentication backend not implemented yet");
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    throw new Error("Authentication backend not implemented yet");
  }, []);

  const restoreSession = useCallback(async (): Promise<void> => {
    // No persisted session yet — simply mark loading complete so the app can
    // render the unauthenticated state without waiting.
    setLoading(false);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      isAuthenticated: user !== null,
      signIn,
      signUp,
      signOut,
      restoreSession,
    }),
    [user, loading, signIn, signUp, signOut, restoreSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Access the authentication context.
 * Must be called within an `<AuthProvider>` tree.
 */
export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be called within an <AuthProvider>");
  }
  return ctx;
}
