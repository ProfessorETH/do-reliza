import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Matrix4,Vector3,Quaternion} from '../vendor/three/three.module.js';
import {parseGLB,accessorValues} from '../scripts/attach-portrait-head.js';
import {recoverMiraPolishBase} from '../scripts/polish-mira.js';

const bytes=await readFile(new URL('../assets/models/mira.glb',import.meta.url));
const beforeBytes=recoverMiraPolishBase(bytes),after=parseGLB(bytes),before=parseGLB(beforeBytes);
const {json:a,bin:ab}=after,{json:b,bin:bb}=before;
function world(doc,index){
  const n=doc.nodes[index],parent=doc.nodes.findIndex(n=>(n.children??[]).includes(index));
  const m=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));
  return parent<0?m:m.premultiply(world(doc,parent));
}

test('Mira polish is reversible and preserves the portable skeleton, all clips and portrait blinking',()=>{
  assert.equal(a.asset.extras.miraPolishVersion,1);
  assert.equal(createHash('sha256').update(beforeBytes).digest('hex'),'849a50fb5168020d45247fa0092041d440c991c99eca60acf4fdd72d45789dd6');
  assert.ok(ab.subarray(0,bb.length).equals(bb),'all previous model binary data retained exactly');
  assert.deepEqual(a.skins,b.skins);assert.deepEqual(a.animations,b.animations);
  for(let i=0;i<b.nodes.length;i++)for(const k of ['name','translation','rotation','scale','matrix','skin'])assert.deepEqual(a.nodes[i][k],b.nodes[i][k],`${i} ${k}`);
  const node=a.nodes.find(n=>n.name==='DR_mira_PortraitHead');
  assert.deepEqual(a.meshes[node.mesh].primitives[0].targets,b.meshes[node.mesh].primitives[0].targets);
});

test('Mira central face and upper throat retain their original geometry and UV coordinates',()=>{
  const ni=a.nodes.findIndex(n=>n.name==='DR_mira_PortraitHead'),p=a.meshes[a.nodes[ni].mesh].primitives[0],q=b.meshes[b.nodes[ni].mesh].primitives[0];
  const now=accessorValues(a,ab,p.attributes.POSITION),old=accessorValues(b,bb,q.attributes.POSITION),w=world(b,ni);
  assert.equal(now.length,old.length);assert.equal(p.attributes.TEXCOORD_0,q.attributes.TEXCOORD_0);
  let protectedCount=0,throatCount=0;
  old.forEach((v,i)=>{const p=new Vector3(...v).applyMatrix4(w),face=Math.abs(p.x)<.075&&p.y>1.44&&p.y<1.68&&p.z<-.085,throat=Math.abs(p.x)<.04&&p.y>1.415&&p.y<1.44&&p.z<0;
    if(face||throat){if(face)protectedCount++;if(throat)throatCount++;assert.ok(new Vector3(...v).distanceTo(new Vector3(...now[i]))<1e-6,'face and upper throat must not be sculpted during lower neck cleanup');}});
  assert.ok(protectedCount>500,'real central face samples covered');
  assert.ok(throatCount>20,'actual upper throat samples covered');
});

test('Mira hand/collar changes preserve the rest of the body, real UVs and normalized weights',()=>{
  const node=a.nodes.find(n=>n.name==='DR_mira_Skin'),p=a.meshes[node.mesh].primitives[0],q=b.meshes[node.mesh].primitives[0];
  const now=accessorValues(a,ab,p.attributes.POSITION),old=accessorValues(b,bb,q.attributes.POSITION);
  const uv=accessorValues(a,ab,p.attributes.TEXCOORD_0),oldUV=accessorValues(b,bb,q.attributes.TEXCOORD_0);
  const weights=accessorValues(a,ab,p.attributes.WEIGHTS_0),joints=accessorValues(a,ab,p.attributes.JOINTS_0);
  let protectedCount=0;
  old.forEach((v,i)=>{if(v[1]<1.31&&!(Math.abs(v[0])>.37&&v[1]>.54&&v[1]<1.01)){protectedCount++;assert.deepEqual(now[i],v,'torso/legs outside the edit domains unchanged');}assert.deepEqual(uv[i],oldUV[i],'original UV seams stay exact');});
  assert.ok(protectedCount>10000);
  weights.forEach((w,i)=>{assert.ok(Math.abs(w.reduce((s,v)=>s+v,0)-1)<.002);assert.ok(joints[i].every(j=>Number.isInteger(j)&&j>=0&&j<a.skins[0].joints.length));});
  for(const primitive of a.meshes[node.mesh].primitives){
    const indices=accessorValues(a,ab,primitive.indices).flat();assert.equal(indices.length%3,0);assert.ok(indices.every(i=>i>=0&&i<now.length));
  }
});
