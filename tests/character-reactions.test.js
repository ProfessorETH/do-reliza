import { coffeeArrival } from '../assets/coffee-trip.js';
import { careFor } from '../assets/studio-life.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { OfficeActor } from '../office-actors.js';
import { createDemoGame } from '../demo.js';
import { planInspection, reactionForChanges, reactionMotion } from '../assets/character-reactions.js';
import { ALL_DESKS, distance, isWalkable, clearSegment } from '../office-layout.js';

function actor(id,order=0){
  const model=new THREE.Group();
  const part=(name,parent=model)=>{const n=new THREE.Group();n.name=`Release3D_${id}_${name}`;parent.add(n);return n;};
  const hips=part('Hips'),torso=part('Torso',hips);part('Head',torso);
  for(const side of ['Left','Right']){
    const thigh=part(side+'Thigh',hips),shin=part(side+'Shin',thigh),foot=part(side+'Foot',shin);
    foot.add(new THREE.Mesh(new THREE.BoxGeometry(.15,.07,.25),new THREE.MeshBasicMaterial()));
    const upper=part(side+'UpperArm',torso),fore=part(side+'Forearm',upper);part(side+'Wrist',fore);
  }
  return new OfficeActor(id,model,'#aacccc',order);
}

test('reactions match outcomes and settle without residual motion',()=>{
  assert.equal(reactionForChanges([{key:'morale',delta:8}]),'joy');
  assert.equal(reactionForChanges([{key:'morale',delta:-8},{key:'stress',delta:10}]),'sad');
  assert.equal(reactionForChanges([{key:'stress',delta:-12},{key:'morale',delta:6}]),'calm');
  for(const kind of ['joy','sad','calm','curious']){
    assert.equal(reactionMotion(kind,0).strength,0);assert.equal(reactionMotion(kind,3).strength,0);
    assert.ok(reactionMotion(kind,1).strength>.9);assert.equal(reactionMotion(kind,1,true).wave,0);
  }
});
test('inspection slots are reachable, separated and clear of furniture for every upgrade',()=>{
  for(const id of ['coffee','lounge','quiet','computers','desk4','desk5']){
    const s=createDemoGame();if(['desk4','desk5'].includes(id)){s.life.upgrades=['desk4','desk5'];s.seats.push(null,null);}
    const actors=s.team.map((id,i)=>({id,state:'seated',point:ALL_DESKS[i].seat}));
    const visits=planInspection(s,id,actors);assert.equal(visits.length,2,id);
    assert.ok(distance(visits[0].point,visits[1].point)>.8);
    for(const visit of visits)assert.ok(isWalkable(visit.point,undefined,s.seats.length));
  }
});
test('employee stands, walks to the purchase, inspects it and returns without mutating the game',()=>{
  const s=createDemoGame(),a=actor(s.team[0]);a.destination(s,true);
  const visit=planInspection(s,'lounge',[{id:a.id,state:a.state,point:a.point}])[0];
  const before=structuredClone(s),states=new Set();a.inspect({...visit,key:1},s);
  for(let i=0;i<1800&&a.visit;i++){
    const old=a.point;a.update(1/30,i/30,[a],{stage:s.stage,task:null},false,false);states.add(a.state);
    if(a.state==='walk'&&distance(old,a.point)>.001)assert.ok(clearSegment(old,a.point,false,s.seats.length));
    assert.ok(Number.isFinite(a.joints.Hips.position.y));
  }
  assert.ok(states.has('rise'));assert.ok(states.has('walk'));assert.ok(states.has('inspect'));assert.equal(a.visit,null);
  assert.equal(a.state,'seated');assert.ok(distance(a.point,ALL_DESKS[0].seat)<.01);assert.deepEqual(s,before);
});
test('work and scheduled breaks cancel a cosmetic inspection and retain their real destination',()=>{
  for(const next of ['work','break']){
    const s=createDemoGame(),a=actor(s.team[0]);a.destination(s,true);
    const visit=planInspection(s,'coffee',[{id:a.id,state:a.state,point:a.point}])[0];a.inspect({...visit,key:1},s);
    for(let i=0;i<150;i++)a.update(1/30,i/30,[a],{stage:s.stage,task:null},false,false);
    if(next==='work')s.stage='work';else{s.life.members[a.id].restTrip={phase:'outbound',slot:0};s.life.members[a.id].restSerial=1;}
    a.destination(s);assert.equal(a.visit,null);
    assert.equal(a.loungeTarget,next==='break');assert.equal(a.seat,next==='break'?-1:0);
  }
});

test('coffee animation picks up the cup, drinks before recovery, puts it down and returns to the assigned desk',()=>{
  const s=createDemoGame();s.stage='work';s.life.upgrades=['coffee'];
  const id=s.team[0],m=s.life.members[id];m.energy=30;m.morale=40;
  const a=actor(id);a.destination(s,true);assert.equal(careFor(s,id,'coffee'),null);a.destination(s);
  const states=new Set();let held=false,drank=false;
  for(let i=0;i<1800&&m.coffeeTrip;i++){
    a.update(1/30,i/30,[a],{stage:s.stage,task:null},false,false);states.add(a.state);held ||= a.cup.visible;
    if(m.coffeeTrip.phase==='outbound'&&a.state==='coffee-pick'){coffeeArrival(s,id,'station');a.destination(s);}
    if(m.coffeeTrip.phase==='drinking'&&a.state==='coffee-put'){assert.equal(m.energy,30);assert.ok(held);drank=coffeeArrival(s,id,'drank');a.destination(s);}
    if(m.coffeeTrip?.phase==='returning'&&a.state==='seated'){coffeeArrival(s,id,'back');a.destination(s);}
    if(!drank)assert.equal(m.energy,30);
  }
  for(const state of ['rise','walk','coffee-pick','coffee-drink','coffee-put','seated'])assert.ok(states.has(state),state);
  assert.equal(m.coffeeTrip,null);assert.equal(m.energy,45);assert.equal(m.morale,45);assert.equal(a.cup.visible,false);
  assert.ok(distance(a.point,ALL_DESKS[0].seat)<.01);assert.equal(s.seats[0],id);
});
