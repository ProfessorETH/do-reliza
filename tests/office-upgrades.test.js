import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {Box3,Vector3} from '../vendor/three/three.module.js';
import {DESKS} from '../office-layout.js';

registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:specifier,context);}});
const {GLTFLoader}=await import('../vendor/three/loaders/GLTFLoader.js');
const {applyUpgradeVisibility}=await import('../assets/office-upgrades.js');
async function upgrades(){const b=await readFile(new URL('../assets/models/office-upgrades.glb',import.meta.url));return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;}

test('each purchase owns independent real Blender geometry and visibility survives toggling',async()=>{
  const room=await upgrades(),groups=new Map();room.traverse(n=>{if(n.userData.upgradeId)groups.set(n.userData.upgradeId,n);});
  assert.deepEqual([...groups.keys()].sort(),['computers','lounge','quiet']);
  for(const group of groups.values())assert.ok(new Box3().setFromObject(group).getSize(new Vector3()).length()>1);
  applyUpgradeVisibility(groups,[]);assert.ok([...groups.values()].every(g=>!g.visible));
  applyUpgradeVisibility(groups,['quiet']);assert.equal(groups.get('quiet').visible,true);assert.equal(groups.get('computers').visible,false);
  applyUpgradeVisibility(groups,['computers','lounge']);assert.equal(groups.get('quiet').visible,false);assert.equal(groups.get('computers').visible,true);assert.equal(groups.get('lounge').visible,true);
});

test('purchased geometry stays inside existing furniture footprints and contact receipts agree',async()=>{
  const room=await upgrades();room.updateMatrixWorld(true);const p=new Vector3();
  room.traverse(n=>{if(!n.isMesh)return;const group=n.parent.userData.upgradeId;
    for(let i=0;i<n.geometry.attributes.position.count;i++){
      p.fromBufferAttribute(n.geometry.attributes.position,i).applyMatrix4(n.matrixWorld);
      assert.ok(p.y>=-.00001,'no geometry under floor');
      if(group==='quiet'||group==='computers')assert.ok(DESKS.some(d=>Math.abs(p.x-d.x)<=1.15+.00001&&Math.abs(p.z-d.z)<=.50+.00001),'desk-bound upgrade');
      else assert.ok((Math.abs(p.x+3.95)<=.60&&Math.abs(p.z-2.7)<=.60)||(Math.abs(p.x+3.93)<=.525&&Math.abs(p.z-3.59)<=.30),'lounge furniture footprint');
    }
  });
  const receipt=JSON.parse(await readFile(new URL('../art/blender/studio-upgrades/receipt.json',import.meta.url),'utf8'));
  assert.ok(receipt.contacts.length>=20);assert.ok(receipt.contacts.every(c=>Math.abs(c.signedGapMeters)<.00002||c.intent==='8 mm upholstery loft'));
});
