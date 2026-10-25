"""Isolated native Cycles CPU hand QA, never touches the live scene."""
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector


root = Path(__file__).resolve().parents[3]
out = root / "work/mira-polish"
data = np.load(out / "hands-review.npz")
scene = bpy.context.scene
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 8
scene.render.resolution_x = scene.render.resolution_y = 384
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"
scene.world.color = (.13, .13, .13)
cam_data = bpy.data.cameras.new("Hand_CPU_QA")
cam_data.type = "ORTHO"
cam_data.ortho_scale = .21
cam = bpy.data.objects.new("Hand_CPU_QA", cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam
center = Vector((-.46, -.005, .692))  # game XYZ -> Blender X,-Z,Y
for name, pos, energy in [("Key", (-1, -2, 3), 100), ("Fill", (2, 1, 2), 70)]:
    lamp = bpy.data.lights.new(name, "AREA")
    lamp.energy = energy
    lamp.size = 2
    obj = bpy.data.objects.new(name, lamp)
    bpy.context.collection.objects.link(obj)
    obj.location = center+Vector(pos)
    obj.rotation_euler = (center-obj.location).to_track_quat("-Z", "Y").to_euler()
mat = bpy.data.materials.new("Geometry_QA_gray")
mat.use_nodes = True
shader = mat.node_tree.nodes.get("Principled BSDF")
shader.inputs["Base Color"].default_value = (.5, .5, .5, 1)
shader.inputs["Roughness"].default_value = .8
faces = data["faces"]
mask = ((data["before"][:, 0] < -.38) & (data["before"][:, 1] < .82))
faces = faces[mask[faces].all(1)]
for variant in ["before", "after"]:
    coords = data[variant][:, [0, 2, 1]].copy()
    coords[:, 1] *= -1
    mesh = bpy.data.meshes.new(variant)
    mesh.from_pydata(coords.tolist(), [], faces.tolist())
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(variant, mesh)
    bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    for name, direction in [("front", (0, -1, 0)), ("back", (0, 1, 0)),
                            ("left", (-1, 0, 0)), ("right", (1, 0, 0)),
                            ("top", (0, 0, 1)), ("bottom", (0, 0, -1))]:
        path = out / f"hand-{variant}-{name}.png"
        assert not path.exists(), "Preserve prior QA image"
        cam.location = center+Vector(direction)
        cam.rotation_euler = (center-cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(obj, do_unlink=True)
print("CPU native hand QA complete", file=sys.stdout)
