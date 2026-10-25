import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import * as THREE from '../vendor/three/three.module.js';import {furnitureInBounds} from '../assets/furniture-preview-parts.js';
test('isolating a preview keeps authored geometry intact and excludes other furniture and ground',()=>{
  const source=new THREE.Group(),mat=new THREE.MeshStandardMaterial();
  const selected=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat);selected.position.set(2,.5,0);selected.name='ActualDesk';source.add(selected);
  const other=selected.clone();other.position.x=8;source.add(other);
  const floor=new THREE.Mesh(new THREE.BoxGeometry(1,.05,1),mat);floor.position.set(2,0,0);source.add(floor);
  const before=[...selected.geometry.attributes.position.array];const bounds=new THREE.Box3(new THREE.Vector3(1,-.1,-1),new THREE.Vector3(3,2,1));
  const copy=furnitureInBounds(source,bounds,{skipBelow:.12});assert.equal(copy.children.length,1);assert.equal(copy.children[0].name,'ActualDesk');assert.equal(copy.children[0].material,mat);assert.deepEqual([...selected.geometry.attributes.position.array],before);assert.equal(selected.parent,source);
  assert.equal(furnitureInBounds(source,new THREE.Box3(new THREE.Vector3(20,20,20),new THREE.Vector3(21,21,21))).children.length,0);
});
test('six lightweight posters are native WebP renders tied to the authored office GLBs',()=>{
 const r=JSON.parse(fs.readFileSync(new URL('../art/previews/menu-models.receipt.json',import.meta.url)));assert.equal(r.posters.length,6);
 for(const entry of [...r.sources,...r.posters]){const bytes=fs.readFileSync(new URL('../'+entry.path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);if(entry.path.endsWith('.webp')){assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(bytes.length<80000);}}
});
