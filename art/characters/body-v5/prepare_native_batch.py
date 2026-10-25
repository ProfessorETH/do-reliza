"""Two-worker CPU-only native Blender surface/UV preparation for six bodies.

Run with the installed Hunyuan environment Python for actual Trimesh UV checks.
Refuses any pre-existing pending output, receipt or owner lock; never retries.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import subprocess
import threading
import time
import uuid

import numpy as np
import trimesh


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blender", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args()
    root, blender = args.root.resolve(), args.blender.resolve()
    ids = ["pixel", "nord", "echo", "nika", "iskra", "saga"]
    base = root / "art/characters/body-v5"
    for ident in ids:
        folder = base / ident
        if not (folder / "body-clean.glb").is_file():
            raise FileNotFoundError(ident + " cleaned source missing")
        for name in ("body-surface.glb", "body-surface.surface.receipt.json", "body-uv.glb", "body-uv.uv.receipt.json", "body-native.owner.lock"):
            if (folder / name).exists():
                raise RuntimeError(ident + ": inspect existing " + name + "; no retry submitted")
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    owner = dict(token=uuid.uuid4().hex, pid=os.getpid(), scope="CPU native surface/UV six only")
    state = dict(status="running", owner=owner, gpu_used=False, maximum_parallel_blender=2,
                 started_unix=time.time(), jobs={})
    state_path = root / "work" / ("body-v5-native-six-" + stamp + ".receipt.json")
    mutex = threading.Lock()

    def save():
        temporary = state_path.with_suffix(".writing")
        temporary.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, state_path)

    def run(ident):
        folder = base / ident
        record = dict(status="preflight", source_sha256=digest(folder / "body-clean.glb"))
        lock = folder / "body-native.owner.lock"
        with lock.open("x", encoding="utf-8") as stream:
            json.dump(owner, stream)
        with mutex:
            state["jobs"][ident] = record
            save()
        try:
            stages = [
                ("surface", "prepare_surface.py", [folder / "body-clean.glb", folder / "body-surface.glb"]),
                ("uv", "prepare_native_uv.py", [folder / "body-surface.glb", folder / "body-uv.glb", "--method", "smart", "--angle", "66", "--margin", "0.001"]),
            ]
            for stage, script, inputs in stages:
                log = root / "work" / (f"body-v5-native-{stamp}-{ident}-{stage}.log")
                command = [str(blender), "--background", "--factory-startup", "--threads", "4", "--python-exit-code", "1", "--python", str(base / script), "--"] + [str(p) for p in inputs]
                with log.open("x", encoding="utf-8") as stream:
                    process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT,
                                               cwd=root, creationflags=subprocess.CREATE_NO_WINDOW)
                    with mutex:
                        record.update(status=stage, current_pid=process.pid)
                        record[stage + "_log"] = str(log.relative_to(root))
                        save()
                    code = process.wait()
                if code:
                    raise RuntimeError(f"Native {stage} failed exit{code}; see {log.name}")
            uv_path = folder / "body-uv.glb"
            receipt = json.loads(uv_path.with_suffix(".uv.receipt.json").read_text(encoding="utf-8"))
            assert receipt["status"] == "completed" and digest(uv_path) == receipt["output_sha256"]
            assert receipt["source_sha256"] == digest(folder / "body-surface.glb")
            qc = receipt["roundtrip_uv"]
            assert qc["coverage_fraction"] >= .25 and qc["overlap_fraction"] < .01
            mesh = trimesh.load(str(uv_path), force="mesh", process=False)
            uv = getattr(mesh.visual, "uv", None)
            if uv is None or len(uv) != len(mesh.vertices) or not np.isfinite(uv).all() or uv.min() < -1e-6 or uv.max() > 1.000001:
                raise RuntimeError("Actual installed Trimesh lost/invalidated UV0; not ready for Paint")
            loader_qc = dict(status="completed", mesh_sha256=digest(uv_path),
                             loader="trimesh.load(force=mesh, process=False)",
                             trimesh_version=trimesh.__version__, visual=type(mesh.visual).__name__,
                             vertices=len(mesh.vertices), triangles=len(mesh.faces), uv_shape=list(uv.shape),
                             uv_min=float(uv.min()), uv_max=float(uv.max()), gpu_used=False)
            uv_path.with_suffix(".trimesh.receipt.json").write_text(json.dumps(loader_qc, indent=2)+"\n", encoding="utf-8")
            with mutex:
                record.update(status="completed", uv_sha256=digest(uv_path), uv_qc=qc, trimesh=loader_qc)
                record.pop("current_pid", None)
                save()
            lock.rename(lock.with_name("body-native.owner.completed-" + stamp + ".json"))
            print("CPU_NATIVE_READY", ident, json.dumps(qc), flush=True)
            return True
        except Exception as error:
            # Archive only outputs created by this claimed attempt. Sources and
            # successful body-surface stay immutable; rejected UV is never used.
            rejected = []
            for name in ("body-uv.glb", "body-uv.uv.receipt.json", "body-uv.trimesh.receipt.json"):
                path = folder / name
                if path.exists():
                    target = path.with_name(path.stem + ".rejected-" + stamp + path.suffix)
                    path.rename(target)
                    rejected.append(str(target.relative_to(root)))
            with mutex:
                record.update(status="failed", error=f"{type(error).__name__}: {error}", rejected=rejected)
                record.pop("current_pid", None)
                save()
            lock.rename(lock.with_name("body-native.owner.failed-" + stamp + ".json"))
            print("CPU_NATIVE_FAILED", ident, record["error"], flush=True)
            return False

    save()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, ids))
    state.update(status="completed" if all(results) else "completed_with_rejections", finished_unix=time.time())
    save()
    if all(results):
        manifest = root / "work/body-v5-paint-uv-six.json"
        rows = [dict(id=ident, mesh=f"../art/characters/body-v5/{ident}/body-uv.glb",
                     reference=f"../art/characters/body-v5/references/{ident}-full-front-v1.png",
                     output=f"../art/characters/body-v5/{ident}/body-painted-uv.glb",
                     unwrap=False, view_resolution=768, steps=30) for ident in ids]
        with manifest.open("x", encoding="utf-8") as stream:
            stream.write(json.dumps(rows, indent=2)+"\n")
        print("CPU_NATIVE_SIX_MANIFEST_READY", manifest, flush=True)
    raise SystemExit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
