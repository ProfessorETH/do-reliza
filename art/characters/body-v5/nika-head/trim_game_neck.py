"""Root-authorized skin-neck-only open clip; stable art head is immutable."""
import hashlib
import json
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Vector

source, selection_path, output = [Path(v).resolve() for v in sys.argv[sys.argv.index("--")+1:][:3]]
assert source != output and not output.exists()
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
selection = json.loads(selection_path.read_text(encoding="utf-8"))
assert selection["source_sha256"] == source_hash
cut = selection["source_cut_gltf_y"]
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]
assert len(objects) == 1
obj = objects[0]
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bm = bmesh.new()
bm.from_mesh(obj.data)
uv = bm.loops.layers.uv.active
selected_keys = {tuple(tuple(v) for v in key) for key in selection["selected_face_keys_position_uv_5dp"]}


def key(face):
    return tuple(sorted(tuple(round(float(x), 5) for x in
        (loop.vert.co.x, loop.vert.co.z, -loop.vert.co.y, loop[uv].uv.x, loop[uv].uv.y))
        for loop in face.loops))


face_tag = bm.faces.layers.int.new("OwnedSkinNeckClip")
vertex_tag = bm.verts.layers.int.new("OwnedSkinNeckVertices")
faces = [f for f in bm.faces if key(f) in selected_keys]
assert len(faces) == selection["selected_face_count"], "Measured skin-face signature mismatch"
geometry = set(faces)
for face in faces:
    face[face_tag] = 1
    geometry.update(face.edges)
    geometry.update(face.verts)
    for vertex in face.verts:
        vertex[vertex_tag] = 1
bmesh.ops.bisect_plane(bm, geom=list(geometry), dist=1e-7,
                       plane_co=Vector((0,0,cut)), plane_no=Vector((0,0,1)))
selected_after = [f for f in bm.faces if f[face_tag] == 1]
crossing = [f for f in selected_after if min(v.co.z for v in f.verts) < cut-1e-6
            and max(v.co.z for v in f.verts) > cut+1e-6]
assert not crossing, "Selected skin still crosses clip plane"
remove = [f for f in selected_after if max(v.co.z for v in f.verts) <= cut+1e-6
          and f.calc_center_median().z < cut-1e-7]
assert remove
removed_faces = len(remove)
bmesh.ops.delete(bm, geom=remove, context="FACES_ONLY")
orphaned = [v for v in bm.verts if v[vertex_tag] and not v.link_faces]
bmesh.ops.delete(bm, geom=orphaned, context="VERTS")
ring_edges = [e for e in bm.edges if e.is_boundary and all(abs(v.co.z-cut)<1e-6 for v in e.verts)]
assert ring_edges, "Expected an open skin-neck cut ring"
ring = sorted({tuple(float(c) for c in v.co) for e in ring_edges for v in e.verts})
bm.faces.layers.int.remove(face_tag)
bm.verts.layers.int.remove(vertex_tag)
bm.normal_update()
bm.to_mesh(obj.data)
bm.free()
obj.data.update()
obj.name = "NikaHead_GameSkinNeckClip"
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
                         export_animations=False, export_image_format="AUTO")
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
record = dict(status="completed_native_skin_clip", source=str(source), source_sha256=source_hash,
              output=str(output), output_sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
              selection_receipt_sha256=hashlib.sha256(selection_path.read_bytes()).hexdigest(),
              world_cut_y=selection["world_cut_y"], source_cut_gltf_y=cut,
              cut_only_measured_skin_faces=len(faces), removed_skin_faces=removed_faces,
              open_ring_edges=len(ring_edges), open_ring_points_blender=ring,
              new_cap_added=False, hair_faces_selected=0, gpu_used=False,
              source_art_unchanged=True)
output.with_suffix(".receipt.json").write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print("NIKA_GAME_NECK_CLIP_READY", json.dumps(record), flush=True)
