"""Small Blender-native construction helpers; all geometry stays in our collection."""
import bpy
import math
from mathutils import Vector

PREFIX = 'Release3D_'
COLLECTION = None
MATERIALS = {}

def prepare():
    global COLLECTION
    old = bpy.data.collections.get(PREFIX + 'Office')
    if old:
        for obj in list(old.all_objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
    COLLECTION = bpy.data.collections.new(PREFIX + 'Office')
    bpy.context.scene.collection.children.link(COLLECTION)
    for obj in bpy.context.scene.objects:
        if not obj.name.startswith(PREFIX):
            obj.hide_set(True)
            obj.hide_render = True
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1

def mat(name, color, roughness=.75, metallic=0, emission=0):
    key = PREFIX + name
    material = bpy.data.materials.get(key) or bpy.data.materials.new(key)
    rgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    rgb = [v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
    material.diffuse_color = (*rgb, 1)
    material.use_nodes = True
    node = material.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*rgb, 1)
    node.inputs['Roughness'].default_value = roughness
    node.inputs['Metallic'].default_value = metallic
    if emission:
        node.inputs['Emission Color'].default_value = (*rgb, 1)
        node.inputs['Emission Strength'].default_value = emission
    MATERIALS[name] = material
    return material

def own(obj, name, material=None, parent=None):
    obj.name = PREFIX + name
    if obj.data: obj.data.name = PREFIX + name + '_Data'
    for coll in list(obj.users_collection):
        coll.objects.unlink(obj)
    COLLECTION.objects.link(obj)
    if material:
        obj.data.materials.append(MATERIALS[material])
    if parent:
        obj.parent = parent
    return obj

def empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(PREFIX + name, None)
    COLLECTION.objects.link(obj)
    obj.location = location
    if parent:
        obj.parent = parent
    return obj

def box(name, location, size, material, parent=None, chamfer=0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = own(bpy.context.object, name, material, parent)
    obj.location, obj.dimensions = location, size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if chamfer:
        modifier = obj.modifiers.new('Narrow planar edge cuts', 'BEVEL')
        modifier.width, modifier.segments = chamfer, 1
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj

def sphere(name, location, size, material, parent=None, segments=16, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1)
    obj = own(bpy.context.object, name, material, parent)
    obj.location, obj.scale = location, size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj

def cylinder(name, location, radius, depth, material, parent=None, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    obj = own(bpy.context.object, name, material, parent)
    obj.location = location
    return obj

def beam(name, a, b, radius, material, parent=None, vertices=10):
    a, b = Vector(a), Vector(b)
    obj = cylinder(name, (a + b) / 2, radius, (b - a).length, material, parent, vertices)
    obj.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return obj

def tube(name, points, radius, material, parent=None, sides=8):
    """A single connected tube, with shared rings at all bends."""
    points=[Vector(p) for p in points];verts=[];faces=[]
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        side=tangent.cross(Vector((0,1,0))).normalized()
        up=tangent.cross(side).normalized()
        for j in range(sides):
            a=j*math.tau/sides;verts.append(p+radius*(side*math.cos(a)+up*math.sin(a)))
    for i in range(len(points)-1):
        for j in range(sides): faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))])
    mesh=bpy.data.meshes.new(PREFIX+name+'_Mesh');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(PREFIX+name,mesh);COLLECTION.objects.link(obj)
    if parent: obj.parent=parent
    obj.data.materials.append(MATERIALS[material]);return obj

def deselect():
    bpy.ops.object.select_all(action='DESELECT')

def select_tree(root):
    root.hide_set(False)
    root.select_set(True)
    for child in root.children_recursive:
        child.hide_set(False)
        child.select_set(True)
    bpy.context.view_layer.objects.active = root

def frame_view():
    deselect()
    if not bpy.context.screen: return
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.shading.type = 'SOLID'
            space.shading.light = 'STUDIO'
            space.shading.color_type = 'MATERIAL'
            space.overlay.show_overlays = False
            space.region_3d.view_perspective = 'ORTHO'
            space.region_3d.view_location = (0, 0, 1)
            space.region_3d.view_rotation = Vector((10, -14, 12)).to_track_quat('Z', 'Y')
            space.region_3d.view_distance = 15

def gap(label, actual, expected, tolerance=.002):
    delta = actual - expected
    assert abs(delta) <= tolerance, f'{label}: unexpected gap {delta:.5f} m'
    print(f'CONTACT {label}: {delta:.5f} m')
