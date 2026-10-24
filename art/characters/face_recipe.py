"""Reference-led face and coherent hair construction; no generated face decal."""

import math
from mesh_tools import mesh, oval, sweep, bezier, smooth


def skull_profile(z, male=False):
    profile = [
        (1.392, 0.018, 0.012),
        (1.415, 0.068 if not male else 0.080, 0.045),
        (1.45, 0.103 if not male else 0.118, 0.080),
        (1.50, 0.128, 0.102),
        (1.56, 0.140, 0.112),
        (1.62, 0.139, 0.110),
        (1.68, 0.123, 0.092),
        (1.72, 0.085, 0.060),
        (1.741, 0.005, 0.005),
    ]
    if z >= profile[-1][0]:
        return (0.005, 0.005)
    for a, b in zip(profile, profile[1:]):
        if a[0] <= z <= b[0]:
            f = smooth(a[0], b[0], z)
            return (a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f)
    return (0.018, 0.012)


def face_front(x, z, male=False):
    width, depth = skull_profile(z, male)
    front = depth * math.sqrt(max(0.002, 1 - (x / width) ** 2))
    for sign in (-1, 1):
        front -= 0.012 * math.exp(
            -(((x - sign * 0.061) / 0.037) ** 2) - ((z - 1.598) / 0.026) ** 2
        )
        front += 0.010 * math.exp(
            -(((x - sign * 0.076) / 0.047) ** 2) - ((z - 1.54) / 0.038) ** 2
        )
    front += 0.013 * math.exp(-((x / 0.021) ** 2) - ((z - 1.585) / 0.058) ** 2)
    front += 0.034 * math.exp(-((x / 0.024) ** 2) - ((z - 1.55) / 0.025) ** 2)
    front += 0.006 * math.exp(-((x / 0.045) ** 2) - ((z - 1.477) / 0.020) ** 2)
    return front


def build_face(ctx):
    c, ident, mats, head = (
        ctx["collection"],
        ctx["id"],
        ctx["mats"],
        ctx["controls"]["Head"],
    )
    male = ctx["male"]
    prefix = "DR_" + ident + "_"
    pivot = ctx["head_pivot"]

    def local(v):
        return (v[0], v[1], v[2] - pivot)

    parts = []
    vertices = []
    faces = []
    segments = 64
    levels = 32
    # Jaw, cheek, temple and cranium widths are shaped independently.
    profile = [
        (1.392, 0.018),
        (1.415, 0.068 if not male else 0.080),
        (1.45, 0.103 if not male else 0.118),
        (1.50, 0.128),
        (1.56, 0.14),
        (1.62, 0.139),
        (1.68, 0.123),
        (1.72, 0.085),
        (1.741, 0.005),
    ]
    for j in range(levels + 1):
        z = 1.392 + (1.741 - 1.392) * j / levels
        for k in range(len(profile) - 1):
            a, b = profile[k : k + 2]
            if a[0] <= z <= b[0]:
                f = smooth(a[0], b[0], z)
                rx = a[1] + (b[1] - a[1]) * f
                break
        for i in range(segments):
            angle = math.tau * i / segments
            x = rx * math.sin(angle)
            front = math.cos(angle)
            y = (
                front * skull_profile(z, male)[1]
                if front < 0
                else face_front(x, z, male)
            )
            # Jaw recedes into the neck; the nose is part of the face surface.
            y -= 0.018 * (1 - smooth(1.40, 1.48, z))
            vertices.append(local((x, y, z)))
    for j in range(levels):
        for i in range(segments):
            a = j * segments + i
            b = j * segments + (i + 1) % segments
            faces.append((a, a + segments, b + segments, b))
    faces += [
        tuple(reversed(range(segments))),
        tuple(levels * segments + i for i in range(segments)),
    ]
    parts.append(mesh(prefix + "Face", vertices, faces, mats["skin"], c, head))
    # Ears overlap the temple surface by 8 mm, rather than floating beside it.
    for side in (-1, 1):
        parts.append(
            oval(
                prefix + "Ear" + str(side),
                local((side * 0.139, -0.003, 1.565)),
                (0.027, 0.022, 0.045),
                mats["skin"],
                c,
                head,
                20,
                12,
            )
        )
        parts.append(
            oval(
                prefix + "EarFold" + str(side),
                local((side * 0.151, 0.012, 1.565)),
                (0.012, 0.005, 0.023),
                mats["lip"],
                c,
                head,
                16,
                10,
            )
        )
        eye = ctx["controls"]["EyeLeft" if side < 0 else "EyeRight"]
        eye.location = local(
            (side * 0.061, face_front(side * 0.061, 1.599, male) + 0.002, 1.599)
        )
        parts.append(
            oval(
                prefix + "EyeWhite" + str(side),
                (0, 0, 0),
                (0.037, 0.018, 0.019),
                mats["white"],
                c,
                eye,
                28,
                18,
            )
        )
        parts.append(
            oval(
                prefix + "Iris" + str(side),
                (0, 0.016, 0.001),
                (0.016, 0.005, 0.017),
                mats["iris"],
                c,
                eye,
                24,
                14,
            )
        )
        parts.append(
            oval(
                prefix + "Pupil" + str(side),
                (0, 0.023, 0.001),
                (0.008, 0.003, 0.012),
                mats["black"],
                c,
                eye,
                20,
                12,
            )
        )
        parts.append(
            oval(
                prefix + "Glint" + str(side),
                (-0.005, 0.026, 0.008),
                (0.004, 0.002, 0.004),
                mats["shine"],
                c,
                eye,
                12,
                8,
            )
        )
        ey = eye.location.y
        upper = [
            local(
                (
                    side * 0.061 + 0.037 * math.cos(a),
                    ey + 0.013 + 0.004 * math.sin(a),
                    1.599 + 0.018 * math.sin(a),
                )
            )
            for a in [i * math.pi / 24 for i in range(25)]
        ]
        lower = [
            local(
                (
                    side * 0.061 + 0.037 * math.cos(a),
                    ey + 0.013 + 0.003 * math.sin(-a),
                    1.599 - 0.018 * math.sin(a),
                )
            )
            for a in [i * math.pi / 24 for i in range(25)]
        ]
        parts.append(
            sweep(prefix + "UpperLid" + str(side), upper, 0.0028, mats["hair"], c, head)
        )
        parts.append(
            sweep(prefix + "LowerLid" + str(side), lower, 0.0024, mats["skin"], c, head)
        )
    return parts


