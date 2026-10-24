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

def shirt_front(name, rings, material, parent):
    # Cloth inset only on the chest; it must never emerge through the back.
    verts=[];faces=[]
    for z,width,front in rings:
        verts.extend([(-width,front-.006,z),(0,front,z),(width,front-.006,z)])
    for row in range(len(rings)-1):
        for col in range(2):
            i=row*3+col;faces.append((i,i+3,i+4,i+1))
    mesh=bpy.data.meshes.new(PREFIX+name+'_Mesh');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(PREFIX+name,mesh);COLLECTION.objects.link(obj);obj.parent=parent
    obj.data.materials.append(MATERIALS[material]);return obj

def build_character(index, ident, color, skin, hair, style):
    old=bpy.data.objects.get(PREFIX+ident+'_Root')
    if old:
        for obj in list(old.children_recursive): bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.objects.remove(old,do_unlink=True)
    for suffix,value in [('Cloth',color),('Skin',skin),('Hair',hair)]: mat(ident+suffix,value)
    cloth,skinmat,hairmat=[ident+s for s in ['Cloth','Skin','Hair']]
    root=empty(ident+'_Root',(-2+index*.7,-.4,0));root['agentId']=ident
    hips=empty(ident+'_Hips',(0,0,.88),root)
    profile_mesh(ident+'_Hoodie',[(-.12,.18,.12),(0,.19,.14),(.09,.205,.142)],cloth,hips)
    profile_mesh(ident+'_Hem',[(-.12,.18,.12),(-.085,.185,.125)],cloth,hips)
    # Bend at the waist; head, shoulders and jacket move as a connected upper body.
    torso=empty(ident+'_Torso',(0,0,.10),hips)
    profile_mesh(ident+'_Jacket',[(-.05,.19,.14),(.10,.23,.145),(.24,.25,.14),(.32,.15,.10)],cloth,torso)
    sphere(ident+'_Hood',(0,-.07,.295),(.17,.13,.10),cloth,torso)
    cylinder(ident+'_Neck',(0,0,.37),.072,.18,skinmat,torso)
    head=empty(ident+'_Head',(0,0,.64),torso)
    head.scale=(.92,.92,.92)
    sphere(ident+'_Face',(0,0,0),(.215,.197,.255),skinmat,head,24,16)
    for side in [-1,1]:
        sphere(ident+f'_Ear{side}',(side*.211,0,-.01),(.048,.034,.064),skinmat,head,12,8)
        eye=empty(ident+('_EyeLeft' if side<0 else '_EyeRight'),(side*.077,.181,.035),head)
        sphere(ident+f'_EyeWhite{side}',(0,0,0),(.038,.024,.039),'ivory',eye,16,10)
        sphere(ident+f'_Eye{side}',(0,.023,0),(.018,.013,.024),'black',eye,16,10)
        sphere(ident+f'_EyeSpark{side}',(-side*.006,.035,.009),(.006,.004,.007),'ivory',eye,10,6)
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
        sphere(ident+'_Bun',(0,-.19,.22),(.105,.10,.105),hairmat,head,16,10)
        for i in range(5): sphere(ident+f'_WavyLock{i}',(-.17+i*.072,.115,.18+(i%2)*.02),(.057,.055,.065),hairmat,head,12,8)
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
        for side in [-1,1]: sphere(ident+f'_Headphone{side}',(side*.16,0,.31),(.07,.07,.08),'gold',torso,12,8)
    # Outfits share measured anatomy but have distinct construction and accents.
    mat(ident+'Inner','#f1e5cf' if ident in ['mira','saga','echo'] else '#263a46')
    if ident in ['mira','nord','saga','echo']:
        shirt_front(ident+'_InnerShirt',[(-.05,.055,.141),(.10,.075,.149),(.24,.095,.145),(.30,.075,.105)],ident+'Inner',torso)
        for side in [-1,1]:
            tube(ident+f'_CardiganEdge{side}',[(side*.055,.142,-.05),(side*.075,.15,.10),(side*.095,.146,.24),(side*.075,.106,.30)],.009,cloth,torso,6)
        for z in [.03,.13,.23]: sphere(ident+f'_Button{z}',(.105,.146,z),(.012,.009,.012),'gold',torso,8,6)
    else:
        tube(ident+'_HoodCordLeft',[(-.055,.125,.29),(-.055,.155,.21),(-.065,.154,.16)],.006,'ivory',torso,6)
        tube(ident+'_HoodCordRight',[(.055,.125,.29),(.055,.155,.21),(.065,.154,.16)],.006,'ivory',torso,6)
    if ident=='mira':
        tube(ident+'_Necklace',[(-.07,.09,.315),(-.05,.135,.26),(0,.15,.23),(.05,.135,.26),(.07,.09,.315)],.005,'gold',torso,6)
    if ident=='saga':
        for side in [-1,1]: sphere(ident+f'_Earring{side}',(side*.23,.015,-.055),(.015,.014,.027),'gold',head,10,6)
    for side,label in [(-1,'Left'),(1,'Right')]:
        thigh=empty(ident+'_'+label+'Thigh',(side*.115,0,0),hips)
        profile_mesh(ident+'_'+label+'Trouser',[(-.4,.067,.073),(-.19,.087,.089),(0,.10,.10)],'trouser',thigh,12)
        shin=empty(ident+'_'+label+'Shin',(0,0,-.40),thigh)
        profile_mesh(ident+'_'+label+'Calf',[(-.39,.052,.057),(-.07,.069,.073),(0,.073,.077)],'trouser',shin,12)
        shoe=empty(ident+'_'+label+'Foot',(0,0,-.39),shin)
        sphere(ident+'_'+label+'Shoe',(0,.05,0),(.077,.16,.09),'shoe',shoe,16,10)
        box(ident+'_'+label+'Sole',(0,.06,-.06),(.15,.28,.04),'ivory',shoe,chamfer=.012)
        upper=empty(ident+'_'+label+'UpperArm',(side*.245,0,.278),torso)
        sphere(ident+'_'+label+'Shoulder',(0,0,-.015),(.088,.087,.095),cloth,upper,12,8)
        profile_mesh(ident+'_'+label+'Sleeve',[(-.285,.063,.069),(-.07,.080,.086),(0,.09,.09)],cloth,upper,12)
        fore=empty(ident+'_'+label+'Forearm',(0,0,-.285),upper)
        sphere(ident+'_'+label+'Elbow',(0,0,0),(.063,.066,.062),cloth,fore,12,8)
        profile_mesh(ident+'_'+label+'LowerSleeve',[(-.235,.044,.052),(-.03,.061,.066),(0,.063,.069)],cloth,fore,12)
        profile_mesh(ident+'_'+label+'Cuff',[(-.245,.046,.053),(-.218,.048,.055)],ident+'Inner',fore,12)
        wrist=empty(ident+'_'+label+'Wrist',(0,0,-.265),fore)
        cylinder(ident+'_'+label+'WristSkin',(0,0,.012),.025,.04,skinmat,wrist,12)
        sphere(ident+'_'+label+'Palm',(0,0,-.033),(.041,.024,.048),skinmat,wrist,12,8)
        for finger in range(4):
            joint=empty(ident+'_'+label+f'Finger{finger}',(-.027+finger*.018,0,-.062),wrist)
            length=[.025,.035,.038,.030][finger]
            sphere(ident+'_'+label+f'Digit{finger}',(0,0,-length/2),(.010,.013,length/2+.008),skinmat,joint,10,6)
        sphere(ident+'_'+label+'Thumb',(-side*.041,-.005,-.034),(.017,.020,.030),skinmat,wrist,12,8)
    gap(ident+' pelvis / seat',.60-.12,.48)
    print('CHARACTER',ident,'standing hip .88, seated .60, ankle',round(.60-.4*math.cos(math.acos(.3))-.39,5))
    return root

roots=[build_character(i,*person) for i,person in enumerate(PEOPLE) if person[0] in globals().get('CHARACTER_IDS',[p[0] for p in PEOPLE])]
for root in roots[1:]:
    for obj in [root]+list(root.children_recursive): obj.hide_set(True)
for obj in list(COLLECTION.objects):
    if not obj.name.startswith(PREFIX+'mira_'):
        obj.hide_set(True)
frame_view()
print('CHARACTERS_READY',len(roots))
