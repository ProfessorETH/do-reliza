"""Sequential local Hunyuan Paint jobs with one shared diffusion checkpoint.

The installed Paint API has no exposed local MCP node. Only the caller may
schedule this runner, after checking the actual queue and GPU reservations.
No servers, packages, model downloads or foreign-process unloads are performed.

Each body gets a fresh native renderer/ViewProcessor. Only the lazily loaded
multiview diffusion model is shared: MeshRender.load_mesh does not clear its
previous albedo/MR/normal textures, so reusing that renderer is unsafe.
"""

import argparse
import base64
import gc
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import sys
import tempfile
import time
import types
import uuid

GIB = 1024**3
TORCH_CAP = 14 * GIB
NATIVE_HEADROOM = 2 * GIB
RESERVE = 2 * GIB
SETTINGS = {
    "views": 6,
    "view_resolution": 512,
    "texture_resolution": 2048,
    "steps": 15,
    "guidance": 3.0,
    "seed": 24102026,
    "torch_memory_cap_gib": 14,
    "native_headroom_gib": 2,
    "minimum_reserve_gib": 2,
    "camera_azimuths": [0, 90, 180, 270, 0, 180],
    "camera_elevations": [0, 0, 0, 0, 90, -90],
    "view_weights": [1, 0.15, 0.5, 0.15, 0.05, 0.05],
    "ortho_scale": 1.1,
}


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path, data):
    path = Path(path)
    temporary = path.with_name(path.name + ".writing-" + uuid.uuid4().hex)
    temporary.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(temporary, path)


def claim(path, owner):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(owner, stream, indent=2)
        stream.write("\n")


def archive_lock(path, destination, owner):
    actual = json.loads(Path(path).read_text(encoding="utf-8"))
    if actual.get("token") != owner["token"]:
        raise RuntimeError(f"Ownership changed; preserving lock: {path}")
    os.replace(path, destination)


def inspect_manifest(manifest):
    document = json.loads(manifest.read_text(encoding="utf-8-sig"))
    rows = document.get("jobs") if isinstance(document, dict) else document
    if not isinstance(rows, list) or not rows:
        raise ValueError("Manifest must be a nonempty list, or an object with jobs")
    jobs, ids, outputs, sources = [], set(), set(), set()
    for row in rows:
        if not isinstance(row, dict) or not all(
            isinstance(row.get(key), str)
            for key in ("id", "mesh", "reference", "output")
        ):
            raise ValueError("Every job needs string id, mesh, reference and output")
        ident = row["id"]
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,31}", ident) or ident in ids:
            raise ValueError(f"Invalid or duplicate id: {ident}")
        ids.add(ident)
        unwrap = row.get("unwrap", True)
        if not isinstance(unwrap, bool):
            raise ValueError(f"{ident}: unwrap must be a JSON boolean")
        settings = dict(SETTINGS)
        view_resolution = row.get("view_resolution", SETTINGS["view_resolution"])
        steps = row.get("steps", SETTINGS["steps"])
        if type(view_resolution) is not int or view_resolution not in (512, 768):
            raise ValueError(f"{ident}: supported view_resolution is 512 or 768")
        if type(steps) is not int or not 1 <= steps <= 100:
            raise ValueError(f"{ident}: steps must be an integer in [1,100]")
        settings.update(view_resolution=view_resolution, steps=steps)
        if not unwrap:
            settings["unwrap"] = False
        paths = {
            key: (manifest.parent / row[key]).resolve()
            for key in ("mesh", "reference", "output")
        }
        mesh, reference, output = (
            paths[key] for key in ("mesh", "reference", "output")
        )
        if not mesh.is_file() or not reference.is_file():
            raise FileNotFoundError(f"{ident}: mesh/reference must already exist")
        if output.suffix.lower() != ".glb" or output in outputs:
            raise ValueError(f"{ident}: output must be a distinct GLB")
        outputs.add(output)
        sources.update((mesh, reference))
        receipt_path = output.with_suffix(".receipt.json")
        lock_path = output.with_suffix(".paint-owner.lock")
        views = output.parent / (output.stem + "-views")
        if lock_path.exists():
            raise RuntimeError(
                f"{ident}: inspect existing owner before retry: {lock_path}"
            )
        hashes = {"mesh_sha256": sha256(mesh), "reference_sha256": sha256(reference)}
        completed = False
        if receipt_path.exists():
            receipt = json.loads(receipt_path.read_text(encoding="utf-8-sig"))
            if (
                receipt.get("status") != "completed"
                or receipt.get("batch_paint_version") != 1
                or receipt.get("settings") != settings
                or any(receipt.get(key) != value for key, value in hashes.items())
                or not output.is_file()
                or sha256(output) != receipt.get("output_sha256")
            ):
                raise RuntimeError(
                    f"{ident}: existing job is not a verified matching completion; "
                    f"inspect {receipt_path}. No generation retry was submitted."
                )
            completed = True
        elif output.exists() or views.exists():
            raise RuntimeError(
                f"{ident}: existing output/views without receipt; inspect first"
            )
        jobs.append(
            {
                "id": ident,
                **paths,
                **hashes,
                "receipt_path": receipt_path,
                "lock_path": lock_path,
                "views": views,
                "completed": completed,
                "unwrap": unwrap,
                "settings": settings,
            }
        )
    if outputs & sources:
        raise ValueError("A job output would overwrite a source input")
    return jobs


