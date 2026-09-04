import { useState } from 'react';
import { SceneLayer } from './SceneLayer.tsx';
import { makeRoomCode, normaliseRoomCode, MAX_NAME_LENGTH } from '../../shared/net/protocol.ts';
import { getPlayerName, setPlayerName, getPlayerAvatar, setPlayerAvatar } from '../net/playerName.ts';
import { AVATAR_KEYS, AVATAR_LABELS, avatarSrc, type AvatarKey } from '../../shared/net/avatars.ts';
import type { RoomCode } from '../../shared/net/protocol.ts';

/** Create-or-join. There is deliberately no distinction on the server: `hello` creates the room
 *  if it isn't there, so "host" and "guest" are the same operation and neither player has to go
 *  first. The only difference here is whether the code is generated or typed. */
export function LobbyScreen({
  onJoin,
  onBack,
}: {
  onJoin: (code: RoomCode) => void;
  onBack: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [name, setName] = useState(() => getPlayerName() ?? '');
  const [avatar, setAvatar] = useState<AvatarKey>(() => getPlayerAvatar());
  const [error, setError] = useState<string | null>(null);

  const join = () => {
    const code = normaliseRoomCode(typed);
    if (!code) {
      setError('A room code is four letters or numbers.');
      return;
    }
    onJoin(code);
  };

  return (
    <div className="title-screen">
      <SceneLayer />
      <h1 className="title-heading">Play a Friend</h1>
      <p className="title-tagline">
        One of you starts a table and reads out the code. The other types it in.
      </p>

      {/* Your opponent sees whichever of these you pick; you never see your own, because you
          are the hands at the bottom of the screen rather than a portrait. Radios rather than a
          dropdown: four options that are chosen by how they LOOK should all be visible at once,
          and a native select would show only their names. */}
      <fieldset className="avatar-picker">
        <legend className="lobby-label">who you play as</legend>
        <div className="avatar-row">
          {AVATAR_KEYS.map((key) => (
            <label
              key={key}
              className={`avatar-option${key === avatar ? ' is-chosen' : ''}`}
              title={AVATAR_LABELS[key]}
            >
              <input
                type="radio"
                name="avatar"
                value={key}
                checked={key === avatar}
                onChange={() => {
                  setAvatar(key);
                  setPlayerAvatar(key);
                }}
              />
              <img src={avatarSrc(key, 'idle')} alt={AVATAR_LABELS[key]} />
            </label>
          ))}
        </div>
      </fieldset>

      {/* Optional on purpose: a friend you are already on the phone to does not need to type
          their name in to play a hand of cards. Persisted so it is asked for at most once. */}
      <div className="lobby-join">
        <label className="lobby-label" htmlFor="player-name">
          your name (optional)
        </label>
        <input
          id="player-name"
          className="lobby-input lobby-input-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setPlayerName(e.target.value);
          }}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          spellCheck={false}
        />
      </div>

      <button className="title-play-button" onClick={() => onJoin(makeRoomCode())}>
        Start a Table
      </button>

      <div className="lobby-join">
        <label className="lobby-label" htmlFor="room-code">
          or join with a code
        </label>
        <div className="lobby-row">
          <input
            id="room-code"
            className="lobby-input"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') join();
            }}
            maxLength={4}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby={error ? 'room-code-error' : undefined}
            aria-invalid={error ? true : undefined}
          />
          <button className="bid-button" onClick={join}>
            Join
          </button>
        </div>
        {/* role=alert so a screen reader hears the problem the moment it appears, rather than
            only if the user happens to navigate back to the field. */}
        {error && (
          <p id="room-code-error" className="lobby-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <button className="title-settings-button" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
