import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { beginPlan, beginWork, validSave, tick, resolveEvent } from '../engine.js';

test('quick demo uses a valid affordable team and completes through normal gameplay', () => {
  const g = createDemoGame(); assert.ok(validSave(g)); assert.equal(g.stage,'hire');
  assert.deepEqual(g.team,['mira','iskra','echo']); assert.deepEqual(g.seats,g.team); assert.ok(g.budget > 0);
  assert.ok(beginPlan(g)); assert.ok(beginWork(g));
  for(let i=0;i<100&&g.stage!=='result';i++) {
    if(g.stage==='event') { const choice={scope:'focus',bug:'fix',review:'review-fix',life:'life-care'}[g.currentEvent]; assert.equal(resolveEvent(g,choice),null); }
    else tick(g);
  }
  assert.equal(g.stage,'result'); assert.ok(validSave(g));
});
