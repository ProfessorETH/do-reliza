"""Two remaining cutaway walls, aligned to the original 10 x 8 m office.

Right inside x=4.91; front inside y=-3.91; walls z=0..3, caps 3..3.05.
Front entry aperture x=3.15..4.25, z=0..2.25; closed timber door inside.
Build right -> inspect -> front -> inspect -> validate -> export. No furniture moves.
"""
import bpy
import json
from pathlib import Path
from mathutils import Vector

runner=Path(__file__).resolve().parents[1]/'studio-cozy/runner.py'
base={'__file__':str(runner)}
exec(compile(runner.read_text('utf-8'),str(runner),'exec'),base)
base.update(PREFIX='SW_',COLLECTION_NAME='StudioShell')
base['helpers']['P']='SW_'
box=base['box'];empty=base['empty'];tube=base['tube'];check=base['check'];bounds=base['bounds']

def setup():
    base['setup']()
    for name,color in [('Wall','#20313c'),('Edge','#344c55'),('Door','#a17e59'),('DoorDark','#6b523f'),('Frost','#a9b6ae')]:base['helpers']['material'](name,color)

def right():
    root=empty('CutawayRight');root['wallSide']='right'
    box('RightWall',(5,0,1.5),(.18,8,3),'Wall',root)
    box('RightCap',(5,0,3.025),(.24,8.24,.05),'Edge',root)
    box('RightSkirting',(4.89,0,.055),(.04,7.82,.11),'Oak',root)
    # Two broad acoustic panels seated against the inside face, not in an aisle.
    for i,y in enumerate([-.95,1.0]):
        box('AcousticBacking'+str(i),(4.88,y,1.85),(.06,1.16,1.10),'DoorDark',root)
        box('AcousticFabric'+str(i),(4.842,y,1.85),(.016,1.04,.98),'Sage' if i else 'Clay',root)
    print('SHELL_RIGHT_READY')

def front():
    root=empty('CutawayFront');root['wallSide']='front'
    # The wall has a genuine opening; no wall mesh behind the door.
    for name,a,b in [('FrontMain',-4.91,3.15),('FrontEnd',4.25,4.91)]:box(name,((a+b)/2,-4,1.5),(b-a,.18,3),'Wall',root)
    box('DoorLintel',(3.70,-4,2.625),(1.10,.18,.75),'Wall',root)
    box('FrontCap',(0,-4,3.025),(10.24,.24,.05),'Edge',root)
    for name,a,b in [('SkirtingMain',-4.91,3.15),('SkirtingEnd',4.25,4.91)]:box(name,((a+b)/2,-3.89,.055),(b-a,.04,.11),'Oak',root)
    box('DoorLeaf',(3.70,-4,.89),(1.06,.07,1.74),'Door',root)
    box('DoorTop',(3.70,-4,2.15),(1.06,.07,.16),'Door',root)
    for label,x in [('L',3.24),('R',4.16)]:box('DoorGlassJamb'+label,(x,-4,1.915),(.14,.07,.31),'Door',root)
    # Frame is joined at its corners, with deliberate 1 cm overlap at the jamb.
    for label,x in [('L',3.15),('R',4.25)]:box('DoorFrame'+label,(x,-3.90,1.12),(.09,.12,2.24),'DoorDark',root)
    box('DoorFrameTop',(3.70,-3.90,2.25),(1.19,.12,.09),'DoorDark',root)
    box('DoorPlate',(3.35,-3.955,1.05),(.055,.022,.16),'Brass',root)
    tube('DoorHandle',[(3.35,-3.944,1.05),(3.35,-3.79,1.05),(3.52,-3.79,1.05)],.014,'Brass',root)
    # Actual aperture x=3.31..4.09, z=1.76..2.07; glass is seated 25 mm back.
    box('DoorTransom',(3.70,-4,1.915),(.78,.02,.31),'Frost',root)
    print('SHELL_FRONT_READY')

def validate():
    bpy.context.view_layer.update()
    get=lambda n:bpy.data.objects['SW_'+n]
    check('right wall / inner room plane',bounds(get('RightWall'),0,min),4.91)
    check('front wall / inner room plane',bounds(get('FrontMain'),1,max),-3.91)
    check('right cap / wall top',bounds(get('RightCap'),2,min),bounds(get('RightWall'),2,max))
    check('front cap / wall top',bounds(get('FrontCap'),2,min),bounds(get('FrontMain'),2,max))
    check('front main / door aperture',bounds(get('FrontMain'),0,max),3.15)
    check('front end / door aperture',bounds(get('FrontEnd'),0,min),4.25)
    check('door lintel / opening top',bounds(get('DoorLintel'),2,min),2.25)
    check('acoustic frame / wall',bounds(get('AcousticBacking0'),0,max),4.91)
    check('acoustic fabric / frame',bounds(get('AcousticFabric0'),0,max),bounds(get('AcousticBacking0'),0,min))
    check('door plate / timber face',bounds(get('DoorPlate'),1,min),bounds(get('DoorLeaf'),1,max),tolerance=.002)
    floor=bpy.data.objects['Release3D_Static_Room_floor'];inv=floor.matrix_world.inverted()
    hit,p,_,_=floor.ray_cast(inv@Vector((4.8,0,.3)),(inv.to_3x3()@Vector((0,0,-1))).normalized())
    assert hit
    check('skirting / original floor',bounds(get('RightSkirting'),2,min),(floor.matrix_world@p).z)
    assert all(o.data.users==1 for o in base['COL'].objects if o.type=='MESH')
    print('SHELL_VALIDATED',json.dumps(base['CHECKS']))

def export(root):
    root=Path(root);col=base['COL'];owned={o.name for o in col.objects}
    selected=[o.name for o in bpy.context.selected_objects if o.name not in owned]
    active=bpy.context.view_layer.objects.active;active_name=active.name if active and active.name not in owned else None
    try:
        base['batch']()
        for o in list(bpy.context.selected_objects):o.select_set(False)
        for o in col.objects:o.select_set(True)
        bpy.context.view_layer.objects.active=next(iter(col.objects));bpy.context.view_layer.update()
        bpy.ops.export_scene.gltf(filepath=str(root/'assets/models/office-shell.glb'),export_format='GLB',use_selection=True,use_visible=False,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
        bpy.data.libraries.write(str(root/'art/blender/studio-shell/studio-shell.blend'),{col},compress=True)
        receipt={'sourceSceneNotSaved':bpy.data.filepath,'walls':['right','front'],'meshes':sum(o.type=='MESH' for o in col.objects),'triangles':sum(len(p.vertices)-2 for o in col.objects if o.type=='MESH' for p in o.data.polygons),'contacts':base['CHECKS'],'furnitureUnchanged':True,'walkBounds':{'x':[-4.55,4.55],'z':[-3.55,3.55]}}
        (root/'art/blender/studio-shell/receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
        print('SHELL_EXPORTED',json.dumps(receipt))
    finally:
        for o in list(bpy.context.selected_objects):o.select_set(False)
        for n in selected:
            o=bpy.data.objects.get(n)
            if o:o.select_set(True)
        if active_name and bpy.data.objects.get(active_name):bpy.context.view_layer.objects.active=bpy.data.objects[active_name]
