"""Read-only GLB geometry/skin utilities for the scoped Mira review helpers."""
import base64
from functools import lru_cache
from io import BytesIO
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation


class GLB:
    def __init__(self, path):
        self.path = Path(path)
        self.raw = self.path.read_bytes()
        length, magic = struct.unpack_from("<II", self.raw, 12)
        assert magic == 0x4E4F534A
        self.doc = json.loads(self.raw[20:20+length])
        offset = 20+length
        size, magic = struct.unpack_from("<II", self.raw, offset)
        assert magic == 0x004E4942
        self.binary = self.raw[offset+8:offset+8+size]
        self.parents = {child: i for i, node in enumerate(self.doc["nodes"])
                        for child in node.get("children", [])}

    def accessor(self, index):
        a = self.doc["accessors"][index]
        v = self.doc["bufferViews"][a["bufferView"]]
        types = {5120: np.int8, 5121: np.uint8, 5122: np.int16,
                 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
        sizes = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
        dtype = np.dtype(types[a["componentType"]])
        count = sizes[a["type"]]
        offset = v.get("byteOffset", 0)+a.get("byteOffset", 0)
        stride = v.get("byteStride", dtype.itemsize*count)
        result = np.ndarray((a["count"], count), dtype=dtype, buffer=self.binary,
                            offset=offset, strides=(stride, dtype.itemsize)).copy()
        if a.get("normalized") and dtype.kind in "iu":
            result = result.astype(np.float64)/np.iinfo(dtype).max
        return result

    @lru_cache(None)
    def world(self, index):
        node = self.doc["nodes"][index]
        if "matrix" in node:
            matrix = np.array(node["matrix"]).reshape(4, 4, order="F")
        else:
            matrix = np.eye(4)
            matrix[:3, :3] = Rotation.from_quat(node.get("rotation", [0,0,0,1])).as_matrix() @ np.diag(node.get("scale", [1,1,1]))
            matrix[:3, 3] = node.get("translation", [0,0,0])
        return self.world(self.parents[index]) @ matrix if index in self.parents else matrix

    def mesh(self, node_index):
        node = self.doc["nodes"][node_index]
        primitives = self.doc["meshes"][node["mesh"]]["primitives"]
        assert len(primitives) == 1
        p = primitives[0]
        local = self.accessor(p["attributes"]["POSITION"])
        points = np.c_[local, np.ones(len(local))]
        weights = joints = None
        names = []
        if "skin" in node:
            skin = self.doc["skins"][node["skin"]]
            inverse = self.accessor(skin["inverseBindMatrices"]).reshape(-1,4,4).transpose(0,2,1)
            matrices = np.stack([self.world(j) @ inverse[i] for i,j in enumerate(skin["joints"])])
            joints = self.accessor(p["attributes"]["JOINTS_0"]).astype(int)
            weights = self.accessor(p["attributes"]["WEIGHTS_0"])
            world = np.zeros((len(local),4))
            for slot in range(4):
                world += np.einsum("nij,nj->ni", matrices[joints[:,slot]], points)*weights[:,slot,None]
            names = [self.doc["nodes"][j].get("name", str(j)) for j in skin["joints"]]
        else:
            world = points @ self.world(node_index).T
        return dict(node=node_index, primitive=p, local=local, world=world[:,:3],
                    faces=self.accessor(p["indices"]).reshape(-1,3),
                    uv=self.accessor(p["attributes"]["TEXCOORD_0"]) if "TEXCOORD_0" in p["attributes"] else None,
                    joints=joints, weights=weights, joint_names=names)

    def image(self, primitive):
        material = self.doc["materials"][primitive["material"]]
        texture = material["pbrMetallicRoughness"]["baseColorTexture"]["index"]
        im = self.doc["images"][self.doc["textures"][texture]["source"]]
        if "bufferView" in im:
            v = self.doc["bufferViews"][im["bufferView"]]
            start = v.get("byteOffset",0)
            data = self.binary[start:start+v["byteLength"]]
        else:
            data = base64.b64decode(im["uri"].split(",",1)[1])
        return np.asarray(Image.open(BytesIO(data)).convert("RGB"))/255

    def colors(self, mesh):
        image = self.image(mesh["primitive"])
        h,w = image.shape[:2]
        uv = mesh["uv"]
        # Raw glTF TEXCOORD_0 uses top-origin texture rows.
        p = np.clip((uv*[w,h]).astype(int), [0,0], [w-1,h-1])
        return image[p[:,1],p[:,0]]
