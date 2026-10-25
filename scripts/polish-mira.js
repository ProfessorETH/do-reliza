/** Lossless assembly of the reviewed, scoped Mira head and hand changes. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {parseGLB,packGLB,accessorValues} from './attach-portrait-head.js';
const sha=b=>createHash('sha256').update(b).digest('hex');

export function recoverMiraPolishBase(bytes){
  const {json,bin}=parseGLB(bytes),original=json.asset.extras?.miraPolishOriginal;
  if(!original)return bytes;
  const jc=gunzipSync(Buffer.from(original.jsonGzip,'base64')),payload=bin.subarray(0,original.binLength);
  const h=Buffer.alloc(20),bh=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+jc.length+payload.length,8);h.writeUInt32LE(jc.length,12);h.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(payload.length);bh.writeUInt32LE(0x004e4942,4);
  const result=Buffer.concat([h,jc,bh,payload]);if(sha(result)!==original.sha256)throw Error('Mira polish baseline SHA mismatch');return result;
}

export function assembleMiraPolish(originalBytes,headBytes,handPatch,albedo,bodyTop=null){
  const base=parseGLB(originalBytes),head=parseGLB(headBytes),j=head.json;
  if(base.json.asset.extras?.miraPolishOriginal)throw Error('Use the preserved pre-polish baseline');
  if(handPatch.source_sha256!==sha(originalBytes))throw Error('Hand patch source SHA mismatch');
  if(bodyTop&&bodyTop.source_sha256!==sha(originalBytes))throw Error('Collar patch source SHA mismatch');
  if(!head.bin.subarray(0,base.bin.length).equals(base.bin))throw Error('Head candidate must preserve the original binary prefix');
  if(JSON.stringify(j.skins)!==JSON.stringify(base.json.skins)||JSON.stringify(j.animations)!==JSON.stringify(base.json.animations))throw Error('Head candidate changed rig or clips');
  const node=j.nodes[handPatch.node];if(node.name!=='DR_mira_Skin'||node.mesh!==handPatch.mesh)throw Error('Unexpected hand patch mesh');
  const p=j.meshes[node.mesh].primitives[0],chunks=[head.bin];let length=head.bin.length;
  const append=(raw,target)=>{const pad=Buffer.alloc((4-length%4)%4);chunks.push(pad,raw);length+=pad.length;const i=j.bufferViews.length;j.bufferViews.push({buffer:0,byteOffset:length,byteLength:raw.length,...(target?{target}:{})});length+=raw.length;return i;};
  for(const [name,ids,values]of [['POSITION',handPatch.position_indices,handPatch.positions],['NORMAL',handPatch.normal_indices,handPatch.normals]]){
    const old=p.attributes[name],a=structuredClone(j.accessors[old]),all=bodyTop?.attributes?.[name]??accessorValues(j,head.bin,old);
    if(ids.length!==values.length)throw Error('Invalid sparse hand patch');
    ids.forEach((id,i)=>{if(!Number.isInteger(id)||id<0||id>=all.length||values[i].length!==3||!values[i].every(Number.isFinite))throw Error('Invalid hand vertex');all[id]=values[i];});
    a.bufferView=append(Buffer.from(new Float32Array(all.flat()).buffer),34962);delete a.byteOffset;
    if(name==='POSITION'){a.min=[0,1,2].map(k=>Math.min(...all.map(v=>v[k])));a.max=[0,1,2].map(k=>Math.max(...all.map(v=>v[k])));}
    a.count=all.length;p.attributes[name]=j.accessors.length;j.accessors.push(a);
  }
  function addAttribute(values,size,componentType=5126,target=34962){
    const raw=componentType===5123?Buffer.from(new Uint16Array(values.flat()).buffer):componentType===5125?Buffer.from(new Uint32Array(values.flat()).buffer):Buffer.from(new Float32Array(values.flat()).buffer);
    const a={bufferView:append(raw,target),componentType,count:values.length,type:size===1?'SCALAR':`VEC${size}`};
    const i=j.accessors.length;j.accessors.push(a);return i;
  }
  if(bodyTop){
    for(const name of ['TEXCOORD_0','JOINTS_0','WEIGHTS_0']){
      if(!bodyTop.attributes[name])throw Error(`Missing collar attribute ${name}`);
      p.attributes[name]=addAttribute(bodyTop.attributes[name],name==='TEXCOORD_0'?2:4,name==='JOINTS_0'?5123:5126);
    }
    p.indices=addAttribute(bodyTop.indices,1,5125,34963);
    if(bodyTop.collar_indices?.length){
      if(!bodyTop.collar_material)throw Error('Missing collar material');
      const material=j.materials.length;j.materials.push(bodyTop.collar_material);
      const mesh=j.meshes.length;j.meshes.push({name:'Mira_Fitted_CrewNeck',primitives:[{attributes:{...p.attributes},indices:addAttribute(bodyTop.collar_indices,1,5125,34963),material}]});
      const index=j.nodes.length,collar={name:'DR_mira_Collar',mesh,skin:node.skin};
      for(const key of ['translation','rotation','scale','matrix'])if(node[key])collar[key]=structuredClone(node[key]);
      j.nodes.push(collar);
      const parent=j.nodes.findIndex(n=>(n.children??[]).includes(handPatch.node));
      if(parent<0)j.scenes[j.scene??0].nodes.push(index);else j.nodes[parent].children.push(index);
    }
  }
  if(!albedo.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Expected lossless hand albedo PNG');
  j.images[handPatch.texture_source]={bufferView:append(albedo),mimeType:'image/png',name:'Mira_polished_hand_albedo'};
  j.asset.extras={...j.asset.extras,miraPolishVersion:1,miraPolishOriginal:{jsonGzip:gzipSync(base.jsonChunk).toString('base64'),binLength:base.bin.length,sha256:sha(originalBytes)}};
  j.buffers[0].byteLength=length;const bytes=packGLB(j,Buffer.concat(chunks));
  if(!recoverMiraPolishBase(bytes).equals(originalBytes))throw Error('Mira baseline did not recover exactly');
  return {bytes,report:{sourceSha256:sha(originalBytes),headCandidateSha256:sha(headBytes),outputSha256:sha(bytes),handAlbedoSha256:sha(albedo),changedHandVertices:handPatch.position_indices.length,collarRetopology:!!bodyTop,portableRigAndClipsPreserved:true}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const o={};for(let i=2;i<process.argv.length;i+=2)o[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
  const result=assembleMiraPolish(await readFile(o.base),await readFile(o.head),JSON.parse(await readFile(o.hands,'utf8')),await readFile(o.albedo),o.collar?JSON.parse(await readFile(o.collar,'utf8')):null);
  await mkdir(dirname(o.output),{recursive:true});await writeFile(o.output,result.bytes,{flag:'wx'});await writeFile(o.output.replace(/\.glb$/,'.receipt.json'),JSON.stringify(result.report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result.report));
}
