/** Install a measured Blender colour repair without resampling any model data. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseGLB,packGLB} from './attach-portrait-head.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const ROOT=fileURLToPath(new URL('../',import.meta.url));

export function bodyAlbedo(bytes,id){
  const {json,bin}=parseGLB(bytes);
  const node=id==='raw'?json.nodes.find(n=>n.mesh!==undefined):json.nodes.find(n=>n.name===`DR_${id}_Skin`);
  if(node?.mesh===undefined)throw new Error('Generated body mesh missing');
  const p=json.meshes[node.mesh].primitives;
  if(p.length!==1)throw new Error('Expected the existing single body primitive');
  const material=json.materials[p[0].material];
  const index=json.textures[material.pbrMetallicRoughness.baseColorTexture.index].source;
  const im=json.images[index],view=json.bufferViews[im.bufferView];
  if(!view||im.uri)throw new Error('Expected embedded accepted body texture');
  return {index,bytes:bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)};
}

export function replaceBodyAlbedo(bytes,png,{id,expectedSourceSha256}={}){
  const old=bodyAlbedo(bytes,id);
  if(sha(old.bytes)!==expectedSourceSha256)throw new Error('Body albedo differs from the measured repair source');
  if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.readUInt32BE(16)!==2048||png.readUInt32BE(20)!==2048)throw new Error('Expected native 2048px PNG');
  const {json,bin}=parseGLB(bytes),index=json.bufferViews.length;
  json.bufferViews.push({buffer:0,byteOffset:bin.length,byteLength:png.length});
  json.images[old.index]={...json.images[old.index],bufferView:index,mimeType:'image/png'};
  json.buffers[0].byteLength=bin.length+png.length;
  const report={id,method:'Native Blender measured UV colour repair',originalModelSha256:sha(bytes),oldAlbedoSha256:sha(old.bytes),newAlbedoSha256:sha(png),geometryUvRigClipsAndHeadUnchanged:true};
  json.asset.extras={...json.asset.extras,bodyAlbedoRepair:report};
  const result=packGLB(json,Buffer.concat([bin,png]));
  if(!parseGLB(result).bin.subarray(0,bin.length).equals(bin))throw new Error('Existing model binary changed');
  return {bytes:result,report:{...report,outputSha256:sha(result),outputBytes:result.length}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),opts={};for(let i=0;i<args.length;i+=2)opts[args[i].replace(/^--/,'')]=args[i+1];
  const input=await readFile(resolve(ROOT,opts.input));
  const reference=bodyAlbedo(await readFile(resolve(ROOT,opts['source-body'])),opts['source-id']??opts.id);
  const result=replaceBodyAlbedo(input,await readFile(resolve(ROOT,opts.albedo)),{id:opts.id,expectedSourceSha256:sha(reference.bytes)});
  const output=resolve(ROOT,opts.output),rel=relative(resolve(ROOT,'art/characters/body-v5/assembled'),output);
  if(!rel||rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel))throw new Error('Output must stay in the review directory');
  await writeFile(output,result.bytes,{flag:'wx'});
  await writeFile(output.replace(/\.glb$/,'.receipt.json'),JSON.stringify(result.report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result.report));
}
