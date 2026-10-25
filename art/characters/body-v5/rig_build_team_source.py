"""Rebuild the editable, packed seven-character source from accepted game GLBs.

blender --background --factory-startup --threads 6 --python-exit-code 1 \
  --python art/characters/body-v5/rig_build_team_source.py -- [--force]

No generation, render, live scene or animation resampling is performed.
Run only after all seven assets/models/{id}.glb pass their acceptance gate.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
import time

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
IDS=['mira','pixel','nord','echo','iskra','saga','nika']
OUTPUT=ROOT/'art/blender/team-body-v5.blend'
CLIPS={'Idle','Walk','Sit','Stand','Work'}
MAX_PACKED_BYTES=100*1024*1024 # GitHub's 100 MiB file ceiling, explicitly binary units.


def glb_json(path):
    data=path.read_bytes()
    assert struct.unpack_from('<II',data)==(0x46546C67,2),'Expected GLB2'
    size=struct.unpack_from('<I',data,12)[0]
    return json.loads(data[20:20+size]),hashlib.sha256(data).hexdigest()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--force',action='store_true')
    parser.add_argument('--character',choices=IDS,help='Pack one reviewed character in a separate source file')
    parser.add_argument('--output',help='Project-relative native source destination')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    ids=[args.character] if args.character else IDS
    output=(ROOT/args.output).resolve() if args.output else OUTPUT
    assert output.is_relative_to(ROOT) and output.suffix=='.blend','Native source must stay in this project'
    assert not args.character or args.output,'Single-character packs need an explicit separate output'
    assert args.force or not output.exists(),'Review existing packed source before --force'
    sources={}
    # Validate the complete input set before changing even this isolated scene.
    for ident in ids:
        path=ROOT/f'assets/models/{ident}.glb';doc,sha=glb_json(path)
        assert doc['asset'].get('extras',{}).get('hunyuanBodyVersion')==5,f'{ident}: accepted v5 body required'
        assert doc['asset']['extras'].get('portraitHeadVersion')==4,f'{ident}: accepted portrait attachment required'
        assert {c['name'] for c in doc['animations']}==CLIPS,f'{ident}: five preserved clips required'
        sources[ident]={'path':path,'json':doc,'sha256':sha}
    started=time.monotonic()
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene.render.engine='BLENDER_WORKBENCH'
    scene.display.shading.light='STUDIO';scene.display.shading.color_type='TEXTURE'
    team=bpy.data.collections.new('Team Body V5 — accepted game sources');scene.collection.children.link(team)
    report=[]
    for index,ident in enumerate(ids):
        source=sources[ident];before=set(bpy.data.objects);before_actions=set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=str(source['path']))
        imported=set(bpy.data.objects)-before;actions=set(bpy.data.actions)-before_actions
        collection=bpy.data.collections.new(ident);team.children.link(collection)
        root=bpy.data.objects.new(f'BodyV5_{ident}_Source',None);collection.objects.link(root)
        root['source_glb_sha256']=source['sha256'];root['role']='mentor' if ident=='nika' else 'staff'
        root['accepted_body_version']=5
        for obj in imported:
            for owner in list(obj.users_collection):owner.objects.unlink(obj)
            collection.objects.link(obj)
            if obj.parent not in imported:
                matrix=obj.matrix_world.copy();obj.parent=root;obj.matrix_world=matrix
        root.location.x=(index-(len(ids)-1)/2)*1.12
        body=next(o for o in imported if o.name==f'DR_{ident}_Skin' and o.type=='MESH')
        head=next(o for o in imported if o.name==f'DR_{ident}_PortraitHead' and o.type=='MESH')
        armature=next(o for o in imported if o.type=='ARMATURE' and f'Skin_{ident}_Head' in o.data.bones)
        assert len(armature.data.bones)==25,f'{ident}: expected preserved 25-bone skeleton'
        assert body.data.uv_layers.active,f'{ident}: body UVs missing'
        assert any(m.type=='ARMATURE' and m.object==armature for m in body.modifiers),f'{ident}: real skin modifier missing'
        assert head.parent==armature and head.parent_type=='BONE' and head.parent_bone==f'Skin_{ident}_Head',f'{ident}: portrait head detached'
        assert len(actions)>=5,f'{ident}: imported editable animation actions missing'
        max_weight_error=0
        for vertex in body.data.vertices:
            assert 1<=len(vertex.groups)<=4,f'{ident}: invalid native skin influence count'
            max_weight_error=max(max_weight_error,abs(sum(g.weight for g in vertex.groups)-1))
        assert max_weight_error<.002,f'{ident}: non-normalized native skin weights'
        body.data.calc_loop_triangles()
        signed_volume=sum(body.data.vertices[t.vertices[0]].co.dot(body.data.vertices[t.vertices[1]].co.cross(body.data.vertices[t.vertices[2]].co))/6 for t in body.data.loop_triangles)
        assert signed_volume>0,f'{ident}: native body winding is inward'
        armature.show_in_front=True;armature.data.pose_position='REST'
        for part in ['LeftFoot','RightFoot']:
            foot=next(o for o in imported if o.name==f'DR_{ident}_{part}_Rigid' and o.type=='MESH')
            assert foot.parent_type=='BONE' and foot.parent_bone==f'Skin_{ident}_{part}',f'{ident}: real generated shoe detached'
        report.append({'id':ident,'source_sha256':source['sha256'],'body_vertices':len(body.data.vertices),'body_triangles':sum(len(p.vertices)-2 for p in body.data.polygons),'head_triangles':sum(len(p.vertices)-2 for p in head.data.polygons),'bones':len(armature.data.bones),'maximum_weight_sum_error':max_weight_error,'body_signed_triangle_volume_proxy':signed_volume,'portrait_head_bone_parent':head.parent_bone,'clip_names':sorted(CLIPS),'imported_actions':sorted(a.name for a in actions)})
    scene.frame_set(0)
    before_purge={name:len(getattr(bpy.data,name)) for name in ['meshes','materials','images','actions']}
    for action in bpy.data.actions:action.use_fake_user=True
    bpy.data.orphans_purge(do_recursive=True)
    after_purge={name:len(getattr(bpy.data,name)) for name in before_purge}
    for image in bpy.data.images:
        if image.source=='FILE' and image.has_data and not image.packed_file:image.pack()
    unpacked=[image.name for image in bpy.data.images if image.source=='FILE' and image.has_data and not image.packed_file]
    assert not unpacked,f'External image dependencies remain: {unpacked}'
    camera_data=bpy.data.cameras.new('Team Review Camera');camera=bpy.data.objects.new('Team Review Camera',camera_data);scene.collection.objects.link(camera)
    camera.location=(0,10,3.8);camera.rotation_euler=(Vector((0,0,1))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=8.8;scene.camera=camera
    scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
    command='blender --background --factory-startup --threads 6 --python-exit-code 1 --python art/characters/body-v5/rig_build_team_source.py -- --force'
    if args.character:command+=f' --character {args.character} --output {output.relative_to(ROOT).as_posix()}'
    scene['source_rebuild_command']=command
    scene['source_receipt']=json.dumps(report,ensure_ascii=False)
    bpy.ops.object.select_all(action='DESELECT')
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.context.preferences.filepaths.save_version=0 # First pack is separately preserved under work/.
    bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
    size=output.stat().st_size
    assert size<MAX_PACKED_BYTES,f'Packed source exceeds 100 MiB: {size}'
    receipt={'status':'native_source_verified','output':str(output.relative_to(ROOT)).replace('\\','/'),'bytes':size,'mib':round(size/1024/1024,3),'size_limit_bytes':MAX_PACKED_BYTES,'size_limit_basis':'100 MiB GitHub file ceiling; textures/geometry not degraded','sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'seconds':round(time.monotonic()-started,3),'packed_images':sum(bool(i.packed_file) for i in bpy.data.images),'external_images':unpacked,'orphan_data_before':before_purge,'orphan_data_after':after_purge,'all_actions_fake_user':all(a.use_fake_user for a in bpy.data.actions),'models':report}
    output.with_suffix('.receipt.json').write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print('PACKED_TEAM_SOURCE',json.dumps(receipt,ensure_ascii=False),flush=True)


if __name__=='__main__':main()
