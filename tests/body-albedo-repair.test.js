import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseGLB} from '../scripts/attach-portrait-head.js';
import {bodyAlbedo,replaceBodyAlbedo} from '../scripts/replace-body-albedo.js';

test('native colour repair keeps portrait, topology, UV accessors and all existing animation data',async()=>{
  const source=await readFile(new URL('../assets/models/nika.glb',import.meta.url));
  const before=parseGLB(source),albedo=bodyAlbedo(source,'nika');
  const result=replaceBodyAlbedo(source,albedo.bytes,{id:'nika',expectedSourceSha256:createHash('sha256').update(albedo.bytes).digest('hex')});
  const after=parseGLB(result.bytes);
  for(const key of ['nodes','meshes','skins','animations','accessors','materials','textures'])assert.deepEqual(after.json[key],before.json[key],key);
  for(let i=0;i<before.json.images.length;i++)if(i!==albedo.index)assert.deepEqual(after.json.images[i],before.json.images[i]);
  assert.ok(after.bin.subarray(0,before.bin.length).equals(before.bin));
  assert.deepEqual(after.json.bufferViews.slice(0,before.json.bufferViews.length),before.json.bufferViews);
  assert.ok(bodyAlbedo(result.bytes,'nika').bytes.equals(albedo.bytes));
});
