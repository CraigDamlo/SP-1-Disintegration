# SP-1 Disintegration

A live, tweakable simulation of William Basinski's *Disintegration Loops*,
built as a browser instrument first, with the long-term goal of running
natively as custom firmware on the Teenage Engineering SP-1 stem player.

The core idea: audio doesn't get processed through a filter, it decays.
Each time a loop passes the playhead, the stored buffer itself is
permanently mutated — high end lost, chunks dropped, pitch destabilized,
noise floor rising — the same way magnetic tape oxide degrades a little
more with every pass through the heads. It's a one-way process. You can't
get the original back once it starts falling apart.

## Status

Phase 1 (browser prototype) is built and working. See [`STATE.md`](./STATE.md)
for exact progress, locked decisions, and the current next action — that file
is the source of truth for where the project actually is, kept short on
purpose so it's cheap to pick back up.

## Structure

Everything lives flat in the repo root (no subfolders):

```
index.html                  the instrument itself (was sp1-disintegration.html)
tape-processor.js           AudioWorklet processor (must stay next to the html)
disintegration_loops.py     standalone Python version, batch-renders decay generations to WAV
launch-sp1.command          double-click launcher, shows live server output, Ctrl+C to stop
STATE.md                    current project state, read this first
```

Firmware work (Phase 3) doesn't exist yet - when it starts, it'll likely get its own subfolder.

## Running the prototype

Live version (no setup needed): https://craigdamlo.github.io/SP-1-Disintegration/

To run it locally instead (useful offline, or while actively editing):
the audio engine runs on an AudioWorklet, which several browsers refuse
to load correctly from a file:// path, so it needs to be served:

```
python3 -m http.server 8000
```

(run from the repo root) then open http://localhost:8000/index.html

Or double-click `launch-sp1.command`, which does this for you and shows
live server output in Terminal.

Controls are modeled on the SP-1's physical layout: four faders (wear rate,
high-end loss, dropout density, wow & flutter) instead of the SP-1's four
track buttons, plus play/reverse/freeze/function/reset transport and an
8-LED decay meter.

## Running the offline version

```
python3 disintegration_loops.py my_loop.wav --generations 40
```

Renders every decay generation as a separate WAV, plus a concatenated
full_decay.wav covering the whole arc.

Renders every decay generation as a separate WAV, plus a concatenated
full_decay.wav covering the whole arc.

## Target hardware

The SP-1 is an unreleased Teenage Engineering stem player that a community
of developers (led by Tim Knapen: github.com/timknapen/SP-1-dev, with
flashing tools from Solderless: solderless.engineering) has turned into an
open nRF52840 dev platform, since TE never shipped official firmware or
documentation for it.

Relevant specs for this project: nRF52840 (Cortex-M4 @ 64MHz, 256KB RAM),
I2S audio at 48kHz/24-bit, TAS2505 speaker amp, CS42L42 headphone codec,
4GB eMMC storage, 8 LEDs, resistor-ladder buttons plus one GPIO Function
button.

This is unofficial, community-reverse-engineered hardware access. Custom
firmware carries real bricking risk - see the SP-1-dev repo's own
disclaimer before flashing anything.

## License

Add a license here once you've decided on one - MIT is the usual default
for this kind of hobbyist/firmware project if you want others to be able
to build on it freely.
