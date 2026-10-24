import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS, TASKS, DIFFICULTIES } from '../data.js';
import { createGame, hire, beginPlan, assign, recommend, beginWork, tick, activeTasks, resolveEvent, getResult, validSave, supportTask, fit, seatAgent, teamSeated, restoreOffice, walkInOffice } from '../engine.js';

function prepared(ids=['mira','iskra','echo'],difficulty='normal') {
  const s=createGame(difficulty);for(const id of ids)assert.equal(hire(s,id),null);
  ids.forEach((id,i)=>assert.equal(seatAgent(s,id,i),null));
  assert.equal(beginPlan(s),true);recommend(s);assert.equal(beginWork(s),true);return s;
}
function finish(s,scope='focus',bug='fix',review='review-fix') {
  for(let i=0;i<100&&s.stage!=='result';i++){
    if(s.stage==='event'){
      let option=s.currentEvent==='life'?'life-care':s.currentEvent==='scope'?scope:s.currentEvent==='review'?review:bug;
      if(option==='shield'&&s.budget<2000)option='focus';
      if(option==='fix'&&s.budget<1500)option='cut';
      assert.equal(resolveEvent(s,option),null);
    }else assert.equal(tick(s),true,`stuck at ${s.stage}`);
  }
  assert.equal(s.stage,'result');return s;
}
test('hiring respects budget, headcount and refunds',()=>{
  const s=createGame();hire(s,'mira');hire(s,'nord');
  assert.match(hire(s,'saga'),/бюджета/);assert.equal(s.budget,7000);
  hire(s,'echo');assert.match(hire(s,'pixel'),/места заняты/);
  hire(s,'mira');assert.equal(s.budget,12000);assert.equal(s.team.length,2);
  assert.equal(beginPlan(s),false);
});
test('unassigned plan cannot start and foreign agents cannot be assigned',()=>{
  const s=createGame();['mira','iskra','echo'].forEach((id,i)=>{hire(s,id);seatAgent(s,id,i);});beginPlan(s);
  assert.equal(beginWork(s),false);assert.equal(assign(s,'code','nord'),false);
  assert.equal(fit(s.assignments.code,TASKS.find(t=>t.id==='code'),s),0);
  recommend(s);assert.equal(beginWork(s),true);assert.equal(assign(s,'code','mira'),false);
});
test('dependency graph and one task per worker are respected',()=>{
  const s=prepared();assert.deepEqual(activeTasks(s).map(t=>t.id),['brief']);
  s.progress.brief=100;s.assignments.design='iskra';s.assignments.code='iskra';
  assert.deepEqual(activeTasks(s).map(t=>t.id),['design']);
  s.assignments.design='mira';assert.deepEqual(activeTasks(s).map(t=>t.id),['design','code']);
  assert.equal(activeTasks(s).some(t=>t.id==='qa'),false);
});
test('decisions pause the clock, reject unaffordable choices and cannot be repeated',()=>{
  const s=prepared();while(s.stage==='work')tick(s);const time=s.time;
  assert.equal(tick(s),false);assert.equal(s.time,time);s.budget=0;
  assert.match(resolveEvent(s,'shield'),/резерве/);assert.equal(s.stage,'event');
  assert.equal(resolveEvent(s,'focus'),null);assert.match(resolveEvent(s,'focus'),/нет события/);
});
test('added scope preserves already completed effort',()=>{
  const s=prepared();while(s.stage==='work')tick(s);s.budget=3000;s.progress.code=50;
  resolveEvent(s,'shield');assert.equal(s.extraCode,2);assert.ok(Math.abs(s.progress.code-100/3)<1e-9);
});
test('all affordable teams and valid branches finish without budget underflow',()=>{
  let scenarios=0;
  for(const difficulty of Object.keys(DIFFICULTIES))for(let a=0;a<6;a++)for(let b=a+1;b<6;b++)for(let c=b+1;c<6;c++){
    const team=[AGENTS[a],AGENTS[b],AGENTS[c]];
    if(team.reduce((n,x)=>n+x.cost,0)>DIFFICULTIES[difficulty].budget)continue;
    for(const scope of ['focus','shield','swap'])for(const bug of ['fix','cut','ignore'])for(const review of ['review-fix','review-pair','review-skip']){
      const s=finish(prepared(team.map(x=>x.id),difficulty),scope,bug,review);
      assert.ok(s.budget>=0);assert.ok(s.time<60);assert.ok(validSave(JSON.parse(JSON.stringify(s))));
      assert.ok(TASKS.every(t=>s.progress[t.id]===100));
      const r=getResult(s);assert.ok(r.score>=0&&r.score<=100);
      if(s.criticalBug||s.wallBug)assert.equal(r.passed,false);
      scenarios++;
    }
  }
  assert.ok(scenarios>300);console.log(`Validated ${scenarios} complete team/difficulty/decision scenarios.`);
});
test('mentoring costs an hour and improves only the chosen active task once',()=>{
  const s=prepared();const task=TASKS.find(t=>t.id==='brief');
  const agent=s.assignments.brief;const before=fit(agent,task,s);const time=s.time;
  assert.equal(typeof supportTask(s,'qa'),'string');
  assert.equal(s.time,time);assert.equal(supportTask(s,'brief'),null);
  assert.equal(s.time,time+1);assert.equal(fit(agent,task,s),Math.min(100,before+15));
  assert.equal(typeof supportTask(s,'brief'),'string');assert.equal(s.time,time+1);
  assert.ok(validSave(JSON.parse(JSON.stringify(s))));
});
test('skipping code review leaves a critical defect despite fixing the save bug',()=>{
  const broken=finish(prepared(),'focus','fix','review-skip');
  const fixed=finish(prepared(),'focus','fix','review-fix');
  assert.equal(broken.wallBug,true);assert.equal(getResult(broken).passed,false);
  assert.equal(!!fixed.wallBug,false);assert.ok(getResult(fixed).score>getResult(broken).score);
});
test('damaged saves rejected; normal play survives JSON round trip',()=>{
  assert.equal(!!validSave(null),false);assert.equal(!!validSave({version:1,stage:'wat'}),false);
  const s=prepared();assert.ok(validSave(s));const broken=structuredClone(s);broken.assignments.qa='unknown';assert.equal(!!validSave(broken),false);
  assert.ok(validSave(finish(JSON.parse(JSON.stringify(s)))));
});

