import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import * as THREE from "../vendor/three/three.module.js";
import {
  attachPortraitHead,
  parseGLB,
  packGLB,
  accessorValues,
  recoverPortraitBase,
} from "../scripts/attach-portrait-head.js";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      specifier === "three"
        ? new URL("../vendor/three/three.module.js", import.meta.url).href
        : specifier,
      context,
    );
  },
});
const { GLTFLoader } = await import("../vendor/three/loaders/GLTFLoader.js");

function fixture() {
  const chunks = [],
    views = [];
  let length = 0;
  function data(bytes, target) {
    const pad = (4 - (length % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      length += pad;
    }
    const index = views.length;
    views.push({
      buffer: 0,
      byteOffset: length,
      byteLength: bytes.length,
      ...(target ? { target } : {}),
    });
    chunks.push(bytes);
    length += bytes.length;
    return index;
  }
  const positions = [
      -0.3, -0.5, -0.2, 0.3, -0.5, -0.2, 0.3, 0.5, -0.2, -0.3, 0.5, -0.2, -0.3,
      -0.5, 0.2, 0.3, -0.5, 0.2, 0.3, 0.5, 0.2, -0.3, 0.5, 0.2,
    ],
    indices = [
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0,
      4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
    ],
    p = data(Buffer.from(new Float32Array(positions).buffer), 34962),
    u = data(
      Buffer.from(
        new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1])
          .buffer,
      ),
      34962,
    ),
    i = data(Buffer.from(new Uint16Array(indices).buffer), 34963),
    png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=",
      "base64",
    ),
    image = data(png);
  return packGLB(
    {
      asset: { version: "2.0" },
      buffers: [{ byteLength: length }],
      bufferViews: views,
      accessors: [
        {
          bufferView: p,
          componentType: 5126,
          count: 8,
          type: "VEC3",
          min: [-0.3, -0.5, -0.2],
          max: [0.3, 0.5, 0.2],
        },
        { bufferView: u, componentType: 5126, count: 8, type: "VEC2" },
        {
          bufferView: i,
          componentType: 5123,
          count: indices.length,
          type: "SCALAR",
        },
      ],
      samplers: [{ magFilter: 9729, minFilter: 9729 }],
      images: [{ bufferView: image, mimeType: "image/png" }],
      textures: [{ sampler: 0, source: 0 }],
      materials: [
        {
          name: "HEAD_FIXTURE",
          pbrMetallicRoughness: {
            baseColorTexture: { index: 0 },
            metallicRoughnessTexture: { index: 0 },
          },
          normalTexture: { index: 0 },
          extensions: {
            KHR_materials_clearcoat: { clearcoatTexture: { index: 0 } },
          },
        },
      ],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0, TEXCOORD_0: 1 },
              indices: 2,
              material: 0,
            },
          ],
        },
      ],
      nodes: [
        { translation: [0.2, 0.1, -0.05], children: [1] },
        { mesh: 0, scale: [1.1, 1, 1] },
      ],
      scenes: [{ nodes: [0] }],
      scene: 0,
      extensionsUsed: ["KHR_materials_clearcoat"],
    },
    Buffer.concat(chunks),
  );
}

function eyePlaneFixture() {
  const positions = [],
    normals = [],
    indices = [],
    side = 61;
  for (let face = 0; face < 2; face++) {
    const start = positions.length / 3;
    for (let y = 0; y < side; y++)
      for (let x = 0; x < side; x++) {
        positions.push(-0.3 + x * 0.01, -0.3 + y * 0.01, face ? -0.2 : 0.2);
        normals.push(0, 0, face ? -1 : 1);
      }
    for (let y = 0; y < side - 1; y++)
      for (let x = 0; x < side - 1; x++) {
        const a = start + y * side + x,
          b = a + 1,
          c = a + side,
          d = c + 1;
        indices.push(...(face ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
      }
  }
  const p = Buffer.from(new Float32Array(positions).buffer),
    n = Buffer.from(new Float32Array(normals).buffer),
    i = Buffer.from(new Uint16Array(indices).buffer),
    binary = Buffer.concat([p, n, i]);
  return packGLB(
    {
      asset: { version: "2.0" },
      buffers: [{ byteLength: binary.length }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: p.length, target: 34962 },
        {
          buffer: 0,
          byteOffset: p.length,
          byteLength: n.length,
          target: 34962,
        },
        {
          buffer: 0,
          byteOffset: p.length + n.length,
          byteLength: i.length,
          target: 34963,
        },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: positions.length / 3,
          type: "VEC3",
          min: [-0.3, -0.3, -0.2],
          max: [0.3, 0.3, 0.2],
        },
        {
          bufferView: 1,
          componentType: 5126,
          count: normals.length / 3,
          type: "VEC3",
        },
        {
          bufferView: 2,
          componentType: 5123,
          count: indices.length,
          type: "SCALAR",
        },
      ],
      meshes: [
        {
          primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }],
        },
      ],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    },
    binary,
  );
}

