# agent-native-music

Music production designed for AI agents as first-class users, not a GUI with a chatbot bolted on.

## Principles
1. **Text-first project format** – a project is one JSON file: diffable, greppable, patchable.
2. **Small typed operations** – one op API (`anm.ops`) shared by the CLI and the MCP server.
3. **Observable** – `describe` summarizes the project so an agent can "see" it cheaply.
4. **Deterministic** – same project => byte-identical MIDI. Easy to test and to review in git.
5. **Stateless tools** – state lives in the project file; every call loads, edits, saves.

See [docs/DESIGN.md](docs/DESIGN.md) for architecture and roadmap.

## Quick start
```bash
pip install -e .            # core has zero dependencies
anm demo.json new '{"title":"demo","tempo":110}'
anm demo.json call '{"op":"add_track","args":{"name":"lead","program":80}}'
anm demo.json call '{"op":"add_notes","args":{"track":"lead","notes":[{"pitch":"C4","start":0,"duration":1},{"pitch":"E4","start":1,"duration":1}]}}'
anm demo.json describe
anm demo.json export '{"path":"out/demo.mid"}'
```

### As an MCP server (Claude Code / any MCP client)
```bash
pip install -e '.[mcp]'
claude mcp add anm -- anm-mcp
```

## Tests
```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```
