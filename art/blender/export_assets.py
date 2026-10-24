"""Run after both recipes; set PROJECT_ROOT before executing this source."""

def join_static(root):
    groups={}
    for obj in root.children_recursive:
        parent=obj.parent; separate=False
        while parent and parent!=root:
            if 'chairIndex' in parent or 'wallSide' in parent: separate=True;break
            parent=parent.parent
        if separate: continue
        if obj.type=='MESH' and 'screenIndex' not in obj and 'windowTexture' not in obj and obj.name!=PREFIX+'ArcadeScreen':
            key=obj.data.materials[0].name if obj.data.materials else 'None'
            groups.setdefault(key,[]).append(obj)
    for material,objects in groups.items():
        deselect()
        for obj in objects: obj.hide_set(False);obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1: bpy.ops.object.join()
        obj=bpy.context.object;matrix=obj.matrix_world.copy();obj.parent=root;obj.matrix_world=matrix
        obj.name=PREFIX+'Static_'+root.name[len(PREFIX):]+'_'+material[len(PREFIX):]
    for obj in list(root.children_recursive):
        if obj.type=='EMPTY' and not obj.children: bpy.data.objects.remove(obj,do_unlink=True)

def export_selection(path):
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,
        use_visible=False,export_extras=True,export_animations=False,export_yup=True,
        export_cameras=False,export_lights=False,export_apply=True)

def batch_character(root):
    # Join only rigid pieces under the same pivot and material. Fingers/eyes stay movable.
    parents=[obj for obj in [root]+list(root.children_recursive) if obj.type=='EMPTY']
    for parent in parents:
        groups={}
        for obj in parent.children:
            if obj.type=='MESH': groups.setdefault(obj.data.materials[0].name,[]).append(obj)
        for objects in groups.values():
            if len(objects)<2:continue
            deselect()
            for obj in objects:obj.hide_set(False);obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()

room_roots=[bpy.data.objects[PREFIX+'Room']]+[bpy.data.objects[PREFIX+f'Desk{i}'] for i in range(3)]
for i in range(3):
    chair=bpy.data.objects[PREFIX+f'Chair{i}'];chair['chairIndex']=i;join_static(chair)
for side in ['Back','Left']: join_static(bpy.data.objects[PREFIX+'Cutaway'+side])
for root in room_roots: join_static(root)
deselect()
for root in room_roots: select_tree(root)
export_selection(PROJECT_ROOT+'/assets/models/office.glb')

for ident,*_ in PEOPLE:
    root=bpy.data.objects[PREFIX+ident+'_Root'];deselect()
    batch_character(root);deselect()
    for obj in [root]+list(root.children_recursive): obj.hide_set(False)
    for obj in root.children_recursive:
        if obj.type=='EMPTY': obj.rotation_euler=(0,0,0)
    bpy.data.objects[PREFIX+ident+'_Hips'].location.z=.88
    root.location=(0,0,0);select_tree(root)
    export_selection(PROJECT_ROOT+'/assets/models/'+ident+'.glb')

# Editable presentation: the same three agents used by the control playthrough.
for obj in list(COLLECTION.objects): obj.hide_set(False)
for i,(ident,_,_,_,_) in enumerate(PEOPLE):
    root=bpy.data.objects[PREFIX+ident+'_Root']
    if ident not in ['mira','iskra','echo']:
        for obj in [root]+list(root.children_recursive):obj.hide_set(True)
        root.location=(12+i,0,0)
        continue
    station=['mira','iskra','echo'].index(ident);x,y=DESKS[station]
    root.location=(x,y-.94,0)
    bpy.data.objects[PREFIX+ident+'_Hips'].location.z=.60
    for side in ['Left','Right']:
        for joint,angle in [('Thigh',math.degrees(math.acos(.3))),('Shin',-math.degrees(math.acos(.3))),('UpperArm',63),('Forearm',28)]:
            bpy.data.objects[PREFIX+ident+'_'+side+joint].rotation_euler.x=math.radians(angle)
    bpy.context.view_layer.update()
    hips=bpy.data.objects[PREFIX+ident+'_Hips']
    pelvis=[o for o in hips.children if o.type=='MESH' and o.data.materials[0].name==PREFIX+ident+'Cloth']
    bottom=min((o.matrix_world@Vector(c)).z for o in pelvis for c in o.bound_box)
    gap(ident+' measured pelvis / seat',bottom,.48)
    foot=bpy.data.objects[PREFIX+ident+'_LeftShoe']
    sole=min((foot.matrix_world@Vector(c)).z for c in foot.bound_box)
    gap(ident+' measured shoe / floor',sole,0,tolerance=.004)
frame_view()
for obj in COLLECTION.objects:
    if obj.type=='MESH': assert obj.data.users==1, 'Shared mesh: '+obj.name
bpy.context.scene['release_stage']='exported: static office and six articulated characters'
bpy.context.scene['release_game_units']='metres; glTF Y-up; browser forward=-Z'
from pathlib import Path
preview_path=Path(PROJECT_ROOT)/'art/blender/motion_preview.py'
if (preview_path.parent/'motion-preview.json').exists(): exec(compile(preview_path.read_text('utf-8'),str(preview_path),'exec'),globals())
bpy.ops.wm.save_as_mainfile(filepath=PROJECT_ROOT+'/art/blender/do-reliza-office.blend',compress=True)
print('EXPORT_DONE',len(COLLECTION.objects),'objects; contacts checked; all mesh datablocks single-user')
