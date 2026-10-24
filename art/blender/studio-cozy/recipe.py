"""Cozy office dressing. Units: metres; Blender Z-up, existing room anchors.

Anatomy: 5.4m window rail with two .60m linen panels; .34m controller;
3.1m wall shelf; low table props; desk-specific pads; draped throw.
All floor-standing furniture footprints and keyboard/hand contact zones stay.
Ordered stages: window(first panel -> inspect -> second), plant module ->
inspect -> replicate, lounge, desks, shelf, validate, export.
"""
from pathlib import Path
runner_path=Path(__file__).with_name('runner.py')
exec(compile(runner_path.read_text('utf-8'),str(runner_path),'exec'))
DESKS=[(-2.65,1.95),(1.4,1.95),(-.9,-1.45)]

def window(first=True):
    root=bpy.data.objects.get(PREFIX+'Window') or empty('Window')
    root['wallSide']='left'
    if first:
        tube('CurtainRail',[(-4.79,-2.58,2.80),(-4.79,2.87,2.80)],.021,'Brass',root,12)
        for i,y in enumerate([-2.48,.15,2.77]):
            tube(f'RailBracket{i}',[(-4.91,y,2.85),(-4.79,y,2.85),(-4.79,y,2.80)],.016,'Brass',root)
        check('rail bracket / wall interior',-4.91,-4.91)
    ranges=[(-2.50,-1.90)] if first else [(2.20,2.80)]
    for a,b in ranges:
        side='Front' if a<0 else 'Back';verts=[];faces=[]
        for v in range(9):
            t=v/8;z=1.035+(2.73-1.035)*t
            for u in range(17):
                s=u/16;y=a+(b-a)*s
                x=-4.79+(.05+.032*math.cos(s*math.tau*4))*(1-t)
                verts.append((x,y,z+.009*math.sin(s*math.pi*4)*(1-t)))
        for v in range(8):
            for u in range(16):j=v*17+u;faces.append((j,j+1,j+18,j+17))
        curtain=mesh('Curtain'+side,verts,faces,'Linen',root)
        for u in range(5):
            y=a+(b-a)*u/4
            # Closed connected rings hang from the rail and grip the cloth top.
            pts=[(-4.79+.052*math.cos(i*math.tau/16),y,2.78+.052*math.sin(i*math.tau/16)) for i in range(17)]
            tube(f'CurtainRing{side}{u}',pts,.007,'Brass',root)
        tube('CurtainHem'+side,[verts[u] for u in range(17)],.009,'Cream',root)
        check('curtain top / hanger lower edge',2.73,2.78-.052,tolerance=.003)
    if not first:
        points=[(-4.69,-2.45+i*5.15/24,2.76-.12*math.sin(i*math.pi/24)) for i in range(25)]
        tube('FairyWire',points,.005,'Ink',root,6)
        for i in range(0,25,2):
            x,y,z=points[i]
            tube('FairyDrop'+str(i),[(x,y,z),(x,y,z-.035)],.004,'Ink',root,6)
            ring_form('FairyBulb'+str(i),(x,y,z-.06),[(0,.011),(.018,.022),(.037,.009)],'Glow',root,8)
    print('WINDOW_STAGE',first,len(COL.objects))

def plant(name,loc,scale,parent,trailing=False):
    x,y,z=loc;radius=.13*scale;height=.18*scale
    ring_form(name+'Pot',loc,[(0,radius*.76),(height,radius),(height+.018*scale,radius),(height+.018*scale,radius*.86)],'Clay' if name.endswith('A') else 'Cream',parent,12)
    ring_form(name+'Soil',(x,y,z+height+.005*scale),[(0,radius*.83),(.008*scale,radius*.83)],'Ink',parent,12)
    check(name+' pot bottom / support top',z,z)
    for i in range(6):
        angle=i*math.tau/6;dx=math.cos(angle)*.17*scale;dy=math.sin(angle)*.17*scale
        base=Vector((x,y,z+height));tip=Vector((x+dx,y+dy,z+height+(.13+(i%3)*.045)*scale))
        tube(name+'Stem'+str(i),[base,base.lerp(tip,.55),tip],.006*scale,'Leaf',parent,6)
        direction=Vector((math.cos(angle),math.sin(angle),.3)).normalized();side=Vector((-math.sin(angle),math.cos(angle),0))
        center=tip+direction*.045*scale;length=.19*scale;width=.075*scale
        verts=[center-direction*length*.5,center+side*width,center+direction*length*.55,center-side*width,center+Vector((0,0,.024*scale))]
        mesh(name+'Leaf'+str(i),verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(3,2,1,0)],'LeafLight' if i%2 else 'Leaf',parent)
    if trailing:
        pts=[(x+.05*scale,y,z+height),(x+.10*scale,y-.14*scale,z+height*.5),(x+.07*scale,y-.20*scale,z-.20*scale),(x+.12*scale,y-.22*scale,z-.36*scale)]
        tube(name+'Vine',pts,.008*scale,'Leaf',parent)
        for i,p in enumerate(pts[1:]):
            px,py,pz=p
            mesh(name+'HangingLeaf'+str(i),[(px-.07*scale,py,pz+.02*scale),(px,py-.02*scale,pz+.08*scale),(px+.07*scale,py,pz+.02*scale),(px,py-.03*scale,pz-.05*scale)],[(0,1,2),(0,2,3)],'LeafLight',parent)

