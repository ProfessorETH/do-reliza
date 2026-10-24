/**
 * Attach one reviewed, static GLB head to the existing office Head bone.
 *
 * No body vertex, weight, bind matrix or animation sample is re-exported. The
 * original BIN remains a verbatim prefix; only old head draw indices are filtered.
 * This deliberately avoids GLTFExporter/Blender resampling the working rig.
 *
 * CLI: node scripts/attach-portrait-head.js --id mira --head path/to/head.glb --blink
 * Review output defaults to art/characters/portrait-v4/assembled/mira.glb.
 * --scale/--eye-ratio/--chin-ratio/--offset-* are art-alignment controls.
 * Optional --blink creates PortraitBlink only when both small front eye patches
 * pass safety checks; its index is node.extras.portraitBlinkMorph. Runtime sets
 * that morph influence to 1 - the existing eye-open blink value.
 * A compressed original JSON chunk makes the unchanged BIN prefix reversible:
 * recoverPortraitBase() restores the exact SHA-checked pre-portrait GLB.
 */
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  Matrix4,
  Matrix3,
  Vector3,
  Quaternion,
  Box3,
} from "../vendor/three/three.module.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const IDS = ["mira", "pixel", "nord", "iskra", "saga", "echo", "nika"];
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPES = {
  5120: { bytes: 1, read: "readInt8", max: 127, signed: true },
  5121: { bytes: 1, read: "readUInt8", max: 255 },
  5122: { bytes: 2, read: "readInt16LE", max: 32767, signed: true },
  5123: { bytes: 2, read: "readUInt16LE", max: 65535 },
  5125: { bytes: 4, read: "readUInt32LE", max: 4294967295 },
  5126: { bytes: 4, read: "readFloatLE" },
};

export function parseGLB(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2)
    throw new Error("Expected a GLB 2.0 file");
  if (bytes.readUInt32LE(8) !== bytes.length)
    throw new Error("Invalid GLB length");
  let json, bin, jsonChunk;
  for (let offset = 12; offset < bytes.length; ) {
    const length = bytes.readUInt32LE(offset),
      type = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + length > bytes.length)
      throw new Error("Truncated GLB chunk");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) {
      json = JSON.parse(data.toString("utf8").trim());
      jsonChunk = data;
    } else if (type === 0x004e4942) bin = data;
    offset += 8 + length;
  }
  if (!json || !bin) throw new Error("GLB must contain JSON and BIN chunks");
  if (json.buffers?.length !== 1 || json.buffers[0].uri)
    throw new Error("Only self-contained, single-buffer GLBs are supported");
  return { json, bin, jsonChunk };
}

/** Recover the exact v3 input even in a fresh clone without ignored work files. */
export function recoverPortraitBase(bytes) {
  const parsed = parseGLB(bytes),
    original = parsed.json.asset.extras?.portraitHeadOriginal;
  if (!original) return bytes;
  const json = gunzipSync(Buffer.from(original.jsonGzip, "base64")),
    bin = parsed.bin.subarray(0, original.binLength),
    header = Buffer.alloc(12),
    jsonHeader = Buffer.alloc(8),
    binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + bin.length, 8);
  jsonHeader.writeUInt32LE(json.length);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(bin.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const restored = Buffer.concat([header, jsonHeader, json, binHeader, bin]);
  if (sha256(restored) !== original.sha256)
    throw new Error("Original portrait base recovery failed its SHA-256 check");
  return restored;
}

export function packGLB(json, binary) {
  const source = Buffer.from(JSON.stringify(json)),
    text = Buffer.concat([
      source,
      Buffer.alloc((4 - (source.length % 4)) % 4, 32),
    ]),
    bin = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4)]),
    header = Buffer.alloc(12),
    jsonHeader = Buffer.alloc(8),
    binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  jsonHeader.writeUInt32LE(text.length);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(bin.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, text, binHeader, bin]);
}

