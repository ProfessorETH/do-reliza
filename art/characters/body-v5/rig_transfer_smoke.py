"""Native API regression test, synthetic triangles ONLY, no production output."""
from pathlib import Path
import importlib.util
import json
import tempfile
import bpy
from mathutils import Vector

module_path=Path(__file__).with_name('rig_hunyuan_body.py')
spec=importlib.util.spec_from_file_location('body_rig_stage',module_path)
stage=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
doc,binary=stage.parse_glb(Path('assets/models/mira.glb'))
arm,names,skin,anchors=stage.target_rig(doc,binary,'mira')
donor=stage.donor_mesh(doc,binary,'mira',skin,names)
def mesh(name,vertices):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],[tuple(range(len(vertices)))]);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);return obj
body=mesh('HB_mira_Body',[(0,-.10,1.1),(.1,-.10,1.1),(0,-.10,1.2)])
body.rotation_mode='QUATERNION'
original=[v.co.copy() for v in body.data.vertices]
proof=stage.rotate_source_front(body)
for v,p in zip(body.data.vertices,original):
    assert (v.co-Vector((-p.x,-p.y,p.z))).length<1e-6,'Imported quaternion mesh must actually turn to game front'
stage.rotate_source_front(body) # Return synthetic weight-transfer fixture to its original position.
body['hunyuanBodyPart']='Body'
result=stage.transfer_weights(body,donor,arm,names,'mira',.13,1.34)
for v in body.data.vertices:
    assert abs(sum(g.weight for g in v.groups)-1)<1e-5
    assert 1<=len(v.groups)<=4
bpy.data.objects.remove(donor,do_unlink=True)
feet=[]
for part,sign in [('LeftFoot',-1),('RightFoot',1)]:
    foot=mesh('HB_mira_'+part,[(sign*.16,.15,.012),(sign*.06,.15,.012),(sign*.115,-.05,.13)])
    foot['hunyuanBodyPart']=part;old=foot.matrix_world.copy()
    foot.parent=arm;foot.parent_type='BONE';foot.parent_bone='Skin_mira_'+part;foot.matrix_world=old
    feet.append(foot)
bpy.ops.object.select_all(action='DESELECT')
for obj in [arm,body,*feet]:obj.select_set(True)
bpy.context.view_layer.objects.active=arm
with tempfile.TemporaryDirectory(prefix='hunyuan-body-api-test-') as folder:
    target=Path(folder)/'synthetic-stage.glb'
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_all_influences=False)
    exported,payload=stage.parse_glb(target);world=stage.world_reader(exported)
    joints=exported['skins'][0]['joints'];assert len(joints)==25
    for i in joints:
        node=exported['nodes'][i];actual=stage.C @ world(i).translation
        assert (actual-anchors[node['name']]).length<.003,(node['name'],actual[:],anchors[node['name']][:])
    for i,node in enumerate(exported['nodes']):
        if node.get('extras',{}).get('hunyuanBodyPart') not in ['LeftFoot','RightFoot']:continue
        p=exported['meshes'][node['mesh']]['primitives'][0]
        vertices=[world(i)@Vector(v) for v in stage.accessor(exported,payload,p['attributes']['POSITION'])]
        assert abs(min(v.y for v in vertices)-.012)<1e-5,'Native shoe parent altered floor contact'
        assert abs(max(v.y for v in vertices)-.13)<1e-5,'Native shoe parent altered ankle contact'
print('HUNYUAN_BODY_NATIVE_SMOKE_PASS',json.dumps({'bones':len(joints),'synthetic_weighted_vertices':len(body.data.vertices),'native_weight_transfer':result,'real_shoe_parent_contacts':True}),flush=True)
