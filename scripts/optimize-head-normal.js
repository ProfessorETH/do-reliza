// Pack a baked normal as RGB PNG at browser resolution. Geometry and albedo
// payloads are copied verbatim; FFmpeg only processes the normal data texture.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Matrix4,Quaternion,Vector3} from '../vendor/three/three.module.js';

function attribute(doc,binary,index,type){
  const accessor=doc.accessors[index],components={SCALAR:1,VEC2:2,VEC3:3}[type];
  const formats={5120:['readInt8',1,127],5121:['readUInt8',1,255],5122:['readInt16LE',2,32767],5123:['readUInt16LE',2,65535],5125:['readUInt32LE',4,4294967295],5126:['readFloatLE',4,1]};
  if(!accessor||accessor.type!==type||accessor.sparse||!formats[accessor.componentType])throw new Error(`Unsupported ${type} surface accessor`);
  const view=doc.bufferViews[accessor.bufferView],format=formats[accessor.componentType];
  if(!view||(view.buffer??0)!==0)throw new Error('Surface accessor needs an embedded buffer view');
  const [read,bytes,maximum]=format,stride=view.byteStride??components*bytes,start=(view.byteOffset??0)+(accessor.byteOffset??0);
  if(stride<components*bytes||(accessor.byteOffset??0)+Math.max(0,accessor.count-1)*stride+components*bytes>view.byteLength||start+Math.max(0,accessor.count-1)*stride+components*bytes>binary.length)throw new Error('Surface accessor exceeds its buffer view');
  const values=new Float64Array(accessor.count*components);
  for(let i=0;i<accessor.count;i++)for(let c=0;c<components;c++){
    let value=binary[read](start+i*stride+c*bytes);
    if(accessor.normalized)value=Math.max(accessor.componentType===5120||accessor.componentType===5122?-1:0,value/maximum);
    if(!Number.isFinite(value))throw new Error('Surface accessor contains a non-finite value');
    values[i*components+c]=value;
  }
  return {values,count:accessor.count};
}

function surfaceTriangles(doc,binary){
  const triangles=[],nodes=doc.nodes??[],children=new Set(nodes.flatMap(n=>n.children??[]));
  const roots=doc.scenes?.[doc.scene??0]?.nodes??nodes.map((_,i)=>i).filter(i=>!children.has(i));
  const visit=(index,parent,ancestors)=>{
    const node=nodes[index];
    if(!node||ancestors.has(index))throw new Error('Invalid surface scene hierarchy');
    const local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation??[0,0,0])),new Quaternion(...(node.rotation??[0,0,0,1])),new Vector3(...(node.scale??[1,1,1])));
    const world=new Matrix4().multiplyMatrices(parent,local),m=world.elements;
    if(node.mesh!==undefined){
      if(node.skin!==undefined)throw new Error('Surface verification expects a rigid head mesh');
      for(const primitive of doc.meshes[node.mesh].primitives){
        if((primitive.mode??4)!==4||primitive.targets?.length)throw new Error('Surface verification expects static triangles');
        const p=attribute(doc,binary,primitive.attributes.POSITION,'VEC3'),uv=attribute(doc,binary,primitive.attributes.TEXCOORD_0,'VEC2');
        if(p.count!==uv.count)throw new Error('POSITION and UV vertex counts disagree');
        const indices=primitive.indices===undefined?Array.from({length:p.count},(_,i)=>i):attribute(doc,binary,primitive.indices,'SCALAR').values;
        if(indices.length%3)throw new Error('Surface triangle index count is invalid');
        const corners=Array.from({length:p.count},(_,i)=>{
          const x=p.values[i*3],y=p.values[i*3+1],z=p.values[i*3+2];
          return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14],uv.values[i*2],uv.values[i*2+1]];
        });
        for(let i=0;i<indices.length;i+=3){
          const ids=[indices[i],indices[i+1],indices[i+2]];
          if(ids.some(v=>!Number.isInteger(v)||v<0||v>=p.count))throw new Error('Surface triangle index is out of bounds');
          triangles.push(ids.map(v=>corners[v]));
        }
      }
    }
    const next=new Set(ancestors).add(index);
    for(const child of node.children??[])visit(child,world,next);
  };
  for(const root of roots)visit(root,new Matrix4(),new Set());
  if(!triangles.length)throw new Error('No textured surface triangles found');
  return triangles;
}

