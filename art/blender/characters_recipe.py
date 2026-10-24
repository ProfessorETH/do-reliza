"""Six stylized teammates with local joint pivots for the browser animation rig.

Standing hip .88 m; thigh .40 m; shin .39 m; shoes .09 m. Seated hip .60 m:
thigh acos(.3) degrees forward, shin opposite gives ankle .09 m and sole at floor.
Pelvis bottom .12 m below hip meets the chair seat at .48 m exactly.
"""
COLLECTION=bpy.data.collections[PREFIX+'Office']
MATERIALS={m.name[len(PREFIX):]:m for m in bpy.data.materials if m.name.startswith(PREFIX)}
PEOPLE=[
    ('mira','#7ed9b8','#edb493','#b9622f','bun'),
    ('pixel','#f8b966','#d7a27e','#322b29','curls'),
    ('nord','#82c6e0','#c49a7f','#302c2d','part'),
    ('iskra','#fb8a79','#e4ad91','#653e36','sweep'),
    ('saga','#b8b0e2','#efc7a4','#cfad72','bob'),
    ('echo','#e0c49d','#b9825f','#292829','curls'),
]

def profile_mesh(name, rings, material, parent, segments=14):
    verts=[];faces=[]
    for z,rx,ry in rings:
        for n in range(segments):
            angle=n*math.tau/segments;verts.append((math.cos(angle)*rx,math.sin(angle)*ry,z))
    for j in range(len(rings)-1):
        for n in range(segments): faces.append((j*segments+n,j*segments+(n+1)%segments,(j+1)*segments+(n+1)%segments,(j+1)*segments+n))
    faces.extend([tuple(reversed(range(segments))),tuple((len(rings)-1)*segments+n for n in range(segments))])
    mesh=bpy.data.meshes.new(PREFIX+name+'_Mesh');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(PREFIX+name,mesh);COLLECTION.objects.link(obj);obj.parent=parent
    obj.data.materials.append(MATERIALS[material])
    for face in mesh.polygons: face.use_smooth=len(face.vertices)==4
    return obj

