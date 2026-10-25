"""Reopen final Mira in a factory background process; render three CPU views.

blender --background --factory-startup --threads 4 art/blender/mira-polish.blend \
  --python-exit-code 1 --python art/characters/mira-polish/native_qa.py
Does not save the opened source or touch the live scene/model.
"""
import bpy
import json
import hashlib
from pathlib import Path
from mathutils import Vector

root=Path.cwd();source=root/'art/blender/mira-polish.blend';receipt_path=source.with_suffix('.receipt.json')
receipt=json.loads(receipt_path.read_text());model=root/'assets/models/mira.glb'
expected='2be92c4f890f7e24a1ef9153251238c986cec0cd53be695ef868e913da52cdb1'
assert hashlib.sha256(model.read_bytes()).hexdigest()==expected
assert receipt['models'][0]['source_sha256']==expected
assert hashlib.sha256(source.read_bytes()).hexdigest()==receipt['sha256']
rigs=[o for o in bpy.data.objects if o.type=='ARMATURE'];assert len(rigs)==1
rig=rigs[0];assert len(rig.data.bones)==25
assert len(bpy.data.actions)==5 and all(a.use_fake_user for a in bpy.data.actions)
assert {a.name for a in bpy.data.actions}=={'Idle','Walk','Sit','Stand','Work'}
images=[i for i in bpy.data.images if i.packed_file];assert len(images)==3
assert not [i.name for i in bpy.data.images if i.source=='FILE' and not i.packed_file]
head=bpy.data.objects['DR_mira_PortraitHead'];assert head.parent_type=='BONE' and head.parent_bone=='Skin_mira_Head'
assert head.data.shape_keys and len(head.data.shape_keys.key_blocks)>=2
blink=[k.name for k in head.data.shape_keys.key_blocks if 'blink' in k.name.lower()];assert blink
collars=[o for o in bpy.data.objects if o.type=='MESH' and ('crewneck' in o.name.lower() or 'crewneck' in o.data.name.lower())];assert collars
body=bpy.data.objects['DR_mira_Skin'];assert any(m.type=='ARMATURE' for m in body.modifiers)
out=root/'work/mira-polish/native-final';out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=True
scene.render.resolution_x=512;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.36,.38,.41,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
for o in list(bpy.data.objects):
 if o.type in {'LIGHT','CAMERA'}:bpy.data.objects.remove(o,do_unlink=True)
def area(name,pos,energy,size):
 data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size
 o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,1.45))-o.location).to_track_quat('-Z','Y').to_euler()
area('CPU Review Soft Key',(1.7,2.7,3.2),190,3.0);area('CPU Review Soft Fill',(-2.0,1.0,2.0),95,2.5)
camera_data=bpy.data.cameras.new('CPU Review Camera');camera=bpy.data.objects.new('CPU Review Camera',camera_data);scene.collection.objects.link(camera);scene.camera=camera
camera_data.type='ORTHO';camera_data.ortho_scale=.85
target=Vector((0,0,1.46));views=[]
for name,position in [('front',(0,3,1.49)),('quarter',(2.2,3,1.54)),('profile',(3,0,1.49))]:
 camera.location=position;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/f'{name}.png')
 bpy.ops.render.render(write_still=True)
 image=out/f'{name}.png';views.append({'view':name,'path':image.relative_to(root).as_posix(),'sha256':hashlib.sha256(image.read_bytes()).hexdigest()})
report={'status':'native_reopen_verified','production_model_sha256':expected,'native_source':'art/blender/mira-polish.blend','native_source_sha256':receipt['sha256'],'native_source_bytes':receipt['bytes'],'rigs':1,'bones':25,'actions':5,'all_actions_fake_user':True,'packed_images':3,'external_images':0,'head_parent_bone':head.parent_bone,'blink_shape_keys':blink,'collar_meshes':[o.name for o in collars],'render_device':'CPU','native_view_pose':'REST, original editable rig','views':views,'limits':['Native images are separate soft-light CPU source views, not substitutes for the parent actual-office pose and keyboard IK checks.','No live Blender scene, production GLB or saved native source was edited during this reopen.']}
receipt['reopen_verification']={k:v for k,v in report.items() if k not in ['views','limits']};receipt['native_generator']='art/characters/body-v5/rig_build_team_source.py';receipt['native_generator_sha256']=hashlib.sha256((root/receipt['native_generator']).read_bytes()).hexdigest()
receipt_path.write_text(json.dumps(receipt,indent=2)+'\n')
(root/'art/characters/mira-polish/native-final-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print('MIRA_NATIVE_FINAL_QA',json.dumps(report),flush=True)
