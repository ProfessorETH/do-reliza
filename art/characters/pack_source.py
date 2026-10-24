"""Pack final GLBs into a self-contained Blender source in a fresh CLI process.

Use --background --factory-startup. A live Scene library-write timed out after
the GLBs were exported; this normal save never touches the user's live office.
"""

import sys
from pathlib import Path
import bpy

root = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
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
bpy.ops.wm.save_as_mainfile(
    filepath=str(root / "art/characters/team-rigged-v3.blend"), compress=True
)
print("TEAM_SOURCE_SAVED", flush=True)
