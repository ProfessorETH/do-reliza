"""Native Blender, review-only Mira head polish; consumes work extraction JSON.

blender --background --factory-startup --threads 3 --python-exit-code 1 \
  --python art/characters/mira-polish/head_review.py
Outputs a sparse WORLD-space geometry delta and a native image-pixel albedo pass.
No game GLB, rig, body, animation, original texture or live scene is modified.
"""
import bpy
import json
import math
import argparse
import sys
import numpy as np
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('--output-dir',default=str(ROOT/'work/mira-polish'));parser.add_argument('--lower-curls',action='store_true');parser.add_argument('--hair-padding',type=int,choices=[0,8],default=0)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=Path(args.output_dir).resolve()
d=json.loads((OUT/'head-0.json').read_text())
meta=json.loads((OUT/'extracted.json').read_text())
v=d['positions'];tri=[d['index'][i:i+3] for i in range(0,len(d['index']),3)]
# UV-seam copies MUST share one deformation. Smooth a position-welded proxy,
# then map its positions back to every untouched original UV/index vertex.
keys={};unique=[];mapping=[]
for p in v:
    key=tuple(round(x,7) for x in p)
    if key not in keys:keys[key]=len(unique);unique.append(p)
    mapping.append(keys[key])
proxy_tri=[[mapping[i] for i in t] for t in tri]
mesh=bpy.data.meshes.new('Mira_Head_ReadOnly_Copy');mesh.from_pydata(unique,[],[t for t in proxy_tri if len(set(t))==3]);mesh.update()
obj=bpy.data.objects.new('Mira_Head_ReadOnly_Copy',mesh);bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
def smooth(a,b,x):
    t=max(0.,min(1.,(x-a)/(b-a)));return t*t*(3-2*t)
weights=[];group=obj.vertex_groups.new(name='BackHair_Only')
for i,p in enumerate(unique):
    x,y,z=p;w=smooth(.04,.105,z)*smooth(1.40,1.46,y)*(1-smooth(1.68,1.73,y))
    weights.append(w)
    if w>0:group.add([i],w,'REPLACE')
mod=obj.modifiers.new('Native_BackHair_Smooth','SMOOTH');mod.factor=.35;mod.iterations=3;mod.vertex_group=group.name
bpy.ops.object.modifier_apply(modifier=mod.name)
positions=[]
for i,vertex in enumerate(mesh.vertices):
    if weights[i]<=0:continue
    p=vertex.co.copy();p.z=.02+(p.z-.02)*(1-.18*weights[i]);vertex.co=p
    positions.append([i,list(p)])
mesh.update()

# Native image API; read original, create a separate PNG. glTF UV origin is top-left.
source=bpy.data.images.load(str(OUT/meta['primitives'][0]['albedo']),check_existing=False)
width,height=source.size;pixels=list(source.pixels[:])
# bpy image arrays start at the lower-left, so only this native access flips v.
def pixel_index(uv):
    x=max(0,min(width-1,int(uv[0]*width)));y=max(0,min(height-1,int((1-uv[1])*height)))
    return y*width+x
def rgb(uv):
    j=pixel_index(uv)*4;return pixels[j:j+3]
def sat(c):return (max(c)-min(c))/max(max(c),1e-8)
def hair_domain(p):
    x,y,z=p;a=abs(x)
    radial=math.sqrt((x/.050)**2+((z-.004)/.052)**2)
    lower_curl=(args.lower_curls and 1.355<y<1.46 and .075<a<.16 and -.085<z<.13 and radial>1.5)
    return ((1.545<y<1.665 and a>.103 and z>-.14) or (1.43<y<=1.545 and a>.142 and z>-.12) or lower_curl)
donors=[]
for i,p in enumerate(v):
    c=rgb(d['uv'][i])
    if 1.43<p[1]<1.69 and abs(p[0])>.09 and sat(c)>.65 and c[0]>c[1]*1.35 and c[1]>c[2]*1.2:
        donors.append((p,c))
remove=[]
for i,t in enumerate(tri):
    center=[sum(v[k][a] for k in t)/3 for a in range(3)]
    uv=[sum(d['uv'][k][a] for k in t)/3 for a in range(2)];c=rgb(uv)
    # Keep front chin/jaw and saturated copper curls, remove the flared skin cone.
    if center[1]<1.399 and abs(center[0])<.142 and -.085<center[2]<.105 and sat(c)<.62 and c[0]>c[1]:remove.append(i)

