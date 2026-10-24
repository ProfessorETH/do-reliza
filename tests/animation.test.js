import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import * as THREE from '../vendor/three/three.module.js';
import { OfficeActor } from '../office-actors.js';
import { DESKS, LOUNGE_SEAT, isWalkable, distance } from '../office-layout.js';
import { poseActor } from '../office-pose.js';

// Node has no browser import map; resolve the unmodified vendored addons locally.
registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier === 'three' ? new URL('../vendor/three/three.module.js', import.meta.url).href : specifier, context); } });
const { GLTFLoader } = await import('../vendor/three/loaders/GLTFLoader.js');
const { clone: cloneSkeleton } = await import('../vendor/three/utils/SkeletonUtils.js');

const ids = ['mira','pixel','nord','iskra','saga','echo'];
const models = new Map();
async function actor(id = 'mira', order = 0) {
  if (!models.has(id)) {
    const bytes = await readFile(new URL(`../assets/models/${id}.glb`, import.meta.url));
    const loader=new GLTFLoader();
    loader.register(()=>({name:'TEST_GEOMETRY_ONLY_TEXTURES',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
    models.set(id, await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''));
  }
  return new OfficeActor(id, cloneSkeleton(models.get(id).scene), '#7ed9b8', order);
}
const activity = { stage:'plan', task:null };
function update(a, frames, dt = 1 / 60, mode = activity) {
  for (let i = 0; i < frames; i++) {
    a.update(dt, i * dt, [a], mode, false, false);
    assert.ok(a.group.position.toArray().every(Number.isFinite), 'finite root motion');
  }
}

test('all six exported Blender rigs have wrists, fingers and blink pivots', async () => {
  for (const id of ids) {
    const a = await actor(id);
    for (const name of ['Hips','Torso','Head','EyeLeft','EyeRight','LeftWrist','RightWrist','LeftFinger0','RightFinger3','LeftFoot','RightFoot']) assert.ok(a.joints[name], `${id}: missing ${name}`);
  }
});

test('six portable skins contain weighted bones, five clips and bone-attached eyes/shoes', async () => {
  for (const id of ids) {
    const a=await actor(id),gltf=models.get(id);let skins=0;
    assert.equal(a.skinBindings.length,25);
    assert.deepEqual(gltf.animations.map(c=>c.name).sort(),['Idle','Sit','Stand','Walk','Work']);
    a.group.traverse(mesh=>{
      if(!mesh.isSkinnedMesh)return;skins++;
      assert.equal(mesh.skeleton.bones.length,25);
      if(mesh.name===`DR_${id}_Skin`){
        const positions=mesh.geometry.attributes.position;let legs=0,torso=0;
        for(let i=0;i<positions.count;i++){
          const x=Math.abs(positions.getX(i)),y=positions.getY(i);
          if(x<.2&&y>.2&&y<.7)legs++;
          if(x<.18&&y>1.05&&y<1.25)torso++;
        }
        assert.ok(legs>200&&torso>200,`${id}: intact torso and legs`);
      }
      const weights=mesh.geometry.attributes.skinWeight;
      for(let i=0;i<weights.count;i++)assert.ok(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<.001,`${id}: normalized weights`);
    });
    assert.equal(skins,2);
    for(const side of ['Left','Right']){
      assert.equal(a.footMeshes[side].parent.name,`Skin_${id}_${side}Foot`);
      assert.equal(a.eyeMeshes[side].parent.name,`Skin_${id}_Head`);
    }
    const copy=cloneSkeleton(gltf.scene),mixer=new THREE.AnimationMixer(copy);
    const hip=copy.getObjectByName(`Skin_${id}_Hips`),start=hip.getWorldPosition(new THREE.Vector3());
    const sit=mixer.clipAction(gltf.animations.find(c=>c.name==='Sit'));sit.setLoop(THREE.LoopOnce,1);sit.clampWhenFinished=true;sit.play();mixer.update(1.2);copy.updateMatrixWorld(true);
    const lowered=hip.getWorldPosition(new THREE.Vector3());assert.ok(start.y-lowered.y>.25,`${id}: saved Sit lowers pelvis`);
    for(const side of ['Left','Right']){
      const foot=copy.getObjectByName(`DR_${id}_${side}Foot_Rigid`),box=new THREE.Box3().setFromObject(foot,true);
      assert.ok(Math.abs(box.min.y)<.012,`${id}: portable Sit sole ${box.min.y}`);
    }
    mixer.stopAllAction();
    const walk=mixer.clipAction(gltf.animations.find(c=>c.name==='Walk'));walk.play();
    const ankle=copy.getObjectByName(`Skin_${id}_LeftFoot`),steps=[];
    for(let frame=0;frame<20;frame++){
      mixer.update(.04);copy.updateMatrixWorld(true);steps.push(ankle.getWorldPosition(new THREE.Vector3()).z);
      for(const side of ['Left','Right'])assert.ok(new THREE.Box3().setFromObject(copy.getObjectByName(`DR_${id}_${side}Foot_Rigid`),true).min.y>-.012,`${id}: portable Walk stays above floor`);
    }
    assert.ok(Math.max(...steps)-Math.min(...steps)>.3,`${id}: Walk advances feet`);
    mixer.stopAllAction();mixer.clipAction(gltf.animations.find(c=>c.name==='Work')).play();mixer.update(.1);
    const finger=copy.getObjectByName(`Skin_${id}_LeftFinger1`),before=finger.quaternion.clone();mixer.update(.13);
    assert.ok(before.angleTo(finger.quaternion)>.002,`${id}: Work animates fingers`);
  }
});

test('posing one cloned skeleton never moves another character instance',async()=>{
  const first=await actor(),second=await actor();
  const bone=second.skinBindings.find(b=>b.bone.name.endsWith('_LeftThigh')).bone;
  const before=bone.matrixWorld.clone();first.sit=1;poseActor(first,1,true);
  assert.deepEqual(bone.matrixWorld.elements,before.elements);
  assert.notEqual(first.skinBindings[0].bone,second.skinBindings[0].bone);
});

test('both feet remain on or above floor through a full gait and chair lowering', async () => {
  const a = await actor(); a.group.position.set(0,0,0);
  for (let i = 0; i < 120; i++) {
    a.sit = i < 60 ? 0 : (i - 60) / 59; a.gait = i < 60 ? 1 : 0; a.phase = i / 60;
    poseActor(a, i / 60, false); a.group.updateMatrixWorld(true);
    for (const side of ['Left','Right']) {
      const box = new THREE.Box3().setFromObject(a.footMeshes[side],true);
      assert.ok(box.min.y > -.006, `${side} foot penetrated floor at ${i}: ${box.min.y}`);
      const phase=((a.phase+(side==='Right'?.5:0))%1+1)%1;
      if (a.sit > 0 || phase < .6) assert.ok(Math.abs(box.min.y) < .006, `support foot floated at ${i}: ${box.min.y}`);
    }
  }
});

test('walk, align, lower and slide finish at all desks at 30/60/120 Hz', async () => {
  for (const dt of [1/30,1/60,1/120]) for (let seat = 0; seat < 3; seat++) {
    const a = await actor(); const game = { seats: [null,null,null], officeTargets:{} }; game.seats[seat] = a.id;
    a.destination(game); const states = new Set(); let previous = a.point;
    for (let i = 0; i < 30 / dt && a.moving; i++) {
      a.update(dt, i * dt, [a], activity, false, false); states.add(a.state);
      assert.ok(distance(previous, a.point) < .11, `root teleported: ${a.state}`); previous = a.point;
      if (a.state === 'walk') assert.ok(isWalkable(a.point));
    }
    assert.equal(a.state, 'seated'); assert.equal(a.sit, 1); assert.equal(a.chairPull, 0);
    assert.ok(distance(a.point, DESKS[seat].seat) < .001);
    for (const state of ['walk','align','lower','slide']) assert.ok(states.has(state), `missing ${state}`);
  }
});

test('seated agent stands before walking and survives destination changes mid-transition', async () => {
  const a = await actor(), game = { seats: ['mira',null,null], officeTargets:{} };
  a.destination(game, true); game.seats = [null,null,null]; game.officeTargets.mira = [3,3]; a.destination(game);
  update(a, 20); assert.equal(a.state, 'pullout');
  game.seats = [null,'mira',null]; a.destination(game); update(a, 1800);
  assert.equal(a.state, 'seated'); assert.ok(distance(a.point, DESKS[1].seat) < .001);
  game.seats = [null,null,'mira']; a.destination(game);
  for (let i = 0; i < 1800 && a.state !== 'lower'; i++) update(a, 1);
  update(a, 15); game.seats = [null,null,null]; game.officeTargets.mira = [3,3]; a.destination(game); update(a, 1800);
  assert.equal(a.state, 'idle'); assert.equal(a.sit, 0); assert.ok(distance(a.point, [3,3]) < .001);
});

test('hands reach keyboard and mouse without changing seated pelvis contact', async () => {
  for (const id of ids) {
    const a = await actor(id); a.destination({ seats:[id,null,null], officeTargets:{} }, true);
    update(a, 180, 1/60, { stage:'work', task:{skill:'design'} });
    for (const time of [1, 6]) {
      poseActor(a, time, true); a.group.updateMatrixWorld(true);
      for (const side of ['Left','Right']) {
        const p = a.joints.Hips.worldToLocal(a.joints[side + 'Wrist'].getWorldPosition(new THREE.Vector3()));
        assert.ok(p.y + .6 > .85 && p.y + .6 < .91, `${id} ${side} wrist height: ${p.y+.6}`);
        assert.ok(-p.z > .44 && -p.z < .57, `${id} ${side} wrist reach: ${-p.z}`);
      }
      assert.equal(a.joints.Hips.position.y, .6);
    }
  }
});

test('employees leave each desk, sit in the beanbag, relax and stand before returning without teleporting',async()=>{
  for(const dt of [1/30,1/60,1/120])for(let slot=0;slot<3;slot++){
    const a=await actor('mira',slot),game={seats:[null,null,null],officeTargets:{},life:{members:{mira:{restTrip:null,restSerial:1}}}};
    game.seats[slot]='mira';a.destination(game,true);const seats=[...game.seats];
    game.life.members.mira.restTrip={phase:'outbound',slot};a.destination(game);
    const states=new Set();let previous=a.point,planted=null;
    for(let frame=0;frame<45/dt&&a.moving;frame++){
      a.update(dt,frame*dt,[a],{stage:'work',task:{skill:'code'}},false,false);states.add(a.state);
      assert.ok(distance(previous,a.point)<.11,'continuous lounge travel');previous=a.point;
      if(a.state==='walk')assert.ok(isWalkable(a.point));
      if(a.state==='rest-lower'&&a.sit>.02&&a.sit<.98){
        a.group.updateMatrixWorld(true);const feet=['Left','Right'].map(side=>a.joints[side+'Foot'].getWorldPosition(new THREE.Vector3()));
        if(planted)feet.forEach((p,i)=>assert.ok(Math.hypot(p.x-planted[i].x,p.z-planted[i].z)<.015,'planted foot does not slide during lowering'));
        planted=feet;
        for(const side of ['Left','Right'])assert.ok(Math.abs(new THREE.Box3().setFromObject(a.footMeshes[side],true).min.y)<.006,'lowering soles stay grounded');
      }
    }
    assert.equal(a.failed,false);assert.equal(a.state,'resting');assert.equal(a.sit,1);
    assert.ok(distance(a.point,LOUNGE_SEAT.point)<.001);
    for(const state of ['pullout','rise','exit','walk','rest-align','rest-lower'])assert.ok(states.has(state),state);
    update(a,120,dt,{stage:'work',task:{skill:'code'}});assert.ok(a.workBlend<.01,'no typing during rest');
    assert.ok(a.restBlend>.95);assert.equal(a.joints.Hips.position.y,LOUNGE_SEAT.hipHeight);
    for(const side of ['Left','Right']){a.group.updateMatrixWorld(true);assert.ok(Math.abs(new THREE.Box3().setFromObject(a.footMeshes[side],true).min.y)<.006,'rest soles touch floor');}
    poseActor(a,1,false);const relaxed=a.joints.Head.quaternion.clone();poseActor(a,2.5,false);assert.ok(relaxed.angleTo(a.joints.Head.quaternion)>.001,'ambient relaxation animates');
    game.life.members.mira.restTrip.phase='returning';a.destination(game);previous=a.point;
    assert.equal(a.state,'rest-rise');
    for(let frame=0;frame<45/dt&&a.moving;frame++){
      a.update(dt,frame*dt,[a],activity,false,false);assert.ok(distance(previous,a.point)<.11);previous=a.point;
    }
    assert.equal(a.failed,false);assert.equal(a.state,'seated',JSON.stringify({dt,slot,point:a.point,path:a.path,state:a.state,speed:a.speed}));assert.equal(a.sit,1);
    assert.ok(distance(a.point,DESKS[slot].seat)<.001);assert.deepEqual(game.seats,seats);
  }
});

test('every restored rig sits in the lounge and keeps a quiet pose with reduced motion',async()=>{
  for(const id of ids){
    const a=await actor(id),game={seats:[id,null,null],officeTargets:{},life:{members:{[id]:{restSerial:1,restTrip:{phase:'resting',slot:0}}}}};
    a.destination(game,true);poseActor(a,1,true);a.group.updateMatrixWorld(true);
    assert.equal(a.state,'resting');assert.equal(a.chairSeat,-1);assert.equal(a.sit,1);
    for(const side of ['Left','Right'])assert.ok(Math.abs(new THREE.Box3().setFromObject(a.footMeshes[side],true).min.y)<.006,`${id}: grounded lounge feet`);
    const head=a.joints.Head.quaternion.clone();poseActor(a,8,true);assert.ok(head.angleTo(a.joints.Head.quaternion)<.000001);
  }
});