def build_hair(ctx):
    c, ident, mats, head = (
        ctx["collection"],
        ctx["id"],
        ctx["mats"],
        ctx["controls"]["Head"],
    )
    p = ctx["head_pivot"]
    prefix = "DR_" + ident + "_"

    def local(v):
        return (v[0], v[1], v[2] - p)

    style = ctx["style"]
    parts = []
    vertices = []
    faces = []
    N = 56
    R = 14
    for j in range(R + 1):
        t = j / R
        for i in range(N):
            a = math.tau * i / N
            front = math.cos(a)
            bottom = (
                1.67
                if front > 0.4
                else (1.49 if style not in ["bob", "sweep"] else 1.43)
            )
            z = 1.76 + (bottom - 1.76) * t
            noise = (
                (0.007 * math.sin(a * 9 + t * 11) * math.sin(t * math.pi))
                if style == "curls"
                else 0.002 * math.sin(a * 12 + t * 7)
            )
            width, depth = skull_profile(min(z, 1.740), ctx["male"])
            x = (width + 0.011 + noise) * math.sin(a)
            y = (depth + 0.013 + noise) * math.cos(a) - 0.003
            vertices.append(local((x, y, z)))
    for j in range(R):
        for i in range(N):
            a = j * N + i
            b = j * N + (i + 1) % N
            faces.append((a, b, b + N, a + N))
    parts.append(mesh(prefix + "HairCap", vertices, faces, mats["hair"], c, head))
    # Swept strands follow the cap surface and break up the smooth helmet shape.
    for strand in range(38):
        angle = math.tau * strand / 38
        points = []
        for step in range(19):
            t = 0.12 + 0.88 * step / 18
            a = angle + 0.10 * math.sin(t * 3 + strand)
            bottom = (
                1.675
                if math.cos(a) > 0.4
                else (1.49 if style not in ["bob", "sweep"] else 1.435)
            )
            z = 1.755 + (bottom - 1.755) * t
            width, depth = skull_profile(min(z, 1.740), ctx["male"])
            points.append(
                local(
                    (
                        (width + 0.015) * math.sin(a),
                        (depth + 0.017) * math.cos(a) - 0.003,
                        z,
                    )
                )
            )
        radii = [0.001 + 0.003 * math.sin(math.pi * i / 18) ** 0.6 for i in range(19)]
        parts.append(
            sweep(
                prefix + f"HairStrand{strand}",
                points,
                radii,
                mats["hairlight"] if strand % 3 == 0 else mats["hair"],
                c,
                head,
                6,
            )
        )

    def lock(name, points, width):
        path = bezier(points, 22)
        radii = [
            max(0.001, width * math.sin(math.pi * (0.1 + 0.9 * i / 22)) ** 0.6)
            for i in range(23)
        ]
        parts.append(
            sweep(
                prefix + name,
                [local(v) for v in path],
                radii,
                mats["hair"],
                c,
                head,
                10,
                flatten=0.4,
            )
        )

    if style == "bun":
        parts.append(
            oval(
                prefix + "Bun",
                local((0, -0.102, 1.765)),
                (0.076, 0.077, 0.072),
                mats["hair"],
                c,
                head,
                32,
                20,
            )
        )
        for k in range(5):
            points = []
            for i in range(24):
                a = -0.8 + 2.9 * i / 23
                points.append(
                    local(
                        (
                            0.067 * math.sin(a),
                            -0.102 + 0.073 * math.cos(a) * math.cos(k * 0.62),
                            1.765 + 0.065 * math.cos(a) * math.sin(k * 0.62),
                        )
                    )
                )
            parts.append(
                sweep(
                    prefix + f"BunFold{k}", points, 0.004, mats["hairlight"], c, head, 8
                )
            )
        for k in range(5):
            lock(
                f"Fringe{k}",
                [
                    (-0.115, 0.045, 1.713 + k * 0.003),
                    (-0.09, 0.149 + k * 0.002, 1.73),
                    (0.04, 0.146 + k * 0.002, 1.675 - k * 0.003),
                    (0.112, 0.075, 1.638 - k * 0.005),
                ],
                0.009,
            )
        for side in (-1, 1):
            lock(
                "TempleLock" + str(side),
                [
                    (side * 0.125, 0.052, 1.65),
                    (side * 0.16, 0.074, 1.60),
                    (side * 0.115, 0.09, 1.55),
                    (side * 0.14, 0.05, 1.49),
                ],
                0.012,
            )
            for k in range(3):
                lock(
                    f"LooseCurl{side}_{k}",
                    [
                        (side * (0.116 + k * 0.006), 0.06, 1.66),
                        (side * (0.17 + k * 0.004), 0.08, 1.59),
                        (side * 0.12, 0.10, 1.52 - k * 0.008),
                        (side * (0.145 + k * 0.004), 0.05, 1.47 - k * 0.008),
                    ],
                    0.004,
                )
    elif style == "curls":
        for i in range(11):
            a = i * 2.399
            radius = 0.065 + 0.045 * (i % 3) / 2
            center = (
                radius * math.cos(a),
                radius * math.sin(a) - 0.01,
                1.724 + 0.012 * (i % 2),
            )
            parts.append(
                oval(
                    prefix + f"CurlMass{i}",
                    local(center),
                    (0.051, 0.048, 0.040),
                    mats["hairlight"] if i % 4 == 0 else mats["hair"],
                    c,
                    head,
                    16,
                    10,
                )
            )
        lock(
            "CurlyFringe",
            [
                (-0.115, 0.06, 1.71),
                (-0.09, 0.15, 1.71),
                (-0.02, 0.145, 1.63),
                (0.04, 0.12, 1.65),
            ],
            0.024,
        )
    else:
        lock(
            "SidePart",
            [
                (-0.12, 0.025, 1.705),
                (-0.09, 0.155, 1.741),
                (0.035, 0.154, 1.69),
                (0.119, 0.07, 1.64),
            ],
            0.027,
        )
        if style in ["bob", "sweep"]:
            for side in (-1, 1):
                for i in range(3):
                    x = side * (0.124 + 0.007 * i)
                    y = 0.015 - 0.035 * i
                    lock(
                        f"Bob{side}_{i}",
                        [
                            (x, y, 1.67),
                            (side * 0.161, y, 1.60),
                            (side * 0.16, y, 1.48),
                            (side * 0.127, y, 1.425 if style == "bob" else 1.485),
                        ],
                        0.025,
                    )
    return parts
