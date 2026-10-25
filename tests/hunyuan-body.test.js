import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import * as THREE from '../vendor/three/three.module.js';
import {parseGLB,packGLB,accessorValues} from '../scripts/attach-portrait-head.js';
import {attachHunyuanBody,recoverHunyuanBodyBase} from '../scripts/attach-hunyuan-body.js';
import {OfficeActor} from '../office-actors.js';
import {poseActor} from '../office-pose.js';
import {loadHunyuanBodyBytes} from './hunyuan-body-assets.js';

registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:specifier,context);}});
const {GLTFLoader}=await import('../vendor/three/loaders/GLTFLoader.js');
const {clone}=await import('../vendor/three/utils/SkeletonUtils.js');
const baseBytes=recoverHunyuanBodyBase(await readFile(new URL('../assets/models/mira.glb',import.meta.url)));

function fixture(){
  const base=parseGLB(baseBytes),j=structuredClone(base.json),chunks=[];let length=0;
  j.bufferViews=[];j.accessors=[];j.images=[];j.textures=[];j.samplers=[];j.materials=[{pbrMetallicRoughness:{baseColorFactor:[.2,.5,.3,1]}}];j.meshes=[];j.animations=[];
  j.asset.extras={hunyuanBodyStage:{neckCutY:1.34,ankleCutY:.13}};
  j.nodes.forEach(n=>{delete n.mesh;delete n.skin;});
  function add(values,type,componentType=5126,target=34962){
    const flat=values.flat(),bytes=componentType===5123?Buffer.from(new Uint16Array(flat).buffer):Buffer.from(new Float32Array(flat).buffer),pad=Buffer.alloc((4-length%4)%4);
    chunks.push(pad,bytes);length+=pad.length;const vi=j.bufferViews.length;j.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length,target});length+=bytes.length;
    const index=j.accessors.length;j.accessors.push({bufferView:vi,componentType,type,count:values.length});return index;
  }
  const originalSkin=base.json.skins[0],ibms=accessorValues(base.json,base.bin,originalSkin.inverseBindMatrices).reverse();
  j.skins=[{...structuredClone(originalSkin),joints:[...originalSkin.joints].reverse(),inverseBindMatrices:add(ibms,'MAT4')}];
  const torso=j.skins[0].joints.findIndex(n=>j.nodes[n].name==='Skin_mira_Torso');
  for(const part of ['Body','LeftFoot','RightFoot']){
    const left=part==='LeftFoot';
    const positions=part==='Body'?[[0,1,0],[.1,1,0],[0,1.2,0]]:[[left?-.16:.06,.012,-.15],[left?-.06:.16,.012,-.15],[left?-.115:.115,.13,.05]];
    const attributes={POSITION:add(positions,'VEC3'),NORMAL:add([[0,0,-1],[0,0,-1],[0,0,-1]],'VEC3'),TEXCOORD_0:add([[0,0],[1,0],[0,1]],'VEC2')};
    if(part==='Body'){attributes.JOINTS_0=add([[torso,0,0,0],[torso,0,0,0],[torso,0,0,0]],'VEC4',5123);attributes.WEIGHTS_0=add([[1,0,0,0],[1,0,0,0],[1,0,0,0]],'VEC4');}
    const mi=j.meshes.length;j.meshes.push({primitives:[{attributes,indices:add([[0],[1],[2]],'SCALAR',5123,34963),material:0}]});
    const ni=j.nodes.length;j.nodes.push({name:`HB_mira_${part}`,mesh:mi,...(part==='Body'?{skin:0}:{}),extras:{hunyuanBodyPart:part}});j.scenes[j.scene??0].nodes.push(ni);
  }
  j.buffers=[{byteLength:length}];return packGLB(j,Buffer.concat(chunks));
}

