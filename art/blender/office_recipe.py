"""Evening studio. Run after runner.py, in a fresh recipe-owned collection.

Anatomy: 10 x 8 m floor, two 3 m cutaway walls, 3 desks 2.3 x 1 x .8 m;
chairs: .48 m seat, .86 m back; people about 1.85 m, pelvis .88 m standing.
Anchors: floor top z=0; desk underside z=.72; chair top z=.48.
The left window is an actual wall opening. Monitor glass is seated in a pocket.
"""
DESKS = [(-2.65, 1.95), (1.4, 1.95), (-.9, -1.45)]
STAGE = 'blockout'

def palette():
    for name, color in {
        'wall':'#284451', 'wall_edge':'#456271', 'floor':'#776655', 'oak':'#bc8c59',
        'oak_edge':'#86613e', 'steel':'#26343d', 'chair':'#384e58', 'chair_pad':'#536b72',
        'screen':'#172f3b', 'ivory':'#e8dfc5', 'sage':'#76a88c', 'coral':'#d17a61',
        'sky':'#c88c7d', 'window':'#35546d', 'skin':'#e8b58d', 'hair':'#8c4c31',
        'outfit':'#7ab49a', 'shoe':'#243641', 'trouser':'#485968', 'black':'#152832',
        'gold':'#dba65d', 'leaf':'#577f59', 'leaf_light':'#7fa275', 'pot':'#cba67b',
        'paper':'#c9c6ae', 'yellow':'#e4bd70', 'blue':'#779fae', 'rug':'#45606b'
    }.items():
        mat(name,color)
    mat('lamp','#ffd18c',emission=2)
    mat('screen_glow','#7fc4c2',emission=.4)
    mat('screen_amber','#ecb56e',emission=.3)

def build_room():
    root = empty('Room')
    box('FloorBase',(0,0,-.185),(10.2,8.2,.32),'steel',root)
    box('Floor',(0,0,-.035),(10,8,.05),'floor',root)
    box('BackWall',(0,4,1.5),(10.2,.18,3),'wall',root)
    # A real window aperture in the left wall, z .9..2.7, y -2.5..2.8.
    box('WindowWallBelow',(-5,0,.45),(.18,8,.9),'wall',root)
    box('WindowWallAbove',(-5,0,2.85),(.18,8,.3),'wall',root)
    box('WindowWallFront',(-5,-3.25,1.8),(.18,1.5,1.8),'wall',root)
    box('WindowWallBack',(-5,3.4,1.8),(.18,1.2,1.8),'wall',root)
    box('BackCoping',(0,4,3.025),(10.3,.24,.05),'wall_edge',root)
    box('LeftCoping',(-5,0,3.025),(.24,8.15,.05),'wall_edge',root)
    gap('floor / wall bottom', 1.5-1.5, 0)
    return root

