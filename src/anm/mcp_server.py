"""MCP server exposing anm ops as tools. Requires `pip install .[mcp]`.

Every tool takes `project` (path to project JSON), loads, applies, saves, and
returns the op result. State lives in the file, so the server is stateless.
"""
from __future__ import annotations

from . import midi, ops
from .model import Project


def main() -> None:
    from mcp.server.fastmcp import FastMCP

    mcp = FastMCP("agent-native-music")

    def edit(project: str, fn, **kw):
        proj = Project.load(project)
        result = fn(proj, **kw)
        proj.save(project)
        return result

    @mcp.tool()
    def new_project(project: str, title: str = "Untitled", tempo: float = 120.0) -> dict:
        Project(title=title, tempo=tempo).save(project)
        return {"created": project}

    @mcp.tool()
    def describe(project: str) -> dict:
        return ops.describe(Project.load(project))

    @mcp.tool()
    def set_tempo(project: str, bpm: float) -> dict:
        return edit(project, ops.set_tempo, bpm=bpm)

    @mcp.tool()
    def add_track(project: str, name: str, program: int = 0) -> dict:
        return edit(project, ops.add_track, name=name, program=program)

    @mcp.tool()
    def add_notes(project: str, track: str, notes: list[dict]) -> dict:
        """notes: [{pitch: 60 or 'C4', start: beats, duration: beats, velocity?: 1-127}]"""
        return edit(project, ops.add_notes, track=track, notes=notes)

    @mcp.tool()
    def transpose(project: str, track: str, semitones: int) -> dict:
        return edit(project, ops.transpose, track=track, semitones=semitones)

    @mcp.tool()
    def export_midi(project: str, path: str) -> dict:
        return {"bytes": midi.export(Project.load(project), path), "path": path}

    mcp.run()


if __name__ == "__main__":
    main()
