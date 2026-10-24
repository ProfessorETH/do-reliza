"""Bake the approved portrait into a smooth head UV map, with a skin-colour edge.

This is Blender material baking, not a new diffusion request. Original atlas
pixels are preserved; all generated maps are separate owned character assets.
"""

import bpy
from mesh_tools import smooth

# Eye landmarks in the existing 3 x 2 portrait atlas. The affine map levels the
# portrait's head tilt before projection onto the front-facing character.
LANDMARKS = {
    "mira": ((234.5, 204), (327, 221), 0, 0),
    "pixel": ((232, 215), (329, 215), 512, 0),
    "nord": ((220, 220), (318, 233), 1024, 0),
    "iskra": ((228, 192), (325, 213), 0, 512),
    "saga": ((219, 197), (318, 192), 512, 512),
    "echo": ((219, 222), (319, 235), 1024, 512),
}


def bake_face(obj, ctx, root):
    ident = ctx["id"]
    data = obj.data
    atlas = bpy.data.images.get("DR_ApprovedPortraitAtlas")
    if not atlas:
        atlas = bpy.data.images.load(str(root / "assets/agents.png"))
        atlas.name = "DR_ApprovedPortraitAtlas"
    data.uv_layers.new(name="UVMap")
    data.uv_layers.new(name="PortraitUV")
    data.uv_layers.active_index = 0
    data.uv_layers["UVMap"].active_render = True
    mask = data.color_attributes.new(
        name="PhotoMask", type="FLOAT_COLOR", domain="CORNER"
    )
    left, right, ox, oy = LANDMARKS[ident]
    cx = (left[0] + right[0]) / 2 + ox
    cy = (left[1] + right[1]) / 2 + oy
    dx = (right[0] - left[0]) / 0.122
    dy = (right[1] - left[1]) / 0.122
    for poly in data.polygons:
        us = [(data.loops[i].vertex_index % 64) / 64 for i in poly.loop_indices]
        seam = max(us) - min(us) > 0.5
        for i, u in zip(poly.loop_indices, us):
            vertex = data.vertices[data.loops[i].vertex_index]
            x, y, z = vertex.co
            z += ctx["head_pivot"]
            data.attributes["PortraitUV"].data[i].vector = (
                (cx + dx * x + dy * (z - 1.599)) / 1536,
                1 - (cy + dy * x - dx * (z - 1.599)) / 1024,
            )
            data.attributes["UVMap"].data[i].vector = (
                1 if seam and u == 0 else u,
                (data.loops[i].vertex_index // 64) / 32,
            )
            w = (
                0.78
                * smooth(0.015, 0.075, y)
                * smooth(1.412, 1.455, z)
                * (1 - smooth(1.665, 1.695, z))
            )
            mask.data[i].color = (w, w, w, 1)
    mat = bpy.data.materials.new("DR_" + ident + "_PortraitBake")
    mat.use_nodes = True
    n = mat.node_tree.nodes
    n.clear()
    links = mat.node_tree.links
    output = n.new("ShaderNodeOutputMaterial")
    emit = n.new("ShaderNodeEmission")
    mix = n.new("ShaderNodeMixRGB")
    mix.blend_type = "MIX"
    mix.inputs[1].default_value = ctx["mats"]["skin"].diffuse_color
    image = n.new("ShaderNodeTexImage")
    image.image = atlas
    sourceuv = n.new("ShaderNodeUVMap")
    sourceuv.uv_map = "PortraitUV"
    links.new(sourceuv.outputs["UV"], image.inputs["Vector"])
    attr = n.new("ShaderNodeVertexColor")
    attr.layer_name = "PhotoMask"
    links.new(attr.outputs["Color"], mix.inputs[0])
    links.new(image.outputs["Color"], mix.inputs[2])
    links.new(mix.outputs[0], emit.inputs["Color"])
    links.new(emit.outputs[0], output.inputs["Surface"])
    baked = bpy.data.images.new(
        "DR_" + ident + "_FaceAtlas", width=1024, height=1024, alpha=False
    )
    target = n.new("ShaderNodeTexImage")
    target.image = baked
    n.active = target
    data.materials.clear()
    data.materials.append(mat)
    for p in data.polygons:
        p.material_index = 0
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    scene = bpy.context.scene
    engine = scene.render.engine
    device = scene.cycles.device
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.render.bake.margin = 8
        bpy.ops.object.bake(type="EMIT", uv_layer="UVMap")
        assert max(baked.pixels[0::4]) > 0.3, "Reject empty face bake"
    finally:
        scene.render.engine = engine
        scene.cycles.device = device
    n.clear()
    out = n.new("ShaderNodeOutputMaterial")
    pbr = n.new("ShaderNodeBsdfPrincipled")
    pbr.inputs["Roughness"].default_value = 0.68
    tex = n.new("ShaderNodeTexImage")
    tex.image = baked
    links.new(tex.outputs["Color"], pbr.inputs["Base Color"])
    links.new(pbr.outputs[0], out.inputs["Surface"])
    baked.pack()
    data.uv_layers.remove(data.uv_layers["PortraitUV"])
    data.color_attributes.remove(data.color_attributes["PhotoMask"])
    ctx["photo_parts"].append(obj)
