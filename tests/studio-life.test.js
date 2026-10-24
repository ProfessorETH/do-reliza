import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { createGame, restoreOffice, beginPlan, beginWork, recommend, tick, resolveEvent, validSave, nextProject, hire, activeTasks, getResult } from '../engine.js';
import { careFor, buyUpgrade, condition, settleProject, UPGRADES } from '../assets/studio-life.js';

function working(seed=0) {
  const s=createDemoGame();s.life.seed=seed;beginPlan(s);beginWork(s);return s;
}
function finish(s) {
  for(let n=0;n<100&&s.stage!=='result';n++) {
    if(s.stage==='event') assert.equal(resolveEvent(s,{scope:'focus',review:'review-fix',bug:s.budget>=1500?'fix':'cut',life:'life-care'}[s.currentEvent]),null);
    else assert.equal(tick(s),true);
  }
  assert.equal(s.stage,'result');assert.ok(validSave(s));return s;
}
test('break pauses only its employee; coworkers advance, including simultaneous breaks',()=>{
  const s=working();s.progress.brief=100; // Design and code are genuinely parallel now.
  const id=s.assignments.design, other=s.assignments.code;
  s.life.members[id].energy=20;s.life.members[id].stress=70;
  assert.equal(condition(s,id).label,'На грани выгорания');
  assert.equal(careFor(s,id,'break'),null);assert.ok(!activeTasks(s).some(t=>s.assignments[t.id]===id));
  tick(s);assert.equal(s.progress.design,0);assert.ok(s.progress.code>0);
  assert.equal(s.life.members[id].energy,50);assert.equal(s.life.members[id].stress,55);
  assert.equal(s.life.members[id].breaks,0);assert.ok(s.life.members[other].energy<85);
  for(const aid of s.team)assert.equal(careFor(s,aid,'break'),null);
  assert.equal(tick(s),true);assert.ok(validSave(s));
});
test('gratitude cannot farm repeated rewards and mood follows actual completed work',()=>{
  const s=working(),id=s.assignments.brief,m=s.life.members[id];
  assert.equal(typeof careFor(s,id,'praise'),'string');
  while(s.progress.brief<100)tick(s);
  const mood=m.morale;assert.equal(careFor(s,id,'praise'),null);assert.equal(m.morale,Math.min(100,mood+10));
  assert.equal(typeof careFor(s,id,'praise'),'string');
});
test('all three random incidents persist, pause time and resolve once',()=>{
  for(const seed of [0,256,512]) {
    const s=working(seed);
    while(s.currentEvent!=='life') {
      if(s.stage==='event')resolveEvent(s,{scope:'focus',review:'review-fix',bug:'fix'}[s.currentEvent]);else tick(s);
    }
    const restored=restoreOffice(JSON.parse(JSON.stringify(s))),time=restored.time;
    assert.deepEqual(restored.life.incident,s.life.incident);assert.ok(validSave(restored));
    assert.equal(tick(restored),false);assert.equal(restored.time,time);
    assert.equal(resolveEvent(restored,'life-wait'),null);assert.equal(typeof resolveEvent(restored,'life-wait'),'string');
    assert.equal(restored.life.incidentDone,true);finish(restored);
  }
});
test('office purchases use studio cash once and have observable simulation effects',()=>{
  const s=createDemoGame(),reserve=s.budget;
  assert.equal(buyUpgrade(s,'lounge'),null);assert.equal(s.life.cash,2500);assert.equal(s.budget,reserve);
  assert.equal(typeof buyUpgrade(s,'lounge'),'string');assert.equal(s.life.cash,2500);
  assert.equal(typeof buyUpgrade(s,'computers'),'string');assert.equal(s.life.cash,2500);
  beginPlan(s);beginWork(s);const id=s.assignments.brief;s.life.members[id].energy=10;
  careFor(s,id,'break');tick(s);assert.equal(s.life.members[id].energy,55);
  assert.equal(typeof buyUpgrade(s,'quiet'),'string');
  const fast=working(),slow=structuredClone(fast);fast.life.upgrades=['computers'];
  fast.progress.brief=slow.progress.brief=100;tick(fast);tick(slow);assert.ok(fast.progress.code>slow.progress.code);
});
test('settlement is idempotent across reload; next orders keep studio but reset project',()=>{
  const s=finish(working()),cash=s.life.cash,history=s.life.history.length;
  settleProject(s,getResult(s));restoreOffice(s);assert.equal(s.life.cash,cash);assert.equal(s.life.history.length,history);
  assert.equal(careFor(s,'mira','raise'),null);const bank=s.life.cash;
  const energy=s.life.members.mira.energy;
  assert.equal(nextProject(s,'club'),null);assert.equal(s.life.cash,bank-1000);assert.equal(s.life.members.mira.raises,1);
  assert.equal(s.life.members.mira.energy,Math.min(100,energy+35));assert.equal(s.life.completed,1);
  assert.equal(s.stage,'hire');assert.equal(s.time,0);assert.ok(Object.values(s.progress).every(n=>n===0));
  assert.equal(s.life.contract,'club');assert.ok(validSave(s));
  const after=structuredClone(s);assert.equal(typeof nextProject(s,'cup'),'string');assert.deepEqual(s,after);
  beginPlan(s);recommend(s);beginWork(s);finish(s);assert.equal(s.life.history.length,2);
  assert.equal(nextProject(s,'cup'),null);assert.ok(validSave(s));
});
test('two neglected shifts warn before departure; raise retains employee; departure frees a seat',()=>{
  const s=finish(working()),m=s.life.members.mira;
  m.morale=10;m.energy=10;m.stress=90;m.warnings=0;s.life.settled=false;settleProject(s,{passed:false,score:20});
  assert.equal(m.warnings,1);assert.ok(!s.life.departures.includes('mira'));
  s.life.settled=false;settleProject(s,{passed:false,score:20});assert.ok(s.life.departures.includes('mira'));
  const retained=structuredClone(s);assert.equal(careFor(retained,'mira','raise'),null);assert.ok(!retained.life.departures.includes('mira'));
  assert.equal(nextProject(s,'club'),null);assert.ok(!s.team.includes('mira'));assert.ok(!s.seats.includes('mira'));
  assert.equal(typeof hire(s,'mira'),'string');assert.equal(hire(s,'pixel'),null);assert.ok(validSave(s));
});
test('legacy saves migrate and damaged simulation data cannot enter the game',()=>{
  const s=working();delete s.life;assert.ok(validSave(s));restoreOffice(s);assert.equal(s.life.members.mira.energy,85);
  for(const damage of [s=>s.life.cash=-1,s=>s.life.members.mira.energy=NaN,s=>s.life.members.echo.breaks=5,s=>s.life.incident={type:'unknown',id:'mira'},s=>s.life.upgrades=['fake'],s=>s.life.away=['mira']]) {
    const bad=structuredClone(s);damage(bad);assert.equal(!!validSave(bad),false);
  }
  const bad=createGame();bad.stage='event';bad.currentEvent='life';delete bad.life;assert.equal(!!validSave(bad),false);
});
test('payroll shortage does not mutate the next order and can be resolved by changing staff',()=>{
  const s=finish(working());s.life.members.mira.raises=3;s.life.cash=0;
  const before=structuredClone(s);assert.equal(typeof nextProject(s,'club'),'string');assert.deepEqual(s,before);
  assert.equal(careFor(s,'mira','release'),null);assert.equal(nextProject(s,'club'),null);
  assert.equal(s.life.cash,0);assert.equal(s.team.length,2);assert.ok(validSave(s));
});
test('even losing the cheapest team leaves an affordable replacement on hard difficulty',()=>{
  const s=working();finish(s);s.difficulty='hard';s.team=['pixel','iskra','echo'];s.seats=[...s.team];
  for(const id of s.team)assert.equal(careFor(s,id,'release'),null);
  assert.equal(nextProject(s,'club'),null);assert.equal(s.team.length,0);
  for(const id of ['mira','nord','saga'])assert.equal(hire(s,id),null);
  assert.ok(s.budget>=0);assert.ok(validSave(s));
});
test('new commission clears optional mentoring and defects from the previous release',()=>{
  const s=finish(working());s.wallBug=true;s.support={taskId:'brief',agentId:'echo'};
  assert.equal(nextProject(s,'club'),null);assert.equal(s.wallBug,undefined);assert.equal(s.support,undefined);
  assert.ok(validSave(s));beginPlan(s);recommend(s);beginWork(s);finish(s);assert.equal(!!getResult(s).critical,false);
});
test('a completed last task followed by an incident never strands the release',()=>{
  const s=working();for(const id of Object.keys(s.progress))s.progress[id]=100;
  assert.equal(tick(s),true);assert.equal(s.stage,'result');assert.ok(s.life.settled);
});
test('campaign survives many orders and upgrades without losing its ledger or team',()=>{
  const s=working(512);
  for(let n=0;n<9;n++) {
    finish(s);
    for(const id of s.team) { if(s.life.departures.includes(id)&&s.life.members[id].raises<3)assert.equal(careFor(s,id,'raise'),null); }
    for(const u of UPGRADES)if(s.life.cash>=u.price&&!s.life.upgrades.includes(u.id))assert.equal(buyUpgrade(s,u.id),null);
    assert.equal(s.life.completed,n+1);assert.ok(validSave(JSON.parse(JSON.stringify(s))));
    if(n<8){assert.equal(nextProject(s,n%2?'cup':'club'),null);beginPlan(s);recommend(s);beginWork(s);}
  }
  assert.equal(s.life.history.length,9);assert.equal(s.life.upgrades.length,3);
});