def build_character(index, ident, color, skin, hair, style):
    old=bpy.data.objects.get(PREFIX+ident+'_Root')
    if old:
        for obj in list(old.children_recursive): bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.objects.remove(old,do_unlink=True)
    for suffix,value in [('Cloth',color),('Skin',skin),('Hair',hair)]: mat(ident+suffix,value)
    cloth,skinmat,hairmat=[ident+s for s in ['Cloth','Skin','Hair']]
    root=empty(ident+'_Root',(-2+index*.7,-.4,0));root['agentId']=ident
    hips=empty(ident+'_Hips',(0,0,.88),root)
    profile_mesh(ident+'_Hoodie',[(-.12,.18,.12),(0,.19,.14),(.20,.23,.145),(.34,.25,.14),(.42,.15,.10)],cloth,hips)
    profile_mesh(ident+'_Hem',[(-.12,.18,.12),(-.085,.185,.125)],cloth,hips)
    torso=empty(ident+'_Torso',(0,0,.34),hips)
    sphere(ident+'_Hood',(0,-.07,.055),(.17,.13,.10),cloth,torso)
    cylinder(ident+'_Neck',(0,0,.13),.072,.18,skinmat,torso)
    head=empty(ident+'_Head',(0,0,.40),torso)
    sphere(ident+'_Face',(0,0,0),(.215,.197,.255),skinmat,head,24,16)
    for side in [-1,1]:
        sphere(ident+f'_Ear{side}',(side*.211,0,-.01),(.048,.034,.064),skinmat,head,12,8)
        sphere(ident+f'_EyeWhite{side}',(side*.077,.181,.035),(.042,.024,.048),'ivory',head,16,10)
        sphere(ident+f'_Eye{side}',(side*.077,.204,.035),(.020,.013,.027),'black',head,16,10)
        sphere(ident+f'_EyeSpark{side}',(side*.07,.216,.046),(.006,.004,.008),'ivory',head,10,6)
        brow=box(ident+f'_Brow{side}',(side*.077,.181,.099),(.080,.022,.017),hairmat,head)
        brow.rotation_euler.y=side*.10
    sphere(ident+'_Nose',(0,.203,-.024),(.037,.047,.044),skinmat,head,16,10)
    tube(ident+'_Smile',[(-.054,.181,-.099),(-.028,.192,-.109),(0,.196,-.112),(.028,.192,-.109),(.054,.181,-.099)],.009,'oak_edge',head,8)
    # The cap occupies the upper/back hemisphere; the face remains open.
    sphere(ident+'_HairCap',(0,-.035,.135),(.225,.195,.145),hairmat,head,20,12)
    if style in ['bun','bob']:
        for side in [-1,1]:
            lock=sphere(ident+f'_SideHair{side}',(side*.19,-.025,-.015 if style=='bob' else .01),(.064,.14,.20 if style=='bob' else .14),hairmat,head,14,10)
        sphere(ident+'_HairBack',(0,-.14,-.005),(.20,.09,.23 if style=='bob' else .15),hairmat,head,16,10)
    if style=='bun':
        sphere(ident+'_Bun',(0,-.19,.22),(.13,.12,.13),hairmat,head,16,10)
        for i in range(5): sphere(ident+f'_WavyLock{i}',(-.17+i*.072,.115,.18+(i%2)*.02),(.07,.07,.085),hairmat,head,12,8)
    if style=='curls':
        for i in range(15):
            angle=i*2.399;radius=.05+.13*(i%4)/3
            sphere(ident+f'_Curl{i}',(math.cos(angle)*radius,math.sin(angle)*radius-.01,.215+(i%3)*.014),(.077,.072,.070),hairmat,head,12,8)
    if style in ['part','sweep']:
        lock=sphere(ident+'_Fringe',(-.045,.08,.20),(.20,.095,.085),hairmat,head,16,10);lock.rotation_euler.y=-.22
        if style=='sweep':
            mat(ident+'Streak','#de8b7e');sphere(ident+'_Streak',(.11,.095,.19),(.044,.07,.066),ident+'Streak',head,12,8)
    if ident in ['nord','echo']:
        for side in [-1,1]:
            pts=[(side*.077+.059*math.cos(a),.217,.035+.058*math.sin(a)) for a in [i*math.tau/24 for i in range(25)]]
            tube(ident+f'_Glasses{side}',pts,.008,'steel',head,8)
        beam(ident+'_GlassesBridge',(-.018,.22,.043),(.018,.22,.043),.008,'steel',head)
    if ident=='pixel':
        for side in [-1,1]: sphere(ident+f'_Headphone{side}',(side*.16,0,.07),(.07,.07,.08),'gold',torso,12,8)
    for side,label in [(-1,'Left'),(1,'Right')]:
        thigh=empty(ident+'_'+label+'Thigh',(side*.115,0,0),hips)
        profile_mesh(ident+'_'+label+'Trouser',[(-.4,.067,.073),(-.19,.087,.089),(0,.10,.10)],'trouser',thigh,12)
        shin=empty(ident+'_'+label+'Shin',(0,0,-.40),thigh)
        profile_mesh(ident+'_'+label+'Calf',[(-.39,.052,.057),(-.07,.069,.073),(0,.073,.077)],'trouser',shin,12)
        shoe=empty(ident+'_'+label+'Foot',(0,0,-.39),shin)
        sphere(ident+'_'+label+'Shoe',(0,.05,0),(.077,.16,.09),'shoe',shoe,16,10)
        box(ident+'_'+label+'Sole',(0,.06,-.06),(.15,.28,.04),'ivory',shoe,chamfer=.012)
        upper=empty(ident+'_'+label+'UpperArm',(side*.245,0,.038),torso)
        profile_mesh(ident+'_'+label+'Sleeve',[(-.27,.063,.069),(-.07,.080,.086),(0,.09,.09)],cloth,upper,12)
        fore=empty(ident+'_'+label+'Forearm',(0,0,-.27),upper)
        profile_mesh(ident+'_'+label+'LowerSleeve',[(-.21,.044,.052),(-.03,.061,.066),(0,.063,.069)],cloth,fore,12)
        sphere(ident+'_'+label+'Hand',(0,0,-.26),(.049,.039,.080),skinmat,fore,16,10)
    gap(ident+' pelvis / seat',.60-.12,.48)
    print('CHARACTER',ident,'standing hip .88, seated .60, ankle',round(.60-.4*math.cos(math.acos(.3))-.39,5))
    return root

roots=[build_character(i,*person) for i,person in enumerate(PEOPLE)]
for root in roots[1:]:
    for obj in [root]+list(root.children_recursive): obj.hide_set(True)
for obj in list(COLLECTION.objects):
    if not obj.name.startswith(PREFIX+'mira_'):
        obj.hide_set(True)
frame_view()
print('CHARACTERS_READY',len(roots))
