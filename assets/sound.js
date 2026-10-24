import { VOICE_ASSETS } from './onboarding/voice-manifest.js';

// Original quiet score, synthesized locally in the browser. No music downloads.
const CHORDS = [[48,55,59,62],[45,52,55,59],[41,48,52,57],[43,50,53,57]];
const hz = note => 440 * 2 ** ((note - 69) / 12);
export function createSound() {
  let enabled = true, context, master, music, fx, timer, nextBeat = 0, beat = 0, voice, lastVoice = '';
  let voiceOn = false, unlocked = false;
  try { enabled = localStorage.getItem('before-release-sound-v1') !== 'off'; } catch { /* Session only. */ }
  function note(midi, when, duration, volume, type = 'sine', bus = music) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type; oscillator.frequency.value = hz(midi);
    gain.gain.setValueAtTime(0,when); gain.gain.linearRampToValueAtTime(volume,when+.035);
    gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
    oscillator.connect(gain).connect(bus); oscillator.start(when); oscillator.stop(when+duration+.03);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  function schedule() {
    if (!enabled || !context || document.hidden) return;
    while(nextBeat < context.currentTime+.4) {
      const chord = CHORDS[Math.floor(beat/8)%CHORDS.length];
      if(beat%8===0) chord.forEach((key,i) => note(key,nextBeat+i*.025,7,.15));
      if(beat%2===0) note(chord[(Math.floor(beat/2)+1)%4]+24,nextBeat+.04,1.5,.11,'sine');
      nextBeat += 60/62; beat++;
    }
    timer = setTimeout(schedule,200);
  }
  async function unlock() {
    if (!enabled || document.hidden) return;
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if(!AudioContext) return;
      context = new AudioContext(); master = context.createGain(); music = context.createGain(); fx = context.createGain();
      master.gain.value = .48; music.gain.value = .095; fx.gain.value = .16;
      music.connect(master); fx.connect(master); master.connect(context.destination);
      nextBeat = context.currentTime+.12;
    }
    unlocked = true;
    try { await context.resume(); clearTimeout(timer); nextBeat = Math.max(nextBeat,context.currentTime+.05); schedule(); } catch { /* Text game remains usable if audio is blocked. */ }
  }
  function duck(active) {
    voiceOn = active;
    if(context) music.gain.setTargetAtTime(active?.025:.095,context.currentTime,.18);
    document.dispatchEvent(new CustomEvent('nika-voice-state',{detail:{speaking:active}}));
  }
  function stopVoice() { if(voice){voice.pause();voice.currentTime=0;voice=null;} duck(false); }
  function speak(key, force = false) {
    if(!enabled || !unlocked || document.hidden || (!force && lastVoice === key)) return;
    lastVoice = key; stopVoice();
    if(!VOICE_ASSETS[key]) return;
    const audio = new Audio(new URL(`./onboarding/${VOICE_ASSETS[key]}`,import.meta.url).href);
    voice = audio; audio.volume = .78;
    audio.onplaying = () => { if(voice===audio) duck(true); };
    audio.onended = audio.onerror = () => { if(voice===audio){voice=null;duck(false);} };
    audio.play().catch(() => { if(voice===audio){voice=null;duck(false);} });
  }
  function effect(kind) {
    if(!enabled || !unlocked || !context || document.hidden) return;
    const time = context.currentTime;
    const sequence = {hire:[67,74],plan:[64,69],decision:[62,67],result:[60,64,67,72],page:[76],click:[72]}[kind] || [72];
    sequence.forEach((key,i) => note(key,time+i*.085,kind==='result'?.7:.18,.2,'sine',fx));
  }
  function toggle() {
    enabled = !enabled;
    try { localStorage.setItem('before-release-sound-v1',enabled?'on':'off'); } catch { /* Session only. */ }
    if(enabled){unlock();}else{stopVoice();clearTimeout(timer);context?.suspend();}
  }
  function button(icon) {
    return `<button class="icon-btn sound-toggle" data-action="sound" aria-pressed="${enabled}" aria-label="${enabled?'Выключить':'Включить'} звук" title="${enabled?'Выключить':'Включить'} музыку и голос">${icon('sound',18)}<span aria-hidden="true">${enabled?'ВКЛ':'ВЫКЛ'}</span></button>`;
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopVoice();clearTimeout(timer);context?.suspend();}else if(unlocked&&enabled)unlock();});
  return {unlock,effect,speak,stopVoice,toggle,button,get enabled(){return enabled;},get speaking(){return voiceOn;}};
}
