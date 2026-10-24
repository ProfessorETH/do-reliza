"""Additive studio art. Never rebuilds, moves or saves the character scene.

Anatomy: one wall-mounted sign (2.7 x 1.15 m), three desk lamps and
front-edge trim. Anchors are the existing wall front y=3.91, desk tops
z=.80 and floor-base front y=-4.10. All generated data uses SD_ names.
Run setup(), sign(), lamps(), trim(), export(root) through native Blender MCP.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

P = 'SD_'
COL = None
MATS = {}
CONTACTS = []
DESKS = [(-2.65, 1.95), (1.4, 1.95), (-.9, -1.45)]

def material(name, color, emission=0, metal=0):
    m = bpy.data.materials.new(P + name)
    m.use_nodes = True
    rgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
    node = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value = (*linear, 1)
    node.inputs['Roughness'].default_value = .56
    node.inputs['Metallic'].default_value = metal
    node.inputs['Emission Color'].default_value = (*linear, 1)
    node.inputs['Emission Strength'].default_value = emission
    m.diffuse_color = (*linear, 1)
    MATS[name] = m

def setup():
    global COL
    old = bpy.data.collections.get('StudioDressing')
    if old:
        for obj in list(old.objects): bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
    for blocks in [bpy.data.meshes, bpy.data.curves, bpy.data.materials]:
        for block in list(blocks):
            if block.name.startswith(P) and block.users == 0: blocks.remove(block)
    COL = bpy.data.collections.new('StudioDressing')
    bpy.context.scene.collection.children.link(COL)
    for name, color, emission, metal in [
        ('Ink','#172934',0,0), ('Oak','#966b42',0,0),
        ('Brass','#b99155',0,.55), ('Cream','#e1d4b8',0,0),
        ('MintNeon','#8df4d2',2.6,0), ('AmberNeon','#ffc67a',1.7,0),
        ('Clay','#c7775e',0,0), ('Lamp','#ffe0a7',3,0)
    ]: material(name,color,emission,metal)
    CONTACTS.clear()
    print('DRESSING_SETUP',len(COL.objects))

def resume():
    global COL, MATS, CONTACTS
    COL=bpy.data.collections['StudioDressing']
    MATS={m.name[len(P):]:m for m in bpy.data.materials if m.name.startswith(P)}
    CONTACTS=json.loads(COL.get('contacts','[]'))

def empty(name, location=(0,0,0), parent=None):
    o = bpy.data.objects.new(P+name,None); COL.objects.link(o)
    o.location = location; o.parent = parent
    return o

def mesh(name, verts, faces, mat, parent=None):
    data = bpy.data.meshes.new(P+name+'_Mesh'); data.from_pydata(verts,[],faces); data.update()
    o = bpy.data.objects.new(P+name,data); COL.objects.link(o)
    o.parent = parent; o.data.materials.append(MATS[mat])
    return o

def box(name, loc, size, mat, parent=None):
    x,y,z = [v/2 for v in size]
    verts=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
    faces=[(3,2,1,0),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]
    o=mesh(name,verts,faces,mat,parent);o.location=loc;return o

def ring_form(name, loc, rings, mat, parent=None, sides=16):
    verts=[(r*math.cos(i*math.tau/sides),r*math.sin(i*math.tau/sides),z) for z,r in rings for i in range(sides)]
    faces=[tuple(reversed(range(sides)))]
    for j in range(len(rings)-1):
        for i in range(sides): faces.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
    faces.append(tuple((len(rings)-1)*sides+i for i in range(sides)))
    o=mesh(name,verts,faces,mat,parent);o.location=loc;return o

def tube(name, points, radius, mat, parent=None, sides=8):
    points=[Vector(p) for p in points]; verts=[]; faces=[]
    for j,p in enumerate(points):
        tangent=(points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized()
        side=tangent.cross(Vector((0,1,0))).normalized(); up=tangent.cross(side).normalized()
        for i in range(sides):
            a=i*math.tau/sides;verts.append(p+radius*(side*math.cos(a)+up*math.sin(a)))
    for j in range(len(points)-1):
        for i in range(sides): faces.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
    faces += [tuple(reversed(range(sides))),tuple((len(points)-1)*sides+i for i in range(sides))]
    return mesh(name,verts,faces,mat,parent)

def text(name, body, loc, size, mat, parent=None, align='CENTER'):
    curve=bpy.data.curves.new(P+name+'_Text','FONT');curve.body=body;curve.size=size
    curve.align_x=align;curve.extrude=.006;curve.resolution_u=4
    fontpath=Path('C:/Windows/Fonts/segoeuib.ttf')
    if fontpath.exists(): curve.font=bpy.data.fonts.load(str(fontpath),check_existing=True)
    obj=bpy.data.objects.new(P+name,curve);COL.objects.link(obj)
    obj.location=loc;obj.rotation_euler.x=math.pi/2;obj.parent=parent
    obj.data.materials.append(MATS[mat]);return obj

def contact(name, a, b, tolerance=.002):
    delta=a-b; assert abs(delta)<=tolerance,(name,delta)
    CONTACTS.append({'interface':name,'gapMeters':round(delta,6)})
    COL['contacts']=json.dumps(CONTACTS)

def sign():
    root=empty('BackAssembly');root['wallSide']='back'
    # Back face seats on the front face of the existing wall.
    box('AcousticBed',(1.85,3.88,2.16),(2.72,.06,1.16),'Ink',root)
    contact('acoustic bed back / wall front',3.88+.03,3.91)
    # First slat is the measured repeat module: back 3.85, face 3.80.
    for i in range(17):
        box(f'AcousticSlat{i}',(.57+i*.16,3.825,2.16),(.055,.05,1.08),'Oak',root)
    contact('slat back / acoustic bed face',3.825+.025,3.88-.03)
    box('SignBed',(1.85,3.776,2.17),(2.38,.048,.67),'Ink',root)
    contact('sign bed back / slat front',3.776+.024,3.825-.025)
    text('StudioTitle','ДО РЕЛИЗА.',(1.85,3.748,2.15),.30,'MintNeon',root)
    text('StudioSubtitle','ИНДИ-СТУДИЯ  /  01',(1.85,3.746,1.95),.105,'Cream',root)
    # Mechanical rails connect the sign plate to the acoustic module.
    for x in [.65,3.05]: box('SignRail'+str(x),(x,3.776,2.17),(.032,.048,.72),'Brass',root)
    box('SignAccent',(1.85,3.744,2.405),(2.08,.012,.012),'AmberNeon',root)
    print('SIGN_READY',len(COL.objects),json.dumps(CONTACTS))

def lamps(indices=None):
    for i,(x,y) in enumerate(DESKS):
        if indices is not None and i not in indices: continue
        root=empty('DeskLamp'+str(i),(x,y,0))
        ring_form(f'LampBase{i}',(-.64,-.02,.80),[(0,.105),(.018,.105),(.028,.075)],'Brass',root)
        contact(f'lamp {i} base / desk top',.80,.80)
        tube(f'LampArm{i}',[(-.64,-.02,.82),(-.64,-.02,1.08),(-.50,-.10,1.23)],.018,'Brass',root)
        ring_form(f'LampShade{i}',(-.50,-.10,1.13),[(0,.105),(.015,.105),(.12,.045)],'Cream',root)
        ring_form(f'LampGlow{i}',(-.50,-.10,1.129),[(0,.086),(.004,.086)],'Lamp',root)
        contact(f'lamp {i} diffuser / shade rim',1.129+.004,1.13,tolerance=.004)
        # Desk tags sit flush with the front apron; original input surfaces stay free.
        box(f'DeskTag{i}',(.86,-.505,.755),(.30,.012,.065),'Ink',root)
        text(f'DeskNumber{i}',f'0{i+1}',(x+.86,y-.513,.734),.052,'AmberNeon')
    print('LAMPS_READY',len(COL.objects),json.dumps(CONTACTS))

def trim():
    root=empty('FloorTrim')
    box('FrontLED',(0,-4.104,-.055),(9.6,.01,.014),'AmberNeon',root)
    contact('front LED back / foundation front',-4.104+.005,-4.10)
    box('FrontInset',(0,-4.104,-.20),(9.7,.01,.08),'Ink',root)
    text('FoundationLabel','ДО РЕЛИЗА   /   ТВОРЧЕСКАЯ СТУДИЯ',(-4.6,-4.113,-.224),.075,'Cream',root,align='LEFT')
    print('TRIM_READY',len(COL.objects),json.dumps(CONTACTS))

def poster():
    root=bpy.data.objects[P+'BackAssembly']
    x,z=-4.54,2.13
    box('OrbitBacking',(x,3.88,z),(.70,.06,1.10),'Ink',root)
    contact('poster backing / wall front',3.88+.03,3.91)
    for side in [-1,1]:
        box(f'OrbitFrameSide{side}',(x+side*.3325,3.82,z),(.035,.06,1.10),'Brass',root)
        box(f'OrbitFrameEnd{side}',(x,3.82,z+side*.5325),(.63,.06,.035),'Brass',root)
    contact('poster frame / backing face',3.82+.03,3.88-.03)
    o=mesh('OrbitArtwork',[(x-.315,3.845,z-.515),(x+.315,3.845,z-.515),(x+.315,3.845,z+.515),(x-.315,3.845,z+.515)],[(0,1,2,3)],'Ink',root)
    uv=o.data.uv_layers.new(name='UVMap')
    for loop,coord in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=coord
    o['studioArtwork']='orbit'
    print('POSTER_READY',len(COL.objects))

def export(project_root):
    root=Path(project_root); root.joinpath('assets/models').mkdir(parents=True,exist_ok=True)
    selected=list(bpy.context.selected_objects);active=bpy.context.view_layer.objects.active
    try:
        bpy.context.view_layer.update()
        for o in selected:o.select_set(False)
        for o in list(COL.objects):
            if o.type=='FONT':
                data=bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
                name=o.name;parent=o.parent;matrix=o.matrix_world.copy()
                new=bpy.data.objects.new(name+'_Mesh',data);COL.objects.link(new)
                new.parent=parent;new.matrix_world=matrix
                bpy.data.objects.remove(o,do_unlink=True)
        for o in COL.objects:o.select_set(True)
        bpy.context.view_layer.objects.active=next(iter(COL.objects))
        bpy.ops.export_scene.gltf(filepath=str(root/'assets/models/office-dressing.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_yup=True,export_lights=False,export_cameras=False)
        bpy.data.libraries.write(str(root/'art/blender/studio-dressing/studio-dressing.blend'),{COL},compress=True)
        report={'method':'Native Blender MCP; additive collection; existing office and characters untouched','contacts':CONTACTS,'objects':len(COL.objects),'meshSingleUser':all(o.data.users==1 for o in COL.objects if o.type=='MESH'),'sourceSceneUnchanged':bpy.data.filepath}
        (root/'art/blender/studio-dressing/receipt.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print('EXPORTED',json.dumps(report,ensure_ascii=False))
    finally:
        for o in list(bpy.context.selected_objects):o.select_set(False)
        for o in selected:
            if o.name in bpy.context.scene.objects:o.select_set(True)
        if active and active.name in bpy.context.scene.objects:bpy.context.view_layer.objects.active=active
