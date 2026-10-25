import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import * as THREE from '../vendor/three/three.module.js';
import {bindSpeechMouth,MOUTH_FITS} from '../assets/speech-mouth.js';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:specifier,context);}});
const {GLTFLoader}=await import('../vendor/three/loaders/GLTFLoader.js');
async function portrait(id){const loader=new GLTFLoader();loader.register(()=>({name:'TEST_TEXTURE',loadTexture:()=>Promise.resolve(new THREE.Texture())}));const bytes=await readFile(new URL(`../assets/models/${id}.glb`,import.meta.url));return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')).scene.getObjectByName(`DR_${id}_PortraitHead`);}
for(const id of Object.keys(MOUTH_FITS))test(`${id}: lip opening preserves neutral face, blink, UVs and source geometry`,async()=>{
 const head=await portrait(id),source=head.geometry,positions=source.attributes.position.array.slice(),blink=source.morphAttributes.position[0].array.slice(),uvs=source.attributes.uv.array.slice();
 const rig=bindSpeechMouth(head,id);assert.ok(rig);assert.notEqual(head.geometry,source);assert.deepEqual(source.attributes.position.array,positions);
 const g=head.geometry,n=positions.length/3;assert.ok(g.attributes.position.count-n<1000,'bounded seam refinement');assert.deepEqual(g.attributes.position.array.slice(0,positions.length),positions);assert.deepEqual(g.attributes.uv.array.slice(0,uvs.length),uvs);assert.deepEqual(g.morphAttributes.position[0].array.slice(0,blink.length),blink);
 const delta=g.morphAttributes.position[rig.index],fit=MOUTH_FITS[id];let changed=0,upper=0,lower=0;
 for(let i=0;i<delta.count;i++){const d=delta.getY(i);assert.ok(Number.isFinite(d));assert.equal(delta.getX(i),0);assert.equal(delta.getZ(i),0);if(Math.abs(d)>.00001){changed++;const x=g.attributes.position.getX(i),y=g.attributes.position.getY(i),z=g.attributes.position.getZ(i);assert.ok(Math.abs(x-fit.x)<fit.width+.0001);assert.ok(Math.abs(y-fit.y)<.2);assert.ok(z>fit.front);upper+=d>0;lower+=d<0;assert.ok(Math.abs(d)<=.03501);}}
 assert.ok(changed>20&&changed<delta.count*.04);assert.ok(upper&&lower);assert.equal(head.morphTargetDictionary.PortraitBlink,0);
 head.morphTargetInfluences[0]=.7;for(let i=0;i<20;i++)rig.update(1/60,true,.7);assert.ok(head.morphTargetInfluences[rig.index]>.9);assert.equal(head.morphTargetInfluences[0],.7);assert.ok(rig.cavity.visible);
 for(let i=0;i<35;i++)rig.update(1/60,false,1);assert.equal(head.morphTargetInfluences[rig.index],0);assert.equal(rig.cavity.visible,false);
 for(let i=0;i<30;i++)rig.update(1/60,true,0);assert.equal(head.morphTargetInfluences[rig.index],0,'silent caption does not flap');
 for(let i=0;i<30;i++)rig.update(1/60,true,NaN);assert.equal(head.morphTargetInfluences[rig.index],0);
});
test('mouth motion uses frame-rate-independent attack and release',async()=>{
 const a=bindSpeechMouth(await portrait('mira'),'mira'),b=bindSpeechMouth(await portrait('mira'),'mira');
 let x,y;for(let i=0;i<6;i++)x=a.update(1/60,true,.4);for(let i=0;i<3;i++)y=b.update(1/30,true,.4);assert.ok(Math.abs(x-y)<1e-6);
 for(let i=0;i<24;i++)x=a.update(1/60,false,0);for(let i=0;i<12;i++)y=b.update(1/30,false,0);assert.ok(Math.abs(x-y)<1e-6);assert.equal(x,0);
});
