const KEY = 'euchre-muted';

/** The one piece of app state that has to survive a full page reload and be readable from a
 *  plain function call (useSfx's `play()`), not just from a component — localStorage rather
 *  than React state/context, since there's exactly one flag and one non-component reader. */
export function isMuted(): boolean {
  return localStorage.getItem(KEY) === '1';
}

export function setMuted(muted: boolean): void {
  localStorage.setItem(KEY, muted ? '1' : '0');
}
