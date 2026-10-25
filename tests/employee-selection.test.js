import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { beginPlan, beginWork, supportTask } from '../engine.js';
import { careFor } from '../assets/studio-life.js';
import { employeeOverview } from '../assets/employee-selection.js';
const working=()=>{const g=createDemoGame();beginPlan(g);beginWork(g);return g;};
test('selected colleague shows actual work or names the dependency without changing the save',()=>{
  const g=working(),before=structuredClone(g),worker=g.assignments.brief;
  const active=employeeOverview(g,worker);assert.equal(active.task.id,'brief');assert.equal(active.actions[0].id,'brief');
  assert.match(employeeOverview(g,g.assignments.design).explanation,/Разобрать задание/);
  assert.equal(employeeOverview(g,'nord'),null);assert.deepEqual(g,before);
});
test('offered support belongs to this employee and obeys the one-use and travel guards',()=>{
  const g=working(),id=g.assignments.brief,action=employeeOverview(g,id).actions.find(a=>a.action==='support');
  assert.equal(supportTask(g,action.id),null);assert.ok(!employeeOverview(g,id).actions.some(a=>a.action==='support'));
  const h=working();careFor(h,h.assignments.design,'break');assert.ok(!employeeOverview(h,h.assignments.brief).actions.some(a=>a.action==='support'));
});
test('tired colleague offers rest first; travel, coffee and return never claim current task',()=>{
  const g=working(),id=g.assignments.brief,m=g.life.members[id];m.energy=10;
  assert.equal(employeeOverview(g,id).actions[0].action,'life-break');assert.equal(careFor(g,id,'break'),null);
  assert.equal(employeeOverview(g,id).task,null);assert.match(employeeOverview(g,id).activity,/отдыхать/);
  m.restTrip=null;m.breaks=0;
  for(const phase of ['outbound','drinking','returning']){m.coffeeTrip={phase,request:1,slot:0};const state=employeeOverview(g,id);assert.equal(state.task,null);assert.ok(!state.actions.some(a=>['life-coffee','life-break'].includes(a.action)));assert.match(state.activity,/напиток|напитком|компьютер/);}
  g.life.members.mira.coffeeTrip={phase:'drinking',request:2,slot:0};m.coffeeTrip={phase:'queued',request:1,slot:0};assert.equal(employeeOverview(g,id).task.id,'brief');
});
test('thanks is offered once per genuinely completed result and works through normal care',()=>{
  const g=working(),id=g.assignments.brief;g.progress.brief=100;
  assert.ok(employeeOverview(g,id).actions.some(a=>a.action==='life-praise'));assert.equal(careFor(g,id,'praise'),null);
  assert.ok(!employeeOverview(g,id).actions.some(a=>a.action==='life-praise'));
});

test('one selected portrait references the same employee card and invalid colleagues render nothing',async()=>{
  const {renderTeamHUD}=await import('../assets/team-hud.js');
  const {renderEmployeeCard}=await import('../assets/employee-card.js');
  const g=working(),id=g.assignments.brief,html=renderTeamHUD(g,id);
  assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
  assert.match(html,new RegExp('data-id="'+id+'"[^>]*aria-pressed="true"[^>]*aria-controls="employee-card"'));
  const card=renderEmployeeCard(g,id);assert.match(card,new RegExp('id="employee-card" data-actor="'+id+'"'));assert.match(card,/Разобрать задание/);
  assert.equal(renderEmployeeCard(g,'nord'),'');
});
