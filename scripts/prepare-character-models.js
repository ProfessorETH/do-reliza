import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { NodeIO, PropertyType, Root, Format } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, reorder, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { parseGLB, packGLB } from './attach-portrait-head.js';

export const CHARACTER_IDS=['mira','pixel','nord','iskra','saga','echo','nika'];
export const CHARACTER_TRANSFER={version:1,floatBits:18,normalMax:512,bodyWebPQuality:95,meshopt:'1.3.0',description:'No simplification. Preserve local coordinates, float attribute types, joints, morphs and all animation samples. Identity JPEGs untouched.'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function characterIO() {
  await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
}

// Standard KHR_mesh_quantization changes local POSITION coordinates and node
// transforms, but the measured lip seam and IK controls use those coordinates.
// Meshoptimizer's float filter preserves Float32/local space, with a tightly
// bounded precision change. Integer skin indices and weights are not touched.
function precision(doc) {
  const seen=new Set(),errors={};
  for(const node of doc.getRoot().listNodes()) {
    const mesh=node.getMesh();if(!mesh)continue;
    for(const primitive of mesh.listPrimitives())for(const part of [primitive,...primitive.listTargets()])for(const semantic of part.listSemantics()) {
      if(!/^(POSITION|NORMAL|TANGENT|TEXCOORD)/.test(semantic))continue;
      const accessor=part.getAttribute(semantic);if(seen.has(accessor))continue;seen.add(accessor);
      const array=accessor.getArray();if(!(array instanceof Float32Array))continue;
      const stride=accessor.getElementSize()*4,count=accessor.getCount();
      const filtered=MeshoptEncoder.encodeFilterExp(array,count,stride,CHARACTER_TRANSFER.floatBits,'Separate');
      const encoded=MeshoptEncoder.encodeGltfBuffer(filtered,count,stride,'ATTRIBUTES');
      const raw=new Uint8Array(array.byteLength);
      MeshoptDecoder.decodeGltfBuffer(raw,count,stride,encoded,'ATTRIBUTES','EXPONENTIAL');
      const next=new Float32Array(raw.buffer);
      let max=0;for(let i=0;i<array.length;i++)max=Math.max(max,Math.abs(array[i]-next[i]));
      errors[semantic]=Math.max(errors[semantic]||0,max);
      if(max>0.00002)throw new Error(`Unexpected ${semantic} precision error: ${max}`);
      accessor.setArray(next);
    }
  }
  return errors;
}

// Hash every rendered triangle with ALL vertex/morph attributes. Vertex and
// triangle ordering may change; winding, multiplicity, UV/weight pairing may not.
function surfaces(doc) {
  const out=[];
  for(const node of doc.getRoot().listNodes()) {
    const mesh=node.getMesh();if(!mesh)continue;
    for(const [primitiveIndex,primitive] of mesh.listPrimitives().entries()) {
      const attributes=[];
      for(const [target,part] of [primitive,...primitive.listTargets()].entries())for(const semantic of part.listSemantics().sort()) {
        const accessor=part.getAttribute(semantic);attributes.push({key:`${target}:${semantic}`,array:accessor.getArray(),size:accessor.getElementSize()});
      }
      const count=primitive.getAttribute('POSITION').getCount(),size=attributes.reduce((n,a)=>n+a.size,0),vertexHashes=[];
      for(let i=0;i<count;i++) {
        const packed=new Float64Array(size);let offset=0;
        for(const a of attributes)for(let k=0;k<a.size;k++)packed[offset++]=a.array[i*a.size+k];
        vertexHashes.push(sha(new Uint8Array(packed.buffer)).slice(0,32));
      }
      const indices=primitive.getIndices()?.getArray()||Uint32Array.from({length:count},(_,i)=>i),triangles=[];
      for(let i=0;i<indices.length;i+=3) {
        const a=vertexHashes[indices[i]],b=vertexHashes[indices[i+1]],c=vertexHashes[indices[i+2]];
        triangles.push([a+b+c,b+c+a,c+a+b].sort()[0]);
      }
      out.push({node:node.getName(),primitiveIndex,mode:primitive.getMode(),attributes:attributes.map(a=>a.key),triangles:indices.length/3,digest:sha(triangles.sort().join(''))});
    }
  }
  return out;
}

function rig(doc) {
  return {
    nodes:doc.getRoot().listNodes().map(n=>({name:n.getName(),translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale(),extras:n.getExtras(),parent:n.listParents().filter(p=>!(p instanceof Root)).map(p=>p.getName())})),
    skins:doc.getRoot().listSkins().map(s=>{const a=s.getInverseBindMatrices().getArray();return {joints:s.listJoints().map(n=>n.getName()),inverseBindMatrices:sha(new Uint8Array(a.buffer,a.byteOffset,a.byteLength))};}),
    animations:doc.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().map(c=>({target:c.getTargetNode().getName(),path:c.getTargetPath(),interpolation:c.getSampler().getInterpolation(),input:Array.from(c.getSampler().getInput().getArray()),output:Array.from(c.getSampler().getOutput().getArray())}))})),
  };
}

