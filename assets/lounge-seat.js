import { Vector3, MathUtils } from '../vendor/three/three.module.js';
import { LOUNGE_SEAT } from '../office-layout.js?v=seated-breaks-20261024-v2';

// Compress the existing Blender upholstery, including both cloth layers. All
// geometry is cloned before deformation; cached GLBs and floor bounds stay put.
export function prepareLoungeSeat(room) {
  room.updateMatrixWorld(true);
  const parts=[],p=new Vector3();
  room.traverse(node=>{
    if(!node.isMesh)return;
    const positions=node.geometry.attributes.position, inverse=node.matrixWorld.clone().invert(), changes=[];
    for(let i=0;i<positions.count;i++) {
      p.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld);
      const radius=Math.hypot(p.x-LOUNGE_SEAT.point[0],p.z-LOUNGE_SEAT.point[1]);
      if(p.x< -4.55 || p.x> -3.34 || p.z<2.11 || p.z>3.29 || p.y<=.50 || p.y>.70 || radius>=.70)continue;
      const weight=1-MathUtils.smoothstep(radius,.50,.70);
      const target=p.clone();target.y=Math.min(p.y,LOUNGE_SEAT.surfaceHeight+(node.name.startsWith('Release3D_')?0:.008));
      target.lerp(p,1-weight).applyMatrix4(inverse);
      changes.push({index:i,from:new Vector3().fromBufferAttribute(positions,i),to:target});
    }
    if(changes.length){node.geometry=node.geometry.clone();parts.push({node,changes});}
  });
  let previous=-1;
  return { parts, update(amount) {
    amount=MathUtils.clamp(amount,0,1);if(Math.abs(amount-previous)<.0001)return;previous=amount;
    for(const {node,changes} of parts){
      const positions=node.geometry.attributes.position;
      for(const {index,from,to} of changes){p.copy(from).lerp(to,amount);positions.setXYZ(index,p.x,p.y,p.z);}
      positions.needsUpdate=true;node.geometry.computeVertexNormals();node.geometry.computeBoundingSphere();
    }
  }};
}
