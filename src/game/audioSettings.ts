const KEY = 'euchre-muted';

/** The one piece of app state that has to survive a full page reload and be readable from a
 *  plain function call (useSfx's `play()`), not just from a component — localStorage rather
 *  than React state/context, since there's exactly one flag and one non-component reader. */
export function isMuted(): boolean {
  // Storage access can THROW, not just return null: a browser set to block site data, and some
  // private modes, raise SecurityError on any localStorage call. Failing here must cost the
  // setting, never the page — this is read on every sound effect.
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    // Unwritable storage: the toggle still applies for this session via the caller's state.
  }
}
