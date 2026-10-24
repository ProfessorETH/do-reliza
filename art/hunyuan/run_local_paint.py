"""Call the installed Hunyuan 2.1 Paint API for a single owned asset.

Active Comfy servers expose shape nodes but no local Paint nodes. This task
runner calls the already installed package; it does not install nodes, launch
a server, change shared code, or unload any other process's models.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import types
import shutil
import tempfile


def main():
    parser = argparse.ArgumentParser()
    for name in ("comfy-root", "paint-root", "hf-cache", "mesh", "reference", "output"):
        parser.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    # Comfy imports parse sys.argv too. This is an API call, not a Comfy launch.
    sys.argv = [sys.argv[0]]
    output = args.output.resolve()
    receipt_path = output.with_suffix(".receipt.json")
    if receipt_path.exists() or output.exists():
        raise RuntimeError("Output/receipt exists: inspect it before any retry")
    os.environ.update(HF_HUB_CACHE=str(args.hf_cache), HF_HUB_OFFLINE="1",
                      TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1")
    receipt = {"status": "preflight", "started_unix": time.time(),
               "method": "installed Hunyuan3D 2.1 Paint package API, offline",
               "source_package": str(args.paint_root.resolve()),
               "mesh": str(args.mesh.resolve()), "reference": str(args.reference.resolve()),
               "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
               "settings": {"views": 6, "view_resolution": 512, "texture_resolution": 2048,
                            "steps": 15, "guidance": 3.0, "seed": 24102026,
                            "torch_memory_cap_gib": 14},
               "scope": "texture candidate; not rigged or game approved"}

    def save():
        receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    save()
    try:
        sys.path.insert(0, str(args.comfy_root.resolve()))
        package = types.ModuleType("hy3dpaint")
        package.__path__ = [str(args.paint_root.resolve())]
        sys.modules["hy3dpaint"] = package
        import torch
        free, total = torch.cuda.mem_get_info()
        receipt["preflight_free_bytes"] = free
        if free < 18 * 1024**3:
            raise RuntimeError("Need 14 GiB PyTorch, 2 GiB native overhead and 2 GiB reserve")
        torch.cuda.set_per_process_memory_fraction(14 * 1024**3 / total)
        from hy3dpaint.textureGenPipeline import Hunyuan3DPaintConfig, Hunyuan3DPaintPipeline
        import trimesh
        from PIL import Image
        config = Hunyuan3DPaintConfig(512, [0, 90, 180, 270, 0, 180],
                                    [0, 0, 0, 0, 90, -90], [1, .15, .5, .15, .05, .05], 1.1, 2048)
        pipeline = Hunyuan3DPaintPipeline(config)
        mesh = trimesh.load(str(args.mesh), force="mesh")
        reference = Image.open(args.reference)
        receipt["status"] = "running"
        save()
        albedo, mr, _, _ = pipeline(mesh=mesh, image_path=reference, num_steps=15,
                                   guidance_scale=3.0, unwrap=True, seed=24102026)
        # Preserve accepted model outputs so baking can be resumed without re-generation.
        views = output.parent / (output.stem + "-views")
        views.mkdir(exist_ok=False)
        for label, images in (("albedo", albedo), ("mr", mr)):
            for index, img in enumerate(images):
                img.save(views / f"{label}-{index}.png")
        receipt["views_directory"] = str(views)
        receipt["status"] = "baking"
        save()
        texture, mask, texture_mr, mask_mr = pipeline.bake_from_multiview(
            albedo, mr, config.candidate_camera_elevs, config.candidate_camera_azims,
            config.candidate_view_weights)
        texture, texture_mr = pipeline.inpaint(texture, mask, texture_mr, mask_mr, True, "NS")
        pipeline.set_texture_albedo(texture)
        pipeline.set_texture_mr(texture_mr)
        scratch = Path(tempfile.mkdtemp(prefix='do-reliza-paint-'))
        assert str(scratch).isascii(), 'Installed OpenCV exporter needs an ASCII path'
        os.chdir(scratch)
        result = pipeline.save_mesh(str(scratch / 'paint.obj'))
        shutil.copy2(result, output)
        receipt['export_staging'] = str(scratch)
        receipt.update(status="completed", result=result,
                       peak_torch_bytes=torch.cuda.max_memory_reserved(),
                       output_sha256=hashlib.sha256(output.read_bytes()).hexdigest())
    except Exception as exc:
        receipt.update(status="failed", error=f"{type(exc).__name__}: {exc}")
        raise
    finally:
        receipt["finished_unix"] = time.time()
        save()


if __name__ == "__main__":
    main()