def build_workstation(i, x, y, details=False):
    root=empty(f'Desk{i}',(x,y,0))
    box(f'Desk{i}_Top',(0,0,.76),(2.3,1,.08),'oak',root,chamfer=.018)
    for side in [-1,1]:
        for depth in [-1,1]:
            box(f'Desk{i}_Leg{side}_{depth}',(side*1.035,depth*.39,.36),(.065,.065,.72),'steel',root)
    box(f'Desk{i}_Brace',(0,.36,.62),(2.1,.05,.06),'steel',root)
    monitor=empty(f'Monitor{i}',(0,.21,.8),root)
    box(f'Monitor{i}_Foot',(0,0,.018),(.34,.23,.036),'steel',monitor)
    box(f'Monitor{i}_Stand',(0,.045,.15),(.055,.06,.28),'steel',monitor)
    # Back casing + four rim pieces enclose a .025 m pocket facing -Y.
    box(f'Monitor{i}_Back',(0,.03,.43),(.9,.055,.55),'steel',monitor)
    for px in [-.43,.43]:
        box(f'Monitor{i}_Side{px}',(px,-.014,.43),(.04,.04,.55),'steel',monitor)
    for pz in [.175,.685]:
        box(f'Monitor{i}_Rim{pz}',(0,-.014,pz),(.82,.04,.04),'steel',monitor)
    box(f'Monitor{i}_Glass',(0,-.022,.43),(.82,.008,.47),'screen',monitor)
    box(f'Keyboard{i}',(0,-.29,.815),(.65,.22,.03),'ivory',root,chamfer=.008)
    box(f'Mouse{i}',(.53,-.26,.824),(.11,.16,.048),'ivory',root,chamfer=.012)
    chair=empty(f'Chair{i}',(0,-.94,0),root)
    cylinder(f'Chair{i}_Column',(0,0,.255),.035,.39,'steel',chair)
    for n in range(5):
        angle=n*math.tau/5
        end=(.30*math.cos(angle),.30*math.sin(angle),.075)
        beam(f'Chair{i}_Foot{n}',(0,0,.075),end,.023,'steel',chair)
        wheel=cylinder(f'Chair{i}_Wheel{n}',end,.045,.035,'black',chair,12)
        wheel.rotation_euler.x=math.pi/2
    box(f'Chair{i}_Seat',(0,0,.435),(.55,.50,.09),'chair_pad',chair,chamfer=.025)
    box(f'Chair{i}_Back',(0,-.235,.72),(.52,.09,.50),'chair',chair,chamfer=.025)
    for side in [-1,1]:
        box(f'Chair{i}_ArmPost{side}',(side*.29,0,.52),(.035,.035,.16),'steel',chair)
        box(f'Chair{i}_Arm{side}',(side*.29,.005,.615),(.065,.35,.04),'chair',chair)
    gap(f'desk {i} leg / tabletop underside', .36+.36,.76-.04)
    gap(f'chair {i} seat / avatar pelvis bottom', .435+.045,.60-.12)
    if details:
        workstation_details(i,root,monitor)
    return root

def build_scale_person():
    root=empty('ScalePerson',(-2.65,1.01,0))
    box('ScaleShoes', (0,0,.08),(.42,.28,.16),'shoe',root)
    for side in [-1,1]:
        box(f'ScaleLeg{side}',(side*.12,0,.49),(.18,.2,.82),'trouser',root)
    box('ScaleTorso',(0,0,1.14),(.48,.26,.48),'outfit',root)
    cylinder('ScaleNeck',(0,0,1.42),.08,.12,'skin',root)
    sphere('ScaleHead',(0,0,1.65),(.23,.21,.27),'skin',root)
    return root

def blockout():
    prepare();palette();build_room();build_workstation(0,*DESKS[0]);build_scale_person()
    frame_view()
    bpy.context.scene['release_stage']='blockout: scale, contact faces and passage widths'
    print('BLOCKOUT_READY',len(COLLECTION.objects))

def plant(name, location, scale=1, parent=None):
    root=empty(name,location,parent)
    pot=cylinder(name+'_Pot',(0,0,.15*scale),.19*scale,.30*scale,'pot',root,12)
    cylinder(name+'_Soil',(0,0,.306*scale),.173*scale,.016*scale,'floor',root,12)
    for n in range(7):
        a=n*math.tau/7
        top=(math.cos(a)*.24*scale,math.sin(a)*.24*scale,(.55+(n%3)*.14)*scale)
        beam(name+f'_Stem{n}',(0,0,.30*scale),top,.012*scale,'leaf',root,8)
        leaf=sphere(name+f'_Leaf{n}',top,(.09*scale,.20*scale,.045*scale),'leaf_light' if n%2 else 'leaf',root,12,6)
        leaf.rotation_euler=(.3,a*.2,a)
    return root

def mug(name, location, color, parent):
    root=empty(name,location,parent)
    cylinder(name+'_Cup',(0,0,.055),.055,.11,color,root,12)
    cylinder(name+'_Coffee',(0,0,.111),.047,.005,'floor',root,12)
    # Continuous handle tube, connected loops through a sampled arc.
    coords=[(.054+.034*math.sin(a),0,.058+.040*math.cos(a)) for a in [n*math.pi/10 for n in range(11)]]
    tube(name+'_Handle',coords,.008,color,root,8)

