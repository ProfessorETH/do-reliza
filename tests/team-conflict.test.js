import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { beginPlan, beginWork, validSave, resolveEvent, restoreOffice, tick } from '../engine.js';
import { scheduleIncident } from '../assets/studio-life.js';

function ready() { const s=createDemoGame();beginPlan(s);beginWork(s);s.time=2;return s; }

test('team arguments depend on real distress, choose two present people and survive reload',()=>{
  const s=ready();assert.equal(scheduleIncident(s),false);
  const upset=s.team[0];s.life.members[upset].stress=78;
  assert.equal(scheduleIncident(s),true);assert.equal(s.life.incident.type,'tension');
  assert.equal(s.life.incident.id,upset);assert.notEqual(s.life.incident.otherId,upset);
  assert.ok(validSave(s));const restored=restoreOffice(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(restored.life.incident,s.life.incident);assert.ok(validSave(restored));
  const before=restored.time;assert.equal(tick(restored),false);assert.equal(restored.time,before);
  const bad=structuredClone(restored);bad.life.incident.otherId=upset;assert.equal(validSave(bad),false);
});

test('mediation helps both colleagues once and keeps the ordinary incident available',()=>{
  const s=ready();s.life.members[s.team[0]].stress=90;s.life.members[s.team[0]].morale=20;
  scheduleIncident(s);const ids=[s.life.incident.id,s.life.incident.otherId];
  const before=ids.map(id=>({...s.life.members[id]}));const time=s.time;
  assert.equal(resolveEvent(s,'life-care'),null);assert.equal(s.time,time+1);
  ids.forEach((id,i)=>{assert.equal(s.life.members[id].stress,Math.max(0,before[i].stress-18));assert.equal(s.life.members[id].morale,Math.min(100,before[i].morale+8));});
  assert.equal(s.life.conflictDone,true);assert.equal(s.life.incidentDone,false);assert.ok(validSave(s));
  assert.equal(typeof resolveEvent(s,'life-care'),'string');assert.equal(scheduleIncident(s),false);
});

test('ignoring a dispute affects both participants without spending an hour or repeating it',()=>{
  const s=ready();s.life.incidentDone=true;s.life.members[s.team[1]].morale=15;
  assert.equal(scheduleIncident(s),true);assert.ok(validSave(s));
  const ids=[s.life.incident.id,s.life.incident.otherId],moods=ids.map(id=>s.life.members[id].morale),time=s.time;
  assert.equal(resolveEvent(s,'life-wait'),null);assert.equal(s.time,time);
  ids.forEach((id,i)=>assert.equal(s.life.members[id].morale,Math.max(0,moods[i]-8)));
  assert.equal(scheduleIncident(s),false);assert.ok(validSave(s));
});
