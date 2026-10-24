/** Lossless rig transplant: stage new body/shoes, keep accepted head and clips.
 * node scripts/attach-hunyuan-body.js --id mira --body art/characters/body-v5/mira/body-rigged.glb
 * Blender stage owns fitting/weights. This merger never exports the original rig.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {Matrix4,Matrix3,Vector3,Quaternion} from '../vendor/three/three.module.js';
import {parseGLB,packGLB,accessorValues} from './attach-portrait-head.js';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const suffix=name=>name?.replace(/^Skin_[^_]+_/,'');

/** Exact accepted v4 recovery, also after a promoted v5 model is cloned afresh. */
export function recoverHunyuanBodyBase(bytes){
  const {json,bin}=parseGLB(bytes),original=json.asset.extras?.hunyuanBodyOriginal;
  if(!original)return bytes;
  const text=gunzipSync(Buffer.from(original.jsonGzip,'base64')),payload=bin.subarray(0,original.binLength),header=Buffer.alloc(20),bh=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+payload.length,8);header.writeUInt32LE(text.length,12);header.writeUInt32LE(0x4e4f534a,16);
  bh.writeUInt32LE(payload.length);bh.writeUInt32LE(0x004e4942,4);
  const restored=Buffer.concat([header,text,bh,payload]);
  if(sha(restored)!==original.sha256)throw new Error('Accepted body base recovery SHA mismatch');
  return restored;
}
function hierarchy(gltf){
  const parent=new Map(),cache=new Map();
  gltf.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>{if(parent.has(c))throw new Error('Multiple node parents');parent.set(c,i);}));
  const world=(i,stack=new Set())=>{
    if(cache.has(i))return cache.get(i);
    if(stack.has(i))throw new Error('Node hierarchy cycle');stack.add(i);
    const n=gltf.nodes[i],m=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));
    if(parent.has(i))m.premultiply(world(parent.get(i),stack));cache.set(i,m);stack.delete(i);return m;
  };
  return {world,parent};
}
function remapTextures(value,offset,key=''){
  if(Array.isArray(value))return value.map(v=>remapTextures(v,offset));
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='index'&&/Texture$/.test(key)&&typeof v==='number'?v+offset:remapTextures(v,offset,k)]));
}

