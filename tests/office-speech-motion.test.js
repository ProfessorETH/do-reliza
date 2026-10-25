import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { OfficeActor } from '../office-actors.js';
import { createDemoGame } from '../demo.js';

function seated(){
  const s=createDemoGame(),id=s.team[0],model=new THREE.Group();
  const part=(name,parent=model)=>{const n=new THREE.Group();n.name=`Release3D_${id}_${name}`;parent.add(n);return n;};
  const hips=part('Hips'),torso=part('Torso',hips);part('Head',torso);
  for(const side of ['Left','Right']){
    const thigh=part(side+'Thigh',hips),shin=part(side+'Shin',thigh),foot=part(side+'Foot',shin);
    foot.add(new THREE.Mesh(new THREE.BoxGeometry(.15,.07,.25),new THREE.MeshBasicMaterial()));
    part(side+'Wrist',part(side+'Forearm',part(side+'UpperArm',torso)));
  }
  const actor=new OfficeActor(id,model,'#abc',0);actor.destination(s,true);return actor;
}
test('speaking turns towards the colleague without moving the chair and settles afterwards',()=>{
  const a=seated(),activity={stage:'work',task:null};a.update(1/60,0,[a],activity,false,false);
  const root=a.group.position.toArray(),yaw=a.group.rotation.y+.4,target=[a.point[0]-Math.sin(yaw)*2,a.point[1]-Math.cos(yaw)*2];
  const baseline=a.joints.Head.rotation.y;
  for(let i=0;i<90;i++)a.update(1/60,0,[a],{...activity,speaking:true,speechLevel:.7,speechTarget:target},false,false);
  assert.ok(a.joints.Head.rotation.y>baseline+.2);assert.deepEqual(a.group.position.toArray(),root);
  for(let i=0;i<400;i++)a.update(1/60,0,[a],activity,false,false);
  assert.ok(a.talkBlend<.00001);assert.ok(Math.abs(a.joints.Head.rotation.y-baseline)<.00001);assert.deepEqual(a.group.position.toArray(),root);
});
test('reduced motion removes voice-driven nodding',()=>{
  const a=seated(),activity={stage:'work',task:null};a.update(1/30,0,[a],activity,true,false);const x=a.joints.Head.rotation.x;
  for(let i=0;i<100;i++)a.update(1/30,i/30,[a],{...activity,speaking:true,speechLevel:i%2},true,false);
  assert.ok(Math.abs(a.joints.Head.rotation.x-x)<.00001);
});
