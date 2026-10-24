import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { beginPlan, beginWork, activeTasks } from '../engine.js';
import { teamMemberState } from '../assets/team-hud.js';

test('crew presentation reads the current team without changing the save', () => {
  const s=createDemoGame(), before=structuredClone(s);
  const mira=teamMemberState(s,'mira');
  assert.equal(mira.energy,s.life.members.mira.energy);
  assert.equal(mira.morale,s.life.members.mira.morale);
  assert.equal(mira.agent.name,'Мира');
  assert.equal(teamMemberState(s,'nord'),null);
  assert.deepEqual(s,before);
});

test('current activity follows dependency and assignment changes', () => {
  const s=createDemoGame();beginPlan(s);beginWork(s);
  const active=activeTasks(s)[0], worker=s.assignments[active.id];
  assert.equal(teamMemberState(s,worker).activity,active.verb);
  assert.equal(teamMemberState(s,worker).progress,s.progress[active.id]);
  assert.equal(teamMemberState(s,s.assignments.code).activity,'Ждёт свой этап');
  s.progress.brief=100;
  assert.equal(teamMemberState(s,s.assignments.code).activity,'Пишет механику');
});

test('care signals and replies react to genuine energy, stress and morale', () => {
  const s=createDemoGame(), m=s.life.members.mira;
  m.energy=10;m.stress=80;m.morale=20;
  const critical=teamMemberState(s,'mira');
  assert.equal(critical.tone,'urgent');assert.equal(critical.mood,'На грани выгорания');
  assert.match(critical.line,/отдых/);
  m.energy=85;m.stress=10;m.morale=90;
  const recovered=teamMemberState(s,'mira');
  assert.equal(recovered.tone,'bright');assert.equal(recovered.mood,'Воодушевление');
  assert.notEqual(critical.line,recovered.line);
});

test('a worker travelling to the chair or resting never claims active work', () => {
  const s=createDemoGame();beginPlan(s);beginWork(s);s.progress.brief=100;
  const m=s.life.members.mira;
  m.restTrip={phase:'outbound',slot:0};m.breaks=1;
  assert.equal(teamMemberState(s,'mira').activity,'Идёт отдыхать');
  assert.equal(teamMemberState(s,'mira').progress,null);
  m.restTrip.phase='resting';assert.equal(teamMemberState(s,'mira').activity,'На перерыве');
  m.breaks=0;m.restTrip.phase='returning';assert.equal(teamMemberState(s,'mira').activity,'Возвращается');
  s.life.members.iskra.restTrip={phase:'resting',slot:1};s.life.members.iskra.breaks=1;
  m.restTrip.phase='queued';assert.equal(teamMemberState(s,'mira').activity,'Ждёт кресло');
});