export function attachHunyuanBody(baseBytes,stageBytes,{id='mira',anchorTolerance=.003}={}){
  const {json:base,bin:baseBin,jsonChunk:baseJSON}=parseGLB(baseBytes),{json:stage,bin:stageBin}=parseGLB(stageBytes);
  if(base.asset.extras?.portraitHeadVersion!==4)throw new Error('Accepted v4 portrait head is required');
  if(base.asset.extras?.hunyuanBodyVersion)throw new Error('Body already transplanted; start from accepted v4 base');
  const bodyNode=base.nodes.findIndex(n=>n.name===`DR_${id}_Skin`),headNode=base.nodes.findIndex(n=>n.name===`DR_${id}_PortraitHead`);
  if(bodyNode<0||headNode<0||base.nodes[headNode].mesh===undefined)throw new Error(`Missing ${id} body or accepted portrait head`);
  const oldBody=base.nodes[bodyNode],skinIndex=oldBody.skin,skin=base.skins[skinIndex];
  if(!skin||skin.joints.length!==25)throw new Error('Expected the existing 25-bone office rig');
  const originals={animations:JSON.stringify(base.animations),skins:JSON.stringify(base.skins),nodes:structuredClone(base.nodes),head:JSON.stringify(base.nodes[headNode])};
  const bh=hierarchy(base),sh=hierarchy(stage),inverse=accessorValues(base,baseBin,skin.inverseBindMatrices);
  const rest=new Map(skin.joints.map((n,i)=>[suffix(base.nodes[n].name),new Matrix4().fromArray(inverse[i]).invert()]));
  const stageParts=new Map();
  stage.nodes.forEach((n,i)=>{
    const part=n.extras?.hunyuanBodyPart??(/(?:^|_)Body$/.test(n.name??'')?'Body':/(Left|Right)Foot$/.exec(n.name??'')?.[0]);
    if(n.mesh!==undefined&&['Body','LeftFoot','RightFoot'].includes(part)){
      if(stageParts.has(part))throw new Error(`Duplicate staged ${part}`);stageParts.set(part,i);
    }
  });
  for(const part of ['Body','LeftFoot','RightFoot'])if(!stageParts.has(part))throw new Error(`Stage needs real generated ${part} geometry`);
  const sourceBody=stage.nodes[stageParts.get('Body')],sourceSkin=stage.skins?.[sourceBody.skin];
  if(!sourceSkin)throw new Error('Staged Body needs real JOINTS/WEIGHTS skinning');
  const remap=sourceSkin.joints.map(n=>skin.joints.findIndex(i=>suffix(base.nodes[i].name)===suffix(stage.nodes[n].name)));
  if(remap.some(i=>i<0)||remap.length!==25||new Set(remap).size!==25)throw new Error('Stage must use the same 25 distinct office bones');
  let maximumAnchorError=0;
  sourceSkin.joints.forEach((n,i)=>{
    const error=new Vector3().setFromMatrixPosition(sh.world(n)).distanceTo(new Vector3().setFromMatrixPosition(rest.get(suffix(stage.nodes[n].name))));
    maximumAnchorError=Math.max(maximumAnchorError,error);
    if(error>anchorTolerance)throw new Error(`Stage bind anchor ${stage.nodes[n].name} differs by ${error.toFixed(6)}m`);
  });
  const chunks=[baseBin];let byteLength=baseBin.length;
  const append=(bytes,target)=>{
    const padding=Buffer.alloc((4-byteLength%4)%4);chunks.push(padding,bytes);byteLength+=padding.length;
    const index=base.bufferViews.length;base.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:bytes.length,...(target?{target}:{})});byteLength+=bytes.length;return index;
  };
  const accessor=(values,type,componentType=5126)=>{
    const size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type],flat=values.flat(),bytes=componentType===5123?Buffer.from(new Uint16Array(flat).buffer):Buffer.from(new Float32Array(flat).buffer);
    const index=base.accessors.length,a={bufferView:append(bytes,34962),componentType,type,count:values.length};
    if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(const v of values)for(let c=0;c<3;c++){a.min[c]=Math.min(a.min[c],v[c]);a.max[c]=Math.max(a.max[c],v[c]);}}
    if(flat.length!==values.length*size)throw new Error('Invalid appended attribute dimensions');base.accessors.push(a);return index;
  };
  const offsets=Object.fromEntries(['bufferViews','accessors','samplers','images','textures','materials','meshes'].map(k=>{base[k]??=[];return[k,base[k].length];}));
  const stageOffset=byteLength+(4-byteLength%4)%4;append(stageBin);base.bufferViews.pop();
  for(const v of stage.bufferViews??[])base.bufferViews.push({...structuredClone(v),buffer:0,byteOffset:stageOffset+(v.byteOffset??0)});
  for(const a of stage.accessors??[]){const copy=structuredClone(a);if(copy.bufferView!==undefined)copy.bufferView+=offsets.bufferViews;if(copy.sparse){copy.sparse.indices.bufferView+=offsets.bufferViews;copy.sparse.values.bufferView+=offsets.bufferViews;}base.accessors.push(copy);}
  base.samplers.push(...structuredClone(stage.samplers??[]));
  for(const image of stage.images??[]){if(image.uri)throw new Error('Stage images must be embedded');base.images.push({...structuredClone(image),...(image.bufferView!==undefined?{bufferView:image.bufferView+offsets.bufferViews}:{})});}
  for(const texture of stage.textures??[]){const copy=structuredClone(texture);if(copy.source!==undefined)copy.source+=offsets.images;if(copy.sampler!==undefined)copy.sampler+=offsets.samplers;base.textures.push(copy);}
  base.materials.push(...(stage.materials??[]).map(m=>remapTextures(m,offsets.textures)));
  for(const name of ['extensionsUsed','extensionsRequired'])base[name]=[...new Set([...(base[name]??[]),...(stage[name]??[])])];
  const report={id,version:5,baseSha256:sha(baseBytes),stageSha256:sha(stageBytes),baseBinaryPrefixBytes:baseBin.length,maximumAnchorError,parts:{}};
  const modified=new Set();
  for(const part of ['Body','LeftFoot','RightFoot']){
    const si=stageParts.get(part),sn=stage.nodes[si],bi=part==='Body'?bodyNode:base.nodes.findIndex(n=>n.name===`DR_${id}_${part}_Rigid`);
    if(bi<0)throw new Error(`Missing original ${part} lookup node`);
    const destination=base.nodes[bi],transform=bh.world(bi).clone().invert().multiply(sh.world(si)),normalMatrix=new Matrix3().getNormalMatrix(transform);
    const mesh=structuredClone(stage.meshes[sn.mesh]);let triangles=0,vertices=0,minY=Infinity,maxY=-Infinity,minX=Infinity,maxX=-Infinity;
    for(const [pi,primitive] of mesh.primitives.entries()){
      if((primitive.mode??4)!==4||primitive.targets?.length)throw new Error('Stage body must contain static triangle primitives before skinning');
      const original=stage.meshes[sn.mesh].primitives[pi],positions=accessorValues(stage,stageBin,original.attributes.POSITION);
      const worldPositions=positions.map(p=>new Vector3(...p).applyMatrix4(sh.world(si)).toArray());
      for(const p of worldPositions){minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);}
      primitive.attributes=Object.fromEntries(Object.entries(primitive.attributes).map(([k,v])=>[k,v+offsets.accessors]));
      primitive.attributes.POSITION=accessor(positions.map(p=>new Vector3(...p).applyMatrix4(transform).toArray()),'VEC3');
      if(original.attributes.NORMAL!==undefined)primitive.attributes.NORMAL=accessor(accessorValues(stage,stageBin,original.attributes.NORMAL).map(n=>new Vector3(...n).applyMatrix3(normalMatrix).normalize().toArray()),'VEC3');
      if(original.attributes.TANGENT!==undefined){const linear=new Matrix3().setFromMatrix4(transform),sign=transform.determinant()<0?-1:1;primitive.attributes.TANGENT=accessor(accessorValues(stage,stageBin,original.attributes.TANGENT).map(t=>[...new Vector3(...t.slice(0,3)).applyMatrix3(linear).normalize().toArray(),t[3]*sign]),'VEC4');}
      if(part==='Body'){
        if(original.attributes.JOINTS_0===undefined||original.attributes.WEIGHTS_0===undefined||original.attributes.JOINTS_1!==undefined)throw new Error('Staged body needs at most four real skin influences');
        const joints=accessorValues(stage,stageBin,original.attributes.JOINTS_0),weights=accessorValues(stage,stageBin,original.attributes.WEIGHTS_0);
        if(joints.length!==positions.length||weights.length!==positions.length)throw new Error('Body weight/position counts differ');
        const mapped=joints.map((row,i)=>row.map((j,k)=>{if(!Number.isInteger(j)||remap[j]===undefined||!Number.isFinite(weights[i][k])||weights[i][k]<0)throw new Error('Invalid body skin influence');return remap[j];}));
        weights.forEach(row=>{const sum=row.reduce((s,v)=>s+v,0);if(Math.abs(sum-1)>.002)throw new Error('Body weights must be normalized');});
        primitive.attributes.JOINTS_0=accessor(mapped,'VEC4',5123);
        primitive.attributes.WEIGHTS_0=accessor(weights,'VEC4');
      }else{delete primitive.attributes.JOINTS_0;delete primitive.attributes.WEIGHTS_0;}
      if(primitive.indices!==undefined)primitive.indices+=offsets.accessors;
      if(primitive.material!==undefined)primitive.material+=offsets.materials;
      const count=original.indices===undefined?positions.length:stage.accessors[original.indices].count;triangles+=count/3;vertices+=positions.length;
    }
    if(!vertices||!triangles)throw new Error(`Generated ${part} is empty`);
    const metadata=stage.asset.extras?.hunyuanBodyStage??{},neckCut=metadata.neckCutY??1.34,ankleCut=metadata.ankleCutY??.13;
    if(part==='Body'&&(maxY>neckCut+.002||minY<ankleCut-.002))throw new Error('Generated head or shoe geometry remains in the staged body');
    if(part!=='Body'&&(maxY>ankleCut+.002||minY<-.025))throw new Error('Generated shoe bounds do not match floor/ankle contacts');
    if(part==='LeftFoot'&&maxX>.025||part==='RightFoot'&&minX<-.025)throw new Error('Shoe crosses into the other foot');
    destination.mesh=base.meshes.length;base.meshes.push(mesh);
    if(part==='Body')destination.skin=skinIndex;else delete destination.skin;
    destination.extras={...destination.extras,hunyuanBodyVersion:5,hunyuanBodyPart:part};modified.add(bi);
    report.parts[part]={vertices,triangles,bounds:{minX,maxX,minY,maxY}};
  }
  base.asset.extras={...base.asset.extras,hunyuanBodyVersion:5,hunyuanBodyStage:stage.asset.extras?.hunyuanBodyStage??null,hunyuanBodyOriginal:{jsonGzip:gzipSync(baseJSON).toString('base64'),binLength:baseBin.length,sha256:sha(baseBytes)}};
  for(const n of base.nodes)if(n.extras?.skinRigVersion===1)n.extras.hunyuanBodyVersion=5;
  if(JSON.stringify(base.animations)!==originals.animations||JSON.stringify(base.skins)!==originals.skins||JSON.stringify(base.nodes[headNode])!==originals.head)throw new Error('Original rig, clips or portrait head changed');
  base.nodes.forEach((n,i)=>{if(modified.has(i)||n.extras?.skinRigVersion===1)return;if(JSON.stringify(n)!==JSON.stringify(originals.nodes[i]))throw new Error('Original bone/control node changed');});
  base.buffers[0].byteLength=byteLength;
  const result=packGLB(base,Buffer.concat(chunks));
  if(!parseGLB(result).bin.subarray(0,baseBin.length).equals(baseBin))throw new Error('Original animation/head BIN prefix changed');
  return {bytes:result,report:{...report,outputBytes:result.length,outputSha256:sha(result),originalAnimationsPreserved:true,acceptedPortraitPreserved:true,realGeneratedShoeSurfaces:true}};
}

