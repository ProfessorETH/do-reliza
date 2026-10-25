import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, hire, seatAgent, beginPlan, recommend, beginWork, tick, resolveEvent, nextProject, validSave, restoreOffice, getResult } from '../engine.js';
import { salaryDecision, employment, salaryBonus, pendingSalary, departureRoll, requestSalary } from '../assets/career-employment.js';
import { condition, settleProject, CONTRACTS } from '../assets/studio-life.js';
import { contractCosts } from '../assets/commission-view.js';
import { employeeEvent } from '../assets/employee-event.js';
import { renderDecisionPanel } from '../assets/decision-view.js';
import { ensureEventClock } from '../assets/event-clock.js';

function studio(mode='bootstrap'){const s=createGame(mode);for(const [i,id] of ['mira','iskra','echo'].entries()){hire(s,id);seatAgent(s,id,i);}return s;}
function work(s){assert.equal(beginPlan(s),true);recommend(s);assert.equal(beginWork(s),true);}
function advance(s,stop=false){for(let n=0;n<180&&s.stage!=='result';n++){
  if(s.stage==='event'){
    if(s.life.incident?.type==='salary'&&stop)return s.life.incident.id;
    assert.equal(resolveEvent(s,s.life.incident?.type==='salary'?'salary-accept':({scope:'focus',review:'review-fix',bug:s.budget>=1500?'fix':'cut',life:'life-care'})[s.currentEvent]),null);
  }else tick(s);
}assert.equal(s.stage,'result');return null;}
function second(){const s=studio();work(s);advance(s);assert.equal(nextProject(s,'festival'),null);work(s);const id=advance(s,true);assert.ok(id);return {s,id};}

