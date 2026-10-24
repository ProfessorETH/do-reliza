"""Build/export in a fresh Blender CPU process; leaves the live office untouched."""

import sys
from pathlib import Path

PROJECT_ROOT = str(Path(sys.argv[sys.argv.index("--") + 1]).resolve())
CHARACTER_IDS = sys.argv[sys.argv.index("--") + 2 :] or [
    "mira",
    "pixel",
    "nord",
    "iskra",
    "saga",
    "echo",
]
for filename in ["build_team.py", "export_team.py"]:
    path = Path(PROJECT_ROOT) / "art/characters" / filename
    exec(compile(path.read_text(encoding="utf-8"), str(path), "exec"))
