# Local body Paint batch

Only the task's GPU owner runs this after checking queue, manual reservations and
actual VRAM. This calls the already installed local API because the active Comfy
MCP does not expose its Paint stage. It does not create a server or install nodes.

Use a JSON list, with paths relative to the manifest file (absolute paths also
work). All inputs must exist before starting:

```json
[
  {"id":"mira","mesh":"mira/body-clean.glb","reference":"references/mira-front.png","output":"mira/body-painted.glb"},
  {"id":"pixel","mesh":"pixel/body-clean.glb","reference":"references/pixel-front.png","output":"pixel/body-painted.glb"}
]
```

First inspect without importing Torch or running a GPU task:

```powershell
& 'E:/AI/ComfyUI-Hunyuan21/.venv/Scripts/python.exe' art/characters/body-v5/paint_batch.py art/characters/body-v5/paint-manifest.json --comfy-root 'E:/AI/ComfyUI-Hunyuan21' --paint-root 'E:/AI/ComfyUI-Hunyuan21/custom_nodes/ComfyUI-Hunyuan3d-2-1/hy3dpaint' --hf-cache 'E:/AI/Hunyuan3D-2.1/hf-cache/hub' --check
```

Remove `--check` for the single sequential execution. The first item loads the
diffusion checkpoint; following items reuse it with fresh native renderer and
ViewProcessor objects. This is deliberate: the installed `load_mesh/set_mesh`
replace geometry, UVs and UV caches, but do not clear old albedo/MR/normal maps.
No renderer state carries between characters.

Per-job `unwrap: false` accepts a prepared UV0 mesh and bypasses xatlas. The
runner loads that GLB without mesh processing, verifies finite UV coordinates
in [0,1], and saves the exact renderer UV arrays before baking. Legacy jobs
without the field retain their original settings and completion matching.
Optional `view_resolution` is512 or768; optional `steps` is1–100. These values
configure the actual native pipeline and are included in each job receipt.
Texture atlas resolution stays2048, guidance3 and all VRAM gates stay unchanged.

`prepare_native_uv.py` runs only in a factory background Blender process, on CPU.
Use `--python-exit-code 1`, since Blender otherwise exits0 on Python errors.
It writes new outputs only and checks UV coverage/overlap, source hashes, and
triangle positions before/after GLB roundtrip. A rejected UV candidate must not
be used for painting. Smart projection can fragment noisy generated topology;
`--method silhouette` instead defines front/back seams and invokes native
ANGLE_BASED unwrap. Every successful candidate still needs visual review.

Earlier UV experiment (2026-10-25, unsmoothed source): no candidate was accepted.
Original Mira xatlas measured49.23% coverage and0.0172% pixel overlap at1024;
its11,091 islands do not by themselves establish the cause of speckles. Native
SmartProject candidates failed coverage/overlap QC; silhouette unwrap warned
that4 of18 islands could not be solved. Root's constant-material comparison
points at geometry/normals, so UV tuning is deferred until geometry smoothing
is visually verified. Preserve the original successful Mira bake and saved
views. Reprepare/revalidate UV against the final smoothed source hash, then
compare a bake-only recovery using saved views before starting new diffusion.
Local diagnostic history: `work/body-v5-native-uv-diagnostics.receipt.json`.

Current Mira surface pilot: `prepare_surface.py` creates immutable
`body-surface.glb` from `body-clean.glb` using weld1e-6, recalc normals,
native Smooth.45×5, then recalc normals. No remesh or triangle reduction.
New source receipts contain topology, adjacent-face normal statistics,
displacements, bounds, and source/output hashes. UV is generated afterward.
Mira SmartProject66/FRACTION.001 now passes the root's pilot thresholds:
28.36% coverage,0.1197% overlap, zero degenerate UV triangles. Its119,999
triangle positions survive UV/GLB roundtrip unchanged to six decimal places.
`work/body-v5-paint-uv-pilot.json` selects768px views,30steps,2K atlas,
and`unwrap:false`, with new `body-painted-uv.glb` output. CPU `--check` passes.
Only the GPU owner may run it after resource checks and visual acceptance.
When rigging this painted source, disable additional surface smoothing:
the native.45×5 cleanup is already applied before UV and Paint.

The native UV exporter must attach a plain PBR material to the primitive:
installed Trimesh ignores `TEXCOORD_0` on materialless primitives. No placeholder
image is needed. Check the final file using the installed Paint-environment
Trimesh with `force='mesh', process=False`; a Blender roundtrip alone is not
sufficient. `prepare_native_batch.py` performs this CPU check and writes a
separate `body-uv.trimesh.receipt.json`.

