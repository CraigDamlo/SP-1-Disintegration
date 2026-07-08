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
- [x] Phase 1 — browser prototype, v1 built (`prototype/sp1-disintegration.html`)
      AudioWorklet-based, buffer-mutation model, SP-1-styled UI (4 faders,
      play/reverse/freeze/function/reset, 8-LED meter, waveform screen).
      NOT YET tested live / tuned by Craig.
- [ ] Phase 1.1 — tuning pass: play with default decay curve, dropout
      feel, wow/flutter character; adjust constants in the worklet's
      `mutateBuffer()` based on what actually sounds good
- [ ] Phase 2 — port DSP chain to fixed-point/CMSIS-DSP-friendly C,
      decide where "generations" physically live in the eMMC ring buffer
- [ ] Phase 3 — real firmware: build against SP-1-dev toolchain, wire
      resistor-ladder buttons + Function GPIO, flash via Solderless
      web updater

## Next action
Craig test-drives `sp1-disintegration.html` locally, reports back what
feels wrong (too fast/slow decay, dropout character, etc.) so constants
in `mutateBuffer()` can be tuned.

## Open questions (not yet decided)
- Does "Reverse" on real hardware read the buffer backward, or should it
  mean something else (e.g. slow the decay rate)?
- Should Freeze eventually be a hardware LED state (e.g. one LED pulses)?
- Firmware storage layout: how much eMMC space to reserve per loop slot?
