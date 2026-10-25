"""CPU Blender Smart UV preparation; immutable source, new GLB and QC receipt.

blender --background --factory-startup --threads 4 --python THIS -- SOURCE OUTPUT
"""
import hashlib
import argparse
import json
import math
from pathlib import Path
import sys
import time

import bpy
import bmesh
import numpy as np


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def triangle_soup(objects):
    triangles = []
    for obj in objects:
        obj.data.calc_loop_triangles()
        for tri in obj.data.loop_triangles:
            points = [tuple(round(float(c), 6) for c in (obj.matrix_world @ obj.data.vertices[v].co)) for v in tri.vertices]
            # Ignore cyclic corner order, retain orientation.
            points = min(tuple(points[i:] + points[:i]) for i in range(3))
            triangles.append(points)
    return sorted(triangles)


def uv_audit(objects, resolution=512, minimum_coverage=.25, maximum_overlap=.01):
    coverage = np.zeros((resolution, resolution), dtype=np.uint16)
    degenerate = 0
    pixel_tests = 0
    min_uv, max_uv, sum_area = 1.0, 0.0, 0.0
    for obj in objects:
        layer = obj.data.uv_layers.active
        if layer is None:
            raise RuntimeError("Missing UV0")
        obj.data.calc_loop_triangles()
        for tri in obj.data.loop_triangles:
            uv = np.array([layer.data[i].uv[:] for i in tri.loops], dtype=np.float64)
            if not np.isfinite(uv).all():
                raise RuntimeError("Nonfinite UV coordinate")
            if uv.min() < -1e-6 or uv.max() > 1.000001:
                raise RuntimeError("UV coordinate outside [0,1]; refusing unbounded audit")
            min_uv, max_uv = min(min_uv, float(uv.min())), max(max_uv, float(uv.max()))
            a, b = uv[1]-uv[0], uv[2]-uv[0]
            den = a[0]*b[1]-a[1]*b[0]
            sum_area += abs(den)/2
            if abs(den) < 1e-14:
                degenerate += 1
                continue
            v = uv*resolution
            lo = np.maximum(np.floor(v.min(0)).astype(int), 0)
            hi = np.minimum(np.ceil(v.max(0)).astype(int), resolution-1)
            if np.any(hi < lo):
                continue
            pixel_tests += int(np.prod(hi-lo+1))
            if pixel_tests > 20_000_000:
                raise RuntimeError("UV audit exceeded bounded pixel budget; inspect folds before retry")
            yy, xx = np.mgrid[lo[1]:hi[1]+1, lo[0]:hi[0]+1]
            q = np.stack([xx+.5, yy+.5], -1)-v[0]
            a, b = v[1]-v[0], v[2]-v[0]
            den = a[0]*b[1]-a[1]*b[0]
            u = (q[...,0]*b[1]-q[...,1]*b[0])/den
            w = (a[0]*q[...,1]-a[1]*q[...,0])/den
            inside = (u>1e-5)&(w>1e-5)&(u+w<1-1e-5)
            coverage[lo[1]:hi[1]+1, lo[0]:hi[0]+1] += inside
    covered = int((coverage>0).sum())
    overlap = int((coverage>1).sum())
    result = dict(min_uv=min_uv, max_uv=max_uv, summed_uv_area=sum_area,
                  degenerate_triangles=degenerate, audit_resolution=resolution,
                  covered_pixels=covered, coverage_fraction=covered/resolution**2,
                  overlap_pixels=overlap, overlap_fraction=overlap/max(1,covered))
    if degenerate or min_uv < -1e-6 or max_uv > 1.000001 or covered/resolution**2 < minimum_coverage or overlap/max(1,covered) >= maximum_overlap:
        raise RuntimeError("UV bounds/overlap validation failed: " + json.dumps(result))
    return result