test('salary requests follow real experience, persist on the employee and are never timed',()=>{
  const {s,id}=second();assert.equal(employment(s,id).experience,1);assert.equal(employeeEvent(s).id,id);assert.equal(condition(s,id).label,'Просит прибавку');
  s.timedEvents=true;assert.equal(ensureEventClock(s),null);assert.match(renderDecisionPanel(s),/salary-accept/);assert.match(renderDecisionPanel(s),/Риск ухода/);
  const copy=restoreOffice(JSON.parse(JSON.stringify(s)));assert.ok(validSave(copy));assert.deepEqual(copy.life.career.employment,s.life.career.employment);assert.equal(employeeEvent(copy).key,employeeEvent(s).key);
  copy.life.members[id].energy=20;copy.life.members[id].stress=80;assert.equal(condition(copy,id).factor,.75);
});
test('accepting costs real cash, improves morale and future payroll matches preview',()=>{
  const {s,id}=second(),e=employment(s,id),cost=e.request,cash=s.life.cash,m=s.life.members[id];m.morale=50;m.stress=50;
  assert.equal(resolveEvent(s,'salary-accept'),null);assert.equal(s.life.cash,cash-cost);assert.equal(salaryBonus(s,id),cost);assert.equal(m.morale,65);assert.equal(m.stress,42);assert.equal(employment(s,id).risk,0);
  const snapshot=structuredClone(s);assert.ok(salaryDecision(s,id,'accept'));assert.deepEqual(s,snapshot);
  advance(s);for(const who of pendingSalary(s))assert.equal(salaryDecision(s,who,'accept'),null);
  const terms=contractCosts(s,CONTRACTS[0]);assert.ok(terms.payroll>=cost);assert.equal(nextProject(s,'festival'),null);assert.equal(s.life.cash,terms.cashAfter);assert.ok(validSave(s));
});
test('an unaffordable raise cannot mutate cash, mood, event or request',()=>{
  const {s}=second();s.life.cash=0;const snapshot=structuredClone(s);assert.match(resolveEvent(s,'salary-accept'),/кассе/);assert.deepEqual(s,snapshot);
  assert.equal(resolveEvent(s,'salary-defer'),null);assert.equal(s.life.cash,0);assert.ok(validSave(s));
});
test('postponement lowers mood, lasts a full next order and may cause a saved departure',()=>{
  const {s,id}=second(),m=s.life.members[id];m.morale=70;assert.equal(resolveEvent(s,'salary-defer'),null);assert.equal(m.morale,58);assert.equal(employment(s,id).risk,35);
  advance(s);assert.equal(employment(s,id).status,'deferred');assert.ok(!s.life.departures.includes(id));
  for(const who of pendingSalary(s))assert.equal(salaryDecision(s,who,'accept'),null);
  assert.equal(nextProject(s,'festival'),null);work(s);
  // Pick the existing deterministic stream for a departure; reload cannot reroll it.
  while(departureRoll({...s,life:{...s.life,completed:s.life.completed+1}},id)>=35)s.life.seed=(s.life.seed+1)>>>0;
  const roll=departureRoll(s,id);assert.equal(departureRoll(JSON.parse(JSON.stringify(s)),id),roll);
  advance(s);assert.equal(employment(s,id).status,'leaving');assert.ok(s.life.departures.includes(id));assert.equal(condition(s,id).label,'Планирует уйти');
  const copy=restoreOffice(JSON.parse(JSON.stringify(s)));assert.ok(validSave(copy));assert.equal(employment(copy,id).status,'leaving');
  const before=copy.life.cash,request=employment(copy,id).request;assert.equal(salaryDecision(copy,id,'accept'),null);assert.equal(copy.life.cash,before-request);assert.ok(!copy.life.departures.includes(id));
});
test('replacement ends future bonuses, preserves current tasks and allows hiring a novice',()=>{
  const {s,id}=second(),assignments=structuredClone(s.assignments);assert.equal(resolveEvent(s,'salary-replace'),null);assert.deepEqual(s.assignments,assignments);assert.ok(s.team.includes(id));
  advance(s);for(const who of pendingSalary(s))assert.equal(salaryDecision(s,who,'accept'),null);
  assert.equal(nextProject(s,'festival'),null);assert.ok(!s.team.includes(id));assert.ok(s.life.away.includes(id));assert.equal(salaryBonus(s,id),0);assert.ok(hire(s,id));
  const novice=['pixel','nord','saga'].find(who=>hire(s,who)===null);assert.ok(novice);assert.equal(employment(s,novice).experience,0);assert.ok(Object.values(s.life.career.skills[novice]).every(n=>n<=32));assert.ok(validSave(s));
});
test('unanswered release requests block the next project without charging money',()=>{
  const {s,id}=second();assert.equal(resolveEvent(s,'salary-accept'),null);advance(s);
  const e=employment(s,id);e.status='pending';e.request=250;const before=structuredClone(s);
  assert.match(nextProject(s,'festival'),/Сначала обсуди/);assert.deepEqual(s,before);assert.ok(validSave(s));
});
test('old career saves migrate without surprise requests and classic rules are untouched',()=>{
  const s=studio();delete s.life.career.employment;assert.ok(validSave(s));restoreOffice(s);assert.equal(employment(s,'mira').experience,0);assert.equal(requestSalary(s,'mira'),false);
  const classic=studio('calm');work(classic);advance(classic);assert.equal(classic.life.career,undefined);assert.equal(employeeEvent(classic),null);assert.ok(validSave(classic));
});
test('malformed employment is rejected and settling twice cannot duplicate experience',()=>{
  const {s}=second();assert.equal(resolveEvent(s,'salary-accept'),null);advance(s);const snapshot=structuredClone(s);settleProject(s,getResult(s));assert.deepEqual(s,snapshot);
  for(const edit of [e=>e.bonus=-1,e=>e.risk=NaN,e=>e.status='gone',e=>e.request=9999,e=>e.decisionOrder=999]){const c=structuredClone(s);edit(c.life.career.employment.mira);assert.equal(!!validSave(c),false);}
});

