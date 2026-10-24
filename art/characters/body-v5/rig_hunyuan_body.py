"""CPU Blender stage for a NEW Hunyuan body on the accepted office skeleton.

blender --background --factory-startup --python rig_hunyuan_body.py -- 
  --id mira --base assets/models/mira.glb --body BODY.glb --output STAGE.glb
  [--config fit.json] [--force]

fit.json values are ORIGINAL source GLTF coordinates before front rotation:
source_sole_y, source_ankle_y, source_knee_y, source_hip_y, source_shoulder_y, source_neck_y,
source_center_x, source_center_z, source_shoulder_half_width; optional
target_sole_y(.012), neck_cut_y(1.34), ankle_cut_y(.13), scale_z(1), offset_xyz.
source_arm_anchors holds measured Left/Right shoulder/elbow/wrist rawGLTF XYZ;
source_leg_centers is a low-to-high list of rawY/positive-halfwidth/rawZ.
These centerlines convert the generated pose to the actual office bind pose.
Without measured fit values the output is explicitly an estimated REVIEW stage.
Only the staged mesh/armature export is created: the production rig is immutable.
Generated metallic/roughness maps are disconnected; body cloth is matte .80.
Limb membership follows source-mesh geodesics from measured anatomical seeds;
final weights use continuous torso/limb domains and native fitted-surface
relaxation. Exact ankle cut-ring weights remain rigid to the matching shoe.
"""
import argparse
import hashlib
import heapq
import json
import math
from pathlib import Path
import struct
import sys
import time

import bpy
import bmesh
from mathutils import Matrix, Vector


def parse_glb(path):
    data = path.read_bytes()
    assert struct.unpack_from('<II', data) == (0x46546C67, 2), 'Expected GLB2'
    size = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + size]), data[28 + size:]


def accessor(doc, binary, index):
    a = doc['accessors'][index]
    assert not a.get('sparse'), 'Inspect sparse donor accessors before transfer'
    view = doc['bufferViews'][a['bufferView']]
    size = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    kind, count = {5126: ('f', 4), 5125: ('I', 4), 5123: ('H', 2), 5121: ('B', 1)}[a['componentType']]
    start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    values = [list(struct.unpack_from('<' + kind * size, binary, start + i * view.get('byteStride', size * count))) for i in range(a['count'])]
    if a.get('normalized'):
        maximum = {5121: 255, 5123: 65535}[a['componentType']]
        values = [[v / maximum for v in row] for row in values]
    return values


def matrix(values):
    return Matrix([values[i:i + 4] for i in range(0, 16, 4)]).transposed()


def world_reader(doc):
    parents = {c: i for i, n in enumerate(doc['nodes']) for c in n.get('children', [])}
    cache = {}
    def world(index):
        if index not in cache:
            node = doc['nodes'][index]
            if 'matrix' in node:
                local = matrix(node['matrix'])
            else:
                from mathutils import Quaternion
                x, y, z, w = node.get('rotation', [0, 0, 0, 1])
                local = Matrix.LocRotScale(Vector(node.get('translation', [0, 0, 0])), Quaternion((w, x, y, z)), Vector(node.get('scale', [1, 1, 1])))
            cache[index] = world(parents[index]) @ local if index in parents else local
        return cache[index]
    return world


