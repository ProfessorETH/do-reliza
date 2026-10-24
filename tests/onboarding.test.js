import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, hire, seatAgent, beginPlan, recommend, beginWork, tick, restoreOffice } from '../engine.js';
import { guideFor, STORY } from '../assets/onboarding/onboarding-model.js';

test('guidance follows real hiring, seating and assignment prerequisites without changing the game', () => {
  const game = createGame('calm');
  const before = structuredClone(game);
  assert.equal(guideFor(game).id, 'hire');
  assert.deepEqual(game, before);
  ['mira', 'iskra', 'echo'].forEach(id => hire(game, id));
  assert.equal(guideFor(game).id, 'seat');
  game.team.forEach((id, i) => seatAgent(game, id, i));
  assert.match(guideFor(game, true).title, /занимает места/);
  assert.equal(guideFor(game).id, 'plan');
  beginPlan(game);
  assert.equal(guideFor(game).target, '[data-action="recommend"]');
  recommend(game);
  assert.equal(guideFor(game).target, '[data-action="work"]');
  beginWork(game);
  assert.equal(guideFor(game).id, 'time');
  tick(game); tick(game);
  assert.equal(guideFor(game).id, 'support');
  game.support = { agentId: 'iskra', taskId: 'code' };
  assert.equal(guideFor(game).id, 'time');
});

test('restored games and backward navigation use the current state rather than a saved step counter', () => {
  const game = createGame('calm');
  ['mira', 'iskra', 'echo'].forEach(id => hire(game, id));
  game.team.forEach((id, i) => seatAgent(game, id, i));
  beginPlan(game); recommend(game);
  delete game.seats; delete game.officeTargets;
  const restored = restoreOffice(JSON.parse(JSON.stringify(game)));
  assert.equal(guideFor(restored).target, '[data-action="work"]');
  restored.stage = 'hire';
  hire(restored, 'echo');
  assert.equal(guideFor(restored).id, 'hire');
  restored.stage = 'event';
  assert.equal(guideFor(restored).id, 'event');
  restored.stage = 'result';
  assert.equal(guideFor(restored).target, '[data-action="life-contracts"]');
  assert.equal(guideFor(null), null);
  assert.equal(STORY.length, 3);
});

test('Nika explains employee care, personal breaks, random incidents and repeat commissions', () => {
  const game = createGame('calm');
  ['mira', 'iskra', 'echo'].forEach((id, i) => { hire(game,id); seatAgent(game,id,i); });
  beginPlan(game); recommend(game); beginWork(game);
  game.life.members.mira.energy = 20;
  assert.equal(guideFor(game).id,'care');
  assert.equal(guideFor(game).target,'[data-action="life-member"][data-id="mira"]');
  game.life.members.mira.breaks = 1;
  assert.equal(guideFor(game).id,'time');
  game.time = 2; game.team.forEach(id=>game.life.members[id].breaks=1);
  assert.equal(guideFor(game).id,'time'); // No support button while everyone rests.
  game.stage='event';game.currentEvent='life';
  assert.equal(guideFor(game).voice,'guide-team-event');
  assert.match(guideFor(game).text,/настроение/);
  game.stage='result';game.life.completed=2;
  assert.match(guideFor(game).title,/Ещё один/);
  assert.equal(guideFor(game).target,'[data-action="life-contracts"]');
});
