import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS } from '../data.js';
import { createGame, hire, seatAgent, beginPlan, recommend, beginWork, tick, resolveEvent, getResult, nextProject, validSave, restoreOffice } from '../engine.js';
import { agentProfile, trainEmployee, contractLock, contractTerms } from '../assets/studio-career.js';
import { settleProject, CONTRACTS } from '../assets/studio-life.js';
import { contractCosts } from '../assets/commission-view.js';
import { missionReward } from '../assets/studio-progression.js';
import { freshOrbit, recordOrbitResult } from '../assets/orbit.js';
import { missionRoute } from './orbit-route.js';

function studio(){const s=createGame('bootstrap');for(const [i,id] of ['mira','iskra','echo'].entries()){assert.equal(hire(s,id),null);seatAgent(s,id,i);}return s;}
function finish(s,ignore=false){beginPlan(s);recommend(s);beginWork(s);for(let n=0;n<150&&s.stage!=='result';n++){if(s.stage==='event')assert.equal(resolveEvent(s,{scope:'focus',review:'review-fix',bug:ignore?'ignore':s.budget>=1500?'fix':'cut',life:'life-care'}[s.currentEvent]),null);else assert.equal(tick(s),true);}assert.equal(s.stage,'result');assert.ok(validSave(s));return s;}

test('bootstrapped studio can afford three novices and cannot borrow expert stats from classic games',()=>{
  const originals=structuredClone(AGENTS),s=studio();assert.equal(s.life.cash,800);assert.equal(s.budget,2400);
  for(const a of AGENTS){const p=agentProfile(s,a.id);assert.ok(Object.values(p.stats).every(n=>n>=10&&n<=32));assert.ok(p.cost<3000);}
  assert.equal(agentProfile(createGame('calm'),'mira').stats.design,96);assert.deepEqual(AGENTS,originals);assert.ok(validSave(s));
});
test('paid learning is capped per employee and persists without changing hire refunds',()=>{
  let s=studio();const budget=s.budget,old=agentProfile(s,'mira').stats.design;
  assert.equal(trainEmployee(s,'mira','design'),null);assert.equal(s.life.cash,200);assert.equal(agentProfile(s,'mira').stats.design,old+4);assert.equal(s.budget,budget);
  s=restoreOffice(JSON.parse(JSON.stringify(s)));assert.ok(validSave(s));assert.ok(trainEmployee(s,'mira','code'));assert.equal(s.life.cash,200);
  assert.equal(hire(s,'mira'),null);assert.equal(s.budget,budget+2400);assert.equal(hire(s,'mira'),null);assert.equal(s.budget,budget);
});
test('first modest project is winnable and successful work grants persistent relevant skills once',()=>{
  const s=studio(),old=structuredClone(s.life.career.skills);finish(s);assert.equal(getResult(s).passed,true);assert.equal(s.life.career.reputation,10);
  assert.ok(s.life.career.skills.iskra.code>old.iskra.code);assert.equal(s.life.career.skills.pixel.code,old.pixel.code);
  const saved=structuredClone(s);settleProject(s,getResult(s));assert.deepEqual(s,saved);assert.deepEqual(getResult(restoreOffice(JSON.parse(JSON.stringify(s)))),getResult(s));
});
test('post-release training never rewrites the project score or pays the release twice',()=>{
  const s=finish(studio()),result=getResult(s),reward=s.life.history.at(-1).reward;
  assert.equal(trainEmployee(s,'mira','design'),null);assert.deepEqual(getResult(s),result);assert.equal(s.life.history.at(-1).reward,reward);
  const cash=s.life.cash;settleProject(s,getResult(s));assert.equal(s.life.cash,cash);
});
test('reputation gates larger clients and financial previews equal real next-order costs',()=>{
  const s=finish(studio()),before=structuredClone(s);assert.ok(contractLock(s,'club'));assert.ok(nextProject(s,'club'));assert.deepEqual(s,before);
  assert.equal(nextProject(s,'festival'),null);finish(s);assert.equal(contractLock(s,'club'),'');
  const cost=contractCosts(s,CONTRACTS.find(c=>c.id==='club'));assert.equal(nextProject(s,'club'),null);
  assert.equal(s.budget,cost.reserve);assert.equal(s.initialBudget,cost.budget);assert.equal(s.life.cash,cost.cashAfter);assert.equal(agentProfile(s,'mira').cost,2550);assert.ok(validSave(s));
});
test('a failed release still teaches the team and leaves an affordable way to retry',()=>{
  const s=studio();finish(s,true);assert.equal(getResult(s).passed,false);assert.equal(s.life.history.at(-1).reward,600);assert.equal(s.life.career.reputation,0);assert.ok(s.life.career.skills.iskra.code>28);
  assert.equal(nextProject(s,'festival'),null);assert.ok(s.budget>=1000);assert.ok(validSave(s));
});
test('eight-order career unlocks clients, keeps ledger valid and pays mission premiums only once',()=>{
  const s=studio();
  for(let i=0;i<8;i++){
    if(i)assert.equal(nextProject(s,i>=5?'cup':i>=2?'club':'festival'),null);
    if(s.life.cash>=600)assert.equal(trainEmployee(s,'mira','design'),null);
    finish(s);assert.ok(getResult(s).passed);const flight=freshOrbit(s);missionRoute(s,flight);assert.ok(flight.won);
    const cash=s.life.cash,reward=missionReward(s,s.life.contract).cash;assert.ok(recordOrbitResult(s,flight));assert.equal(s.life.cash,cash+reward);assert.equal(recordOrbitResult(s,flight),false);assert.ok(validSave(s));
  }
  assert.equal(s.life.career.reputation,80);assert.ok(s.life.career.skills.mira.design>=75);assert.ok(s.life.cash>6000);assert.deepEqual(s.life.missionsWon,['festival','club','cup']);
});
test('career save validation rejects corrupted skills, future training and missing progression',()=>{
  const original=studio();for(const corrupt of [s=>s.life.career.skills.mira.code=NaN,s=>s.life.career.skills.mira.code=91,s=>s.life.career.trained.mira=99,s=>delete s.life.career]){const s=structuredClone(original);corrupt(s);assert.equal(!!validSave(s),false);}
});
