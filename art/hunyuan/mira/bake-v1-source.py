"""Resume UV baking from saved Hunyuan views; no diffusion re-submission."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import types

parser = argparse.ArgumentParser()
for name in ("comfy-root", "paint-root", "source-obj", "views", "output"):
    parser.add_argument("--" + name, required=True, type=Path)
args = parser.parse_args()
sys.argv = [sys.argv[0]]
output = args.output.resolve()
receipt = output.with_suffix(".bake-receipt.json")
assert not output.exists() and not receipt.exists(), "Inspect existing output before retry"
record = {"status": "running", "stage": "resume-bake-only", "diffusion_resubmitted": False,
          "source_obj": str(args.source_obj.resolve()), "views": str(args.views.resolve()),
          "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}

def save():
    receipt.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

save()
try:
    sys.path.insert(0, str(args.comfy_root.resolve()))
    package = types.ModuleType("hy3dpaint")
    package.__path__ = [str(args.paint_root.resolve())]
    sys.modules["hy3dpaint"] = package
    import torch
    free, total = torch.cuda.mem_get_info()
    assert free > 6 * 1024**3, "Need baking allocation and reserve"
    torch.cuda.set_per_process_memory_fraction(4 * 1024**3 / total)
    from hy3dpaint.textureGenPipeline import Hunyuan3DPaintConfig, Hunyuan3DPaintPipeline
    from PIL import Image
    import trimesh
    config = Hunyuan3DPaintConfig(512, [0, 90, 180, 270, 0, 180],
                                [0, 0, 0, 0, 90, -90], [1, .15, .5, .15, .05, .05], 1.1, 2048)
    pipeline = Hunyuan3DPaintPipeline(config)
    pipeline.load_mesh(trimesh.load(str(args.source_obj.resolve()), force="mesh"))
    albedo = [Image.open(args.views / f"albedo-{i}.png") for i in range(6)]
    mr = [Image.open(args.views / f"mr-{i}.png") for i in range(6)]
    texture, mask, texture_mr, mask_mr = pipeline.bake_from_multiview(
        albedo, mr, config.candidate_camera_elevs, config.candidate_camera_azims,
        config.candidate_view_weights)
    texture, texture_mr = pipeline.inpaint(texture, mask, texture_mr, mask_mr, True, "NS")
    pipeline.set_texture_albedo(texture)
    pipeline.set_texture_mr(texture_mr)
    # Installed OpenCV encoder cannot write Cyrillic paths. Keep its output ASCII.
    scratch = Path(tempfile.mkdtemp(prefix="do-reliza-mira-bake-"))
    assert str(scratch).isascii()
    record["scratch"] = str(scratch)
    os.chdir(scratch)  # Installed OBJ converter also writes a fixed temp.glb.
    model = pipeline.save_mesh(str(scratch / "mira-paint-v1.obj"))
    for suffix in (".png", "_metallic.png", "_roughness.png"):
        path = scratch / ("mira-paint-v1" + suffix)
        assert path.is_file() and path.stat().st_size > 100, f"Missing texture {path}"
    shutil.copy2(model, output)
    maps = output.parent / "paint-v1-textures"
    maps.mkdir(exist_ok=False)
    for path in scratch.glob("*.png"):
        shutil.copy2(path, maps / path.name)
    record.update(status="completed", output_sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                  peak_torch_bytes=torch.cuda.max_memory_reserved())
except Exception as exc:
    record.update(status="failed", error=f"{type(exc).__name__}: {exc}")
    raise
finally:
    save()
