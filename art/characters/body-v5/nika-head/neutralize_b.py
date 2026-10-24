"""Apply measured B-only GLTF eye/nose yaw/roll frame; immutable clean source."""
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Matrix

source, frame_path, output = [Path(v).resolve() for v in sys.argv[sys.argv.index("--")+1:][:3]]
assert not output.exists() and source != output
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
frame = json.loads(frame_path.read_text(encoding="utf-8"))
assert frame["source_sha256"] == source_hash
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source), merge_vertices=True)
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
C = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
transform = C @ Matrix(frame["transform_gltf_4x4"]) @ C.inverted()
for vertex in obj.data.vertices:
    vertex.co = transform @ vertex.co
obj.data.update()
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True, export_animations=False)
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
record = dict(status="completed", source=str(source), source_sha256=source_hash,
              output=str(output), output_sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
              frame_receipt_sha256=hashlib.sha256(frame_path.read_bytes()).hexdigest(),
              method="Measured actual3D eye-line + nose forward check; rigid yaw/roll neutralization only",
              transform_gltf_4x4=frame["transform_gltf_4x4"], triangles=len(obj.data.polygons),
              source_unchanged=True, gpu_used=False)
output.with_suffix(".receipt.json").write_text(json.dumps(record,indent=2)+"\n",encoding="utf-8")
print("HEAD_B_NEUTRAL_READY", json.dumps(record), flush=True)