/** Read ordinary/sparse accessors, including normalized integer skin weights. */
export function accessorValues(gltf, bin, index) {
  const accessor = gltf.accessors[index],
    type = TYPES[accessor.componentType],
    size = COMPONENTS[accessor.type];
  if (!type || !size) throw new Error(`Unsupported accessor ${index}`);
  const result = Array.from({ length: accessor.count }, () =>
    Array(size).fill(0),
  );
  const read = (offset) => {
    const value = bin[type.read](offset);
    return accessor.normalized && accessor.componentType !== 5126
      ? Math.max(type.signed ? -1 : 0, value / type.max)
      : value;
  };
  if (accessor.bufferView !== undefined) {
    const view = gltf.bufferViews[accessor.bufferView];
    if ((view.buffer || 0) !== 0)
      throw new Error("External buffers are unsupported");
    const start = (view.byteOffset || 0) + (accessor.byteOffset || 0),
      stride = view.byteStride || size * type.bytes;
    for (let i = 0; i < accessor.count; i++)
      for (let component = 0; component < size; component++)
        result[i][component] = read(
          start + i * stride + component * type.bytes,
        );
  }
  if (accessor.sparse) {
    const { indices, values, count } = accessor.sparse,
      indexType = TYPES[indices.componentType],
      indexView = gltf.bufferViews[indices.bufferView],
      valueView = gltf.bufferViews[values.bufferView],
      io = (indexView.byteOffset || 0) + (indices.byteOffset || 0),
      vo = (valueView.byteOffset || 0) + (values.byteOffset || 0);
    for (let i = 0; i < count; i++) {
      const vertex = bin[indexType.read](io + i * indexType.bytes);
      for (let component = 0; component < size; component++)
        result[vertex][component] = read(
          vo + (i * size + component) * type.bytes,
        );
    }
  }
  return result;
}

function nodeWorlds(gltf) {
  const parents = new Map(),
    worlds = new Map();
  gltf.nodes.forEach((node, index) =>
    (node.children || []).forEach((child) => {
      if (parents.has(child))
        throw new Error("A glTF node cannot have two parents");
      parents.set(child, index);
    }),
  );
  function world(index, visiting = new Set()) {
    if (worlds.has(index)) return worlds.get(index);
    if (visiting.has(index)) throw new Error("Cycle in glTF hierarchy");
    visiting.add(index);
    const node = gltf.nodes[index],
      local = node.matrix
        ? new Matrix4().fromArray(node.matrix)
        : new Matrix4().compose(
            new Vector3(...(node.translation || [0, 0, 0])),
            new Quaternion(...(node.rotation || [0, 0, 0, 1])),
            new Vector3(...(node.scale || [1, 1, 1])),
          );
    const result = parents.has(index)
      ? world(parents.get(index), visiting).clone().multiply(local)
      : local;
    visiting.delete(index);
    worlds.set(index, result);
    return result;
  }
  return world;
}

function sceneMeshes(gltf) {
  const roots = gltf.scenes?.[gltf.scene || 0]?.nodes;
  if (!roots?.length)
    throw new Error("Head GLB needs a nonempty default scene");
  const indices = [],
    seen = new Set();
  function visit(index) {
    if (seen.has(index)) return;
    seen.add(index);
    const node = gltf.nodes[index];
    if (node.skin !== undefined)
      throw new Error("Head must be a static mesh, not another rig");
    if (node.mesh !== undefined) indices.push(index);
    (node.children || []).forEach(visit);
  }
  roots.forEach(visit);
  if (!indices.length) throw new Error("Head scene contains no mesh");
  return indices;
}

function remapMaterialTextures(value, textureOffset, key = "") {
  if (Array.isArray(value))
    return value.map((item) => remapMaterialTextures(item, textureOffset));
  if (!value || typeof value !== "object") return value;
  const copy = {};
  for (const [name, child] of Object.entries(value))
    copy[name] =
      name === "index" && /Texture$/.test(key) && typeof child === "number"
        ? child + textureOffset
        : remapMaterialTextures(child, textureOffset, name);
  return copy;
}

