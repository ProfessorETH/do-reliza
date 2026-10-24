# Coffee station trips — 2026-10-25

- Requesting a drink creates a persisted queued/outbound/drinking/returning trip. The station serves one colleague at a time in request order; queued colleagues wait at their computers. A new break cannot overlap the same employee's coffee trip.
- The employee uses the existing chair transitions and collision-aware navigation to reach the station, takes the visible cup, raises/tilts it to drink, puts it back and returns to the assigned computer. Station and hand cup visibility agree. Startup handles the room/model not being loaded yet.
- Energy +15 and morale +5 are applied only after the 3.6-second drinking animation completes, with normal stat caps. Arrival callbacks are phase-checked and idempotent. Auto remains enabled; game hours pause while the coffee trip is active and resume after return.
- Save validation accepts legacy consumed drinks and checks new trip membership, station ownership, slot, phase, queue exclusivity and whether the benefit has already been consumed. Reload during drinking resumes without an early or duplicate benefit. New orders reset the per-shift drink and trip.
- Lightweight/failed 3D mode advances the same transaction through a timed fallback. Inspection walks yield to real coffee trips.

Validation: npm run check; 142 tests passed; production build; four hosting tests; prepare-hosting. Tests cover no early reward, once-only reward across restored phases, FIFO queue, invalid saves, all five desk routes, timed fallback and the complete animated cup/return cycle.

Real browser: desktop 3D energy stayed 30 during travel/drinking and became 45 afterward; employee returned and auto remained enabled. Mobile 390px reload during drinking also yielded 30 → 45, then remained 45 after another reload, with no page errors or horizontal overflow. Screenshots in ignored outputs/coffee-drink-*.png.

Integrated repository collaboration updates from main. Local server 5192 serves dist/demo-v05. No public deployment.
