"""Native CPU surface cleanup before UV/Paint; immutable cleaned Hunyuan source.

blender --background --factory-startup --threads 4 --python-exit-code 1
  --python prepare_surface.py -- SOURCE BODY-SURFACE.glb
"""
import hashlib
import argparse
import json
from pathlib import Path
import sys
import time

import bmesh
import bpy
import numpy as np


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def audit(mesh):
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    dots = np.array([float(e.link_faces[0].normal.dot(e.link_faces[1].normal))
                     for e in bm.edges if len(e.link_faces) == 2])
    result = dict(vertices=len(bm.verts), edges=len(bm.edges), polygons=len(bm.faces),
                  boundary_edges=sum(e.is_boundary for e in bm.edges),
                  nonmanifold_edges=sum(not e.is_manifold for e in bm.edges),
                  adjacent_opposing_normal_edges=int((dots < 0).sum()),
                  adjacent_normal_dot_percentiles=np.percentile(dots, [0, 5, 50, 95, 100]).tolist())
    bm.free()
    return result


def coordinates(mesh):
    result = np.empty(len(mesh.vertices)*3, dtype=np.float64)
    mesh.vertices.foreach_get("co", result)
    return result.reshape(-1, 3)


def main():
    stop = Path(__file__).resolve().parents[3] / "work/body-v5-native-stop.request.json"
    if stop.exists():
        raise RuntimeError("CPU batch stop requested at item boundary; inspect confirmed backdrop components before new preparation")
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--prune-pixel-backdrop-proof", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    source, output = args.source.resolve(), args.output.resolve()
    receipt = output.with_suffix(".surface.receipt.json")
    if source == output or output.exists() or receipt.exists():
        raise RuntimeError("Choose new surface output; original assets are immutable")
    source_hash, started = sha256(source), time.time()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError("Expected one cleaned full-body mesh")
    obj = meshes[0]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    before = audit(obj.data)
    removed_artifacts = []
    if args.prune_pixel_backdrop_proof:
        # Explicit root-approved Pixel-only deletion. Match the immutable source
        # hash and all8 exact slab vertices, not a generic component heuristic.
        proof = json.loads(args.prune_pixel_backdrop_proof.read_text(encoding="utf-8"))["pixel"]
        if source.parent.name != "pixel" or proof["source_sha256"] != source_hash:
            raise RuntimeError("Pixel backdrop proof/source mismatch")
        candidates = proof["backdrop_candidates"]
        if len(candidates) != 1 or candidates[0]["vertices"] != 8 or candidates[0]["triangles"] != 12:
            raise RuntimeError("Expected exactly the root-confirmed8v/12tri Pixel slab")
        artifact = candidates[0]
        # glTF Y-up -> native Blender Z-up after transform_apply.
        expected = {tuple(round(float(x), 6) for x in (v[0], -v[2], v[1])) for v in artifact["exact_vertices"]}
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        target = [v for v in bm.verts if tuple(round(float(c), 6) for c in v.co) in expected]
        faces = {f for v in target for f in v.link_faces}
        if len(target) != 8 or len(faces) != 12 or any(len(f.verts) != 3 or any(v not in target for v in f.verts) for f in faces):
            bm.free()
            raise RuntimeError("Exact slab component topology did not match; nothing pruned")
        native_area = sum(f.calc_area() for f in faces)
        if abs(native_area-artifact["area"]) > 1e-4:
            bm.free()
            raise RuntimeError("Slab area differs from approved proof")
        bmesh.ops.delete(bm, geom=target, context="VERTS")
        bm.to_mesh(obj.data)
        bm.free()
        removed_artifacts.append(dict(reason="Root visually confirmed generated rectangular backdrop slab",
                                      proof_source_sha256=proof["source_sha256"],
                                      proof_receipt_sha256=sha256(args.prune_pixel_backdrop_proof),
                                      source_component=artifact, native_removed_area=native_area))
    after_prune = audit(obj.data)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    welded = audit(obj.data)
    original = coordinates(obj.data)
    modifier = obj.modifiers.new("Remove generated high-frequency surface noise", "SMOOTH")
    modifier.factor = .45
    modifier.iterations = 5
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update()
    after = audit(obj.data)
    smoothed = coordinates(obj.data)
    if len(original) != len(smoothed) or welded["polygons"] != after["polygons"]:
        raise RuntimeError("Smooth unexpectedly changed welded topology")
    displacement = np.linalg.norm(smoothed-original, axis=1)
    old_extent, new_extent = np.ptp(original, axis=0), np.ptp(smoothed, axis=0)
    ratios = new_extent/old_extent
    if np.max(np.abs(ratios-1)) > .03:
        raise RuntimeError("Smooth changed overall extent by more than3%; inspect before export")
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
                             export_animations=False, export_normals=True,
                             export_texcoords=False, export_materials="NONE")
    if sha256(source) != source_hash:
        raise RuntimeError("Source changed during preparation")
    record = dict(status="completed", source=str(source), source_sha256=source_hash,
                  output=str(output), output_sha256=sha256(output),
                  method="Native Blender weld1e-6, recalc normals, Smooth .45x5 before UV/fit/cuts, recalc normals",
                  factor=.45, iterations=5, weld_distance=1e-6,
                  before=before, removed_artifact_components=removed_artifacts,
                  after_artifact_removal=after_prune, after_weld=welded, after=after,
                  bounds_before=[original.min(0).tolist(), original.max(0).tolist()],
                  bounds_after=[smoothed.min(0).tolist(), smoothed.max(0).tolist()],
                  extent_ratios=ratios.tolist(),
                  displacement_percentiles=np.percentile(displacement, [0, 5, 50, 95, 100]).tolist(),
                  topology_after_weld_preserved=True, no_voxel_remesh=True,
                  blender_version=bpy.app.version_string, elapsed_seconds=time.time()-started,
                  gpu_used=False, acceptance="Surface candidate; root owns visual quality review")
    receipt.write_text(json.dumps(record, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print("BODY_SURFACE_READY", json.dumps(record), flush=True)


if __name__ == "__main__":
    main()
