import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeEvent } from '../assets/employee-event.js';
import { createDemoGame } from '../demo.js';
import { renderOffice } from '../office.js';
import { scheduleIncident } from '../assets/studio-life.js';
import { resolveEvent, validSave } from '../engine.js';
import { ensureEventClock, advanceEventClock } from '../assets/event-clock.js';

test('a persisted incident signals exactly its owner, including after reload; resolution clears it',()=>{
  for(const type of ['noise','computer','idea']){
    const s=createDemoGame();s.stage='event';s.currentEvent='life';s.life.incident={type,id:s.team[1]};
    const event=employeeEvent(s),before=JSON.stringify(s);
    assert.equal(event.id,s.team[1]);assert.equal(event.type,type);assert.equal(JSON.stringify(s),before);
    const copy=JSON.parse(before);assert.deepEqual(employeeEvent(copy),event);assert.ok(validSave(copy));
    const html=renderOffice(copy,null);assert.equal((html.match(/data-event-actor=/g)||[]).length,1);
    assert.ok(html.includes(`data-event-actor="${event.id}"`));assert.ok(html.includes('Открыть событие'));
    assert.equal(resolveEvent(copy,'life-wait'),null);assert.equal(employeeEvent(copy),null);
  }
});
test('product decisions and invalid incident owners never produce a character alert',()=>{
  const s=createDemoGame();s.stage='event';s.currentEvent='scope';assert.equal(employeeEvent(s),null);
  s.currentEvent='life';s.life.incident={type:'noise',id:'missing'};assert.equal(employeeEvent(s),null);
  s.life.incident={type:'missing',id:s.team[0]};assert.equal(employeeEvent(s),null);
});
test('waiting to inspect an incident preserves auto and its full decision budget',()=>{
  const s=createDemoGame();s.stage='work';s.time=5;s.life.seed=0;s.autoPlay=true;s.difficulty='normal';
  assert.equal(scheduleIncident(s),true);assert.ok(employeeEvent(s));ensureEventClock(s);
  for(let i=0;i<100;i++)advanceEventClock(s,500,true);
  assert.equal(s.eventClock.remaining,45000);assert.equal(s.autoPlay,true);
  advanceEventClock(s,500,false);assert.equal(s.eventClock.remaining,44500);
  assert.equal(resolveEvent(s,'life-wait'),null);assert.equal(s.autoPlay,true);
});
