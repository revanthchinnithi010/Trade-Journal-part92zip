import React, { Component, ComponentType, PropsWithChildren } from "react";

import { ErrorFallback, ErrorFallbackProps } from "@/components/ErrorFallback";

export type ErrorBoundaryProps = PropsWithChildren<{
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /**
   * Optional callback invoked after the default console.error logging.
   * Use for crash reporting services (Sentry, Bugsnag, etc.).
   */
  onError?: (error: Error, stackTrace: string) => void;
}>;

type ErrorBoundaryState = { error: Error | null };

/**
 * Production-ready React Error Boundary.
 *
 * Must be a class component — React's error boundary lifecycle methods
 * (getDerivedStateFromError, componentDidCatch) are not available in
 * functional components.
 * https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 *
 * Behaviour:
 *  - Catches any render-time error thrown by a descendant.
 *  - Always logs to console.error (visible in Metro / Xcode / Logcat).
 *  - Renders FallbackComponent (defaults to ErrorFallback) with a resetError
 *    callback so the user can attempt recovery without a full app restart.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static defaultProps: {
    FallbackComponent: ComponentType<ErrorFallbackProps>;
  } = {
    FallbackComponent: ErrorFallback,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Always log — Metro bundler, Xcode console, and Android Logcat all show
    // console.error output, making this the primary crash signal in development
    // and in production builds that do not use a remote error reporter.
    console.error("[ErrorBoundary] Unhandled render error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);

    if (typeof this.props.onError === "function") {
      this.props.onError(error, info.componentStack ?? "");
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render() {
    const { FallbackComponent } = this.props;

    return this.state.error && FallbackComponent ? (
      <FallbackComponent
        error={this.state.error}
        resetError={this.resetError}
      />
    ) : (
      this.props.children
    );
  }
}
