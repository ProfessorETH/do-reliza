import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { beginPlan, beginWork, tick, resolveEvent, nextProject, validSave, restoreOffice, hire, seatAgent, teamSeated, recommend, walkInOffice } from '../engine.js';
import { buyUpgrade, careFor } from '../assets/studio-life.js';
import { studioCapacity, fundTeam } from '../assets/studio-progression.js';
import { freshOrbit, recordOrbitResult } from '../assets/orbit.js';
import { missionRoute } from './orbit-route.js';
import { ALL_DESKS, ENTRANCE, LOUNGE_SEAT, findOfficePath, clearSegment, isWalkable } from '../office-layout.js';

function finish(s) {
  beginPlan(s); recommend(s); beginWork(s);
  for(let n=0;n<100&&s.stage!=='result';n++) {
    if(s.stage==='event') resolveEvent(s,{scope:'focus',review:'review-fix',bug:s.budget>=1500?'fix':'cut',life:'life-care'}[s.currentEvent]);
    else tick(s);
  }
  assert.equal(s.stage,'result');return s;
}
function win(s) { const f=freshOrbit(s);missionRoute(s,f);assert.ok(f.won);assert.ok(recordOrbitResult(s,f));return f; }
function expanded() {
  const s=finish(createDemoGame()); win(s); buyUpgrade(s,'coffee');
  nextProject(s,'club');finish(s);win(s);assert.equal(buyUpgrade(s,'desk4'),null);
  nextProject(s,'cup');finish(s);win(s);assert.equal(buyUpgrade(s,'desk5'),null);
  return s;
}
test('mission premiums persist once per released order, including replay and worse records',()=>{
  const s=finish(createDemoGame()), before=s.life.cash, f=win(s);
  assert.equal(s.life.cash,before+3000);assert.deepEqual(s.life.missionsWon,['festival']);
  const saved=restoreOffice(JSON.parse(JSON.stringify(s)));
  assert.ok(validSave(saved));assert.equal(recordOrbitResult(saved,f),false);
  f.moves+=10;assert.equal(recordOrbitResult(saved,f),false);assert.equal(saved.life.cash,before+3000);
  assert.equal(nextProject(saved,'festival'),null);finish(saved);
  const cash=saved.life.cash;win(saved);assert.equal(saved.life.cash,cash+3000);
  assert.deepEqual(saved.life.missionsWon,['festival']);
});
test('unfinished, stale and fabricated off-station victories earn no premium',()=>{
  const s=finish(createDemoGame()), f=freshOrbit(s), cash=s.life.cash;
  assert.equal(recordOrbitResult(s,f),false);missionRoute(s,f);f.x=0;f.y=0;
  assert.equal(recordOrbitResult(s,f),false);assert.equal(s.life.cash,cash);
  f.x=6;f.y=4;f.release='old';assert.equal(recordOrbitResult(s,f),false);
});
test('mission unlocks require both completion and affordable purchases, without changing old saves',()=>{
  const s=finish(createDemoGame()), before=JSON.stringify(s);
  assert.match(buyUpgrade(s,'coffee'),/фестивальную/);assert.match(buyUpgrade(s,'desk4'),/экспедицию/);
  assert.equal(JSON.stringify(s),before);assert.equal(studioCapacity(s),3);
  win(s);assert.equal(buyUpgrade(s,'coffee'),null);assert.equal(studioCapacity(s),3);
  assert.ok(validSave(s));const restored=restoreOffice(JSON.parse(before));assert.equal(restored.life.missionsWon,undefined);
});
test('three actual missions unlock five seats; extra hiring, funding, assignments and saves work',()=>{
  const s=expanded();assert.equal(studioCapacity(s),5);assert.equal(s.seats.length,5);assert.ok(validSave(s));
  assert.equal(nextProject(s,'cup'),null);assert.equal(teamSeated(s),true);
  // Existing team may begin with three; the new colleagues are optional.
  s.life.cash+=20000;assert.equal(fundTeam(s),null);assert.equal(fundTeam(s),null);
  for(const id of ['pixel','saga']){assert.equal(hire(s,id),null);assert.equal(seatAgent(s,id,s.seats.indexOf(null)),null);}
  assert.equal(s.team.length,5);assert.match(hire(s,'nord'),/заняты/);
  assert.equal(teamSeated(s),true);assert.ok(validSave(s));
  assert.equal(beginPlan(s),true);recommend(s);assert.equal(beginWork(s),true);assert.ok(validSave(s));
});
test('new-order subsidy is charged from studio cash and cannot create negative cash',()=>{
  const s=expanded();s.team=['mira','pixel','nord','iskra','saga'];s.seats=[...s.team];
  s.assignments=Object.fromEntries(Object.keys(s.progress).map((id,i)=>[id,s.team[i]]));
  s.life.cash=0;const before=JSON.stringify(s);assert.match(nextProject(s,'festival'),/состава/);assert.equal(JSON.stringify(s),before);
  s.life.cash=20000;const cash=s.life.cash;assert.equal(nextProject(s,'festival'),null);
  assert.ok(s.life.cash<cash);assert.equal(s.budget,0);assert.ok(validSave(s));
});
test('new seats have clear routes from entrance, other desks and the lounge; unbuilt annex stays blocked',()=>{
  assert.equal(isWalkable([6,0]),false);
  for(const capacity of [4,5])for(let i=0;i<capacity;i++){
    const d=ALL_DESKS[i],approach=[d.seat[0]+.72,d.seat[1]+.4];
    for(const start of [ENTRANCE,LOUNGE_SEAT.approach]){
      const path=findOfficePath(start,approach,true,capacity);assert.ok(path,`${capacity} seats → ${i}`);
      let p=start;for(const q of path){assert.ok(clearSegment(p,q,true,capacity));p=q;}
    }
  }
  const s=createDemoGame();assert.match(walkInOffice(s,s.team[0],[6,0]),/мебель|край/);
});
test('coffee is a once-per-shift benefit with an owned station, survives reload and resets next order',()=>{
  const s=expanded();nextProject(s,'club');beginPlan(s);recommend(s);beginWork(s);
  const id=s.team[0],m=s.life.members[id];m.energy=30;m.morale=40;
  assert.equal(careFor(s,id,'coffee'),null);assert.equal(m.energy,45);assert.equal(m.morale,45);
  const saved=restoreOffice(JSON.parse(JSON.stringify(s)));assert.ok(validSave(saved));assert.ok(careFor(saved,id,'coffee'));
  finish(saved);nextProject(saved,'club');beginPlan(saved);recommend(saved);beginWork(saved);assert.equal(careFor(saved,id,'coffee'),null);
});
test('five departures leave an affordable recruitment pool and a small remaining cash balance can fund it',()=>{
  const s=expanded();s.team=['mira','pixel','nord','iskra','saga'];s.seats=[...s.team];
  s.assignments=Object.fromEntries(Object.keys(s.progress).map((id,i)=>[id,s.team[i]]));
  s.life.departures=[...s.team];assert.equal(nextProject(s,'cup'),null);
  assert.equal(s.team.length,0);assert.equal(s.life.away.length,3);
  for(const id of ['iskra','saga','echo']){assert.equal(hire(s,id),null);seatAgent(s,id,s.seats.indexOf(null));}
  assert.ok(teamSeated(s));assert.ok(validSave(s));s.life.cash=1700;const budget=s.budget;
  assert.equal(fundTeam(s),null);assert.equal(s.life.cash,0);assert.equal(s.budget,budget+1700);
});
