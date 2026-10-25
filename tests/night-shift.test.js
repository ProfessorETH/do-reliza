import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, hire, seatAgent, beginPlan, recommend, beginWork, activeTasks, tick, resolveEvent, validSave, restoreOffice, nextProject, getResult } from '../engine.js';
import { lifeHour, careFor } from '../assets/studio-life.js';
import { nightShift, scheduleNight, nightDecision, overnightPreview } from '../assets/night-shift.js';
import { employeeEvent } from '../assets/employee-event.js';
import { ensureEventClock } from '../assets/event-clock.js';
function prepared(mode='normal'){const s=createGame(mode);for(const [i,id] of ['mira','iskra','echo'].entries()){hire(s,id);seatAgent(s,id,i);}beginPlan(s);recommend(s);beginWork(s);return s;}

test('working overnight costs 12 energy instead of 7 and adds tension and mood loss',()=>{
  const day=prepared(),night=structuredClone(day),id=day.assignments.brief,active=activeTasks(day);
  day.time=1;night.time=14;lifeHour(day,active,[]);lifeHour(night,active,[]);
  assert.equal(day.life.members[id].energy,78);assert.equal(night.life.members[id].energy,73);
  assert.equal(night.life.members[id].stress-day.life.members[id].stress,2);assert.equal(night.life.members[id].morale-day.life.members[id].morale,-1);
  night.time=22;const before=night.life.members[id].energy;lifeHour(night,active,[]);assert.equal(before-night.life.members[id].energy,7); // 06:00–07:00 is daytime.
});
test('night starts at 22 and ends at 06, keeping midnight in the same request interval',()=>{
  assert.equal(nightShift({time:12,clockFraction:.99}).active,false);assert.equal(nightShift({time:13}).active,true);
  assert.equal(nightShift({time:15}).night,nightShift({time:13}).night);assert.equal(nightShift({time:21}).active,false);
});
test('the employee asks before more work, without a timer or a re-roll after reload',()=>{
  let s=prepared();s.time=13;s.autoPlay=true;const progress=structuredClone(s.progress);assert.equal(tick(s),true);assert.equal(s.time,13);assert.deepEqual(s.progress,progress);
  assert.equal(employeeEvent(s).type,'night');assert.equal(ensureEventClock(s),null);assert.ok(validSave(s));s=restoreOffice(JSON.parse(JSON.stringify(s)));
  const key=employeeEvent(s).key,m=s.life.members[s.team[0]];m.morale=70;m.stress=20;assert.equal(resolveEvent(s,'night-work'),null);assert.equal(m.morale,65);assert.equal(m.stress,25);assert.equal(s.autoPlay,true);
  assert.equal(scheduleNight(s),false);s.time=19;assert.equal(scheduleNight(s),false);s.time=37;assert.equal(scheduleNight(s),true);assert.notEqual(employeeEvent(s).key,key);assert.ok(validSave(s));
});
test('going home advances to 09:00, consumes deadline, restores the team and preserves the project',()=>{
  const s=prepared();s.time=13;s.clockFraction=.5;s.autoPlay=true;s.deadline=16;s.workload.mira=14;
  for(const id of s.team)Object.assign(s.life.members[id],{energy:10,stress:80,morale:40});
  const kept={progress:structuredClone(s.progress),assignments:structuredClone(s.assignments),cash:s.life.cash,budget:s.budget,seats:[...s.seats]};
  assert.equal(scheduleNight(s),true);const p=overnightPreview(s);assert.equal(p.hours,10.5);assert.equal(p.late,8);
  assert.equal(resolveEvent(s,'night-rest'),null);assert.equal(s.time,24);assert.equal(s.deadline,16);assert.equal(s.autoPlay,true);assert.equal(s.clockFraction,0);
  assert.equal(s.life.members.mira.energy,100);assert.equal(s.life.members.mira.stress,45);assert.equal(s.life.members.mira.morale,48);assert.equal(s.workload.mira,0);
  for(const [key,value] of Object.entries(kept))assert.deepEqual(key==='cash'?s.life.cash:s[key],value);
  assert.ok(validSave(s));assert.ok(validSave(restoreOffice(JSON.parse(JSON.stringify(s)))));const before=s.time;assert.equal(tick(s),true);assert.equal(s.time,before+1);
});
test('a leader can change their mind later; overnight rest safely finishes coffee and lounge trips',()=>{
  const s=prepared();s.time=13;assert.equal(scheduleNight(s),true);assert.equal(resolveEvent(s,'night-work'),null);
  s.life.upgrades.push('coffee');assert.equal(careFor(s,'echo','coffee'),null);assert.equal(careFor(s,'mira','break'),null);s.workload.mira=12;assert.equal(nightDecision(s,'rest'),null);
  assert.equal(s.life.members.echo.coffeeTrip,null);assert.equal(s.life.members.echo.coffee,false);assert.equal(s.life.members.mira.restTrip,null);assert.equal(s.life.members.mira.breaks,0);assert.ok(activeTasks(s).length);assert.ok(validSave(s));assert.equal(scheduleNight(s),false);
});
test('daytime, other events and finished releases cannot grant free recovery',()=>{
  for(const stage of ['work','hire','result','event']){const s=prepared();s.stage=stage;if(stage==='event'){s.time=13;s.currentEvent='scope';}const before=structuredClone(s);assert.equal(typeof nightDecision(s,'rest'),'string');assert.deepEqual(s,before);}
  const s=prepared();s.time=13;for(const key in s.progress)s.progress[key]=100;assert.equal(scheduleNight(s),false);
});
test('the first novice project can succeed after a full overnight break and the next order resets requests',()=>{
  const s=prepared('bootstrap');let rested=false;
  for(let i=0;i<180&&s.stage!=='result';i++){
    if(s.stage==='event'){const type=s.life.incident?.type;if(type==='night')rested=true;assert.equal(resolveEvent(s,type==='night'?'night-rest':type==='salary'?'salary-accept':({scope:'focus',review:'review-fix',bug:s.budget>=1500?'fix':'cut',life:'life-care'})[s.currentEvent]),null);}else tick(s);
  }
  assert.equal(s.stage,'result');assert.ok(rested);assert.equal(getResult(s).passed,true);assert.ok(s.time<=s.deadline);assert.ok(validSave(s));
  assert.equal(nextProject(s,'festival'),null);assert.equal(s.life.night,undefined);restoreOffice(s);assert.equal(s.life.night.lastAsked,-1);
});
test('legacy saves migrate; corrupt overnight state is rejected',()=>{
  const s=prepared();delete s.life.night;assert.ok(validSave(s));restoreOffice(s);s.time=13;scheduleNight(s);resolveEvent(s,'night-rest');
  for(const edit of [n=>n.lastAsked=999,n=>n.lastRest.hours=0,n=>n.lastRest.to=25,n=>n.lastDecision.choice='free',n=>n.lastRest.from=NaN]){const c=structuredClone(s);edit(c.life.night);assert.equal(!!validSave(c),false);}
});
