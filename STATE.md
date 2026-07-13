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
- Wow & Flutter is a live FX control, not a decay parameter - it doesn't
  permanently mutate the loop (no buffer/alive-mask changes), so it
  should NOT be gated by decayFraction like wearRate/highEndLoss/
  dropoutDensity are. Confirmed by Craig; implemented in
  tape-processor.js v1.10 (Phase 1.3e).
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
  STATE.md, README.md all sit in the repo root together.
  launch-sp1.command still exists locally as a dev convenience but is
  gitignored, not tracked - README no longer references it.
- Hardware spec claims in README/STATE.md (nRF52840, Cortex-M4 @ 64MHz,
  256KB RAM, I2S 48kHz/24-bit, TAS2505, CS42L42, 4GB eMMC, resistor-ladder
  buttons + GPIO Function button, 8 LEDs) were checked 2026-07-13 against
  dot-Justin/SP-1-knowledgebase-skill (community-sourced reference library)
  and confirmed accurate - no corrections needed. Two details worth
  carrying forward for Phase 2/3: nRF52840 runs I2S as SLAVE (CS42L42
  generates LRCLK, must be initialized via I2C first); the 8 LEDs are
  addressed as two separate PWM groups on real hardware (4 Track on PWM2,
  4 Play on PWM3), not one linear bank, which may matter if the "decay
  meter" framing needs to map to real LED registers later.
- Phase 2 eMMC layout direction (research only, no code yet): reviewed
  chattock/sp1-tape-looper (real shipped SP-1 firmware, same hardware) as
  a concrete reference. Its per-track ring buffers are ~16384 samples
  (~341ms) for both play read-ahead and record backlog - this is the
  empirically-tuned safety margin against eMMC housekeeping stalls, tried
  smaller (8192/170ms - insufficient) and larger (32768/682ms - wasteful
  once other fixes landed). It also uses ONE SHARED ring rather than one
  per track/slot, which held up better under RAM pressure. Since this
  project only ever has one active decay buffer (not 4 simultaneous
  stems), the architecture is already naturally in the "one ring" case -
  no redesign implied, just a confirmation. Working assumption for
  Phase 2: favor a single persistent buffer + cumulative alive-mask,
  written back in place each loop pass, over a ring of discrete
  per-generation eMMC slots - this matches the existing in-place-mutation
  decay model more closely than a multi-slot scheme would. If a slotted
  layout is chosen instead, round each region to a 4096-block (2MB)
  multiple to stay page-aligned (chattock's own convention).

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

- [x] Phase 1.3e — v1.10: decoupled Wow & Flutter from decayFraction per
      Craig's call that it's a live FX (perturbs playback speed only,
      never touches the buffer or alive mask), not a permanent decay
      parameter, so it shouldn't be gated by wear progress like the other
      3 faders are. In tape-processor.js: `depth = decayFraction*wowFlutter`
      -> just `p.wowFlutter` directly; audible from generation 1 now,
      independent of wearRate. Also raised the ceiling per Craig's
      request: `rate = 1 + wobble*depth*0.01` -> `...*0.05` (was ~1% max
      speed wobble even at full fader + full decay, ~17 cents, barely
      perceptible; now ~5% at max fader, clearly audible wow/flutter).
      GAPS NOT YET CLOSED (need index.html / a look at the CLI's actual
      exposed params to finish this properly):
        - index.html's offlineMutateGeneration() duplicates mutateBuffer()
          by hand per the Phase 1.2a caveat - this same edit needs
          mirroring there or Quick Export will still use the old
          decay-gated, capped-at-1% flutter behavior. NOT DONE, no
          index.html available this session.
        - disintegration_loops.py's apply_wow_flutter() was already
          divergent before this change - it has no wowFlutter CLI
          argument at all, it's hardcoded to `depth=decay_fraction*0.5`
          inside process_channel() with no independent fader exposed.
          Left as-is since there's no equivalent "FX slider" concept in
          the batch CLI tool; flagging in case Craig wants a
          --wow-flutter CLI arg added to match the new decoupled/FX
          framing, but no change made without that decision.
      NOT YET confirmed by Craig by ear.

- [x] Phase 1.3f — closed the Phase 1.3e gap: index.html's
      offlineMutateChannel() (Quick Export path) now matches
      tape-processor.js v1.10 - wobbleDepth is set directly from
      params.wowFlutter, no longer gated by decayFraction, so exported
      WAVs now have audible flutter from generation 1 matching live
      playback. Also fixed the on-page Guide text, which still described
      the old decay-gated behavior ("grows as the loop decays") -
      reworded to state it's a live, reversible effect, and retitled the
      "Faders (decay parameters)" section to plain "Faders" since Wow &
      Flutter isn't one. Removed launch-sp1.command from README (repo
      structure list and local-run instructions) since Craig gitignored
      it - it's still a useful local dev convenience, just not tracked.
      disintegration_loops.py's hardcoded wow/flutter (no CLI arg) is
      still an open question below, untouched.

