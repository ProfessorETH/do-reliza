"""Blender-native UV bake: preserve original head identity over Hunyuan side paint.

Only visible front surfaces receive the frontal identity reference. Rear/side
surfaces use multiview luminance with portrait-specific skin/hair palettes;
existing UVs and head shape are preserved.
"""

import sys
import hashlib
import time
import json
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index("--") + 1 :]
source, reference, output = [Path(value).resolve() for value in args[:3]]
TASK_ROOT = Path(__file__).resolve().parent
assert not output.exists(), "Task output already exists; inspect before any retry"
source_sha256 = hashlib.sha256(source.read_bytes()).hexdigest()
started = time.time()
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
parts = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
assert len(parts) == 1, "Inspect an unexpected multimesh paint output"
obj = parts[0]
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
original_coords = np.array([vertex.co[:] for vertex in obj.data.vertices])
render_center = (original_coords.min(axis=0) + original_coords.max(axis=0)) / 2
render_normalize = 1.15 / (
    2 * np.linalg.norm(original_coords - render_center, axis=1).max()
)
mask_center = render_center.copy()
mask_center[0] = 0.10648983027000383
mask_unit_scale = 2.0 / np.ptp(original_coords, axis=0).max()
# Anatomy masks use a virtual two-unit head; geometry and projection stay in raw source coordinates.
bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.000001)
seen = set()
islands = []
components = []
for vertex in bm.verts:
    if vertex in seen:
        continue
    stack = [vertex]
    seen.add(vertex)
    island = []
    while stack:
        vertex = stack.pop()
        island.append(vertex)
        for edge in vertex.link_edges:
            other = edge.other_vert(vertex)
            if other not in seen:
                seen.add(other)
                stack.append(other)
    components.append(island)
components.sort(key=len, reverse=True)
minimum_component = max(160, len(components[0]) * 0.01)
islands = [
    vertex
    for island in components[1:]
    if len(island) < minimum_component
    for vertex in island
]
floating_candidates_not_removed = 0
if islands:
    bmesh.ops.delete(
        bm, geom=islands, context="VERTS"
    )  # Same floating-debris cleanup as accepted six heads
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(obj.data)
bm.free()
for face in obj.data.polygons:
    face.use_smooth = True
