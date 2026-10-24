import test from 'node:test';
import assert from 'node:assert/strict';
import { createSound } from '../assets/sound.js';
import { CHARACTER_VOICES } from '../assets/character-voice-manifest.js';

async function player(t) {
  // Exercise playback independently of the generated media pack.
  const previousVoices={...CHARACTER_VOICES};
  for(const id of ['mira','nord','pixel','echo','saga','iskra'])for(const kind of ['intro','concern','conflict'])CHARACTER_VOICES[`${id}-${kind}`]=`characters/audio/${id}-${kind}-original.mp3`;
  const keys=['document','window','Audio','localStorage','CustomEvent'];
  const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  class Node { constructor(){this.gain={value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}};}connect(){return this;}start(){}stop(){}disconnect(){} }
  class Context {currentTime=0;destination={};createGain(){return new Node();}createOscillator(){return Object.assign(new Node(),{frequency:{value:0}});}resume(){return Promise.resolve();}suspend(){} }
  const doc=new EventTarget();doc.hidden=false;doc.children=[];doc.body={append:a=>doc.children.push(a)};
  const made=[];
  class Audio {constructor(src){this.src=src;this.dataset={};this.currentTime=0;this.paused=false;made.push(this);}setAttribute(){}play(){return Promise.resolve();}pause(){this.paused=true;}remove(){doc.children=doc.children.filter(a=>a!==this);} }
  Object.assign(globalThis,{document:doc,window:{AudioContext:Context},Audio,localStorage:{getItem:()=>null,setItem(){}},CustomEvent:class extends Event {constructor(type,{detail}){super(type);this.detail=detail;}}});
  const sound=createSound();await sound.unlock();
  t.after(()=>{if(sound.enabled)sound.toggle();for(const key of Object.keys(CHARACTER_VOICES))delete CHARACTER_VOICES[key];Object.assign(CHARACTER_VOICES,previousVoices);for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  return {sound,doc,made};
}

test('a collapsed Nika does not stop a developer, while automatic chatter yields to her',async t=>{
  const {sound,doc,made}=await player(t);
  assert.equal(sound.speakCharacter('mira','intro'),true);assert.equal(doc.children.length,1);
  const developer=made.at(-1);developer.onplaying();assert.equal(sound.speakingCharacter,'mira');
  sound.stopVoice('nika');assert.equal(developer.paused,false);assert.equal(doc.children.length,1);
  sound.speak('story-0',true);assert.equal(developer.paused,true);assert.equal(doc.children.length,1);
  assert.equal(sound.speakCharacter('nord','intro'),false);assert.equal(made.at(-1).dataset.voiceOwner,'nika');
  assert.equal(sound.speakCharacter('nord','intro',true),true);assert.equal(doc.children.length,1);
});

test('a two-person argument plays in order and stops completely when muted',async t=>{
  const {sound,doc,made}=await player(t);
  assert.equal(sound.speakExchange([{id:'mira',kind:'conflict'},{id:'nord',kind:'concern'}],true),true);
  const first=made.at(-1);assert.equal(first.dataset.characterId,'mira');first.onended();
  const second=made.at(-1);assert.notEqual(second,first);assert.equal(second.dataset.characterId,'nord');assert.equal(doc.children.length,1);
  sound.toggle();const count=made.length;second.onended();assert.equal(made.length,count);assert.equal(doc.children.length,0);
  assert.equal(sound.speakCharacter('mira','intro',true),false);
});

test('closing an argument or hiding the tab cancels its queued reply',async t=>{
  const {sound,doc,made}=await player(t);
  const lines=[{id:'pixel',kind:'conflict'},{id:'echo',kind:'concern'}];
  sound.speakExchange(lines,true);const cancelled=made.at(-1);sound.stopVoice();const count=made.length;cancelled.onended();assert.equal(made.length,count);
  sound.speakExchange(lines,true);const hidden=made.at(-1);doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));const total=made.length;hidden.onended();assert.equal(made.length,total);assert.equal(doc.children.length,0);
});

test('a missing audio file advances to the reply without leaving two players or a stale indicator',async t=>{
  const {sound,doc,made}=await player(t);
  sound.speakExchange([{id:'saga',kind:'conflict'},{id:'iskra',kind:'concern'}],true);
  const first=made.at(-1);first.onplaying();first.onerror();assert.equal(made.at(-1).dataset.characterId,'iskra');assert.equal(doc.children.length,1);
  const second=made.at(-1);second.onplaying();second.onended();assert.equal(doc.children.length,0);assert.equal(sound.speaking,false);assert.equal(sound.speakingCharacter,null);
});
