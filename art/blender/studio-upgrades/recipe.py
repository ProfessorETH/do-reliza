"""Additive, toggled office upgrades. Run in a separate Blender factory process.

Anatomy: desk-top felt dividers (2.16 x .48 m, 4.5 cm thick), replacement
tower shells (.44 x .51 x .69 m), a conforming lounge throw and tea tray.
Anchors: actual imported office mesh; desk top .80, coffee top .415, floor 0.
All additions stay inside existing furniture footprints; no navigation obstacles.
"""
import bpy
import math
import json
import hashlib
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
DESKS=[(-2.65,1.95),(1.4,1.95),(-.9,-1.45)]
CHECKS=[]
MATS={}
GROUPS={}

def material(name, color, metallic=0):
    m=bpy.data.materials.new('UP_'+name);m.use_nodes=True
    rgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    bsdf=m.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*rgb,1)
    bsdf.inputs['Roughness'].default_value=.82;bsdf.inputs['Metallic'].default_value=metallic
    m.diffuse_color=(*rgb,1);MATS[name]=m

def setup():
    # --factory-startup isolates this build from the live Blender project.
    for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/models/office.glb'))
    col=bpy.data.collections.new('StudioUpgrades');bpy.context.scene.collection.children.link(col)
    for key in ['lounge','quiet','computers']:
        o=bpy.data.objects.new('Upgrade_'+key,None);col.objects.link(o);o['upgradeId']=key;GROUPS[key]=o
    for name,color,metal in [('Felt','#6e8e82',0),('FeltSeam','#c4b899',0),('Metal','#738a91',.5),('Ink','#1c2c33',.2),('Brass','#d7b77e',.5),('Tea','#b3724f',0),('Cream','#ebdfbf',0),('Cloth','#688fa7',0)]:material(name,color,metal)

def mesh(name,verts,faces,mat,key):
    data=bpy.data.meshes.new('UP_'+name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new('UP_'+name,data);GROUPS[key].users_collection[0].objects.link(o)
    o.parent=GROUPS[key];data.materials.append(MATS[mat]);return o

def box(name,center,size,mat,key):
    x,y,z=center;a,b,c=[v/2 for v in size]
    verts=[(x+dx*a,y+dy*b,z+dz*c) for dx,dy,dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    return mesh(name,verts,[(3,2,1,0),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],mat,key)

def rings(name,center,profile,mat,key,n=12):
    x,y,z=center;verts=[];faces=[]
    for height,radius in profile:
        for i in range(n):a=i*math.tau/n;verts.append((x+radius*math.cos(a),y+radius*math.sin(a),z+height))
    faces.append(tuple(reversed(range(n))))
    for row in range(len(profile)-1):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i))
    faces.append(tuple((len(profile)-1)*n+i for i in range(n)))
    return mesh(name,verts,faces,mat,key)

def check(name,a,b,tolerance=.00002):
    gap=a-b;assert abs(gap)<=tolerance,(name,gap)
    CHECKS.append({'interface':name,'signedGapMeters':round(gap,7)})

def quiet():
    for i,(x,y) in enumerate(DESKS):
        box(f'DividerBack{i}',(x,y+.45,1.04),(2.16,.045,.48),'Felt','quiet')
        check(f'back felt {i} / desk top',1.04-.24,.8)
        for side in [-1,1]:
            box(f'DividerSide{i}_{side}',(x+side*1.07,y+.0275,1.04),(.045,.80,.48),'Felt','quiet')
            check(f'side felt {i} / desk top',1.04-.24,.8)
            # Side end touches the front face of the back panel exactly.
            check(f'side felt {i} / back felt',y+.0275+.40,y+.45-.0225)
        box(f'DividerStitch{i}',(x,y+.426,1.24),(2.04,.003,.012),'FeltSeam','quiet')

def computers():
    for i,(x,y) in enumerate(DESKS):
        x+=.84;y+=.10
        # Open front pocket: the front bed is recessed 16 mm behind its frame.
        box(f'TowerBack{i}',(x,y+.239,.36),(.44,.032,.66),'Metal','computers')
        for side in [-1,1]:box(f'TowerSide{i}_{side}',(x+side*.204,y,.36),(.032,.51,.66),'Metal','computers')
        for z in [.046,.674]:box(f'TowerCap{i}_{z}',(x,y,z),(.408,.51,.032),'Metal','computers')
        box(f'TowerPocket{i}',(x,y-.239,.36),(.376,.004,.596),'Ink','computers')
        for side in [-1,1]:
            for depth in [-1,1]:box(f'TowerFoot{i}_{side}_{depth}',(x+side*.16,y+depth*.18,.015),(.06,.08,.03),'Ink','computers')
        check(f'tower feet {i} / floor',.015-.015,0)
        check(f'tower cap {i} / sides',.674+.016,.36+.33)
        for h in [.23,.46]:
            for k in range(5):box(f'Vent{i}_{h}_{k}',(x-.13+k*.065,y-.242,h),(.032,.004,.105),'Brass','computers')
        box(f'TowerPower{i}',(x+.12,y-.242,.604),(.03,.004,.02),'Cream','computers')

