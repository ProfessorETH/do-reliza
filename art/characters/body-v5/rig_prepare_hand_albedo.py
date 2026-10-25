"""Native Blender CPU-only proposal: repair teal paint on distal Nika hands.
Reads the original painted body; writes a NEW PNG/mask/receipt under work/.
Does not export meshes, alter UVs/material assignments, or modify source files.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

import bpy
import numpy as np

ROOT=Path(__file__).resolve().parents[3]


def digest(mesh):
    positions=np.empty(len(mesh.vertices)*3,np.float32);mesh.vertices.foreach_get('co',positions)
    uv=np.empty(len(mesh.uv_layers.active.data)*2,np.float32);mesh.uv_layers.active.data.foreach_get('uv',uv)
    loops=np.empty(len(mesh.loops),np.int32);mesh.loops.foreach_get('vertex_index',loops)
    return hashlib.sha256(positions.tobytes()+uv.tobytes()+loops.tobytes()).hexdigest()


def raster(uv,xyz,w,h):
    xy=uv*np.array([w,h]);lo=np.maximum(0,np.floor(xy.min(0)-.5).astype(int));hi=np.minimum([w-1,h-1],np.ceil(xy.max(0)-.5).astype(int))
    if np.any(hi<lo):return None
    x,y=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5)
    a,b,c=xy;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    if abs(den)<1e-9:return None
    u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den
    v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;z=1-u-v
    inside=(u>=-1e-6)&(v>=-1e-6)&(z>=-1e-6)
    if not inside.any():return None
    iy,ix=np.nonzero(inside);points=u[inside,None]*xyz[0]+v[inside,None]*xyz[1]+z[inside,None]*xyz[2]
    return iy+lo[1],ix+lo[0],points


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--body',required=True);parser.add_argument('--output',required=True);parser.add_argument('--force',action='store_true');parser.add_argument('--neck',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(args.body).resolve();output=Path(args.output).resolve()
    assert output.is_relative_to(ROOT/'work') and output.suffix=='.png','Only a unique work/ PNG proposal may be written'
    assert args.force or not output.exists(),'Proposal already exists'
    started=time.monotonic();source_sha=hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(source))
    body=next(o for o in bpy.data.objects if o.type=='MESH');mesh=body.data;before=digest(mesh)
    shader=next(n for n in mesh.materials[0].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    image=shader.inputs['Base Color'].links[0].from_node.image;w,h=image.size
    pixels=np.empty(w*h*4,np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(h,w,4)
    world=np.array([tuple(body.matrix_world@v.co) for v in mesh.vertices]);uv=mesh.uv_layers.active.data
    mesh.calc_loop_triangles();coordinates=np.zeros((h,w,3),np.float32);covered=np.zeros((h,w),bool);protected=np.zeros((h,w),bool);regions=np.zeros((h,w),np.uint8)
    def domains(points):
        hands=(np.abs(points[:,0])>.35)&(points[:,2]<.045)
        width=np.interp(points[:,2],[.54,.58,.62,.655,.69],[0,.040,.075,.090,.075])-.006
        neck=args.neck&(points[:,2]>.54)&(points[:,2]<.695)&(np.abs(points[:,0])<width)&(points[:,1]<0)
        return hands,neck
    # Blender image pixels and Blender UV coordinates both use bottom-left.
    # Classify texels in real source geometry, not a rectangular atlas region.
    for tri in mesh.loop_triangles:
        xyz=world[list(tri.vertices)]
        result=raster(np.array([tuple(uv[i].uv) for i in tri.loops]),xyz,w,h)
        if result is None:continue
        iy,ix,points=result;hands,neck=domains(points);domain=hands|neck
        if domain.any():
            yy,xx=iy[domain],ix[domain];coordinates[yy,xx]=points[domain];covered[yy,xx]=True;regions[yy,xx]=np.where(hands[domain],1,2)
        if (~domain).any():protected[iy[~domain],ix[~domain]]=True
    r,g,b=(pixels[:,:,i] for i in range(3))
    green=covered&~protected&(g>r*1.10)&(g>b*.90)&(g-r>.01)&(g>.02)
    warm=(r>g*1.12)&(g>b*1.04)
    dark_neck=(regions==2)&(np.maximum.reduce([r,g,b])<.32)&~warm
    target=green|dark_neck
    skin=covered&~protected&(r>g*1.10)&(g>b*1.04)&(b>g*.45)&(r>.15)
    corrected=pixels.copy();changed=np.zeros((h,w),bool);sides=[]
    for region,sign,label in [(1,-1,'negative-X hand'),(1,1,'positive-X hand'),(2,0,'front V-neck')]:
        if region==2 and not args.neck:continue
        domain=(regions==region)&((coordinates[:,:,0]*sign>0) if sign else True);targets=np.argwhere(target&domain);donors=np.argwhere(skin&domain)
        assert len(donors)>30,'Insufficient same-hand skin color donors'
        donors=donors[::max(1,len(donors)//4000)];donor_xyz=coordinates[donors[:,0],donors[:,1]];donor_rgb=pixels[donors[:,0],donors[:,1],:3]
        for start in range(0,len(targets),128):
            batch=targets[start:start+128];points=coordinates[batch[:,0],batch[:,1]]
            distances=((points[:,None,:]-donor_xyz[None,:,:])**2).sum(2);nearest=np.argpartition(distances,4,axis=1)[:,:4]
            weights=1/(np.take_along_axis(distances,nearest,axis=1)+1e-7);weights/=weights.sum(1,keepdims=True)
            rgb=(donor_rgb[nearest]*weights[:,:,None]).sum(1)
            # Full repair below rawY .025; taper to ZERO before cuff rawY .045.
            amount=np.clip((.045-points[:,2])/.020,0,1)[:,None] if region==1 else np.ones((len(points),1))
            old=pixels[batch[:,0],batch[:,1],:3];corrected[batch[:,0],batch[:,1],:3]=old*(1-amount)+rgb*amount
            changed[batch[:,0],batch[:,1]]=amount[:,0]>0
        sides.append({'region':label,'source_x_sign':sign,'affected_texels':len(targets),'skin_donors':len(donors)})
    assert not np.any(changed&protected),'UV overlap would alter jacket/cuffs'
    assert np.array_equal(pixels[~changed],corrected[~changed]),'Pixels outside measured hands changed'
    assert digest(mesh)==before and hashlib.sha256(source.read_bytes()).hexdigest()==source_sha,'Read-only source/geometry contract failed'
    output.parent.mkdir(parents=True,exist_ok=True)
    result=image.copy();result.name='Nika distal hand albedo — review only';result.pixels.foreach_set(corrected.ravel());result.update();result.filepath_raw=str(output);result.file_format='PNG';result.save()
    mask=bpy.data.images.new('Measured distal hand repair mask',width=w,height=h,alpha=True)
    rgba=np.zeros_like(pixels);rgba[:,:,:3]=changed[:,:,None];rgba[:,:,3]=1;mask.pixels.foreach_set(rgba.ravel());mask.update();mask.filepath_raw=str(output.with_name(output.stem+'-mask.png'));mask.file_format='PNG';mask.save()
    points=coordinates[changed]
    receipt={'status':'native_blender_texture_proposal_only','source_glb_sha256':source_sha,'source_geometry_uv_topology_sha256':before,'geometry_uv_rig_changed':False,'source_file_unchanged':True,'image_size':[w,h],'output':str(output),'output_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'affected_texels':int(changed.sum()),'outside_measured_roi_texels_changed':0,'source_hand_domain':{'absolute_x_min':.35,'raw_y_max':.045,'full_repair_below_raw_y':.025,'actual_wrist_raw_y':.055},'source_neck_domain':{'enabled':args.neck,'raw_y_range':[.54,.695],'raw_y_halfwidth_knots':[[.54,0],[.58,.040],[.62,.075],[.655,.090],[.69,.075]],'inward_collar_margin':.006,'native_front_depth_max':0,'replace_only':'teal or non-warm dark fragments; valid skin and white collar unchanged'},'affected_source_bounds':{'min':points.min(0).tolist(),'max':points.max(0).tolist()} if len(points) else None,'same_region_color_donors':sides,'seconds':round(time.monotonic()-started,3)}
    output.with_suffix('.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8');print('NATIVE_HAND_ALBEDO_PROPOSAL',json.dumps(receipt),flush=True)


if __name__=='__main__':main()