# Retain authentic throat UVs and continuously tuck its lower skirt into collar.
neck_vertices=set(mapping[k] for i in remove for k in tri[i]);neck_changed=[]
# Extend the skin domain to the rear skirt. Copper triangles remain intact.
for i,t in enumerate(tri):
    center=[sum(v[k][a] for k in t)/3 for a in range(3)]
    uv=[sum(d['uv'][k][a] for k in t)/3 for a in range(2)];c=rgb(uv)
    if center[1]<1.399 and center[2]>-.085 and sat(c)<.62 and c[0]>c[1]:
        neck_vertices.update(mapping[k] for k in t)
remove=[]
for i,t in enumerate(tri):
    center=[sum(v[k][a] for k in t)/3 for a in range(3)]
    uv=[sum(d['uv'][k][a] for k in t)/3 for a in range(2)];c=rgb(uv)
    radial=math.sqrt((center[0]/.050)**2+((center[2]-.004)/.052)**2)
    if center[1]<1.395 and center[2]>-.085 and radial>1.75 and sat(c)<.62 and c[0]>c[1]:remove.append(i)
for i in neck_vertices:
    x,y,z=unique[i]
    if y>=1.415 or z<-.085:continue
    w=1-smooth(1.385,1.415,y)
    radial=math.sqrt((x/.050)**2+((z-.004)/.052)**2)
    if radial<=1:continue
    # Positive radial derivative .25 avoids the collapse of a hard ellipse clamp.
    scale=1+((1+.25*(radial-1))/radial-1)*w
    p=mesh.vertices[i].co.copy();p.x=x*scale;p.z=.004+(z-.004)*scale
    mesh.vertices[i].co=p;neck_changed.append(i)
mesh.update()
changed=set(i for i,_ in positions)|set(neck_changed)
original=np.asarray(unique,dtype=np.float64)
target=np.asarray([list(p.co) for p in mesh.vertices],dtype=np.float64)
factor=np.ones(len(unique),dtype=np.float64)
removed_set=set(remove)
retained=np.asarray([proxy_tri[i] for i in range(len(tri)) if i not in removed_set])
oldcross=np.cross(original[retained[:,1]]-original[retained[:,0]],original[retained[:,2]]-original[retained[:,0]])
oldarea=np.linalg.norm(oldcross,axis=1)
safe=target.copy();backtrack_iterations=0
for iteration in range(50):
    newcross=np.cross(safe[retained[:,1]]-safe[retained[:,0]],safe[retained[:,2]]-safe[retained[:,0]])
    bad=(oldarea>1e-12)&((np.sum(oldcross*newcross,axis=1)<=0)|(np.linalg.norm(newcross,axis=1)<1e-12))
    if not bad.any():break
    offending=np.unique(retained[bad]);factor[offending]*=.5
    if iteration>35:factor[offending]=0
    safe=original+(target-original)*factor[:,None];backtrack_iterations=iteration+1
else:raise AssertionError('Could not establish a no-flip neck/hair step')
for i in changed:mesh.vertices[i].co=safe[i].tolist()
mesh.update()
positions=[[i,safe[mapping[i]].tolist()] for i in range(len(v)) if mapping[i] in changed]
normals=[[i,list(mesh.vertices[mapping[i]].normal)] for i in range(len(v)) if mapping[i] in changed]

# Rasterize the conservative anatomical temple triangle mask into native image.
mask=set()
for t in tri:
    center=[sum(v[k][a] for k in t)/3 for a in range(3)]
    if not hair_domain(center):continue
    coords=[(d['uv'][k][0]*width,(1-d['uv'][k][1])*height) for k in t]
    (ax,ay),(bx,by),(cx,cy)=coords;den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
    if abs(den)<1e-8:continue
    for y in range(max(0,int(min(q[1] for q in coords))),min(height-1,int(max(q[1] for q in coords))+1)+1):
        for x in range(max(0,int(min(q[0] for q in coords))),min(width-1,int(max(q[0] for q in coords))+1)+1):
            a=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/den;b=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/den
            if min(a,b,1-a-b)>=0:mask.add(y*width+x)