def read_glb(path):
    data = Path(path).read_bytes()
    if len(data) < 28 or struct.unpack_from("<III", data) != (0x46546C67, 2, len(data)):
        raise RuntimeError(f"Invalid GLB header: {path}")
    document, binary, offset = None, None, 12
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        if length % 4 or offset + 8 + length > len(data):
            raise RuntimeError(f"Invalid GLB chunk: {path}")
        if kind == 0x4E4F534A:
            document = json.loads(data[offset + 8 : offset + 8 + length])
        elif kind == 0x004E4942:
            binary = data[offset + 8 : offset + 8 + length]
        offset += 8 + length
    if (
        offset != len(data)
        or document is None
        or binary is None
        or not document.get("meshes")
        or not document.get("images")
        or not document.get("materials")
        or len(document.get("buffers", [])) != 1
        or document["buffers"][0].get("uri")
        or document["buffers"][0].get("byteLength", len(binary) + 1) > len(binary)
    ):
        raise RuntimeError(f"Missing textured mesh data: {path}")
    return document, binary


def embedded_data_image(uri):
    """The installed exporter uses valid PNG data URIs, not external files."""
    match = re.fullmatch(r"data:(image/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)", uri)
    if not match:
        raise RuntimeError("Only self-contained PNG/JPEG data URIs are accepted")
    payload = base64.b64decode(match[2], validate=True)
    if (match[1] == "image/png" and not payload.startswith(b"\x89PNG\r\n\x1a\n")) or (
        match[1] == "image/jpeg" and not payload.startswith(b"\xff\xd8\xff")
    ):
        raise RuntimeError("Embedded image signature does not match MIME type")
    return match[1], payload


def validate_glb(path):
    document, binary = read_glb(path)
    for view in document.get("bufferViews", []):
        if view.get("buffer", 0) != 0 or view.get("byteOffset", 0) + view[
            "byteLength"
        ] > len(binary):
            raise RuntimeError(f"Invalid embedded GLB buffer view: {path}")
    for image in document["images"]:
        if "bufferView" in image:
            if "uri" in image or not 0 <= image["bufferView"] < len(
                document["bufferViews"]
            ):
                raise RuntimeError(f"Invalid embedded image view: {path}")
        elif "uri" in image:
            embedded_data_image(image["uri"])
        else:
            raise RuntimeError(f"Export image has no embedded payload: {path}")