- [x] Phase 1.3g — removed `disintegration_loops.py` entirely. Craig
      confirmed he's never actually used the standalone CLI tool - it
      wasn't wired into anything (no build step, no import from
      index.html/tape-processor.js), so it was pure sync-maintenance
      burden: every decay-math fix (1.2e, 1.2f, 1.2h, 1.3a, 1.3c) had to
      be hand-mirrored into it, and it had already drifted anyway (its
      decay_fraction curve is generation-count-based, not wearRate-
      driven like the browser, and its wow/flutter was still hardcoded
      with no fader - see Phase 1.3e/f). Removed from README (structure
      list, "Running the offline version" section) and from STATE.md's
      repo layout. Historical Phase 0/1.2e/1.2f/1.2h/1.3a/1.3c/1.3e/1.3f
      entries below still reference it by name since they're an accurate
      record of what happened at the time - only the two current-state
      implementations (tape-processor.js, index.html) need to stay in
      sync going forward.

- [x] Phase 1.3h — cleanup pass, no functional changes: fixed index.html's
      version badge (was stuck at v1.8, tape-processor.js has been v1.10
      since 1.3e - the file header's own "keep in sync" comment had gone
      stale). Removed dead CSS (`button.extrabtn`/`.extrabtn.on`, never
      referenced by any element - `extraghost` is the class actually
      used for "Load your own loop..."). Removed the unreachable
      alive-mask/generation/decayFraction threading in tape-processor.js's
      loadBuffer handler - index.html never sent those fields (leftover
      from the Phase 1.1 snapshot-slot concept, removed in 1.3b), so
      every load already always reset fresh; the handler now just does
      that directly instead of pretending to accept saved state. This
      resolves the two open questions below about dead loadBuffer
      plumbing.

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

- [x] Phase 1.3i — research pass, no code changes: verified all hardware
      spec claims against dot-Justin/SP-1-knowledgebase-skill (accurate,
      see locked decisions above) and pulled concrete Phase 2 storage
      guidance from chattock/sp1-tape-looper's real shipped firmware
      (ring buffer sizing, shared-vs-per-slot ring tradeoff, page
      alignment - see locked decisions above). Confirmed the real FWD/RWD
      behavior on stock firmware is variable-speed eMMC block-skipping
      (2.5x/4x/8x/16x tiers via reading fewer bytes/sector), not a simple
      playback-rate multiplier - relevant once Phase 1.3's rocker work
      moves past the browser prototype into real disk-backed streaming.

## Next action
disintegration_loops.py is removed and the loadBuffer dead-code question
is resolved, so the two remaining implementations (tape-processor.js,
index.html) are the only ones that need to stay in sync, and both have
now been read in full - the Phase 1.3b gap (track buttons are Stutter/
Freeze/Bake/Reset tape, confirmed) is closed too. Pick between Phase
1.2d (tuning the decay feel) or Phase 1.3 (real FWD/RWD rocker
behavior).

## Open questions (not yet decided)
- Should the Reverse button become a real rocker (hold to fast-forward/
  rewind, tap to skip) per the real hardware, or stay a simple toggle?
- Should Freeze eventually be a hardware LED state (e.g. one LED pulses)?
- Firmware storage layout: how much eMMC space to reserve per loop slot,
  and per snapshot slot?
