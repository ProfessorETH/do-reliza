"""Small Blender construction helpers, shared by the six character recipes."""

import math
import bpy
from mathutils import Vector


def linear(hex_color):
    rgb = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(
        c / 12.92 if c < 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb
    ) + (1,)


def material(name, color, roughness=0.6):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = linear(color)
    bsdf.inputs["Roughness"].default_value = roughness
    mat.diffuse_color = linear(color)
    return mat


def mesh(name, vertices, faces, mat, collection, parent=None):
    data = bpy.data.meshes.new(name + "_Geometry")
    data.from_pydata(vertices, [], faces)
    data.validate()
    data.update()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    if mat:
        data.materials.append(mat)
    if parent:
        obj.parent = parent
    for face in data.polygons:
        face.use_smooth = True
    return obj


def loft(name, rings, mat, collection, parent=None, segments=24):
    # Each ring is centre xyz, width x and depth y. End caps share the rim.
    vertices, faces = [], []
    for x, y, z, rx, ry in rings:
        for i in range(segments):
            a = math.tau * i / segments
            vertices.append((x + rx * math.cos(a), y + ry * math.sin(a), z))
    for j in range(len(rings) - 1):
        for i in range(segments):
            a = j * segments + i
            b = j * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces += [
        tuple(reversed(range(segments))),
        tuple((len(rings) - 1) * segments + i for i in range(segments)),
    ]
    return mesh(name, vertices, faces, mat, collection, parent)


def oval(name, center, radii, mat, collection, parent=None, segments=24, levels=14):
    # Smooth anatomical ovals are used for eyeballs, ear folds and hair masses.
    vertices = [(center[0], center[1], center[2] - radii[2])]
    faces = []
    for j in range(1, levels):
        p = -math.pi / 2 + math.pi * j / levels
        for i in range(segments):
            a = math.tau * i / segments
            vertices.append(
                (
                    center[0] + radii[0] * math.cos(p) * math.cos(a),
                    center[1] + radii[1] * math.cos(p) * math.sin(a),
                    center[2] + radii[2] * math.sin(p),
                )
            )
    top = len(vertices)
    vertices.append((center[0], center[1], center[2] + radii[2]))
    for i in range(segments):
        faces.append((0, 1 + (i + 1) % segments, 1 + i))
    for j in range(levels - 2):
        for i in range(segments):
            a = 1 + j * segments + i
            b = 1 + j * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    for i in range(segments):
        faces.append(
            (
                top,
                1 + (levels - 2) * segments + i,
                1 + (levels - 2) * segments + (i + 1) % segments,
            )
        )
    return mesh(name, vertices, faces, mat, collection, parent)


def sweep(name, points, radii, mat, collection, parent=None, sides=8, flatten=1):
    vertices, faces = [], []
    for i, point in enumerate(points):
        p = Vector(point)
        tangent = (
            Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(0, i - 1)])
        ).normalized()
        axis = tangent.cross(Vector((0, 1, 0)))
        if axis.length < 0.001:
            axis = tangent.cross(Vector((1, 0, 0)))
        axis.normalize()
        other = tangent.cross(axis).normalized()
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        for j in range(sides):
            v = p + r * (
                math.cos(j * math.tau / sides) * axis
                + math.sin(j * math.tau / sides) * other * flatten
            )
            vertices.append(tuple(v))
        if i:
            for j in range(sides):
                a = (i - 1) * sides + j
                b = (i - 1) * sides + (j + 1) % sides
                faces.append((a, b, b + sides, a + sides))
    faces += [
        tuple(reversed(range(sides))),
        tuple((len(points) - 1) * sides + i for i in range(sides)),
    ]
    return mesh(name, vertices, faces, mat, collection, parent)


def bezier(points, steps=24):
    p = [Vector(v) for v in points]
    return [
        tuple(
            (1 - t) ** 3 * p[0]
            + 3 * (1 - t) ** 2 * t * p[1]
            + 3 * (1 - t) * t * t * p[2]
            + t**3 * p[3]
        )
        for t in [i / steps for i in range(steps + 1)]
    ]


def smooth(a, b, x):
    t = max(0, min(1, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
