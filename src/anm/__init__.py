"""agent-native-music: text-first music project core."""
from .model import Note, Track, Project
from . import ops, midi

__all__ = ["Note", "Track", "Project", "ops", "midi"]
