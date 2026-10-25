"""Pad only the frozen garment neckline colour into its atlas gutters.

Preserves frozen hands, jeans/feet UVs, geometry and all pixels outside the
expanded ROI. Audits every central-neck source vertex with real bilinear UVs.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, maximum_filter

from glb_support import GLB


ROOT = Path(__file__).resolve().parents[3]
EXPECTED = "849a50fb5168020d45247fa0092041d440c991c99eca60acf4fdd72d45789dd6"


def raster_guard(mask, uv, faces):
    h, w = mask.shape
    coordinates = uv*[w, h]
    for face in faces:
        q = coordinates[face]
        lo = np.maximum(0, np.floor(q.min(0)).astype(int))
        hi = np.minimum([w-1, h-1], np.ceil(q.max(0)).astype(int))
        if np.any(hi < lo):
            continue
        x, y = np.meshgrid(np.arange(lo[0], hi[0]+1)+.5, np.arange(lo[1], hi[1]+1)+.5)
        den = (q[1, 1]-q[2, 1])*(q[0, 0]-q[2, 0])+(q[2, 0]-q[1, 0])*(q[0, 1]-q[2, 1])
        if abs(den) < 1e-9:
            continue
        a = ((q[1, 1]-q[2, 1])*(x-q[2, 0])+(q[2, 0]-q[1, 0])*(y-q[2, 1]))/den
        b = ((q[2, 1]-q[0, 1])*(x-q[2, 0])+(q[0, 0]-q[2, 0])*(y-q[2, 1]))/den
        c = 1-a-b
        mask[lo[1]:hi[1]+1, lo[0]:hi[0]+1] |= (a >= 0) & (b >= 0) & (c >= 0)


def bilinear(image, uv):
    h, w = image.shape[:2]
    xy = uv*[w, h]-.5
    lo = np.floor(xy).astype(int)
    fraction = xy-lo
    result = np.zeros((len(uv), 3))
    for dx, dy in [(0, 0), (0, 1), (1, 0), (1, 1)]:
        x = np.clip(lo[:, 0]+dx, 0, w-1)
        y = np.clip(lo[:, 1]+dy, 0, h-1)
        weight = (fraction[:, 0] if dx else 1-fraction[:, 0])*(fraction[:, 1] if dy else 1-fraction[:, 1])
        result += image[y, x]*weight[:, None]
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=ROOT/"work/mira-polish/before.glb")
    parser.add_argument("--base-dir", type=Path, default=ROOT/"work/mira-polish/handv4")
    parser.add_argument("--output-dir", type=Path, default=ROOT/"work/mira-polish/handv5")
    parser.add_argument("--padding", type=int, default=12)
    args = parser.parse_args()
    out = args.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    target = out/"mira-hands-albedo.png"
    assert not target.exists(), "Preserve prior palette candidate"
    assert 8 <= args.padding <= 12
    g = GLB(args.source)
    assert hashlib.sha256(g.raw).hexdigest() == EXPECTED
    body = g.mesh(26)
    base_path = args.base_dir/"mira-hands-albedo.png"
    base_bytes = base_path.read_bytes()
    base = np.asarray(Image.open(base_path).convert("RGB"))
    original_mask = np.asarray(Image.open(args.base_dir/"neck-cloth-ROI.png")) > 0
    hand_mask = np.asarray(Image.open(args.base_dir/"skin-ROI.png")) > 0
    expanded = maximum_filter(original_mask, size=args.padding*2+1)
    # Foot/jeans/bare-arm texels are not garment atlas gutters. Guard their
    # occupancy rather than assuming that neighbouring islands share material.
    guard = np.zeros_like(original_mask)
    v, f = body["local"], body["faces"]
    protected = (v[f, 1] < .95).any(1)
    raster_guard(guard, body["uv"], f[protected])
    for node in [28, 32]:
        foot = g.mesh(node)
        raster_guard(guard, foot["uv"], foot["faces"])
    guard = maximum_filter(guard, size=3) | maximum_filter(hand_mask, size=3)
    allowed = expanded & ~guard
    src = base/255
    support = gaussian_filter(original_mask.astype(float), 7)
    broad = gaussian_filter(src.mean(2)*original_mask, 7)/np.maximum(support, 1e-12)
    level = np.median(broad[original_mask])
    variation = np.clip((broad-level)*.07, -.010, .010)
    cloth = np.clip(np.array([.365, .365, .227])[None, None, :]+variation[:, :, None], 0, 1)
    result = base.copy()
    result[allowed] = np.rint(cloth[allowed]*255).astype(np.uint8)
    assert np.array_equal(result[~expanded], base[~expanded])
    assert np.array_equal(result[guard], base[guard])
    assert np.array_equal(result[hand_mask], base[hand_mask])
    p = body["local"]
    select = (p[:, 1] > 1.30) & (p[:, 1] < 1.345) & (abs(p[:, 0]) < .14)
    selected_uv = body["uv"][select]
    assert len(selected_uv) == 665
    samples = {}
    for scale in [1, 2, 4, 8]:
        im = Image.fromarray(result)
        if scale > 1:
            im = im.resize((im.width//scale, im.height//scale), Image.Resampling.BOX)
        color = bilinear(np.asarray(im)/255, selected_uv)
        ratio = color[:, 0]/np.maximum(color[:, 1], .01)
        samples[str(scale)] = dict(vertices=len(color), tan_R_div_G_above_1_3=int((ratio > 1.3).sum()),
                                   max_R_div_G=float(ratio.max()))
    assert samples["1"]["tan_R_div_G_above_1_3"] == 0, "Unresolved UV gutter leakage"
    Image.fromarray(result).save(target)
    Image.fromarray(allowed.astype(np.uint8)*255).save(out/"neck-expanded-ROI.png")
    Image.fromarray(guard.astype(np.uint8)*255).save(out/"protected-UV.png")
    receipt = dict(version=5, source_sha256=EXPECTED, base_albedo_sha256=hashlib.sha256(base_bytes).hexdigest(),
                   output_sha256=hashlib.sha256(target.read_bytes()).hexdigest(), padding_radius_px=args.padding,
                   original_neck_ROI_texels=int(original_mask.sum()), expanded_ROI_texels=int(expanded.sum()),
                   writable_ROI_texels=int(allowed.sum()), changed_texels=int(np.any(result != base, axis=2).sum()),
                   outside_expanded_ROI_exact=True, hands_exact=True, protected_jeans_feet_bare_arm_exact=True,
                   body_geometry_and_UV_unchanged=True, vertex_bilinear_and_box_mip_QC=samples,
                   GPU_used=False, status="review-only padded neck texture; root front office QA required")
    (out/"receipt.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
