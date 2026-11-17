# Security

## Reporting a problem

Please report security problems privately, through GitHub's
[private vulnerability reporting](https://github.com/WillPaz16/double-hand-euchre/security/advisories/new),
rather than a public issue. This is a one-person project, so replies come as soon as I can get to them.

## What's worth reporting

The multiplayer server is the part with something to protect. By design:

- **Hidden cards stay hidden.** The server sends each player a view redacted for their seat. A
  player seeing an opponent's hand, or a blind hand before it is revealed, is a bug.
- **The server is authoritative.** A client cannot play out of turn or play a card the engine
  doesn't list as legal for its seat. Anything that lets it is a bug.
- **Room codes are not secrets**, so a room refuses a third player and holds no personal data,
  but being able to read or act in a game you weren't seated in is a bug.

The app has no accounts, no passwords and no stored personal data. A room lives in Durable Object
storage and is deleted ten minutes after its last player leaves.

## Supported versions

Only the live site (`main`) is supported.
