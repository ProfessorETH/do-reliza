"""Keep Hunyuan clothing geometry; weld export duplicates and reduce for web rigging.

Blender --background --factory-startup --python clean_shape.py -- RAW CLEAN
The source is immutable. No voxel remesh or subdivision is used.
"""
import sys
import json
import hashlib
from pathlib import Path
import bpy
import bmesh

source,output=map(Path,sys.argv[sys.argv.index('--')+1:][:2])
assert source.resolve()!=output.resolve()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
parts=[o for o in bpy.context.scene.objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for obj in parts:obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
if len(parts)>1:bpy.ops.object.join()
obj=bpy.context.object
obj.name='HunyuanFullBody_Clean'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
original_vertices=len(obj.data.vertices)
bm=bmesh.new();bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
smooth=obj.modifiers.new('Remove voxel stair edges only','SMOOTH');smooth.factor=.12;smooth.iterations=1
bpy.ops.object.modifier_apply(modifier=smooth.name)
tri=obj.modifiers.new('Count source triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
source_triangles=len(obj.data.polygons)
reduce=obj.modifiers.new('120k whole body surface budget','DECIMATE');reduce.ratio=min(1,120000/source_triangles)
bpy.ops.object.modifier_apply(modifier=reduce.name)
for polygon in obj.data.polygons:polygon.use_smooth=True
obj.data.update()
coords=[v.co for v in obj.data.vertices]
low=[min(p[i] for p in coords) for i in range(3)];high=[max(p[i] for p in coords) for i in range(3)]
bm=bmesh.new();bm.from_mesh(obj.data)
record={'source':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'original_vertices':original_vertices,'original_triangles':source_triangles,'vertices':len(obj.data.vertices),'triangles':len(obj.data.polygons),'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'bounds_blender':[low,high],'method':'Weld duplicate export vertices; one mild smooth pass; collapse reduction120k; no voxel remesh, no empty subdivision'}
bm.free()
output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')),compress=True)
record['output_sha256']=hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.qc.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
print('BODY_CLEAN_READY',json.dumps(record),flush=True)
