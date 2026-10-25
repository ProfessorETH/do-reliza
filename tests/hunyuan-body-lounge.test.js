import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import * as THREE from '../vendor/three/three.module.js';
import {OfficeActor} from '../office-actors.js';
import {poseActor} from '../office-pose.js';
import {prepareLoungeSeat} from '../assets/lounge-seat.js';
import {DESKS,LOUNGE_SEAT,findOfficePath,clearSegment} from '../office-layout.js?v=shift-ux-20261024-v2';
import {BODY_IDS,loadHunyuanBodyBytes} from './hunyuan-body-assets.js';

registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:specifier,context);}});
const {GLTFLoader}=await import('../vendor/three/loaders/GLTFLoader.js');
const loader=new GLTFLoader();
loader.register(()=>({name:'LOUNGE_GEOMETRY_ONLY_TEXTURES',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
async function load(path){
  const bytes=await readFile(new URL(path,import.meta.url));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
}

test('all deployable Hunyuan bodies clear the compressed lounge upholstery, ground both feet and retain desk routes',async()=>{
  const candidates=[];
  for(const id of BODY_IDS){
    const bytes=await loadHunyuanBodyBytes(id);
    candidates.push([id,await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')]);
  }
  const room=(await load('../assets/models/office.glb')).scene;
  for(const name of ['office-cozy','office-dressing'])room.add((await load(`../assets/models/${name}.glb`)).scene);
  prepareLoungeSeat(room).update(1);room.updateMatrixWorld(true);
  const upholstery=room.getObjectByName('Release3D_Static_Room_coral');
  assert.ok(upholstery?.isMesh,'actual exported coral beanbag geometry');
  upholstery.material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const ray=new THREE.Raycaster(),raw=new THREE.Vector3(),point=new THREE.Vector3();
  for(const [id,gltf] of candidates){
    const actor=new OfficeActor(id,gltf.scene,'#7ed9b8',0);
    Object.assign(actor,{sit:1,loungeBlend:1,restBlend:1,gait:0,phase:0,workBlend:0,state:'resting'});
    actor.group.position.set(LOUNGE_SEAT.point[0],0,LOUNGE_SEAT.point[1]);actor.group.rotation.y=LOUNGE_SEAT.yaw;
    const body=actor.group.getObjectByName(`DR_${id}_Skin`),positions=body.geometry.attributes.position;
    for(const reduced of [false,true]){
      poseActor(actor,.8,reduced);actor.group.updateMatrixWorld(true);let checked=0;
      for(let i=0;i<positions.count;i++){
        raw.fromBufferAttribute(positions,i);
        // Front-facing lap/upper-thigh region in the actual standing body.
        // The seat may support the underside; its tall back must not cover the lap.
        if(raw.y<.58||raw.y>.95||Math.abs(raw.x)>.27||raw.z>-.015)continue;
        body.getVertexPosition(i,point).applyMatrix4(body.matrixWorld);
        ray.set(new THREE.Vector3(point.x,2,point.z),new THREE.Vector3(0,-1,0));
        const top=ray.intersectObject(upholstery,false)[0]?.point.y;
        assert.ok(top===undefined||top<=point.y+.01,`${id}: coral cushion covers lap by ${top-point.y}m`);checked++;
      }
      assert.ok(checked>1000,`${id}: substantial real lap surface inspected`);
      for(const side of ['Left','Right']){
        const floor=new THREE.Box3().setFromObject(actor.footMeshes[side],true).min.y;
        assert.ok(Number.isFinite(floor)&&Math.abs(floor)<.006,`${id}: actual lounge sole floor contact`);
      }
    }
  }
  for(const desk of DESKS){
    const approach=[desk.seat[0]+.72,desk.seat[1]+.4];
    for(const [start,end] of [[approach,LOUNGE_SEAT.approach],[LOUNGE_SEAT.approach,approach]]){
      const path=findOfficePath(start,end,true);assert.ok(path,'desk/lounge route exists');
      let previous=start;for(const point of path){assert.ok(clearSegment(previous,point,true),'complete route clears furniture and chairs');previous=point;}
      assert.deepEqual(previous,end);
    }
  }
});
