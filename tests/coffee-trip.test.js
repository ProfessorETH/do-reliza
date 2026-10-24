import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { careFor, restInTransit } from '../assets/studio-life.js';
import { tick, validSave, restoreOffice, activeTasks } from '../engine.js';
import { coffeeArrival, coffeeMotion, settleCoffeeFallback } from '../assets/coffee-trip.js';
import { COFFEE_STATION, ALL_DESKS, findOfficePath } from '../office-layout.js';

function working(){const s=createDemoGame();s.stage='work';s.life.upgrades=['coffee'];s.life.incidentDone=true;for(const m of Object.values(s.life.members)){m.energy=30;m.morale=40;}return s;}
test('coffee grants nothing until drinking finishes and restores only once across reload',()=>{
  const s=working(),id=s.team[0],m=s.life.members[id];s.autoPlay=true;
  assert.equal(careFor(s,id,'coffee'),null);assert.equal(m.energy,30);assert.equal(m.morale,40);assert.ok(!m.coffee);
  assert.ok(restInTransit(s));const time=s.time;assert.equal(tick(s),false);assert.equal(s.time,time);assert.equal(s.autoPlay,true);
  for(const phase of ['outbound','drinking','returning']){
    assert.equal(m.coffeeTrip.phase,phase);assert.ok(validSave(s));const saved=restoreOffice(JSON.parse(JSON.stringify(s)));assert.ok(validSave(saved));
    assert.ok(careFor(saved,id,'coffee'));
    if(phase==='outbound')coffeeArrival(s,id,'station');else if(phase==='drinking'){coffeeArrival(s,id,'drank');assert.equal(m.energy,45);assert.equal(m.morale,45);assert.equal(coffeeArrival(s,id,'drank'),false);}else{assert.equal(coffeeArrival(saved,id,'drank'),false);coffeeArrival(s,id,'back');}
  }
  assert.equal(m.coffeeTrip,null);assert.ok(careFor(s,id,'coffee'));assert.equal(s.autoPlay,true);
});
test('one station serves a FIFO queue and queued employees retain their tasks',()=>{
  const s=working(),[a,b,c]=s.team;
  for(const id of [a,b,c])assert.equal(careFor(s,id,'coffee'),null);
  assert.deepEqual(s.team.map(id=>s.life.members[id].coffeeTrip.phase),['outbound','queued','queued']);
  assert.equal(careFor(s,b,'break')!==null,true);
  for(const id of [a,b,c]){assert.equal(s.life.members[id].coffeeTrip.phase,'outbound');coffeeArrival(s,id,'station');coffeeArrival(s,id,'drank');coffeeArrival(s,id,'back');}
  assert.ok(s.team.every(id=>s.life.members[id].energy===45));assert.equal(restInTransit(s),false);assert.ok(validSave(s));
});
test('coffee save validation rejects impossible state and old consumed drinks still load',()=>{
  const s=working(),id=s.team[0];s.life.members[id].coffee=true;assert.ok(validSave(s));
  delete s.life.members[id].coffee;careFor(s,id,'coffee');
  const valid=structuredClone(s);s.life.members[id].coffeeTrip.phase='teleport';assert.equal(!!validSave(s),false);
  s.life.members[id]=structuredClone(valid.life.members[id]);s.life.members[id].coffeeTrip.slot=4;assert.equal(!!validSave(s),false);
  s.life.members[id]=structuredClone(valid.life.members[id]);s.life.members[id].coffee=true;assert.equal(!!validSave(s),false);
});
test('station is reachable from each desk, with a distinct pickup and drinking pose',()=>{
  for(let capacity=3;capacity<=5;capacity++)for(const d of ALL_DESKS.slice(0,capacity))assert.notEqual(findOfficePath([d.seat[0]+.72,d.seat[1]+.4],COFFEE_STATION.point,true,capacity),null);
  assert.equal(coffeeMotion('coffee-pick',.2).holding,false);assert.equal(coffeeMotion('coffee-pick',1).holding,true);
  assert.ok(coffeeMotion('coffee-drink',1.2).sip>.9);assert.ok(coffeeMotion('coffee-drink',1.2).tilt>.2);
  assert.equal(coffeeMotion('coffee-put',1).holding,false);
});

test('lightweight renderer progresses the same coffee transaction without granting an early or duplicate bonus',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const s=working(),id=s.team[0];careFor(s,id,'coffee');
  const notify=(id,arrival,source)=>{assert.equal(source,s);coffeeArrival(s,id,arrival);settleCoffeeFallback(s,notify);};
  settleCoffeeFallback(s,notify);settleCoffeeFallback(s,notify);
  t.mock.timers.tick(600);assert.equal(s.life.members[id].coffeeTrip.phase,'drinking');assert.equal(s.life.members[id].energy,30);
  t.mock.timers.tick(3599);assert.equal(s.life.members[id].energy,30);
  t.mock.timers.tick(1);assert.equal(s.life.members[id].energy,45);
  t.mock.timers.tick(600);assert.equal(s.life.members[id].coffeeTrip,null);assert.equal(s.life.members[id].energy,45);
});
