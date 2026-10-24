import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureEventClock,advanceEventClock,validEventClock} from '../assets/event-clock.js';
const incident=difficulty=>({stage:'event',currentEvent:'life',difficulty,life:{seed:5,completed:0,incident:{type:'noise',id:'mira'}}});
test('only urgent incidents on normal and hard have a timer; easy and product choices are untimed',()=>{
  assert.equal(ensureEventClock(incident('normal')).remaining,45000);assert.equal(ensureEventClock(incident('hard')).remaining,30000);
  assert.equal(ensureEventClock(incident('calm')),null);
  const g=incident('normal');g.currentEvent='scope';assert.equal(ensureEventClock(g),null);g.currentEvent='life';g.life.incident.type='idea';assert.equal(ensureEventClock(g),null);
});
test('remaining time survives reload, pause, hidden tabs and disabled timers without catch-up',()=>{
  const g=incident('normal');advanceEventClock(g,300);const restored=JSON.parse(JSON.stringify(g));
  assert.equal(ensureEventClock(restored).remaining,44700);advanceEventClock(restored,300,true);assert.equal(restored.eventClock.remaining,44700);
  restored.eventClock.paused=true;advanceEventClock(restored,300);assert.equal(restored.eventClock.remaining,44700);
  restored.eventClock.paused=false;advanceEventClock(restored,100000);assert.equal(restored.eventClock.remaining,44200);
  restored.timedEvents=false;assert.equal(advanceEventClock(restored,500),false);assert.equal(restored.eventClock.remaining,44200);
});
test('expiry is reported exactly at zero and saved timer data is validated',()=>{
  const g=incident('hard');ensureEventClock(g).remaining=100;assert.equal(advanceEventClock(g,99),false);assert.equal(advanceEventClock(g,1),true);
  assert.equal(g.eventClock.remaining,0);assert.ok(validEventClock(g));g.eventClock.remaining=-1;assert.equal(validEventClock(g),false);
});
