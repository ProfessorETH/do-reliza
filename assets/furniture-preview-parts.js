import * as THREE from '../vendor/three/three.module.js';

// The authored GLBs batch room furniture by material. Copy only triangles in
// the item's footprint; never change the office geometry used by the game.
export function furnitureInBounds(source,bounds,{skipBelow=-Infinity}={}) {
  source.updateMatrixWorld(true);const group=new THREE.Group(),point=new THREE.Vector3();
  source.traverse(node=>{
    if(!node.isMesh||!node.geometry?.attributes.position)return;
    const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry,positions=geometry.attributes.position,kept=[];
    for(let i=0;i<positions.count;i+=3){point.set(0,0,0);for(let j=0;j<3;j++)point.add(new THREE.Vector3().fromBufferAttribute(positions,i+j));point.multiplyScalar(1/3).applyMatrix4(node.matrixWorld);const highest=Math.max(...[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(positions,i+j).applyMatrix4(node.matrixWorld).y));if(highest>=skipBelow&&bounds.containsPoint(point))kept.push(i,i+1,i+2);}
    if(!kept.length)return;const copy=new THREE.BufferGeometry();
    for(const [name,attribute] of Object.entries(geometry.attributes)){
      const values=[];for(const index of kept)for(let axis=0;axis<attribute.itemSize;axis++)values.push(attribute[['getX','getY','getZ','getW'][axis]](index));
      copy.setAttribute(name,new THREE.Float32BufferAttribute(values,attribute.itemSize));
    }
    copy.computeBoundingBox();copy.computeBoundingSphere();const mesh=new THREE.Mesh(copy,node.material);mesh.name=node.name;node.matrixWorld.decompose(mesh.position,mesh.quaternion,mesh.scale);group.add(mesh);
    if(geometry!==node.geometry)geometry.dispose();
  });
  return group;
}
