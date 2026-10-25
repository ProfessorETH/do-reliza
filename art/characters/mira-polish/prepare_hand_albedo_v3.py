"""Colour-only constrained skin cleanup; preserves all pixels outside its ROI."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, minimum_filter

from glb_support import GLB


ROOT = Path(__file__).resolve().parents[3]
EXPECTED = "849a50fb5168020d45247fa0092041d440c991c99eca60acf4fdd72d45789dd6"


def smooth01(value):
    t = np.clip(value, 0, 1)
    return t*t*(3-2*t)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=ROOT/"work/mira-polish/before.glb")
    parser.add_argument("--base-albedo", type=Path, default=ROOT/"work/mira-polish/mira-hands-albedo.png")
    parser.add_argument("--output-dir", type=Path, default=ROOT/"work/mira-polish/handv3")
    parser.add_argument("--paint-neck-cloth", action="store_true")
    parser.add_argument("--neck-spatial", action="store_true",
                        help="Repaint the whole old upper-chest cutout, regardless of baked hue")
    args = parser.parse_args()
    out = args.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    target = out/"mira-hands-albedo.png"
    assert not target.exists(), "Preserve prior colour candidate"
    g = GLB(args.source)
    assert hashlib.sha256(g.raw).hexdigest() == EXPECTED
    m = g.mesh(26)
    p, faces = m["local"], m["faces"]
    colors = g.colors(m)
    # Warm painted skin has R/G >1.35; knitted olive cuffs are close to 1.
    skin = smooth01((colors[:, 0]/np.maximum(colors[:, 1], .025)-1.16)/.22)
    ids = [i for i, name in enumerate(m["joint_names"])
           if any(part in name for part in ["Forearm", "Wrist", "Finger", "Thumb"])]
    ownership = np.where(np.isin(m["joints"], ids), m["weights"], 0).sum(1)
    roi = skin*smooth01((ownership-.8)/.18)
    roi *= smooth01((.94-p[:, 1])/.035)*smooth01((abs(p[:, 0])-.33)/.04)
    neck_roi = np.zeros(len(p))
    if args.paint_neck_cloth:
        # Old full-body Paint baked a tan, ragged V-neck below the new real
        # crew-neck. This belongs to the body texture, not the portrait head.
        neck_roi = (np.ones(len(p)) if args.neck_spatial else skin)*smooth01((p[:, 1]-1.275)/.012)
        radius, feather = (.190, .040) if args.neck_spatial else (.16, .025)
        neck_roi *= smooth01((1.365-p[:, 1])/.01)*smooth01((radius-abs(p[:, 0]))/feather)
        neck_roi *= (p[:, 1] < 1.365)
    original_bytes = args.base_albedo.read_bytes()
    base_u8 = np.asarray(Image.open(args.base_albedo).convert("RGB"))
    base = base_u8/255
    h, w = base.shape[:2]
    mask = np.zeros((h, w), dtype=float)
    neck_mask = np.zeros((h, w), dtype=float)
    uv = m["uv"]*[w-1, h-1]
    for face in faces[(roi[faces].max(1) > 0) | (neck_roi[faces].max(1) > 0)]:
        q = uv[face]
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
        value = np.where((a >= 0) & (b >= 0) & (c >= 0), a*roi[face[0]]+b*roi[face[1]]+c*roi[face[2]], 0)
        patch = mask[lo[1]:hi[1]+1, lo[0]:hi[0]+1]
        np.maximum(patch, value, out=patch)
        neck_value = np.where((a >= 0) & (b >= 0) & (c >= 0), a*neck_roi[face[0]]+b*neck_roi[face[1]]+c*neck_roi[face[2]], 0)
        neck_patch = neck_mask[lo[1]:hi[1]+1, lo[0]:hi[0]+1]
        np.maximum(neck_patch, neck_value, out=neck_patch)
    # Normalized convolution stays inside the selected UV islands. It removes
    # fine painted grooves while retaining gentle, broad skin colour volumes.
    support = gaussian_filter(mask, 9)
    broad = gaussian_filter(base.mean(2)*mask, 9)/np.maximum(support, 1e-12)
    selected = minimum_filter(mask, size=7) > .8
    assert selected.any(), "No interior skin texels"
    median = float(np.median(broad[selected]))
    volume = np.clip((broad-median)*.20, -.045, .045)
    cleaned = np.clip(np.array([.84, .615, .46])[None, None, :]+volume[:, :, None], 0, 1)
    result_float = base*(1-mask[:, :, None])+cleaned*mask[:, :, None]
    if args.paint_neck_cloth:
        cloth = np.array([.365, .365, .227])[None, None, :]
        # Keep only broad low-amplitude luminance from the prior neck; the
        # material hue now continues the measured olive chest cloth.
        neck_support = gaussian_filter(neck_mask, 7)
        neck_broad = gaussian_filter(base.mean(2)*neck_mask, 7)/np.maximum(neck_support, 1e-12)
        neck_level = np.median(neck_broad[neck_mask > .8])
        cloth = np.clip(cloth+np.clip((neck_broad-neck_level)*.09, -.018, .018)[:, :, None], 0, 1)
        result_float = result_float*(1-neck_mask[:, :, None])+cloth*neck_mask[:, :, None]
    result = np.rint(np.clip(result_float, 0, 1)*255).astype(np.uint8)
    union = np.maximum(mask, neck_mask)
    assert np.array_equal(result[union == 0], base_u8[union == 0])
    Image.fromarray(result).save(target)
    Image.fromarray(np.rint(mask*255).astype(np.uint8)).save(out/"skin-ROI.png")
    if args.paint_neck_cloth:
        Image.fromarray(np.rint(neck_mask*255).astype(np.uint8)).save(out/"neck-cloth-ROI.png")
    original_luma = base.mean(2)
    final_luma = result.mean(2)/255
    before_hp = original_luma-gaussian_filter(original_luma, 2)
    after_hp = final_luma-gaussian_filter(final_luma, 2)
    # This quantitative value concerns the painted texture, not surface normals.
    report = dict(source_sha256=EXPECTED, base_albedo_sha256=hashlib.sha256(original_bytes).hexdigest(),
                  output_sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
                  status="review-only-colour-v3", modified_texels=int(np.any(result != base_u8, axis=2).sum()),
                  ROI_texels=int((union > 0).sum()), outside_ROI_pixels_exact=True,
                  neck_cloth_ROI_texels=int((neck_mask > 0).sum()),
                  neck_mask_mode="anatomical spatial whole garment" if args.neck_spatial else "skin hue limited",
                  cuff_guard="Original olive-vs-skin hue, arm weights, spatial bounds; no atlas dilation", 
                  high_frequency_luma_RMS_before=float(np.sqrt(np.mean(before_hp[selected]**2))),
                  high_frequency_luma_RMS_after=float(np.sqrt(np.mean(after_hp[selected]**2))),
                  skin_target_srgb=[.84, .615, .46], UV_and_geometry_unchanged=True,
                  limitation="Physical surface grooves and baked normal-map detail remain; this is colour-only.", GPU_used=False)
    (out/"receipt.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report))


if __name__ == "__main__":
    main()
