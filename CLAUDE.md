# Working on agent-native-music
- Python 3.10+, core is stdlib-only; keep it that way (MCP is an optional extra).
- All project mutations go through `src/anm/ops.py`; adapters (`cli.py`, `mcp_server.py`) stay thin.
- Output must stay deterministic (no timestamps/randomness in MIDI or JSON).
- Test: `PYTHONPATH=src python3 -m unittest discover -s tests`
