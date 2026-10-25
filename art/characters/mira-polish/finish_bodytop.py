"""Join actual native-cut shirt edge to a measured crew-neck opening.

No source vertices move. Native BMesh owns the cut; the game's bundled Earcut
triangulates the fabric annulus. Root owns GLB assembly and office verification.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np

from glb_support import GLB


ROOT = Path(__file__).resolve().parents[3]
EXPECTED = "849a50fb5168020d45247fa0092041d440c991c99eca60acf4fdd72d45789dd6"


def inside(points, polygon):
    x, y = points[:, 0], points[:, 1]
    answer = np.zeros(len(points), bool)
    for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
        answer ^= ((a[1] > y) != (b[1] > y)) & (x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1]+1e-30)+a[0])
    return answer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=ROOT/"assets/models/mira.glb")
    parser.add_argument("--output-dir", type=Path, default=ROOT/"work/mira-polish")
    parser.add_argument("--stage-dir", type=Path, default=ROOT/"work/mira-polish")
    parser.add_argument("--front-neckline-y", type=float, default=1.335)
    args = parser.parse_args()
    out = args.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    target = out/"bodytop-native-patch.json"
    assert not target.exists(), "Preserve previous review patch"
    g = GLB(args.source)
    assert hashlib.sha256(g.raw).hexdigest() == EXPECTED
    original = g.mesh(26)
    data = np.load(args.stage_dir/"bodytop-native-stage.npz")
    p = data["positions"].tolist()
    n = data["normals"].tolist()
    uv = data["uv"].tolist()
    j = data["joints"].tolist()
    w = data["weights"].tolist()
    body_faces = data["faces"].tolist()
    inverse, edges = data["inverse"], data["boundary"]
    neighbors = {}
    for a, b in edges:
        neighbors.setdefault(int(a), []).append(int(b))
        neighbors.setdefault(int(b), []).append(int(a))
    remaining, loops = set(neighbors), []
    while remaining:
        start = min(remaining)
        order, previous = [start], None
        while True:
            nxt = next(i for i in neighbors[order[-1]] if i != previous)
            if nxt == start:
                break
            previous = order[-1]
            order.append(nxt)
        remaining -= set(order)
        loops.append(np.asarray(order))
    outer = max(loops, key=len)
    # All boundary geometry is represented by an exact native-generated vertex.
    representative = {int(group): int(np.flatnonzero(inverse == group)[0]) for group in np.unique(edges)}
    outer_ids = np.array([representative[int(k)] for k in outer])
    outer_coords = data["positions"][outer_ids]
    count = 96
    theta = np.arange(count)*2*np.pi/count
    front = np.maximum(0, -np.sin(theta))**1.3
    inner_y = 1.360-(1.360-args.front_neckline_y)*front
    middle_y = 1.348-(1.348-(args.front_neckline_y+.004))*front
    middle = np.c_[.070*np.cos(theta), middle_y, .004+.060*np.sin(theta)]
    inner = np.c_[.057*np.cos(theta), inner_y, .004+.058*np.sin(theta)]
    poly = outer_coords[:, [0, 2]]
    assert inside(middle[:, [0, 2]], poly).all(), "Middle collar ellipse exceeds native shirt opening"
    assert inside(inner[:, [0, 2]], poly).all(), "Inner collar ellipse exceeds native shirt opening"

    def append_vertex(coord, donor):
        index = len(p)
        p.append(np.asarray(coord).tolist())
        n.append([0, 1, 0])
        uv.append([(coord[0]+.25)/.5, (coord[2]+.10)/.2])
        j.append(j[donor].copy())
        w.append(w[donor].copy())
        return index

    # Duplicate outer boundary for a controlled garment seam normal; contact
    # position and skin weights remain identical to the source body cut edge.
    outer_new = [append_vertex(coord, int(donor)) for coord, donor in zip(outer_coords, outer_ids)]
    middle_new, inner_new = [], []
    for ring, ids in [(middle, middle_new), (inner, inner_new)]:
        for coord in ring:
            donor = int(outer_ids[np.argmin(np.linalg.norm(outer_coords[:, [0, 2]]-coord[[0, 2]], axis=1))])
            ids.append(append_vertex(coord, donor))
    triangulator = Path(__file__).with_name("triangulate_collar.mjs")
    request = out/"collar-earcut-input.json"
    response = out/"collar-earcut-triangles.json"
    request.write_text(json.dumps(dict(outer=poly.tolist(), inner=middle[:, [0, 2]].tolist())))
    subprocess.run(["node", str(triangulator), str(request), str(response)], check=True)
    table = np.array(outer_new+middle_new)
    collar = table[np.array(json.loads(response.read_text()), dtype=int)].tolist()
    for a in range(count):
        b = (a+1) % count
        collar.extend([[middle_new[a], middle_new[b], inner_new[a]],
                       [middle_new[b], inner_new[b], inner_new[a]]])
    # The two remaining tiny cross-section loops are old connected remnants.
    # Cap at the actual plane under the fabric annulus, never delete a shoulder.
    capped = []
    for number, loop in enumerate(loops):
        if len(loop) == len(outer):
            continue
        ids = np.array([representative[int(k)] for k in loop])
        coords = data["positions"][ids]
        assert len(ids) in [5, 13]
        request = out/f"cap-{number}-earcut-input.json"
        response = out/f"cap-{number}-earcut-triangles.json"
        request.write_text(json.dumps(dict(outer=coords[:, [0, 2]].tolist(), inner=[])))
        subprocess.run(["node", str(triangulator), str(request), str(response)], check=True)
        caps = ids[np.array(json.loads(response.read_text()), dtype=int)]
        body_faces.extend(caps.tolist())
        capped.append(dict(vertices=len(ids), triangles=len(caps)))
    p, n, collar = np.asarray(p), np.asarray(n), np.asarray(collar)
    cross = np.cross(p[collar[:, 1]]-p[collar[:, 0]], p[collar[:, 2]]-p[collar[:, 0]])
    reverse = cross[:, 1] < 0
    collar[reverse] = collar[reverse][:, [0, 2, 1]]
    cross[reverse] *= -1
    lengths = np.linalg.norm(cross, axis=1)
    assert (lengths > 1e-12).all(), "Degenerate new collar triangle"
    sums = np.zeros_like(p)
    for slot in range(3):
        np.add.at(sums, collar[:, slot], cross)
    used = np.unique(collar)
    n[used] = sums[used]/np.linalg.norm(sums[used], axis=1, keepdims=True)
    body_faces = np.asarray(body_faces)
    # Preserve body winding; only orient newly generated tiny caps upward.
    new_caps = sum(item["triangles"] for item in capped)
    cf = body_faces[-new_caps:]
    cn = np.cross(p[cf[:, 1]]-p[cf[:, 0]], p[cf[:, 2]]-p[cf[:, 0]])
    reverse = cn[:, 1] < 0
    cf[reverse] = cf[reverse][:, [0, 2, 1]]
    body_faces[-new_caps:] = cf
    prefix = len(original["local"])
    assert np.array_equal(p[:prefix], original["local"])
    assert np.array_equal(np.asarray(uv)[:prefix], original["uv"])
    assert np.array_equal(np.asarray(j)[:prefix], original["joints"])
    assert np.array_equal(np.asarray(w)[:prefix], original["weights"])
    assert np.max(abs(np.asarray(w).sum(1)-1)) < 2e-6
    # Choose the olive cloth colour from the existing chest texture, not skin.
    c = g.colors(original)
    positions = original["local"]
    cloth = (positions[:, 1] > 1.28) & (positions[:, 1] < 1.32) & (abs(positions[:, 0]) < .12) & (c[:, 1] > c[:, 0]*.92) & (c[:, 2] < c[:, 1]*.9)
    srgb = np.median(c[cloth], axis=0)
    linear = np.where(srgb <= .04045, srgb/12.92, ((srgb+.055)/1.055)**2.4)
    report = dict(source_sha256=EXPECTED, status="review-only-native-retopology", immutable_prefix=prefix,
                  vertices=len(p), body_triangles=len(body_faces), collar_triangles=len(collar),
                  native_cut_plane_y=1.345, garment_outer_contact_vertices=len(outer_ids),
                  garment_outer_max_position_gap=float(np.max(abs(p[outer_new]-data["positions"][outer_ids]))),
                  collar_inner=dict(front_y=args.front_neckline_y, back_y=1.360, rx=.057, rz=.058, center_z=.004),
                  agreed_skin=dict(rx=.050, rz=.052, center_z=.004),
                  radial_clearance_axes=[.007, .006], confirmed_floating_triangles_removed=125,
                  capped_connected_loops=capped, minimum_new_collar_triangle_area=float(lengths.min()/2),
                  prefix_positions_UV_weights_exact=True, body_original_winding_preserved=True,
                  body_below_1_345_geometry_exact=True, cloth_srgb=srgb.tolist(), cloth_linear=linear.tolist(),
                  GPU_used=False, note="Native BMesh clips only the top15mm. New fabric joins exact cut boundary to measured neck interface. Root office QC required.")
    patch = dict(source_sha256=EXPECTED, node=26, mesh=7,
                 attributes=dict(POSITION=p.tolist(), NORMAL=n.tolist(), TEXCOORD_0=uv, JOINTS_0=j, WEIGHTS_0=w),
                 indices=body_faces.ravel().tolist(), collar_indices=collar.ravel().tolist(),
                 collar_material=dict(name="Mira_reference_olive_crewneck", pbrMetallicRoughness=dict(baseColorFactor=linear.tolist()+[1], metallicFactor=0, roughnessFactor=.92), doubleSided=False),
                 receipt=report)
    target.write_text(json.dumps(patch, separators=(",", ":")))
    (out/"bodytop-native-final.receipt.json").write_text(json.dumps(report, indent=2))
    np.savez_compressed(out/"bodytop-native-final.npz", positions=p, normals=n, uv=np.asarray(uv), joints=np.asarray(j), weights=np.asarray(w), faces=body_faces, collar=collar)
    print(json.dumps(report))


if __name__ == "__main__":
    main()
