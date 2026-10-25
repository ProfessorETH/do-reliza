# Mira hands and crew-neck review helpers

These helpers operate on the preserved pre-polish Mira GLB SHA256
`849a50fb5168020d45247fa0092041d440c991c99eca60acf4fdd72d45789dd6`.
They never write `assets/models/mira.glb`, access the live Blender scene, or run
GPU generation. Root owns integration, head changes and office verification.

Use the installed Hunyuan Python environment (NumPy, SciPy and Pillow) for the
Python preparation commands. Use Blender 5.2 factory-background CPU for the
native BMesh step. The triangulator imports the game's existing Three.js;
there is no new package or server.

1. Recover the exact baseline with `recoverMiraPolishBase()` from
   `scripts/polish-mira.js` into a task output such as `work/mira-polish/before.glb`.
2. `prepare_hands.py --source BASE --output-dir HANDS` writes sparse
   `hands-patch.json` and the first local hand albedo. It preserves vertex order,
   topology, UV and skin weights. UV seam copies share positional deformation.
3. `prepare_bodytop_native_input.py --source BASE --output-dir STAGE` writes the
   immutable body arrays and proves the two floating shells (116+9 triangles).
4. Run Blender with `--background --factory-startup --threads 4
   --python-exit-code 1 --python retopo_bodytop_native.py --
   STAGE/bodytop-native-input.npz STAGE`. This clips at game Y=1.345, appending
   interpolated cut vertices while preserving the original 54,132 vertex prefix.
5. `finish_bodytop.py --source BASE --stage-dir STAGE --output-dir TOP
   --front-neckline-y 1.335` writes full body attributes, main indices and
   separate collar indices/material. The garment joins the actual cut edge at
   zero geometric gap; the inner ellipse matches the agreed head interface.
6. `prepare_hand_albedo_v3.py --source BASE --base-albedo HANDS/mira-hands-albedo.png
   --output-dir COLOUR --paint-neck-cloth --neck-spatial` smooths painted skin detail and
   continues olive cloth through the old body-texture V-neck. All pixels outside
   the combined ROI remain identical to the supplied hand albedo.
7. `pad_neck_albedo_v5.py --source BASE --base-dir COLOUR --output-dir PADDED
   --padding 12` pads only the frozen neck colour into its atlas gutters. It
   protects hand, bare-arm, jeans and foot UV occupancy and proves all 665 central
   neck vertex samples with bilinear sampling and box mip levels 1/2/4/8.
8. Root integrates TOP full attributes and indices, then HANDS sparse geometry,
   then PADDED albedo. Keep collar as a separate skinned node: a second primitive
   in the body node would change the loader's body Mesh into a Group.

Every output directory is versioned and existing main outputs are rejected.
The original high horizontal collar and radial/harmonic opening fits were
rejected and remain in task output history. The accepted geometry chain is
`prepare_bodytop_native_input.py` → `retopo_bodytop_native.py` →
`finish_bodytop.py` (which calls `triangulate_collar.mjs`). Native review helpers render six
orthographic sides with Cycles CPU; root must also inspect the textured result
from front and in the real office.

Limits: hand fingers retain the source anatomy and can still look angular at
macro distance. The final colour pass cannot remove physical mesh grooves or
normal-map detail. No claim of new finger retopology or photoreal identity.

## Frozen candidates for root integration

- Hand geometry: `work/mira-polish/hands-patch.json`.
- Body/collar: `work/mira-polish/bodytop-v2/bodytop-native-patch.json`.
- Combined padded colour: `work/mira-polish/handv5/mira-hands-albedo.png`, SHA256
  `c13ea4265a42d3ae1bcdd7018936a9dcba89c41e2d33d77026c0dc990ccf3702`.
- Final head/neck is a separate root/head worker concern. Root's actual front
  view confirmed that the remaining wide tan V-neck was body-atlas bleed;
  V5 padding removed it. The preserved head surface below the chin is narrow.

The v4 anatomical chest mask left old-colour gutter samples: 104 of 665 central
upper-body nearest vertex samples had R/G >1.3. V5 resolves that demonstrated UV
bleed with 12-pixel guarded padding. All 665 actual bilinear vertex samples now
have R/G <1.3, including box mip levels 2/4/8. Hands and protected jeans/feet/bare
arms remain exact to v4, as do all pixels outside the expanded ROI (160,936
pixels). This is a texture-only fix; root still owns the final composite view.

Accepted execution tools: installed Hunyuan Python
`E:/AI/ComfyUI-Hunyuan21/.venv/Scripts/python.exe`; Blender
`C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`; stock `node` using
the existing `vendor/three/three.module.js`. For every rerun, use a new output
directory and preserve previous receipts. Own helper Python files pass Ruff;
no app tests are run by this bounded asset worker.
