"""Provenance: every render records exactly what produced it."""
from __future__ import annotations

import hashlib
import platform
import re
import subprocess
import sys
from datetime import datetime, timezone
from importlib import metadata
from pathlib import Path

from .spec import PROJECT_ROOT

LIBS = ["numpy", "scipy", "numba", "pedalboard", "soundfile", "mido", "pyloudnorm", "PyYAML"]


def git_info() -> dict:
    def run(*a):
        return subprocess.run(["git", *a], cwd=PROJECT_ROOT, capture_output=True, text=True).stdout.strip()

    try:
        return {"commit": run("rev-parse", "HEAD"), "branch": run("rev-parse", "--abbrev-ref", "HEAD"),
                "dirty": bool(run("status", "--porcelain", "--", "src", "instruments", "songs"))}
    except (OSError, subprocess.SubprocessError):
        return {"commit": None, "branch": None, "dirty": None}


def file_hash(p: Path) -> str:
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()[:16]


def lib_versions() -> dict:
    out = {}
    for lib in LIBS:
        try:
            out[lib] = metadata.version(lib)
        except metadata.PackageNotFoundError:
            out[lib] = None
    return out


def next_render_id(base_dir: Path, song_id: str, label: str | None = None) -> str:
    base_dir.mkdir(parents=True, exist_ok=True)
    nums = [int(m.group(1)) for d in base_dir.iterdir() if (m := re.match(rf"{re.escape(song_id)}_v(\d+)", d.name))]
    v = max(nums, default=0) + 1
    rid = f"{song_id}_v{v:03d}"
    return f"{rid}_{label}" if label else rid


def rel(p) -> str:
    p = Path(p).resolve()
    return str(p.relative_to(PROJECT_ROOT)).replace("\\", "/") if p.is_relative_to(PROJECT_ROOT) else str(p)


def manifest(spec, render_id: str, files: list[Path], seed: int, argv: list[str] | None = None, extra=None) -> dict:
    return {
        "render_id": render_id,
        "created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "command": " ".join(argv or sys.argv),
        "git": git_info(),
        "spec_path": rel(spec.path),
        "spec_hash": spec.content_hash(),
        "source_files": {rel(f): file_hash(f) for f in files},
        "seed": seed,
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "libs": lib_versions(),
        **(extra or {}),
    }