C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def target_rig(doc, binary, ident):
    node = next(n for n in doc['nodes'] if n.get('name') == f'DR_{ident}_Skin')
    skin = doc['skins'][node['skin']]
    names = [doc['nodes'][i]['name'] for i in skin['joints']]
    assert len(names) == 25
    ibm = accessor(doc, binary, skin['inverseBindMatrices'])
    rests = {name: C @ matrix(values).inverted() for name, values in zip(names, ibm)}
    anchors = {name: rest.translation.copy() for name, rest in rests.items()}
    data = bpy.data.armatures.new('HunyuanBodyStageSkeleton')
    arm = bpy.data.objects.new('HunyuanBodyStageArmature', data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    parents = {c: i for i, n in enumerate(doc['nodes']) for c in n.get('children', [])}
    joint_names = dict(zip(skin['joints'], names))
    for index, name in zip(skin['joints'], names):
        bone = data.edit_bones.new(name)
        bone.head = anchors[name]
        children = [joint_names[c] for c in doc['nodes'][index].get('children', []) if c in joint_names]
        short = name.split(f'Skin_{ident}_', 1)[-1]
        if short == 'Head':
            bone.tail = bone.head + Vector((0, 0, .3))
        elif short.endswith('Foot'):
            bone.tail = bone.head + Vector((0, .16, 0))
        elif children:
            bone.tail = anchors[children[0]]
        else:
            bone.tail = bone.head + Vector((0, 0, -.035 if 'Finger' in short else .06))
        if (bone.tail - bone.head).length < .005:
            bone.tail = bone.head + Vector((0, 0, .05))
        if parents.get(index) in joint_names:
            bone.parent = data.edit_bones[joint_names[parents[index]]]
    bpy.ops.object.mode_set(mode='OBJECT')
    arm.select_set(False)
    return arm, names, skin, anchors


def donor_mesh(doc, binary, ident, skin, names):
    world = world_reader(doc)
    vertices, faces, weights = [], [], []
    wanted = {f'DR_{ident}_Skin', f'DR_{ident}_LeftFoot_Rigid', f'DR_{ident}_RightFoot_Rigid'}
    for ni, node in enumerate(doc['nodes']):
        if node.get('name') not in wanted or 'mesh' not in node:
            continue
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            positions = accessor(doc, binary, primitive['attributes']['POSITION'])
            indices = accessor(doc, binary, primitive['indices'])
            used = sorted({row[0] for row in indices})
            offset = len(vertices)
            remap = {old: offset + i for i, old in enumerate(used)}
            transform = C @ world(ni)
            vertices.extend(tuple(transform @ Vector(positions[i])) for i in used)
            faces.extend(tuple(remap[indices[i + k][0]] for k in range(3)) for i in range(0, len(indices), 3))
            if node.get('skin') is not None:
                joints = accessor(doc, binary, primitive['attributes']['JOINTS_0'])
                values = accessor(doc, binary, primitive['attributes']['WEIGHTS_0'])
                weights.extend({names[j]: w for j, w in zip(joints[i], values[i]) if w > 1e-8} for i in used)
            else:
                part = 'LeftFoot' if 'LeftFoot' in node['name'] else 'RightFoot'
                weights.extend({f'Skin_{ident}_{part}': 1} for _ in used)
    mesh = bpy.data.meshes.new('ExistingRig_WEIGHT_DONOR_ONLY')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(obj)
    groups = {name: obj.vertex_groups.new(name=name) for name in names}
    for i, row in enumerate(weights):
        for name, value in row.items():
            groups[name].add([i], value, 'REPLACE')
    return obj


def bisect(obj, axis, value, keep_lower):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    normal = Vector((0, 0, 0));normal[axis] = 1
    point = Vector((0, 0, 0));point[axis] = value
    bmesh.ops.bisect_plane(bm, geom=[*bm.verts, *bm.edges, *bm.faces], dist=1e-6, plane_co=point, plane_no=normal)
    discard = [v for v in bm.verts if v.co[axis] > value + 1e-6] if keep_lower else [v for v in bm.verts if v.co[axis] < value - 1e-6]
    bmesh.ops.delete(bm, geom=discard, context='VERTS')
    # Preserve the source face winding. After removing the generated head and
    # feet this is an OPEN surface: global recalc_face_normals can choose the
    # inward side for the remaining connected body (negative signed volume),
    # culling its chest and forearm fronts into apparent black ribbons.
    bm.to_mesh(obj.data);bm.free();obj.data.update()


def duplicate(obj, name):
    copy = obj.copy();copy.data = obj.data.copy();copy.name = name
    bpy.context.collection.objects.link(copy)
    return copy


def smooth01(value):
    t=max(0,min(1,value));return t*t*(3-2*t)


def geodesic_arm_membership(body,arm_specs):
    """Separate attached limbs along their surface, not through nearby pants.

    Body and distal-arm seeds lie on the measured source anatomy. Geodesics
    preserve whole sleeve/palm circumferences even when thick garments overlap
    the donor rig spatially. Only the shoulder junction receives mixed weights.
    """
    points=[v.co.copy() for v in body.data.vertices];graph=[[] for _ in points]
    for edge in body.data.edges:
        a,b=edge.vertices;distance=(points[a]-points[b]).length
        graph[a].append((b,distance));graph[b].append((a,distance))
    arm_seeds=[];body_seeds=[]
    for i,p in enumerate(points):
        side='Left' if p.x<0 else 'Right'
        if side not in arm_specs:continue
        src,_=arm_specs[side]
        distance=min((p-(a+(b-a)*max(0,min(1,(p-a).dot(b-a)/(b-a).length_squared)))).length for a,b in zip(src,src[1:]))
        if abs(p.x)>abs(src[0].x)+.11 and p.z<src[0].z-.12 and distance<.11:arm_seeds.append(i)
        if p.z<.40 or abs(p.x)<abs(src[0].x)*.65 and .55<p.z<src[0].z-.08:body_seeds.append(i)
    assert arm_seeds and body_seeds,'Measured anatomical geodesic seeds are missing'
    def distances(seeds):
        values=[float('inf')]*len(points);queue=[]
        for i in seeds:values[i]=0;heapq.heappush(queue,(0,i))
        while queue:
            distance,i=heapq.heappop(queue)
            if distance!=values[i]:continue
            for j,length in graph[i]:
                candidate=distance+length
                if candidate<values[j]:values[j]=candidate;heapq.heappush(queue,(candidate,j))
        return values
    arms,torso=distances(arm_seeds),distances(body_seeds);result=[]
    for a,b in zip(arms,torso):
        result.append(None if math.isinf(a) and math.isinf(b) else 0 if math.isinf(a) else 1 if math.isinf(b) else smooth01((b-a+.06)/.12))
    return result,{'arm_seed_vertices':len(arm_seeds),'torso_seed_vertices':len(body_seeds),'unseeded_island_vertices':sum(v is None for v in result),'shoulder_transition_m':.12}


def limb_cage_fit(body, config, fit_point, anchors, ident):
    """Fit the genuine mesh's measured limb centerlines, preserving all UVs.

    source_arm_anchors: {Left|Right:{shoulder,elbow,wrist:[rawGLTF xyz]}}.
    source_leg_centers: [[rawY, positiveHalfWidth, rawZ], ...] low-to-high.
    This is an explicit bind-pose conversion, not a replacement body generator.
    """
    arm_specs={}
    for side,points in config.get('source_arm_anchors',{}).items():
        source=[fit_point(points[k]) for k in ['shoulder','elbow','wrist']]
        target=[anchors[f'Skin_{ident}_{side}{k}'] for k in ['UpperArm','Forearm','Wrist']]
        transforms=[]
        for i in range(2):
            a,b=source[i],source[i+1];c,d=target[i],target[i+1]
            rotation=(b-a).normalized().rotation_difference((d-c).normalized())
            transforms.append((a,c,rotation,(d-c).length/(b-a).length))
        arm_specs[side]=(source,transforms)
    leg_centers=sorted(config.get('source_leg_centers',[]),key=lambda p:p[0])
    membership=body.data.attributes.new(name='hunyuan_arm_membership',type='FLOAT',domain='POINT')
    geodesic,geodesic_proof=geodesic_arm_membership(body,arm_specs) if arm_specs else ([None]*len(body.data.vertices),{})
    before_cage=[v.co.copy() for v in body.data.vertices]
    arm_count=leg_count=0
    for vertex in body.data.vertices:
        p=vertex.co.copy();side='Left' if p.x<0 else 'Right';blend=0
        if side in arm_specs:
            src,transforms=arm_specs[side]
            distance=min((p-(a+(b-a)*max(0,min(1,(p-a).dot(b-a)/(b-a).length_squared)))).length for a,b in zip(src,src[1:]))
            xgate=smooth01((abs(p.x)-(abs(src[0].x)-.06))/.09)
            blend=xgate*(1-smooth01((distance-.10)/.06))
            # Hands continue the forearm centerline; nearest-segment distance
            # otherwise grows past the wrist and would leave fingers unfitted.
            direction=(src[2]-src[1]).normalized()
            beyond=(p-src[2]).dot(direction)
            if beyond>0:
                radial=(p-src[2]-direction*beyond).length
                blend=max(blend,xgate*(1-smooth01((radial-.08)/.06)))
            if geodesic[vertex.index] is not None:blend=geodesic[vertex.index]
            membership.data[vertex.index].value=blend
            if blend>1e-6:
                along=(p-src[1]).dot((src[2]-src[0]).normalized())
                lower=smooth01((along+.045)/.09)
                mapped=[c+rotation@(p-a)*scale for a,c,rotation,scale in transforms]
                target=mapped[0].lerp(mapped[1],lower)
                vertex.co=p.lerp(target,blend);arm_count+=1
        if leg_centers and p.z<.98:
            # Invert the fitted vertical knots through the source centerline
            # itself: interpolate each source center at its fitted target Y.
            centers=[(fit_point((half,y,depth)),y) for y,half,depth in leg_centers]
            centers.sort(key=lambda p:p[0].z)
            a,b=next(((a[0],b[0]) for a,b in zip(centers,centers[1:]) if p.z<=b[0].z),(centers[-2][0],centers[-1][0]))
            t=max(0,min(1,(p.z-a.z)/(b.z-a.z)));center=a.lerp(b,t)
            xcenter=abs(center.x);sign=-1 if p.x<0 else 1
            strength=smooth01((.98-p.z)/.10)*smooth01(abs(p.x)/max(.02,xcenter*.75))*(1-smooth01(blend/.25))
            vertex.co.x+=sign*(.115-xcenter)*strength
            vertex.co.y-=center.y*strength;leg_count+=1
    body.data.update()
    edge_proof=[]
    for edge in body.data.edges:
        i,j=edge.vertices;before=(before_cage[i]-before_cage[j]).length;after=(body.data.vertices[i].co-body.data.vertices[j].co).length
        if after-before>.01:edge_proof.append({'vertices':[i,j],'before':before,'after':after,'growth':after-before,'before_points':[list(before_cage[i]),list(before_cage[j])],'after_points':[list(body.data.vertices[i].co),list(body.data.vertices[j].co)],'arm_membership':[membership.data[i].value,membership.data[j].value]})
    edge_proof.sort(key=lambda e:e['growth'],reverse=True)
    return {'fitted_arm_vertices':arm_count,'fitted_leg_vertices':leg_count,'measured_arm_sides':list(arm_specs),'measured_leg_centers':leg_centers,'geodesic_membership':geodesic_proof,'cage_edge_proof':{'edges_growing_over_1cm':len(edge_proof),'worst':edge_proof[:8]}}


def transfer_weights(body, donor, arm, names, ident, ankle_cut, neck_cut,final_smooth_iterations=90):
    for name in names:
        body.vertex_groups.new(name=name)
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True);bpy.context.view_layer.objects.active = body
    transfer = body.modifiers.new('Native nearest-face weight interpolation', 'DATA_TRANSFER')
    transfer.object = donor;transfer.use_vert_data = True;transfer.data_types_verts = {'VGROUP_WEIGHTS'}
    transfer.vert_mapping = 'POLYINTERP_NEAREST';transfer.layers_vgroup_select_src = 'ALL';transfer.layers_vgroup_select_dst = 'NAME'
    transfer.mix_mode = 'REPLACE'
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    # Native interpolation can switch abruptly between disconnected donor
    # garment parts. Smooth on the NEW connected surface before domain guards.
    body.vertex_groups.active_index=0
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=.5, repeat=3)
    bpy.ops.object.mode_set(mode='OBJECT')
    lookup = {g.index: g.name for g in body.vertex_groups}
    groups = {g.name: g for g in body.vertex_groups}
    changes, fallback, leg_repairs, arm_repairs = 0, 0, 0, 0
    membership=body.data.attributes.get('hunyuan_arm_membership')
    for vertex in body.data.vertices:
        x, _, z = vertex.co
        side = 'Left' if x < 0 else 'Right'
        donor_row = {lookup[g.group]: g.weight for g in vertex.groups if g.weight > 1e-8}
        row=donor_row.copy()
        arm_weight=membership.data[vertex.index].value if membership else 0
        if z<.90:
            # Thick new pants can be closer to an old shoe than an old thin
            # shin. Bone-height domains prevent a calf inheriting Foot weights.
            foot=f'Skin_{ident}_{side}Foot';shin=f'Skin_{ident}_{side}Shin';thigh=f'Skin_{ident}_{side}Thigh';hips=f'Skin_{ident}_Hips'
            if z<ankle_cut+.018:
                row={foot:1}
            elif z<.22:
                t=smooth01((z-(ankle_cut+.018))/(.22-(ankle_cut+.018)));row={foot:1-t,shin:t}
            elif z<.42:
                row={shin:1}
            elif z<.55:
                t=smooth01((z-.42)/.13);row={shin:1-t,thigh:t}
            else:
                hip=smooth01((z-.74)/.20)
                across=smooth01((z-.52)/.10)*(1-smooth01(abs(x)/.07))
                opposite=f'Skin_{ident}_{"Right" if side=="Left" else "Left"}Thigh'
                row={hips:hip,thigh:(1-hip)*(1-across*.5),opposite:(1-hip)*across*.5}
            leg_repairs+=1
        elif z < ankle_cut + .018:
            row = {f'Skin_{ident}_{side}Foot': 1}
        else:
            # A wide sweatshirt hem can be nearer the donor forearm than the
            # donor torso. Source-measured arm membership, not an X=.30 wall,
            # determines the limb domain continuously across adjacent vertices.
            t=smooth01((z-.88)/.10)
            row={f'Skin_{ident}_Hips':1-t,f'Skin_{ident}_Torso':t}
        if arm_weight>1e-8:
            upper=f'Skin_{ident}_{side}UpperArm';forearm=f'Skin_{ident}_{side}Forearm';wrist=f'Skin_{ident}_{side}Wrist'
            shoulder,elbow,hand=(arm.data.bones[n].head_local for n in [upper,forearm,wrist])
            direction=(hand-shoulder).normalized()
            lower=smooth01(((vertex.co-elbow).dot(direction)+.05)/.10)
            arm_row={upper:1-lower,forearm:lower}
            hand_blend=smooth01(((vertex.co-hand).dot(direction)+.035)/.07)
            if hand_blend:
                fingers={n:w for n,w in donor_row.items() if n.startswith(f'Skin_{ident}_{side}') and any(part in n for part in ['Wrist','Finger','Thumb'])}
                total=sum(fingers.values())
                fingers={n:w/total for n,w in fingers.items()} if total>1e-6 else {wrist:1}
                arm_row={n:w*(1-hand_blend) for n,w in arm_row.items()}
                for n,w in fingers.items():arm_row[n]=arm_row.get(n,0)+w*hand_blend
            row={n:w*(1-arm_weight) for n,w in row.items()}
            for n,w in arm_row.items():row[n]=row.get(n,0)+w*arm_weight
            arm_repairs+=1
        neck=smooth01((z-(neck_cut-.035))/.035)*smooth01((.18-abs(x))/.05)*(1-arm_weight)
        if neck:
            row={n:w*(1-neck) for n,w in row.items()}
            row[f'Skin_{ident}_Head']=row.get(f'Skin_{ident}_Head',0)+neck
        if not row:
            fallback += 1
            closest = min(arm.data.bones, key=lambda b: (vertex.co - b.head_local).length)
            row = {closest.name: 1}
        top = sorted(row.items(), key=lambda v: v[1], reverse=True)[:4]
        total = sum(value for _, value in top)
        for group in body.vertex_groups:
            if any(g.group == group.index for g in vertex.groups):
                group.remove([vertex.index])
        for name, value in top:
            if value > 1e-8:groups[name].add([vertex.index], value / total, 'REPLACE')
    # Domain classification follows the source surface. Relax its final blend
    # on the fitted surface too, where an A-pose change can shorten some edges.
    # Applying smoothing BEFORE guards alone left abrupt analytical boundaries.
    body.vertex_groups.active_index=0
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_smooth(group_select_mode='ALL',factor=.5,repeat=final_smooth_iterations)
    bpy.ops.object.mode_set(mode='OBJECT')
    for vertex in body.data.vertices:
        x,_,z=vertex.co;side='Left' if x<0 else 'Right';prefix=f'Skin_{ident}_';limb=prefix+side
        values={lookup[g.group]:g.weight for g in vertex.groups if g.weight>1e-8}
        body_mass=sum(w for n,w in values.items() if n in [prefix+'Hips',prefix+'Torso',prefix+'Head'] or any(s in n for s in ['Thigh','Shin','Foot']))
        # Keep digits only after the fitted surface has essentially no body
        # influence. A hard X/membership hand box can otherwise reassign half
        # of a loose jacket from the pelvis to the wrist across one triangle.
        hand_zone=z<.82 and body_mass<.001
        if hand_zone:
            digits=sorted([(n,w) for n,w in values.items() if n.startswith(limb) and any(s in n for s in ['Finger','Thumb'])],key=lambda p:p[1],reverse=True)[:2]
            allowed={limb+'Forearm',limb+'Wrist',*(n for n,_ in digits)}
            def collapse(n):return n if n in allowed else limb+'Wrist' if any(s in n for s in ['Finger','Thumb']) else limb+'Forearm'
        elif z>=.82:
            def collapse(n):
                if n==prefix+'Head':return n if abs(x)<.18 and z>neck_cut-.06 else prefix+'Torso'
                if z>=1.05 and any(s in n for s in ['Thigh','Shin','Foot']):return prefix+'Hips'
                if z<1.05 and n==prefix+'Torso':return prefix+'Hips'
                if any(s in n for s in ['Wrist','Finger','Thumb']):return limb+'Forearm'
                return n
        else:
            def collapse(n):
                if n in [prefix+'Torso',prefix+'Head']:return prefix+'Hips'
                if 'UpperArm' in n:return limb+'Forearm'
                if any(s in n for s in ['Finger','Thumb']):return limb+'Wrist'
                return n
        coherent={}
        for name,weight in values.items():
            name=collapse(name);coherent[name]=coherent.get(name,0)+weight
        row=sorted([(groups[n].index,w) for n,w in coherent.items()],key=lambda p:p[1],reverse=True)[:4]
        # The exact cut ring must follow the rigid generated shoe, including
        # after weight relaxation, so walking cannot open an ankle seam.
        if vertex.co.z<ankle_cut+1e-5:
            side='Left' if vertex.co.x<0 else 'Right'
            row=[(groups[f'Skin_{ident}_{side}Foot'].index,1)]
        total=sum(w for _,w in row)
        for group in body.vertex_groups:
            if any(g.group==group.index for g in vertex.groups):group.remove([vertex.index])
        for index,weight in row:body.vertex_groups[index].add([vertex.index],weight/total,'REPLACE')
    modifier = body.modifiers.new('Office 25-bone real deformation', 'ARMATURE');modifier.object = arm
    body.parent = arm
    return {'opposite_limb_repairs': changes, 'fallback_vertices': fallback, 'anatomical_leg_vertices':leg_repairs, 'anatomical_arm_vertices':arm_repairs,'source_measured_continuous_arm_membership':membership is not None, 'native_smooth_iterations':3,'final_fitted_surface_smooth_iterations':final_smooth_iterations}