test('new weighted body and real shoe surfaces preserve every accepted head/rig/animation byte',()=>{
  const staged=fixture(),before=parseGLB(baseBytes),{bytes,report}=attachHunyuanBody(baseBytes,staged),after=parseGLB(bytes);
  assert.ok(after.bin.subarray(0,before.bin.length).equals(before.bin));
  assert.ok(recoverHunyuanBodyBase(bytes).equals(baseBytes),'accepted v4 base recovers exactly after future v5 promotion');
  assert.deepEqual(after.json.animations,before.json.animations);assert.deepEqual(after.json.skins,before.json.skins);
  assert.deepEqual(after.json.nodes.find(n=>n.name==='DR_mira_PortraitHead'),before.json.nodes.find(n=>n.name==='DR_mira_PortraitHead'));
  for(const bone of before.json.skins[0].joints)assert.deepEqual(after.json.nodes[bone],before.json.nodes[bone]);
  const body=after.json.nodes.find(n=>n.name==='DR_mira_Skin'),p=after.json.meshes[body.mesh].primitives[0];
  const torso=after.json.skins[0].joints.findIndex(n=>after.json.nodes[n].name==='Skin_mira_Torso');
  assert.equal(accessorValues(after.json,after.bin,p.attributes.JOINTS_0)[0][0],torso,'staged reversed joint order remapped by bone name');
  assert.equal(report.parts.Body.triangles,1);assert.equal(report.acceptedPortraitPreserved,true);
  for(const side of ['Left','Right'])assert.notEqual(after.json.nodes.find(n=>n.name===`DR_mira_${side}Foot_Rigid`).mesh,before.json.nodes.find(n=>n.name===`DR_mira_${side}Foot_Rigid`).mesh);
});

