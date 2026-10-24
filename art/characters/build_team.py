"""Build six distinct skinned teammates from the Hunyuan clothing scan and new anatomy.

Run through Blender MCP with PROJECT_ROOT set to this checkout. Owns only the
DR_SkinnedTeam collection; never rebuilds or saves the office scene.
"""

import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector, Matrix

ROOT = Path(globals()["PROJECT_ROOT"])
sys.path.insert(0, str(ROOT / "art/characters"))
import importlib
import mesh_tools, face_recipe, rig_recipe, portrait_material

for module in [mesh_tools, face_recipe, rig_recipe, portrait_material]:
    importlib.reload(module)
from mesh_tools import material, mesh, loft, oval, sweep, smooth
from face_recipe import build_face, build_hair
from rig_recipe import create_rig, rigid_weight, build_hands, build_shoes, bake_actions
from portrait_material import bake_face

PEOPLE = [
    dict(
        id="mira",
        skin="#efb79a",
        cloth="#899c68",
        hair="#b95224",
        hairlight="#d57932",
        iris="#73854d",
        style="bun",
        male=False,
    ),
    dict(
        id="pixel",
        skin="#dca883",
        cloth="#db792b",
        hair="#37251d",
        hairlight="#57382a",
        iris="#6a4430",
        style="curls",
        male=True,
    ),
    dict(
        id="nord",
        skin="#c99e84",
        cloth="#427887",
        hair="#3f3028",
        hairlight="#65503b",
        iris="#684c3c",
        style="part",
        male=True,
    ),
    dict(
        id="iskra",
        skin="#e3af94",
        cloth="#30323a",
        hair="#613d31",
        hairlight="#a65d46",
        iris="#754b31",
        style="sweep",
        male=False,
    ),
    dict(
        id="saga",
        skin="#edc2a3",
        cloth="#354459",
        hair="#cfa96d",
        hairlight="#e7c68d",
        iris="#7f9ba5",
        style="bob",
        male=False,
    ),
    dict(
        id="echo",
        skin="#bc8660",
        cloth="#dfd4b8",
        hair="#30251e",
        hairlight="#503a28",
        iris="#61442f",
        style="curls",
        male=True,
    ),
]