def window_plants(first=True):
    root=bpy.data.objects[PREFIX+'Window']
    if first:plant('SillPlantA',(-4.86,.25,.95),.83,root)
    else:plant('SillPlantB',(-4.86,1.60,.95),.68,root)

def lounge():
    root=empty('Lounge')
    # Woven rug is a thin surface, not a new navigation obstacle.
    rings=[(0,.70,.78),(.004,.72,.80),(.009,.70,.78)]
    verts=[];faces=[];n=48
    for z,rx,ry in rings:
        for i in range(n):a=i*math.tau/n;verts.append((-3.95+rx*math.cos(a),-3.05+ry*math.sin(a),z))
    faces=[tuple(reversed(range(n)))]
    for r in range(2):
        for i in range(n):faces.append((r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i))
    faces.append(tuple(2*n+i for i in range(n)));mesh('LoungeRug',verts,faces,'Linen',root)
    for rr in [.86,.94]:
        pts=[(-3.95+.70*rr*math.cos(i*math.tau/48),-3.05+.78*rr*math.sin(i*math.tau/48),.012) for i in range(49)]
        tube('RugStitch'+str(rr),pts,.007,'Clay',root,6)
    # Sample the actual beanbag mesh, rather than floating fabric above an estimate.
    sofa=bpy.data.objects['Release3D_Static_Room_coral'];inverse=sofa.matrix_world.inverted();verts=[];faces=[]
    for v in range(15):
        y=-2.7-.40+v*.80/14
        for u in range(6):
            x=-3.95+.06+u*.24/5;start=inverse@Vector((x,y,2));direction=(inverse.to_3x3()@Vector((0,0,-1))).normalized()
            hit,loc,_,_=sofa.ray_cast(start,direction)
            assert hit,('Throw misses beanbag',x,y)
            surface=sofa.matrix_world@loc;verts.append((x,y,surface.z+.008+.004*math.sin(u*math.pi)))
    for v in range(14):
        for u in range(5):j=v*6+u;faces.append((j,j+1,j+7,j+6))
    mesh('DrapedThrow',verts,faces,'Sage',root)
    tube('ThrowEdge',[verts[v*6] for v in range(15)],.006,'Cream',root,6)
    # Controller: one closed shaped shell, seated in a free part of the coffee table.
    x,y,z=-3.93-.20,-3.59+.17,.415
    outline=list(reversed([(-.16,-.07),(-.145,.045),(-.11,.075),(.11,.075),(.145,.045),(.16,-.07),(.11,-.09),(.065,-.025),(-.065,-.025),(-.11,-.09)]))
    verts=[(x+a,y+b,z+h) for h,s in [(0,1),(.042,.94)] for a,b in [(a*s,b*s) for a,b in outline]]
    faces=[tuple(reversed(range(10))),tuple(10+i for i in range(10))]+[(i,(i+1)%10,(i+1)%10+10,i+10) for i in range(10)]
    mesh('Gamepad',verts,faces,'Ink',root);check('controller bottom / coffee tabletop',z,.415)
    for i,(dx,dy) in enumerate([(.09,.035),(.11,.015),(.07,.015),(.09,-.005)]):ring_form('PadButton'+str(i),(x+dx,y+dy,z+.042),[(0,.011),(.007,.011)],'Clay' if i%2 else 'Cream',root,8)
    box('PadCrossH',(x-.09,y+.018,z+.047),(.055,.015,.01),'Cream',root);box('PadCrossV',(x-.09,y+.018,z+.047),(.015,.055,.01),'Cream',root)
    tube('SketchPencil',[(-3.93+.06,-3.59-.06,.454),(-3.93+.28,-3.59+.08,.454)],.009,'Clay',root,6)
    print('LOUNGE_READY',len(COL.objects))

