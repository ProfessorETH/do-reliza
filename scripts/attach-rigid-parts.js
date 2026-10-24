// Restore the controller bind pose and attach rigid shoes/eyes to real bones.
// Animation samples and geometry positions stay intact; armpit weights are repaired.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Matrix4, Vector3, Quaternion } from "../vendor/three/three.module.js";

for (const id of ["mira", "pixel", "nord", "iskra", "saga", "echo"]) {
  const path = new URL(`../assets/models/${id}.glb`, import.meta.url);
  const bytes = await readFile(path);
  const jsonLength = bytes.readUInt32LE(12),
    gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  if (gltf.asset.extras?.officeSkinFinished === 1) {
    console.log(`${id}: already finished`);
    continue;
  }
  const binary = Buffer.from(bytes.subarray(20 + jsonLength)); // Preserve the BIN chunk and layout.
  const parent = new Map();
  gltf.nodes.forEach((n, i) =>
    (n.children || []).forEach((c) => parent.set(c, i)),
  );
  const cache = new Map();
  function world(i) {
    if (cache.has(i)) return cache.get(i);
    const n = gltf.nodes[i],
      local = n.matrix
        ? new Matrix4().fromArray(n.matrix)
        : new Matrix4().compose(
            new Vector3(...(n.translation || [0, 0, 0])),
            new Quaternion(...(n.rotation || [0, 0, 0, 1])),
            new Vector3(...(n.scale || [1, 1, 1])),
          );
    const m = parent.has(i)
      ? world(parent.get(i)).clone().multiply(local)
      : local;
    cache.set(i, m);
    return m;
  }
  function accessor(index) {
    const a = gltf.accessors[index],
      v = gltf.bufferViews[a.bufferView];
    return { a, v, offset: 8 + (v.byteOffset || 0) + (a.byteOffset || 0) };
  }
  const skin = gltf.skins[0],
    inverse = accessor(skin.inverseBindMatrices),
    rest = new Map();
  skin.joints.forEach((node, i) => {
    const values = Array.from({ length: 16 }, (_, j) =>
      binary.readFloatLE(inverse.offset + i * 64 + j * 4),
    );
    rest.set(node, new Matrix4().fromArray(values).invert());
  });
  // Exporter's NLA default was an idle pose. Restore the bind pose for the
  // independently animated office controls, while preserving all clip samples.
  for (const node of skin.joints) {
    const p = parent.get(node),
      pworld = rest.get(p) || world(p);
    const local = pworld.clone().invert().multiply(rest.get(node));
    const position = new Vector3(),
      rotation = new Quaternion(),
      scale = new Vector3();
    local.decompose(position, rotation, scale);
    Object.assign(gltf.nodes[node], {
      translation: position.toArray(),
      rotation: rotation.toArray(),
      scale: scale.toArray(),
    });
    delete gltf.nodes[node].matrix;
  }
  // The scan's former armpit rim belongs to the torso. Transferring those
  // weights removes the thin cloth ribbons when the arm lowers from A-pose.
  const torsoIndex = skin.joints.findIndex(
    (i) => gltf.nodes[i].name === `Skin_${id}_Torso`,
  );
  const body = gltf.nodes.find((n) => n.name === `DR_${id}_Skin`);
  for (const primitive of gltf.meshes[body.mesh].primitives) {
    const p = accessor(primitive.attributes.POSITION),
      j = accessor(primitive.attributes.JOINTS_0),
      w = accessor(primitive.attributes.WEIGHTS_0);
    const jointBytes = j.a.componentType === 5121 ? 1 : 2;
    if (w.a.componentType !== 5126)
      throw new Error("Expected float skin weights");
    for (let i = 0; i < p.a.count; i++) {
      const po = p.offset + i * (p.v.byteStride || 12),
        x = Math.abs(binary.readFloatLE(po)),
        y = binary.readFloatLE(po + 4);
      if (x > 0.26 || y < 1.04 || y > 1.37) continue;
      const t = Math.max(0, Math.min(1, (x - 0.2) / 0.06)),
        factor = 1 - t * t * (3 - 2 * t);
      const jo = j.offset + i * (j.v.byteStride || jointBytes * 4),
        wo = w.offset + i * (w.v.byteStride || 16),
        weights = new Map();
      for (let k = 0; k < 4; k++) {
        const bone =
            jointBytes === 1
              ? binary.readUInt8(jo + k)
              : binary.readUInt16LE(jo + k * 2),
          value = binary.readFloatLE(wo + k * 4);
        const name = gltf.nodes[skin.joints[bone]].name;
        const transfer = /UpperArm|Forearm/.test(name) ? value * factor : 0;
        weights.set(bone, (weights.get(bone) || 0) + value - transfer);
        weights.set(torsoIndex, (weights.get(torsoIndex) || 0) + transfer);
      }
      const sorted = [...weights]
          .filter(([, v]) => v > 1e-6)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4),
        total = sorted.reduce((s, a) => s + a[1], 0);
      for (let k = 0; k < 4; k++) {
        const [bone, value] = sorted[k] || [0, 0];
        jointBytes === 1
          ? binary.writeUInt8(bone, jo + k)
          : binary.writeUInt16LE(bone, jo + k * 2);
        binary.writeFloatLE(value / total, wo + k * 4);
      }
    }
  }
  for (const part of ["LeftFoot", "RightFoot", "EyeLeft", "EyeRight"]) {
    const mesh = gltf.nodes.findIndex(
        (n) => n.name === `DR_${id}_${part}_Rigid`,
      ),
      bone = gltf.nodes.findIndex(
        (n) => n.name === `Skin_${id}_${part.includes("Eye") ? "Head" : part}`,
      );
    if (mesh < 0 || bone < 0)
      throw new Error(`${id}: missing rigid part ${part}`);
    const local = rest.get(bone).clone().invert().multiply(world(mesh));
    const old = parent.get(mesh);
    gltf.nodes[old].children = gltf.nodes[old].children.filter(
      (i) => i !== mesh,
    );
    (gltf.nodes[bone].children ||= []).push(mesh);
    gltf.nodes[mesh].matrix = local.toArray();
    delete gltf.nodes[mesh].translation;
    delete gltf.nodes[mesh].rotation;
    delete gltf.nodes[mesh].scale;
  }
  gltf.asset.extras = { ...gltf.asset.extras, officeSkinFinished: 1 };
  const serialized = Buffer.from(JSON.stringify(gltf)),
    pad = (4 - (serialized.length % 4)) % 4,
    json = Buffer.concat([serialized, Buffer.alloc(pad, 32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  await mkdir(new URL("../work/rigid-attachment-before/", import.meta.url), {
    recursive: true,
  });
  await writeFile(
    new URL(`../work/rigid-attachment-before/${id}.glb`, import.meta.url),
    bytes,
  );
  await writeFile(path, Buffer.concat([header, json, binary]));
  console.log(`${id}: shoes and eyes follow actual bones`);
}
