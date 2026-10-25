import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { sceneAction } from '../assets/play-shell.js';
import { bubblePlacement, normalizeBubble, readBubblePosition } from '../assets/onboarding/bubble-position.js';

test('the scene action respects seating, assignments and rest travel without changing the game',()=>{
  const s=createDemoGame(),before=JSON.stringify(s);
  assert.equal(sceneAction(s).action,'plan');assert.equal(sceneAction(s,true).disabled,true);
  assert.equal(JSON.stringify(s),before);
  s.seats[0]=null;assert.equal(sceneAction(s).action,'studio-project');s.seats[0]='mira';
  s.stage='plan';assert.equal(sceneAction(s).action,'work');delete s.assignments.code;assert.equal(sceneAction(s).action,'studio-project');
  s.stage='work';assert.equal(sceneAction(s).action,'tick');s.life.members.mira.restTrip={phase:'outbound'};assert.equal(sceneAction(s).disabled,false);
  s.stage='event';assert.equal(sceneAction(s).action,'event-open');s.stage='result';assert.equal(sceneAction(s).action,'play-mini');
});
test('damaged or obsolete bubble positions recover to a visible position',()=>{
  for(const raw of [null,'{','null','{"x":"1","y":0}',{x:Infinity,y:0}])assert.deepEqual(readBubblePosition(raw),{x:1,y:1});
  assert.deepEqual(readBubblePosition('{"x":-10,"y":20}'),{x:0,y:1});
});
test('bubble positions stay in the usable viewport after resizing and avoid management panels',()=>{
  for(const [width,height] of [[320,667],[390,844],[768,1024],[1440,900]]){
    const bounds={width,height,top:124,bottom:height-148,sizeX:72,sizeY:76};
    const panel={left:width>900?width-460:8,right:width-8,top:width>900?84:224,bottom:height-148};
    const point=bubblePlacement({x:1,y:1},bounds,[panel]);
    assert.ok(point.x>=12&&point.x+72<=width-12);assert.ok(point.y>=124&&point.y+76<=height-160);
    assert.ok(point.x+72<=panel.left||point.x>=panel.right||point.y+76<=panel.top||point.y>=panel.bottom);
  }
});
test('normalized bubble coordinates survive viewport changes and repeated saves',()=>{
  const bounds={width:1440,height:900,top:84,bottom:750};
  const point=bubblePlacement({x:0,y:.4},bounds),saved=normalizeBubble(point,bounds);
  const restored=bubblePlacement(readBubblePosition(JSON.stringify(saved)),bounds);
  assert.ok(Math.abs(point.x-restored.x)<.01&&Math.abs(point.y-restored.y)<.01);
  const phone=bubblePlacement(saved,{width:320,height:667,top:124,bottom:519});
  assert.ok(phone.x>=12&&phone.x+72<=308&&phone.y+76<=507);
});
test('bubble docking respects the safe left and right edges of a landscape phone',()=>{
  const bounds={width:844,height:390,top:72,bottom:302,left:59,right:785};
  for(const x of [0,.5,1]){const p=bubblePlacement({x,y:.5},bounds);assert.ok(p.x>=59&&p.x+72<=785);const saved=normalizeBubble(p,bounds);assert.ok(saved.x>=0&&saved.x<=1);}
});
