import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { tick, activeTasks, supportTask, restoreOffice, validSave } from '../engine.js';
import { careFor, restArrival, scheduleIncident } from '../assets/studio-life.js';
import { coffeeArrival } from '../assets/coffee-trip.js';

function working(){const s=createDemoGame();s.stage='work';s.life.upgrades=['coffee'];s.progress.brief=100;s.progress.design=25;s.progress.code=10;s.choices={scope:'focus',review:'review-fix',bug:'fix'};s.life.incidentDone=true;s.life.conflictDone=true;return s;}
test('coffee pauses only its employee and resumes the same task after return',()=>{
  let s=working();const id=s.assignments.design,other=s.assignments.code,assignments=structuredClone(s.assignments);s.life.members[id].energy=40;
  careFor(s,id,'coffee');
  for(const phase of ['outbound','drinking','returning']){
    s=restoreOffice(JSON.parse(JSON.stringify(s)));assert.ok(validSave(s));assert.equal(s.life.members[id].coffeeTrip.phase,phase);
    const energy=s.life.members[id].energy,time=s.time,otherProgress=s.progress.code;
    assert.ok(tick(s));assert.equal(s.time,time+1);assert.equal(s.progress.design,25);assert.equal(s.life.members[id].energy,energy);
    if(otherProgress<100)assert.ok(s.progress.code>otherProgress);
    coffeeArrival(s,id,{outbound:'station',drinking:'drank',returning:'back'}[phase]);
  }
  const progress=s.progress.design;assert.ok(tick(s));assert.ok(s.progress.design>progress);assert.deepEqual(s.assignments,assignments);assert.equal(s.life.members[id].energy,48);
});
test('rest starts only after sitting; travelling and returning give no passive recovery',()=>{
  const s=working(),id=s.assignments.design,m=s.life.members[id];m.energy=20;m.stress=60;careFor(s,id,'break');
  tick(s);assert.equal(m.energy,20);assert.equal(m.breaks,1);assert.equal(s.progress.design,25);assert.ok(s.progress.code>10);
  restArrival(s,id,'resting');tick(s);assert.equal(m.energy,50);assert.equal(m.stress,45);assert.equal(m.restTrip.phase,'returning');
  tick(s);assert.equal(m.energy,50);assert.equal(s.progress.design,25);restArrival(s,id,'back');tick(s);assert.ok(s.progress.design>25);assert.equal(m.energy,43);
});
test('the clock still advances if every available task is waiting for an absent employee',()=>{
  const s=working();s.assignments.code=s.assignments.design;careFor(s,s.assignments.design,'coffee');
  assert.equal(activeTasks(s).length,0);const before=structuredClone(s.progress);assert.equal(tick(s),true);assert.equal(s.time,1);assert.deepEqual(s.progress,before);
});
test('release waits for pending care to complete, then settles without charging another hour',()=>{
  const s=working(),id=s.team[0];for(const key in s.progress)s.progress[key]=100;
  careFor(s,id,'coffee');assert.equal(tick(s),true);assert.equal(s.stage,'work');assert.equal(s.time,1);
  coffeeArrival(s,id,'station');coffeeArrival(s,id,'drank');coffeeArrival(s,id,'back');assert.equal(tick(s),true);assert.equal(s.stage,'result');assert.equal(s.time,1);assert.ok(validSave(s));
});
test('mentoring remains available to a working colleague while another gets coffee',()=>{
  const s=working();careFor(s,s.assignments.design,'coffee');assert.equal(typeof supportTask(s,'design'),'string');assert.equal(supportTask(s,'code'),null);
});
test('random desk incidents choose a present colleague while another is away',()=>{
  const s=working();careFor(s,s.team[0],'coffee');s.life.incidentDone=false;s.life.seed=0;s.time=4;
  assert.equal(scheduleIncident(s),true);assert.notEqual(s.life.incident.id,s.team[0]);
});
test('colleagues queued for the same chair or coffee station continue their ready tasks',()=>{
  for(const action of ['coffee','break']){
    const s=working(),owner=s.assignments.design,waiting=s.assignments.code;
    careFor(s,owner,action);careFor(s,waiting,action);
    assert.equal(s.life.members[waiting][action==='coffee'?'coffeeTrip':'restTrip'].phase,'queued');
    assert.ok(activeTasks(s).some(t=>t.id==='code'));assert.ok(tick(s));assert.equal(s.progress.design,25);assert.ok(s.progress.code>10);assert.ok(validSave(s));
  }
});
