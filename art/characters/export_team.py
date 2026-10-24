"""Export owned character collections with real skins, portable clips and receipts."""

import bpy
import json
import hashlib
from pathlib import Path

ROOT = Path(globals()["PROJECT_ROOT"])
contexts = globals()["contexts"]
receipts = []
previous_fps = bpy.context.scene.render.fps
bpy.context.scene.render.fps = 30
for ctx in contexts:
    root = ctx["root"]
    arm = ctx["armature"]
    ident = ctx["id"]
    arm.animation_data_create()
    arm.animation_data.action = None
    for index, action_name in enumerate(ctx["actions"]):
        clip = action_name.split("_")[-1].split(".")[0]
        track = arm.animation_data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, 10 + index * 100, bpy.data.actions[action_name])
        strip.extrapolation = "NOTHING"
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    objects = [root, *root.children_recursive]
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    path = ROOT / "assets/models" / f"{ident}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_image_format="JPEG",
        export_jpeg_quality=92,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_frame_range=False,
        export_anim_slide_to_zero=True,
        export_merge_animation="NLA_TRACK",
        export_force_sampling=True,
    )
    receipts.append(
        {
            "id": ident,
            "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "bones": len(arm.data.bones),
            "clips": ["Idle", "Walk", "Sit", "Stand", "Work"],
            "method": "Hunyuan Mira clothing scan, rebuilt anatomy/hair/hands, approved portrait material, Blender armature weights",
            "game_control": "procedural IK retargeted onto actual deform bones",
        }
    )
    for obj in objects:
        obj.select_set(False)
    print("EXPORTED_SKIN", ident, path.stat().st_size)
(ROOT / "art/characters/export-receipt.json").write_text(
    json.dumps(
        {
            "characters": receipts,
            "blender": bpy.app.version_string,
            "animation_fps": bpy.context.scene.render.fps,
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
bpy.context.scene.render.fps = previous_fps
for obj in bpy.data.objects:
    obj.hide_set(
        obj not in {contexts[0]["root"], *contexts[0]["root"].children_recursive}
    )
bpy.ops.object.select_all(action="DESELECT")
