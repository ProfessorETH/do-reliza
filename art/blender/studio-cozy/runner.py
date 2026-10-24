"""Construction helpers for the additive cozy collection; no foreign cleanup."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

PREFIX='CZ_'
COLLECTION_NAME='StudioCozy'
COL=None
MATS={}
CHECKS=[]

# Reuse the already inspected box/ring/text constructors, in an isolated namespace.
helpers={}
helper_path=Path(__file__).resolve().parents[1]/'studio-dressing/recipe.py'
exec(compile(helper_path.read_text('utf-8'),str(helper_path),'exec'),helpers)
helpers['P']=PREFIX
empty=helpers['empty'];mesh=helpers['mesh'];box=helpers['box'];ring_form=helpers['ring_form'];text=helpers['text']

def bind():
    helpers['COL']=COL;helpers['MATS']=MATS

def setup():
    global COL,MATS,CHECKS
    old=bpy.data.collections.get(COLLECTION_NAME)
    if old:
        for o in list(old.objects):bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.collections.remove(old)
    for blocks in [bpy.data.meshes,bpy.data.curves,bpy.data.materials]:
        for block in list(blocks):
            if block.name.startswith(PREFIX) and block.users==0:blocks.remove(block)
    COL=bpy.data.collections.new(COLLECTION_NAME);bpy.context.scene.collection.children.link(COL)
    MATS={};CHECKS=[];bind()
    for name,color in {'Linen':'#d5c09a','Sage':'#799d86','Clay':'#c68164','Cream':'#ebdfc4','Oak':'#ac7b51','Ink':'#283f48','Leaf':'#618967','LeafLight':'#95b681','Brass':'#c6a369','Blue':'#6f96a4','Paper':'#e4d6b9','Pink':'#bf8278'}.items():
        helpers['material'](name,color)
    helpers['material']('Glow','#ffdb9c',emission=2)
    print('COZY_SETUP',len(COL.objects))

def resume():
    global COL,MATS,CHECKS
    COL=bpy.data.collections[COLLECTION_NAME]
    MATS={m.name[len(PREFIX):]:m for m in bpy.data.materials if m.name.startswith(PREFIX)}
    CHECKS=json.loads(COL.get('checks','[]'));bind()

def check(name,a,b,tolerance=.004):
    gap=a-b;assert abs(gap)<=tolerance,(name,gap)
    CHECKS.append({'interface':name,'gapMeters':round(gap,6)})
    COL['checks']=json.dumps(CHECKS)

def tube(name,points,radius,mat,parent=None,sides=8):
    points=[Vector(p) for p in points];closed=(points[-1]-points[0]).length<.000001
    if closed:points=points[:-1]
    verts=[];faces=[];count=len(points)
    for j,p in enumerate(points):
        tangent=(points[(j+1)%count]-points[(j-1)%count]).normalized() if closed else (points[min(j+1,count-1)]-points[max(0,j-1)]).normalized()
        ref=Vector((0,1,0)) if abs(tangent.y)<.9 else Vector((1,0,0))
        side=tangent.cross(ref).normalized();up=tangent.cross(side).normalized()
        for i in range(sides):
            a=i*math.tau/sides;verts.append(p+radius*(side*math.cos(a)+up*math.sin(a)))
    for j in range(count if closed else count-1):
        k=(j+1)%count
        for i in range(sides):faces.append((j*sides+i,j*sides+(i+1)%sides,k*sides+(i+1)%sides,k*sides+i))
    if not closed:faces += [tuple(reversed(range(sides))),tuple((count-1)*sides+i for i in range(sides))]
    return mesh(name,verts,faces,mat,parent)

def bounds(o,axis,op):
    return op((o.matrix_world@Vector(v))[axis] for v in o.bound_box)

def batch():
    """One mesh per parent/material, preserving wall-side and desk identity."""
    for parent in [o for o in list(COL.objects) if o.type=='EMPTY']:
        groups={}
        for o in list(parent.children):
            if o.type=='MESH':groups.setdefault(o.data.materials[0].name,[]).append(o)
        for objects in groups.values():
            if len(objects)<2:continue
            material=objects[0].data.materials[0];verts=[];faces=[];inverse=parent.matrix_world.inverted()
            for o in objects:
                assert all(p.material_index==0 for p in o.data.polygons),'Unexpected multi-material input'
                matrix=inverse@o.matrix_world;offset=len(verts)
                verts.extend(matrix@v.co for v in o.data.vertices)
                faces.extend(tuple(offset+i for i in p.vertices) for p in o.data.polygons)
            name=PREFIX+'Batch_'+parent.name[len(PREFIX):]+'_'+material.name[len(PREFIX):]
            data=bpy.data.meshes.new(name+'_Mesh');data.from_pydata(verts,[],faces);data.update();data.materials.append(material)
            obj=bpy.data.objects.new(name,data);COL.objects.link(obj);obj.parent=parent
            for o in objects:bpy.data.objects.remove(o,do_unlink=True)
            obj.name=name

def export(root):
    root=Path(root);owned={o.name for o in COL.objects}
    selected=[o.name for o in bpy.context.selected_objects if o.name not in owned]
    active=bpy.context.view_layer.objects.active
    active_name=active.name if active and active.name not in owned else None
    try:
        bpy.context.view_layer.update()
        for o in list(COL.objects):
            if o.type=='FONT':
                data=bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
                n=bpy.data.objects.new(o.name+'_Mesh',data);COL.objects.link(n);n.parent=o.parent;n.matrix_world=o.matrix_world.copy();bpy.data.objects.remove(o,do_unlink=True)
        before=len(COL.objects);batch()
        for o in list(bpy.context.selected_objects):o.select_set(False)
        for o in COL.objects:o.select_set(True)
        bpy.context.view_layer.objects.active=next(iter(COL.objects))
        bpy.context.view_layer.update()
        bpy.ops.export_scene.gltf(filepath=str(root/'assets/models/office-cozy.glb'),export_format='GLB',use_selection=True,use_visible=False,export_extras=True,export_animations=False,export_yup=True,export_cameras=False,export_lights=False)
        bpy.data.libraries.write(str(root/'art/blender/studio-cozy/studio-cozy.blend'),{COL},compress=True)
        triangles=sum(len(p.vertices)-2 for o in COL.objects if o.type=='MESH' for p in o.data.polygons)
        report={'method':'Additive native Blender geometry; no existing furniture or characters changed','sourceSceneNotSaved':bpy.data.filepath,'objectsBeforeBatch':before,'objectsAfterBatch':len(COL.objects),'triangles':triangles,'meshes':sum(o.type=='MESH' for o in COL.objects),'meshDatablocksSingleUser':all(o.data.users==1 for o in COL.objects if o.type=='MESH'),'contacts':CHECKS,'baseOffice':'assets/models/office.glb','dressingPreserved':'assets/models/office-dressing.glb'}
        (root/'art/blender/studio-cozy/receipt.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print('COZY_EXPORTED',json.dumps(report,ensure_ascii=False))
    finally:
        for o in list(bpy.context.selected_objects):o.select_set(False)
        for name in selected:
            o=bpy.data.objects.get(name)
            if o and o.name in bpy.context.scene.objects:o.select_set(True)
        if active_name and active_name in bpy.context.scene.objects:bpy.context.view_layer.objects.active=bpy.data.objects[active_name]
