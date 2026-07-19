/**
 * app/(auth)/login.tsx — Login Screen
 *
 * Native React Native implementation — no WebView.
 *
 * Behaviour:
 *   - Validates email format and non-empty password before submission.
 *   - Calls AuthContext.signIn() — currently throws (backend not implemented).
 *   - Shows the thrown error message below the submit button.
 *   - Password field supports show/hide toggle.
 *   - Login button is disabled while loading.
 *   - "Create account" navigates to /(auth)/signup.
 *   - "Forgot password" is a UI placeholder — no action yet.
 *
 * Navigation entry points:
 *   → /(auth)/signup  (Create account link)
 */

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { signIn, loading } = useAuth();

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError]     = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitError, setSubmitError]   = useState<string | null>(null);

  // ── Validation ─────────────────────────────────────────────────────────────

  const validateFields = useCallback((): boolean => {
    let valid = true;

    if (!email.trim()) {
      setEmailError("Email is required");
      valid = false;
    } else if (!isValidEmail(email)) {
      setEmailError("Enter a valid email address");
      valid = false;
    } else {
      setEmailError(null);
    }

    if (!password) {
      setPasswordError("Password is required");
      valid = false;
    } else {
      setPasswordError(null);
    }

    return valid;
  }, [email, password]);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleLogin = useCallback(async () => {
    setSubmitError(null);
    if (!validateFields()) return;

    try {
      await signIn(email.trim(), password);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setSubmitError(message);
    }
  }, [email, password, signIn, validateFields]);

  // ── Inline field change helpers ────────────────────────────────────────────

  const handleEmailChange = useCallback((text: string) => {
    setEmail(text);
    if (emailError) setEmailError(null);
    if (submitError) setSubmitError(null);
  }, [emailError, submitError]);

  const handlePasswordChange = useCallback((text: string) => {
    setPassword(text);
    if (passwordError) setPasswordError(null);
    if (submitError) setSubmitError(null);
  }, [passwordError, submitError]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.wordmark}>Trading Journal</Text>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>
          </View>

          {/* ── Form ───────────────────────────────────────────────────── */}
          <View style={styles.form}>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, emailError ? styles.inputError : null]}
                value={email}
                onChangeText={handleEmailChange}
                placeholder="you@example.com"
                placeholderTextColor={COLORS.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                editable={!loading}
              />
              {emailError ? (
                <Text style={styles.fieldError}>{emailError}</Text>
              ) : null}
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputWrapper, passwordError ? styles.inputError : null]}>
                <TextInput
                  style={styles.inputInner}
                  value={password}
                  onChangeText={handlePasswordChange}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.placeholder}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  editable={!loading}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  style={styles.eyeButton}
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={COLORS.muted}
                  />
                </Pressable>
              </View>
              {passwordError ? (
                <Text style={styles.fieldError}>{passwordError}</Text>
              ) : null}
            </View>

            {/* Forgot password placeholder */}
            <Pressable
              style={styles.forgotRow}
              accessibilityRole="button"
              accessibilityLabel="Forgot password — not yet available"
              disabled
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>

            {/* Submit error */}
            {submitError ? (
              <View style={styles.submitErrorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                <Text style={styles.submitErrorText}>{submitError}</Text>
              </View>
            ) : null}

            {/* Login button */}
            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              <Text style={styles.buttonText}>
                {loading ? "Signing in…" : "Sign in"}
              </Text>
            </Pressable>

          </View>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Pressable
              onPress={() => router.push("/(auth)/signup")}
              accessibilityRole="link"
              accessibilityLabel="Create account"
            >
              <Text style={styles.footerLink}>Create account</Text>
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — matches existing dark theme
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
  background:  "#05070A",
  surface:     "rgba(255,255,255,0.04)",
  border:      "rgba(255,255,255,0.08)",
  borderError: "#EF4444",
  textPrimary: "#EDF0F6",
  textSecondary: "rgba(148,163,184,0.80)",
  muted:       "rgba(148,163,184,0.50)",
  placeholder: "rgba(148,163,184,0.35)",
  accent:      "#3B82F6",
  accentDim:   "rgba(59,130,246,0.40)",
  error:       "#EF4444",
  errorSurface: "rgba(239,68,68,0.10)",
  wordmark:    "rgba(148,163,184,0.40)",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
    justifyContent: "center",
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    marginBottom: 40,
  },
  wordmark: {
    color: COLORS.wordmark,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 20,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },

  // ── Form ──────────────────────────────────────────────────────────────────
  form: {
    gap: 4,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
  },
  inputInner: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inputError: {
    borderColor: COLORS.borderError,
  },
  fieldError: {
    color: COLORS.error,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    marginLeft: 2,
  },

  // ── Forgot password ────────────────────────────────────────────────────────
  forgotRow: {
    alignSelf: "flex-end",
    marginBottom: 24,
    marginTop: -4,
  },
  forgotText: {
    color: COLORS.muted,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },

  // ── Submit error ──────────────────────────────────────────────────────────
  submitErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.errorSurface,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.20)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  submitErrorText: {
    flex: 1,
    color: COLORS.error,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },

  // ── Button ────────────────────────────────────────────────────────────────
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    backgroundColor: COLORS.accentDim,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 36,
  },
  footerText: {
    color: COLORS.muted,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  footerLink: {
    color: COLORS.accent,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
