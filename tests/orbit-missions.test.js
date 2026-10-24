import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';
import {freshOrbit,stepOrbit,actOrbit,restoreOrbit,recordOrbitResult} from '../assets/orbit.js';
import {missionFor,patrolAt,raceMedal} from '../assets/orbit-missions.js';
import {missionRoute,routeTo,followRoute} from './orbit-route.js';
const gameFor=id=>{const g=createGame();g.life.contract=id;return g;};
test('research needs relay, two explicit scans and energy; shield cannot bypass the barrier',()=>{
  const g=gameFor('club'),m=missionFor(g);g.shield=true;const f=freshOrbit(g);
  f.x=3;f.y=0;assert.equal(stepOrbit(g,f,1,0).kind,'barrier');assert.equal(f.x,3);assert.ok(f.shield);
  followRoute(g,f,routeTo(g,f,m.relay));assert.ok(f.relay);
  followRoute(g,f,routeTo(g,f,m.scans[0]));assert.deepEqual(f.scanned,[]);
  assert.equal(actOrbit(g,f,'scan').kind,'scan');assert.equal(actOrbit(g,f,'scan').kind,'idle');
  const resumed=restoreOrbit(g,JSON.parse(JSON.stringify(f)));assert.deepEqual(resumed,f);
  missionRoute(g,resumed);assert.ok(resumed.won);assert.equal(resumed.scanned.length,2);
});
test('race gates must be passed in order and patrol advances predictably on moves and waiting',()=>{
  const g=gameFor('cup'),f=freshOrbit(g),m=missionFor(g);
  f.x=7;f.y=1;stepOrbit(g,f,0,1);assert.equal(f.gates,0);
  f.x=3;f.y=2;f.turns=0;f.moves=0;
  assert.equal(patrolAt(m,1),'4,2');assert.equal(stepOrbit(g,f,1,0).kind,'patrol-hit');
  assert.equal(f.x,3);assert.equal(f.moves,4);assert.equal(f.turns,1);
  assert.equal(actOrbit(g,f,'wait').kind,'wait');assert.equal(f.turns,2);
  assert.deepEqual(restoreOrbit(g,JSON.parse(JSON.stringify(f))),f);
  g.shield=true;const shield=freshOrbit(g);shield.x=3;shield.y=2;
  assert.equal(stepOrbit(g,shield,1,0).kind,'shield-hit');assert.equal(shield.x,4);assert.equal(shield.moves,1);assert.equal(shield.shield,false);
});
test('race has a no-shield gold route, records improve only on a completed faster flight',()=>{
  const g=gameFor('cup'),f=freshOrbit(g);assert.equal(recordOrbitResult(g,f),false);
  missionRoute(g,f);assert.ok(f.won);assert.equal(raceMedal(missionFor(g),f),'Золото');
  assert.equal(recordOrbitResult(g,f),true);assert.equal(recordOrbitResult(g,f),false);
  const best=g.orbitRecords.cup;f.moves+=5;assert.equal(recordOrbitResult(g,f),false);assert.equal(g.orbitRecords.cup,best);
});
test('festival v2 checkpoints migrate, revised maps reset only their flight, corrupt objectives are rejected',()=>{
  const g=gameFor('festival'),f=freshOrbit(g);stepOrbit(g,f,1,0);const old={...f,version:2};delete old.turns;delete old.scanned;delete old.gates;delete old.relay;
  assert.deepEqual(restoreOrbit(g,old),f);
  g.life.contract='club';assert.deepEqual(restoreOrbit(g,old),freshOrbit(g));
  for(const invalid of [{scanned:['bad']},{gates:5},{turns:-1},{won:true}])assert.deepEqual(restoreOrbit(g,{...freshOrbit(g),...invalid}),freshOrbit(g));
});
