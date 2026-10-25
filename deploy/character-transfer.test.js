import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import * as THREE from '../vendor/three/three.module.js';
import {MeshoptDecoder} from '../vendor/meshopt/meshopt_decoder.mjs';
import {OfficeActor} from '../office-actors.js';
import {createGame,hire,seatAgent} from '../engine.js';

registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:s,c);}});
const {GLTFLoader}=await import('../vendor/three/loaders/GLTFLoader.js');
const {clone}=await import('../vendor/three/utils/SkeletonUtils.js');
const manifest=JSON.parse(await readFile(new URL('../dist/build-manifest.json',import.meta.url),'utf8'));
const report=JSON.parse(await readFile(new URL('../dist/character-transfer-report.json',import.meta.url),'utf8'));

for(const id of ['mira','pixel','nord','iskra','saga','echo','nika'])test(`${id}: browser decoder, all five clips and office skin/mouth survive compression`,async()=>{
  const bytes=await readFile(new URL(`../dist/demo-v05/${manifest.prefix}assets/models/${id}.glb`,import.meta.url));
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // Node has no DOM image decoder. Replace the WebP extension only for these
  // geometry/rig tests; actual texture decoding is checked in Chromium.
  loader.register(()=>({name:'EXT_texture_webp',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  assert.deepEqual(gltf.animations.map(c=>c.name).sort(),['Idle','Sit','Stand','Walk','Work']);
  const model=clone(gltf.scene),mixer=new THREE.AnimationMixer(model);
  for(const clip of gltf.animations) {
    mixer.stopAllAction();mixer.clipAction(clip).play();
    for(const t of [0,.37,.9]) {
      mixer.setTime(t);model.updateMatrixWorld(true);
      model.traverse(node=>{assert(node.matrixWorld.elements.every(Number.isFinite));if(node.isMesh){const position=new THREE.Vector3();for(let i=0;i<node.geometry.attributes.position.count;i+=2000){node.getVertexPosition(i,position);assert(position.toArray().every(Number.isFinite));}}});
    }
  }
  const actor=new OfficeActor(id,clone(gltf.scene),'#8ac4b1',0),game=createGame('calm');
  // Nika has the same rig but is a gallery-only mentor, outside the hiring list.
  if(id!=='nika'){hire(game,id);seatAgent(game,id,0);actor.destination(game,true);for(let i=0;i<60;i++)actor.update(1/60,i/60,[actor],{stage:'work',task:{id:'code',skill:'code'}},false,false);assert(actor.speechMouth,'Lip seam no longer binds');assert(actor.skinBindings.length>0);}
  const receipt=report.records.find(r=>r.id===id);
  assert.equal(receipt.nodeTransformError,0);
  assert(Object.values(receipt.geometryError).every(x=>x<=.00002));
});
