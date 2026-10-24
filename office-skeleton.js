import * as THREE from './vendor/three/three.module.js';

export function bindOfficeSkin(model, joints) {
  let descriptor;
  model.traverse(node => { if(node.userData.skinRigVersion===1) descriptor=node; });
  if(!descriptor)return [];
  model.updateWorldMatrix(true,true);
  return descriptor.userData.skinJointNames.map(name=>{
    const bone=model.getObjectByName(descriptor.userData.skinBonePrefix+name),control=joints[name];
    if(!bone?.isBone||!control)throw new Error(`Incomplete skin rig: ${name}`);
    return {bone,control,bind:control.matrixWorld.clone().invert().multiply(bone.matrixWorld)};
  });
}
const target=new THREE.Matrix4(),local=new THREE.Matrix4();
export function updateOfficeSkin(actor) {
  if(!actor.skinBindings?.length)return;
  actor.group.updateMatrixWorld(true);
  for(const {bone,control,bind} of actor.skinBindings){
    target.multiplyMatrices(control.matrixWorld,bind);
    local.copy(bone.parent.matrixWorld).invert().multiply(target);
    local.decompose(bone.position,bone.quaternion,bone.scale);
    bone.updateMatrix();bone.updateWorldMatrix(false,false);
  }
  actor.group.updateMatrixWorld(true);
}
