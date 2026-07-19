/**
 * app/(auth)/signup.tsx — Sign Up Screen
 *
 * Native React Native implementation — no WebView.
 *
 * Behaviour:
 *   - Collects display name, email, password, confirm password.
 *   - Validates all fields before submission (passwords must match).
 *   - Calls AuthContext.signUp() — currently throws (backend not implemented).
 *   - Shows the thrown error message below the submit button.
 *   - Password / confirm-password fields support independent show/hide toggles.
 *   - Create Account button is disabled while loading.
 *   - "Sign in" navigates back to /(auth)/login.
 *
 * Navigation entry points:
 *   → /(auth)/login  (Sign in link)
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

export default function SignupScreen() {
  const { signUp, loading } = useAuth();

  const [displayName, setDisplayName]       = useState("");
  const [email, setEmail]                   = useState("");
  const [password, setPassword]             = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword]           = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [emailError, setEmailError]             = useState<string | null>(null);
  const [passwordError, setPasswordError]       = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [submitError, setSubmitError]           = useState<string | null>(null);

  // ── Validation ─────────────────────────────────────────────────────────────

  const validateFields = useCallback((): boolean => {
    let valid = true;

    if (!displayName.trim()) {
      setDisplayNameError("Display name is required");
      valid = false;
    } else {
      setDisplayNameError(null);
    }

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
    } else if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      valid = false;
    } else {
      setPasswordError(null);
    }

    if (!confirmPassword) {
      setConfirmPasswordError("Please confirm your password");
      valid = false;
    } else if (password && confirmPassword !== password) {
      setConfirmPasswordError("Passwords do not match");
      valid = false;
    } else {
      setConfirmPasswordError(null);
    }

    return valid;
  }, [displayName, email, password, confirmPassword]);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSignup = useCallback(async () => {
    setSubmitError(null);
    if (!validateFields()) return;

    try {
      await signUp(email.trim(), password, displayName.trim());
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setSubmitError(message);
    }
  }, [email, password, displayName, signUp, validateFields]);

  // ── Inline field change helpers ────────────────────────────────────────────

  const handleDisplayNameChange = useCallback((text: string) => {
    setDisplayName(text);
    if (displayNameError) setDisplayNameError(null);
    if (submitError) setSubmitError(null);
  }, [displayNameError, submitError]);

  const handleEmailChange = useCallback((text: string) => {
    setEmail(text);
    if (emailError) setEmailError(null);
    if (submitError) setSubmitError(null);
  }, [emailError, submitError]);

  const handlePasswordChange = useCallback((text: string) => {
    setPassword(text);
    if (passwordError) setPasswordError(null);
    // Re-validate confirm if it already has an error
    if (confirmPasswordError && confirmPassword && text === confirmPassword) {
      setConfirmPasswordError(null);
    }
    if (submitError) setSubmitError(null);
  }, [passwordError, confirmPasswordError, confirmPassword, submitError]);

  const handleConfirmPasswordChange = useCallback((text: string) => {
    setConfirmPassword(text);
    if (confirmPasswordError) setConfirmPasswordError(null);
    if (submitError) setSubmitError(null);
  }, [confirmPasswordError, submitError]);

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
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Start tracking your trades</Text>
          </View>

          {/* ── Form ───────────────────────────────────────────────────── */}
          <View style={styles.form}>

            {/* Display Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Display Name</Text>
              <TextInput
                style={[styles.input, displayNameError ? styles.inputError : null]}
                value={displayName}
                onChangeText={handleDisplayNameChange}
                placeholder="Your name"
                placeholderTextColor={COLORS.placeholder}
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                editable={!loading}
              />
              {displayNameError ? (
                <Text style={styles.fieldError}>{displayNameError}</Text>
              ) : null}
            </View>

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
                  placeholder="Min. 8 characters"
                  placeholderTextColor={COLORS.placeholder}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
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

            {/* Confirm Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={[styles.inputWrapper, confirmPasswordError ? styles.inputError : null]}>
                <TextInput
                  style={styles.inputInner}
                  value={confirmPassword}
                  onChangeText={handleConfirmPasswordChange}
                  placeholder="Re-enter password"
                  placeholderTextColor={COLORS.placeholder}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleSignup}
                  editable={!loading}
                />
                <Pressable
                  onPress={() => setShowConfirmPassword((v) => !v)}
                  hitSlop={8}
                  style={styles.eyeButton}
                  accessibilityLabel={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                >
                  <Ionicons
                    name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={COLORS.muted}
                  />
                </Pressable>
              </View>
              {confirmPasswordError ? (
                <Text style={styles.fieldError}>{confirmPasswordError}</Text>
              ) : null}
            </View>

            {/* Submit error */}
            {submitError ? (
              <View style={styles.submitErrorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={COLORS.error} />
                <Text style={styles.submitErrorText}>{submitError}</Text>
              </View>
            ) : null}

            {/* Create Account button */}
            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSignup}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Create account"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              <Text style={styles.buttonText}>
                {loading ? "Creating account…" : "Create account"}
              </Text>
            </Pressable>

          </View>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Pressable
              onPress={() => router.push("/(auth)/login")}
              accessibilityRole="link"
              accessibilityLabel="Sign in"
            >
              <Text style={styles.footerLink}>Sign in</Text>
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
  background:   "#05070A",
  surface:      "rgba(255,255,255,0.04)",
  border:       "rgba(255,255,255,0.08)",
  borderError:  "#EF4444",
  textPrimary:  "#EDF0F6",
  textSecondary: "rgba(148,163,184,0.80)",
  muted:        "rgba(148,163,184,0.50)",
  placeholder:  "rgba(148,163,184,0.35)",
  accent:       "#3B82F6",
  accentDim:    "rgba(59,130,246,0.40)",
  error:        "#EF4444",
  errorSurface: "rgba(239,68,68,0.10)",
  wordmark:     "rgba(148,163,184,0.40)",
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
    marginBottom: 36,
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