async function base(id) {
  return recoverPortraitBase(
    await readFile(new URL(`../assets/models/${id}.glb`, import.meta.url)),
  );
}

test("portrait attachment preserves every original binary byte and all animation/control data", async () => {
  const head = fixture();
  for (const id of ["mira", "pixel", "nord", "iskra", "saga", "echo"]) {
    const original = await base(id),
      before = parseGLB(original),
      result = attachPortraitHead(original, head, { id }),
      after = parseGLB(result.bytes);
    assert.deepEqual(after.bin.subarray(0, before.bin.length), before.bin);
    assert.deepEqual(after.json.animations, before.json.animations);
    assert.deepEqual(after.json.skins, before.json.skins);
    for (let i = 0; i < before.json.nodes.length; i++) {
      const node = before.json.nodes[i],
        changed = after.json.nodes[i];
      for (const transform of ["translation", "rotation", "scale", "matrix"])
        assert.deepEqual(
          changed[transform],
          node[transform],
          `${id}: ${node.name} ${transform}`,
        );
    }
    const oldBody = before.json.nodes.find((n) => n.name === `DR_${id}_Skin`),
      newBody = after.json.nodes.find((n) => n.name === `DR_${id}_Skin`),
      oldPrimitive = before.json.meshes[oldBody.mesh].primitives[0],
      newPrimitive = after.json.meshes[newBody.mesh].primitives[0];
    assert.deepEqual(newPrimitive.attributes, oldPrimitive.attributes);
    assert.ok(
      result.receipt.removedOldHeadTriangles.reduce((a, b) => a + b, 0) > 0,
    );
    assert.ok(
      after.json.accessors[newPrimitive.indices].count <
        before.json.accessors[oldPrimitive.indices].count,
    );
    for (const part of ["Face", "EyeLeft_Rigid", "EyeRight_Rigid"])
      assert.equal(
        after.json.nodes.find((n) => n.name === `DR_${id}_${part}`).mesh,
        undefined,
      );
    assert.equal(after.json.asset.extras.officeSkinFinished, 1);
    assert.equal(
      after.json.nodes.find((n) => n.extras?.agentId === id).extras
        .portraitHeadVersion,
      4,
    );
    assert.deepEqual(
      recoverPortraitBase(result.bytes),
      original,
      "fresh clones can recover the exact baseline without ignored work files",
    );
  }
});

test("head resources and source hierarchy transforms survive remapping and actual GLTF loading", async () => {
  const id = "mira",
    original = await base(id),
    head = fixture(),
    source = parseGLB(head),
    before = parseGLB(original),
    result = attachPortraitHead(original, head, { id }),
    after = parseGLB(result.bytes),
    node = after.json.nodes[result.receipt.portraitNode],
    mesh = after.json.meshes[node.mesh],
    primitive = mesh.primitives[0],
    material = after.json.materials[primitive.material];
  assert.equal(material.name, "HEAD_FIXTURE");
  const textureOffset = before.json.textures.length;
  for (const info of [
    material.pbrMetallicRoughness.baseColorTexture,
    material.pbrMetallicRoughness.metallicRoughnessTexture,
    material.normalTexture,
    material.extensions.KHR_materials_clearcoat.clearcoatTexture,
  ])
    assert.equal(info.index, textureOffset);
  const importedTexture = after.json.textures[textureOffset],
    image = after.json.images[importedTexture.source],
    imageView = after.json.bufferViews[image.bufferView],
    originalImageView =
      source.json.bufferViews[source.json.images[0].bufferView];
  assert.deepEqual(
    after.bin.subarray(
      imageView.byteOffset,
      imageView.byteOffset + imageView.byteLength,
    ),
    source.bin.subarray(
      originalImageView.byteOffset,
      originalImageView.byteOffset + originalImageView.byteLength,
    ),
  );
  const actual = accessorValues(
    after.json,
    after.bin,
    primitive.attributes.POSITION,
  );
  assert.deepEqual(actual, accessorValues(source.json, source.bin, 0));
  const loader = new GLTFLoader();
  loader.register(() => ({
    name: "TEST_PORTRAIT_TEXTURES",
    loadTexture: () => Promise.resolve(new THREE.Texture()),
  }));
  const model = await loader.parseAsync(
    result.bytes.buffer.slice(
      result.bytes.byteOffset,
      result.bytes.byteOffset + result.bytes.length,
    ),
    "",
  );
  model.scene.updateMatrixWorld(true);
  const portrait = model.scene.getObjectByName(`DR_${id}_PortraitHead`),
    bone = model.scene.getObjectByName(`Skin_${id}_Head`);
  assert.equal(portrait.parent, bone);
  assert.ok(bone.isBone);
  assert.ok(portrait.isMesh);
  const box = new THREE.Box3().setFromObject(portrait, true),
    scale = result.receipt.alignment.scale;
  assert.ok(
    Math.abs(box.max.y - (1.599 + 0.515 * scale)) < 1e-5,
    `upper head alignment: ${box.max.y}`,
  );
  assert.ok(
    Math.abs(box.min.y - (1.599 - 0.485 * scale)) < 1e-5,
    `lower head alignment: ${box.min.y}`,
  );
  assert.ok(
    Math.abs(box.getCenter(new THREE.Vector3()).x) < 1e-6,
    "source root translation is compensated",
  );
  const baseline = box.min.y,
    mixer = new THREE.AnimationMixer(model.scene),
    sit = mixer.clipAction(model.animations.find((c) => c.name === "Sit"));
  sit.setLoop(THREE.LoopOnce, 1);
  sit.clampWhenFinished = true;
  sit.play();
  mixer.update(1.2);
  model.scene.updateMatrixWorld(true);
  const seated = new THREE.Box3().setFromObject(portrait, true);
  assert.ok(
    seated.min.y < baseline - 0.2,
    "new head follows the real seated Head bone",
  );
  assert.ok(seated.min.toArray().every(Number.isFinite));
});

