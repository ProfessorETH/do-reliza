import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
async function fingerprint(path) {
  const bytes = await readFile(new URL(path, root));
  return {
    file: path,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
const characters = [];
for (const id of ["mira", "pixel", "nord", "iskra", "saga", "echo"]) {
  const path = `assets/models/${id}.glb`,
    bytes = await readFile(new URL(path, root));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  if (gltf.asset.extras?.officeSkinFinished !== 1)
    throw new Error(`${id}: unfinished asset`);
  characters.push({
    id,
    ...(await fingerprint(path)),
    bones: gltf.skins[0].joints.length,
    clips: gltf.animations.map((a) => a.name),
    meshCount: gltf.meshes.length,
    triangles: gltf.meshes.reduce(
      (sum, m) =>
        sum +
        m.primitives.reduce(
          (s, p) => s + gltf.accessors[p.indices].count / 3,
          0,
        ),
      0,
    ),
  });
}
const receipt = {
  date: "2026-10-24",
  method:
    "Shared existing Hunyuan Mira jeans scan; Blender-authored continuous sweater/sleeves, hands, shoes, head and hair; UV-baked existing portrait atlas; weighted 25-bone armatures and five portable clips. Runtime IK retargets office controls onto the deform bones.",
  blender: "5.2.0 LTS",
  newDiffusionJobs: 0,
  videoGeneration: false,
  faceBake: "Blender CPU EMIT, 1024px per character",
  source: await fingerprint("art/characters/team-rigged-v3.blend"),
  references: await Promise.all(
    ["art/hunyuan/mira/mira-review-v2.glb", "assets/agents.png"].map(
      fingerprint,
    ),
  ),
  characters,
};
await writeFile(
  new URL("art/characters/receipt.json", root),
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(
  `${characters.length} character receipts, ${characters.reduce((s, c) => s + c.bytes, 0)} GLB bytes`,
);
