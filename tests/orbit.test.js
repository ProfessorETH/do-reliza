import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, hire, seatAgent, beginPlan, recommend, beginWork, tick, resolveEvent, nextProject, getResult } from '../engine.js';
import { freshOrbit, restoreOrbit, moveOrbit, stepOrbit, orbitFeatures, rocks, batteriesFor, outsideOrbit } from '../assets/orbit.js';
import { renderOrbit } from '../assets/orbit-view.js';

function release(scope = 'shield', bug = 'fix', review = 'review-fix') {
  const game = createGame('calm');
  ['mira','iskra','echo'].forEach((id, i) => { hire(game, id); seatAgent(game, id, i); });
  beginPlan(game); recommend(game); beginWork(game);
  return finish(game, scope, bug, review);
}
function finish(game, scope, bug, review) {
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

test('collision effects show the blocked cell, shield impact and actual asteroid overlap', () => {
  for (const [scope, review, kind] of [['focus','review-fix','blocked'],['shield','review-fix','shield-hit'],['focus','review-skip','phase']]) {
    const game=release(scope,'fix',review), flight=freshOrbit(game);
    moveOrbit(game,flight,1,0);
    const effect=stepOrbit(game,flight,0,1);
    assert.equal(effect.kind,kind);assert.equal(effect.cell,'1,1');
    const html=renderOrbit(game,flight,{icon:()=>'',design:90,effect});
    assert.ok(html.includes(`impact-${kind}`));
    if(kind==='phase')assert.match(html,/Корабль, внутри астероида/);
  }
});
test('paired review guards all four boundaries without trapping the ship or consuming a shield', () => {
  const game=release('shield','fix','review-pair'), flight=freshOrbit(game);
  for(const [x,y,dx,dy] of [[0,0,-1,0],[0,0,0,-1],[6,4,1,0],[6,4,0,1]]) {
    flight.x=x;flight.y=y;
    const before=structuredClone(flight), effect=stepOrbit(game,flight,dx,dy);
    assert.equal(effect.kind,'edge');assert.match(effect.message,/команда проверила/);
    assert.deepEqual(flight,before);
  }
  assert.equal(orbitFeatures(game,90).edgeGuard,true);
  assert.equal(orbitFeatures(release('shield','fix','review-fix'),90).edgeGuard,false);
});
test('design assignment and mentoring change the actual map presentation, while scope swap stays simple', () => {
  const game=release('shield');
  game.assignments.design='echo';
  assert.equal(orbitFeatures(game,getResult(game).design).decorated,false);
  game.support={agentId:'echo',taskId:'design'};
  assert.equal(orbitFeatures(game,getResult(game).design).decorated,true);
  game.choices.scope='swap';game.designPenalty=12;
  assert.equal(orbitFeatures(game,100).decorated,false);
});
function flyTo(game, flight, target) {
  const queue=[[flight.x,flight.y,[]]], seen=new Set();
  while(queue.length) {
    const [x,y,path]=queue.shift(),key=`${x},${y}`;
    if(seen.has(key))continue;seen.add(key);
    if(key===target){for(const [dx,dy] of path)moveOrbit(game,flight,dx,dy);return;}
    for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]])if(!outsideOrbit(x+dx,y+dy)&&!rocks.has(`${x+dx},${y+dy}`))queue.push([x+dx,y+dy,[...path,[dx,dy]]]);
  }
  assert.fail(`No route to ${target}`);
}
test('all 27 decision combinations remain playable across all three commissions and preserve their save policy', () => {
  let count=0;
  for(const scope of ['focus','shield','swap'])for(const review of ['review-fix','review-pair','review-skip'])for(const bug of ['fix','cut','ignore']) {
    const first=release(scope,bug,review);
    for(const contract of ['festival','club','cup']) {
      const game=structuredClone(first);
      if(contract!=='festival'){
        assert.equal(nextProject(game,contract),null);assert.ok(beginPlan(game));recommend(game);assert.ok(beginWork(game));finish(game,scope,bug,review);
      }
      const flight=freshOrbit(game);
      for(const target of batteriesFor(game))flyTo(game,flight,target);
      const restored=restoreOrbit(game,JSON.parse(JSON.stringify(flight)));
      assert.equal(restored.collected.length,bug==='fix'?3:0);
      assert.equal(orbitFeatures(game,getResult(game).design).saveMode,{fix:'working',cut:'removed',ignore:'broken'}[bug]);
      const html=renderOrbit(game,flight,{icon:()=>'',design:getResult(game).design,stored:bug==='fix'});
      assert.equal(html.includes('data-action="reload-mini"'),bug!=='cut');
      flyTo(game,flight,'6,4');assert.ok(flight.won);count++;
    }
  }
  assert.equal(count,81);
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