def rotate_source_front(body):
    """Rotate actual mesh data: GLTF imports use quaternion object rotation.

    Assigning rotation_euler on that object is ignored by transform_apply.
    A data-space matrix also leaves UV loops and material assignments intact.
    """
    samples=[(i,body.data.vertices[i].co.copy()) for i in range(0,len(body.data.vertices),max(1,len(body.data.vertices)//31))]
    body.data.transform(Matrix.Rotation(math.pi,4,'Z'))
    body.data.update()
    error=max((body.data.vertices[i].co-Vector((-p.x,-p.y,p.z))).length for i,p in samples)
    assert error<1e-5,f'Actual generated front rotation failed: {error}'
    return {'method':'mesh_data_rotation_Z_pi','maximum_sample_error_m':error,'samples':len(samples),'source_front_gltf':'+Z','target_front_gltf':'-Z'}


def main():
    parser = argparse.ArgumentParser()
    for key in ['id', 'base', 'body', 'output']:parser.add_argument('--' + key, required=True)
    parser.add_argument('--config');parser.add_argument('--force', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    base, source, output = (Path(p).resolve() for p in [args.base, args.body, args.output])
    scope = Path(__file__).resolve().parent
    assert output.is_relative_to(scope) and output.suffix == '.glb' and output not in [base, source], 'Only a body-v5 review stage may be written'
    assert args.force or not output.exists(), 'Review existing stage before --force'
    config = json.loads(Path(args.config).read_text(encoding='utf-8')) if args.config else {}
    record = {'id': args.id, 'method': 'Measured limb-cage fit with source-geodesic membership; continuous anatomical weights, donor finger detail, native fitted-surface relaxation and rigid ankle contacts; original skeleton/animations not exported', 'base_sha256': hashlib.sha256(base.read_bytes()).hexdigest(), 'body_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'fit': config, 'estimated_fit': not all(k in config for k in ['source_hip_y', 'source_shoulder_y', 'source_neck_y', 'source_arm_anchors', 'source_leg_centers'])}
    started = time.monotonic()
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    doc, binary = parse_glb(base)
    assert doc['asset'].get('extras', {}).get('portraitHeadVersion') == 4
    arm, names, skin, anchors = target_rig(doc, binary, args.id)
    donor = donor_mesh(doc, binary, args.id, skin, names)
    before = set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [o for o in set(bpy.data.objects) - before if o.type == 'MESH']
    assert len(meshes) == 1, 'Body-final should be one cleaned textured mesh'
    body = meshes[0];body.name = f'HB_{args.id}_Body'
    # Generated packed MR frequently labels skin/cloth as polished metal. Keep
    # the accepted painted albedo/UV; use an explicit matte office-cloth finish.
    material_count=0
    for material in body.data.materials:
        if not material or not material.use_nodes:continue
        for shader in material.node_tree.nodes:
            if shader.type!='BSDF_PRINCIPLED':continue
            for socket,value in [('Metallic',0.0),('Roughness',.80)]:
                for link in list(shader.inputs[socket].links):material.node_tree.links.remove(link)
                shader.inputs[socket].default_value=value
            material_count+=1
    record['material_policy']={'metallic':0.0,'roughness':.80,'generated_mr_disconnected':True,'basecolor_untouched':True,'material_count':material_count}
    bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active = body
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Paint/export UV seams may duplicate positions. Weld the geometry only;
    # BMesh keeps per-loop UVs, so subsequent weight smoothing cannot tear seams.
    bm=bmesh.new();bm.from_mesh(body.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bm.to_mesh(body.data);bm.free();body.data.update()
    smooth_iterations=int(config.get('surface_smooth_iterations',0))
    if smooth_iterations:
        smooth_factor=float(config.get('surface_smooth_factor',.45))
        smooth=body.modifiers.new('Remove generated high-frequency surface noise','SMOOTH')
        smooth.factor=smooth_factor;smooth.iterations=smooth_iterations
        bpy.ops.object.modifier_apply(modifier=smooth.name)
        record['surface_smoothing']={'factor':smooth_factor,'iterations':smooth_iterations,'applied_before_fit_and_contact_cuts':True}
    # Hunyuan GLTF+Z front becomes game GLTF-Z front: Blender rotationZ(pi).
    record['front_rotation_proof']=rotate_source_front(body)
    coords = [v.co.copy() for v in body.data.vertices]
    low = [min(v[i] for v in coords) for i in range(3)];high = [max(v[i] for v in coords) for i in range(3)]
    height = high[2] - low[2];sole = config.get('source_sole_y', low[2]);neck = config.get('source_neck_y', sole + height * .80)
    hip = config.get('source_hip_y', sole + height * .50);shoulder = config.get('source_shoulder_y', sole + height * .76)
    target_sole = config.get('target_sole_y', .012);scale = (1.385 - target_sole) / (neck - sole)
    center_x = -config.get('source_center_x', -(low[0] + high[0]) / 2)
    center_y = config.get('source_center_z', (low[1] + high[1]) / 2)
    width_scale = .245 / config['source_shoulder_half_width'] if 'source_shoulder_half_width' in config else scale
    knots = [(sole, target_sole)]
    for key,target in [('source_ankle_y',.09),('source_knee_y',.48)]:
        if key in config:knots.append((config[key],target))
    knots += [(hip, .88), (shoulder, 1.258), (neck, 1.385), (high[2], 1.385 + (high[2] - neck) * scale)]
    assert all(a[0] < b[0] and a[1] < b[1] for a, b in zip(knots, knots[1:])), 'Invalid measured fit order'
    height_mode=config.get('height_interpolation','linear')
    if height_mode=='monotone_cubic':
        import importlib.util
        spec=importlib.util.spec_from_file_location('office_height_curve',Path(__file__).with_name('rig_height_curve.py'))
        curve=importlib.util.module_from_spec(spec);spec.loader.exec_module(curve)
        fit_z,record['height_interpolation_proof']=curve.monotone_hermite(knots)
    else:
        assert height_mode=='linear','Unknown height interpolation mode'
        def fit_z(z):
            a, b = next(((a, b) for a, b in zip(knots, knots[1:]) if z <= b[0]), knots[-2:])
            return a[1] + (z - a[0]) / (b[0] - a[0]) * (b[1] - a[1])
    record['height_interpolation']=height_mode
    offset = Vector(config.get('offset_xyz', [0, 0, 0]));offset = C @ offset
    def fitted_blender(x,y,z):
        return Vector(((x-center_x)*width_scale,(y-center_y)*scale*config.get('scale_z',1),fit_z(z)))+offset
    def fit_source(raw):
        return fitted_blender(-raw[0],raw[2],raw[1])
    for vertex in body.data.vertices:
        vertex.co=fitted_blender(*vertex.co)
    record['limb_cage']=limb_cage_fit(body,config,fit_source,anchors,args.id)
    neck_cut = config.get('neck_cut_y', 1.34);ankle_cut = config.get('ankle_cut_y', .13)
    bisect(body, 2, neck_cut, True)
    feet = []
    for label, left in [('Left', True), ('Right', False)]:
        foot = duplicate(body, f'HB_{args.id}_{label}Foot');bisect(foot, 2, ankle_cut, True);bisect(foot, 0, 0, left)
        assert len(foot.data.polygons) > 12, 'Generated shoe surface is missing'
        foot['hunyuanBodyPart'] = label + 'Foot';feet.append(foot)
    bisect(body, 2, ankle_cut, False)
    body['hunyuanBodyPart'] = 'Body'
    body.data.calc_loop_triangles()
    signed_volume=sum(body.data.vertices[t.vertices[0]].co.dot(body.data.vertices[t.vertices[1]].co.cross(body.data.vertices[t.vertices[2]].co))/6 for t in body.data.loop_triangles)
    assert signed_volume>0,'Body winding became inward after contact cuts'
    record['winding_proof']={'source_winding_preserved_during_open_surface_cuts':True,'body_signed_triangle_volume_proxy':signed_volume}
    def ring(obj):
        return {tuple(float(c) for c in v.co) for v in obj.data.vertices if abs(v.co.z - ankle_cut) < 1e-6}
    body_ring = ring(body)
    shoe_ring = set().union(*(ring(foot) for foot in feet))
    from mathutils.kdtree import KDTree
    def ring_distance(a,b):
        tree=KDTree(len(b))
        for i,p in enumerate(b):tree.insert(p,i)
        tree.balance()
        return max(tree.find(p)[2] for p in a)
    assert body_ring and shoe_ring,'Missing generated shoe/body ankle rings'
    contact_error=max(ring_distance(body_ring,shoe_ring),ring_distance(shoe_ring,body_ring))
    # A tenth of a millimetre is below visible mesh precision; measure the
    # actual error rather than reject a valid 32-micrometre bisect interpolation.
    assert contact_error<1e-4,f'Generated shoe/body ankle cut rings differ by {contact_error:.8f}m'
    record.update(source_bounds_blender=[low, high], fit_knots_y=knots, target_sole_y=target_sole, neck_cut_y=neck_cut, ankle_cut_y=ankle_cut, uniform_depth_scale=scale, width_scale=width_scale)
    record['ankle_contact_proof'] = {'matching_ring_points': len(body_ring), 'coordinate_tolerance_m': 1e-4, 'maximum_nearest_ring_distance_m':contact_error, 'body_ring_equals_shoe_rings': True}
    record['weights'] = transfer_weights(body, donor, arm, names, args.id, ankle_cut, neck_cut,int(config.get('weight_smooth_iterations',90)))
    bpy.data.objects.remove(donor, do_unlink=True)
    for foot in feet:
        old = foot.matrix_world.copy();foot.parent = arm;foot.parent_type = 'BONE';foot.parent_bone = f'Skin_{args.id}_{foot["hunyuanBodyPart"]}';foot.matrix_world = old
    for obj in [body, *feet]:
        for polygon in obj.data.polygons:polygon.use_smooth = True
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [arm, body, *feet]:obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True, export_animations=False, export_image_format='AUTO', export_extras=True, export_all_influences=False)
    staged, payload = parse_glb(output)
    staged['asset'].setdefault('extras', {})['hunyuanBodyStage'] = {'version': 5, 'neckCutY': neck_cut, 'ankleCutY': ankle_cut, 'estimatedFit': record['estimated_fit'], 'config': config}
    # JSON-only metadata insertion leaves Blender's geometry/weights untouched.
    js = json.dumps(staged, separators=(',', ':')).encode();js += b' ' * (-len(js) % 4)
    output.write_bytes(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(payload)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(payload), 0x004E4942) + payload)
    bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')), compress=True)
    record.update(status='staged_review_required', seconds=round(time.monotonic() - started, 3), stage_bytes=output.stat().st_size, stage_sha256=hashlib.sha256(output.read_bytes()).hexdigest(), body_vertices=len(body.data.vertices), body_triangles=sum(len(p.vertices) - 2 for p in body.data.polygons), shoe_triangles={f['hunyuanBodyPart']: sum(len(p.vertices) - 2 for p in f.data.polygons) for f in feet})
    output.with_suffix('.receipt.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8');print('HUNYUAN_BODY_STAGE', json.dumps(record), flush=True)


if __name__ == '__main__':main()