painted=0;painted_ids=[]
for k in sorted(mask):
    j=k*4;c=pixels[j:j+3]
    if sat(c)>.62 or max(c)<.08:continue
    # Copper hue from existing nearby curls, retain local luminance and variation.
    lum=.2126*c[0]+.7152*c[1]+.0722*c[2]
    target=[min(1.,lum*1.58),min(1.,lum*.70),min(1.,lum*.25)]
    pixels[j:j+3]=target;painted+=1;painted_ids.append(k)
padding_count=0
if args.hair_padding:
    # Protect every occupied non-hair triangle, including its 1px filter edge.
    # UV gutters and unprotected neighbouring hair texels receive the nearest
    # repaired edge colour; all occupied non-hair triangles stay protected.
    protected=np.zeros((height,width),dtype=bool)
    for t in tri:
        center=[sum(v[k][a] for k in t)/3 for a in range(3)]
        if hair_domain(center):continue
        coords=np.array([(d['uv'][k][0]*width,(1-d['uv'][k][1])*height) for k in t])
        ax,ay=coords[0];bx,by=coords[1];cx,cy=coords[2];den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
        if abs(den)<1e-8:continue
        lo=np.maximum(np.floor(coords.min(0)).astype(int),0);hi=np.minimum(np.ceil(coords.max(0)).astype(int),[width-1,height-1])
        if (lo>hi).any():continue
        xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5)
        a=((by-cy)*(xx-cx)+(cx-bx)*(yy-cy))/den;b=((cy-ay)*(xx-cx)+(ax-cx)*(yy-cy))/den
        protected[lo[1]:hi[1]+1,lo[0]:hi[0]+1]|=(a>=0)&(b>=0)&(a+b<=1)
    barrier=protected.copy()
    for dy in [-1,0,1]:
        for dx in [-1,0,1]:
            ys=slice(max(0,dy),min(height,height+dy));xs=slice(max(0,dx),min(width,width+dx));srcy=slice(max(0,-dy),min(height,height-dy));srcx=slice(max(0,-dx),min(width,width-dx))
            barrier[ys,xs]|=protected[srcy,srcx]
    labels=np.full((height,width),-1,dtype=np.int32)
    labels.ravel()[painted_ids]=painted_ids
    seed=labels>=0
    for step in range(args.hair_padding):
        before=labels.copy()
        for dy in [-1,0,1]:
            for dx in [-1,0,1]:
                if dx==0 and dy==0:continue
                ys=slice(max(0,dy),min(height,height+dy));xs=slice(max(0,dx),min(width,width+dx));srcy=slice(max(0,-dy),min(height,height-dy));srcx=slice(max(0,-dx),min(width,width-dx))
                dst=labels[ys,xs];src=before[srcy,srcx];valid=(dst<0)&(src>=0)&(~barrier[ys,xs]);dst[valid]=src[valid]
    pads=np.nonzero((labels>=0)&(~seed)&(~barrier))
    for y,x in zip(*pads):
        k=int(y*width+x);donor=int(labels[y,x]);pixels[k*4:k*4+3]=pixels[donor*4:donor*4+3];padding_count+=1
image=bpy.data.images.new('Mira_TempleCopper_Review',width=width,height=height,alpha=True)
image.colorspace_settings.name=source.colorspace_settings.name;image.pixels[:]=pixels
image.filepath_raw=str(OUT/'head-albedo-review.png');image.file_format='PNG';image.save()

delta={'version':4,'sourceSha256':meta['sourceSha256'],'sourceVertexCount':len(v),'worldSpace':'GLTF Y-up, front -Z','positions':positions,'normals':normals,'removeTriangleIndices':remove,'neck':None,'albedo':'head-albedo-review.png','notes':{'native_smooth_factor':.35,'native_smooth_iterations':3,'back_z_compression':.18,'central_face_and_bun_vertices_untouched':True,'temple_pixels_modified':painted,'temple_mask_pixels':len(mask),'hair_padding_px':args.hair_padding,'hair_padding_texels':padding_count,'neck_continuous_source_vertices':len(neck_changed),'neck_transition_y':[1.385,1.415],'neck_base_radii':[.050,.052],'neck_base_center_z':.004,'neck_original_texture_material_retained':True,'removed_neck_triangles':len(remove),'welded_proxy_vertices':len(unique),'backtracking_iterations':backtrack_iterations,'new_degenerate_faces':0,'hemisphere_reversals_retained_faces':0}}
(OUT/'head-delta.json').write_text(json.dumps(delta,separators=(',',':')))
print('MIRA_HEAD_REVIEW',json.dumps(delta['notes']),flush=True)