// Compare triangle MULTISETS with each UV attached to its position. Splits,
// triangle order and winding may change during tangent export; geometry may not.
// Neighbor centroid cells avoid quantization-boundary errors. A bipartite match
// preserves multiplicity even for duplicate/degenerate or epsilon-ambiguous faces.
export function assertSameTexturedSurface(doc,binary,sourceDoc,sourceBin,epsilon=1e-5){
  if(!Number.isFinite(epsilon)||epsilon<=0)throw new Error('Invalid surface epsilon');
  const own=surfaceTriangles(doc,binary),source=surfaceTriangles(sourceDoc,sourceBin);
  if(own.length!==source.length)throw new Error(`Surface triangle count changed since normal baking (${own.length} vs ${source.length})`);
  const cell=t=>[0,1,2].map(c=>Math.floor((t[0][c]+t[1][c]+t[2][c])/3/epsilon));
  const buckets=new Map(),sourceOwner=new Int32Array(source.length).fill(-1),ownMatch=new Int32Array(own.length).fill(-1),candidateCache=new Map();
  source.forEach((triangle,i)=>{const key=cell(triangle).join(',');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);});
  const sameCorner=(a,b)=>a.every((value,c)=>Math.abs(value-b[c])<=epsilon);
  const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  const sameTriangle=(a,b)=>permutations.some(p=>sameCorner(a[0],b[p[0]])&&sameCorner(a[1],b[p[1]])&&sameCorner(a[2],b[p[2]]));
  const candidates=i=>{
    if(candidateCache.has(i))return candidateCache.get(i);
    const [x,y,z]=cell(own[i]),matches=[];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)
      for(const j of buckets.get(`${x+dx},${y+dy},${z+dz}`)??[])if(sameTriangle(own[i],source[j]))matches.push(j);
    candidateCache.set(i,matches);return matches;
  };
  for(let i=0;i<own.length;i++){
    const queue=[i],visited=new Set([i]),parentRight=new Map();let free=-1;
    for(let q=0;q<queue.length&&free<0;q++)for(const j of candidates(queue[q])){
      if(parentRight.has(j))continue;
      parentRight.set(j,queue[q]);
      if(sourceOwner[j]<0){free=j;break;}
      const owner=sourceOwner[j];if(!visited.has(owner)){visited.add(owner);queue.push(owner);}
    }
    if(free<0)throw new Error(`POSITION+UV surface triangle ${i} changed since normal baking (epsilon ${epsilon})`);
    while(free>=0){const left=parentRight.get(free),previous=ownMatch[left];ownMatch[left]=free;sourceOwner[free]=left;free=previous;}
  }
  return {triangles:own.length,epsilon,comparison:'One-to-one world POSITION+TEXCOORD_0 triangle multiset; vertex/triangle order and winding independent'};
}

function main(){
const [input,output,albedoSource]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node optimize-head-normal.js INPUT OUTPUT [ALBEDO_SOURCE]');
const raw=fs.readFileSync(input),jsonSize=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+jsonSize));
const binary=raw.subarray(28+jsonSize);
const material=doc.materials.find(m=>m.normalTexture);
if(!material)throw new Error('Expected an inspected normal texture');
const normalIndex=doc.textures[material.normalTexture.index].source;
const image=doc.images[normalIndex],viewIndex=image.bufferView,view=doc.bufferViews[viewIndex];
let albedoOverride,albedoViewIndex,albedoSurfaceValidation;
if(albedoSource){
  const file=fs.readFileSync(albedoSource),length=file.readUInt32LE(12),sourceDoc=JSON.parse(file.subarray(20,20+length)),sourceBin=file.subarray(28+length);
  const sourceMat=sourceDoc.materials.find(m=>m.pbrMetallicRoughness?.baseColorTexture);
  const img=sourceDoc.images[sourceDoc.textures[sourceMat.pbrMetallicRoughness.baseColorTexture.index].source],srcView=sourceDoc.bufferViews[img.bufferView];
  albedoOverride=sourceBin.subarray(srcView.byteOffset??0,(srcView.byteOffset??0)+srcView.byteLength);
  const ownImage=doc.images[doc.textures[material.pbrMetallicRoughness.baseColorTexture.index].source];
  if(img.mimeType!==ownImage.mimeType)throw new Error('Albedo encoding changed');
  albedoViewIndex=ownImage.bufferView;
  albedoSurfaceValidation=assertSameTexturedSurface(doc,binary,sourceDoc,sourceBin);
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'portrait-normal-'));
const source=path.join(temp,'normal.png'),target=path.join(temp,'normal-1024.png');
fs.writeFileSync(source,binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength));
const result=spawnSync('ffmpeg',['-v','error','-y','-i',source,'-vf','scale=1024:1024:flags=lanczos','-pix_fmt','rgb24',target],{encoding:'utf8',windowsHide:true});
if(result.status!==0)throw new Error(result.stderr);
const normal=fs.readFileSync(target),chunks=[];let size=0;
for(let i=0;i<doc.bufferViews.length;i++){
  const item=doc.bufferViews[i];
  const bytes=i===viewIndex?normal:i===albedoViewIndex?albedoOverride:binary.subarray(item.byteOffset??0,(item.byteOffset??0)+item.byteLength);
  const pad=Buffer.alloc((4-size%4)%4);chunks.push(pad,bytes);size+=pad.length;
  item.byteOffset=size;item.byteLength=bytes.length;size+=bytes.length;
}
material.normalTexture.scale=.35;
doc.buffers[0].byteLength=size;
const text=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);
const bin=Buffer.concat([...chunks,Buffer.alloc((4-size%4)%4)]),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
binHeader.writeUInt32LE(bin.length);binHeader.writeUInt32LE(0x004e4942,4);
fs.writeFileSync(output,Buffer.concat([header,json,binHeader,bin]));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const receipt={input,output,sourceSha256:hash(raw),outputSha256:hash(fs.readFileSync(output)),...(albedoSource?{albedoSource,albedoSha256:hash(albedoOverride),albedoSurfaceValidation}:{}),normalResolution:1024,normalChannels:3,normalStrength:.35,normalBytes:normal.length,outputBytes:fs.statSync(output).size,geometry:'All geometry buffer views preserved byte for byte',method:'Stock FFmpeg Lanczos data-texture resize; RGB lossless PNG; GLB buffer-view compaction; optional verified albedo replacement'};
fs.writeFileSync(output.replace(/\.glb$/,'.normal-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();
