import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as THREE from '../vendor/three/three.module.js';
import {OfficeActor} from '../office-actors.js';
import {poseActor} from '../office-pose.js';
import {BODY_IDS,loadHunyuanBodyBytes} from './hunyuan-body-assets.js';

registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:specifier,context);}});
const {GLTFLoader}=await import('../vendor/three/loaders/GLTFLoader.js');
const {clone}=await import('../vendor/three/utils/SkeletonUtils.js');

for(const id of BODY_IDS)test(`${id} deployable body: real soles, all five saved clips and live walk/chair/work poses`,async()=>{
  const bytes=await loadHunyuanBodyBytes(id);
  const loader=new GLTFLoader();loader.register(()=>({name:'QUALITY_GEOMETRY_ONLY_TEXTURES',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  const actor=new OfficeActor(id,clone(gltf.scene),'#7ed9b8',0);actor.group.position.set(0,0,0);
  assert.equal(actor.skinBindings.length,25);
  assert.equal(actor.portraitHead?.parent.name,`Skin_${id}_Head`);
  const body=actor.group.getObjectByName(`DR_${id}_Skin`);
  assert.ok(body.isSkinnedMesh&&body.geometry.attributes.position.count>10000);
  const weights=body.geometry.attributes.skinWeight;
  for(let i=0;i<weights.count;i++)assert.ok(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<.002,'normalized real skin weights');
  const clipFloors=[];
  assert.deepEqual(gltf.animations.map(c=>c.name).sort(),['Idle','Sit','Stand','Walk','Work']);
  for(const clip of gltf.animations){
    const scene=clone(gltf.scene),mixer=new THREE.AnimationMixer(scene),action=mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    let minimum=Infinity,stationaryError=0;
    for(let i=0;i<=24;i++){
      mixer.setTime(clip.duration*i/24);scene.updateMatrixWorld(true);
      for(const side of ['Left','Right']){
        const foot=scene.getObjectByName(`DR_${id}_${side}Foot_Rigid`);
        assert.ok(foot.isMesh&&foot.geometry.attributes.position.count>0,'actual generated foot surface');
        assert.equal(foot.parent.name,`Skin_${id}_${side}Foot`);
        const y=new THREE.Box3().setFromObject(foot,true).min.y;
        assert.ok(Number.isFinite(y));minimum=Math.min(minimum,y);
        if(clip.name!=='Walk')stationaryError=Math.max(stationaryError,Math.abs(y));
      }
    }
    assert.ok(minimum>=-.012,`${clip.name} sole penetrates floor ${minimum}`);
    assert.ok(stationaryError<=.012,`${clip.name} sole ground error ${stationaryError}`);
    clipFloors.push({clip:clip.name,minimum,stationaryError});
  }
  for(const state of [{gait:1,phase:.05,sit:0,workBlend:0},{gait:1,phase:.32,sit:0,workBlend:0},{gait:1,phase:.72,sit:0,workBlend:0},{gait:0,phase:0,sit:.5,workBlend:0},{gait:0,phase:0,sit:1,workBlend:0},{gait:0,phase:0,sit:1,workBlend:1},{gait:0,phase:0,sit:1,workBlend:0,loungeBlend:1,restBlend:1,state:'resting'}]){
    Object.assign(actor,state);poseActor(actor,.8,false);actor.group.updateMatrixWorld(true);
    for(let i=0;i<body.geometry.attributes.position.count;i+=31){const v=body.getVertexPosition(i,new THREE.Vector3());assert.ok(v.toArray().every(Number.isFinite)&&v.length()<2.5,'finite bounded posed body');}
    for(const side of ['Left','Right']){
      assert.ok(Number.isFinite(actor.soleHeight(side,0)));
      const floor=new THREE.Box3().setFromObject(actor.footMeshes[side],true).min.y;
      assert.ok(floor>-.008,'live IK uses actual new sole and keeps it above floor');
    }
  }
  console.log(`QUALITY_BODY_QA ${id} ${JSON.stringify(clipFloors)}`);
});
