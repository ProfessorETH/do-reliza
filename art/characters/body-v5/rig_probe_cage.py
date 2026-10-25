"""Read-only source/cage diagnostic. Uses rig_hunyuan_body CLI arguments;
exits immediately after fitting, before cuts, weighting or any GLB export.
"""
import importlib.util
import json
from pathlib import Path
import sys

spec=importlib.util.spec_from_file_location('rig_probe_target',Path(__file__).with_name('rig_hunyuan_body.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
original=module.limb_cage_fit

def probe(body,*args):
    before=[v.co.copy() for v in body.data.vertices]
    result=original(body,*args);flips=[];total_area=flipped_area=0
    for face in body.data.polygons:
        if len(face.vertices)!=3:continue
        ids=list(face.vertices);a,b,c=[before[i] for i in ids];x,y,z=[body.data.vertices[i].co for i in ids]
        center=(x+y+z)/3
        if not .5<center.z<1.4:continue
        n0=(b-a).cross(c-a);n1=(y-x).cross(z-x);area=n0.length/2;total_area+=area
        if n0.length<1e-10 or n1.length<1e-10:continue
        dot=n0.normalized().dot(n1.normalized())
        if dot<0:
            flipped_area+=area;flips.append({'face':face.index,'dot':dot,'area':area,'before':[list(before[i]) for i in ids],'after':[list(body.data.vertices[i].co) for i in ids]})
    flips.sort(key=lambda f:f['area'],reverse=True)
    print('CAGE_NORMAL_PROBE',json.dumps({'flipped_faces':len(flips),'flipped_area':flipped_area,'total_inspected_area':total_area,'worst':flips[:12],'cage':result}),flush=True)
    raise SystemExit(0)

module.limb_cage_fit=probe
module.main()
