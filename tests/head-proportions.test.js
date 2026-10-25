import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Matrix4,Vector3,Quaternion} from '../vendor/three/three.module.js';
import {parseGLB,accessorValues} from '../scripts/attach-portrait-head.js';
import {recoverHeadProportionBase} from '../scripts/fit-head-proportions.js';

const scales={mira:.76,pixel:.76,nord:.85,iskra:.76,saga:.80,echo:.82,nika:.70};
for(const [id,scale]of Object.entries(scales))test(`${id}: smaller head preserves collar, body, portrait UVs and portable animations`,async()=>{
  const bytes=await readFile(new URL(`../assets/models/${id}.glb`,import.meta.url)),after=parseGLB(bytes),before=parseGLB(recoverHeadProportionBase(bytes));
  const {json:a,bin:ab}=after,{json:b,bin:bb}=before;
  assert.equal(a.asset.extras.headProportions.scale,scale);
  for(const key of ['nodes','skins','animations','materials','images','textures'])assert.deepEqual(a[key],b[key],key);
  const head=a.nodes.findIndex(n=>n.name===`DR_${id}_PortraitHead`),mi=a.nodes[head].mesh;
  a.meshes.forEach((m,i)=>{if(i!==mi)assert.deepEqual(m,b.meshes[i],'body/shoes must remain unchanged');});
  const parents=new Map();a.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
  const world=i=>{const n=a.nodes[i],m=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));return parents.has(i)?m.premultiply(world(parents.get(i))):m;};
  const w=world(head);let oldTop=-Infinity,newTop=-Infinity,contacts=0;
  for(let k=0;k<a.meshes[mi].primitives.length;k++){
    const p=a.meshes[mi].primitives[k],q=b.meshes[mi].primitives[k];
    assert.equal(p.indices,q.indices);assert.equal(p.attributes.TEXCOORD_0,q.attributes.TEXCOORD_0);assert.equal(p.material,q.material);
    const old=accessorValues(b,bb,q.attributes.POSITION),now=accessorValues(a,ab,p.attributes.POSITION);
    old.forEach((v,i)=>{const x=new Vector3(...v).applyMatrix4(w),y=new Vector3(...now[i]).applyMatrix4(w);oldTop=Math.max(oldTop,x.y);newTop=Math.max(newTop,y.y);if(Math.abs(x.y-1.36)<.0001&&Math.hypot(x.x,x.z)<=.09){contacts++;assert.ok(x.distanceTo(y)<1e-6,'protected collar ring moved');}});
    for(const n of accessorValues(a,ab,p.attributes.NORMAL))assert.ok(n.every(Number.isFinite)&&Math.abs(Math.hypot(...n)-1)<.001,'valid normals after neck adaptation');
    if(p.attributes.TANGENT!==undefined){const ns=accessorValues(a,ab,p.attributes.NORMAL),ts=accessorValues(a,ab,p.attributes.TANGENT);ts.forEach((t,i)=>{assert.ok(Math.abs(Math.hypot(...t.slice(0,3))-1)<.001);assert.ok(Math.abs(new Vector3(...t).dot(new Vector3(...ns[i])))<.001,'normal-map basis remains orthogonal');assert.ok(Math.abs(t[3])===1,'UV handedness preserved');});}
    for(let t=0;t<(q.targets??[]).length;t++){const od=accessorValues(b,bb,q.targets[t].POSITION),nd=accessorValues(a,ab,p.targets[t].POSITION);od.forEach((v,i)=>{if(new Vector3(...old[i]).applyMatrix4(w).y>1.40)assert.ok(new Vector3(...nd[i]).distanceTo(new Vector3(...v).multiplyScalar(scale))<1e-6,'blink must follow the smaller face');});}
  }
  assert.ok(oldTop-newTop>.05&&oldTop-newTop<.21,'visible, bounded reduction of head height');
  if(id==='nika')assert.ok(contacts>=20,'actual cut neck ring covered by collar protection');
  assert.ok(a.asset.extras.headProportions.minJacobianDeterminant>0,'no continuous neck fold');
});
