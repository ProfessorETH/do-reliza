"""Rebuild only the Release3D collection with Blender's supported Python CLI.

blender --background --factory-startup --python art/blender/build.py
For the live MCP workflow, execute runner, office recipe, characters recipe,
then export_assets in that order, setting PROJECT_ROOT to this repository.
"""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2].as_posix()
for script in ['runner.py', 'office_recipe.py', 'characters_recipe.py', 'export_assets.py']:
    source = Path(__file__).parent / script
    exec(compile(source.read_text(encoding='utf-8'), str(source), 'exec'), globals())
