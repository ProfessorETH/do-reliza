"""Native six-side CPU QA of the shirt/collar contact. No live scene access."""
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


root = Path(__file__).resolve().parents[3]
out = root/"work/mira-polish"
d = np.load(out/"bodytop-native-final.npz")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
p = d["positions"][:, [0, 2, 1]].copy()
p[:, 1] *= -1
for name, faces, color in [("Body_neck_native", d["faces"], (.32, .32, .32, 1)),
                            ("Crewneck_join", d["collar"], (.11, .11, .042, 1))]:
    faces = faces[(d["positions"][faces, 1] > 1.22).all(1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(p.tolist(), [], faces.tolist())
    mesh.update()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = .92
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 8
scene.render.resolution_x = scene.render.resolution_y = 384
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"
scene.world.color = (.13, .13, .13)
center = Vector((0, 0, 1.32))
for name, pos, energy in [("Key", (-1, -2, 3), 100), ("Fill", (2, 1, 2), 70)]:
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.size = energy, 2
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = center+Vector(pos)
    obj.rotation_euler = (center-obj.location).to_track_quat("-Z", "Y").to_euler()
data = bpy.data.cameras.new("Bodytop_CPU_QA")
data.type, data.ortho_scale = "ORTHO", .60
camera = bpy.data.objects.new("Bodytop_CPU_QA", data)
bpy.context.collection.objects.link(camera)
scene.camera = camera
for name, direction in [("front", (0, -1, 0)), ("back", (0, 1, 0)), ("left", (-1, 0, 0)),
                        ("right", (1, 0, 0)), ("top", (0, 0, 1)), ("bottom", (0, 0, -1))]:
    path = out/f"bodytop-native-{name}.png"
    assert not path.exists()
    camera.location = center+Vector(direction)
    camera.rotation_euler = (center-camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
print("Native CPU bodytop six-side QA rendered")
