# Design

## Goal
Let an agent compose, edit, and render music through a small, reliable tool surface, with results a human can review in git and listen to.

## Layers
```
agent  ──MCP/CLI──▶  ops (validated edits)  ──▶  Project (JSON)  ──▶  renderers (MIDI, later audio)
```
- `model.py` – dataclasses + JSON I/O. Time in beats, pitch as MIDI numbers (note names accepted at the ops boundary).
- `ops.py` – the only place that mutates a project. Each op validates, mutates, returns a compact result dict. Errors are `ValueError`/`KeyError` with actionable messages.
- `midi.py` – dependency-free SMF writer.
- `cli.py`, `mcp_server.py` – thin adapters; no logic of their own.

## Decisions
- **JSON over a proprietary DAW format**: agents edit text well; git diffs work. Trade-off: no audio/plugin state (out of scope for v0).
- **Beats not seconds**: tempo changes don't rewrite notes.
- **MIDI first**: universal, cheap to verify. Audio comes from rendering MIDI, not from the model.
- **Stateless server**: no session bugs; safe to run several agents on different files.

## Roadmap
1. Ops: delete/move/quantize notes, chords, scale-aware helpers, drum patterns, loops/sections.
2. Analysis tools for agents: pianoroll ASCII view, pitch histogram, key detection, density per bar.
3. Rendering: FluidSynth/`pretty_midi` → WAV; loudness check; waveform/spectrogram summary the agent can inspect.
4. DAW bridge: OSC/MIDI to Reaper/Ableton (via ReaScript / AbletonOSC) for live sessions.
5. Eval harness: prompts → project → automated checks (in key, within range, structure) to measure agent quality.
6. Undo/history: op log stored alongside the project.

## Open questions
- Which DAW (if any) should be the first bridge target?
- Genre/style focus for the eval set?