def main():
    started = time.time()
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--angle", type=float, default=66)
    parser.add_argument("--margin", type=float, default=.001)
    parser.add_argument("--method", choices=("smart", "silhouette"), default="smart")
    parser.add_argument("--minimum-coverage", type=float, default=.25)
    parser.add_argument("--policy-note", default="Root pilot coverage>=25%, overlap<1%, zero degenerate UV triangles")
    parser.add_argument("--diagnostic-mesh", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    source, output = args.source.resolve(), args.output.resolve()
    receipt = output.with_suffix(".uv.receipt.json")
    if source == output or output.exists() or receipt.exists():
        raise RuntimeError("Native UV preparation requires new outputs")
    source_hash = digest(source)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError("Expected exactly one cleaned mesh; do not silently join/rebuild")
    obj = meshes[0]
    before = triangle_soup(meshes)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for layer in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(layer)
    obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    seam_count = None
    if args.method == "smart":
        bpy.ops.uv.smart_project(angle_limit=math.radians(args.angle), island_margin=args.margin,
                                margin_method="FRACTION", area_weight=0.0,
                                correct_aspect=True, scale_to_bounds=True)
    else:
        # A single front/back split follows the actual character silhouette.
        # This avoids xatlas/SmartProject's thousands of charts on noisy AI
        # normals. Seams only change UV topology, never triangle positions.
        bm = bmesh.from_edit_mesh(obj.data)
        world_y = [(obj.matrix_world @ v.co).y for v in bm.verts]
        plane_y = (min(world_y)+max(world_y))/2
        side = {f: (obj.matrix_world @ f.calc_center_median()).y >= plane_y for f in bm.faces}
        for edge in bm.edges:
            edge.seam = len(edge.link_faces) != 2 or side[edge.link_faces[0]] != side[edge.link_faces[1]]
        seam_count = sum(edge.seam for edge in bm.edges)
        bmesh.update_edit_mesh(obj.data)
        print("NATIVE_UV_STAGE", "silhouette_unwrap", seam_count, flush=True)
        bpy.ops.uv.unwrap(method="ANGLE_BASED", fill_holes=True, correct_aspect=True,
                          margin_method="FRACTION", margin=args.margin)
        # unwrap already packs its UV islands using the requested FRACTION
        # margin. A second pack_islands pass is unnecessary and pathological
        # on these large generated charts, even with convex hull packing.
        print("NATIVE_UV_STAGE", "native_unwrap_packed", flush=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    if args.diagnostic_mesh:
        diagnostic = args.diagnostic_mesh.resolve()
        if diagnostic.exists():
            raise RuntimeError("Diagnostic output exists; no overwrite/retry")
        obj.data.calc_loop_triangles()
        uv_layer = obj.data.uv_layers.active
        positions = np.array([(obj.matrix_world @ v.co)[:] for v in obj.data.vertices], dtype=np.float32)
        faces = np.array([t.vertices[:] for t in obj.data.loop_triangles], dtype=np.int32)
        uv_triangles = np.array([[uv_layer.data[i].uv[:] for i in t.loops] for t in obj.data.loop_triangles], dtype=np.float32)
        np.savez_compressed(diagnostic, positions_blender_world=positions, faces=faces, uv_triangles=uv_triangles)
        diagnostic.with_suffix(".receipt.json").write_text(json.dumps(dict(
            status="diagnostic_saved_before_validation", source=str(source), source_sha256=source_hash,
            diagnostic_sha256=digest(diagnostic), method=args.method, angle=args.angle,
            margin=args.margin, minimum_coverage=args.minimum_coverage, maximum_overlap=.01,
            degenerate_limit=0, policy_note=args.policy_note,
            coordinate_system="Native Blender world XYZ; source glTF heightY maps to worldZ",
            gpu_used=False), indent=2)+"\n", encoding="utf-8")
    print("NATIVE_UV_STAGE", "audit", flush=True)
    uv_result = uv_audit(meshes, minimum_coverage=args.minimum_coverage)
    if triangle_soup(meshes) != before:
        raise RuntimeError("UV preparation modified geometry")
    # Trimesh's supported glTF loader only builds TextureVisuals/UV when the
    # primitive has a material. A plain PBR material is sufficient; no dummy
    # image is needed and geometry/UV coordinates remain unchanged.
    material = bpy.data.materials.new("NativeUV_PaintInput_Neutral")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (.65, .65, .65, 1)
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Roughness"].default_value = .8
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
                             export_animations=False, export_texcoords=True, export_normals=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(output))
    restored = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if triangle_soup(restored) != before or digest(source) != source_hash:
        raise RuntimeError("GLB roundtrip changed triangle positions/source")
    roundtrip_uv = uv_audit(restored, minimum_coverage=args.minimum_coverage)
    record = dict(status="completed", method="Native Blender UV " + args.method + ", CPU; no remesh/reduction",
                  source=str(source), source_sha256=source_hash, output=str(output),
                  output_sha256=digest(output), blender_version=bpy.app.version_string,
                  parameters=dict(angle_degrees=args.angle, island_margin=args.margin, margin_method="FRACTION",
                                  area_weight=0.0, correct_aspect=True, scale_to_bounds=True),
                  silhouette_seam_edges=seam_count,
                  texture_target_resolution=2048, triangles=len(before),
                  geometry_triangle_positions_preserved_6dp=True, uv=uv_result,
                  roundtrip_uv=roundtrip_uv, elapsed_seconds=time.time()-started,
                  paint_unwrap=False, gpu_used=False)
    record["material_policy"] = "Plain neutral PBR primitive material preserves Trimesh UV loading; no placeholder image"
    record["validation_policy"] = dict(minimum_coverage=args.minimum_coverage, maximum_overlap=.01,
                                       degenerate_limit=0, note=args.policy_note)
    receipt.write_text(json.dumps(record, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print("NATIVE_UV_READY", json.dumps(record), flush=True)


if __name__ == "__main__":
    main()
