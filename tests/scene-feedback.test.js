import { coffeeArrival } from '../assets/coffee-trip.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { resolveEvent } from '../engine.js';
import { careFor } from '../assets/studio-life.js';
import { captureMembers, memberChanges, placeFeedback } from '../assets/scene-feedback.js';

test('scene consequences report actual clamped changes, not promised bonuses',()=>{
  const s=createDemoGame(),id=s.team[0];s.life.members[id].morale=99;
  s.stage='event';s.currentEvent='life';s.life.incident={type:'idea',id};
  const before=captureMembers(s);assert.equal(resolveEvent(s,'life-care'),null);
  const feedback=memberChanges(s,before).find(item=>item.id===id);
  assert.equal(feedback.changes.find(c=>c.key==='morale').delta,1);
  assert.equal(feedback.changes.find(c=>c.key==='energy').delta,0);
});
test('both conflict participants receive feedback and unrelated employees do not',()=>{
  const s=createDemoGame();s.stage='event';s.currentEvent='life';
  s.life.incident={type:'tension',id:s.team[0],otherId:s.team[1]};
  const before=captureMembers(s);assert.equal(resolveEvent(s,'life-wait'),null);
  assert.deepEqual(memberChanges(s,before).map(item=>item.id),s.team.slice(0,2));
  assert.deepEqual(memberChanges(s,captureMembers(s)),[]);
});
test('energy popup uses the delivered coffee amount when the employee is near full energy',()=>{
  const s=createDemoGame(),id=s.team[0];s.stage='work';s.life.upgrades=['coffee'];s.life.members[id].energy=96;
  const before=captureMembers(s);assert.equal(careFor(s,id,'coffee'),null);coffeeArrival(s,id,'station');coffeeArrival(s,id,'drank');
  assert.equal(memberChanges(s,before).find(x=>x.id===id).changes.find(c=>c.key==='energy').delta,4);
});

test('five simultaneous reactions stay readable inside a narrow office',()=>{
  const items=Array.from({length:5},()=>({x:180,y:350,width:164,height:86}));
  const boxes=placeFeedback(items,364,600);
  for(const [i,b] of boxes.entries()){
    assert.ok(b.x>=8&&b.x+b.width<=356&&b.y>=54&&b.y+b.height<=535);
    for(const p of boxes.slice(0,i))assert.ok(b.x+b.width<=p.x||p.x+p.width<=b.x||b.y+b.height<=p.y||p.y+p.height<=b.y);
  }
});
test('a participant at the limit still receives an honest unchanged-state reaction',()=>{
  const s=createDemoGame(),id=s.team[0];s.life.members[id].morale=100;
  const before=captureMembers(s);
  const items=memberChanges(s,before,[id]);assert.equal(items.length,1);assert.ok(items[0].changes.every(c=>c.delta===0));
});
