"""CLI: `anm <project.json> <op> [json-args]`. Every command prints JSON."""
from __future__ import annotations

import argparse
import json
import sys

from . import midi, ops
from .model import Project
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="anm")
    p.add_argument("project")
    p.add_argument("op", choices=["new", "describe", "call", "export"])
    p.add_argument("args", nargs="?", default="{}",
                   help='JSON: for call {"op": "add_track", "args": {...}}; for export {"path": "out.mid"}')
    a = p.parse_args(argv)
    args = json.loads(a.args)
    path = Path(a.project)
    if a.op == "new":
        proj = Project(**{k: v for k, v in args.items() if k in ("title", "tempo")})
        proj.save(path)
        print(json.dumps(ops.describe(proj)))
        return 0
    proj = Project.load(path)
    if a.op == "describe":
        result = ops.describe(proj)
    elif a.op == "export":
        result = {"bytes": midi.export(proj, args["path"]), "path": args["path"]}
    else:
        fn = getattr(ops, args["op"], None)
        if fn is None or args["op"].startswith("_"):
            print(json.dumps({"error": f"unknown op {args['op']}"}))
            return 2
        try:
            result = fn(proj, **args.get("args", {}))
        except (ValueError, KeyError) as e:
            print(json.dumps({"error": str(e)}))
            return 1
        proj.save(path)
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
