"""Anatomical deform bones plus axis-stable controls for the office IK solver."""

import math
import bpy
from mathutils import Vector, Matrix
from mesh_tools import loft, oval, sweep

ANGLE = 0.40


def create_rig(ctx):
    ident = ctx["id"]
    col = ctx["collection"]
    controls = {}
    root = bpy.data.objects.new("Team3D_" + ident + "_Root", None)
    col.objects.link(root)
    ctx["root"] = root
    ctx["controls"] = controls
    ctx["head_pivot"] = 1.385
    specs = [
        ("Hips", None, (0, 0, 0.88)),
        ("Torso", "Hips", (0, 0, 0.10)),
        ("Head", "Torso", (0, 0, 0.405)),
        ("EyeLeft", "Head", (0, 0, 0)),
        ("EyeRight", "Head", (0, 0, 0)),
    ]
    for side, label in [(-1, "Left"), (1, "Right")]:
        specs += [
            (label + "Thigh", "Hips", (side * 0.115, 0, 0)),
            (label + "Shin", label + "Thigh", (0, 0, -0.40)),
            (label + "Foot", label + "Shin", (0, 0, -0.39)),
            (label + "UpperArm", "Torso", (side * 0.245, 0, 0.278)),
            (label + "Forearm", label + "UpperArm", (0, 0, -0.285)),
            (label + "Wrist", label + "Forearm", (0, 0, -0.265)),
        ]
        for i in range(4):
            specs.append(
                (
                    label + "Finger" + str(i),
                    label + "Wrist",
                    (-0.027 + i * 0.018, 0, -0.062),
                )
            )
        specs.append((label + "Thumb", label + "Wrist", (-side * 0.040, 0, -0.032)))
    for name, parent, position in specs:
        obj = bpy.data.objects.new("Team3D_" + ident + "_" + name, None)
        col.objects.link(obj)
        obj.parent = controls[parent] if parent else root
        obj.location = position
        controls[name] = obj
        if name.endswith("UpperArm"):
            obj.rotation_euler.y = (-1 if name.startswith("Right") else 1) * ANGLE
    bpy.context.view_layer.update()
    data = bpy.data.armatures.new("DR_" + ident + "_Skeleton")
    arm = bpy.data.objects.new("DR_" + ident + "_Armature", data)
    col.objects.link(arm)
    arm.parent = root
    arm.show_in_front = True
    ctx["armature"] = arm
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    names = [n for n, _, _ in specs if not n.startswith("Eye")]
    ctx["bone_names"] = names
    for name, parent, _ in specs:
        if name.startswith("Eye"):
            continue
        bone = data.edit_bones.new("Skin_" + ident + "_" + name)
        bone.head = controls[name].matrix_world.translation
        children = [n for n, p, _ in specs if p == name and not n.startswith("Eye")]
        if name == "Hips":
            tail = controls["Torso"].matrix_world.translation
        elif name == "Head":
            tail = bone.head + Vector((0, 0, 0.30))
        elif name.endswith("Foot"):
            tail = bone.head + Vector((0, 0.16, 0))
        elif children:
            tail = controls[children[0]].matrix_world.translation
        else:
            tail = bone.head + Vector((0, 0, -0.032 if "Finger" in name else 0.09))
        if (tail - bone.head).length < 0.005:
            tail = bone.head + Vector((0, 0, 0.06))
        bone.tail = tail
        if parent:
            bone.parent = data.edit_bones.get("Skin_" + ident + "_" + parent)
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.select_set(False)
    ctx["specs"] = specs
    ctx["relations"] = {
        name: controls[name].matrix_world.inverted()
        @ arm.data.bones["Skin_" + ident + "_" + name].matrix_local
        for name in names
    }
    root["skinRigVersion"] = 1
    root["agentId"] = ident
    root["skinBonePrefix"] = "Skin_" + ident + "_"
    root["skinJointNames"] = names
    return ctx


def rigid_weight(obj, name, ctx):
    vg = obj.vertex_groups.new(name="Skin_" + ctx["id"] + "_" + name)
    vg.add(list(range(len(obj.data.vertices))), 1, "REPLACE")


