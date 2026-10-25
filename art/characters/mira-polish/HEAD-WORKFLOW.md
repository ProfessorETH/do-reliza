# Mira head review helper

Run from the repository root with a recovered, unpolished Mira GLB:

```powershell
node art/characters/mira-polish/head_review.js --source path/to/base.glb --output-dir work/mira-polish/review
```

The JavaScript entry extracts the exact rigid head, runs a fresh factory Blender
CPU process, then appends changed accessors and one PNG to the original GLB BIN.
The result is `head-candidate.glb`, with `head-delta.json` and a receipt beside it.
It does not install assets. `--blender` can select another supported executable.

The native pass smooths a position-welded proxy so that UV-seam copies move
together, reduces only the rear hair mass, retains the bun and central face,
and repairs desaturated external temple curls using Blender's image API.
It preserves the original throat material and smoothly narrows its flared lower
surface. Only measured skin-coloured lower skirt triangles outside the neck are
removed. No replacement cylindrical neck is used.

The source body, rig nodes, clips, head blink accessor and existing BIN prefix
remain intact. The head stays one Mesh for the existing blink lookup. The root
integration helper adds the lossless `miraPolishOriginal` recovery layer and
combines this result with the independent hand/collar patch. Head polishing can
also run on a hand-only candidate whose head remains unpolished. Inputs already
marked `miraPolishVersion`, `miraPolishOriginal` or `miraPolishReview` are rejected.

The native deformation locally backs off until retained triangle face normals
stay in the original hemisphere and no new degenerate triangle appears. Inspect
the actual packed float32 GLB as well as the office front/profile before adoption.
The temple correction is deliberately conservative around ears and facial skin;
remaining dark ear/sideburn shading may require a separate accepted mask.
