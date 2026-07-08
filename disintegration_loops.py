#!/usr/bin/env python3
"""
Disintegration Loops Simulator
--------------------------------
Simulates the physical decay of a tape loop a la William Basinski's
"The Disintegration Loops" (2002). Feed it a short audio loop; it will
render N "generations" of decay, each one processed from the OUTPUT
of the previous generation (not the pristine source) — which is what
gives the real thing its irreversible, one-way arc.

Usage:
    python disintegration_loops.py input.wav --generations 40 --loops-per-gen 3

Output:
    A folder of numbered WAV files (gen_000.wav ... gen_NNN.wav), plus
    a single concatenated "full_decay.wav" you can listen to start to finish.
"""

import argparse
import os
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt


def lowpass(signal, sr, cutoff_hz, order=2):
    cutoff_hz = max(200.0, min(cutoff_hz, sr / 2 - 100))
    sos = butter(order, cutoff_hz, btype="low", fs=sr, output="sos")
    return sosfilt(sos, signal)


def apply_dropouts(signal, sr, decay_fraction, rng):
    """Randomly zero out small chunks — simulates flaked-off oxide.
    decay_fraction: 0.0 (pristine) to ~0.9 (mostly gone)."""
    out = signal.copy()
    n = len(signal)
    # number and size of dropout events scale with decay_fraction
    n_events = int(decay_fraction * (n / sr) * 8)  # ~8 potential events per second at full decay
    for _ in range(n_events):
        if rng.random() > decay_fraction * 1.2:
            continue  # not every potential dropout actually happens
        start = rng.integers(0, max(1, n - 1))
        length = int(rng.uniform(0.002, 0.02 + decay_fraction * 0.05) * sr)
        end = min(n, start + length)
        # fade in/out the dropout so it's a gap, not a click
        fade = np.hanning(max(2, end - start))
        out[start:end] *= (1 - fade * min(1.0, decay_fraction * 1.5 + 0.2))
    return out


def apply_wow_flutter(signal, sr, depth):
    """Slow random pitch wobble via variable-rate resampling (nearest-neighbor
    time warp — cheap but convincing for this purpose)."""
    n = len(signal)
    t = np.arange(n)
    # sum of a couple of slow sine wobbles at different rates = less mechanical-sounding
    wobble = (
        np.sin(2 * np.pi * t / (sr * 3.7)) * 0.6
        + np.sin(2 * np.pi * t / (sr * 1.3)) * 0.4
    )
    warped_t = t + wobble * depth * sr * 0.01
    warped_t = np.clip(warped_t, 0, n - 1)
    return np.interp(t, warped_t, signal)


def apply_noise_floor(signal, decay_fraction, rng):
    noise = rng.normal(0, 0.002 + decay_fraction * 0.01, size=len(signal))
    return signal + noise


def apply_saturation(signal, amount):
    """Mild tape-style soft saturation, increasing as levels get inconsistent.
    Uses the same drive amount in numerator and denominator so quiet
    passages stay at unity gain — only loud peaks get compressed as
    `amount` increases. Using different multipliers here would amplify
    quiet signal on every generation and blow up into saturated noise
    instead of fading toward silence."""
    k = 1 + amount * 3
    return np.tanh(signal * k) / k


def process_generation(signal, sr, gen_index, total_gens, rng):
    """Apply one generation's worth of decay. decay_fraction ramps 0->1
    across the run, but non-linearly (early generations barely change,
    late ones fall apart fast) since that's how the real tapes behaved."""
    progress = gen_index / max(1, total_gens - 1)
    decay_fraction = progress ** 1.8  # slow start, steep end

    cutoff = 18000 * (1 - decay_fraction) + 300 * decay_fraction
    out = lowpass(signal, sr, cutoff)
    out = apply_wow_flutter(out, sr, depth=decay_fraction * 0.5)
    out = apply_dropouts(out, sr, decay_fraction, rng)
    out = apply_saturation(out, decay_fraction)
    out = apply_noise_floor(out, decay_fraction, rng)

    # overall gain fades too — tape signal genuinely weakens
    gain = 1.0 - decay_fraction * 0.6
    out *= gain

    return np.clip(out, -1.0, 1.0)


def main():
    ap = argparse.ArgumentParser(description="Simulate tape disintegration loops.")
    ap.add_argument("input", help="Path to a short WAV loop (mono or stereo).")
    ap.add_argument("--outdir", default="disintegration_output")
    ap.add_argument("--generations", type=int, default=30, help="Number of decay stages to render.")
    ap.add_argument("--loops-per-gen", type=int, default=2, help="How many times the loop repeats within each generation's file.")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    signal, sr = sf.read(args.input, always_2d=False)
    if signal.ndim > 1:
        signal = signal.mean(axis=1)  # mono-sum for simplicity
    signal = signal / (np.max(np.abs(signal)) + 1e-9)

    os.makedirs(args.outdir, exist_ok=True)
    current = np.tile(signal, args.loops_per_gen)
    full_decay = []

    for gen in range(args.generations):
        current = process_generation(current, sr, gen, args.generations, rng)
        path = os.path.join(args.outdir, f"gen_{gen:03d}.wav")
        sf.write(path, current, sr)
        full_decay.append(current)
        print(f"Rendered generation {gen+1}/{args.generations} -> {path}")

    sf.write(os.path.join(args.outdir, "full_decay.wav"), np.concatenate(full_decay), sr)
    print(f"\nDone. Full arc written to {os.path.join(args.outdir, 'full_decay.wav')}")


if __name__ == "__main__":
    main()
