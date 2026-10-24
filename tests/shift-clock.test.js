import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceShiftClock, shiftTime } from '../assets/shift-clock.js';
import { createDemoGame } from '../demo.js';
import { beginPlan,beginWork,tick,resolveEvent,restoreOffice,validSave } from '../engine.js';

test('auto intent survives events, reload and a blocked window without spending time',()=>{
  let s=createDemoGame();beginPlan(s);beginWork(s);s.autoPlay=true;
  for(let n=0;n<3;n++)assert.equal(tick(s),true);
  assert.equal(s.stage,'event');const before=structuredClone(s);
  for(let n=0;n<100;n++)assert.equal(advanceShiftClock(s,100),false);
  assert.deepEqual(s,before);assert.ok(validSave(s));
  s=restoreOffice(JSON.parse(JSON.stringify(s)));assert.equal(s.autoPlay,true);
  assert.equal(resolveEvent(s,'focus'),null);
  assert.equal(advanceShiftClock(s,400),false);const fraction=s.clockFraction;
  assert.equal(advanceShiftClock(s,500,true),false);assert.equal(s.clockFraction,fraction);
  let due=false;for(let n=0;n<40&&!due;n++)due=advanceShiftClock(s,100);
  assert.equal(due,true);assert.equal(s.autoPlay,true);assert.equal(s.clockFraction,0);
});
test('clock shows midnight, remaining minutes and overtime; hidden tab cannot skip hours',()=>{
  const s={time:0,deadline:16,clockFraction:.5,stage:'work',autoPlay:true};
  assert.deepEqual(shiftTime(s),{now:'09:30',end:'01:00 · день 2',remaining:'15 ч 30 мин',late:false});
  s.time=17;assert.equal(shiftTime(s).remaining,'+1 ч 30 мин');assert.equal(shiftTime(s).now,'02:30 · день 2');
  s.clockFraction=0;assert.equal(advanceShiftClock(s,60000,true),false);assert.equal(s.clockFraction,0);
  assert.equal(advanceShiftClock(s,60000),false);assert.equal(s.clockFraction,.125);
  s.autoPlay=false;assert.equal(advanceShiftClock(s,500),false);assert.equal(s.clockFraction,.125);
});
test('corrupt auto and fractional clock values are rejected while old saves remain valid',()=>{
  const s=createDemoGame();assert.ok(validSave(s));
  s.autoPlay='yes';assert.equal(!!validSave(s),false);s.autoPlay=true;s.clockFraction=2;assert.equal(!!validSave(s),false);
  s.clockFraction=.5;assert.ok(validSave(s));assert.equal(restoreOffice(structuredClone(s)).autoPlay,true);
});
