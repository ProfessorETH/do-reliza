"""Review-only, topology-preserving Mira hand polish. No production writes."""
import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image
from scipy import sparse
from scipy.ndimage import gaussian_filter, maximum_filter

from glb_support import GLB


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "assets/models/mira.glb"
OUTPUT = ROOT / "work/mira-polish"
EXPECTED = "849a50fb5168020d45247fa0092041d440c991c99eca60acf4fdd72d45789dd6"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def smooth01(t):
    t = np.clip(t, 0, 1)
    return t*t*(3-2*t)


def main():
    global SOURCE, OUTPUT
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT)
    args = parser.parse_args()
    SOURCE, OUTPUT = args.source.resolve(), args.output_dir.resolve()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    assert sha(SOURCE.read_bytes()) == EXPECTED, "Input changed; audit again"
    target = OUTPUT / "mira-hands-candidate.glb"
    assert not target.exists(), "Preserve prior candidate"
    g = GLB(SOURCE)
    m = g.mesh(26)
    vertices = m["local"].astype(float)
    faces = m["faces"].astype(int)
    # Weld adjacency for computation only; original accessor/order/UV stay intact.
    unique, inverse = np.unique(np.round(vertices, 6), axis=0, return_inverse=True)
    wf = inverse[faces]
    edges = np.vstack([wf[:, [0, 1]], wf[:, [1, 2]], wf[:, [2, 0]]])
    edges = np.unique(np.sort(edges, axis=1), axis=0)
    adj = sparse.coo_matrix((np.ones(len(edges)*2),
                            (np.r_[edges[:, 0], edges[:, 1]],
                             np.r_[edges[:, 1], edges[:, 0]])),
                           shape=(len(unique), len(unique))).tocsr()
    adj = sparse.diags(1/np.maximum(1, np.asarray(adj.sum(1)).ravel())) @ adj
    delta = np.zeros_like(vertices)
    hand_blend = np.zeros(len(vertices))
    colors = g.colors(m)
    stats = {}
    for side in ["Left", "Right"]:
        anchor = {}
        for part in ["Wrist", "Forearm"]:
            node = next(i for i, n in enumerate(g.doc["nodes"])
                        if n.get("name") == f"Skin_mira_{side}{part}")
            anchor[part] = g.world(node)[:3, 3]
        wrist = anchor["Wrist"]
        direction = wrist-anchor["Forearm"]
        direction /= np.linalg.norm(direction)
        longitudinal = (vertices-wrist) @ direction
        ids = [i for i, n in enumerate(m["joint_names"])
               if side in n and any(k in n for k in ["Forearm", "Wrist", "Finger", "Thumb"])]
        ownership = np.where(np.isin(m["joints"], ids), m["weights"], 0).sum(1)
        # Keep sleeve/cuff exact; hand deformation starts in the bare forearm.
        # Skin selection is explicit because the shared forearm bone also owns
        # fabric. The wrist bone, weights and its center do not move.
        skin = (colors[:, 0] > 1.35*colors[:, 1]) & (colors[:, 0] > 1.3*colors[:, 2])
        region = (vertices[:, 1] < .84) & (abs(vertices[:, 0]) > .38)
        blend = smooth01((longitudinal+.06)/.095)*smooth01((ownership-.55)/.35)*skin*region
        hand_blend = np.maximum(hand_blend, blend)
        p = unique.copy()
        group_blend = np.zeros(len(unique))
        np.maximum.at(group_blend, inverse, blend)
        # UV seams can sample different texels; geometry must never split there.
        blend = group_blend[inverse]
        hand_blend = np.maximum(hand_blend, blend)
        # Mild native-equivalent Laplacian relaxation, constrained to owned hand.
        for _ in range(3):
            p += .28*group_blend[:, None]*(adj @ p-p)
        smoothed = p[inverse]
        # Reference has thin palms/fingers, not inflated deep mittens. Preserve
        # the extant finger topology; no claim of newly separated five fingers.
        smoothed[:, 2] = .003 + (smoothed[:, 2]-.003)*(1-.35*blend)
        d = (smoothed-vertices)*blend[:, None]
        delta += d
        sel = blend > .01
        stats[side] = dict(wrist=wrist.tolist(), elbow=anchor["Forearm"].tolist(),
                           changed=int(sel.sum()),
                           depth_before=float(np.ptp(vertices[sel, 2])),
                           depth_after=float(np.ptp((vertices+d)[sel, 2])),
                           max_displacement=float(np.linalg.norm(d, axis=1).max()),
                           mean_hand_ownership=float(ownership[sel].mean()))
    # A positional crease cannot be accepted just because topology is retained.
    # Back off locally if a triangle would rotate through its source hemisphere.
    before_cross = np.cross(vertices[faces[:, 1]]-vertices[faces[:, 0]],
                            vertices[faces[:, 2]]-vertices[faces[:, 0]])
    for _ in range(24):
        trial = vertices+delta
        cross = np.cross(trial[faces[:, 1]]-trial[faces[:, 0]],
                         trial[faces[:, 2]]-trial[faces[:, 0]])
        flip = np.einsum("ij,ij->i", before_cross, cross) < 0
        if not flip.any():
            break
        # Backoff also operates on welded groups, including every UV duplicate.
        delta[np.isin(inverse, np.unique(inverse[faces[flip]]))] *= .5
    assert not flip.any(), "Could not preserve original triangle hemispheres"
    changed = np.linalg.norm(delta, axis=1) > 1e-8
    delta[~changed] = 0
    result = (vertices+delta).astype("<f4")
    # Recompute geometric normals with original winding; smooth across UV seams.
    area_normals = np.cross(result[faces[:, 1]]-result[faces[:, 0]],
                            result[faces[:, 2]]-result[faces[:, 0]])
    normals = np.zeros_like(unique)
    for slot in range(3):
        np.add.at(normals, wf[:, slot], area_normals)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-20)
    original_normals = g.accessor(m["primitive"]["attributes"]["NORMAL"])
    affected = np.zeros(len(vertices), dtype=bool)
    affected[faces[changed[faces].any(1)].ravel()] = True
    final_normals = original_normals.copy()
    final_normals[affected] = normals[inverse][affected]
    # Rasterize only owned hand UV triangles. Other body texels remain exact.
    original = g.image(m["primitive"])
    h, w = original.shape[:2]
    mask = np.zeros((h, w), dtype=float)
    uv_pixels = m["uv"]*[w-1, h-1]
    for face in faces[hand_blend[faces].max(1) > 0]:
        uv = uv_pixels[face]
        low = np.maximum(0, np.floor(uv.min(0)).astype(int))
        high = np.minimum([w-1, h-1], np.ceil(uv.max(0)).astype(int))
        if np.any(high < low):
            continue
        x, y = np.meshgrid(np.arange(low[0], high[0]+1)+.5,
                           np.arange(low[1], high[1]+1)+.5)
        den = (uv[1, 1]-uv[2, 1])*(uv[0, 0]-uv[2, 0])+(uv[2, 0]-uv[1, 0])*(uv[0, 1]-uv[2, 1])
        if abs(den) < 1e-8:
            continue
        a = ((uv[1, 1]-uv[2, 1])*(x-uv[2, 0])+(uv[2, 0]-uv[1, 0])*(y-uv[2, 1]))/den
        b = ((uv[2, 1]-uv[0, 1])*(x-uv[2, 0])+(uv[0, 0]-uv[2, 0])*(y-uv[2, 1]))/den
        c = 1-a-b
        valid = (a >= 0) & (b >= 0) & (c >= 0)
        value = np.where(valid, a*hand_blend[face[0]]+b*hand_blend[face[1]]+c*hand_blend[face[2]], 0)
        region = mask[low[1]:high[1]+1, low[0]:high[0]+1]
        np.maximum(region, value, out=region)
    # Two-texel bleed only, to keep mip edges from reintroducing dark skin.
    mask = maximum_filter(mask, size=5)
    luminance = original.mean(2)
    smooth_luma = gaussian_filter(luminance, 2)
    variation = np.clip((smooth_luma-.43)*.22, -.055, .055)
    skin = np.array([.84, .615, .46])[None, None, :]+variation[:, :, None]
    image = np.clip(original*(1-mask[:, :, None])+skin*mask[:, :, None], 0, 1)
    encoded = BytesIO()
    Image.fromarray(np.rint(image*255).astype(np.uint8)).save(encoded, format="PNG")
    binary = bytearray(g.binary)

    def append(data, target_type=None):
        binary.extend(b"\0"*((-len(binary)) % 4))
        index = len(g.doc["bufferViews"])
        view = dict(buffer=0, byteOffset=len(binary), byteLength=len(data))
        if target_type:
            view["target"] = target_type
        g.doc["bufferViews"].append(view)
        binary.extend(data)
        return index

    for name, data in [("POSITION", result), ("NORMAL", final_normals.astype("<f4"))]:
        old = m["primitive"]["attributes"][name]
        accessor = dict(g.doc["accessors"][old])
        accessor["bufferView"] = append(data.tobytes(), 34962)
        accessor.pop("byteOffset", None)
        if name == "POSITION":
            accessor["min"] = result.min(0).tolist()
            accessor["max"] = result.max(0).tolist()
        m["primitive"]["attributes"][name] = len(g.doc["accessors"])
        g.doc["accessors"].append(accessor)
    mat = g.doc["materials"][m["primitive"]["material"]]
    tex = mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    image_id = g.doc["textures"][tex]["source"]
    g.doc["images"][image_id] = dict(bufferView=append(encoded.getvalue()), mimeType="image/png", name="Mira_review_hand_albedo")
    g.doc["buffers"][0]["byteLength"] = len(binary)
    metadata = json.dumps(g.doc, separators=(",", ":")).encode()
    metadata += b" "*((-len(metadata)) % 4)
    binary.extend(b"\0"*((-len(binary)) % 4))
    raw = struct.pack("<III", 0x46546C67, 2, 12+8+len(metadata)+8+len(binary))
    raw += struct.pack("<II", len(metadata), 0x4E4F534A)+metadata
    raw += struct.pack("<II", len(binary), 0x004E4942)+binary
    target.write_bytes(raw)
    indices = np.flatnonzero(changed)
    patch = dict(source_sha256=EXPECTED, node=26, mesh=7,
                 position_indices=indices.tolist(), positions=result[indices].tolist(),
                 normal_indices=np.flatnonzero(affected).tolist(), normals=final_normals[affected].tolist(),
                 preserve=["indices", "UV", "joints", "weights", "animations", "head", "feet"],
                 albedo_file="mira-hands-albedo.png", texture_source=image_id)
    (OUTPUT/"hands-patch.json").write_text(json.dumps(patch, separators=(",", ":")))
    Image.fromarray(np.rint(image*255).astype(np.uint8)).save(OUTPUT/"mira-hands-albedo.png")
    np.savez_compressed(OUTPUT/"hands-review.npz", before=vertices, after=result,
                        faces=faces, blend=hand_blend, uv=m["uv"])
    check = GLB(target).mesh(26)
    assert np.array_equal(check["faces"], m["faces"])
    assert np.array_equal(check["uv"], m["uv"])
    assert np.array_equal(check["joints"], m["joints"])
    assert np.array_equal(check["weights"], m["weights"])
    assert np.array_equal(check["local"][~changed], m["local"][~changed])
    before_cross = np.cross(vertices[faces[:, 1]]-vertices[faces[:, 0]], vertices[faces[:, 2]]-vertices[faces[:, 0]])
    flip = np.einsum("ij,ij->i", before_cross, area_normals) < 0
    receipt = dict(source_sha256=EXPECTED, output_sha256=sha(raw), status="review-only",
                   body_vertices=len(vertices), body_triangles=len(faces), stats=stats,
                   changed_vertices=int(changed.sum()), flipped_triangles=int(flip.sum()),
                   source_unchanged=sha(SOURCE.read_bytes()) == EXPECTED,
                   topology_UV_weights_unchanged=True, outside_hand_positions_exact=True,
                   skin_target_srgb=[.84, .615, .46], albedo_modified_texels=int((mask > 0).sum()),
                   warning="Existing finger topology retained. Does not add separated fingers or new anatomy.",
                   head_and_neck_untouched=True, gpu_used=False)
    (OUTPUT/"hands-candidate.receipt.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
