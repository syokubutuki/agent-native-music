# Codex task queue

Format: see `AGENTS.md`. One file per task. Status line at the bottom of each file.

| ID | Title | Status |
|---|---|---|
| T-001 | Composition spec loader + realizer (YAML → Score) | done (executed by: claude) |
| T-002 | MIDI export/import with round-trip tests | done (executed by: claude) |
| T-003 | Built-in subtractive synth + synthesized drums/FX | done (executed by: claude) |
| T-004 | Mixer: strips, groups, returns, automation, sidechain, true-peak limiter, LUFS target | done (executed by: claude) |
| T-005 | Audio analysis (Layer 2) + report + overview plot | done (executed by: claude) |
| T-006 | Layer 1 rule checks (symbolic + audio) | done (executed by: claude) |
| T-007 | Candidate generation, batch render, preference log | done (executed by: claude) |
| T-010 | Validate VST3 backend with Surge XT on Windows | **open** |
| T-011 | Windows smoke test + install notes | **open** |
| T-012 | Synthesis performance (unison filtering) | **open** |
| T-013 | Per-note synth parameter automation | **open** |
| T-014 | Staged search 128 → 32 → 8 → 3 | **open** |
| T-015 | Shared / bass-anchored chord voicing across tracks | **open** |
| T-016 | kick/bass overlap diagnostics per section | **open** |

Codex was not available in the initial cloud session (DECISIONS.md D-007); T-001–T-007 were specified
here first and then implemented by Claude under the same acceptance criteria.