obj.data.update()
assert len(obj.data.materials) == 1, "Inspect an unexpected material split"
old = obj.data.materials[0]
pbr = next(node for node in old.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
link = next(iter(pbr.inputs["Base Color"].links), None)
assert link and link.from_node.type == "TEX_IMAGE", (
    "A real root-owned Paint albedo is required; no gray fallback"
)
albedo = link.from_node.image
# Native full-body Paint already has teal hair. Retain this colour evidence
# across side curls instead of treating unclassified peripheral hair as skin.
tw, th = albedo.size
ap = np.empty(tw * th * 4, dtype=np.float32)
albedo.pixels.foreach_get(ap)
ap = ap.reshape(th, tw, 4)
uv_data = obj.data.uv_layers.active.data
loop_uv = np.array([uv_data[i].uv[:] for i in range(len(obj.data.loops))])
texel = np.clip((loop_uv * [tw, th]).astype(int), [0, 0], [tw - 1, th - 1])
colours = ap[texel[:, 1], texel[:, 0], :3]
colour_hair = np.clip((colours[:, 1] - colours[:, 0] - 0.004) / 0.025, 0, 1) * np.clip(
    (colours[:, 2] - colours[:, 0] + 0.003) / 0.025, 0, 1
)
native_teal_hair = np.zeros(len(obj.data.vertices))
np.maximum.at(
    native_teal_hair, [loop.vertex_index for loop in obj.data.loops], colour_hair
)

# Green irises are registered facial features, not teal hair. Retain source
# hardware gold separately so the hair palette cannot recolour the actual clip.
source_landmarks = json.loads(
    (TASK_ROOT / "landmarks_b_painted.json").read_text(encoding="utf-8")
)["source_points_gltf"]
registered_eye_protected = np.zeros(len(obj.data.vertices), dtype=bool)
for key in ["eye_left", "eye_right"]:
    ex, ez, front_depth = source_landmarks[key]
    for vertex in obj.data.vertices:
        vx, vy, vz = vertex.co
        ellipse = (
            ((vx - ex) * mask_unit_scale / 0.13) ** 2
            + ((vz - ez) * mask_unit_scale / 0.075) ** 2
        ) < 1
        if ellipse and abs(-vy - front_depth) * mask_unit_scale < 0.09:
            registered_eye_protected[vertex.index] = True
native_teal_hair[registered_eye_protected] = 0
colour_gold = (
    np.clip((colours[:, 1] / np.maximum(colours[:, 2], 0.005) - 1.8) / 0.6, 0, 1)
    * np.clip((2.4 - colours[:, 0] / np.maximum(colours[:, 1], 0.005)) / 0.5, 0, 1)
    * np.clip((colours[:, 0] - colours[:, 2] - 0.04) / 0.10, 0, 1)
)
native_gold = np.zeros(len(obj.data.vertices))
np.maximum.at(native_gold, [loop.vertex_index for loop in obj.data.loops], colour_gold)
portrait = bpy.data.images.load(str(reference))
w, h = portrait.size
pixels = np.empty(w * h * 4, dtype=np.float32)
portrait.pixels.foreach_get(pixels)
alpha = pixels.reshape(h, w, 4)[:, :, 3]
cols = np.flatnonzero((alpha > 0.5).sum(axis=0) > 4)
rows = np.flatnonzero((alpha > 0.5).sum(axis=1) > 4)
u0, u1 = cols[0] / w, (cols[-1] + 1) / w
v0, v1 = rows[0] / h, (rows[-1] + 1) / h
data = obj.data
coords = np.array([vertex.co[:] for vertex in data.vertices])
low = coords.min(axis=0)
high = coords.max(axis=0)
landmarks_path = source.parent / "landmarks_b_painted.json"
alignment = None
assert landmarks_path.exists() or "--paint-only" in args, (
    "Measured eye/mouth registration is required before identity baking"
)
if landmarks_path.exists():
    marks = json.loads(landmarks_path.read_text(encoding="utf-8"))
    r = marks["reference"]
    p = marks["paint_front"]
    ortho = marks["ortho_scale"]
    source_points = np.array(
        [
            [point[0] / p["width"], 1 - point[1] / p["height"], 1]
            for point in [*p["eyes"], p["mouth"]]
        ]
    )
    reference_points = np.array(
        [
            [point[0] / r["width"], 1 - point[1] / r["height"]]
            for point in [*r["eyes"], r["mouth"]]
        ]
    )
    alignment = np.linalg.solve(source_points, reference_points)
bm = bmesh.new()
bm.from_mesh(data)
tree = BVHTree.FromBMesh(bm)
weights = []
hair_weights = []
recolour_weights = []
gold_weights = []
appearance = json.loads((TASK_ROOT / "appearance_b.json").read_text(encoding="utf-8"))[
    source.parent.name
]
eye_z = (
    render_center[2]
    + (0.5 - sum(point[1] for point in p["eyes"]) / 2 / p["height"])
    * ortho
    / render_normalize
)
eye_z_world = eye_z
eye_z = (eye_z_world - mask_center[2]) * mask_unit_scale


def smooth_edge(value, start, width=0.12):
    t = max(0, min(1, (value - start) / width))
    return t * t * (3 - 2 * t)


for vertex in data.vertices:
    wx, wy, wz = vertex.co
    x, y, z = (np.array(vertex.co[:]) - mask_center) * mask_unit_scale
    front = smooth_edge(-vertex.normal.y, 0.08, 0.57)
    origin = Vector((vertex.co.x, float(low[1] - 0.5), vertex.co.z))
    hit, _, _, _ = tree.ray_cast(origin, Vector((0, 1, 0)), float(high[1] - low[1] + 1))
    visible = hit is not None and abs(hit.y - vertex.co.y) < 0.014 / mask_unit_scale
    if visible and abs(x) < 0.24 and eye_z - 0.55 < z < eye_z + 0.45:
        # Nose/lip surfaces remain within the reference's central facial area;
        # the lateral jaw/ear silhouette is deliberately excluded.
        front = 1
    weights.append(front if visible else 0)
    top = smooth_edge(z, eye_z + appearance["top_above_eyes"])
    neck = 1 - smooth_edge(-z, 0.56) * max(0, 1 - abs(x) / 0.30) * (
        1 - smooth_edge(y, 0.10, 0.15)
    )
    # Keep central cut-neck skin, while the longer peripheral bob remains hair.
    neck = max(
        smooth_edge(abs(x), 0.30, 0.15),
        smooth_edge(z, appearance["neck_hair_start"], 0.08),
    )
    back = smooth_edge(y, -0.18, 0.18) * smooth_edge(z, appearance["back_z"]) * neck
    side = (
        smooth_edge(abs(x), 0.49)
        * smooth_edge(y, -0.30)
        * smooth_edge(z, appearance["side_z"])
        * neck
    )
    projected_point = (
        np.array(
            [
                0.5 + (wx - render_center[0]) * render_normalize / ortho,
                0.5 + (wz - render_center[2]) * render_normalize / ortho,
                1,
            ]
        )
        @ alignment
    )
    px, py = int(projected_point[0] * w), int(projected_point[1] * h)
    reference_hair = 0
    reference_gold = 0
    reference_alpha = 0
    if 0 <= px < w and 0 <= py < h:
        red, green, blue, a = pixels.reshape(h, w, 4)[py, px]
        reference_alpha = float(a)
        if a > 0.5:
            light = 0.2126 * red + 0.7152 * green + 0.0722 * blue
            reference_gold = smooth_edge(green / max(blue, 0.005), 1.7, 0.4) * (
                1 - smooth_edge(red / max(green, 0.005), 2.4, 0.6)
            )
            if source.parent.name == "nika-head":
                reference_hair = smooth_edge(green - red, 0.01, 0.08) * smooth_edge(
                    blue - red, -0.005, 0.08
                )
            elif source.parent.name == "saga":
                reference_hair = smooth_edge(green / max(red, 0.01), 0.68, 0.12)
            elif source.parent.name == "mira":
                reference_hair = 1 - smooth_edge(green / max(red, 0.01), 0.57, 0.15)
            else:
                reference_hair = 1 - smooth_edge(light, 0.30, 0.22)
    reference_hair_colour = float(reference_hair)
    side_gate = max(smooth_edge(abs(x), 0.43), smooth_edge(z, eye_z + 0.20))
    reference_hair *= side_gate * neck
    # The front reference gives a better ear/side-lock boundary than a planar
    # height cut. Back anatomy still supplies the unseen crown and nape.
    side = (
        smooth_edge(abs(x), 0.67)
        * smooth_edge(y, -0.05)
        * smooth_edge(z, appearance["back_z"])
        * neck
    )
    temple = (
        smooth_edge(abs(x), 0.45, 0.10)
        * smooth_edge(y, -0.45, 0.15)
        * smooth_edge(z, eye_z + 0.03, 0.15)
    )
    outside_reference_hair = (
        (1 - reference_alpha)
        * smooth_edge(abs(x), 0.40, 0.10)
        * smooth_edge(z, -0.86, 0.10)
    )
    hair_weights.append(
        max(
            top,
            back,
            side,
            temple,
            reference_hair,
            outside_reference_hair,
            float(native_teal_hair[vertex.index]),
        )
    )
    if "ear_bounds" in appearance:
        ear_low, ear_high = appearance["ear_bounds"]
        ear_mask = 1
        for coordinate, start, end in zip([abs(x), y, z], ear_low, ear_high):
            ear_mask *= smooth_edge(coordinate, start - 0.025, 0.025) * (
                1 - smooth_edge(coordinate, end, 0.035)
            )
        hair_weights[-1] *= 1 - ear_mask
        weights[-1] *= 1 - ear_mask * reference_hair_colour
    mouth_z = (
        render_center[2]
        + (0.5 - p["mouth"][1] / p["height"]) * ortho / render_normalize
    )
    mouth_z = (mouth_z - mask_center[2]) * mask_unit_scale
    if hair_weights[-1] < 0.35 and (abs(x) > 0.37 or z < mouth_z - 0.16):
        # A dark reference silhouette is not valid colour for peripheral skin.
        # This rejects the proven under-ear failure while keeping a soft normal
        # falloff across the cheek; iris, brow and lip centres remain intact.
        weights[-1] *= 1 - reference_hair_colour
    if hair_weights[-1] > 0.65:
        # A side curl can face forward while projecting over the 2D cheek.
        # Keep the curl's own palette instead of copying skin onto the hair.
        weights[-1] *= max(smooth_edge(reference_hair, 0.15, 0.60), reference_gold)
    protected_frame = (
        source.parent.name in ["nord", "echo"]
        and abs(z - eye_z) < 0.13
        and abs(x) > 0.3
        and y < 0.15
    )
    gold_keep = (
        1.0 if x > 0.30 and y < 0.05 and z > eye_z - 0.65 else 0.0
    )  # Spatial domain; actual gold is tested per texel in shader
    gold_weights.append(gold_keep)
    recolour_weights.append(0 if protected_frame else 1)
bm.free()
if "--paint-only" in args:
    weights = [0] * len(weights)
uv_name = data.uv_layers.active.name
projected = data.uv_layers.new(name="IdentityProjection")
mask = data.color_attributes.new(
    name="IdentityFrontMask", type="FLOAT_COLOR", domain="CORNER"
)
hair_mask = data.color_attributes.new(
    name="InferredHairMask", type="FLOAT_COLOR", domain="CORNER"
)
recolour_mask = data.color_attributes.new(
    name="InferredColourMask", type="FLOAT_COLOR", domain="CORNER"
)
gold_mask = data.color_attributes.new(
    name="NativeGoldKeepMask", type="FLOAT_COLOR", domain="CORNER"
)
for i, loop in enumerate(data.loops):
    vertex = data.vertices[loop.vertex_index]
    gold = gold_weights[loop.vertex_index]
    gold_mask.data[i].color = (gold, gold, gold, 1)
    p = vertex.co
    if alignment is not None:
        paint_point = np.array(
            [
                0.5 + (p.x - render_center[0]) * render_normalize / ortho,
                0.5 + (p.z - render_center[2]) * render_normalize / ortho,
                1,
            ]
        )
        projected.data[i].uv = tuple(paint_point @ alignment)
    else:
        projected.data[i].uv = (
            u0 + (p.x - low[0]) / (high[0] - low[0]) * (u1 - u0),
            v0 + (p.z - low[2]) / (high[2] - low[2]) * (v1 - v0),
        )
    value = weights[loop.vertex_index]
    mask.data[i].color = (value, value, value, 1)
    value = hair_weights[loop.vertex_index]
    hair_mask.data[i].color = (value, value, value, 1)
    value = recolour_weights[loop.vertex_index]
    recolour_mask.data[i].color = (value, value, value, 1)
material = bpy.data.materials.new("PortraitIdentityBake")
material.use_nodes = True
nodes = material.node_tree.nodes
nodes.clear()
links = material.node_tree.links
out = nodes.new("ShaderNodeOutputMaterial")
emit = nodes.new("ShaderNodeEmission")
base = nodes.new("ShaderNodeTexImage")
base.image = albedo
base_uv = nodes.new("ShaderNodeUVMap")
base_uv.uv_map = uv_name
links.new(base_uv.outputs["UV"], base.inputs["Vector"])


# Paint's unseen views can retain orange clay. Recolour only that hue range,
# using anatomy masks; valid dark frames, facial details and frontal identity
# stay intact. Texture luminance and the high-to-low normal retain strand detail.
def linear_hex(value):
    rgb = [int(value[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(
        c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb
    ) + (1,)


luminance = nodes.new("ShaderNodeRGBToBW")
links.new(base.outputs["Color"], luminance.inputs[0])
range_node = nodes.new("ShaderNodeMapRange")
range_node.clamp = True
range_node.inputs["From Min"].default_value = 0.015
range_node.inputs["From Max"].default_value = 0.50
links.new(luminance.outputs[0], range_node.inputs["Value"])
ramps = []
for kind in ["skin", "hair"]:
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements.new(0.5)
    for element, color in zip(
        sorted(ramp.color_ramp.elements, key=lambda e: e.position), appearance[kind]
    ):
        element.color = linear_hex(color)
    links.new(range_node.outputs[0], ramp.inputs[0])
    ramps.append(ramp)
hair_attribute = nodes.new("ShaderNodeVertexColor")
hair_attribute.layer_name = "InferredHairMask"
palette = nodes.new("ShaderNodeMixRGB")
links.new(hair_attribute.outputs["Color"], palette.inputs[0])
links.new(ramps[0].outputs["Color"], palette.inputs[1])
links.new(ramps[1].outputs["Color"], palette.inputs[2])
separate = nodes.new("ShaderNodeSeparateColor")
separate.mode = "RGB"
links.new(base.outputs["Color"], separate.inputs["Color"])
denom = nodes.new("ShaderNodeMath")
denom.operation = "ADD"
denom.inputs[1].default_value = 0.02
links.new(separate.outputs["Blue"], denom.inputs[0])
ratio = nodes.new("ShaderNodeMath")
ratio.operation = "DIVIDE"
links.new(separate.outputs["Red"], ratio.inputs[0])
links.new(denom.outputs[0], ratio.inputs[1])
clay = nodes.new("ShaderNodeMapRange")
clay.clamp = True
clay.inputs["From Min"].default_value = 2.0
clay.inputs["From Max"].default_value = 4.0
links.new(ratio.outputs[0], clay.inputs["Value"])
colour_attribute = nodes.new("ShaderNodeVertexColor")
colour_attribute.layer_name = "InferredColourMask"
repair_factor = nodes.new("ShaderNodeMath")
repair_factor.operation = "MAXIMUM"
links.new(clay.outputs[0], repair_factor.inputs[0])
links.new(colour_attribute.outputs["Color"], repair_factor.inputs[1])
corrected = nodes.new("ShaderNodeMixRGB")
gold_attribute = nodes.new("ShaderNodeVertexColor")
gold_attribute.layer_name = "NativeGoldKeepMask"
gold_inverse = nodes.new("ShaderNodeMath")
gold_inverse.operation = "SUBTRACT"
gold_inverse.inputs[0].default_value = 1
# Test original albedo gold per texel; tiny hardware can lie inside a
# triangle without any vertex sampling its gold texels.
gb_denom = nodes.new("ShaderNodeMath")
gb_denom.operation = "ADD"
gb_denom.inputs[1].default_value = 0.005
links.new(separate.outputs["Blue"], gb_denom.inputs[0])
gb_ratio = nodes.new("ShaderNodeMath")
gb_ratio.operation = "DIVIDE"
links.new(separate.outputs["Green"], gb_ratio.inputs[0])
links.new(gb_denom.outputs[0], gb_ratio.inputs[1])
gb_gate = nodes.new("ShaderNodeMapRange")
gb_gate.clamp = True
gb_gate.inputs["From Min"].default_value = 1.8
gb_gate.inputs["From Max"].default_value = 2.3
links.new(gb_ratio.outputs[0], gb_gate.inputs["Value"])
rg_denom = nodes.new("ShaderNodeMath")
rg_denom.operation = "ADD"
rg_denom.inputs[1].default_value = 0.005
links.new(separate.outputs["Green"], rg_denom.inputs[0])
rg_ratio = nodes.new("ShaderNodeMath")
rg_ratio.operation = "DIVIDE"
links.new(separate.outputs["Red"], rg_ratio.inputs[0])
links.new(rg_denom.outputs[0], rg_ratio.inputs[1])
rg_gate = nodes.new("ShaderNodeMapRange")
rg_gate.clamp = True
rg_gate.inputs["From Min"].default_value = 3.2
rg_gate.inputs["From Max"].default_value = 2.6
links.new(rg_ratio.outputs[0], rg_gate.inputs["Value"])
gold_colour = nodes.new("ShaderNodeMath")
gold_colour.operation = "MULTIPLY"
links.new(gb_gate.outputs[0], gold_colour.inputs[0])
links.new(rg_gate.outputs[0], gold_colour.inputs[1])
gold_pixel = nodes.new("ShaderNodeMath")
gold_pixel.operation = "MULTIPLY"
links.new(gold_colour.outputs[0], gold_pixel.inputs[0])
links.new(gold_attribute.outputs["Color"], gold_pixel.inputs[1])
links.new(gold_pixel.outputs[0], gold_inverse.inputs[1])
repair_guard = nodes.new("ShaderNodeMath")
repair_guard.operation = "MULTIPLY"
links.new(repair_factor.outputs[0], repair_guard.inputs[0])
links.new(gold_inverse.outputs[0], repair_guard.inputs[1])
links.new(repair_guard.outputs[0], corrected.inputs[0])
links.new(base.outputs["Color"], corrected.inputs[1])
links.new(palette.outputs[0], corrected.inputs[2])
ref = nodes.new("ShaderNodeTexImage")
ref.image = portrait
ref.extension = "CLIP"
ref_uv = nodes.new("ShaderNodeUVMap")
ref_uv.uv_map = "IdentityProjection"
links.new(ref_uv.outputs["UV"], ref.inputs["Vector"])
attribute = nodes.new("ShaderNodeVertexColor")
attribute.layer_name = "IdentityFrontMask"
factor = nodes.new("ShaderNodeMath")
factor.operation = "MULTIPLY"
links.new(attribute.outputs["Color"], factor.inputs[0])
links.new(ref.outputs["Alpha"], factor.inputs[1])
mix = nodes.new("ShaderNodeMixRGB")
front_gold_guard = nodes.new("ShaderNodeMath")
front_gold_guard.operation = "MULTIPLY"
links.new(factor.outputs[0], front_gold_guard.inputs[0])
links.new(gold_inverse.outputs[0], front_gold_guard.inputs[1])
links.new(front_gold_guard.outputs[0], mix.inputs[0])
links.new(corrected.outputs[0], mix.inputs[1])
links.new(ref.outputs["Color"], mix.inputs[2])
links.new(mix.outputs[0], emit.inputs[0])
links.new(emit.outputs[0], out.inputs[0])
baked = bpy.data.images.new(
    "PortraitHead_IdentityAlbedo", width=2048, height=2048, alpha=False
)
target = nodes.new("ShaderNodeTexImage")
target.image = baked
nodes.active = target
data.materials.clear()
data.materials.append(material)
for polygon in data.polygons:
    polygon.material_index = 0
data.uv_layers.active = data.uv_layers[uv_name]
data.uv_layers[uv_name].active_render = True
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.render.bake.margin = 8
bpy.ops.object.bake(type="EMIT", uv_layer=uv_name)
nodes.clear()
out = nodes.new("ShaderNodeOutputMaterial")
pbr = nodes.new("ShaderNodeBsdfPrincipled")
pbr.inputs["Roughness"].default_value = 0.66
pbr.inputs["Metallic"].default_value = 0
tex = nodes.new("ShaderNodeTexImage")
tex.image = baked
links.new(tex.outputs["Color"], pbr.inputs["Base Color"])
links.new(pbr.outputs[0], out.inputs[0])
baked.pack()
data.uv_layers.remove(data.uv_layers["IdentityProjection"])
data.color_attributes.remove(data.color_attributes["IdentityFrontMask"])
data.color_attributes.remove(data.color_attributes["InferredHairMask"])
data.color_attributes.remove(data.color_attributes["InferredColourMask"])
data.color_attributes.remove(data.color_attributes["NativeGoldKeepMask"])
obj.name = "PortraitHead_Final"
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(output),
    export_format="GLB",
    use_selection=True,
    export_animations=False,
    export_image_format="JPEG",
    export_jpeg_quality=94,
)
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix(".blend")), compress=True)
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_sha256, (
    "Immutable extracted source changed"
)
record = {
    "source_sha256": source_sha256,
    "reference_sha256": hashlib.sha256(reference.read_bytes()).hexdigest(),
    "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    "accepted_front_anchor_source_sha256": "d65bd5881edf6dc94f8175ffe5b8f69fab12a94a735adae3f772c8289605ffcd",
    "mask_coordinate_system": "Virtual two-unit head for anatomy weights only; raw source positions and original UV retained",
    "mask_center": mask_center.tolist(),
    "mask_unit_scale": float(mask_unit_scale),
    "floating_candidates_preserved_vertices": floating_candidates_not_removed,
    "eye_z_source_world": float(eye_z_world),
    "elapsed_seconds": time.time() - started,
    "task_copy_sha256": hashlib.sha256(
        Path(__file__).resolve().read_bytes()
    ).hexdigest(),
    "native_teal_hair_evidence_vertices": int((native_teal_hair > 0.5).sum()),
    "registered_eye_protected_vertices": int(registered_eye_protected.sum()),
    "native_front_gold_domain_vertices": int(sum(g > 0.5 for g in gold_weights)),
    "gold_preservation": "Real albedo per-texel colour mask restricted to right/front hardware region; rear gold excluded",
    "semantic_albedo_source": "Root-owned Hunyuan head Paint768/30; no gray fallback or thin-shell heuristic",
    "root_owned_paint_used": True,
    "worker_gpu_generation": False,
    "frame_receipt": "head-b-frame.receipt.json",
    "gpu_used": False,
    "source": str(source),
    "reference": str(reference),
    "output": str(output),
    "method": "Blender CPU EMIT bake; occlusion-aware visible front identity projection over Hunyuan multiview albedo; welded UV seam normals and smooth shading",
    "removed_floating_vertices": len(islands),
    "front_vertices": int(sum(value > 0.01 for value in weights)),
    "vertices": len(data.vertices),
    "triangles": sum(len(face.vertices) - 2 for face in data.polygons),
    "head_bounds_blender": [low.tolist(), high.tolist()],
    "reference_alpha_bounds_uv": [float(u0), float(v0), float(u1), float(v1)],
    "texture": 2048,
    "jpeg_quality": 94,
}
record.update(
    render_center=render_center.tolist(),
    render_normalize=float(render_normalize),
    ortho_scale=float(ortho) if alignment is not None else None,
    identity_affine=alignment.tolist() if alignment is not None else None,
    landmarks=str(landmarks_path) if alignment is not None else None,
    component_threshold=minimum_component,
)
record.update(
    inferred_clay_colour_repair=appearance,
    hair_mask_vertices=int(sum(value > 0.5 for value in hair_weights)),
)
record.update(
    identity_projection_front_dot={
        "zero_below": 0.08,
        "full_above": 0.65,
        "forced_side_override": False,
    },
    reason="Peripheral skin rejects reference hair silhouette; calibrated central face retains full identity, cheek projection has a soft angular falloff",
)
output.with_suffix(".receipt.json").write_text(
    json.dumps(record, indent=2) + "\n", encoding="utf-8"
)
print("IDENTITY_HEAD_READY", json.dumps(record), flush=True)
