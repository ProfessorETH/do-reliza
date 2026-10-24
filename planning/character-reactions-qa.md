# Character reactions and purchase inspections — 2026-10-25

- Employees use short joy, sadness and relief gestures after decisions, selected from actual mood/stress/energy deltas. Scope decisions also trigger a response from the briefing colleague. Gestures ease in, hold and settle over three seconds; feet/pelvis stay anchored and typing yields to the gesture. Reduced motion removes oscillation and softens amplitude.
- Purchases schedule up to two nearby available colleagues to inspect the addition, staggered by 0.9 seconds. They use existing chair transitions and collision-aware paths, turn toward the object, look/gesture, then return to the current assigned seat. Slots are separated by >0.8m and avoid furniture and chairs.
- Visits remain visual: they do not change tasks, seats, stats or saved game data. Starting work, changing seats or scheduling a break cancels the inspection in favor of the real destination. Cosmetic trips do not block the next project action. Purchase inspections can queue briefly while other colleagues finish their trip.
- Integrated origin/main including the scene-first interface from PR #40; combined both syntax-check lists.

Validation: syntax checks; 127 tests; production build; 4 hosting tests; hosting compression. Tests exercise the complete chair → walk → inspect → walk → chair cycle with unchanged game state, navigation for all six upgrade targets, interruption by work/break and reaction settling.

Browser: desktop joy/sadness/relief scenarios with no page errors; lounge purchase observed pending/outbound/looking/returning and complete return; 390px reduced-motion computer inspection returns successfully with no horizontal overflow. Rechecked a negative event on the integrated mobile interface. Screenshots are local ignored outputs/reaction-*.png. Local server 5192 serves dist/demo-v05; no public deployment.