test('staged body uses actual existing skeleton deformation and shoes keep finite runtime sole contacts',async()=>{
  const {bytes}=attachHunyuanBody(baseBytes,fixture());const loader=new GLTFLoader();loader.register(()=>({name:'BODY_GEOMETRY_TEXTURES',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  const actor=new OfficeActor('mira',clone(gltf.scene),'#7ed9b8',0),body=actor.group.getObjectByName('DR_mira_Skin');
  assert.ok(body.isSkinnedMesh);assert.equal(actor.skinBindings.length,25);
  const before=body.getVertexPosition(0,new THREE.Vector3()).clone();
  actor.joints.Torso.rotation.z=.3;actor.group.updateMatrixWorld(true);
  // Office solver updates the existing real bones from the independent controls.
  const {updateOfficeSkin}=await import('../office-skeleton.js');updateOfficeSkin(actor);
  const after=body.getVertexPosition(0,new THREE.Vector3());assert.ok(after.distanceTo(before)>.005,'new mesh really deforms with Torso');
  for(const side of ['Left','Right']){
    assert.equal(actor.footMeshes[side].parent.name,`Skin_mira_${side}Foot`);
    assert.ok(actor.footMeshes[side].geometry.attributes.position.count>0);
  }
  for(let i=0;i<80;i++){actor.gait=i<40?1:0;actor.sit=i<40?0:(i-40)/39;actor.phase=i/40;poseActor(actor,i/60,false);assert.ok(actor.group.position.toArray().every(Number.isFinite));}
  const copy=clone(gltf.scene),mixer=new THREE.AnimationMixer(copy);mixer.clipAction(gltf.animations.find(c=>c.name==='Sit')).play();mixer.update(.8);copy.updateMatrixWorld(true);
  assert.ok(copy.getObjectByName('Skin_mira_Hips').getWorldPosition(new THREE.Vector3()).y<.8);
});

test('real deployable Mira body survives walk, chair lowering and keyboard poses with actual shoe soles',async()=>{
  const bytes=await loadHunyuanBodyBytes('mira');
  const loader=new GLTFLoader();loader.register(()=>({name:'REAL_BODY_GEOMETRY_TEXTURES',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),''),a=new OfficeActor('mira',clone(gltf.scene),'#7ed9b8',0),body=a.group.getObjectByName('DR_mira_Skin');
  const positions=body.geometry.attributes.position,index=body.geometry.index;
  assert.ok(positions.count>10000,'real generated body rather than unit-test triangles');
  const edges=[];
  for(let k=0;k<index.count;k+=87){const i=index.getX(k),j=index.getX(k+1),before=new THREE.Vector3().fromBufferAttribute(positions,i).distanceTo(new THREE.Vector3().fromBufferAttribute(positions,j));if(before>.0005)edges.push({i,j,before});}
  const ratios=[];let worstExpansion={delta:0};
  for(const state of [{gait:1,phase:.05,sit:0,workBlend:0},{gait:1,phase:.32,sit:0,workBlend:0},{gait:1,phase:.72,sit:0,workBlend:0},{gait:0,phase:0,sit:.5,workBlend:0},{gait:0,phase:0,sit:1,workBlend:0},{gait:0,phase:0,sit:1,workBlend:1}]){
    Object.assign(a,state);poseActor(a,.8,false);a.group.updateMatrixWorld(true);
    const cache=new Map(),point=i=>{if(!cache.has(i))cache.set(i,body.getVertexPosition(i,new THREE.Vector3()));return cache.get(i);};
    for(const e of edges){const p=point(e.i),q=point(e.j),after=p.distanceTo(q);assert.ok([...p.toArray(),...q.toArray()].every(Number.isFinite));assert.ok(p.length()<2.5,'body does not explode out of the character');ratios.push(after/e.before);if(after-e.before>worstExpansion.delta)worstExpansion={delta:after-e.before,before:e.before,after,rest:new THREE.Vector3().fromBufferAttribute(positions,e.i).toArray(),state};}
    for(const side of ['Left','Right']){assert.ok(Number.isFinite(a.soleHeight(side,0)));assert.ok(new THREE.Box3().setFromObject(a.footMeshes[side],true).min.y>-.008,'actual new shoe surface stays above floor');}
  }
  ratios.sort((x,y)=>x-y);const p99=ratios[Math.floor(ratios.length*.99)],max=ratios.at(-1);
  console.log(`Real Hunyuan body edge stretch: p99=${p99.toFixed(3)}, max=${max.toFixed(3)}, samples=${ratios.length}`);
  console.log(`Real Hunyuan body largest sampled edge expansion: ${JSON.stringify(worstExpansion)}`);
  assert.ok(p99<3,'joint weights do not tear a material portion of the body');
});

test('unsafe staged weights, moved bind anchors, missing feet and generated head remnants are rejected',()=>{
  const source=fixture();
  for(const mutate of [
    j=>{delete j.nodes.find(n=>n.name==='HB_mira_LeftFoot').mesh;},
    j=>{j.nodes.find(n=>n.name==='Skin_mira_Torso').translation[1]+=.02;},
  ]){const {json,bin}=parseGLB(source);mutate(json);assert.throws(()=>attachHunyuanBody(baseBytes,packGLB(json,bin)));}
  const {json,bin}=parseGLB(source),body=json.nodes.find(n=>n.name==='HB_mira_Body'),p=json.meshes[body.mesh].primitives[0],a=json.accessors[p.attributes.WEIGHTS_0],v=json.bufferViews[a.bufferView],copy=Buffer.from(bin);copy.writeFloatLE(.2,v.byteOffset);assert.throws(()=>attachHunyuanBody(baseBytes,packGLB(json,copy)),/normalized/);
  const positions=json.accessors[p.attributes.POSITION],view=json.bufferViews[positions.bufferView],headCopy=Buffer.from(bin);headCopy.writeFloatLE(1.6,view.byteOffset+4);assert.throws(()=>attachHunyuanBody(baseBytes,packGLB(json,headCopy)),/head or shoe/);
  const attached=attachHunyuanBody(baseBytes,source).bytes;assert.throws(()=>attachHunyuanBody(attached,source),/already transplanted/);
});
