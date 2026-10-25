"""CPU-only native presentation QA; never changes the source head GLB."""
import hashlib
import json
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector

source, output = [Path(p).resolve() for p in sys.argv[sys.argv.index("--")+1:][:2]]
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
output.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source), merge_vertices=True)
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
coords = np.empty(len(obj.data.vertices)*3, dtype=np.float32)
obj.data.vertices.foreach_get("co", coords)
coords = coords.reshape(-1,3)
transform = np.array(obj.matrix_world)
coords = coords @ transform[:3,:3].T + transform[:3,3]
low = Vector(coords.min(0))
high = Vector(coords.max(0))
center = (low+high)/2
camera_data = bpy.data.cameras.new("CPU_QA_Camera")
camera = bpy.data.objects.new("CPU_QA_Camera", camera_data)
bpy.context.collection.objects.link(camera)
camera_data.type = "ORTHO"
camera_data.ortho_scale = max(high-low)*1.12
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 12
scene.render.resolution_x = scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.18, .20, .24, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .22
for name, position, energy in [("Key", (-2,-3,4), 450), ("Fill", (3,-1,2), 180)]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = 4
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = center + Vector(position)
    light.rotation_euler = (center-light.location).to_track_quat("-Z", "Y").to_euler()
if "--gray" in sys.argv:
    material = bpy.data.materials.new("B_NativeGeometry_QA_Gray")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (.55,.55,.55,1)
    shader.inputs["Roughness"].default_value = .8
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
outputs = []
for name, direction in [("front", (0,-4,0)), ("three-quarter", (3,-4,0)), ("back", (0,4,0)), ("left", (-4,0,0)), ("right", (4,0,0))]:
    camera.location = center + Vector(direction)
    camera.rotation_euler = (center-camera.location).to_track_quat("-Z", "Y").to_euler()
    path = output/(name+".png")
    assert not path.exists(), "Presentation image exists; preserve prior QA"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    outputs.append(dict(name=name, path=str(path), sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
(output/"receipt.json").write_text(json.dumps(dict(source=str(source), source_sha256=source_hash,
    engine="Native Cycles CPU", bounds_blender=[list(low),list(high)], center_blender=list(center), ortho_scale=camera_data.ortho_scale, samples=12, outputs=outputs, gpu_used=False,
    source_unchanged=True), indent=2)+"\n", encoding="utf-8")
