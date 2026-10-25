"""Native BMesh clip/retopology, CPU-only, output data for root GLB assembler.

Blender --background --factory-startup --python this.py -- input.npz output-dir
The 54,132 source vertex prefix is immutable; new clipped vertices append.
"""
import json
from pathlib import Path
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector


inp, out = map(Path, sys.argv[sys.argv.index("--")+1:][:2])
source = np.load(inp)
out.mkdir(parents=True, exist_ok=True)
v = source["positions"]
faces = source["faces"]
uv = source["uv"]
normal = source["normals"]
joints = source["joints"]
weights = source["weights"]
plane = 1.345
mesh = bpy.data.meshes.new("Mira_neck_CPU_native_clip")
mesh.from_pydata(v.tolist(), [], faces.tolist())
mesh.update()
bm = bmesh.new()
bm.from_mesh(mesh)
bm.verts.ensure_lookup_table()
layer = bm.verts.layers.int.new("source_vertex_index")
uv_layer = bm.loops.layers.uv.new("UVMap")
for i, vertex in enumerate(bm.verts):
    vertex[layer] = i
for face in bm.faces:
    for loop in face.loops:
        loop[uv_layer].uv = uv[loop.vert[layer]]
# Remove only confirmed floating shells (no connected shoulder faces).
remove = set(source["remove_faces"].tolist())
doomed = [face for i, face in enumerate(bm.faces) if i in remove]
bmesh.ops.delete(bm, geom=doomed, context="FACES")
originals = set(bm.verts)
bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                      dist=1e-7, plane_co=Vector((0, plane, 0)),
                      plane_no=Vector((0, 1, 0)), clear_outer=True)
bmesh.ops.triangulate(bm, faces=list(bm.faces), quad_method="BEAUTY", ngon_method="BEAUTY")
positions = v.tolist()
normals = normal.tolist()
uvs = uv.tolist()
all_joints = joints.tolist()
all_weights = weights.tolist()
mapping = {}
# Compute original edge intersections for exact attributes/skin interpolation.
edges = np.unique(np.sort(np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1), axis=0)
crossing = (v[edges[:, 0], 1]-plane)*(v[edges[:, 1], 1]-plane) < 0
edge = edges[crossing]
t = (plane-v[edge[:, 0], 1])/(v[edge[:, 1], 1]-v[edge[:, 0], 1])
points = v[edge[:, 0]]*(1-t[:, None])+v[edge[:, 1]]*t[:, None]
uv_points = uv[edge[:, 0]]*(1-t[:, None])+uv[edge[:, 1]]*t[:, None]
max_interpolation_error = 0
for vertex in bm.verts:
    if vertex in originals:
        mapping[vertex] = vertex[layer]
        continue
    coord = np.array(vertex.co)
    errors = np.linalg.norm(points-coord, axis=1)
    candidates = np.flatnonzero(errors < 3e-6)
    assert len(candidates), ("Unmatched native cut vertex", coord.tolist(), float(errors.min()))
    actual_uv = np.array(vertex.link_loops[0][uv_layer].uv)
    k = candidates[np.argmin(np.linalg.norm(uv_points[candidates]-actual_uv, axis=1))]
    max_interpolation_error = max(max_interpolation_error, float(errors[k]))
    a, b = edge[k]
    alpha = t[k]
    interpolated = normal[a]*(1-alpha)+normal[b]*alpha
    interpolated /= max(np.linalg.norm(interpolated), 1e-20)
    dense = np.zeros(25)
    np.add.at(dense, joints[a], weights[a]*(1-alpha))
    np.add.at(dense, joints[b], weights[b]*alpha)
    bone_ids = np.argsort(dense)[-4:][::-1]
    bone_weights = dense[bone_ids]
    bone_weights /= bone_weights.sum()
    mapping[vertex] = len(positions)
    positions.append(coord.tolist())
    normals.append(interpolated.tolist())
    uvs.append(actual_uv.tolist())
    all_joints.append(bone_ids.tolist())
    all_weights.append(bone_weights.tolist())
new_faces = np.array([[mapping[vert] for vert in face.verts] for face in bm.faces], dtype=int)
positions = np.asarray(positions)
# Weld for boundary analysis only. Prefix UV vertices remain unmerged.
unique, inverse = np.unique(np.round(positions, 5), axis=0, return_inverse=True)
wf = inverse[new_faces]
ed, count = np.unique(np.sort(np.vstack([wf[:, [0, 1]], wf[:, [1, 2]], wf[:, [2, 0]]]), axis=1), axis=0, return_counts=True)
boundary = ed[(count == 1) & (abs(unique[ed[:, 0], 1]-plane) < 3e-5) & (abs(unique[ed[:, 1], 1]-plane) < 3e-5)]
neighbors = {}
for a, b in boundary:
    neighbors.setdefault(int(a), []).append(int(b))
    neighbors.setdefault(int(b), []).append(int(a))
remaining = set(neighbors)
loops = []
while remaining:
    seed = min(remaining)
    todo, component = [seed], set()
    while todo:
        item = todo.pop()
        if item in component:
            continue
        component.add(item)
        todo.extend(neighbors[item])
    remaining -= component
    loops.append(sorted(component))
summary = []
for loop in loops:
    q = unique[loop]
    summary.append(dict(vertices=len(loop), degree_histogram={str(d): sum(len(neighbors[i]) == d for i in loop) for d in [1, 2, 3, 4]},
                        bounds=[q.min(0).tolist(), q.max(0).tolist()]))
stage = dict(plane_y=plane, immutable_prefix=len(v), added_vertices=len(positions)-len(v),
             triangles=len(new_faces), loops=summary, native_bmesh_interpolation_error=max_interpolation_error,
             original_positions_exact=bool(np.array_equal(positions[:len(v)], v)), gpu_used=False)
(out/"bodytop-native-stage.receipt.json").write_text(json.dumps(stage, indent=2))
np.savez_compressed(out/"bodytop-native-stage.npz", positions=positions, normals=np.asarray(normals), uv=np.asarray(uvs),
                    joints=np.asarray(all_joints), weights=np.asarray(all_weights), faces=new_faces,
                    unique=unique, inverse=inverse, boundary=boundary)
print(json.dumps(stage))
bm.free()
