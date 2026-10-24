# Hosting / lightweight mode QA — 2026-10-24

Integrated with main through UI PR #14 (58dc907). No production changes or purchases.

Heartbeat integration with gameplay PR #16 (32098a0): 45/45 groups pass. The lightweight adapter now completes outbound/returning rest transitions through the normal onRest callback, so a break cannot block time waiting for absent 3D actors. Domain/server infrastructure setup is recorded separately in ignored work/server-setup-receipt.json; no game release has been deployed.

- `npm run check`, `npm test`: 40/40 groups; existing 1269 full engine scenarios pass. `npm run build` and `node scripts/prepare-hosting.js` succeed.
- Gitleaks history and staged scan: no findings. `git diff --check`: pass.
- Stock Caddy 2.11.7: configuration validates. JavaScript MIME verified; GLB explicitly returns model/gltf-binary; gzip sidecars negotiate Content-Encoding/Vary; missing assets and .git paths return 404. The server is local; the future VPS remains untested.
- Stock k6 2.3.0, local HTTP, 30 VUs, 30 seconds, 16 asset URLs per iteration: 7200/7200 checks pass, zero failed requests, p95 15.94 ms, 450 iterations. No browser cache simulated; 2-second pause between batches. These are local service measurements, not a guarantee for remote traffic or DDoS protection.
- Before UI #14, a fresh isolated Chromium demo measured 399483 bytes in lite mode and 1537704 bytes in 3D through local Caddy. After integration, the 3D session measured 1545870 bytes. Counts depend on entry point, selected team, caching and voice; do not call the whole 2.34 MB distribution the first-page download.
- Explicit lite mode: zero Three.js/GLB requests and zero WebGL canvases. First order played through actual buttons/events, including personal-care event; saved release survives reload; mini-game won using keyboard. Repeated on the integrated UI at 390×844 with no uncaught page errors.
- Forced WebGL absence: selected 3D mode falls back to SVG, shows an explanation, and keeps planning/start available. This is capability simulation, not a physical weak GPU test.
- Blocked 3D module request: import failure remains in playable SVG mode without a retry/render loop. Loading 3D gates planning until the runtime is attached; successful loading restores normal arrival gating.
- Desktop 1440×1000: 3D room loads, agents reach desks, whole room remains visible after UI integration. Screenshots inspected. 320×740 and 390×844: no horizontal overflow. The integrated mobile project/studio tabs remain functional.
- Source PNG → WebP: same dimensions; portraits, eyes, hair, clothing and office detail visually inspected. Source files retained; hashes and conversion settings in asset-receipt.json.

## Frontend design review

Purpose: reach gameplay on devices where 3D is unavailable or slow; preserve the current studio design and primary actions.

| Pillar | Assessment |
|---|---|
| Frictionless | Pass: graphics choice before gameplay and beneath office; direct lite URL; no account or download step |
| Quality craft | Pass in inspected Chromium sizes: existing color tokens, 44px graphics targets, visible keyboard focus, active-link semantics and no overflow |
| Trustworthy | Pass: reload/save consequence disclosed; fallback explains failure; no claims about universal device support |

Known limits: no physical Android/iPhone, no measured minimum RAM/GPU, no guaranteed mobile FPS, no remote VPS load test or public HTTPS verification. Lite mode keeps the core game but does not provide 3D walking/camera. Runtime choice reloads the page; normal saves are resumed from the start screen. Server-side cache revalidation is required because asset names are not content hashes.

Local evidence is ignored by Git: outputs/playwright/final-lite-desktop.png, final-lite-320.png, final-lite-win-mobile.png, final-3d-desktop.png; dist/load-test-summary.json and dist/hosting-report.json. Refresh evidence after later gameplay or voice changes before release.
