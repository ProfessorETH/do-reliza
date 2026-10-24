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
let portraitVersion;
for (const id of ["mira", "pixel", "nord", "iskra", "saga", "echo"]) {
  const path = `assets/models/${id}.glb`,
    bytes = await readFile(new URL(path, root));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  if (gltf.asset.extras?.officeSkinFinished !== 1)
    throw new Error(`${id}: unfinished asset`);
  const version=gltf.asset.extras?.portraitHeadVersion||3;
  if(portraitVersion!==undefined&&portraitVersion!==version)throw new Error('Mixed portrait generation');
  portraitVersion=version;
  const drawnMeshes=[...new Set(gltf.nodes.filter(n=>n.mesh!==undefined).map(n=>n.mesh))];
  characters.push({
    id,
    ...(await fingerprint(path)),
    bones: gltf.skins[0].joints.length,
    clips: gltf.animations.map((a) => a.name),
    portraitVersion:version,
    meshCount: drawnMeshes.length,
    triangles: drawnMeshes.reduce(
      (sum, index) =>
        sum +
        gltf.meshes[index].primitives.reduce(
          (s, p) => s + gltf.accessors[p.indices].count / 3,
          0,
        ),
      0,
    ),
  });
}
const receipt = {
  date: "2026-10-24",
  method:portraitVersion===4?'Six individual local Hunyuan3D2.1 head reconstructions; 6-view local Paint; measured three-point frontal identity bake; high-to-low tangent normals; rigid Head-bone attachment. Existing Blender bodies, 25-bone binds and five animation sample buffers preserved.':
    "Shared existing Hunyuan Mira jeans scan; Blender-authored continuous sweater/sleeves, hands, shoes, head and hair; UV-baked existing portrait atlas; weighted 25-bone armatures and five portable clips. Runtime IK retargets office controls onto the deform bones.",
  blender: "5.2.0 LTS",
  newDiffusionJobs: portraitVersion===4?12:0,
  ...(portraitVersion===4?{generationStages:{shape:6,paint:6,headReferenceStillImages:6},portraitPipeline:'art/characters/portrait-v4/README.md'}:{}),
  videoGeneration: false,
  faceBake: portraitVersion===4?'Blender CPU EMIT, 2048px albedo; 1024px RGB tangent normal':'Blender CPU EMIT, 1024px per character',
  source: await fingerprint(portraitVersion===4?'art/characters/team-portrait-v4.blend':"art/characters/team-rigged-v3.blend"),
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
