import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { beginPlan,recommend,beginWork,validSave,nextProject } from '../engine.js';
import { selectOfficeConversation } from '../assets/office-chatter.js';
import { reserveOfficeConversation,rememberOfficeLine } from '../assets/office-chatter-state.js';
import { createOfficeConversations } from '../assets/office-conversations.js';
import { speechPlacement } from '../assets/office-speech.js';

function ready(){const s=createDemoGame();beginPlan(s);recommend(s);beginWork(s);return s;}
function heard(s,c,at){reserveOfficeConversation(s,c,at);c.lines.forEach(line=>rememberOfficeLine(s,line));}

test('office topics follow actual deadline, fatigue and a difficult assignment',()=>{
  const s=ready();assert.equal(selectOfficeConversation(s,1000).topic,'progress');
  s.time=2;s.assignments.brief='iskra';assert.equal(selectOfficeConversation(s,1000).topic,'stuck');
  s.life.members.iskra.energy=30;assert.equal(selectOfficeConversation(s,1000).topic,'tired');
  s.deadline=4;assert.equal(selectOfficeConversation(s,1000).topic,'deadline');
  s.stage='event';assert.equal(selectOfficeConversation(s,1000),null);
});
test('only hired colleagues at work participate; absent and coffee trips are excluded',()=>{
  const s=ready();s.life.members.mira.restTrip={phase:'resting'};s.life.members.iskra.coffeeTrip={phase:'outbound'};
  assert.equal(selectOfficeConversation(s,1000),null);
  delete s.life.members.iskra.coffeeTrip;
  const c=selectOfficeConversation(s,1000);assert.deepEqual(new Set(c.lines.map(l=>l.id)),new Set(['echo','iskra']));
  assert.equal(c.lines[0].listenerId,c.lines[1].id);
});
test('cooldowns, recent clips and the limit per hour survive a reload',()=>{
  let s=ready();const first=selectOfficeConversation(s,1000);heard(s,first,1000);
  assert.equal(selectOfficeConversation(s,2000),null);assert.equal(validSave(s),true);
  s=JSON.parse(JSON.stringify(s));s.progress.brief=100;s.time=3;
  const next=selectOfficeConversation(s,48000);assert.ok(next);
  assert.ok(next.lines.every(l=>!first.lines.some(old=>old.id===l.id&&old.kind===l.kind)));
  heard(s,next,48000);const third=selectOfficeConversation(s,95000);assert.ok(third);heard(s,third,95000);
  assert.equal(selectOfficeConversation(s,150000),null);
  s.time++;assert.ok(selectOfficeConversation(s,150000));
});
test('old saves work, corrupt chatter is rejected and a new order retains phrase history',()=>{
  const s=ready();assert.equal(validSave(s),true);heard(s,selectOfficeConversation(s,1000),1000);
  for(const corrupt of [m=>m.recent.push('foreign-voice'),m=>m.count=10,m=>m.nextAt=NaN,m=>m.lastTopic='buy']){const bad=structuredClone(s);corrupt(bad.officeChatter);assert.equal(validSave(bad),false);}
  const recent=[...s.officeChatter.recent];s.stage='result';s.life.settled=true;s.life.cash=50000;
  assert.equal(nextProject(s,'festival'),null);assert.deepEqual(s.officeChatter.recent,recent);assert.equal(s.officeChatter.count,0);assert.equal(validSave(s),true);
});

function controller(enabled=true){
  const s=ready();let time=0,blocked=false,options=null,lines=null,drawn=null,saves=0;
  const sound={enabled,busy:false,characterSpeech:null,hasCharacterVoice:()=>true,
    speakExchange(value,_force,opts){lines=value;options=opts;this.busy=true;return true;},
    stopAmbient(){if(this.busy&&options){this.busy=false;const done=options.onDone;options=null;done('cancelled');}}};
  const chat=createOfficeConversations({sound,getGame:()=>s,isBlocked:()=>blocked,persist:()=>saves++,draw:value=>drawn=value,now:()=>time});
  chat.tick();return {s,sound,chat,setTime:v=>time=v,block:()=>blocked=true,get options(){return options;},get lines(){return lines;},get drawn(){return drawn;},get saves(){return saves;}};
}
test('ambient speech waits for priority audio and starts captions only with actual playback',()=>{
  const c=controller();c.sound.busy=true;c.setTime(15000);c.chat.tick();assert.equal(c.chat.active,false);assert.equal(c.s.officeChatter,undefined);
  c.sound.busy=false;c.setTime(20000);c.chat.tick();assert.equal(c.chat.active,true);assert.equal(c.s.officeChatter,undefined);
  c.options.onStart(c.lines[0]);assert.equal(c.s.officeChatter.recent.length,1);
  c.options.onStart(c.lines[0]);assert.equal(c.s.log.filter(l=>l.startsWith('В офисе')).length,1);
  const old=c.options;c.block();c.chat.tick();assert.equal(c.chat.active,false);assert.equal(c.sound.busy,false);
  old.onStart(c.lines[1]);assert.equal(c.s.officeChatter.recent.length,1);
});
test('muted conversations remain readable, alternate speakers and never change project progress',()=>{
  const c=controller(false),progress=structuredClone(c.s.progress),members=structuredClone(c.s.life.members);
  c.setTime(15000);c.chat.tick();const first=c.drawn;assert.ok(first?.text);assert.equal(first.audible,false);
  c.setTime(25000);c.chat.tick();assert.notEqual(c.drawn.id,first.id);assert.equal(c.drawn.listenerId,first.id);
  c.setTime(35000);c.chat.tick();assert.equal(c.chat.active,false);assert.equal(c.drawn,null);
  assert.deepEqual(c.s.progress,progress);assert.deepEqual(c.s.life.members,members);assert.equal(c.s.officeChatter.recent.length,2);
});
test('skipping and disabling chatter stop the exchange and prevent a delayed reply',()=>{
  const c=controller(false);c.setTime(15000);c.chat.tick();c.chat.skip();assert.equal(c.drawn,null);c.setTime(25000);c.chat.tick();assert.equal(c.drawn,null);
  c.chat.toggle();c.setTime(90000);c.chat.tick();assert.equal(c.chat.active,false);
});
test('speech bubbles keep their pointer and readable box inside mobile and desktop rooms',()=>{
  for(const roomWidth of [390,1440])for(const x of [-400,20,roomWidth/2,roomWidth+500]){
    const p=speechPlacement({x,y:100,width:265,height:160,roomWidth,roomHeight:600});
    assert.ok(p.left>=8&&p.left+265<=roomWidth-8);assert.ok(p.top>=12);assert.ok(p.anchorX>=12&&p.anchorX<=253);
    assert.equal(p.offscreen,x<0||x>roomWidth);
  }
});
