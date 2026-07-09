#!/usr/bin/env python3
"""
Disintegration Loops Simulator
--------------------------------
Simulates the physical decay of a tape loop a la William Basinski's
"The Disintegration Loops" (2002). Feed it a short audio loop; it will
render N "generations" of decay, each one processed from the OUTPUT
of the previous generation (not the pristine source) — which is what
gives the real thing its irreversible, one-way arc.

Decay works by permanently killing small chunks of the tape each
generation (an "alive mask" that only ever loses ground, never
recovers) rather than an overall volume fade. Surviving audio keeps
its original level; the piece just has less and less tape left to
play, exactly like real oxide loss. Think "asdfghjkl" -> "asdf hjkl"
-> "as f hjkl", not the whole word just getting quieter.

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


def apply_dropouts(alive_mask, n, sr, kill_fraction, rng):
    """Permanently kill new chunks of tape - once dead, always dead.
    Mutates alive_mask in place."""
    samples_to_kill = int(n * kill_fraction)
    killed = 0
    attempts = 0
    while killed < samples_to_kill and attempts < 250:
        attempts += 1
        start = int(rng.integers(0, max(1, n - 1)))
        chunk_len = int(rng.uniform(0.01, 0.09) * sr)
        end = min(n, start + chunk_len)
        span = end - start
        if span < 2 or not np.any(alive_mask[start:end] > 0.01):
            continue
        fade_len = min(24, max(1, span // 4))
        ramp = np.ones(span)
        ramp[:fade_len] = np.linspace(0, 1, fade_len)
        ramp[-fade_len:] = np.minimum(ramp[-fade_len:], np.linspace(1, 0, fade_len))
        alive_mask[start:end] = np.minimum(alive_mask[start:end], ramp)
        killed += span


def apply_wow_flutter(signal, sr, depth):
    """Slow random pitch wobble via variable-rate resampling (nearest-neighbor
    time warp — cheap but convincing for this purpose)."""
    n = len(signal)
    t = np.arange(n)
    wobble = (
        np.sin(2 * np.pi * t / (sr * 3.7)) * 0.6
        + np.sin(2 * np.pi * t / (sr * 1.3)) * 0.4
    )
    warped_t = t + wobble * depth * sr * 0.01
    warped_t = np.clip(warped_t, 0, n - 1)
    return np.interp(t, warped_t, signal)


def apply_noise_floor(signal, decay_fraction, rng):
    noise = rng.normal(0, 0.002 + decay_fraction * 0.008, size=len(signal))
    return signal + noise


def apply_saturation(signal, amount):
    """Mild tape-style soft saturation, increasing as levels get inconsistent.
    Uses the same drive amount in numerator and denominator so quiet
    passages stay at unity gain — only loud peaks get compressed as
    `amount` increases. Using different multipliers here would amplify
    quiet signal on every generation and blow up into saturated noise
    instead of fading toward silence. Capped at a mild max drive since
    dropouts, not distortion, are meant to carry most of the decay."""
    k = 1 + min(1.0, amount) * 2.5
    return np.tanh(signal * k) / k


def process_generation(pristine_signal, alive_mask, sr, gen_index, total_gens,
                        wear_rate, dropout_density, rng):
    """Apply one generation's worth of decay. decay_fraction ramps 0->1
    across the run, but non-linearly (early generations barely change,
    late ones fall apart fast) since that's how the real tapes behaved.

    Tone (filter/saturation/noise) is computed FRESH from pristine_signal
    every generation, never cascaded from the previous generation's
    output. Re-filtering an already-filtered signal every pass compounds
    exponentially over many generations and crushes surviving audio
    toward silence regardless of decay_fraction - computing from the
    pristine reference each time bounds tonal wear to the current decay
    fraction only, no matter how many generations have elapsed. Volume
    loss beyond that is purely a side effect of alive_mask shrinking -
    there is no separate overall gain fade."""
    progress = gen_index / max(1, total_gens - 1)
    decay_fraction = progress ** 1.8

    cutoff = 18000 * (1 - decay_fraction) + 300 * decay_fraction
    out = lowpass(pristine_signal, sr, cutoff)
    out = apply_wow_flutter(out, sr, depth=decay_fraction * 0.5)
    out = apply_saturation(out, decay_fraction * 0.35)
    out = apply_noise_floor(out, decay_fraction, rng)

    kill_fraction = 0.006 + wear_rate * dropout_density * 0.05
    apply_dropouts(alive_mask, len(out), sr, kill_fraction, rng)
    out = out * alive_mask

    return np.clip(out, -1.0, 1.0)


def main():
    ap = argparse.ArgumentParser(description="Simulate tape disintegration loops.")
    ap.add_argument("input", help="Path to a short WAV loop (mono or stereo).")
    ap.add_argument("--outdir", default="disintegration_output")
    ap.add_argument("--generations", type=int, default=30, help="Number of decay stages to render.")
    ap.add_argument("--loops-per-gen", type=int, default=2, help="How many times the loop repeats within each generation's file.")
    ap.add_argument("--wear-rate", type=float, default=0.35, help="0-1, how fast chunks get killed per generation.")
    ap.add_argument("--dropout-density", type=float, default=0.4, help="0-1, scales chunk-kill amount alongside wear rate.")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    signal, sr = sf.read(args.input, always_2d=False)
    if signal.ndim > 1:
        signal = signal.mean(axis=1)  # mono-sum for simplicity
    signal = signal / (np.max(np.abs(signal)) + 1e-9)

    os.makedirs(args.outdir, exist_ok=True)
    pristine = np.tile(signal, args.loops_per_gen)
    alive_mask = np.ones(len(pristine))
    full_decay = [pristine]

    sf.write(os.path.join(args.outdir, "gen_000.wav"), pristine, sr)
    print(f"Rendered generation 1/{args.generations} -> {os.path.join(args.outdir, 'gen_000.wav')}")

    for gen in range(1, args.generations):
        current = process_generation(
            pristine, alive_mask, sr, gen, args.generations,
            args.wear_rate, args.dropout_density, rng
        )
        path = os.path.join(args.outdir, f"gen_{gen:03d}.wav")
        sf.write(path, current, sr)
        full_decay.append(current)
        print(f"Rendered generation {gen+1}/{args.generations} -> {path}")

    sf.write(os.path.join(args.outdir, "full_decay.wav"), np.concatenate(full_decay), sr)
    print(f"\nDone. Full arc written to {os.path.join(args.outdir, 'full_decay.wav')}")


if __name__ == "__main__":
    main()