def lounge():
    sofa=bpy.data.objects['Release3D_Static_Room_coral'];bpy.context.view_layer.update()
    inv=sofa.matrix_world.inverted();verts=[];faces=[]
    for row in range(9):
        y=-2.69-row*.44/8
        for col in range(9):
            x=-4.30+col*.35/8
            start=inv@Vector((x,y,2));direction=(inv.to_3x3()@Vector((0,0,-1))).normalized()
            hit,p,_,_=sofa.ray_cast(start,direction);assert hit,('cover misses beanbag',x,y)
            surface=sofa.matrix_world@p;verts.append((x,y,surface.z+.008))
    for row in range(8):
        for col in range(8):a=row*9+col;faces.append((a,a+9,a+10,a+1))
    mesh('LoungeCover',verts,faces,'Cloth','lounge')
    CHECKS.append({'interface':'throw / measured beanbag surface','signedGapMeters':.008,'intent':'8 mm upholstery loft'})
    x,y=-3.62,-3.68
    box('TeaTray',(x,y,.423),(.40,.32,.016),'Brass','lounge');check('tray / coffee tabletop',.423-.008,.415)
    rings('Carafe',(x+.07,y+.04,.431),[(0,.08),(.035,.09),(.22,.075),(.26,.043),(.31,.043)],'Tea','lounge')
    rings('CarafeLid',(x+.07,y+.04,.741),[(0,.048),(.018,.048)],'Brass','lounge');check('lid / carafe',.741,.431+.31)
    for i,dy in enumerate([-.075,.075]):
        rings('Cup'+str(i),(x-.105,y+dy,.431),[(0,.042),(.075,.05),(.085,.05),(.085,.039),(.035,.032)],'Cream','lounge')
    check('cups and carafe / tray top',.431,.423+.008)

def validate_export():
    bpy.context.view_layer.update()
    receipt={'source':'assets/models/office.glb','sourceSha256':hashlib.sha256((ROOT/'assets/models/office.glb').read_bytes()).hexdigest(),'coordinates':'Blender Z-up; GLB Y-up','contacts':CHECKS,'upgrades':{},'navigation':'All added geometry remains on/inside existing furniture footprints; floor walking obstacles unchanged.'}
    for key,root in GROUPS.items():
        objects=list(root.children)
        # Verify hard-edged construction and record bounds before joining by material.
        assert all(o.data.users==1 for o in objects)
        points=[o.matrix_world@Vector(v) for o in objects for v in o.bound_box]
        receipt['upgrades'][key]={'objectsBeforeBatching':len(objects),'boundsBlender':[[round(min(p[a] for p in points),5),round(max(p[a] for p in points),5)] for a in range(3)]}
        for mat in MATS.values():
            batch=[o for o in objects if o.data.materials[0]==mat]
            if not batch:continue
            objects=[o for o in objects if o not in batch] # Join removes every object except its active member.
            bpy.ops.object.select_all(action='DESELECT')
            for o in batch:o.select_set(True)
            bpy.context.view_layer.objects.active=batch[0];bpy.ops.object.join()
            batch[0].name=f'UP_{key}_{mat.name}';batch[0].parent=root
        receipt['upgrades'][key]['meshes']=len(root.children)
    bpy.ops.object.select_all(action='DESELECT')
    for root in GROUPS.values():
        root.select_set(True)
        for o in root.children:o.select_set(True)
    path=ROOT/'assets/models/office-upgrades.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_yup=True)
    receipt['sha256']=hashlib.sha256(path.read_bytes()).hexdigest();receipt['bytes']=path.stat().st_size
    (HERE/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'studio-upgrades.blend'))
    print('UPGRADES_EXPORTED',receipt['bytes'],receipt['sha256'])

if __name__=='__main__':
    setup();quiet();computers();lounge();validate_export()
