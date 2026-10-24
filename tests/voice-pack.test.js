import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGame, hire, beginPlan, recommend, beginWork } from '../engine.js';
import { createDemoGame } from '../demo.js';
import { AGENTS } from '../data.js';
import { characterLine } from '../assets/character-dialogue.js';
import { VOICE_ASSETS } from '../assets/onboarding/voice-manifest.js';
import { CHARACTER_VOICES } from '../assets/character-voice-manifest.js';
import { STORY, guideFor } from '../assets/onboarding/onboarding-model.js';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path,root),'utf8'));

test('the shipped cast contains every line, seven original voices and the validated audio bytes',async()=>{
  const receipt=await json('content/character-voice-receipt.json');
  const designs=(await json('content/voice-designs.json')).voices;
  assert.equal(new Set(Object.values(designs).map(v=>v.voiceId)).size,7);
  assert.equal(Object.keys(VOICE_ASSETS).length,17);
  assert.equal(Object.keys(CHARACTER_VOICES).length,36);
  assert.equal(receipt.lines.length,53);
  assert.equal(new Set(receipt.lines.map(l=>l.key)).size,53);
  for(const line of receipt.lines){
    assert.equal(line.model,'eleven_v4');assert.equal(line.modelVerified,true);
    assert.equal(line.voiceId,designs[line.id].voiceId);
    const mapped=line.id==='nika'?`assets/onboarding/${VOICE_ASSETS[line.key]}`:`assets/${CHARACTER_VOICES[line.key]}`;
    assert.equal(mapped,line.path);
    const bytes=await readFile(new URL(mapped,root));
    assert.equal(bytes.length,line.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),line.sha256);
    assert.ok(line.durationSeconds>.5 && line.durationSeconds<90);
  }
  for(const agent of AGENTS)for(const kind of ['intro','work','support','concern','release','conflict']){
    const line=receipt.lines.find(l=>l.key===`${agent.id}-${kind}`);
    assert.equal(line.text,characterLine(agent.id,kind));
  }
});

test('every Nika recording still matches the current story and state-driven tutorial',async()=>{
  const expected=new Map(STORY.map((page,i)=>[`story-${i}`,`${page.text} ${page.note}`]));
  const capture=(game,moving=false)=>{const step=guideFor(game,moving);expected.set(step.voice||`guide-${step.id}`,step.text);};
  const hireGame=createGame('calm');capture(hireGame);
  ['mira','iskra','echo'].forEach(id=>hire(hireGame,id));capture(hireGame);
  const game=createDemoGame();capture(game,true);capture(game);
  beginPlan(game);game.assignments.release=null;capture(game);recommend(game);capture(game);
  beginWork(game);capture(game);game.time=2;capture(game);
  game.life.members.mira.energy=20;capture(game);
  game.life.members.mira.restTrip={phase:'outbound'};capture(game);
  game.life.members.mira.restTrip.phase='resting';capture(game);
  game.stage='event';game.currentEvent='scope';capture(game);game.currentEvent='life';capture(game);
  game.stage='result';capture(game);
  assert.equal(expected.size,17);
  const lines=(await json('content/character-voice-receipt.json')).lines.filter(l=>l.id==='nika');
  for(const line of lines)assert.equal(line.text,expected.get(line.key),line.key);
});
