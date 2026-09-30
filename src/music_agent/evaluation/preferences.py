"""Layer 4: human A/B(/C) choices, stored append-only for future preference learning.

Record (one JSON object per line in feedback/preferences.jsonl):
    {
      "ts": "2026-09-30T12:00:00+00:00",
      "comparison": ["track_001_v003", "track_001_v004"],   # render/candidate ids shown
      "preferred": "track_001_v004",                         # or null for "neither"
      "reason": "melody",                                    # free tag: melody|harmony|sound|mix|energy|...
      "aspects": {"melody": "cand_02", "sound": "cand_03"},  # optional per-aspect picks
      "note": "drop feels bigger",                          # free text direction
      "context": {"song": "track_001", "batch": "melody_b001"}
    }

Pairwise records are the input format expected by Bradley-Terry / Thurstone
style ranking or Bayesian preference models later (see EVALUATION.md).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from ..spec import PROJECT_ROOT

DEFAULT_PATH = PROJECT_ROOT / "feedback" / "preferences.jsonl"


def record(comparison: list[str], preferred: str | None, reason: str = "", aspects: dict | None = None,
           note: str = "", context: dict | None = None, path: Path = DEFAULT_PATH) -> dict:
    if preferred is not None and preferred not in comparison:
        raise ValueError(f"preferred '{preferred}' not in comparison {comparison}")
    rec = {"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"), "comparison": comparison,
           "preferred": preferred, "reason": reason, "aspects": aspects or {}, "note": note, "context": context or {}}
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return rec


def load(path: Path = DEFAULT_PATH) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def pairwise(records: list[dict]) -> list[tuple[str, str, str]]:
    """Expand multi-way choices into (winner, loser, reason) pairs."""
    out = []
    for r in records:
        w = r.get("preferred")
        if not w:
            continue
        out += [(w, other, r.get("reason", "")) for other in r["comparison"] if other != w]
    return out


def win_counts(records: list[dict]) -> dict[str, dict[str, int]]:
    c: dict[str, dict[str, int]] = {}
    for w, l, _ in pairwise(records):
        c.setdefault(w, {"wins": 0, "losses": 0})["wins"] += 1
        c.setdefault(l, {"wins": 0, "losses": 0})["losses"] += 1
    return c
