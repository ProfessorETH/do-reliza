import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoGame} from '../demo.js';
import {beginPlan,beginWork,supportTask} from '../engine.js';
import {shiftOverview} from '../assets/shift-view.js';
const ready=()=>{const s=createDemoGame();beginPlan(s);beginWork(s);return s;};
test('shift distinguishes active work from waiting on dependencies',()=>{
  const s=ready(),v=shiftOverview(s);
  assert.equal(v.members[0].task.id,'brief');
  assert.equal(v.members.find(m=>m.agent.id==='mira').task,null);
  assert.match(v.members.find(m=>m.agent.id==='mira').reason,/Сначала нужны результаты/);
  s.progress.brief=100;
  assert.deepEqual(shiftOverview(s).members.filter(m=>m.task).map(m=>m.task.id).sort(),['code','design']);
});
test('shift prioritizes exhausted colleagues but does not ask for redundant rest',()=>{
  const s=ready();s.life.members.mira.energy=20;
  let v=shiftOverview(s);assert.equal(v.members[0].agent.id,'mira');assert.equal(v.members[0].needsHelp,true);assert.equal(v.members[0].actions[0].action,'life-break');
  s.life.members.mira.restTrip={phase:'outbound'};
  v=shiftOverview(s);const mira=v.members.find(m=>m.agent.id==='mira');assert.equal(mira.resting,true);assert.equal(mira.needsHelp,false);assert.ok(!mira.actions.some(a=>a.action==='life-break'));
});
test('one-time support disappears after help and inactive weak assignments are not urgent',()=>{
  const s=ready();assert.equal(supportTask(s,'brief'),null);
  assert.ok(shiftOverview(s).members.every(m=>!m.actions.some(a=>a.action==='support')));
  s.assignments.code='mira';assert.equal(shiftOverview(s).members.find(m=>m.agent.id==='mira').needsHelp,false);
});