Six-body preparation outcome: Pixel/Nord/Echo/Saga are technical candidates;
Nika and Iskra failed the overlap threshold (2.9917% and2.0458%, respectively,
with zero degenerate triangles and adequate coverage). Do not paint rejected
UVs or silently relax their threshold. No six-body Paint manifest was emitted.
Pixel alone contained a visually confirmed8vertex/12triangle rectangular slab.
Its exact source coordinates/indices/area/hash were matched and removed before
bounds measurement and smoothing. All original clean/raw sources remain intact;
other characters had no such backdrop component and were not pruned. Component
proof: `work/body-v5-clean-components.receipt.json`; current candidate hashes
and QC: `work/body-v5-native-preparation-status-v2.receipt.json`.

Controlled Nika/Iskra follow-up: root explicitly authorized one retry per ID
from the existing smoothed surface, with SmartProject45/FRACTION.0005 and new
`body-uv-b45.glb` outputs. Root allowed coverage>=20% (about839k texels at2K,
adequate for768px views), while preserving overlap<1% and zero degenerates.
Both retries pass: Nika28.6350% coverage/0.08926% overlap; Iskra26.8383%/0.07817%.
No second smoothing occurred, and original rejection records remain intact.
Both also pass the actual installed Trimesh UV check. Two remaining Paint jobs
are prepared in `work/body-v5-paint-quality-two.json`; `--check` is CPU-only.
Only root schedules them, after its active four-character GPU batch and checks.
Summary: `work/body-v5-uv-b45-two.receipt.json`. Exact pre-validation UV arrays
were retained in diagnostic NPZ files; no regional exception was needed.

Shared-model VAE reuse fix: the installed native pipeline offloads its modules
at the end of each call, then selects reference tensor device from `vae.device`
before the next encode hook. On the second body that caused CPU inputs/CUDA
weights. The runner now moves only its owned shared VAE to the native pipeline
execution device with `vae.to(...)` before the repeated call. It preserves the
module and offload-hook identity; no installed code is patched and no global
or foreign model is unloaded. Quality settings and VRAM gates stay unchanged.
Receipts record before/after VAE devices, execution device, hook type and
post-generation offload state. CPU ordering regression passes; actual native
GPU reuse must be proved by root's Nord/Echo two-item run.

The failed Nord reference-encode attempt had no saved diffusion views. Its
original receipt/lock and the failed batch history are preserved. Pixel's
completed quality GLB remains unchanged and matches its receipt hash. Recovery
manifest: `work/body-v5-paint-quality-reuse-proof.json`, Nord writes the distinct
`body-painted-quality-b.glb`, then Echo writes its previously unstarted output.
Preparation/evidence: `work/body-v5-paint-vae-reuse-recovery.receipt.json`.

For shareable versioned prompt/receipt records, explicitly list stable inputs:

```powershell
python art/characters/body-v5/export_receipt_summary.py art/characters/body-v5/references/prompts.json art/characters/body-v5/mira/body-painted.receipt.json --project-root . --version references-v1-paint-pilot-v1 --output work/body-v5-prompts-public-summary-v1.json
```

The CPU-only summary exporter refuses overwrites, retains original JSON files
unchanged, records their SHA256, strips owner/token fields recursively, makes
project paths relative, and omits external absolute local paths. Prompts remain
verbatim unless they contain an absolute local path, in which case the entire
field is explicitly redacted with a source-text hash.

The initial free-VRAM gate is18GiB. PyTorch is capped at14GiB. Subsequent gates
account for its already reserved allocation, retain2GiB native headroom and a
separate2GiB reserve. Insufficient memory aborts; foreign work is never unloaded.

Each output has a stage receipt and an exclusive owner lock. Six albedo/MR view
pairs and the exact unwrapped mesh arrays are saved before baking. Export runs
in a unique ASCII staging directory, recorded before export. That directory is
preserved. The installed converter embeds PNGs as base64 data URIs; these are
valid self-contained images. The runner losslessly packs them into BIN
bufferViews before publishing its output. Original geometry bytes, UV accessors
and PNG payloads are unchanged. External image paths/URLs are rejected.
If export raises after writing a valid complete embedded-image GLB, the runner
recovers that same file and records the exception without generating again.
Success archives its owner lock; failure preserves locks and receipts.

Verified completed jobs are skipped only when settings, source hashes and final
GLB hash all match. Any failed/unknown receipt, orphan output/views, active lock
or changed source aborts the batch before GPU imports. Never delete these to
silently retry. Inspect and reconcile with the parent execution owner first.

`renderer-uv-mesh.npz` stores original-coordinate `vertices`, `faces`, `uv`,
`uv_faces` from the installed renderer after its unwrap. This preserves a
possible bake-only recovery source. This runner intentionally does not expose an
automatic resume option: no new diffusion is needed to repair a completed bake.

Mira pilot recovery: the first validator mistakenly rejected the installed
converter's valid embedded data URIs. Diffusion, all6view pairs and the full bake
had succeeded. `body-painted.failed-export.receipt.json` preserves that original
failure. `body-painted.recovery.receipt.json` records CPU-only lossless container
repair, exact PNG checks and unchanged geometry/UV data. No diffusion or bake was
repeated. The current completion receipt links both records.
