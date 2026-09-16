import { useEffect, useState } from 'react';
import { roomLink } from '../net/roomLink.ts';
import type { RoomCode } from '../../shared/net/protocol.ts';

/** How long the button stays on "Copied" before offering the action again. */
const COPIED_MS = 2000;

/** Copies the table's join link, so sharing a game is a paste instead of four letters read aloud.
 *
 *  The clipboard can refuse — it needs a secure context and, in some browsers, a permission — so a
 *  failure shows the link as selectable text rather than pretending it worked. */
export function CopyLinkButton({ code }: { code: RoomCode }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state !== 'copied') return;
    const t = setTimeout(() => setState('idle'), COPIED_MS);
    return () => clearTimeout(t);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomLink(code));
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  return (
    <>
      <button className="bid-button" onClick={() => void copy()}>
        {state === 'copied' ? 'Link copied' : 'Copy link'}
      </button>
      {state === 'failed' && (
        <p className="net-overlay-notice">
          Copy this: <span className="copy-link-text">{roomLink(code)}</span>
        </p>
      )}
    </>
  );
}
