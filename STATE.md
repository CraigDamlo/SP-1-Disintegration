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

## Phase status
- [x] Phase 0 — offline Python proof of concept (`offline/disintegration_loops.py`)
- [x] Phase 1 — browser prototype, v1 built and confirmed working.
      Repo layout is flat (no subfolders) - sp1-disintegration.html,
      tape-processor.js, disintegration_loops.py, and the launcher
      AppleScript all sit in the repo root together. Must be served over
      HTTP, not opened via file://.
      AudioWorklet-based, buffer-mutation model.
- [x] Phase 1.1a — double-click launcher: "Launch SP-1 Disintegration.applescript",
      export as a .app via Script Editor. Starts a local server (only if
      port 8000 isn't already in use) and opens the page.
- [x] Phase 1.1 — full control-surface pass, based on real TE Stem user
      guide + physical unit + community repos (softmodded/marisko,
      chattock/sp1-tape-looper). Real SP-1 has: Function (GPIO), Play,
      4 track buttons, 4 physical faders (separate from track buttons),
      VOL +/- step buttons, FWD/RWD rocker, 8 LEDs (4 top + 4 side).
      Implemented: 4 faders = decay params (unchanged), 4 track buttons =
      snapshot slots (tap load / hold save / double-tap clear, preserves
      exact generation+decay state), volume = real +/- step buttons,
      FN hold-for-power shown as a tooltip only, not wired.
- [ ] Phase 1.2 — tuning pass: play with default decay curve, dropout
      feel, wow/flutter character; adjust constants in the worklet's
      `mutateBuffer()` based on what actually sounds good
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
Craig test-drives the updated control surface (snapshot slots, +/- volume),
then either moves to Phase 1.2 (tuning the decay feel) or Phase 1.3 (real
FWD/RWD rocker behavior).

## Open questions (not yet decided)
- Should the Reverse button become a real rocker (hold to fast-forward/
  rewind, tap to skip) per the real hardware, or stay a simple toggle?
- Should Freeze eventually be a hardware LED state (e.g. one LED pulses)?
- Firmware storage layout: how much eMMC space to reserve per loop slot,
  and per snapshot slot?
