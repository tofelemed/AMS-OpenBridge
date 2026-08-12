'use client';

// H1 — the app previously had NO error boundary: any render throw, or a failed
// lazy-chunk load (routine after a redeploy invalidates hashed chunk names),
// unmounted the whole tree to a permanent white screen. Two layers now exist:
//   - main.tsx wraps <App/> (last resort, catches shell crashes);
//   - App.tsx wraps <Routes/> keyed by pathname, so a crashed page resets when
//     the user navigates away and the rest of the session survives.
// Reload fixes the chunk-load case outright (fresh index.html → fresh hashes).
import React from 'react';

const EB_BUTTON: React.CSSProperties = {
  padding: '8px 20px',
  borderRadius: '6px',
  border: '1px solid var(--normal-enabled-border-color)',
  background: 'var(--normal-enabled-background-color)',
  color: 'var(--on-normal-active-color)',
  cursor: 'pointer',
  font: 'inherit',
};

interface Props {
  children: React.ReactNode;
  /** Where this boundary sits — only used to label the log line. */
  scope?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.scope ?? 'root'}]`, error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    const isChunkError = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i
      .test(this.state.error.message);

    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          minHeight: '60vh',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--on-container-neutral-color)',
        }}
      >
        <h2 style={{ margin: 0, color: 'var(--on-container-active-color)' }}>
          {isChunkError ? 'A newer version of AMS is available' : 'Something went wrong on this page'}
        </h2>
        <p style={{ margin: 0, maxWidth: '48em' }}>
          {isChunkError
            ? 'The application was updated since this tab loaded. Reload to get the current version.'
            : 'The rest of the application is still running. Reload the page, or go back and try again.'}
        </p>
        <code
          style={{
            fontSize: '12px',
            maxWidth: '60em',
            overflowWrap: 'anywhere',
            opacity: 0.7,
          }}
        >
          {this.state.error.message}
        </code>
        {/* Deliberately a plain <button>, not ObcButton: this is the crash
            surface of last resort and must not depend on the component library
            that may itself be what just threw. Colors still come from tokens. */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={EB_BUTTON} onClick={() => window.location.reload()}>
            Reload
          </button>
          {!isChunkError && (
            <button
              style={EB_BUTTON}
              onClick={() => {
                this.setState({ error: null });
                window.history.back();
              }}
            >
              Go back
            </button>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
