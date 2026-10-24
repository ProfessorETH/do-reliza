// Sample the actual browser rig into editable Blender control poses for visual QA.
import { readFile, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { OfficeActor } from '../office-actors.js';
import { poseActor } from '../office-pose.js';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:s,c);}});
const {GLTFLoader}=await import('../vendor/three/loaders/GLTFLoader.js');
const file=await readFile(new URL('../assets/models/mira.glb',import.meta.url));
const model=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
const a=new OfficeActor('mira',model.scene,'#7ed9b8',0), poses=[];
for(const [clip,first] of [['walk',1],['sit',50],['work',100],['idle',150]]) for(let i=0;i<(clip==='idle'?1:6);i++){
  a.sit=['walk','idle'].includes(clip)?0:clip==='sit'?i/5:1;a.gait=clip==='walk'?1:0;a.phase=i/6;
  a.workBlend=clip==='work'?1:0;a.mouseBlend=clip==='work'?1:0;
  a.activity={stage:clip==='work'?'work':'plan',task:{skill:'design'}};
  poseActor(a,i*.19,false);
  const joints={};
  for(const [name,node] of Object.entries(a.joints)) if(!node.isMesh&&name!=='Root'){
    const p=node.position,q=node.quaternion,s=node.scale,round=n=>Math.round(n*1e6)/1e6;
    joints[name]={p:[p.x,-p.z,p.y].map(round),q:[q.w,q.x,-q.z,q.y].map(round),s:[s.x,s.z,s.y].map(round)};
  }
  poses.push({clip,frame:first+i*6,joints});
}
await writeFile(new URL('../art/blender/motion-preview.json',import.meta.url),JSON.stringify({version:1,agent:'mira',space:'Blender Z-up; quaternion wxyz',poses}));
console.log(`Baked ${poses.length} control poses from the current runtime. Apply motion_preview.py in Blender.`);
