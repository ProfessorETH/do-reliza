import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import * as THREE from '../vendor/three/three.module.js';
import {OfficeActor} from '../office-actors.js';
import {poseActor} from '../office-pose.js';
import {BODY_IDS,loadHunyuanBodyBytes} from './hunyuan-body-assets.js';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:s,c);}});
const {GLTFLoader}=await import('../vendor/three/loaders/GLTFLoader.js');
const {clone}=await import('../vendor/three/utils/SkeletonUtils.js');

for(const id of BODY_IDS)test(`${id}: every upper-body triangle edge stays coherent through idle, walk and typing`,async()=>{
  const bytes=await loadHunyuanBodyBytes(id);
  const loader=new GLTFLoader();loader.register(()=>({name:'DEFORMATION_GEOMETRY_ONLY',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  const sourceScene=clone(gltf.scene),actor=new OfficeActor(id,gltf.scene,'#7ed9b8',0),body=actor.group.getObjectByName(`DR_${id}_Skin`);
  const positions=body.geometry.attributes.position,indices=body.geometry.index,edges=[],seen=new Set();
  let signedVolume=0;
  for(let k=0;k<indices.count;k+=3){
    const a=new THREE.Vector3().fromBufferAttribute(positions,indices.getX(k)),b=new THREE.Vector3().fromBufferAttribute(positions,indices.getX(k+1)),c=new THREE.Vector3().fromBufferAttribute(positions,indices.getX(k+2));
    signedVolume+=a.dot(b.cross(c))/6;
  }
  assert.ok(signedVolume>0,'body fronts must retain outward winding after open neck/ankle cuts');
  if(id==='mira'){
    const scene=clone(sourceScene),mesh=scene.getObjectByName('DR_mira_Skin'),mixer=new THREE.AnimationMixer(scene);
    mixer.clipAction(gltf.animations.find(c=>c.name==='Idle')).play();mixer.setTime(.8);scene.updateMatrixWorld(true);
    assert.equal(mesh.material.side,THREE.FrontSide,'proper winding must not need a DoubleSide rendering workaround');
    for(const [x,y] of [[.19,.88],[.17,.96],[.23,1.20]]){
      const ray=new THREE.Raycaster(new THREE.Vector3(x,y,-4),new THREE.Vector3(0,0,1)),hit=ray.intersectObject(mesh,false)[0];
      assert.ok(hit&&hit.point.z<-.04&&hit.face.normal.z<0,'real front lap/chest faces remain visible, rather than exposing back-surface ribbons');
    }
  }
  const joints=body.geometry.attributes.skinIndex,weights=body.geometry.attributes.skinWeight;let contactVertices=0;
  for(let i=0;i<positions.count;i++)if(Math.abs(positions.getY(i)-.13)<1e-5){
    const name=`Skin_${id}_${positions.getX(i)<0?'Left':'Right'}Foot`;let foot=0;
    for(let k=0;k<4;k++)if(body.skeleton.bones[joints.getComponent(i,k)].name===name)foot+=weights.getComponent(i,k);
    assert.ok(foot>.99999,'exact ankle ring follows rigid generated shoe without a walking seam');contactVertices++;
  }
  assert.ok(contactVertices>100,'real two-shoe contact rings inspected');
  for(let k=0;k<indices.count;k+=3)for(let e=0;e<3;e++){
    let i=indices.getX(k+e),j=indices.getX(k+(e+1)%3);if(i>j)[i,j]=[j,i];
    const key=i*positions.count+j;if(seen.has(key))continue;seen.add(key);
    // The ankle/sole transition is audited separately. This catches even one
    // waist/hand ribbon; a percentile or sparse triangle sample cannot do so.
    if(positions.getY(i)<.55||positions.getY(j)<.55)continue;
    const a=new THREE.Vector3().fromBufferAttribute(positions,i),b=new THREE.Vector3().fromBufferAttribute(positions,j);
    edges.push({i,j,before:a.distanceTo(b),rest:[a.toArray(),b.toArray()]});
  }
  let largest={growth:0};
  for(const state of [{gait:0,phase:0,sit:0,workBlend:0},{gait:1,phase:.32,sit:0,workBlend:0},{gait:1,phase:.72,sit:0,workBlend:0},{gait:0,phase:0,sit:.5,workBlend:0},{gait:0,phase:0,sit:1,workBlend:1}]){
    Object.assign(actor,state);poseActor(actor,.8,false);actor.group.updateMatrixWorld(true);
    const points=Array.from({length:positions.count},(_,i)=>body.getVertexPosition(i,new THREE.Vector3()));
    for(const edge of edges){
      const after=points[edge.i].distanceTo(points[edge.j]),growth=after-edge.before;
      if(growth>largest.growth)largest={...edge,after,growth,state};
    }
  }
  // The art gallery plays the original saved clips, whereas the office uses
  // poseActor. Both pipelines must deform every real garment triangle safely.
  for(const clip of gltf.animations){
    const scene=clone(sourceScene),mesh=scene.getObjectByName(`DR_${id}_Skin`),mixer=new THREE.AnimationMixer(scene),action=mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    for(const phase of [0,.5,1]){
      mixer.setTime(clip.duration*phase);scene.updateMatrixWorld(true);
      const points=Array.from({length:positions.count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()));
      for(const edge of edges){
        const after=points[edge.i].distanceTo(points[edge.j]),growth=after-edge.before;
        if(growth>largest.growth)largest={...edge,after,growth,savedClip:clip.name,phase};
      }
    }
  }
  console.log(`ALL_UPPER_EDGES ${id} ${JSON.stringify({edges:edges.length,largest})}`);
  assert.ok(largest.growth<.05,`single triangle ribbon: ${JSON.stringify(largest)}`);
});
