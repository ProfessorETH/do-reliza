"""Read-only source decoding and confirmed floating-shell proof for BMesh."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

from glb_support import GLB


ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument("--source", type=Path, default=ROOT/"assets/models/mira.glb")
parser.add_argument("--output-dir", type=Path, default=ROOT/"work/mira-polish")
args = parser.parse_args()
out = args.output_dir.resolve()
out.mkdir(parents=True, exist_ok=True)
g = GLB(args.source)
source_hash = hashlib.sha256(g.raw).hexdigest()
assert source_hash == "849a50fb5168020d45247fa0092041d440c991c99eca60acf4fdd72d45789dd6"
m = g.mesh(26)
u, inverse = np.unique(np.round(m["local"], 5), axis=0, return_inverse=True)
wf = inverse[m["faces"]]
e = np.unique(np.sort(np.vstack([wf[:, [0, 1]], wf[:, [1, 2]], wf[:, [2, 0]]]), axis=1), axis=0)
adj = coo_matrix((np.ones(len(e)*2), (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), shape=(len(u), len(u))).tocsr()
_, labels = connected_components(adj)
proof = []
remove = []
for component in np.unique(labels):
    p = u[labels == component]
    mask = labels[wf[:, 0]] == component
    count = int(mask.sum())
    if p[:, 1].min() > 1.315 and count in [116, 9]:
        remove.extend(np.flatnonzero(mask).tolist())
        proof.append(dict(component=int(component), triangles=count, bounds=[p.min(0).tolist(), p.max(0).tolist()]))
assert len(remove) == 125 and len(proof) == 2
target = out/"bodytop-native-input.npz"
assert not target.exists(), "Preserve existing native input"
np.savez_compressed(target, positions=m["local"], normals=g.accessor(m["primitive"]["attributes"]["NORMAL"]),
                    uv=m["uv"], joints=m["joints"], weights=m["weights"], faces=m["faces"], remove_faces=np.asarray(remove))
(out/"bodytop-native-input.receipt.json").write_text(json.dumps(dict(source_sha256=source_hash, removed=proof,
    input_sha256=hashlib.sha256(target.read_bytes()).hexdigest(), status="CPU native preparation"), indent=2))
print("Prepared confirmed two-shell removal and immutable body input")
