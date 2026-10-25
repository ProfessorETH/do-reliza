/** Review-only exact-rig Mira polish. Native Blender smooth/image pass, GLB append only. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseGLB,packGLB,accessorValues} from '../../../scripts/attach-portrait-head.js';
import {Matrix4,Matrix3,Vector3,Quaternion} from '../../../vendor/three/three.module.js';
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const source=resolve(arg('--source','assets/models/mira.glb')),out=resolve(arg('--output-dir','work/mira-polish'));
const bytes=await readFile(source),{json:j,bin}=parseGLB(bytes),sha=b=>createHash('sha256').update(b).digest('hex');
if(j.asset.extras?.miraPolishVersion||j.asset.extras?.miraPolishOriginal||j.asset.extras?.miraPolishReview)throw Error('Use the recovered unpolished input');
const parents=new Map();j.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
const world=i=>{const n=j.nodes[i],m=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));return parents.has(i)?m.premultiply(world(parents.get(i))):m;};
const ni=j.nodes.findIndex(n=>n.name==='DR_mira_PortraitHead'),w=world(ni),iw=w.clone().invert(),nworld=new Matrix3().getNormalMatrix(w),inworld=nworld.clone().invert();
if(ni<0)throw Error('Mira portrait head missing');
const mesh=j.meshes[j.nodes[ni].mesh];if(mesh.primitives.length!==1)throw Error('Expected single rigid head primitive');
const p=mesh.primitives[0],positions=accessorValues(j,bin,p.attributes.POSITION),uv=accessorValues(j,bin,p.attributes.TEXCOORD_0),normals=accessorValues(j,bin,p.attributes.NORMAL),indices=accessorValues(j,bin,p.indices).flat();
const v=positions.map(p=>new Vector3(...p).applyMatrix4(w).toArray()),mat=j.materials[p.material],tex=j.textures[mat.pbrMetallicRoughness.baseColorTexture.index],im=j.images[tex.source],bv=j.bufferViews[im.bufferView],albedo=`head-albedo-0.${im.mimeType==='image/png'?'png':'jpg'}`;
await mkdir(out,{recursive:true});
await writeFile(join(out,'head-0.json'),JSON.stringify({positions:v,uv,index:indices}));
await writeFile(join(out,albedo),bin.subarray(bv.byteOffset??0,(bv.byteOffset??0)+bv.byteLength));
await writeFile(join(out,'extracted.json'),JSON.stringify({sourceSha256:sha(bytes),headWorld:w.toArray(),primitives:[{albedo,material:mat}]}));
const py=join(dirname(fileURLToPath(import.meta.url)),'head_review.py');
const native=spawnSync(arg('--blender','C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'),['--background','--factory-startup','--threads','3','--python-exit-code','1','--python',py,'--','--output-dir',out,...(args.includes('--lower-curls')?['--lower-curls']:[]),'--hair-padding',arg('--hair-padding','0')],{stdio:'inherit'});
if(native.status!==0)throw Error(`Native review failed: ${native.status}`);
const delta=JSON.parse(await readFile(join(out,'head-delta.json'),'utf8'));
if(delta.sourceSha256!==sha(bytes)||delta.sourceVertexCount!==positions.length)throw Error('Stale geometry delta');
const chunks=[bin];let length=bin.length;
function blob(raw,target){const pad=Buffer.alloc((4-length%4)%4);chunks.push(pad,raw);length+=pad.length;const i=j.bufferViews.length;j.bufferViews.push({buffer:0,byteOffset:length,byteLength:raw.length,...(target?{target}:{})});length+=raw.length;return i;}
function attribute(values,size,type=5126,target=34962){const raw=type===5125?Buffer.from(new Uint32Array(values.flat()).buffer):Buffer.from(new Float32Array(values.flat()).buffer),view=blob(raw,target),min=Array(size).fill(Infinity),max=Array(size).fill(-Infinity);for(const row of values){const r=Array.isArray(row)?row:[row];for(let k=0;k<size;k++){min[k]=Math.min(min[k],r[k]);max[k]=Math.max(max[k],r[k]);}}const i=j.accessors.length;j.accessors.push({bufferView:view,componentType:type,count:values.length,type:size===1?'SCALAR':`VEC${size}`,min,max});return i;}
const changed=new Set(delta.positions.map(([i])=>i));
for(const [i,value] of delta.positions)positions[i]=new Vector3(...value).applyMatrix4(iw).toArray();
for(const [i,value] of delta.normals)normals[i]=new Vector3(...value).applyMatrix3(inworld).normalize().toArray();
p.attributes.POSITION=attribute(positions,3);p.attributes.NORMAL=attribute(normals,3);
if(p.attributes.TANGENT!==undefined){const tangents=accessorValues(j,bin,p.attributes.TANGENT);for(const i of changed){const t=new Vector3(...tangents[i]),n=new Vector3(...normals[i]);t.addScaledVector(n,-t.dot(n)).normalize();tangents[i]=[...t.toArray(),tangents[i][3]];}p.attributes.TANGENT=attribute(tangents,4);}
const removed=new Set(delta.removeTriangleIndices),kept=indices.filter((_,i)=>!removed.has(Math.floor(i/3)));p.indices=attribute(kept,1,5125,34963);
const imageView=blob(await readFile(join(out,delta.albedo))),image=j.images.length;j.images.push({bufferView:imageView,mimeType:'image/png',name:'Mira_Copper_Temple_Review'});
const texture=j.textures.length;j.textures.push({...tex,source:image});mat.pbrMetallicRoughness.baseColorTexture={...mat.pbrMetallicRoughness.baseColorTexture,index:texture};
const neck=delta.neck;
if(neck){const material=j.materials.length;j.materials.push({name:'Mira_CleanNeck_Review',pbrMetallicRoughness:{baseColorFactor:neck.baseColorFactor,metallicFactor:0,roughnessFactor:neck.roughnessFactor},doubleSided:false});
const neckmesh=j.meshes.length;j.meshes.push({name:'Mira_CleanNeck_Review',primitives:[{attributes:{POSITION:attribute(neck.positions.map(v=>new Vector3(...v).applyMatrix4(iw).toArray()),3),NORMAL:attribute(neck.normals.map(v=>new Vector3(...v).applyMatrix3(inworld).normalize().toArray()),3)},indices:attribute(neck.indices,1,5125,34963),material}]});
const necknode=j.nodes.length;j.nodes.push({name:'DR_mira_PolishNeck',mesh:neckmesh,extras:{reviewOnly:true}});(j.nodes[ni].children??=[]).push(necknode);
}
j.buffers[0].byteLength=length;j.asset.extras.miraPolishReview={version:1,sourceSha256:sha(bytes),nativeHelper:'art/characters/mira-polish/head_review.py'};
const result=packGLB(j,Buffer.concat(chunks)),parsed=parseGLB(result);
if(!parsed.bin.subarray(0,bin.length).equals(bin))throw Error('Original BIN changed');
const name=join(out,'head-candidate.glb');await writeFile(name,result);
const receipt={sourceSha256:sha(bytes),outputSha256:sha(result),outputBytes:result.length,originalBinPrefixByteIdentical:true,unchangedRigAndClips:true,faceAndBlinkUnchanged:true,changedBackVertices:changed.size,...delta.notes};
await writeFile(join(out,'head-candidate.receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log('HEAD_REVIEW_CANDIDATE',name,JSON.stringify(receipt));