def build_hands(ctx):
    parts = []
    col = ctx["collection"]
    skin = ctx["mats"]["skin"]
    nail = ctx["mats"]["nail"]
    for side, label in [(-1, "Left"), (1, "Right")]:
        wrist = ctx["controls"][label + "Wrist"]
        palm = loft(
            "DR_" + ctx["id"] + "_" + label + "Palm",
            [
                (0, 0, 0.012, 0.024, 0.021),
                (0, 0, -0.015, 0.036, 0.023),
                (0, 0.001, -0.045, 0.039, 0.020),
                (0, 0, -0.069, 0.032, 0.016),
            ],
            skin,
            col,
            wrist,
            20,
        )
        parts.append((palm, label + "Wrist"))
        for i, length in enumerate([0.040, 0.048, 0.045, 0.034]):
            ctrl = ctx["controls"][label + "Finger" + str(i)]
            finger = loft(
                "DR_" + ctx["id"] + "_" + label + "Digit" + str(i),
                [
                    (0, 0, 0.005, 0.008, 0.010),
                    (0, 0.002, -length * 0.3, 0.009, 0.010),
                    (0, 0.004, -length * 0.65, 0.008, 0.009),
                    (0, 0.005, -length, 0.005, 0.006),
                    (0, 0.005, -length - 0.003, 0.002, 0.003),
                ],
                skin,
                col,
                ctrl,
                12,
            )
            parts.append((finger, label + "Finger" + str(i)))
            plate = oval(
                "DR_" + ctx["id"] + "Nail" + label + str(i),
                (0, -0.004, -length + 0.008),
                (0.005, 0.002, 0.008),
                nail,
                col,
                ctrl,
                12,
                8,
            )
            parts.append((plate, label + "Finger" + str(i)))
        ctrl = ctx["controls"][label + "Thumb"]
        thumb = sweep(
            "DR_" + ctx["id"] + "_" + label + "Thumb",
            [
                (0, 0, 0.008),
                (-side * 0.009, 0.002, -0.013),
                (-side * 0.019, 0.006, -0.030),
                (-side * 0.022, 0.009, -0.040),
            ],
            [0.014, 0.013, 0.011, 0.005],
            skin,
            col,
            ctrl,
            12,
        )
        parts.append((thumb, label + "Thumb"))
    bpy.context.view_layer.update()
    return parts


def build_shoes(ctx):
    # Shared stations define a rounded toe, raised heel and a genuinely flat sole.
    for label in ["Left", "Right"]:
        parent = ctx["controls"][label + "Foot"]
        parts = []
        col = ctx["collection"]
        prefix = "DR_" + ctx["id"] + "_" + label
        stations = [
            (-0.10, 0.035, 0.005),
            (-0.08, 0.061, 0.046),
            (0, 0.070, 0.050),
            (0.10, 0.074, 0.028),
            (0.175, 0.056, -0.005),
            (0.195, 0.025, -0.023),
        ]
        verts = []
        faces = []
        N = 20
        for y, w, top in stations:
            for i in range(N):
                a = math.tau * i / N
                x = w * math.cos(a)
                z = -0.073 + (top + 0.073) * (math.sin(a) + 1) / 2
                verts.append((x, y, z))
        for j in range(len(stations) - 1):
            for i in range(N):
                a = j * N + i
                b = j * N + (i + 1) % N
                faces.append((a, b, b + N, a + N))
        faces.extend(
            [
                tuple(reversed(range(N))),
                tuple((len(stations) - 1) * N + i for i in range(N)),
            ]
        )
        from mesh_tools import mesh

        upper = mesh(prefix + "Sneaker", verts, faces, ctx["mats"]["shoe"], col, parent)
        parts.append(upper)
        # Sole perimeter is derived from the same stations, at -0.09 exactly.
        soleverts = []
        outline = [(-w, y) for y, w, _ in stations] + [
            (w, y) for y, w, _ in reversed(stations)
        ]
        for z in [-0.09, -0.064]:
            soleverts.extend((x, y, z) for x, y in outline)
        n = len(outline)
        solefaces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))] + [
            (i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)
        ]
        parts.append(
            mesh(
                prefix + "Sole", soleverts, solefaces, ctx["mats"]["sole"], col, parent
            )
        )
        for i, y in enumerate([0.025, 0.05, 0.075]):
            parts.append(
                sweep(
                    prefix + "Lace" + str(i),
                    [(-0.039, y, 0.029), (0, y + 0.006, 0.038), (0.039, y, 0.029)],
                    0.0025,
                    ctx["mats"]["lace"],
                    col,
                    parent,
                    8,
                )
            )
        ctx["rigid_parts"].extend(parts)