function blinkDeltas(
  source,
  binary,
  nodeIndex,
  meshWorld,
  options,
  targetEyeY,
) {
  const node = source.nodes[nodeIndex],
    mesh = source.meshes[node.mesh],
    eyeX = options.blinkEyeX ?? 0.061,
    eyeY = options.blinkEyeY ?? targetEyeY + (options.offsetY || 0),
    radiusX = options.blinkRadiusX ?? 0.038,
    radiusY = options.blinkRadiusY ?? 0.023,
    depth = options.blinkDepth ?? 0.035,
    strength = options.blinkStrength ?? 0.97,
    centerX = options.offsetX || 0;
  if (
    !(
      eyeX > 0 &&
      radiusX > 0 &&
      radiusY > 0 &&
      depth > 0 &&
      strength > 0 &&
      strength <= 1
    )
  )
    throw new Error("Invalid blink mask settings");
  const inverse = meshWorld.clone().invert(),
    normalMatrix = new Matrix3().getNormalMatrix(meshWorld),
    eyeCandidates = [[], []],
    inverseOrigin = new Vector3().applyMatrix4(inverse),
    rows = [];
  const ellipse = (point, side) =>
    Math.hypot(
      (point.x - centerX - (side ? 1 : -1) * eyeX) / radiusX,
      (point.y - eyeY) / radiusY,
    );
  for (const primitive of mesh.primitives) {
    const positions = accessorValues(
        source,
        binary,
        primitive.attributes.POSITION,
      ),
      normals =
        primitive.attributes.NORMAL === undefined
          ? null
          : accessorValues(source, binary, primitive.attributes.NORMAL),
      world = positions.map((position) =>
        new Vector3(...position).applyMatrix4(meshWorld),
      ),
      front = world.map(
        (_, index) =>
          !normals ||
          new Vector3(...normals[index]).applyMatrix3(normalMatrix).normalize()
            .z < -0.12,
      );
    world.forEach((point, index) => {
      if (!front[index]) return;
      for (let side = 0; side < 2; side++)
        if (ellipse(point, side) < 1) eyeCandidates[side].push(point.z);
    });
    rows.push({ world, front });
  }
  if (eyeCandidates.some((values) => values.length < 4))
    return {
      skipped:
        "Fewer than four front-facing vertices in one eye patch; adjust the optional blink landmarks",
    };
  const frontLimits = eyeCandidates.map((values) => {
      values.sort((a, b) => a - b);
      return values[Math.floor((values.length - 1) * 0.2)] + depth;
    }),
    affected = [0, 0];
  let maxDisplacement = 0;
  const smooth = (value) => {
    value = Math.max(0, Math.min(1, value));
    return value * value * (3 - 2 * value);
  };
  const deltas = rows.map(({ world, front }) => {
    const data = Buffer.alloc(world.length * 12),
      min = [0, 0, 0],
      max = [0, 0, 0];
    world.forEach((point, index) => {
      if (!front[index]) return;
      let influence = 0;
      for (let side = 0; side < 2; side++) {
        const distance = ellipse(point, side);
        if (distance >= 1 || point.z > frontLimits[side] + 0.01) continue;
        const weight =
          (1 - smooth((distance - 0.55) / 0.45)) *
          (1 - smooth((point.z - frontLimits[side]) / 0.01));
        if (weight > 0.001) affected[side]++;
        influence = Math.max(influence, weight);
      }
      if (!influence) return;
      const deltaY = -(point.y - eyeY) * influence * strength,
        local = new Vector3(0, deltaY, 0)
          .applyMatrix4(inverse)
          .sub(inverseOrigin);
      maxDisplacement = Math.max(maxDisplacement, Math.abs(deltaY));
      local.toArray().forEach((value, component) => {
        data.writeFloatLE(value, index * 12 + component * 4);
        min[component] = Math.min(min[component], value);
        max[component] = Math.max(max[component], value);
      });
    });
    return { data, count: world.length, min, max };
  });
  if (affected.some((count) => count < 4))
    return {
      skipped: "The conservative blink depth mask did not cover both eyes",
    };
  const total = rows.reduce((sum, row) => sum + row.world.length, 0);
  if (affected[0] + affected[1] > total * 0.12 || maxDisplacement > 0.025)
    return {
      skipped:
        "Blink mask exceeded the conservative face-area/displacement limit; no deformation added",
    };
  return {
    deltas,
    affected,
    maxDisplacement,
    settings: { eyeX, eyeY, radiusX, radiusY, depth, strength, frontLimits },
  };
}