def screen_plane(name, parent, center, width, height):
    x,y,z=center
    mesh=bpy.data.meshes.new(PREFIX+name+'_Mesh')
    mesh.from_pydata([(x-width/2,y,z-height/2),(x+width/2,y,z-height/2),(x+width/2,y,z+height/2),(x-width/2,y,z+height/2)],[],[(0,1,2,3)])
    mesh.update()
    layer=mesh.uv_layers.new(name='UVMap')
    for loop,uv in zip(layer.data,[(0,0),(1,0),(1,1),(0,1)]): loop.uv=uv
    obj=bpy.data.objects.new(PREFIX+name,mesh)
    COLLECTION.objects.link(obj);obj.parent=parent;obj.data.materials.append(MATERIALS['screen'])
    return obj

def workstation_details(i, root, monitor):
    root['deskIndex']=i
    # UV panel sits within the previously inspected casing pocket.
    screen=screen_plane(f'Screen{i}',monitor,(0,-.0262,.43),.80,.45)
    screen['screenIndex']=i
    for row in range(4):
        for col in range(12):
            box(f'Key{i}_{row}_{col}',(-.285+col*.052,-.375+row*.05,.834),(.039,.033,.008),'steel',root)
    mug(f'Desk{i}_Mug',(-.89,-.18,.8),'coral' if i==1 else 'ivory',root)
    plant(f'Desk{i}_Plant',(.85,.24,.8),.43,root)
    for n in range(2):
        box(f'Desk{i}_Book{n}',(-.83,.28,.816+n*.045),(.36,.23,.04),'blue' if n else 'gold',root)
    box(f'Desk{i}_Tower',(.84,.10,.31),(.36,.45,.62),'steel',root)
    for n in range(3):
        box(f'Desk{i}_TowerSlot{n}',(.84,-.128,.48-n*.10),(.25,.012,.045),'black',root)
    gap(f'keyboard {i} / desk top',.815-.015,.8)

