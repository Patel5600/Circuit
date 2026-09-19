import React from "react";
import { CircuitWordmark } from "../brand/CircuitLogo";
import { Icon } from "../ui/Icon";

/**
 * Top-level error boundary.
 *
 * Two modes:
 * - Default ("page") mode: full-screen recovery UI for root-level errors.
 * - "section" mode: inline card-level recovery for component subtrees.
 *   Wrap individual page sections with <ErrorBoundary section> so one failure
 *   doesn't kill the whole page.
 */
interface Props {
  children: React.ReactNode;
  /** Render as an inline section card instead of full-screen overlay */
  section?: boolean;
  /** Custom label for the section (shown in section mode) */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private isChunkLoadError = (err: Error | null): boolean => {
    if (!err) return false;
    return /preload CSS|dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
      err.message || ""
    );
  };

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep full detail in console for developers only.
    // eslint-disable-next-line no-console
    console.error("circuit: unhandled render error", error, info.componentStack);

    // If a chunk failed to load due to a deployment asset mismatch, auto-reload once to refresh cache
    if (this.isChunkLoadError(error)) {
      const lastReload = Number(sessionStorage.getItem("circuit_chunk_reload") || "0");
      if (Date.now() - lastReload > 10000) {
        sessionStorage.setItem("circuit_chunk_reload", String(Date.now()));
        window.location.reload();
      }
    }
  }

  private reset = () => {
    if (this.isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { section, label } = this.props;

    const isChunkErr = this.isChunkLoadError(error);

    // ── Section-level recovery (inline card) ──────────────────────────────
    if (section) {
      return (
        <div className="section-error" role="alert">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--text-2)",
            }}
          >
            <Icon name="alert" size={16} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {isChunkErr
                ? "A new version of Circuit is available."
                : label
                ? `Something went wrong in ${label}.`
                : "Something went wrong in this section."}
            </span>
          </div>
          <p className="t-sm muted" style={{ margin: 0 }}>
            {isChunkErr
              ? "Please reload the page to load updated application files."
              : "Your funds and position are unaffected — this is a display issue."}
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={isChunkErr ? () => window.location.reload() : this.reset}
            >
              {isChunkErr ? "Reload page" : "Retry"}
            </button>
            <details style={{ fontSize: 11, color: "var(--text-3)" }}>
              <summary style={{ cursor: "pointer" }}>Technical details</summary>
              <pre
                style={{
                  marginTop: 4,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--text-3)",
                }}
              >
                {error.message}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    // ── Page-level recovery (full-screen) ─────────────────────────────────
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
              {isChunkErr ? "Update Available" : "Something went wrong"}
            </h1>
            <p className="t-sm muted">
              {isChunkErr
                ? "A new version of Circuit has been deployed. Please reload the page to load the latest application assets."
                : "The interface hit an unexpected error. Your funds and position are unaffected — this is a display problem, not an on-chain one."}
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
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
            {!isChunkErr && (
              <button type="button" className="btn btn--ghost" onClick={this.reset}>
                Try again
              </button>
            )}
            <a className="btn btn--ghost" href="/">
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