test('office seating gates planning, swaps seats and frees a dismissed worker',()=>{
  const s=createGame('calm');['mira','iskra','echo'].forEach(id=>hire(s,id));
  assert.equal(beginPlan(s),false);
  assert.equal(typeof seatAgent(s,'nord',0),'string');
  assert.equal(typeof seatAgent(s,'mira',3),'string');
  ['mira','iskra','echo'].forEach((id,i)=>assert.equal(seatAgent(s,id,i),null));
  assert.ok(teamSeated(s));assert.equal(seatAgent(s,'mira',1),null);
  assert.deepEqual(s.seats,['iskra','mira','echo']);
  hire(s,'mira');assert.deepEqual(s.seats,['iskra',null,'echo']);
  assert.equal(teamSeated(s),false);hire(s,'mira');seatAgent(s,'mira',1);
  assert.ok(validSave(JSON.parse(JSON.stringify(s))));
  assert.equal(beginPlan(s),true);recommend(s);assert.equal(beginWork(s),true);
  assert.equal(typeof seatAgent(s,'mira',2),'string');
});

test('old saves get office seats without losing project progress; corrupt layouts rejected',()=>{
  const s=prepared();tick(s);const before=structuredClone(s.progress);delete s.seats;
  assert.ok(validSave(s));restoreOffice(s);assert.deepEqual(s.seats,s.team);
  assert.deepEqual(s.progress,before);assert.ok(teamSeated(s));
  const duplicate=structuredClone(s);duplicate.seats[1]=duplicate.seats[0];assert.equal(!!validSave(duplicate),false);
  const foreign=structuredClone(s);foreign.seats[0]='nord';assert.equal(!!validSave(foreign),false);
  const missing=structuredClone(s);missing.seats[0]=null;assert.equal(!!validSave(missing),false);
  const fresh=createGame();hire(fresh,'mira');delete fresh.seats;restoreOffice(fresh);
  assert.deepEqual(fresh.seats,[null,null,null]);
});

test('seating an arrival at an occupied computer sends its previous occupant to the entrance',()=>{
  const s=createGame('calm');hire(s,'mira');hire(s,'iskra');seatAgent(s,'mira',0);
  seatAgent(s,'iskra',0);assert.deepEqual(s.seats,['iskra',null,null]);
  assert.equal(s.team.length,2);assert.ok(validSave(s));
});

test('free walking releases the seat, survives saving and cannot bypass work preparation',()=>{
  const s=createGame('calm');['mira','iskra','echo'].forEach((id,i)=>{hire(s,id);seatAgent(s,id,i);});
  beginPlan(s);recommend(s);
  assert.equal(walkInOffice(s,'mira',[2.4,1]),null);
  assert.equal(s.seats.includes('mira'),false);assert.equal(beginWork(s),false);
  assert.ok(validSave(JSON.parse(JSON.stringify(s))));
  const before=structuredClone(s.officeTargets);
  assert.equal(typeof walkInOffice(s,'mira',[-2.65,-1.95]),'string');
  assert.equal(typeof walkInOffice(s,'nord',[2.4,1]),'string');assert.deepEqual(s.officeTargets,before);
  seatAgent(s,'mira',0);assert.equal(s.officeTargets.mira,undefined);assert.equal(beginWork(s),true);
  assert.equal(typeof walkInOffice(s,'mira',[2.4,1]),'string');assert.ok(teamSeated(s));
  const corrupt=structuredClone(s);corrupt.officeTargets={mira:[2.4,1]};assert.equal(!!validSave(corrupt),false);
});