def bake_actions(ctx):
    arm = ctx["armature"]
    controls = ctx["controls"]
    specs = ctx["specs"]
    names = ctx["bone_names"]
    relations = ctx["relations"]
    ident = ctx["id"]
    rest = {n: controls[n].matrix_basis.copy() for n, _, _ in specs}
    actions = []
    # Controller transforms are evaluated analytically, then baked onto real bones.
    for clip, frames in [
        ("Idle", 72),
        ("Walk", 24),
        ("Sit", 36),
        ("Stand", 36),
        ("Work", 48),
    ]:
        action = bpy.data.actions.new("DR_" + ident + "_" + clip)
        action.use_fake_user = True
        arm.animation_data_create()
        arm.animation_data.action = action
        for frame in range(1, frames + 2, 2):
            t = min(1, (frame - 1) / frames)
            phase = t * math.tau
            for n in controls:
                controls[n].matrix_basis = rest[n].copy()
            s = (
                (t * t * (3 - 2 * t))
                if clip == "Sit"
                else (1 - t * t * (3 - 2 * t))
                if clip == "Stand"
                else 1
                if clip == "Work"
                else 0
            )
            controls["Hips"].location.z = 0.88 - 0.28 * s
            controls["Torso"].rotation_euler.x = (0.11 if clip == "Work" else 0.04) * s
            if clip == "Idle":
                controls["Torso"].scale.z = 1 + 0.004 * math.sin(phase)
            for sign, label in [(-1, "Left"), (1, "Right")]:
                controls[label + "UpperArm"].rotation_euler = (0, 0, 0)
                controls[label + "Forearm"].rotation_euler = (0, 0, 0)
                gait_phase = (t + (0.5 if sign > 0 else 0)) % 1

                def sm(v):
                    v = max(0, min(1, v))
                    return v * v * (3 - 2 * v)

                if clip == "Walk":
                    f = (
                        0.24 - 0.48 * gait_phase / 0.6
                        if gait_phase < 0.6
                        else -0.24 + 0.48 * sm((gait_phase - 0.6) / 0.4)
                    )
                    lift = (
                        0
                        if gait_phase < 0.6
                        else math.sin((gait_phase - 0.6) / 0.4 * math.pi) * 0.105
                    )
                    pitch = (
                        0.12 * (1 - sm(gait_phase / 0.12))
                        - 0.16 * sm((gait_phase - 0.44) / 0.16)
                        if gait_phase < 0.6
                        else -0.16 + 0.28 * sm((gait_phase - 0.6) / 0.4)
                    )
                    controls[label + "UpperArm"].rotation_euler.x = (
                        -math.sin(phase + (math.pi if sign > 0 else 0)) * 0.36
                    )
                else:
                    f = 0
                    lift = 0
                    pitch = 0
                forward = f * (1 - s) + math.sqrt(0.4**2 - 0.12**2) * s
                foot = controls[label + "Foot"]
                points = [
                    v.co
                    for child in foot.children
                    if child.type == "MESH"
                    for v in child.data.vertices
                ]
                sole = -min(
                    v.z * math.cos(pitch) + v.y * math.sin(pitch) for v in points
                )
                height = controls["Hips"].location.z - sole - lift * (1 - s)
                length = max(0.03, min(0.78999, math.hypot(forward, height)))
                hip = math.atan2(forward, height) + math.acos(
                    max(-1, min(1, (0.4**2 + length**2 - 0.39**2) / (0.8 * length)))
                )
                knee = -math.acos(
                    max(-1, min(1, (length**2 - 0.4**2 - 0.39**2) / 0.312))
                )
                controls[label + "Thigh"].rotation_euler.x = hip
                controls[label + "Shin"].rotation_euler.x = knee
                controls[label + "Foot"].rotation_euler.x = -hip - knee + pitch
                if clip == "Work":
                    torso = (
                        controls["Hips"].matrix_basis @ controls["Torso"].matrix_basis
                    )
                    goal = (
                        torso.inverted() @ Vector((sign * 0.14, 0.55, 0.864))
                        - controls[label + "UpperArm"].location
                    )
                    d = max(0.03, min(0.5499, goal.length))
                    direction = goal.normalized()
                    a = (0.285**2 - 0.265**2 + d * d) / (2 * d)
                    bend = Vector((sign, -0.3, -0.3))
                    bend = (bend - direction * bend.dot(direction)).normalized()
                    elbow = direction * a + bend * math.sqrt(max(0, 0.285**2 - a * a))
                    down = Vector((0, 0, -1))
                    uq = down.rotation_difference(elbow.normalized())
                    fq = down.rotation_difference(
                        uq.inverted() @ (goal - elbow).normalized()
                    )
                    controls[label + "UpperArm"].rotation_mode = "QUATERNION"
                    controls[label + "UpperArm"].rotation_quaternion = uq
                    controls[label + "Forearm"].rotation_mode = "QUATERNION"
                    controls[label + "Forearm"].rotation_quaternion = fq
                    for digit in range(4):
                        controls[label + "Finger" + str(digit)].rotation_euler.x = (
                            0.08
                            + 0.15 * (0.5 + 0.5 * math.sin(phase * 3 + digit + sign))
                        )
            worlds = {}
            for n, parent, _ in specs:
                worlds[n] = (
                    worlds[parent] if parent else Matrix.Identity(4)
                ) @ controls[n].matrix_basis
            targets = {n: worlds[n] @ relations[n] for n in names}
            for n in names:
                bone = arm.data.bones["Skin_" + ident + "_" + n]
                pose = arm.pose.bones[bone.name]
                if bone.parent:
                    pn = bone.parent.name[len("Skin_" + ident + "_") :]
                    basis = (
                        bone.matrix_local.inverted()
                        @ bone.parent.matrix_local
                        @ targets[pn].inverted()
                        @ targets[n]
                    )
                else:
                    basis = bone.matrix_local.inverted() @ targets[n]
                pose.matrix_basis = basis
                pose.rotation_mode = "QUATERNION"
                for prop in ["location", "rotation_quaternion", "scale"]:
                    pose.keyframe_insert(prop, frame=frame, group=n)
        actions.append(action.name)
    arm.animation_data.action = None
    for bone in arm.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    for n in controls:
        controls[n].matrix_basis = rest[n]
    ctx["actions"] = actions
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
