# Original character voices — ready

Execution owner: story/onboarding chat, branch `codex/character-voices`.
Integrated with main through f4a9e79: portrait-based 3D models, mobile navigation, title-screen clarity and studio growth are preserved.

## Delivered pack

- Seven private original ElevenLabs Voice Design identities, created from descriptions without a person or reference audio. Prompts and IDs: `content/voice-designs.json`.
- 53 local MP3 clips: 17 Nika story/tutorial lines and six lines per developer (introduction, work, support, concern, release, conflict). Total 3.71 MiB, 331.5 seconds. Runtime makes no voice API requests.
- Every take uses stable `eleven_v4`. The browser's paired experimental alternatives are excluded; previous browser takes remain in ignored `output/cast-audio/raw/`.
- Captions, voice IDs, durations, source/output hashes and model verification: `content/character-voice-receipt.json`. `tests/voice-pack.test.js` checks all 53 bytes/hashes and compares every caption with the current game.
- Processing: stock FFmpeg, high-pass 60 Hz, −18 LUFS / −2.5 dBTP, mono 44.1 kHz MP3. No strong denoising, low-pass, pitch change or added room effect. Superseded Alina audio is archived locally under ignored `output/legacy-nika-alina/`; its historical receipt is in `content/archive/`.
- The user approved a temporary API key for one hour, capped at 6000 existing credits, with only TTS, Voices Read and History Read. It was disabled after recording and the local key file was removed. No credentials are in Git or the game.

## Game behavior

One speech channel handles Nika and the cast. Music ducks during speech. Two-person exchanges run in order and cancel on mute, hidden tab or closing the discussion. A collapsed Nika cannot cancel a developer's speech. Desktop speech bubbles and mobile character cards include replay controls. The fullscreen office also offers «Поговорить» in a selected developer’s actions; its reply and voice follow the current game state.

A dispute requires stress ≥75 or morale ≤25 and two present colleagues. It can occur once per project. Mediation spends one hour and helps both people; ignoring it affects both without spending an hour. Technical decisions and the ordinary studio incident remain intact. Existing saves are supported.

## Validation

- Syntax checks and 103 tests pass after integrating the newer models and mobile interface.
- Real browser: all seven local voices decode and play; the two-speaker log is `mira-conflict`, then `nord-concern`; mute cancels the queued reply. In the actual game, a distress-triggered discussion plays Mira, displays both captions and stops speech when resolved.
- Mobile 390×844: Echo's card plays the matching work line, replay is available, closing the card removes the audio. Desktop/mobile screenshots are in ignored `output/voices-*.png`. Browser console has no game errors.
- Temporary QA fixtures use only the separate demo save; the prior demo state is restored after the check.

## Reproduction

`python scripts/record-character-voices.py` prints a no-network plan. Its optional `--execute --cli <official-native-elevenlabs-executable>` verifies the saved voices, recovers uncertain requests from history and records only missing lines; automatic retries are disabled. It requires a separately authorized CLI login or local key. The completed pack needs neither.

`python scripts/process-character-voices.py --finalize` validates preserved raw takes and publishes manifests only when all expected clips are ready and model-verified. Do not regenerate existing requests or substitute experimental takes. Raw takes and detailed job receipts remain in ignored `output/`.
