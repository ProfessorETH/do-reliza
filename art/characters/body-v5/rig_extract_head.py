"""Extract a head from the SAME textured full-body generation, CPU only.

blender -b --factory-startup --python rig_extract_head.py --
  --body NIKA_FULLBODY.glb --cut-y RAW_GLTF_Y --output NIKA_HEAD.glb [--force]

No character generation or body fit occurs. Original Hunyuan GLTF+Z front,
material and UVs are retained, compatible with attach-portrait-head.js.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import bpy

spec=importlib.util.spec_from_file_location('body_stage',Path(__file__).with_name('rig_hunyuan_body.py'))
stage=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--body',required=True);parser.add_argument('--output',required=True)
    parser.add_argument('--cut-y',required=True,type=float);parser.add_argument('--force',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    source=Path(args.body).resolve();output=Path(args.output).resolve();scope=Path(__file__).resolve().parent
    assert output.is_relative_to(scope) and output!=source and output.suffix=='.glb'
    assert args.force or not output.exists(),'Review the existing extracted head before --force'
    source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert len(meshes)==1
    head=meshes[0];bpy.ops.object.select_all(action='DESELECT');head.select_set(True);bpy.context.view_layer.objects.active=head
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    assert min(v.co.z for v in head.data.vertices)<args.cut_y<max(v.co.z for v in head.data.vertices)
    stage.bisect(head,2,args.cut_y,False);head.name='HunyuanBody_ExtractedHead'
    assert len(head.data.polygons)>100,'Cut removed the generated head'
    output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=False,export_image_format='AUTO')
    record={'source':str(source),'source_sha256':source_hash,'raw_cut_gltf_y':args.cut_y,'output':str(output),'output_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'vertices':len(head.data.vertices),'triangles':sum(len(p.vertices)-2 for p in head.data.polygons),'bounds_blender':[[min(v.co[i] for v in head.data.vertices) for i in range(3)],[max(v.co[i] for v in head.data.vertices) for i in range(3)]],'front':'Original Hunyuan GLTF+Z; no body fit/rotation applied','source_unchanged':hashlib.sha256(source.read_bytes()).hexdigest()==source_hash}
    output.with_suffix('.receipt.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8');print('EXTRACTED_BODY_HEAD',json.dumps(record),flush=True)

if __name__=='__main__':main()