async function main(){
  const args=process.argv.slice(2),o={};for(let i=0;i<args.length;i++){if(!args[i].startsWith('--'))throw new Error('Expected named CLI arguments');const k=args[i].slice(2);o[k]=k==='force'?true:args[++i];}
  const id=o.id??'mira';if(!['mira','pixel','nord','iskra','saga','echo','nika'].includes(id)||!o.body)throw new Error('Usage: --id mira --body STAGED.glb [--base BASE.glb] [--output REVIEW.glb] [--force]');
  const output=resolve(ROOT,o.output??`art/characters/body-v5/assembled/${id}.glb`),allowed=resolve(ROOT,'art/characters/body-v5/assembled'),rel=relative(allowed,output);
  if(rel.startsWith(`..${sep}`)||rel==='..'||isAbsolute(rel)||resolve(output)===allowed)throw new Error('Output must stay in body-v5/assembled review folder');
  const acceptedBase=recoverHunyuanBodyBase(await readFile(resolve(ROOT,o.base??`assets/models/${id}.glb`)));
  const result=attachHunyuanBody(acceptedBase,await readFile(resolve(ROOT,o.body)),{id});
  await mkdir(dirname(output),{recursive:true});await writeFile(output,result.bytes,{flag:o.force?'w':'wx'});await writeFile(output.replace(/\.glb$/,'.receipt.json'),JSON.stringify(result.report,null,2)+'\n');console.log(JSON.stringify(result.report));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
