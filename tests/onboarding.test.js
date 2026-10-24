import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, hire, seatAgent, beginPlan, recommend, beginWork, tick, restoreOffice } from '../engine.js';
import { guideFor, STORY } from '../onboarding-model.js';

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
  assert.equal(guideFor(restored).target, '[data-action="play-mini"]');
  assert.equal(guideFor(null), null);
  assert.equal(STORY.length, 3);
});
