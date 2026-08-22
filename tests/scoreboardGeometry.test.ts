import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_H, PIP_Y0, PIP_Y1 } from '../src/ui/Scoreboard.tsx';

/** Scoreboard.tsx's own comment says its CARD_H/PIP_Y0/PIP_Y1 "MUST MATCH"
 *  art/generate_art.py's SCORE_CARD_H/SCORE_PIP_Y0/Y1 — and nothing checked that until now.
 *  generate_art.py's main() emits its own values to scoreboard-geometry.generated.json on
 *  every run specifically so this test can compare against the generator's actual numbers
 *  instead of a second hand-copied constant that could itself drift.
 *
 *  Requires `python3 art/generate_art.py` to have run at least once (CI's determinism step
 *  already does this before tests run; locally, run it once after a fresh clone). */
describe('Scoreboard pip geometry matches the generator', () => {
  it('CARD_H, PIP_Y0 and PIP_Y1 match art/generate_art.py exactly', () => {
    const raw = readFileSync(
      new URL('../art/scoreboard-geometry.generated.json', import.meta.url),
      'utf8',
    );
    const generated = JSON.parse(raw) as { CARD_H: number; PIP_Y0: number; PIP_Y1: number };

    expect(CARD_H).toBe(generated.CARD_H);
    expect(PIP_Y0).toBe(generated.PIP_Y0);
    expect(PIP_Y1).toBe(generated.PIP_Y1);
  });
});
