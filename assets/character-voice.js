import { CHARACTER_VOICES, CHARACTER_VOICE_TEXT } from './character-voice-manifest.js';
import { characterLine } from './character-dialogue.js';

// A changed caption must never replay a take from an earlier script.
export function characterVoicePath(id, kind) {
  const key=`${id}-${kind}`;
  return CHARACTER_VOICE_TEXT[key] === characterLine(id,kind) ? CHARACTER_VOICES[key] : undefined;
}
