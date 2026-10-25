"""Reduce an owned Hunyuan head for texture generation without changing its form."""

import sys
import hashlib
import time
import json
from pathlib import Path
import bpy
import bmesh

args = sys.argv[sys.argv.index("--") + 1 :]
source, output = [Path(value).resolve() for value in args[:2]]
assert not output.exists(), "Preserve existing B cleanup candidate"
started = time.time()
print("HEAD_B_CLEAN_STAGE", "import_merge_exact_duplicates", flush=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source), merge_vertices=True)
parts = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
if len(parts) > 1:
    bpy.ops.object.join()
obj = bpy.context.object
obj.name = "PortraitHead_Clean"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
original_vertices = len(obj.data.vertices)
print("HEAD_B_CLEAN_STAGE", "native_weld", original_vertices, flush=True)
bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(obj.data)
bm.free()
print("HEAD_B_CLEAN_STAGE", "mild_smooth_16x2", len(obj.data.vertices), flush=True)
smooth = obj.modifiers.new("Remove voxel stair edges", "SMOOTH")
smooth.factor = 0.16
smooth.iterations = 2
bpy.ops.object.modifier_apply(modifier=smooth.name)
tri = obj.modifiers.new("True triangle count", "TRIANGULATE")
bpy.ops.object.modifier_apply(modifier=tri.name)
original_faces = len(obj.data.polygons)
print("HEAD_B_CLEAN_STAGE", "native_decimate_60k", original_faces, flush=True)
reduce = obj.modifiers.new("60k head budget", "DECIMATE")
reduce.ratio = min(1, 60000 / original_faces)
bpy.ops.object.modifier_apply(modifier=reduce.name)
for polygon in obj.data.polygons:
    polygon.use_smooth = True
obj.data.validate()
obj.data.update()
bm = bmesh.new()
bm.from_mesh(obj.data)
report = {
    "source": str(source),
    "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "import_merge_vertices": True,
    "gpu_used": False,
    "elapsed_seconds": time.time()-started,
    "original_vertices": original_vertices,
    "original_triangles": original_faces,
    "vertices": len(obj.data.vertices),
    "triangles": len(obj.data.polygons),
    "boundary_edges": sum(edge.is_boundary for edge in bm.edges),
    "nonmanifold_edges": sum(not edge.is_manifold for edge in bm.edges),
    "dimensions_blender": list(obj.dimensions),
    "smoothing": {"factor": 0.16, "iterations": 2},
    "method": "Weld duplicate vertices, recalculate normals, mild smoothing, collapse decimation; no voxel re-meshing or change of identity geometry",
}
bm.free()
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(output),
    export_format="GLB",
    use_selection=True,
    export_animations=False,
)
output.with_suffix(".qc.json").write_text(
    json.dumps(report, indent=2) + "\n", encoding="utf-8"
)
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix(".blend")), compress=True)
print("CLEAN_HEAD", json.dumps(report), flush=True)