def desks():
    for i,(x,y) in enumerate(DESKS):
        root=empty('Desk'+str(i));root['deskIndex']=i
        box('DeskPad'+str(i),(x+.88,y-.18,.812),(.38,.28,.024),'Paper',root);check('desk pad '+str(i)+' / tabletop',.812-.012,.80)
        for row in range(4):
            w=.20 if row%2 else .26
            box(f'PadLine{i}_{row}',(x+.88,y-.10-row*.04,.825),(w,.005,.002),'Blue' if i==0 else 'Ink',root)
            if i==2:box(f'PadCheck{i}_{row}',(x+.73,y-.10-row*.04,.826),(.014,.014,.003),'Sage',root)
        if i==0:
            for n,mat in enumerate(['Clay','Sage','Blue']):box('Swatch'+str(n),(x+.78+n*.08,y-.28,.827),(.052,.04,.006),mat,root)
        elif i==1:
            # Closed headphone hoop, with two real cups seated at its ends.
            pts=[(x+.88+.13*math.cos(a),y-.18+.11*math.sin(a),.844) for a in [n*math.pi/16 for n in range(17)]]
            tube('HeadphoneBand',pts,.014,'Ink',root)
            for side in [-1,1]:ring_form('HeadphoneCup'+str(side),(x+.88+side*.13,y-.18,.824),[(0,.044),(.065,.044)],'Clay',root,12)
        else:
            box('BatteryPrototype',(x+1.01,y-.20,.854),(.065,.12,.06),'Sage',root)
            box('BatteryCap',(x+1.01,y-.20,.891),(.028,.055,.014),'Brass',root)
    print('DESKS_READY',len(COL.objects))

def shelf():
    root=empty('Back');root['wallSide']='back'
    box('UpperShelf',(-.9,3.62,2.755),(3.12,.54,.05),'Oak',root)
    for i,x in enumerate([-2.38,.58]):
        tube('ShelfBracket'+str(i),[(x,3.91,2.60),(x,3.58,2.60),(x,3.58,2.73)],.015,'Brass',root)
    check('shelf bracket / shelf underside',2.73,2.755-.025)
    for n in range(8):
        h=.17+(n%3)*.018;x=-2.11+n*.105
        box('ShelfBook'+str(n),(x,3.64,2.78+h/2),(.075,.22,h),['Clay','Cream','Blue','Sage'][n%4],root)
        box('BookSpine'+str(n),(x,3.526,2.85),(.045,.006,.007),'Brass',root)
    box('ShelfStorage',(-.68,3.64,2.865),(.48,.32,.17),'Cream',root)
    box('StorageLabel',(-.68,3.476,2.865),(.22,.008,.055),'Clay',root)
    plant('ShelfPlantB',(.26,3.60,2.78),.52,root,trailing=True)
    # Meaningful planning-board ink, printed flush on the existing paper notes.
    for row in range(3):
        for col in range(5):
            x=-1.96+col*.51;z=2.35-row*.34
            for line in range(3):box(f'NoteInk{row}_{col}_{line}',(x,3.7745,z+.05-line*.045),(.09+(col%2)*.025,.001,.008),'Ink',root)
    print('SHELF_READY',len(COL.objects))

def validate():
    bpy.context.view_layer.update()
    def get(name):return bpy.data.objects[PREFIX+name]
    assert bounds(get('CurtainFront'),2,min) > .95 + .07, 'Curtain catches sill'
    check('sill pot / existing sill',bounds(get('SillPlantAPot'),2,min),.95)
    check('controller / existing coffee tabletop',bounds(get('Gamepad'),2,min),.415)
    check('shelf book / shelf top',bounds(get('ShelfBook0'),2,min),bounds(get('UpperShelf'),2,max))
    curtain=get('CurtainFront');ring=get('CurtainRingFront0')
    top_x=(curtain.matrix_world@curtain.data.vertices[-17].co).x
    check('curtain header / hanger centreline',top_x,(bounds(ring,0,min)+bounds(ring,0,max))/2,tolerance=.0001)
    for i in range(3):check('measured desk pad '+str(i),bounds(get('DeskPad'+str(i)),2,min),.80)
    check('headphone cup / desk pad',bounds(get('HeadphoneCup1'),2,min),bounds(get('DeskPad1'),2,max))
    check('battery prototype / desk pad',bounds(get('BatteryPrototype'),2,min),bounds(get('DeskPad2'),2,max))
    sill=bpy.data.objects['Release3D_Static_CutawayLeft_oak']
    check('measured pot / original sill top',bounds(get('SillPlantAPot'),2,min),bounds(sill,2,max))
    assert bounds(get('SillPlantAPot'),0,max)<bounds(sill,0,max),'Pot overhangs sill'
    assert bounds(get('SillPlantAPot'),0,min)>bounds(sill,0,min),'Pot crosses window reveal'
    for i in range(3):check('pad / original desk '+str(i),bounds(get('DeskPad'+str(i)),2,min),bounds(bpy.data.objects['Release3D_Static_Desk'+str(i)+'_oak'],2,max))
    coffee=bpy.data.objects['Release3D_Static_Room_oak'];inv=coffee.matrix_world.inverted();start=inv@Vector((-4.13,-3.42,1.2));direction=(inv.to_3x3()@Vector((0,0,-1))).normalized()
    hit,point,_,_=coffee.ray_cast(start,direction);assert hit,'Coffee tabletop not found'
    check('controller / measured coffee tabletop',bounds(get('Gamepad'),2,min),(coffee.matrix_world@point).z)
    assert all(o.data.users==1 for o in COL.objects if o.type=='MESH')
    print('COZY_VALIDATED',len(COL.objects),len(CHECKS))
