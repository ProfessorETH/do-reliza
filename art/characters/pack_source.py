"""Pack final GLBs into a self-contained Blender source in a fresh CLI process.

Use --background --factory-startup. A live Scene library-write timed out after
the GLBs were exported; this normal save never touches the user's live office.
"""

import sys
import json
from pathlib import Path
import bpy

root = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
args = sys.argv[sys.argv.index("--") + 1 :]
versions = []
for ident in ["mira", "pixel", "nord", "iskra", "saga", "echo"]:
    raw = (root / "assets/models" / f"{ident}.glb").read_bytes()
    doc = json.loads(raw[20 : 20 + int.from_bytes(raw[12:16], "little")])
    versions.append(doc["asset"].get("extras", {}).get("portraitHeadVersion", 3))
assert len(set(versions)) == 1, "Inspect a mixed portrait export before packing"
source_name = "team-portrait-v4.blend" if versions[0] == 4 else "team-rigged-v3.blend"
destination = (
    Path(args[1]).resolve() if len(args) > 1 else root / "art/characters" / source_name
)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.scene.name = "TeamCharacterStudio"
bpy.context.scene.render.fps = 30
for i, ident in enumerate(["mira", "pixel", "nord", "iskra", "saga", "echo"]):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(root / "assets/models" / f"{ident}.glb"))
    added = set(bpy.data.objects) - before
    actor = next(o for o in added if o.get("agentId") == ident)
    actor.location.x += (i - 2.5) * 1.0
    for o in added:
        if o.type == "MESH" and o.data.materials:
            for m in o.data.materials:
                if m and m.use_nodes:
                    for node in m.node_tree.nodes:
                        if node.type == "TEX_IMAGE" and node.image:
                            node.image.pack()
    print("PACKED_SOURCE", ident, flush=True)
bpy.context.scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(destination), compress=True)
print("TEAM_SOURCE_SAVED", flush=True)
