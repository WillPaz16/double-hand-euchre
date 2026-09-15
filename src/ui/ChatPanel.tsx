import { useEffect, useRef, useState } from 'react';
import type { Player } from '../../shared/engine/types.ts';
import { MAX_CHAT_LENGTH, type ChatMessage } from '../../shared/net/protocol.ts';

/** The room's chat window: the full conversation, plus somewhere to type.
 *
 *  Direct user feedback asked for both halves together — a line appears in the speaker's speech
 *  bubble as they say it (see Table's `chatBubble`), and is ALSO kept here, so a bubble you
 *  missed is never lost. The log is the room's stored history, so it survives a reconnect.
 *
 *  Collapsed by default behind a button beside the pause gear: the table is the point of the
 *  screen, and an always-open panel would sit on top of the cards on a phone. */
export function ChatPanel({
  chat,
  you,
  opponentName,
  onSend,
}: {
  chat: ChatMessage[];
  you: Player | null;
  opponentName: string;
  onSend: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  // The newest message id the player has had the panel open for. Anything from the other
  // player past it is unread.
  const [seenId, setSeenId] = useState(0);
  const logRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const newestId = chat.at(-1)?.id ?? 0;
  const unread = open ? 0 : chat.filter((m) => m.from !== you && m.id > seenId).length;

  useEffect(() => {
    if (!open) return;
    setSeenId(newestId);
    // Pin the log to the newest line, the way every chat window behaves.
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [open, newestId]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <>
      <button
        className="chat-toggle"
        aria-expanded={open}
        aria-controls="chat-panel"
        aria-label={unread > 0 ? `Chat, ${unread} unread` : 'Chat'}
        onClick={() => setOpen((o) => !o)}
      >
        Chat
        {unread > 0 && (
          <span className="chat-unread" aria-hidden="true">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <section
          id="chat-panel"
          className="chat-panel"
          aria-label="Chat"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <ol className="chat-log" ref={logRef} aria-live="polite">
            {chat.length === 0 && <li className="chat-empty">No messages yet. Say hello.</li>}
            {chat.map((m) => (
              <li key={m.id} className={m.from === you ? 'chat-line chat-line-mine' : 'chat-line'}>
                <span className="chat-who">{m.from === you ? 'You' : opponentName}</span>
                <span className="chat-text">{m.text}</span>
              </li>
            ))}
          </ol>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              ref={inputRef}
              className="chat-input"
              value={draft}
              maxLength={MAX_CHAT_LENGTH}
              placeholder="Say something"
              aria-label="Message"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="chat-send" type="submit" disabled={!draft.trim()}>
              Send
            </button>
          </form>
        </section>
      )}
    </>
  );
}