def pack_embedded_images(source, destination):
    """CPU container repair only; image bytes and original BIN stay unchanged."""
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve() or destination.exists():
        raise RuntimeError("Image packing requires a new sibling output")
    validate_glb(source)
    document, original_binary = read_glb(source)
    binary = bytearray(original_binary)
    images = []
    for index, image in enumerate(document["images"]):
        if "uri" not in image:
            continue
        mime, payload = embedded_data_image(image.pop("uri"))
        binary.extend(b"\x00" * (-len(binary) % 4))
        document.setdefault("bufferViews", []).append(
            {"buffer": 0, "byteOffset": len(binary), "byteLength": len(payload)}
        )
        image.update(bufferView=len(document["bufferViews"]) - 1, mimeType=mime)
        binary.extend(payload)
        images.append(
            {
                "index": index,
                "mime_type": mime,
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        )
    document["buffers"][0]["byteLength"] = len(binary)
    text = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode(
        "utf-8"
    )
    text += b" " * (-len(text) % 4)
    binary.extend(b"\x00" * (-len(binary) % 4))
    packed = b"".join(
        (
            struct.pack("<III", 0x46546C67, 2, 28 + len(text) + len(binary)),
            struct.pack("<II", len(text), 0x4E4F534A),
            text,
            struct.pack("<II", len(binary), 0x004E4942),
            binary,
        )
    )
    with destination.open("xb") as stream:
        stream.write(packed)
    validate_glb(destination)
    after, after_binary = read_glb(destination)
    if after_binary[: len(original_binary)] != original_binary:
        raise RuntimeError("Image packing changed the original geometry BIN")
    for image in after["images"]:
        if "uri" in image:
            raise RuntimeError("Canonical output still contains an image URI")
    return {
        "method": "CPU lossless PNG/JPEG data-URI to BIN bufferView packing",
        "source": str(source),
        "destination": str(destination),
        "source_sha256": sha256(source),
        "output_sha256": sha256(destination),
        "original_bin_prefix_sha256": hashlib.sha256(original_binary).hexdigest(),
        "original_geometry_bin_preserved": True,
        "packed_images": images,
        "source_bytes": source.stat().st_size,
        "output_bytes": destination.stat().st_size,
    }


def check_headroom(torch):
    free, total = torch.cuda.mem_get_info()
    own_reserved = torch.cuda.memory_reserved()
    required = max(0, TORCH_CAP - own_reserved) + NATIVE_HEADROOM + RESERVE
    if free < required:
        raise RuntimeError(
            f"Insufficient free VRAM: {free / GIB:.2f} GiB; require {required / GIB:.2f} "
            "including remaining own allocation, native overhead and 2 GiB reserve. "
            "No foreign models were unloaded."
        )
    return {
        "free_bytes": free,
        "total_bytes": total,
        "own_reserved_bytes": own_reserved,
        "required_free_bytes": required,
    }


def restore_owned_vae_for_reuse(shared_model):
    """Restore only our shared VAE before native reference-input device selection.

    Installed Hunyuan chooses input.device from vae.device before encode's
    Accelerate hook runs. Its native end-of-call CPU offload leaves the VAE on
    CPU, so the second call otherwise creates CPU inputs for CUDA weights.
    Keep the installed hook attached; use only the owned module's public .to.
    """
    diffusion = shared_model.pipeline
    vae = diffusion.vae
    execution_device = diffusion._execution_device
    hook = getattr(vae, "_hf_hook", None)
    before = str(vae.device)
    vae.to(execution_device)
    if diffusion.vae is not vae or getattr(vae, "_hf_hook", None) is not hook:
        raise RuntimeError("Owned VAE/module offload-hook identity changed")
    after = vae.device
    if getattr(after, "type", None) != getattr(execution_device, "type", None) or (
        getattr(execution_device, "index", None) is not None
        and getattr(after, "index", None) != execution_device.index
    ):
        raise RuntimeError("Owned VAE did not move to its pipeline execution device")
    return {
        "applied": True,
        "scope": "Only this process's shared multiview pipeline VAE",
        "public_api": "shared_model.pipeline.vae.to(shared_model.pipeline._execution_device)",
        "execution_device": str(execution_device),
        "vae_device_before": before,
        "vae_device_after": str(after),
        "offload_hook_type": type(hook).__name__ if hook is not None else None,
        "offload_hook_identity_preserved": True,
        "global_or_foreign_model_unload": False,
    }


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    for name in ("comfy-root", "paint-root", "hf-cache"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate files/receipts without importing Torch or running GPU work",
    )
    args = parser.parse_args()
    manifest = args.manifest.resolve()
    args.comfy_root, args.paint_root, args.hf_cache = (
        path.resolve() for path in (args.comfy_root, args.paint_root, args.hf_cache)
    )
    for folder in (args.comfy_root, args.paint_root, args.hf_cache):
        if not folder.is_dir():
            raise FileNotFoundError(folder)
    jobs = inspect_manifest(manifest)
    pending = [job for job in jobs if not job["completed"]]
    print(
        json.dumps(
            {
                "pending": [job["id"] for job in pending],
                "verified_completed": [job["id"] for job in jobs if job["completed"]],
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    if args.check or not pending:
        return
    owner = {
        "token": uuid.uuid4().hex,
        "pid": os.getpid(),
        "started_unix": time.time(),
        "manifest": str(manifest),
    }
    lock = manifest.with_suffix(".paint-batch.lock")
    claim(lock, owner)
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + owner["token"][:8]
    batch_receipt_path = manifest.with_name(
        manifest.stem + ".paint-" + stamp + ".receipt.json"
    )
    batch = {
        "status": "preflight",
        "owner": owner,
        "manifest_sha256": sha256(manifest),
        "settings": SETTINGS,
        "job_settings": {job["id"]: job["settings"] for job in jobs},
        "results": [],
        "script_sha256": sha256(__file__),
    }
    write_json(batch_receipt_path, batch)
    # Comfy's imports parse sys.argv. This remains a direct installed API call.
    sys.argv = [sys.argv[0]]
    os.environ.update(
        HF_HUB_CACHE=str(args.hf_cache),
        HF_HUB_OFFLINE="1",
        TRANSFORMERS_OFFLINE="1",
        HF_HUB_DISABLE_TELEMETRY="1",
    )
    original_directory = Path.cwd()
    try:
        sys.path.insert(0, str(args.comfy_root))
        package = types.ModuleType("hy3dpaint")
        package.__path__ = [str(args.paint_root)]
        sys.modules["hy3dpaint"] = package
        import torch

        check_headroom(torch)  # Initially requires at least 18 GiB free.
        torch.cuda.set_per_process_memory_fraction(
            TORCH_CAP / torch.cuda.mem_get_info()[1]
        )
        from hy3dpaint.textureGenPipeline import (
            Hunyuan3DPaintConfig,
            Hunyuan3DPaintPipeline,
        )
        import numpy as np
        import trimesh
        from PIL import Image

        shared_model = None
        for job in pending:
            batch.update(status="running", current_id=job["id"])
            write_json(batch_receipt_path, batch)
            job["output"].parent.mkdir(parents=True, exist_ok=True)
            claim(job["lock_path"], owner)
            record = {
                "batch_paint_version": 1,
                "status": "preflight",
                "owner": owner,
                "batch_receipt": str(batch_receipt_path),
                "started_unix": time.time(),
                "method": "Installed local Hunyuan3D2.1 Paint API, offline; shared diffusion model, fresh renderer per body",
                "mesh": str(job["mesh"]),
                "reference": str(job["reference"]),
                "mesh_sha256": job["mesh_sha256"],
                "reference_sha256": job["reference_sha256"],
                "output": str(job["output"]),
                "settings": job["settings"],
                "prompt": "high quality",
                "prompt_source": "Installed textureGenPipeline.py hardcoded image_caption",
                "source_package": str(args.paint_root),
                "installed_pipeline_sha256": sha256(
                    args.paint_root / "textureGenPipeline.py"
                ),
                "installed_renderer_sha256": sha256(
                    args.paint_root / "DifferentiableRenderer/MeshRender.py"
                ),
                "installed_diffusion_pipeline_sha256": sha256(
                    args.paint_root / "hunyuanpaintpbr/pipeline.py"
                ),
                "installed_multiview_loader_sha256": sha256(
                    args.paint_root / "utils/multiview_utils.py"
                ),
                "script_sha256": sha256(__file__),
                "scope": "Texture candidate; not rigged or approved for the game",
            }
            pipeline = None

            def save(stage):
                record["status"] = stage
                write_json(job["receipt_path"], record)
                print("PAINT_BATCH_STAGE", job["id"], stage, flush=True)

            try:
                record["resource_preflight"] = check_headroom(torch)
                torch.cuda.reset_peak_memory_stats()
                save("preflight")
                config = Hunyuan3DPaintConfig(
                    job["settings"]["view_resolution"],
                    job["settings"]["camera_azimuths"],
                    job["settings"]["camera_elevations"],
                    job["settings"]["view_weights"],
                    job["settings"]["ortho_scale"],
                    job["settings"]["texture_resolution"],
                )
                pipeline = Hunyuan3DPaintPipeline(config)
                pipeline.model = shared_model
                mesh = trimesh.load(
                    str(job["mesh"]), force="mesh", process=job["unwrap"]
                )
                if not job["unwrap"]:
                    uv = getattr(mesh.visual, "uv", None)
                    if (
                        uv is None or len(uv) != len(mesh.vertices)
                        or not np.isfinite(uv).all()
                        or np.min(uv) < -1e-6 or np.max(uv) > 1.000001
                    ):
                        raise ValueError("unwrap=False requires finite UV0 within [0,1]")
                with Image.open(job["reference"]) as image:
                    reference = image.copy()
                if shared_model is not None:
                    record["resource_before_owned_vae_restore"] = check_headroom(torch)
                    record["owned_vae_reuse"] = restore_owned_vae_for_reuse(shared_model)
                else:
                    record["owned_vae_reuse"] = {
                        "applied": False,
                        "reason": "First item; native API loads a fresh model on its execution device",
                    }
                save("generation")
                albedo, mr, _normals, _positions = pipeline(
                    mesh=mesh,
                    image_path=reference,
                    num_steps=job["settings"]["steps"],
                    guidance_scale=job["settings"]["guidance"],
                    unwrap=job["unwrap"],
                    seed=job["settings"]["seed"],
                )
                shared_model = pipeline.model
                record["owned_vae_after_generation"] = {
                    "vae_device": str(shared_model.pipeline.vae.device),
                    "execution_device": str(shared_model.pipeline._execution_device),
                    "offload_hook_type": type(getattr(shared_model.pipeline.vae, "_hf_hook", None)).__name__,
                }
                if len(albedo) != 6 or len(mr) != 6:
                    raise RuntimeError("Expected exactly six albedo and six MR views")
                job["views"].mkdir(exist_ok=False)
                record["views_directory"] = str(job["views"])
                for label, images in (("albedo", albedo), ("mr", mr)):
                    for index, image in enumerate(images):
                        image.save(job["views"] / f"{label}-{index}.png")
                # Preserve the exact unwrapped mesh, not an independently re-unwrapped
                # approximation, so a later bake-only recovery needs no new diffusion.
                v, f, uv, uvf = pipeline.render.get_mesh(normalize=False)
                uv_resume = job["views"] / "renderer-uv-mesh.npz"
                np.savez_compressed(uv_resume, vertices=v, faces=f, uv=uv, uv_faces=uvf)
                record["renderer_uv_mesh"] = str(uv_resume)
                record["renderer_uv_mesh_sha256"] = sha256(uv_resume)
                record["views_sha256"] = {
                    file.name: sha256(file)
                    for file in sorted(job["views"].glob("*.png"))
                }
                save("views_saved")
                record["resource_before_bake"] = check_headroom(torch)
                save("baking")
                texture, mask, texture_mr, mask_mr = pipeline.bake_from_multiview(
                    albedo,
                    mr,
                    config.candidate_camera_elevs,
                    config.candidate_camera_azims,
                    config.candidate_view_weights,
                )
                save("inpainting")
                texture, texture_mr = pipeline.inpaint(
                    texture, mask, texture_mr, mask_mr, True, "NS"
                )
                pipeline.set_texture_albedo(texture)
                pipeline.set_texture_mr(texture_mr)
                scratch = Path(tempfile.mkdtemp(prefix="do-reliza-body-paint-"))
                if not str(scratch).isascii():
                    raise RuntimeError(
                        "Installed exporter requires an ASCII staging path"
                    )
                record["export_staging"] = str(scratch)
                save("exporting")
                os.chdir(scratch)  # Installed converter also writes a fixed temp.glb.
                try:
                    result = Path(pipeline.save_mesh(str(scratch / "paint.obj")))
                except Exception as error:
                    # Some exporter revisions print a non-ASCII status after saving.
                    # Recover only this run's structurally complete GLB, never rerender.
                    result = scratch / "paint.glb"
                    validate_glb(result)
                    record["recovered_export_exception"] = (
                        f"{type(error).__name__}: {error}"
                    )
                finally:
                    os.chdir(original_directory)
                validate_glb(result)
                canonical_result = scratch / "paint-embedded.glb"
                record["embedded_image_packing"] = pack_embedded_images(
                    result, canonical_result
                )
                result = canonical_result
                record["post_export_free_bytes"] = torch.cuda.mem_get_info()[0]
                if record["post_export_free_bytes"] < RESERVE:
                    raise RuntimeError(
                        "Free VRAM fell below the 2 GiB reserve; preserving the "
                        "completed staging GLB for inspection, not rerendering"
                    )
                if job["output"].exists():
                    raise RuntimeError(
                        "Output appeared during generation; preserving both owners' files"
                    )
                staging_copy = job["output"].with_name(
                    job["output"].name + ".pending-" + owner["token"]
                )
                shutil.copy2(result, staging_copy)
                os.replace(staging_copy, job["output"])
                record.update(
                    output_sha256=sha256(job["output"]),
                    output_bytes=job["output"].stat().st_size,
                    peak_torch_bytes=torch.cuda.max_memory_reserved(),
                    finished_unix=time.time(),
                    diffusion_retries=0,
                )
                save("completed")
                archive_lock(
                    job["lock_path"],
                    job["lock_path"].with_suffix(".receipt.json"),
                    owner,
                )
                batch["results"].append(
                    {
                        "id": job["id"],
                        "status": "completed",
                        "receipt": str(job["receipt_path"]),
                    }
                )
                write_json(batch_receipt_path, batch)
            except Exception as error:
                record.update(
                    failed_stage=record["status"],
                    error=f"{type(error).__name__}: {error}",
                    finished_unix=time.time(),
                    retry_policy="Inspect preserved owner/receipt/views; never automatically rerun diffusion",
                )
                save("failed")
                raise
            finally:
                os.chdir(original_directory)
                if pipeline is not None:
                    # Release only this item's renderer/UV tensors. The shared model
                    # remains strongly referenced; no global model-unload API is used.
                    pipeline.model = None
                    pipeline = None
                mesh = reference = albedo = mr = _normals = _positions = None
                texture = mask = texture_mr = mask_mr = None
                gc.collect()
        batch.update(status="completed", finished_unix=time.time())
        write_json(batch_receipt_path, batch)
        archive_lock(
            lock, lock.with_name(lock.stem + "." + stamp + ".owner.json"), owner
        )
    except Exception as error:
        batch.update(
            status="failed",
            error=f"{type(error).__name__}: {error}",
            finished_unix=time.time(),
        )
        write_json(batch_receipt_path, batch)
        raise
    finally:
        os.chdir(original_directory)


if __name__ == "__main__":
    main()
