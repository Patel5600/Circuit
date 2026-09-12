import React from "react";

import { CircuitWordmark } from "../brand/CircuitLogo";

/**
 * Top-level error boundary.
 *
 * Without this, any render-time exception unmounts the tree and leaves an empty
 * root - which reads as a blank black page against the dark background, with no
 * indication that anything went wrong. This turns that into a readable message
 * and keeps the underlying error available for debugging.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the full detail in the console for developers.
    console.error("circuit: unhandled render error", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          className="card stack g-16"
          style={{ maxWidth: 520, width: "100%" }}
          role="alert"
        >
          <CircuitWordmark size={24} />

          <div>
            <h1 className="t-section" style={{ marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p className="t-sm muted">
              The interface hit an unexpected error. Your funds and position are
              unaffected - this is a display problem, not an on-chain one.
            </p>
          </div>

          <details
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              padding: "12px 14px",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                listStyle: "none",
              }}
            >
              Technical details
            </summary>
            <pre
              className="mono"
              style={{
                marginTop: 10,
                marginBottom: 0,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontSize: 11.5,
                color: "var(--text-2)",
              }}
            >
              {error.message}
            </pre>
          </details>

          <div className="row g-8 wrap">
            <button type="button" className="btn btn--primary" onClick={this.reset}>
              Try again
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
            <a className="btn btn--ghost" href="/">
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