def room_details(root):
    # Thin planks give directional grain without image textures or shader baking.
    for row in range(18):
        for col in range(-1,5):
            x=-4+col*2+(row%2)*.4
            left=max(-5,x-.9925);right=min(5,x+.9925)
            if right<=left: continue
            box(f'Plank{row}_{col}',((left+right)/2,-3.78+row*.44,-.006),(right-left,.43,.012),'oak_edge' if (row+col)%9==0 else 'floor',root)
    box('StudioRug',(-.6,.2,.001),(7.3,5.5,.004),'rug',root)
    for y in [-2.48,2.88]: box(f'RugBorder{y}',(-.6,y,.0035),(7.1,.025,.001),'blue',root)
    # Window frame is anchored to the opening; the glazing remains behind the reveal.
    window=screen_plane('WindowSunset',root,(0,0,0),5.28,1.78)
    window.location=(-5.10,.15,1.8);window.rotation_euler.z=math.pi/2
    window.data.materials.clear();window.data.materials.append(MATERIALS['sky']);window['windowTexture']=True
    for y in [-2.5,-.73,1.03,2.8]: box(f'WindowMullion{y}',(-4.985,y,1.8),(.21,.045,1.8),'steel',root)
    box('WindowSill',(-4.91,.15,.915),(.40,5.55,.07),'oak',root)
    box('WindowRevealTop',(-4.99,.15,2.70),(.24,5.36,.07),'steel',root)
    for n in range(12):
        y=-2.3+n*.43;height=.28+(n*7%9)*.065
        box(f'City{n}',(-5.09,y,.96+height/2),(.035,.31,height),'window',root)
        for k in range(3):
            box(f'CityLight{n}_{k}',(-5.065,y-.08+k*.075,1.03+height*.60),(.005,.025,.025),'screen_amber',root)
    plant('WindowPlant',(-4.68,-1.8,.95),.8,root)
    # Back-wall planning board and shelf, derived from wall front plane y=3.91.
    box('PlanningBoardFrame',(-.9,3.855,1.95),(2.7,.10,1.35),'oak_edge',root)
    box('PlanningBoard',(-.9,3.797,1.95),(2.57,.016,1.22),'paper',root)
    for row in range(3):
        for col in range(5):
            box(f'Note{row}_{col}',(-1.96+col*.51,3.782,2.35-row*.34),(.19,.012,.20),['yellow','coral','sage','blue'][(row+col)%4],root)
    box('BoardMarkerTray',(-.9,3.72,1.29),(2.75,.20,.05),'steel',root)
    box('LowBookcase',(-.9,3.64,.48),(2.7,.53,.96),'oak_edge',root)
    for z in [.06,.5,.94]: box(f'BookcaseShelf{z}',(-.9,3.60,z),(2.7,.62,.045),'oak',root)
    for n in range(18):
        h=.26+(n%4)*.035
        book=box(f'LibraryBook{n}',(-2.08+n*.136,3.48,.52+h/2),(.09,.27,h),['coral','paper','blue','sage'][n%4],root)
        book.rotation_euler.y=.05 if n%3==0 else 0
    plant('ShelfPlant',(.05,3.54,.97),.8,root)
    # Small server cabinet: actual open front bay and recessed rack units.
    rack=empty('ServerRack',(-3.7,3.50,0),root)
    box('RackBack',(0,.19,.97),(.72,.10,1.94),'steel',rack)
    for side in [-1,1]: box(f'RackSide{side}',(side*.36,0,.97),(.06,.48,1.94),'steel',rack)
    for z in [.04,1.90]: box(f'RackEnd{z}',(0,-.01,z),(.66,.5,.08),'steel',rack)
    for n in range(6):
        box(f'RackUnit{n}',(0,-.17,.23+n*.27),(.62,.09,.19),'black',rack)
        box(f'RackLED{n}',(.21,-.221,.23+n*.27),(.04,.008,.025),'screen_glow',rack)
    # Compact lounge remains outside the central navigation lane.
    lounge=empty('Lounge',(-3.95,-2.7,0),root)
    sphere('Beanbag',(0,0,.34),(.59,.59,.34),'coral',lounge,16,8)
    sphere('BeanbagBack',(0,.24,.57),(.58,.24,.45),'coral',lounge,16,8)
    table=empty('CoffeeTable',(.02,-.89,0),lounge)
    box('CoffeeTop',(0,0,.39),(1.05,.60,.05),'oak',table,chamfer=.02)
    for x in [-.43,.43]:
        for y in [-.21,.21]: box(f'CoffeeLeg{x}_{y}',(x,y,.185),(.04,.04,.37),'steel',table)
    mug('CoffeeMug',(-.28,0,.415),'sage',table)
    box('Sketchbook',(.19,.02,.43),(.36,.26,.03),'ivory',table)
    arcade=empty('Arcade',(3.85,3.38,0),root)
    box('ArcadeBase',(0,0,.46),(.82,.70,.92),'steel',arcade)
    box('ArcadeBack',(0,.26,1.35),(.82,.16,.86),'steel',arcade)
    for side in [-1,1]: box(f'ArcadeSide{side}',(side*.385,0,1.38),(.05,.65,.92),'steel',arcade)
    box('ArcadeMarquee',(0,-.02,1.88),(.82,.68,.20),'oak_edge',arcade)
    box('ArcadeLight',(0,-.366,1.88),(.66,.008,.11),'lamp',arcade)
    screen_plane('ArcadeScreen',arcade,(0,-.16,1.42),.68,.62)
    box('ArcadeControls',(0,-.12,.95),(.78,.66,.08),'oak',arcade)
    beam('ArcadeStick',(-.20,-.27,.99),(-.20,-.27,1.12),.018,'steel',arcade)
    sphere('ArcadeKnob',(-.20,-.27,1.12),(.045,.045,.045),'coral',arcade,12,6)
    for n in range(3): cylinder(f'ArcadeButton{n}',(.04+n*.09,-.27,1.002),.032,.025,'yellow',arcade)
    plant('FloorPlant',(4.22,1.9,0),1.6,root)
    # Warm fixture silhouettes, grounded in wall-mounted arms.
    for i,x in enumerate([-2.65,1.4,3.8]):
        beam(f'WallLampArm{i}',(x,3.9,2.75),(x,3.57,2.75),.018,'steel',root)
        beam(f'WallLampCord{i}',(x,3.57,2.75),(x,3.57,2.43),.012,'steel',root)
        sphere(f'WallLampBulb{i}',(x,3.57,2.38),(.065,.065,.10),'lamp',root,12,8)

def finish_room():
    prepare();palette();root=build_room();room_details(root)
    for i,(x,y) in enumerate(DESKS): build_workstation(i,x,y,True)
    frame_view()
    bpy.context.scene['release_stage']='room: furniture module replicated after six-side contact inspection'
    print('ROOM_READY',len(COLLECTION.objects))

finish_room()