function verifyRig(before,after,id) {
  assert.deepEqual(after.animations,before.animations,`${id}: animation samples changed`);
  assert.deepEqual(after.skins,before.skins,`${id}: skin joints/bind matrices changed`);
  assert.equal(after.nodes.length,before.nodes.length);
  let max=0;
  for(let i=0;i<before.nodes.length;i++) {
    const a=before.nodes[i],b=after.nodes[i];
    for(const key of ['name','extras','parent'])assert.deepEqual(b[key],a[key],`${id}: node ${i} ${key} changed`);
    for(const key of ['translation','rotation','scale'])for(let k=0;k<a[key].length;k++)max=Math.max(max,Math.abs(a[key][k]-b[key][k]));
  }
  assert.equal(max,0,`${id}: node transforms changed`);
  return max;
}

export async function prepareCharacterModels({root,target}) {
  const io=await characterIO(),self=await readFile(new URL('./prepare-character-models.js',import.meta.url));
  const lock=await readFile(join(root,'package-lock.json'));
  const cache=resolve(root,'dist/character-cache');await mkdir(cache,{recursive:true});
  const records=[];
  for(const id of CHARACTER_IDS) {
    const source=await readFile(join(root,'assets/models',id+'.glb'));
    const key=sha(Buffer.concat([source,self,lock,Buffer.from(JSON.stringify(CHARACTER_TRANSFER))]));
    let output,record;
    try {
      record=JSON.parse(await readFile(join(cache,key+'.json'),'utf8'));
      output=await readFile(join(cache,key+'.glb'));
      if(sha(output)!==record.outputSha256)throw new Error('Cache mismatch');
    } catch {
      const doc=await io.readBinary(source),beforeRig=rig(doc);
      const geometryError=precision(doc),beforeSurface=surfaces(doc);
      // Remove only unreachable resources. Never prune helper/control nodes or
      // animation channels, and retain all shader/rig vertex attributes.
      await doc.transform(prune({propertyTypes:[PropertyType.MESH,PropertyType.PRIMITIVE,PropertyType.PRIMITIVE_TARGET,PropertyType.ACCESSOR,PropertyType.MATERIAL,PropertyType.TEXTURE],keepAttributes:true,keepLeaves:true,keepSolidTextures:true}));
      await doc.transform(reorder({encoder:MeshoptEncoder,target:'size'}),dedup({propertyTypes:[PropertyType.ACCESSOR],keepUniqueNames:true}));
      const jpegImages=doc.getRoot().listTextures().filter(t=>t.getMimeType()==='image/jpeg').map(t=>({name:t.getName(),hash:sha(t.getImage())}));
      await doc.transform(
        textureCompress({encoder:sharp,targetFormat:'webp',formats:/png/,slots:/normalTexture/,resize:[CHARACTER_TRANSFER.normalMax,CHARACTER_TRANSFER.normalMax],lossless:true,effort:80}),
        textureCompress({encoder:sharp,targetFormat:'webp',formats:/png/,slots:/baseColorTexture/,quality:CHARACTER_TRANSFER.bodyWebPQuality,effort:80}),
      );
      doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
      const packed=await io.writeJSON(doc,{format:Format.GLB});
      // The writer omits near-identity TRS fields. Restore the original local
      // matrices/TRS verbatim: these are measured IK and lip-fit anchors.
      const originalJSON=parseGLB(source).json;
      assert.equal(packed.json.nodes.length,originalJSON.nodes.length);
      packed.json.nodes.forEach((node,i)=>{
        const original=originalJSON.nodes[i];assert.equal(node.name,original.name);
        for(const field of ['matrix','translation','rotation','scale']) {
          delete node[field];if(field in original)node[field]=original[field];
        }
      });
      output=packGLB(packed.json,packed.resources['@glb.bin']);
      const decoded=await io.readBinary(output);
      const nodeTransformError=verifyRig(beforeRig,rig(decoded),id);
      assert.deepEqual(surfaces(decoded),beforeSurface,`${id}: rendered geometry/UV/skin/morph pairing changed`);
      for(const image of jpegImages)assert.equal(sha(decoded.getRoot().listTextures().find(t=>t.getName()===image.name).getImage()),image.hash,`${id}: identity texture changed`);
      record={id,sourceSha256:sha(source),outputSha256:sha(output),sourceBytes:source.length,sourceGzipBytes:gzipSync(source,{level:9}).length,outputBytes:output.length,outputGzipBytes:gzipSync(output,{level:9}).length,geometryError,nodeTransformError,renderedTriangles:beforeSurface.reduce((n,p)=>n+p.triangles,0),rigAndAnimation:'hierarchy, bind matrices and animation samples exact; node transform error below 1e-6',surfaceVerification:'all rendered triangles with UV/weights/morphs; winding and multiplicity preserved after bounded float precision',jpegIdentity:'unchanged bytes',textures:decoded.getRoot().listTextures().map(t=>({name:t.getName(),mime:t.getMimeType(),size:t.getSize(),bytes:t.getImage().length}))};
      await writeFile(join(cache,key+'.glb'),output);await writeFile(join(cache,key+'.json'),JSON.stringify(record,null,2));
    }
    await writeFile(join(target,id+'.glb'),output);records.push(record);
    console.log(`${id}: ${(record.sourceGzipBytes/1e6).toFixed(2)} -> ${(record.outputGzipBytes/1e6).toFixed(2)} MB gzip`);
  }
  const report={config:CHARACTER_TRANSFER,records,demoTeam:records.filter(r=>['mira','iskra','echo'].includes(r.id)).reduce((a,r)=>({before:a.before+r.sourceGzipBytes,after:a.after+r.outputGzipBytes}),{before:0,after:0})};
  await writeFile(join(root,'dist/character-transfer-report.json'),JSON.stringify(report,null,2));
  return report;
}