COLNAME = "DR_SkinnedTeam"
col = bpy.data.collections.get(COLNAME)
if col:
    for obj in list(col.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
else:
    col = bpy.data.collections.new(COLNAME)
    bpy.context.scene.collection.children.link(col)
source_col = bpy.data.collections.get("DR_SkinnedTeam_Source")
if not source_col:
    source_col = bpy.data.collections.new("DR_SkinnedTeam_Source")
    bpy.context.scene.collection.children.link(source_col)
source = bpy.data.objects.get("DR_Source_HunyuanMira")
if not source:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(
        filepath=str(ROOT / "art/hunyuan/mira/mira-review-v2.glb")
    )
    imported = list(set(bpy.data.objects) - before)
    meshes = [o for o in imported if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    source = bpy.context.object
    source.name = "DR_Source_HunyuanMira"
    for c in list(source.users_collection):
        c.objects.unlink(source)
    source_col.objects.link(source)
    source.hide_render = True
source.hide_set(True)


def mats_for(person):
    colors = {
        **{k: person[k] for k in ["skin", "cloth", "hair", "hairlight", "iris"]},
        "pants": "#35404c",
        "shoe": "#ddd5c4",
        "sole": "#ede9dc",
        "lace": "#f1eddf",
        "white": "#f4eee4",
        "black": "#201d1a",
        "shine": "#ffffff",
        "lip": "#b87872",
        "mouth": "#704345",
        "freckle": "#ab7759",
        "nail": "#e8bca5",
        "metal": "#38352f",
        "accent": "#f5a13d",
    }
    return {
        key: material(
            "DR_" + person["id"] + "_" + key,
            color,
            0.48 if key in ["iris", "white", "shine", "metal"] else 0.72,
        )
        for key, color in colors.items()
    }


def body_mesh(ctx):
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = "DR_" + ctx["id"] + "_Body"
    col.objects.link(obj)
    obj.hide_set(False)
    obj.hide_render = False
    obj.parent = ctx["root"]
    obj.matrix_basis = Matrix.Identity(4)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
    # Remove failed scan hair/face, hands and shoes. Each replacement meets a measured anchor.
    remove = [
        v
        for v in bm.verts
        if v.co.z > 0.99
        or v.co.z < 0.145
        or (abs(v.co.x) > 0.21 and v.co.z > 0.98)
        or (abs(v.co.x) > 0.27 and v.co.z > 0.65)
    ]
    bmesh.ops.delete(bm, geom=remove, context="VERTS")
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bmesh.ops.bisect_plane(
        bm,
        geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
        dist=0.00001,
        plane_co=(0, 0, 0.97),
        plane_no=(0, 0, 1),
        clear_inner=False,
        clear_outer=False,
    )
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate()
    obj.data.update()
    obj.data.materials.clear()
    for key in ["skin", "cloth", "pants"]:
        obj.data.materials.append(ctx["mats"][key])
    # Scan faces -Y; the office's actors face +Y in Blender (-Z in glTF).
    for v in obj.data.vertices:
        v.co.x = -v.co.x
        v.co.y = -v.co.y
    for v in obj.data.vertices:
        p = v.co
        if p.z > 1.275:
            p.x *= 1 - 0.64 * smooth(1.275, 1.365, p.z)
        if ctx["male"]:
            if 0.97 < p.z < 1.26:
                p.x *= 1 + 0.30 * smooth(0.97, 1.04, p.z) * (
                    1 - smooth(1.15, 1.26, p.z)
                )
            if 0.76 < p.z < 1.04:
                p.x *= 0.94
            if 1.06 < p.z < 1.28 and abs(p.x) < 0.20:
                p.x *= 1.06
                if p.y > 0.055:
                    p.y = 0.055 + (p.y - 0.055) * 0.65
    obj.data.update()
    for face in obj.data.polygons:
        z = face.center.z
        x = abs(face.center.x)
        face.material_index = (
            2 if z < 0.97 and x < 0.30 else 0 if x > 0.31 and z < 1.02 else 1
        )
        face.use_smooth = True
    # Explicit weights avoid heat-weight failures in scanned armpits and fingers.
    groups = {
        name: obj.vertex_groups.new(name="Skin_" + ctx["id"] + "_" + name)
        for name in ctx["bone_names"]
    }
    for v in obj.data.vertices:
        p = v.co
        label = "Left" if p.x < 0 else "Right"
        if p.z < 1.02:
            hip = smooth(0.80, 0.97, p.z)
            knee = smooth(0.425, 0.55, p.z)
            weights = {
                "Hips": hip,
                label + "Thigh": (1 - hip) * knee,
                label + "Shin": (1 - hip) * (1 - knee),
            }
        else:
            torso = smooth(0.94, 1.09, p.z)
            weights = {"Hips": 1 - torso, "Torso": torso}
        for name, w in weights.items():
            if w > 0.0001:
                groups[name].add([v.index], w, "REPLACE")
    ctx["deform_parts"].append(obj)


def sweater_torso(ctx):
    """Closed garment shell with a shaped waist, shoulders and collar opening."""
    male = ctx["male"]
    rings = [
        (0, 0, 0.97, 0.18 if male else 0.17, 0.105),
        (0, 0, 1.02, 0.18 if male else 0.155, 0.103),
        (0, 0, 1.10, 0.185 if male else 0.16, 0.108),
        (0, 0, 1.18, 0.205 if male else 0.19, 0.116),
        (0, 0, 1.24, 0.205, 0.107),
        (0, 0, 1.28, 0.175, 0.087),
        (0, 0, 1.32, 0.105, 0.064),
        (0, 0, 1.35, 0.064, 0.056),
    ]
    obj = loft(
        "DR_" + ctx["id"] + "_Sweater",
        rings,
        ctx["mats"]["cloth"],
        col,
        ctx["root"],
        48,
    )
    hips = obj.vertex_groups.new(name="Skin_" + ctx["id"] + "_Hips")
    torso = obj.vertex_groups.new(name="Skin_" + ctx["id"] + "_Torso")
    for vertex in obj.data.vertices:
        blend = smooth(0.96, 1.08, vertex.co.z)
        if blend < 1:
            hips.add([vertex.index], 1 - blend, "REPLACE")
        if blend > 0:
            torso.add([vertex.index], blend, "REPLACE")
    ctx["deform_parts"].append(obj)


def sleeves(ctx):
    for sign, label in [(-1, "Left"), (1, "Right")]:
        S = Vector((sign * 0.245, 0, 1.258))
        D = Vector((sign * math.sin(0.4), 0, -math.cos(0.4)))
        E = S + D * 0.285
        W = S + D * 0.55
        full = ctx["id"] != "nord"
        end = 0.255 if full else 0.175
        points = [
            tuple(S + Vector((-sign * 0.105, 0, -0.015))),
            tuple(S + Vector((0, 0, -0.045))),
            tuple(S + D * 0.12 + Vector((0, 0, -0.020))),
            tuple(E - D * 0.035),
            tuple(E),
            tuple(E + D * 0.04),
            tuple(E + D * end),
        ]
        radii = [0.065, 0.063, 0.057, 0.050, 0.048, 0.044, 0.034 if full else 0.042]
        ob = sweep(
            "DR_" + ctx["id"] + "_" + label + "Sleeve",
            points,
            radii,
            ctx["mats"]["cloth"],
            col,
            ctx["root"],
            20,
        )
        groups = {
            n: ob.vertex_groups.new(name="Skin_" + ctx["id"] + "_" + n)
            for n in ["Torso", label + "UpperArm", label + "Forearm"]
        }
        for v in ob.data.vertices:
            t = (v.co - S).dot(D)
            elbow = smooth(0.235, 0.335, t)
            torso = 1 - smooth(-0.025, 0.055, t)
            for n, w in {
                "Torso": torso,
                label + "UpperArm": (1 - torso) * (1 - elbow),
                label + "Forearm": (1 - torso) * elbow,
            }.items():
                if w > 0.0001:
                    groups[n].add([v.index], w, "REPLACE")
        ctx["deform_parts"].append(ob)
        fore = sweep(
            "DR_" + ctx["id"] + "_" + label + "ForearmSkin",
            [
                tuple(E + D * (end - 0.008)),
                tuple(E + D * (end + 0.022)),
                tuple(W + D * 0.014),
            ],
            [0.046 if not full else 0.032, 0.035, 0.026],
            ctx["mats"]["skin"],
            col,
            ctx["root"],
            20,
        )
        rigid_weight(fore, label + "Forearm", ctx)
        ctx["deform_parts"].append(fore)
        cuff = sweep(
            "DR_" + ctx["id"] + "_" + label + "Cuff",
            [tuple(E + D * (end - 0.014)), tuple(E + D * end)],
            [radii[-1] + 0.003, radii[-1] + 0.003],
            ctx["mats"]["cloth"],
            col,
            ctx["root"],
            20,
        )
        rigid_weight(cuff, label + "Forearm", ctx)
        ctx["deform_parts"].append(cuff)


def accessories(ctx):
    ident = ctx["id"]
    head = ctx["controls"]["Head"]
    p = ctx["head_pivot"]
    m = ctx["mats"]
    parts = []

    def local(v):
        return (v[0], v[1], v[2] - p)

    if ident in ["nord", "echo"]:
        for side in (-1, 1):
            points = []
            for i in range(41):
                a = math.tau * i / 40
                if ident == "nord":
                    x = 0.043 * math.copysign(abs(math.cos(a)) ** 0.65, math.cos(a))
                    z = 0.030 * math.copysign(abs(math.sin(a)) ** 0.65, math.sin(a))
                else:
                    x = 0.043 * math.cos(a)
                    z = 0.033 * math.sin(a)
                points.append(local((side * 0.063 + x, 0.142, 1.598 + z)))
            parts.append(
                sweep(
                    "DR_" + ident + "Glasses" + str(side),
                    points,
                    0.0025,
                    m["metal"],
                    col,
                    head,
                    8,
                )
            )
            parts.append(
                sweep(
                    "DR_" + ident + "Temple" + str(side),
                    [
                        local((side * 0.105, 0.142, 1.60)),
                        local((side * 0.141, 0.04, 1.60)),
                        local((side * 0.147, -0.02, 1.59)),
                    ],
                    0.0024,
                    m["metal"],
                    col,
                    head,
                    8,
                )
            )
        parts.append(
            sweep(
                "DR_" + ident + "Bridge",
                [
                    local((-0.02, 0.143, 1.604)),
                    local((0, 0.151, 1.61)),
                    local((0.02, 0.143, 1.604)),
                ],
                0.0025,
                m["metal"],
                col,
                head,
                8,
            )
        )
    if ident == "iskra":
        parts.append(
            sweep(
                "DR_iskra_CopperStreak",
                [
                    local((-0.10, 0.09, 1.72)),
                    local((-0.04, 0.15, 1.70)),
                    local((0.055, 0.14, 1.67)),
                    local((0.12, 0.075, 1.63)),
                ],
                [0.007, 0.011, 0.01, 0.001],
                m["hairlight"],
                col,
                head,
                10,
            )
        )
    if ident == "saga":
        for side in (-1, 1):
            parts.append(
                oval(
                    "DR_saga_Earring" + str(side),
                    local((side * 0.155, 0.01, 1.522)),
                    (0.005, 0.004, 0.011),
                    m["accent"],
                    col,
                    head,
                    12,
                    8,
                )
            )
    for obj in parts:
        ctx["deform_parts"].append(obj)
        rigid_weight(obj, "Head", ctx)
    torso = ctx["controls"]["Torso"]
    parts = []
    if ident in ["pixel", "iskra", "saga"]:
        # Hood sits around the back of the neck, connected to the collar plane.
        points = [
            (0.105 * math.cos(a), -0.065 + 0.070 * math.sin(a), 0.31)
            for a in [i * math.pi / 24 for i in range(25)]
        ]
        parts.append(
            sweep("DR_" + ident + "_Hood", points, 0.036, m["cloth"], col, torso, 12)
        )
        for sign in (-1, 1):
            parts.append(
                sweep(
                    "DR_" + ident + "_Drawstring" + str(sign),
                    [
                        (sign * 0.042, 0.097, 0.30),
                        (sign * 0.045, 0.138, 0.23),
                        (sign * 0.049, 0.137, 0.17),
                    ],
                    0.0028,
                    m["lace"],
                    col,
                    torso,
                    8,
                )
            )
    if ident == "nord":
        for sign in (-1, 1):
            parts.append(
                mesh(
                    "DR_nord_Collar" + str(sign),
                    [
                        (sign * 0.045, 0.085, 0.31),
                        (sign * 0.105, 0.105, 0.24),
                        (sign * 0.025, 0.143, 0.24),
                    ],
                    [(0, 1, 2)],
                    m["cloth"],
                    col,
                    torso,
                )
            )
        parts.append(
            sweep(
                "DR_nord_Placket",
                [(0, 0.140, 0.25), (0, 0.144, 0.15), (0, 0.132, 0.04)],
                0.004,
                m["cloth"],
                col,
                torso,
                8,
            )
        )
        for z in [0.07, 0.15, 0.23]:
            parts.append(
                oval(
                    "DR_nord_Button" + str(z),
                    (0, 0.15, z),
                    (0.004, 0.003, 0.004),
                    m["sole"],
                    col,
                    torso,
                    10,
                    6,
                )
            )
    if ident == "pixel":
        for sign in (-1, 1):
            parts.append(
                oval(
                    "DR_pixel_Headphone" + str(sign),
                    (sign * 0.11, 0.087, 0.29),
                    (0.037, 0.035, 0.056),
                    m["accent"],
                    col,
                    torso,
                    24,
                    16,
                )
            )
            parts.append(
                oval(
                    "DR_pixel_Cushion" + str(sign),
                    (sign * 0.09, 0.082, 0.29),
                    (0.026, 0.03, 0.047),
                    m["black"],
                    col,
                    torso,
                    20,
                    12,
                )
            )
        pts = [
            (0.123 * math.cos(a), -0.025 + 0.11 * math.sin(a), 0.31)
            for a in [i * math.pi / 24 for i in range(25)]
        ]
        parts.append(sweep("DR_pixel_Headband", pts, 0.010, m["black"], col, torso, 10))
    for obj in parts:
        ctx["deform_parts"].append(obj)
        rigid_weight(obj, "Torso", ctx)


def unify_clothing(ctx):
    """Join overlapping scan/arm surfaces into one continuous deforming garment."""
    from mathutils.kdtree import KDTree

    pants = ctx["deform_parts"][0]
    parts = ctx["deform_parts"][1:]
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    vertices = KDTree(len(obj.data.vertices))
    names = [group.name for group in obj.vertex_groups]
    source_weights = []
    for vertex in obj.data.vertices:
        vertices.insert(vertex.co, vertex.index)
        source_weights.append([(group.group, group.weight) for group in vertex.groups])
    vertices.balance()
    faces = KDTree(len(obj.data.polygons))
    materials = []
    for face in obj.data.polygons:
        faces.insert(face.center, face.index)
        materials.append(face.material_index)
    faces.balance()
    remesh = obj.modifiers.new("ContinuousGarment", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = 0.009
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    relax = obj.modifiers.new("ClothRelax", "SMOOTH")
    relax.factor = 0.45
    relax.iterations = 3
    bpy.ops.object.modifier_apply(modifier=relax.name)
    obj.vertex_groups.clear()
    groups = [obj.vertex_groups.new(name=name) for name in names]
    for vertex in obj.data.vertices:
        blend = {}
        for _, index, distance in vertices.find_n(vertex.co, 4):
            factor = 1 / max(0.00001, distance) ** 2
            for index, weight in source_weights[index]:
                blend[index] = blend.get(index, 0) + factor * weight
        strongest = sorted(blend.items(), key=lambda item: item[1], reverse=True)[:4]
        total = sum(weight for _, weight in strongest)
        for index, weight in strongest:
            groups[index].add([vertex.index], weight / total, "REPLACE")
    for face in obj.data.polygons:
        _, index, _ = faces.find(face.center)
        face.material_index = materials[index]
        face.use_smooth = True
    ctx["deform_parts"] = [pants, obj]


def vertex_tint_and_join(objects, parent, name):
    # Baked palette in COLOR_0: no image requests, one draw surface per object.
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        colors = obj.data.color_attributes.new(
            name="Tint", type="BYTE_COLOR", domain="CORNER"
        )
        for poly in obj.data.polygons:
            color = obj.data.materials[poly.material_index].diffuse_color
            for loop in poly.loop_indices:
                colors.data[loop].color = color
        obj.data.materials.clear()
        obj.data.materials.append(TINT)
        for p in obj.data.polygons:
            p.material_index = 0
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world
    return obj


TINT = material("DR_VertexPalette", "#ffffff", 0.68)
nodes = TINT.node_tree.nodes
attr = nodes.get("Palette") or nodes.new("ShaderNodeVertexColor")
attr.name = "Palette"
attr.layer_name = "Tint"
TINT.node_tree.links.new(
    attr.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"]
)
contexts = []
for person in PEOPLE:
    if person["id"] not in globals().get("CHARACTER_IDS", [p["id"] for p in PEOPLE]):
        continue
    ctx = {
        **person,
        "collection": col,
        "mats": mats_for(person),
        "deform_parts": [],
        "rigid_parts": [],
        "photo_parts": [],
    }
    create_rig(ctx)
    body_mesh(ctx)
    sweater_torso(ctx)
    sleeves(ctx)
    unify_clothing(ctx)
    neck = loft(
        "DR_" + ctx["id"] + "_Neck",
        [
            (0, 0, 1.29, 0.057, 0.055),
            (0, 0, 1.36, 0.053, 0.052),
            (0, 0, 1.43, 0.061, 0.057),
        ],
        ctx["mats"]["skin"],
        col,
        ctx["root"],
        24,
    )
    rigid_weight(neck, "Head", ctx)
    ctx["deform_parts"].append(neck)
    for obj in build_face(ctx) + build_hair(ctx):
        if obj.name == "DR_" + ctx["id"] + "_Face":
            rigid_weight(obj, "Head", ctx)
            bake_face(obj, ctx, ROOT)
        elif obj.parent in [ctx["controls"]["EyeLeft"], ctx["controls"]["EyeRight"]]:
            ctx["rigid_parts"].append(obj)
        else:
            rigid_weight(obj, "Head", ctx)
            ctx["deform_parts"].append(obj)
    for obj, bone in build_hands(ctx):
        rigid_weight(obj, bone, ctx)
        ctx["deform_parts"].append(obj)
    build_shoes(ctx)
    accessories(ctx)
    bpy.context.view_layer.update()
    rigid_groups = {
        parent: [o for o in ctx["rigid_parts"] if o.parent == parent]
        for parent in [
            ctx["controls"][s] for s in ["EyeLeft", "EyeRight", "LeftFoot", "RightFoot"]
        ]
    }
    for parent, children in rigid_groups.items():
        if children:
            vertex_tint_and_join(
                children,
                parent,
                "DR_" + ctx["id"] + "_" + parent.name.split("_")[-1] + "_Rigid",
            )
    obj = vertex_tint_and_join(
        ctx["deform_parts"], ctx["root"], "DR_" + ctx["id"] + "_Skin"
    )
    # Apply world transform so all vertex groups live in the armature coordinate frame.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    world = obj.matrix_world.copy()
    obj.parent = ctx["armature"]
    obj.matrix_world = world
    modifier = obj.modifiers.new("DeformSkeleton", "ARMATURE")
    modifier.object = ctx["armature"]
    ctx["skin"] = obj
    for photo in ctx["photo_parts"]:
        world = photo.matrix_world.copy()
        photo.parent = ctx["armature"]
        photo.matrix_world = world
        bpy.ops.object.select_all(action="DESELECT")
        photo.select_set(True)
        bpy.context.view_layer.objects.active = photo
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        modifier = photo.modifiers.new("DeformSkeleton", "ARMATURE")
        modifier.object = ctx["armature"]
    bake_actions(ctx)
    contexts.append(ctx)
    print(
        "BUILT_SKIN",
        ctx["id"],
        len(obj.data.vertices),
        len(obj.data.polygons),
        len(ctx["bone_names"]),
    )

# Select only the first character for construction critique.
shown = contexts[0]["root"]
owned = {shown, *shown.children_recursive}
for obj in bpy.data.objects:
    obj.hide_set(obj not in owned)
bpy.ops.object.select_all(action="DESELECT")
print("SKINNED_TEAM_READY", len(contexts))
