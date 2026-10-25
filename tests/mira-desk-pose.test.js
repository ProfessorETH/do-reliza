import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import * as THREE from '../vendor/three/three.module.js';
import {OfficeActor} from '../office-actors.js';
import {poseActor} from '../office-pose.js';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:s,c);}});
const {GLTFLoader}=await import('../vendor/three/loaders/GLTFLoader.js');
async function mira(){
  const bytes=await readFile(new URL('../assets/models/mira.glb',import.meta.url)),loader=new GLTFLoader();
  loader.register(()=>({name:'MIRA_CONTACT_GEOMETRY',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  const actor=new OfficeActor('mira',gltf.scene,'#7ed9b8',0);
  actor.group.position.set(0,0,0);Object.assign(actor,{sit:1,workBlend:1,gait:0,activity:{stage:'work'}});return actor;
}

test('Mira lowers her elbows while preserving exact keyboard/mouse wrist targets and seat contact',async()=>{
  const actor=await mira(),v=new THREE.Vector3();
  for(const mouseBlend of [0,.5,1])for(const time of [.8,2.5,6.7]){
    actor.mouseBlend=mouseBlend;poseActor(actor,time,false);actor.group.updateMatrixWorld(true);
    assert.equal(actor.joints.Hips.position.y,.60,'chair contact must not move to make the hands reach');
    for(const side of ['Left','Right']){
      const elbow=actor.joints[side+'Forearm'].getWorldPosition(v).clone(),wrist=actor.joints[side+'Wrist'].getWorldPosition(v).clone();
      assert.ok(elbow.y<.89&&elbow.y>.78,'forearms rest at desk height instead of raised elbows');
      assert.ok(elbow.z>-.43,'elbow stays behind the desk edge');
      const m=side==='Right'?mouseBlend:0;
      assert.ok(Math.abs(wrist.y-(.864+.006*m))<.003,'keyboard/mouse vertical contact target retained');
      assert.ok(Math.abs(wrist.z-(-.55+.09*m))<.001,'keyboard/mouse depth retained within breathing motion');
      const sole=new THREE.Box3().setFromObject(actor.footMeshes[side],true).min.y;
      assert.ok(Math.abs(sole)<.008,'real soles stay on the floor');
    }
  }
});

test('Mira desk adjustment resets when standing, resting or reacting and never accumulates',async()=>{
  const actor=await mira();poseActor(actor,1,true);const working=actor.joints.Torso.position.z;
  poseActor(actor,1,true);assert.equal(actor.joints.Torso.position.z,working);
  for(const state of [{sit:0,workBlend:0},{sit:1,workBlend:0},{sit:1,workBlend:1,restBlend:1}]){
    Object.assign(actor,state);poseActor(actor,1,true);assert.equal(Math.abs(actor.joints.Torso.position.z),0);
  }
});