export function attachPortraitHead(baseBytes, headBytes, options = {}) {
  const id = options.id;
  if (!IDS.includes(id)) throw new Error("Unknown character id");
  const base = parseGLB(baseBytes),
    head = parseGLB(headBytes),
    gltf = structuredClone(base.json),
    source = head.json,
    baseWorld = nodeWorlds(gltf),
    sourceWorld = nodeWorlds(source),
    sourceNodes = sceneMeshes(source);
  if (
    (source.extensionsRequired || []).some((name) =>
      /draco|meshopt/i.test(name),
    )
  )
    throw new Error("Decode compressed head geometry before attaching it");
  const descriptor = gltf.nodes.find(
    (node) => node.extras?.agentId === id && node.extras?.skinRigVersion === 1,
  );
  if (!descriptor) throw new Error(`${id}: missing office rig descriptor`);
  if (descriptor.extras.portraitHeadVersion)
    throw new Error(
      "Base is already a portrait-head candidate; use the immutable v3 snapshot",
    );
  const bodyNodeIndex = gltf.nodes.findIndex(
      (node) => node.name === `DR_${id}_Skin`,
    ),
    body = gltf.nodes[bodyNodeIndex],
    skin = gltf.skins?.[body?.skin];
  if (!skin) throw new Error(`${id}: body has no skeleton`);
  const headJoint = skin.joints.findIndex(
      (index) => gltf.nodes[index].name === `Skin_${id}_Head`,
    ),
    headBone = skin.joints[headJoint];
  if (headJoint < 0) throw new Error(`${id}: missing actual Head bone`);
  const inverses = accessorValues(gltf, base.bin, skin.inverseBindMatrices),
    boneWorld = baseWorld(bodyNodeIndex)
      .clone()
      .multiply(new Matrix4().fromArray(inverses[headJoint]).invert());

  const bounds = new Box3();
  for (const nodeIndex of sourceNodes) {
    const node = source.nodes[nodeIndex],
      world = sourceWorld(nodeIndex);
    for (const primitive of source.meshes[node.mesh].primitives) {
      if (primitive.extensions?.KHR_draco_mesh_compression)
        throw new Error("Compressed head is unsupported");
      for (const position of accessorValues(
        source,
        head.bin,
        primitive.attributes.POSITION,
      ))
        bounds.expandByPoint(new Vector3(...position).applyMatrix4(world));
    }
  }
  const size = bounds.getSize(new Vector3()),
    center = bounds.getCenter(new Vector3()),
    eyeRatio = options.eyeRatio ?? 0.515,
    chinRatio = options.chinRatio ?? 0.8,
    targetEyeY = options.targetEyeY ?? 1.599,
    targetChinY = options.targetChinY ?? 1.395;
  if (
    !(size.y > 0) ||
    !(eyeRatio >= 0 && chinRatio <= 1 && chinRatio > eyeRatio)
  )
    throw new Error("Invalid head bounds or eye/chin ratio");
  const scale =
    options.scale ??
    (targetEyeY - targetChinY) / ((chinRatio - eyeRatio) * size.y);
  if (!(scale > 0 && Number.isFinite(scale)))
    throw new Error("Head scale must be finite and positive");
  const eyeY = bounds.max.y - eyeRatio * size.y,
    headTransform = new Matrix4()
      .makeTranslation(
        options.offsetX || 0,
        targetEyeY + (options.offsetY || 0),
        options.offsetZ || 0,
      )
      .multiply(new Matrix4().makeRotationY(Math.PI))
      .multiply(new Matrix4().makeScale(scale, scale, scale))
      .multiply(new Matrix4().makeTranslation(-center.x, -eyeY, -center.z));

  const chunks = [Buffer.from(base.bin)];
  let binaryLength = base.bin.length;
  function append(data, target) {
    const padding = (4 - (binaryLength % 4)) % 4;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      binaryLength += padding;
    }
    const view = {
      buffer: 0,
      byteOffset: binaryLength,
      byteLength: data.length,
    };
    if (target) view.target = target;
    gltf.bufferViews.push(view);
    chunks.push(data);
    binaryLength += data.length;
    return gltf.bufferViews.length - 1;
  }

  const removedTriangles = [];
  const bodyWorld = baseWorld(bodyNodeIndex),
    cutY = options.neckCutY ?? 1.4;
  for (const primitive of gltf.meshes[body.mesh].primitives) {
    if ((primitive.mode ?? 4) !== 4 || primitive.indices === undefined)
      throw new Error("Expected indexed body triangles");
    const p = accessorValues(gltf, base.bin, primitive.attributes.POSITION),
      j = accessorValues(gltf, base.bin, primitive.attributes.JOINTS_0),
      w = accessorValues(gltf, base.bin, primitive.attributes.WEIGHTS_0),
      indices = accessorValues(gltf, base.bin, primitive.indices).map(
        (value) => value[0],
      ),
      headWeighted = p.map(
        (_, i) =>
          j[i].reduce(
            (sum, joint, k) => sum + (joint === headJoint ? w[i][k] : 0),
            0,
          ) > 0.5,
      ),
      above = p.map(
        (position) => new Vector3(...position).applyMatrix4(bodyWorld).y > cutY,
      ),
      kept = [];
    let removed = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const triangle = indices.slice(i, i + 3);
      if (
        triangle.every((index) => headWeighted[index]) &&
        triangle.some((index) => above[index])
      )
        removed++;
      else kept.push(...triangle);
    }
    if (!kept.length)
      throw new Error("Head filtering would remove the whole body");
    const original = gltf.accessors[primitive.indices],
      componentType = original.componentType,
      type = TYPES[componentType],
      writer =
        componentType === 5125
          ? "writeUInt32LE"
          : componentType === 5123
            ? "writeUInt16LE"
            : "writeUInt8";
    if (![5121, 5123, 5125].includes(componentType))
      throw new Error("Invalid index component type");
    const data = Buffer.alloc(kept.length * type.bytes);
    kept.forEach((value, index) => data[writer](value, index * type.bytes));
    const bufferView = append(data, 34963),
      accessor = {
        bufferView,
        componentType,
        count: kept.length,
        type: "SCALAR",
        min: [],
        max: [],
      };
    // Large arrays cannot safely be spread into Math.min/Math.max on every engine.
    accessor.min = [
      kept.reduce((min, value) => Math.min(min, value), Infinity),
    ];
    accessor.max = [
      kept.reduce((max, value) => Math.max(max, value), -Infinity),
    ];
    gltf.accessors.push(accessor);
    primitive.indices = gltf.accessors.length - 1;
    removedTriangles.push(removed);
  }

  for (const name of [
    `DR_${id}_Face`,
    `DR_${id}_EyeLeft_Rigid`,
    `DR_${id}_EyeRight_Rigid`,
  ]) {
    const node = gltf.nodes.find((node) => node.name === name);
    if (!node) throw new Error(`${id}: missing old head node ${name}`);
    delete node.mesh;
    delete node.skin;
    delete node.weights;
    node.extras = { ...node.extras, portraitHeadReplaced: true };
  }

  for (const key of ["samplers", "images", "textures", "materials", "meshes"])
    gltf[key] ||= [];
  const offsets = Object.fromEntries(
    [
      "samplers",
      "images",
      "textures",
      "materials",
      "meshes",
      "bufferViews",
      "accessors",
    ].map((key) => [key, gltf[key].length]),
  );
  const sourceBinView = append(Buffer.from(head.bin));
  const sourceBinOffset = gltf.bufferViews[sourceBinView].byteOffset;
  // The aggregate view is only a convenient insertion receipt; individual views follow.
  gltf.bufferViews.pop();
  for (const view of source.bufferViews || []) {
    if (view.extensions?.EXT_meshopt_compression)
      throw new Error("Compressed head buffer is unsupported");
    gltf.bufferViews.push({
      ...structuredClone(view),
      buffer: 0,
      byteOffset: sourceBinOffset + (view.byteOffset || 0),
    });
  }
  for (const item of source.accessors || []) {
    const copy = structuredClone(item);
    if (copy.bufferView !== undefined) copy.bufferView += offsets.bufferViews;
    if (copy.sparse) {
      copy.sparse.indices.bufferView += offsets.bufferViews;
      copy.sparse.values.bufferView += offsets.bufferViews;
    }
    gltf.accessors.push(copy);
  }
  gltf.samplers.push(...structuredClone(source.samplers || []));
  for (const image of source.images || []) {
    if (image.uri && !image.uri.startsWith("data:"))
      throw new Error("Embed head images before attaching");
    const copy = structuredClone(image);
    if (copy.bufferView !== undefined) copy.bufferView += offsets.bufferViews;
    gltf.images.push(copy);
  }
  for (const texture of source.textures || []) {
    const copy = structuredClone(texture);
    if (copy.source !== undefined) copy.source += offsets.images;
    if (copy.sampler !== undefined) copy.sampler += offsets.samplers;
    for (const extension of Object.values(copy.extensions || {}))
      if (extension.source !== undefined) extension.source += offsets.images;
    gltf.textures.push(copy);
  }
  gltf.materials.push(
    ...(source.materials || []).map((material) =>
      remapMaterialTextures(material, offsets.textures),
    ),
  );
  for (const mesh of source.meshes || []) {
    const copy = structuredClone(mesh);
    for (const primitive of copy.primitives) {
      for (const name of Object.keys(primitive.attributes))
        primitive.attributes[name] += offsets.accessors;
      for (const target of primitive.targets || [])
        for (const name of Object.keys(target))
          target[name] += offsets.accessors;
      if (primitive.indices !== undefined)
        primitive.indices += offsets.accessors;
      if (primitive.material !== undefined)
        primitive.material += offsets.materials;
    }
    gltf.meshes.push(copy);
  }
  let blink = null,
    blinkIndex = null;
  if (options.blink) {
    if (sourceNodes.length !== 1)
      blink = {
        skipped: "Optional blink currently supports one head mesh node only",
      };
    else {
      const sourceNodeIndex = sourceNodes[0],
        targetMesh =
          gltf.meshes[source.nodes[sourceNodeIndex].mesh + offsets.meshes];
      blink = blinkDeltas(
        source,
        head.bin,
        sourceNodeIndex,
        headTransform.clone().multiply(sourceWorld(sourceNodeIndex)),
        options,
        targetEyeY,
      );
      if (blink.deltas) {
        blinkIndex = targetMesh.primitives[0].targets?.length || 0;
        if (
          targetMesh.primitives.some(
            (primitive) => (primitive.targets?.length || 0) !== blinkIndex,
          )
        )
          throw new Error(
            "Head primitives have inconsistent pre-existing morph target counts",
          );
        targetMesh.primitives.forEach((primitive, index) => {
          const delta = blink.deltas[index],
            bufferView = append(delta.data, 34962),
            accessor = gltf.accessors.length;
          gltf.accessors.push({
            bufferView,
            componentType: 5126,
            count: delta.count,
            type: "VEC3",
            min: delta.min,
            max: delta.max,
          });
          (primitive.targets ||= []).push({ POSITION: accessor });
        });
        targetMesh.weights = [
          ...(targetMesh.weights || Array(blinkIndex).fill(0)),
          0,
        ];
        targetMesh.extras = {
          ...targetMesh.extras,
          targetNames: [
            ...(targetMesh.extras?.targetNames ||
              Array.from(
                { length: blinkIndex },
                (_, index) => `Target${index}`,
              )),
            "PortraitBlink",
          ],
        };
        delete blink.deltas;
      }
    }
  }
  const portraitNode = gltf.nodes.length,
    localBase = boneWorld.clone().invert().multiply(headTransform),
    metadata = {
      portraitHeadVersion: 4,
      characterId: id,
      sourceFront: "+Z",
      officeFront: "-Z",
      ...(blinkIndex !== null ? { portraitBlinkMorph: blinkIndex } : {}),
    };
  if (sourceNodes.length === 1) {
    const nodeIndex = sourceNodes[0],
      sourceNode = source.nodes[nodeIndex];
    gltf.nodes.push({
      name: `DR_${id}_PortraitHead`,
      mesh: sourceNode.mesh + offsets.meshes,
      matrix: localBase.clone().multiply(sourceWorld(nodeIndex)).toArray(),
      ...(sourceNode.weights
        ? {
            weights: [
              ...sourceNode.weights,
              ...(blinkIndex !== null ? [0] : []),
            ],
          }
        : {}),
      extras: metadata,
    });
  } else {
    gltf.nodes.push({
      name: `DR_${id}_PortraitHead`,
      matrix: localBase.toArray(),
      children: [],
      extras: metadata,
    });
    for (const [index, nodeIndex] of sourceNodes.entries()) {
      const sourceNode = source.nodes[nodeIndex],
        child = gltf.nodes.length;
      gltf.nodes.push({
        name: `DR_${id}_PortraitHeadMesh${index}`,
        mesh: sourceNode.mesh + offsets.meshes,
        matrix: sourceWorld(nodeIndex).toArray(),
        ...(sourceNode.weights ? { weights: sourceNode.weights } : {}),
      });
      gltf.nodes[portraitNode].children.push(child);
    }
  }
  (gltf.nodes[headBone].children ||= []).push(portraitNode);
  descriptor.extras = {
    ...descriptor.extras,
    portraitHeadVersion: 4,
    portraitHeadNode: `DR_${id}_PortraitHead`,
  };
  gltf.asset.extras = {
    ...gltf.asset.extras,
    portraitHeadVersion: 4,
    portraitHeadOriginal: {
      jsonGzip: gzipSync(base.jsonChunk, { level: 9 }).toString("base64"),
      binLength: base.bin.length,
      sha256: sha256(baseBytes),
    },
  };
  gltf.extensionsUsed = [
    ...new Set([
      ...(gltf.extensionsUsed || []),
      ...(source.extensionsUsed || []),
    ]),
  ];
  if (source.extensionsRequired?.length)
    gltf.extensionsRequired = [
      ...new Set([
        ...(gltf.extensionsRequired || []),
        ...source.extensionsRequired,
      ]),
    ];
  gltf.buffers[0].byteLength = binaryLength;
  const binary = Buffer.concat(chunks),
    bytes = packGLB(gltf, binary);
  const receipt = {
    version: 4,
    id,
    baseSha256: sha256(baseBytes),
    headSha256: sha256(headBytes),
    outputSha256: sha256(bytes),
    sourceBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    alignment: {
      scale,
      eyeRatio,
      chinRatio,
      targetEyeY,
      targetChinY,
      neckCutY: cutY,
      offsetX: options.offsetX || 0,
      offsetY: options.offsetY || 0,
      offsetZ: options.offsetZ || 0,
    },
    headWorldMatrix: headTransform.toArray(),
    headBoneWorldMatrix: boneWorld.toArray(),
    removedOldHeadTriangles: removedTriangles,
    originalBinaryBytesPreserved: base.bin.length,
    originalAnimationsPreserved:
      JSON.stringify(base.json.animations) === JSON.stringify(gltf.animations),
    portraitNode,
    originalHeadJoint: headBone,
    headMeshes: sourceNodes.length,
    blink,
    note: "Only old head draw indices and old face/eye mesh visibility change. Body attributes, rig nodes, binds and clip samples are retained.",
  };
  return { bytes, receipt, json: gltf };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const args = {};
  for (let index = 2; index < process.argv.length; index++) {
    const name = process.argv[index];
    if (name === "--force" || name === "--blink") args[name.slice(2)] = true;
    else if (name.startsWith("--") && index + 1 < process.argv.length)
      args[name.slice(2)] = process.argv[++index];
    else throw new Error(`Invalid argument: ${name}`);
  }
  if (!args.id || !args.head)
    throw new Error(
      "Usage: node scripts/attach-portrait-head.js --id mira --head file.glb [--output art/characters/portrait-v4/assembled/mira.glb] [--scale N] [--eye-ratio N] [--force]",
    );
  if (!IDS.includes(args.id)) throw new Error("Unknown character id");
  const output = resolve(
      ROOT,
      args.output || `art/characters/portrait-v4/assembled/${args.id}.glb`,
    ),
    outputRoot = resolve(ROOT, "art/characters/portrait-v4/assembled");
  if (
    !output.startsWith(outputRoot + sep) ||
    relative(outputRoot, output).startsWith("..")
  )
    throw new Error(
      "Review outputs must stay inside art/characters/portrait-v4/assembled; production assets are protected",
    );
  const snapshot = resolve(
    ROOT,
    `work/portrait-baseline/models/${args.id}.glb`,
  );
  await mkdir(dirname(snapshot), { recursive: true });
  try {
    await readFile(snapshot);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const original = recoverPortraitBase(
      await readFile(resolve(ROOT, `assets/models/${args.id}.glb`)),
    );
    try {
      await writeFile(snapshot, original, { flag: "wx" });
    } catch (writeError) {
      if (writeError.code !== "EEXIST") throw writeError;
    }
  }
  const [baseBytes, headBytes] = await Promise.all([
      readFile(snapshot),
      readFile(resolve(ROOT, args.head)),
    ]),
    options = { id: args.id, blink: Boolean(args.blink) };
  for (const [cli, field] of Object.entries({
    scale: "scale",
    "eye-ratio": "eyeRatio",
    "chin-ratio": "chinRatio",
    "target-eye-y": "targetEyeY",
    "target-chin-y": "targetChinY",
    "offset-x": "offsetX",
    "offset-y": "offsetY",
    "offset-z": "offsetZ",
    "neck-cut-y": "neckCutY",
    "blink-eye-x": "blinkEyeX",
    "blink-eye-y": "blinkEyeY",
    "blink-radius-x": "blinkRadiusX",
    "blink-radius-y": "blinkRadiusY",
    "blink-depth": "blinkDepth",
    "blink-strength": "blinkStrength",
  })) {
    if (args[cli] === undefined) continue;
    options[field] = Number(args[cli]);
    if (!Number.isFinite(options[field]))
      throw new Error(`--${cli} must be a number`);
  }
  const result = attachPortraitHead(baseBytes, headBytes, options);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, result.bytes, { flag: args.force ? "w" : "wx" });
  await writeFile(
    output.replace(/\.glb$/i, "") + ".receipt.json",
    JSON.stringify(
      {
        ...result.receipt,
        base: relative(ROOT, snapshot).replaceAll("\\", "/"),
        head: relative(ROOT, resolve(ROOT, args.head)).replaceAll("\\", "/"),
        output: relative(ROOT, output).replaceAll("\\", "/"),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      id: args.id,
      output,
      bytes: result.bytes.length,
      removedTriangles: result.receipt.removedOldHeadTriangles,
      scale: result.receipt.alignment.scale,
      originalAnimationsPreserved: result.receipt.originalAnimationsPreserved,
    }),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
