#!/usr/bin/env python3
"""Deterministically synthesizes every sound effect for the euchre UI — plain waveform math via
the stdlib `wave` module, no samples, no AI generation, same philosophy as generate_art.py.
Deliberately SFX/stingers only, no music (per the Phase 2 design spec).
"""
import math
import os
import struct
import wave

SAMPLE_RATE = 22050
OUT_ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "audio")


def _envelope(i, n, attack, release):
    """Linear ramp up over `attack` fraction, ramp down over `release` fraction — avoids the
    clicks a hard on/off edge would make, without needing a real ADSR model."""
    t = i / n
    if t < attack:
        return t / attack
    if t > 1 - release:
        return (1 - t) / release
    return 1.0


def _tone(freq, duration, wave_shape="square", volume=0.35, attack=0.05, release=0.35):
    n = int(SAMPLE_RATE * duration)
    samples = []
    for i in range(n):
        phase = (i / SAMPLE_RATE) * freq
        frac = phase - math.floor(phase)
        if wave_shape == "square":
            raw = 1.0 if frac < 0.5 else -1.0
        elif wave_shape == "triangle":
            raw = 4 * abs(frac - 0.5) - 1
        else:  # sine
            raw = math.sin(2 * math.pi * phase)
        samples.append(raw * volume * _envelope(i, n, attack, release))
    return samples


def _noise_burst(duration, volume=0.3, attack=0.02, release=0.6, seed=1):
    """Deterministic pseudo-noise (a simple LCG), not random.random() — every regeneration
    must produce a byte-identical file."""
    n = int(SAMPLE_RATE * duration)
    state = seed
    samples = []
    for i in range(n):
        state = (state * 1103515245 + 12345) & 0x7FFFFFFF
        raw = (state / 0x7FFFFFFF) * 2 - 1
        samples.append(raw * volume * _envelope(i, n, attack, release))
    return samples


def _mix(*tracks):
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for t in tracks:
        for i, v in enumerate(t):
            out[i] += v
    peak = max((abs(v) for v in out), default=1.0) or 1.0
    if peak > 1.0:
        out = [v / peak for v in out]
    return out


def _concat(*tracks):
    out = []
    for t in tracks:
        out.extend(t)
    return out


def _write_wav(path, samples):
    with wave.open(path, "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        frames = b"".join(struct.pack("<h", max(-32767, min(32767, int(v * 32767)))) for v in samples)
        f.writeframes(frames)


def make_card_play():
    """A quick snap — a short filtered-sounding noise burst with a fast decay, like a card
    landing on wood."""
    return _mix(_noise_burst(0.06, volume=0.5, attack=0.01, release=0.7, seed=7))


def make_trick_win():
    """A brief two-note upward chime — pleasant, not showy, since this fires up to 5x a deal."""
    a = _tone(523.25, 0.09, "triangle", volume=0.3, attack=0.02, release=0.5)  # C5
    b = _tone(783.99, 0.14, "triangle", volume=0.3, attack=0.02, release=0.6)  # G5
    return _concat(a, b)


def make_euchre_fanfare():
    """A four-note ascending arpeggio — the hand-won stinger, bigger than a single trick."""
    notes = [392.00, 523.25, 659.25, 783.99]  # G4, C5, E5, G5
    tones = [_tone(f, 0.15, "square", volume=0.28, attack=0.01, release=0.4) for f in notes]
    return _concat(*tones)


def make_game_win_fanfare():
    """The big one — a longer, richer arpeggio with a held final chord, for winning the game."""
    notes = [392.00, 523.25, 659.25, 783.99, 1046.50]  # G4..C6
    tones = [_tone(f, 0.13, "square", volume=0.26, attack=0.01, release=0.35) for f in notes]
    chord = _mix(
        _tone(523.25, 0.5, "square", volume=0.22, attack=0.02, release=0.6),
        _tone(659.25, 0.5, "square", volume=0.18, attack=0.02, release=0.6),
        _tone(783.99, 0.5, "triangle", volume=0.2, attack=0.02, release=0.6),
    )
    return _concat(*tones, chord)


def make_shuffle():
    """A soft riffle texture for the deal — several short overlapping noise bursts."""
    bursts = []
    for i in range(6):
        bursts.append(_noise_burst(0.08, volume=0.18, attack=0.1, release=0.7, seed=100 + i * 17))
    # stagger them into one track rather than fully overlapping
    step = int(SAMPLE_RATE * 0.05)
    n = step * (len(bursts) - 1) + len(bursts[-1])
    out = [0.0] * n
    for idx, b in enumerate(bursts):
        offset = idx * step
        for i, v in enumerate(b):
            out[offset + i] += v
    peak = max((abs(v) for v in out), default=1.0) or 1.0
    if peak > 1.0:
        out = [v / peak for v in out]
    return out


def main():
    os.makedirs(OUT_ROOT, exist_ok=True)
    sounds = {
        "card_play.wav": make_card_play(),
        "trick_win.wav": make_trick_win(),
        "euchre_fanfare.wav": make_euchre_fanfare(),
        "game_win_fanfare.wav": make_game_win_fanfare(),
        "shuffle.wav": make_shuffle(),
    }
    for name, samples in sounds.items():
        _write_wav(os.path.join(OUT_ROOT, name), samples)
    print(f"Generated {len(sounds)} sound effects -> {OUT_ROOT}")


if __name__ == "__main__":
    main()
