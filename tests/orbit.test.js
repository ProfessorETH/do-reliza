import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, hire, seatAgent, beginPlan, recommend, beginWork, tick, resolveEvent } from '../engine.js';
import { freshOrbit, restoreOrbit, moveOrbit } from '../assets/orbit.js';

function release(scope = 'shield', bug = 'fix', review = 'review-fix') {
  const game = createGame('calm');
  ['mira','iskra','echo'].forEach((id, i) => { hire(game, id); seatAgent(game, id, i); });
  beginPlan(game); recommend(game); beginWork(game);
  for (let n = 0; n < 100 && game.stage !== 'result'; n++) {
    if (game.stage === 'event') assert.equal(resolveEvent(game, { scope, bug, review, life: 'life-care' }[game.currentEvent]), null);
    else tick(game);
  }
  assert.equal(game.stage, 'result');
  return game;
}
test('both shield decisions protect one collision; deferring the feature blocks the same move', () => {
  for (const choice of ['shield', 'swap', 'focus']) {
    const game = release(choice), flight = freshOrbit(game);
    assert.equal(flight.shield, choice !== 'focus');
    moveOrbit(game, flight, 1, 0);
    const message = moveOrbit(game, flight, 0, 1);
    assert.equal(flight.y, choice === 'focus' ? 0 : 1);
    assert.equal(flight.shield, false);
    assert.match(message, choice === 'focus' ? /преградил/ : /поглотил/);
    if (choice !== 'focus') {
      moveOrbit(game, flight, 1, 0);
      assert.match(moveOrbit(game, flight, 1, 0), /преградил/);
      assert.equal(flight.x, 2);
    }
  }
});
test('checkpoint preserves consumed charge only for the same release and a new flight restores it', () => {
  const game = release(), flight = freshOrbit(game);
  moveOrbit(game, flight, 1, 0); moveOrbit(game, flight, 0, 1);
  const saved = JSON.parse(JSON.stringify(flight));
  assert.deepEqual(restoreOrbit(game, saved), flight);
  assert.equal(freshOrbit(game).shield, true);
  for (const change of [g => g.life.completed++, g => g.life.seed++, g => g.life.contract = 'club', g => { g.choices.scope = 'focus'; g.shield = false; }]) {
    const other = structuredClone(game); change(other);
    assert.deepEqual(restoreOrbit(other, saved), freshOrbit(other));
  }
  assert.deepEqual(restoreOrbit(game, { x: 2, y: 0, collected: ['2,0'], shield: false }), freshOrbit(game));
});
test('save and code-review decisions affect actual flight behavior', () => {
  for (const bug of ['fix', 'cut', 'ignore']) {
    const game = release('shield', bug), flight = freshOrbit(game);
    moveOrbit(game, flight, 1, 0);
    assert.equal(restoreOrbit(game, flight).x, bug === 'fix' ? 1 : 0);
  }
  const game = release('shield', 'fix', 'review-skip'), flight = freshOrbit(game);
  moveOrbit(game, flight, 1, 0);
  assert.match(moveOrbit(game, flight, 0, 1), /Ошибка движения/);
  assert.equal(flight.y, 1); assert.equal(flight.shield, true);
});
test('invalid checkpoints reset safely; collecting the route still completes the mission', () => {
  const game = release(), fresh = freshOrbit(game);
  for (const corrupt of [{ shield: 'yes' }, { x: 7 }, { collected: ['2,0','2,0'] }, { won: true }, { moves: -1 }]) {
    assert.deepEqual(restoreOrbit(game, { ...fresh, ...corrupt }), fresh);
  }
  const flight = freshOrbit(game);
  const steps = [[1,0],[1,0],[0,1],[0,1],[1,0],[1,0],[-1,0],[-1,0],[-1,0],[-1,0],[0,1],[0,1],...Array(6).fill([1,0])];
  steps.forEach(([dx,dy]) => moveOrbit(game, flight, dx, dy));
  assert.equal(flight.won, true); assert.equal(flight.collected.length, 3);
  assert.deepEqual(restoreOrbit(game, flight), flight);
});
