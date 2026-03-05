import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="error-msg" style={{ margin: 20 }}>
          <strong>Something went wrong.</strong>
          <p style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 12,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
