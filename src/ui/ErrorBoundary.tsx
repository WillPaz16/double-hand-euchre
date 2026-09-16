import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../net/reportError.ts';

/** The last line of defence for a render crash.
 *
 *  Without this, any exception while rendering unmounts the entire React tree and leaves a blank
 *  page with no way forward — which is exactly what the scoreboard crash at scores above 10 did
 *  before it was fixed. The fallback deliberately depends on nothing but plain markup and CSS:
 *  it can't reuse a game component, because one of those is what just threw.
 *
 *  Reloading is a safe recovery, not a reset: the solo game autosaves after every move and an
 *  online seat is reclaimed by client id, so the player lands back where they were. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Double-Hand Euchre crashed while rendering:', error, info.componentStack);
    // Also sent to the Worker's logs, so a crash nobody mentions is still visible.
    reportError(error, 'render');
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash-screen" role="alert">
        <h1 className="crash-title">Something went wrong</h1>
        <p className="crash-text">Your game is saved. Reloading picks up where you left off.</p>
        <button className="crash-button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
