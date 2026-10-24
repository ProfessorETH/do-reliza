"""CPU high-to-low tangent normal sample; original geometry/UV/albedo stay intact.

blender --background --factory-startup --python bake_normals.py -- HIGH LOW OUTPUT
Optional arguments: --size 2048 --cage .008 --ray .02 --strength .55 --force.
Only OUTPUT.glb, OUTPUT.blend and OUTPUT.receipt.json are written. The high mesh
is not retained in the sample BLEND; its original source and hash are recorded.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import time

import bpy
import bmesh
import numpy as np


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(path):
    data = path.read_bytes()
    assert struct.unpack_from("<III", data, 0)[:2] == (0x46546C67, 2), "Expected GLB2"
    offset, document, binary = 12, None, None
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        payload = data[offset + 8 : offset + 8 + length]
        if kind == 0x4E4F534A:
            document = json.loads(payload)
        elif kind == 0x004E4942:
            binary = payload
        offset += 8 + length
    assert document is not None and binary is not None, "Missing GLB chunks"
    return document, binary


def write_glb(path, document, binary):
    text = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    text += b" " * (-len(text) % 4)
    binary += b"\x00" * (-len(binary) % 4)
    path.write_bytes(
        struct.pack("<III", 0x46546C67, 2, 28 + len(text) + len(binary))
        + struct.pack("<II", len(text), 0x4E4F534A)
        + text
        + struct.pack("<II", len(binary), 0x004E4942)
        + binary
    )


def embedded_image(document, binary, image_index):
    image = document["images"][image_index]
    view = document["bufferViews"][image["bufferView"]]
    offset = view.get("byteOffset", 0)
    return binary[offset : offset + view["byteLength"]]


def material_image_index(document, texture_info):
    texture = document["textures"][texture_info["index"]]
    return texture["source"]


def import_one(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    parts = [obj for obj in set(bpy.data.objects) - before if obj.type == "MESH"]
    assert len(parts) == 1, f"{path.name}: unexpected mesh count {len(parts)}"
    obj = parts[0]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = name
    return obj


def mesh_fingerprints(obj):
    positions = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("co", positions)
    uv = np.empty(len(obj.data.loops) * 2, dtype=np.float32)
    obj.data.uv_layers.active.data.foreach_get("uv", uv)
    return {
        "positions_sha256": sha256(positions.tobytes()),
        "uv_sha256": sha256(uv.tobytes()),
        "vertices": len(obj.data.vertices),
        "loops": len(obj.data.loops),
        "triangles": sum(len(face.vertices) - 2 for face in obj.data.polygons),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("high", type=Path)
    parser.add_argument("low", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--size", type=int, default=2048)
    parser.add_argument("--cage", type=float, default=0.008)
    parser.add_argument("--ray", type=float, default=0.02)
    parser.add_argument("--strength", type=float, default=0.55)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    high_path, low_path, output = [
        path.resolve() for path in (args.high, args.low, args.output)
    ]
    assert high_path.is_file() and low_path.is_file(), "Missing source"
    assert output != high_path and output != low_path, "Sources are immutable"
    assert output.name == "head-normal-sample.glb", (
        "Only the explicitly scoped sample output is allowed"
    )
    assert (
        args.size in (1024, 2048)
        and 0 < args.cage < args.ray < 0.1
        and 0 < args.strength <= 1
    )
    receipt_path = output.with_suffix(".receipt.json")
    if not args.force:
        assert not any(
            path.exists()
            for path in (output, output.with_suffix(".blend"), receipt_path)
        ), "Inspect the previous sample before retrying"
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    high_hash, low_hash = sha256(high_path.read_bytes()), sha256(low_path.read_bytes())
    record = {
        "status": "preflight",
        "high_source": str(high_path),
        "low_source": str(low_path),
        "high_sha256": high_hash,
        "low_sha256": low_hash,
        "blender": bpy.app.version_string,
        "method": "Native Blender CPU Cycles selected-to-active tangent normal bake; no generation",
        "settings": {
            "size": args.size,
            "cage_extrusion": args.cage,
            "max_ray_distance": args.ray,
            "normal_strength": args.strength,
            "normal_space": "TANGENT",
            "green_axis": "+Y",
            "high_weld": 0.00001,
            "high_smooth_factor": 0.16,
            "high_smooth_iterations": 2,
            "samples": 1,
            "cpu_threads": min(12, os.cpu_count() or 8),
        },
        "stages_seconds": {},
    }

    def save(stage):
        record["status"] = stage
        record["elapsed_seconds"] = round(time.monotonic() - started, 3)
        receipt_path.write_text(
            json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print("NORMAL_SAMPLE_STAGE", stage, record["elapsed_seconds"], flush=True)

    save("importing_high")
    try:
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        high = import_one(high_path, "PortraitHead_HighNormalSource")
        record["original_high_vertices"] = len(high.data.vertices)
        record["original_high_triangles"] = sum(
            len(face.vertices) - 2 for face in high.data.polygons
        )
        save("preparing_high")
        stage = time.monotonic()
        bm = bmesh.new()
        bm.from_mesh(high.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(high.data)
        bm.free()
        smooth = high.modifiers.new("Match clean shape smoothing", "SMOOTH")
        smooth.factor = 0.16
        smooth.iterations = 2
        bpy.ops.object.modifier_apply(modifier=smooth.name)
        for face in high.data.polygons:
            face.use_smooth = True
        high.data.update()
        record["prepared_high_vertices"] = len(high.data.vertices)
        record["prepared_high_triangles"] = sum(
            len(face.vertices) - 2 for face in high.data.polygons
        )
        record["stages_seconds"]["prepare_high"] = round(time.monotonic() - stage, 3)
        save("importing_low")
        low = import_one(low_path, "PortraitHead_NormalSample")
        assert low.data.uv_layers.active is not None, (
            "Low target needs its accepted UV map"
        )
        assert len(low.data.materials) == 1, "Inspect an unexpected low material split"
        protected = mesh_fingerprints(low)
        record["low_geometry"] = protected
        material = low.data.materials[0]
        assert material.use_nodes
        nodes, links = material.node_tree.nodes, material.node_tree.links
        pbr = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
        color_link = next(iter(pbr.inputs["Base Color"].links), None)
        assert color_link and color_link.from_node.type == "TEX_IMAGE", (
            "Expected accepted albedo image"
        )
        albedo = color_link.from_node.image
        original_albedo_pixels = np.empty(
            albedo.size[0] * albedo.size[1] * 4, dtype=np.float32
        )
        albedo.pixels.foreach_get(original_albedo_pixels)
        record["albedo_pixels_sha256"] = sha256(original_albedo_pixels.tobytes())
        source_doc, source_bin = read_glb(low_path)
        source_material = next(
            mat
            for mat in source_doc["materials"]
            if "baseColorTexture" in mat.get("pbrMetallicRoughness", {})
        )
        source_albedo_index = material_image_index(
            source_doc, source_material["pbrMetallicRoughness"]["baseColorTexture"]
        )
        accepted_albedo = embedded_image(source_doc, source_bin, source_albedo_index)
        assert source_doc["images"][source_albedo_index]["mimeType"] == "image/jpeg", (
            "Expected accepted JPEG albedo"
        )
        record["albedo_jpeg_sha256"] = sha256(accepted_albedo)

        normal = bpy.data.images.new(
            "PortraitHead_BakedNormal_2048",
            width=args.size,
            height=args.size,
            alpha=True,
            float_buffer=False,
            is_data=True,
        )
        normal.generated_color = (0.5, 0.5, 1, 0)
        normal.colorspace_settings.name = "Non-Color"
        normal.file_format = "PNG"
        target = nodes.new("ShaderNodeTexImage")
        target.name = "HighToLowNormalBakeTarget"
        target.image = normal
        for node in nodes:
            node.select = False
        target.select = True
        nodes.active = target
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 1
        scene.render.threads_mode = "FIXED"
        scene.render.threads = record["settings"]["cpu_threads"]
        scene.render.bake.use_selected_to_active = True
        scene.render.bake.use_clear = True
        scene.render.bake.margin = 8
        scene.render.bake.cage_extrusion = args.cage
        scene.render.bake.max_ray_distance = args.ray
        scene.render.bake.normal_space = "TANGENT"
        bpy.ops.object.select_all(action="DESELECT")
        high.hide_set(False)
        high.hide_render = False
        high.select_set(True)
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        save("baking")
        stage = time.monotonic()
        bpy.ops.object.bake(
            type="NORMAL",
            normal_space="TANGENT",
            normal_r="POS_X",
            normal_g="POS_Y",
            normal_b="POS_Z",
            use_selected_to_active=True,
            use_clear=True,
            cage_extrusion=args.cage,
            max_ray_distance=args.ray,
            use_cage=False,
        )
        record["stages_seconds"]["bake"] = round(time.monotonic() - stage, 3)
        save("packing")
        values = np.empty(args.size * args.size * 4, dtype=np.float32)
        normal.pixels.foreach_get(values)
        rgba = values.reshape(-1, 4)
        covered = rgba[:, 3] > 0.5
        rgb = rgba[covered, :3]
        assert len(rgb) > args.size * args.size * 0.05, "Reject an empty normal bake"
        vectors = rgb * 2 - 1
        magnitude = np.linalg.norm(vectors, axis=1)
        # Cycles makes the generated target opaque, including UV padding. Alpha is
        # usable for statistics, but does not establish actual UV coverage.
        record["normal_statistics"] = {
            "evaluated_pixels": int(covered.sum()),
            "total_pixels": len(rgba),
            "alpha_is_not_uv_coverage": True,
            "rgb_mean": rgb.mean(axis=0).tolist(),
            "rgb_std": rgb.std(axis=0).tolist(),
            "vector_length_mean": float(magnitude.mean()),
            "negative_z_fraction": float((vectors[:, 2] < 0).mean()),
            "invalid_vector_fraction": float(
                ((magnitude < 0.75) | (magnitude > 1.25)).mean()
            ),
        }
        assert float(rgb[:, :2].std()) > 0.004, "Reject a flat normal map"
        normal.pack()
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.space = "TANGENT"
        normal_map.inputs["Strength"].default_value = args.strength
        links.new(target.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], pbr.inputs["Normal"])
        assert mesh_fingerprints(low) == protected, (
            "Normal bake changed accepted geometry or UVs"
        )
        check_pixels = np.empty_like(original_albedo_pixels)
        albedo.pixels.foreach_get(check_pixels)
        assert np.array_equal(check_pixels, original_albedo_pixels), (
            "Accepted albedo changed"
        )
        albedo.pack()
        bpy.data.objects.remove(high, do_unlink=True)
        bpy.ops.object.select_all(action="DESELECT")
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        bpy.ops.export_scene.gltf(
            filepath=str(output),
            export_format="GLB",
            use_selection=True,
            export_animations=False,
            export_image_format="AUTO",
            export_tangents=True,
        )
        exported, exported_bin = read_glb(output)
        exported_material = next(
            mat for mat in exported["materials"] if "normalTexture" in mat
        )
        albedo_index = material_image_index(
            exported, exported_material["pbrMetallicRoughness"]["baseColorTexture"]
        )
        normal_index = material_image_index(
            exported, exported_material["normalTexture"]
        )
        assert exported["images"][normal_index]["mimeType"] == "image/png", (
            "Normal must be a PNG"
        )
        record["normal_texture_scale_exported"] = exported_material[
            "normalTexture"
        ].get("scale", 1)
        if embedded_image(exported, exported_bin, albedo_index) != accepted_albedo:
            # Native AUTO may recompress a packed JPEG; keep the accepted payload verbatim.
            pad = -len(exported_bin) % 4
            offset = len(exported_bin) + pad
            exported["bufferViews"].append(
                {"buffer": 0, "byteOffset": offset, "byteLength": len(accepted_albedo)}
            )
            exported["images"][albedo_index].update(
                bufferView=len(exported["bufferViews"]) - 1, mimeType="image/jpeg"
            )
            exported_bin += b"\x00" * pad + accepted_albedo
            exported["buffers"][0]["byteLength"] = len(exported_bin)
            write_glb(output, exported, exported_bin)
            record["albedo_payload_restored_after_export"] = True
        else:
            record["albedo_payload_restored_after_export"] = False
        final_doc, final_bin = read_glb(output)
        final_material = next(
            mat for mat in final_doc["materials"] if "normalTexture" in mat
        )
        final_albedo_index = material_image_index(
            final_doc, final_material["pbrMetallicRoughness"]["baseColorTexture"]
        )
        assert (
            embedded_image(final_doc, final_bin, final_albedo_index) == accepted_albedo
        )
        bpy.ops.wm.save_as_mainfile(
            filepath=str(output.with_suffix(".blend")), compress=True
        )
        record["low_geometry_preserved"] = True
        record["low_uvs_preserved"] = True
        record["albedo_preserved_verbatim"] = True
        record["output_bytes"] = output.stat().st_size
        record["blend_bytes"] = output.with_suffix(".blend").stat().st_size
        record["output_sha256"] = sha256(output.read_bytes())
        record["normal_png_sha256"] = sha256(
            embedded_image(
                final_doc,
                final_bin,
                material_image_index(final_doc, final_material["normalTexture"]),
            )
        )
        record["low_source_changed_during_bake"] = (
            sha256(low_path.read_bytes()) != low_hash
        )
        save("completed")
    except Exception as error:
        record["error"] = f"{type(error).__name__}: {error}"
        save("failed")
        raise


if __name__ == "__main__":
    main()
