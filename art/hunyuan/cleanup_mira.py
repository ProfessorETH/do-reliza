"""Run inside Blender via MCP. Owns only Mira_Hunyuan_Review in the pilot collection."""
import bpy
import bmesh
import json
from pathlib import Path

source = bpy.data.objects['Mira_Hunyuan_Raw']
collection = bpy.data.collections['HunyuanPilot_Mira_v1']
root = Path(bpy.path.abspath('//')).parents[0] / 'hunyuan' / 'mira'
assert root.is_dir(), 'Open the game art/blender project before running'
assert 'Mira_Hunyuan_Review' not in bpy.data.objects, 'Inspect existing candidate before rebuilding'
obj = source.copy()
obj.data = source.data.copy()
obj.name = 'Mira_Hunyuan_Review'
collection.objects.link(obj)
obj.hide_set(False)
bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000002)
seen, parts = set(), []
for vertex in bm.verts:
    if vertex in seen:
        continue
    stack, part = [vertex], []
    seen.add(vertex)
    while stack:
        vertex = stack.pop()
        part.append(vertex)
        for edge in vertex.link_edges:
            other = edge.other_vert(vertex)
            if other not in seen:
                seen.add(other)
                stack.append(other)
    parts.append(part)
parts.sort(key=len, reverse=True)
removed = sum(len(p) for p in parts[1:])
bmesh.ops.delete(bm, geom=[v for p in parts[1:] for v in p], context='VERTS')
bm.to_mesh(obj.data)
bm.free()
obj.data.validate()
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
obj.data.remesh_voxel_size = .0045
obj.data.use_remesh_preserve_volume = True
bpy.ops.object.voxel_remesh()
smooth = obj.modifiers.new('Soften voxel steps', 'SMOOTH')
smooth.factor, smooth.iterations = .7, 5
bpy.ops.object.modifier_apply(modifier=smooth.name)
triangulate = obj.modifiers.new('Count true triangles', 'TRIANGULATE')
bpy.ops.object.modifier_apply(modifier=triangulate.name)
decimate = obj.modifiers.new('48k triangle budget', 'DECIMATE')
decimate.ratio = min(1, 48000 / len(obj.data.polygons))
bpy.ops.object.modifier_apply(modifier=decimate.name)
for face in obj.data.polygons:
    face.use_smooth = True
obj.data.validate()
bm = bmesh.new()
bm.from_mesh(obj.data)
report = dict(vertices=len(bm.verts), triangles=len(bm.faces),
              boundary_edges=sum(e.is_boundary for e in bm.edges),
              nonmanifold_edges=sum(not e.is_manifold for e in bm.edges),
              removed_floating_vertices=removed, source='shape-v1.raw.glb',
              voxel_size=.0045, smoothing_iterations=5)
bm.free()
assert report['nonmanifold_edges'] == 0, 'Reject broken candidate'
assert 40000 < report['triangles'] <= 48000, 'Reject wrong triangle budget'
bpy.ops.export_scene.gltf(filepath=str(root / 'shape-v2.clean.glb'), export_format='GLB', use_selection=True)
(root / 'mesh-v2-qc.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
for other in bpy.data.objects:
    other.hide_set(other != obj)
print(json.dumps(report))
