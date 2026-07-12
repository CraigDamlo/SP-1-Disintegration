# SP-1 Disintegration Loops — project state

Last updated: 2026-07-11

## What this is
A live, tweakable simulation of Basinski-style tape disintegration, modeled
on Teenage Engineering's SP-1 stem player (unreleased, community-hacked
nRF52840 dev board), eventually aiming at real SP-1 firmware.

## Locked decisions (don't re-litigate these)
- All sliders at zero should NOT mean frozen/pristine forever - some
  baseline decay should always be happening (real tape degrades a little
  no matter what). Confirmed by Craig via a zero-settings render: current
  hardcoded floors (killFraction has a +0.006 floor, wear has a +0.004
  floor, both independent of the wearRate/dropoutDensity faders) are the
  intended behavior, not a bug.
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
      NOTE: snapshot slots removed in Phase 1.3b below - see that entry.
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
- [x] Phase 1.2g — investigated report of Quick Export still sounding
      saturated after 1.2f. Verified numerically (extracted the pure
      function, ran it against a test tone for 30 generations) that
      amplitude trends down, not up - the gain-growth bug is genuinely
      gone. Most likely explanations: browser/Pages caching serving the
      old file, and/or the saturation drive being too aggressive at max
      decay (was up to 2.8x). Reduced max drive to 1.875x (satAmt cap
      0.6->0.35, multiplier 3->2.5) in all three files for a gentler
      character, since dropouts are meant to carry most of the decay.
      NEEDS CRAIG TO CONFIRM after a hard refresh whether this resolves it.
- [x] Phase 1.2h — v1.7, real bug found via Craig's uploaded 90-gen
      render: tone (filter/saturation/noise) was being re-applied to the
      already-processed buffer every generation instead of computed fresh
      from a pristine reference each time. Cascading a mild effect 90x
      compounds exponentially - crushed surviving audio toward silence
      regardless of fader position, independent of chunk-loss. Verified
      against the actual uploaded file: predicted-vs-actual RMS was off
      by up to 7x by gen 85. Fixed in all three files by keeping a
      separate untouched pristine reference; only the alive-mask stays
      cumulative now. Re-verified numerically post-fix: RMS tracks within
      a few % of pure-chunk-loss prediction at every generation up to 89.
      CONFIRMED WORKING as of this fix - not yet re-confirmed by Craig
      after hard refresh.
- [x] Phase 1.2i — confirmed via Craig's re-upload that the v1.7 fix
      worked: RMS now tracks within ~10-20% of pure chunk-loss prediction
      (was off by 7x before). Remaining slight slope is genuine tonal
      wear (filter/saturation), now bounded correctly - a feature, not a
      bug.
- [x] Phase 1.3a — v1.8: independent stereo channel decay, per Craig's
      idea that real tape doesn't flake evenly across both tracks. L and
      R now have separate alive masks and separate RNG draws in all three
      files (tape-processor.js, index.html, disintegration_loops.py).
      Verified numerically: channels' surviving-chunk overlap is well
      below what identical decay would produce, and overall alive
      fractions diverge too (either channel can end up more intact,
      direction isn't fixed). Uploaded stereo files now stay stereo
      instead of being downmixed to mono. Waveform display shows both
      channels overlaid (R fainter) so divergence is visible.
      NOT YET confirmed by Craig by ear.
- [x] Phase 1.3b — removed the snapshot-slot feature (the tap-load /
      hold-save / double-tap-clear behavior on the 4 track buttons from
      Phase 1.1) and added two new performance controls instead: Bake and
      Stutter. Confirmed in tape-processor.js v1.9:
        - Bake: while held, instantly blends back some already-decayed
          audio (relief factor 0.6) via renderPreview(), rather than
          waiting for loop wrap. On release, snaps back to the true decay
          state and adds a 4-second wear penalty (2x kill rate) - the
          relief is borrowed, not free.
        - Stutter: freezes the real playhead at the anchor position and
          repeats a ~120ms chunk (with a short fade-in ramp) while held;
          on release, playback resumes exactly where it paused, so decay
          progress isn't lost and no part of the loop is skipped.
      OPEN GAP: index.html (the UI layer + what the 4 track buttons do
      now) wasn't available when this was logged, so the exact removal
      details on the UI side, and what if anything replaced the buttons'
      old tap/hold/double-tap behavior, aren't confirmed here yet.
      loadBuffer's alive-mask-threading plumbing is still present in
      tape-processor.js, so the removal may be UI-only - needs Craig to
      confirm whether the underlying save/load plumbing is still wired
      to anything or is now dead code to clean up.

- [x] Phase 1.3c — real bug found and fixed in disintegration_loops.py's
      apply_dropouts(): the ramp array defaulted to 1 (no kill) with only
      the ~24-sample edges reduced, leaving the interior of every "killed"
      chunk untouched - while `killed` still counted the FULL chunk span
      as destroyed. This let the while loop exit early believing far more
      damage had been done than actually had, making the standalone
      Python tool decay dramatically slower than tape-processor.js at
      identical settings (simulated: ~3000 generations to reach 20-45%
      alive and stall there, vs. the real/JS behavior of reaching near-
      total silence by generation ~30-35). Fixed to match
      tape-processor.js's mutateChannel exactly: interior defaults to
      fully killed (m=0), only the edges taper for a click-free fade.
      Verified against Craig's own maxed-settings (wear=100, dropout=100)
      browser render: confirmed loop length 3.0s (via envelope
      autocorrelation, harmonics at 3/6/9/12s), RMS drops to near-zero
      (0.03% of starting loudness) by generation ~30-35 in the real
      render - the fixed Python function now reproduces this curve
      almost exactly (0.04% alive by generation 39 in simulation).
      CONFIRMED WORKING - matches real render data, not yet re-run by
      Craig on his own machine.
- [x] Phase 1.3d — confirmed via Craig's zero-settings render that the
      baseline decay-even-at-zero behavior (hardcoded floors in
      killFraction/wear, independent of the wearRate/dropoutDensity
      faders - see the earlier high-end-loss discussion) is intentional
      and should stay: "zero" sliders should NOT mean frozen/pristine
      forever, some decay should always be happening, matching real tape
      that degrades a little no matter what. No code change needed here,
      this locks it as an intentional decision rather than a bug to fix.

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
Craig confirms the disintegration_loops.py apply_dropouts fix (Phase 1.3c)
on his own machine. After that: confirm the index.html side of Phase
1.3b (track button repurposing, dead loadBuffer plumbing), then pick
between Phase 1.2d (tuning the decay feel) or Phase 1.3 (real FWD/RWD
rocker behavior).

## Open questions (not yet decided)
- Now that snapshot slots are gone, are the 4 track buttons repurposed
  for Bake/Stutter/other, or unused? (index.html not seen yet - see
  Phase 1.3b gap above)
- Is the loadBuffer save/load + alive-mask-passing plumbing in
  tape-processor.js still needed for anything, or should it be cleaned
  out as dead code now that slots are gone?
- Should the Reverse button become a real rocker (hold to fast-forward/
  rewind, tap to skip) per the real hardware, or stay a simple toggle?
- Should Freeze eventually be a hardware LED state (e.g. one LED pulses)?
- Firmware storage layout: how much eMMC space to reserve per loop slot,
  and per snapshot slot?