test("a second portrait merge is rejected instead of duplicating heads", async () => {
  const first = attachPortraitHead(await base("mira"), fixture(), {
    id: "mira",
  });
  assert.throws(
    () => attachPortraitHead(first.bytes, fixture(), { id: "mira" }),
    /already a portrait-head candidate/,
  );
});

test("optional blink changes only the small front-facing eye patches and loads as a real morph target", async () => {
  const source = eyePlaneFixture(),
    raw = parseGLB(source),
    result = attachPortraitHead(await base("mira"), source, {
      id: "mira",
      blink: true,
      scale: 1,
      eyeRatio: 0.5,
    }),
    gltf = parseGLB(result.bytes),
    node = gltf.json.nodes[result.receipt.portraitNode],
    mesh = gltf.json.meshes[node.mesh],
    primitive = mesh.primitives[0],
    positions = accessorValues(raw.json, raw.bin, 0),
    deltas = accessorValues(gltf.json, gltf.bin, primitive.targets[0].POSITION);
  assert.equal(node.extras.portraitBlinkMorph, 0);
  assert.deepEqual(mesh.weights, [0]);
  assert.deepEqual(mesh.extras.targetNames, ["PortraitBlink"]);
  assert.ok(result.receipt.blink.affected.every((count) => count >= 4));
  let changed = 0;
  deltas.forEach((delta, index) => {
    if (delta.every((value) => value === 0)) return;
    changed++;
    const [x, y, z] = positions[index];
    assert.ok(Math.min(Math.abs(x - 0.061), Math.abs(x + 0.061)) < 0.038);
    assert.ok(Math.abs(y) < 0.023);
    assert.ok(z > 0.19, "back of head stays still");
    assert.ok(
      Math.abs(y + delta[1]) <= Math.abs(y) + 1e-7,
      "eye patch closes toward the ocular line",
    );
    assert.ok(Math.abs(delta[0]) < 1e-7 && Math.abs(delta[2]) < 1e-7);
  });
  assert.ok(
    changed > 10 && changed < positions.length * 0.02,
    "local deformation only",
  );
  const loader = new GLTFLoader();
  loader.register(() => ({
    name: "TEST_BLINK_TEXTURES",
    loadTexture: () => Promise.resolve(new THREE.Texture()),
  }));
  const model = await loader.parseAsync(
    result.bytes.buffer.slice(
      result.bytes.byteOffset,
      result.bytes.byteOffset + result.bytes.length,
    ),
    "",
  );
  const portrait = model.scene.getObjectByName("DR_mira_PortraitHead");
  assert.equal(portrait.morphTargetDictionary.PortraitBlink, 0);
  assert.equal(portrait.morphTargetInfluences[0], 0);
  const vertex = deltas.findIndex((delta) => Math.abs(delta[1]) > 0.001),
    before = portrait.getVertexPosition(vertex, new THREE.Vector3());
  portrait.morphTargetInfluences[0] = 1;
  assert.ok(
    Math.abs(
      portrait.getVertexPosition(vertex, new THREE.Vector3()).y - before.y,
    ) > 0.001,
  );
});

test("optional blink skips geometry without a plausible pair of eye patches", async () => {
  const result = attachPortraitHead(await base("mira"), fixture(), {
    id: "mira",
    blink: true,
  });
  assert.ok(result.receipt.blink.skipped);
  assert.equal(
    result.json.nodes[result.receipt.portraitNode].extras.portraitBlinkMorph,
    undefined,
  );
});
