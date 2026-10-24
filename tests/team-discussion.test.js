import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { resolveEvent, validSave, studyDecision, beginPlan, recommend, beginWork, nextProject } from '../engine.js';
import { discussionSpeakers, OPINIONS } from '../assets/team-discussion.js';
import { freshOrbit, stepOrbit } from '../assets/orbit.js';
import { renderDiscussion, renderDecisionReceipt, renderDecisionPanel } from '../assets/decision-view.js';
import { CHARACTER_LINES } from '../assets/character-dialogue.js';

const ready=(event='review')=>{const s=createDemoGame();beginPlan(s);recommend(s);beginWork(s);s.stage='event';s.currentEvent=event;for(const m of Object.values(s.life.members)){m.morale=50;m.stress=50;}return s;};

test('a technical discussion uses present hired colleagues, preferring an opposing opinion',()=>{
  const s=ready('scope');s.assignments.brief='echo';
  assert.deepEqual(discussionSpeakers(s).map(r=>[r.id,r.option]),[['echo','focus'],['iskra','shield']]);
  s.life.members.iskra.breaks=1;
  assert.ok(discussionSpeakers(s).every(r=>r.id!=='iskra'));
  s.life.members.echo.restTrip={phase:'resting'};
  assert.deepEqual(discussionSpeakers(s).map(r=>r.id),['mira']);
});

test('paying for an explanation persists through reload and cannot charge twice',()=>{
  let s=ready('review');const hour=s.time;
  assert.equal(studyDecision(s),null);assert.equal(s.time,hour+1);assert.equal(validSave(s),true);
  s=JSON.parse(JSON.stringify(s));assert.match(studyDecision(s),/уже/);assert.equal(s.time,hour+1);
  assert.match(renderDiscussion(s),/Что выяснили/);assert.doesNotMatch(renderDiscussion(s),/data-action="study-decision"/);
  assert.equal(resolveEvent(s,'review-fix'),null);assert.equal(s.time,hour+2);assert.equal(validSave(s),true);
  assert.match(renderDecisionReceipt(s,'review'),/разбор ранее занял ещё 1 ч/);
});

test('an explanation changes disagreement without cancelling the project cost',()=>{
  const plain=ready('scope'),checked=structuredClone(plain);
  const dissenter=discussionSpeakers(plain).find(r=>r.option!=='focus').id;
  studyDecision(checked);resolveEvent(plain,'focus');resolveEvent(checked,'focus');
  assert.equal(plain.life.members[dissenter].morale,48);assert.equal(plain.life.members[dissenter].stress,52);
  assert.equal(checked.life.members[dissenter].morale,51);assert.equal(checked.life.members[dissenter].stress,48);
  assert.equal(checked.trust,plain.trust);assert.equal(checked.budget,plain.budget);assert.equal(checked.time,plain.time+1);
  assert.equal(checked.discussions.scope.responses.find(r=>r.id===dissenter).kind,'reconsider');
});

test('a popular bad suggestion can improve the author mood while breaking the shipped game',()=>{
  const s=ready('review');s.team[1]='pixel';s.seats[1]='pixel';s.assignments=Object.fromEntries(Object.entries(s.assignments).map(([task,id])=>[task,id==='iskra'?'pixel':id]));s.assignments.code='pixel';
  assert.equal(OPINIONS.pixel.review[0],'review-skip');
  const before=s.life.members.pixel.morale;
  assert.equal(resolveEvent(s,'review-skip'),null);
  assert.equal(s.wallBug,true);const flight=freshOrbit(s);stepOrbit(s,flight,1,0);assert.equal(stepOrbit(s,flight,0,1).kind,'phase');assert.deepEqual([flight.x,flight.y],[1,1]);
  assert.ok(s.life.members.pixel.morale>before);assert.equal(s.discussions.review.responses.find(r=>r.id==='pixel').kind,'agree');
  assert.equal(validSave(s),true);
});

test('unaffordable choices do not resolve a discussion or change relationships',()=>{
  const s=ready('bug');s.budget=500;const before=structuredClone(s);
  assert.match(resolveEvent(s,'fix'),/1 500/);assert.deepEqual(s,before);
  assert.equal(resolveEvent(s,'cut'),null);assert.equal(s.checkpoint,false);
  assert.equal(validSave(s),true);assert.equal(resolveEvent(s,'cut'),'Сейчас нет события.');
});

test('legacy saves remain valid, corrupt discussion fields are rejected and a new project resets opinions',()=>{
  const s=ready('scope');assert.equal(validSave(s),true);studyDecision(s);resolveEvent(s,'swap');assert.equal(validSave(s),true);
  for(const mutate of [row=>row.checked='yes',row=>row.option='free-money',row=>row.responses[0].id='outsider',row=>row.effects.time=Infinity]){
    const bad=structuredClone(s);mutate(bad.discussions.scope);assert.equal(validSave(bad),false);
  }
  s.stage='result';s.life.settled=true;s.life.cash=50000;assert.equal(nextProject(s,'club'),null);assert.equal(s.discussions,undefined);
});

test('all characters have distinct authored opinions and responses for each decision',()=>{
  for(const kind of ['scope','review','bug','agree','disagree','reconsider']){
    const lines=Object.values(CHARACTER_LINES).map(row=>row[kind]);assert.equal(new Set(lines).size,6);assert.ok(lines.every(text=>text.length>70));
  }
});

test('the decision view composes one discussion for technical events and keeps office incidents separate',()=>{
  const s=ready('bug');assert.equal((renderDecisionPanel(s).match(/class="team-discussion"/g)||[]).length,1);
  s.currentEvent='life';s.life.incident={type:'noise',id:s.team[0]};assert.doesNotMatch(renderDecisionPanel(s),/class="team-discussion"/);
});
