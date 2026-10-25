/** Adjust a portrait head while keeping its collar contact and portable rig. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {Matrix4,Matrix3,Vector3,Quaternion} from '../vendor/three/three.module.js';
import {parseGLB,packGLB,accessorValues} from './attach-portrait-head.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const smooth=t=>(t=Math.max(0,Math.min(1,t)),t*t*(3-2*t));

export function recoverHeadProportionBase(bytes){
  const {json,bin}=parseGLB(bytes),b=json.asset.extras?.headProportionOriginal;
  if(!b)return bytes;
  const jc=gunzipSync(Buffer.from(b.jsonGzip,'base64')),payload=bin.subarray(0,b.binLength),header=Buffer.alloc(20),bh=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jc.length+payload.length,8);header.writeUInt32LE(jc.length,12);header.writeUInt32LE(0x4e4f534a,16);
  bh.writeUInt32LE(payload.length);bh.writeUInt32LE(0x004e4942,4);
  const original=Buffer.concat([header,jc,bh,payload]);if(sha(original)!==b.sha256)throw Error('Original head proportion SHA mismatch');return original;
}

export function fitHeadProportions(bytes,{id,scale=.76,neckY=1.36,chinY=1.395}={}){
  if(!(scale>=.60&&scale<=1))throw Error('Head scale must be between .60 and 1');
  const {json:j,bin,jsonChunk}=parseGLB(bytes);
  if(j.asset.extras?.headProportions)throw Error('Already fitted; use preserved original source');
  const parents=new Map();j.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
  const world=i=>{const n=j.nodes[i],m=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));return parents.has(i)?m.premultiply(world(parents.get(i))):m;};
  const index=j.nodes.findIndex(n=>n.name===`DR_${id}_PortraitHead`);
  if(index<0)throw Error('Portrait head missing');
  const w=world(index),iw=w.clone().invert(),nw=new Matrix3().getNormalMatrix(w),inw=nw.clone().invert();
  const pivot=new Vector3(0,neckY,0);
  function deform(p){
    const r=Math.hypot(p.x,p.z),lock=(1-smooth((p.y-neckY)/(chinY-neckY)))*(1-smooth((r-.09)/.21));
    return p.clone().sub(pivot).multiplyScalar(scale).add(pivot).lerp(p,lock);
  }
  function jacobian(p){
    const cols=[];for(let c=0;c<3;c++){const a=p.clone(),b=p.clone();a.setComponent(c,a.getComponent(c)+1e-5);b.setComponent(c,b.getComponent(c)-1e-5);cols.push(deform(a).sub(deform(b)).multiplyScalar(50000));}
    return new Matrix3().set(cols[0].x,cols[1].x,cols[2].x,cols[0].y,cols[1].y,cols[2].y,cols[0].z,cols[1].z,cols[2].z);
  }
  const chunks=[bin];let length=bin.length;
  function append(values){
    const raw=Buffer.from(new Float32Array(values.flat()).buffer),pad=Buffer.alloc((4-length%4)%4);chunks.push(pad,raw);length+=pad.length;
    const view=j.bufferViews.length;j.bufferViews.push({buffer:0,byteOffset:length,byteLength:raw.length,target:34962});length+=raw.length;
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const v of values)for(let k=0;k<3;k++){min[k]=Math.min(min[k],v[k]);max[k]=Math.max(max[k],v[k]);}
    const a={bufferView:view,componentType:5126,count:values.length,type:'VEC3',min,max};
    const i=j.accessors.length;j.accessors.push(a);return i;
  }
  let vertices=0,minDet=Infinity,maxContactError=0;const beforeBounds=[Infinity,-Infinity],afterBounds=[Infinity,-Infinity];
  for(const p of j.meshes[j.nodes[index].mesh].primitives){
    const positions=accessorValues(j,bin,p.attributes.POSITION),normals=accessorValues(j,bin,p.attributes.NORMAL),worldPositions=positions.map(v=>new Vector3(...v).applyMatrix4(w));
    const fitted=worldPositions.map(v=>deform(v));
    for(let i=0;i<positions.length;i++){
      const a=worldPositions[i],b=fitted[i],det=jacobian(a).determinant();minDet=Math.min(minDet,det);
      if(Math.abs(a.y-neckY)<.0001&&Math.hypot(a.x,a.z)<=.09)maxContactError=Math.max(maxContactError,a.distanceTo(b));
      beforeBounds[0]=Math.min(beforeBounds[0],a.y);beforeBounds[1]=Math.max(beforeBounds[1],a.y);afterBounds[0]=Math.min(afterBounds[0],b.y);afterBounds[1]=Math.max(afterBounds[1],b.y);
    }
    p.attributes.POSITION=append(fitted.map(v=>v.clone().applyMatrix4(iw).toArray()));
    p.attributes.NORMAL=append(normals.map((v,i)=>new Vector3(...v).applyMatrix3(nw).normalize().applyMatrix3(jacobian(worldPositions[i]).invert().transpose()).normalize().applyMatrix3(inw).normalize().toArray()));
    for(const t of p.targets??[]){
      if(t.NORMAL)throw Error('Inspect normal morph before fitting');
      if(t.POSITION){const d=accessorValues(j,bin,t.POSITION);t.POSITION=append(d.map((v,i)=>{const q=new Vector3(...positions[i]).add(new Vector3(...v)).applyMatrix4(w);return deform(q).applyMatrix4(iw).sub(fitted[i].clone().applyMatrix4(iw)).toArray();}));}
    }
    vertices+=positions.length;
  }
  if(minDet<=0)throw Error('Head/neck fit folds the surface');
  const report={id,scale,neckY,chinY,vertices,beforeBoundsY:beforeBounds,afterBoundsY:afterBounds,minJacobianDeterminant:minDet,maxFixedNeckContactError:maxContactError,sourceSha256:sha(bytes),bodyRigClipsUvsAndTexturesUnchanged:true};
  j.asset.extras={...j.asset.extras,headProportions:report,headProportionOriginal:{jsonGzip:gzipSync(jsonChunk).toString('base64'),binLength:bin.length,sha256:sha(bytes)}};
  j.buffers[0].byteLength=length;
  const out=packGLB(j,Buffer.concat(chunks));
  if(!parseGLB(out).bin.subarray(0,bin.length).equals(bin))throw Error('Source binary changed');
  return {bytes:out,report:{...report,outputSha256:sha(out),outputBytes:out.length}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2),o={};for(let i=0;i<a.length;i+=2)o[a[i].replace(/^--/,'')]=a[i+1];
 const r=fitHeadProportions(recoverHeadProportionBase(await readFile(o.input)),{id:o.id,scale:Number(o.scale??.76)});
 await mkdir(dirname(o.output),{recursive:true});await writeFile(o.output,r.bytes,{flag:'wx'});await writeFile(o.output.replace(/\.glb$/,'.json'),JSON.stringify(r.report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(r.report));
}
