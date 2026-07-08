# SP-1 Disintegration Loops — project state

Last updated: 2026-07-08

## What this is
A live, tweakable simulation of Basinski-style tape disintegration, modeled
on Teenage Engineering's SP-1 stem player (unreleased, community-hacked
nRF52840 dev board), eventually aiming at real SP-1 firmware.

## Locked decisions (don't re-litigate these)
- Decay model: mutates a stored buffer in place on each loop pass, not a
  real-time streaming filter. Matters because it mirrors both real tape
  and how it'll need to work on eMMC-backed firmware.
- Single loop, not 4 simultaneous stems. 4 sliders control decay
  *parameters*, not 4 separate audio sources.
- 4 sliders = wear rate, high-end loss, dropout density, wow & flutter.
  Saturation and noise floor are automatic (tied to overall decay
  fraction), not separately exposed.
- Target hardware: SP-1 (nRF52840, Cortex-M4 @ 64MHz, 256KB RAM, I2S
  48kHz/24-bit, TAS2505 speaker amp, CS42L42 headphone codec, 4GB eMMC,
  resistor-ladder buttons + 1 GPIO Function button, 8 LEDs). Dev docs:
  github.com/timknapen/SP-1-dev. Unofficial/community, bricking is a
  real risk on real hardware.
- Repo layout is flat, no subfolders: index.html, tape-processor.js,
  disintegration_loops.py, launch-sp1.command, STATE.md, README.md all
  sit in the repo root together.

## Phase status
- [x] Phase 0 — offline Python proof of concept (`disintegration_loops.py`)
- [x] Phase 1 — browser prototype built and working. AudioWorklet-based,
      buffer-mutation model. Main file renamed sp1-disintegration.html ->
      `index.html` (needed for GitHub Pages, see Phase 1.2c).
- [x] Phase 1.1 — full control-surface pass, based on real TE Stem user
      guide + physical unit + community repos (softmodded/marisko,
      chattock/sp1-tape-looper). Real SP-1 has: Function (GPIO), Play,
      4 track buttons, 4 physical faders (separate from track buttons),
      VOL +/- step buttons, FWD/RWD rocker, 8 LEDs (4 top + 4 side).
      Implemented: 4 faders = decay params (unchanged), 4 track buttons =
      snapshot slots (tap load / hold save / double-tap clear, preserves
      exact generation+decay state), volume = real +/- step buttons,
      FN hold-for-power shown as a tooltip only, not wired.
- [x] Phase 1.2a — export: Record/Stop&save (live capture of whatever's
      playing, downloads WAV) and Quick export (instant batch render of
      N generations from current source + fader settings, no listening
      required). CAVEAT: the quick-render math in `offlineMutateGeneration()`
      (in index.html) duplicates `mutateBuffer()` from tape-processor.js by
      hand, since a worklet can't be called synchronously from the main
      thread. If decay math gets tuned in one place, it needs the same edit
      in the other or they'll drift apart.
- [x] Phase 1.2b — local launcher: `launch-sp1.command` (double-click,
      shows live server output in Terminal, Ctrl+C stops it cleanly).
      Replaced the earlier AppleScript/.app version, which hid output in
      a log file and was harder to stop - retired, no longer in the repo.
- [x] Phase 1.2c — deployed to GitHub Pages:
      https://craigdamlo.github.io/SP-1-Disintegration/
      Pages serves over HTTPS, a proper secure context - this sidesteps
      the file://-related AudioWorklet issues entirely for casual use.
      `launch-sp1.command` is still useful for local dev while editing.
- [x] Phase 1.2e — bug fix: saturation stage used mismatched drive amounts
      in numerator/denominator, amplifying quiet signal ~2x per generation
      instead of preserving unity gain. Compounded across generations,
      this overpowered the separate fade-out gain and pushed the loop into
      saturated noise instead of fading to silence. Fixed in all three
      places it was duplicated: tape-processor.js, the offline exporter in
      index.html, and disintegration_loops.py.
- [x] Phase 1.2f — core redesign per Craig's feedback: removed the global
      per-generation volume fade entirely. Decay is now driven purely by
      a persistent "alive mask" that permanently kills small random
      chunks each generation (never recovers) - matches the intended
      "asdfghjkl -> asdf hjkl -> as f hjkl" model instead of an overall
      loudness fade. Surviving audio keeps its original level; perceived
      volume loss is a side effect of less tape surviving, not a
      separate effect. Threaded through snapshot slots (mask persists
      across save/load) and Quick Export. Mirrored in tape-processor.js,
      the offline exporter in index.html, and disintegration_loops.py.
- [ ] Phase 1.2d — tuning pass: play with default decay curve, dropout
      feel, wow/flutter character; adjust constants in the worklet's
      `mutateBuffer()` (and remember to mirror any change into
      `offlineMutateGeneration()` per the Phase 1.2a caveat)
- [ ] Phase 1.3 — FWD/RWD rocker not yet implemented (currently just a
      Reverse toggle button, not a real rocker with hold-to-scrub)
- [ ] Phase 2 — port DSP chain to fixed-point/CMSIS-DSP-friendly C,
      decide where "generations" physically live in the eMMC ring buffer.
      chattock/sp1-tape-looper (Zephyr + marisko board support) is a
      strong reference — same hardware, already solved flash-write
      bandwidth and watchdog/recovery.
- [ ] Phase 3 — real firmware: build against SP-1-dev toolchain, wire
      resistor-ladder buttons + Function GPIO, flash via Solderless
      web updater

## Next action
Craig picks between Phase 1.2d (tuning the decay feel) or Phase 1.3 (real
FWD/RWD rocker behavior).

## Open questions (not yet decided)
- Should the Reverse button become a real rocker (hold to fast-forward/
  rewind, tap to skip) per the real hardware, or stay a simple toggle?
- Should Freeze eventually be a hardware LED state (e.g. one LED pulses)?
- Firmware storage layout: how much eMMC space to reserve per loop slot,
  and per snapshot slot?
