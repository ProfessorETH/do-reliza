import * as THREE from 'three';
import { ALL_DESKS } from '../office-layout.js';

// Furniture is cloned from the authored office GLB, including the chair rig.
export function mountStudioExpansion(room) {
  const annex = new THREE.Group(); annex.name = 'StudioAnnex'; room.add(annex);
  const floor = room.getObjectByName('Release3D_Static_Room_floor').clone();
  floor.position.x = 7; floor.scale.x = .4; annex.add(floor);
  const source = room.getObjectByName('Release3D_Desk0'), desks = [];
  for (const index of [3,4]) {
    const desk = source.clone(true), anchor = ALL_DESKS[index];
    desk.name = `StudioDesk${index}`; desk.position.set(anchor.x,0,anchor.z);
    desk.traverse(node => {
      for (const key of ['deskIndex','chairIndex','screenIndex']) if (Number.isInteger(node.userData[key])) node.userData[key] = index;
    });
    annex.add(desk); desks.push(desk);
  }
  const coffee = new THREE.Group(); coffee.name = 'CoffeeStation'; coffee.userData.hotspot = 'coffee';
  const body = new THREE.Mesh(new THREE.BoxGeometry(.48,.52,.34),new THREE.MeshStandardMaterial({color:'#455b59',roughness:.5}));
  body.position.set(-1,.96,-3.55); coffee.add(body);
  const face = new THREE.Mesh(new THREE.BoxGeometry(.30,.16,.02),new THREE.MeshStandardMaterial({color:'#93d6b8',emissive:'#285044'}));
  face.position.set(-1,1.08,-3.37); coffee.add(face);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(.08,.06,.13,16),new THREE.MeshStandardMaterial({color:'#f5d7a9'}));
  cup.name='CoffeeStationCup';cup.position.set(-1,.78,-3.29); coffee.add(cup); room.add(coffee);
  // Match the original cutaway walls; the east side is an open passage.
  const back = new THREE.Mesh(new THREE.BoxGeometry(4,3,.18),new THREE.MeshStandardMaterial({color:'#20313c'}));
  back.position.set(7,1.5,-4); back.userData.wallSide='back'; annex.add(back);
  return {
    desks,
    sync(upgrades=[]) {
      annex.visible=upgrades.includes('desk4'); desks[1].visible=upgrades.includes('desk5');
      coffee.visible=upgrades.includes('coffee');
      room.traverse(node=>{
        if(node.userData.wallSide==='right'){node.userData.originalX??=node.position.x;node.position.x=node.userData.originalX+(annex.visible?4:0);}
        if(node.userData.wallSide==='front'){node.userData.originalX??=node.position.x;node.position.x=node.userData.originalX+(annex.visible?2:0);node.scale.x=annex.visible?1.4:1;}
      });
    },
  };
}

export function mountStudioSurroundings(scene) {
  const city = new THREE.Group(); city.name='EveningNeighborhood';
  const ground = new THREE.Mesh(new THREE.BoxGeometry(40,.25,32),new THREE.MeshBasicMaterial({color:'#1e2e35'}));
  ground.position.set(0,-.7,0); city.add(ground);
  const material=new THREE.MeshStandardMaterial({color:'#32464c',roughness:1});
  // Small, static silhouettes keep the office legible and cost no animation work.
  for(let i=0;i<9;i++){
    const height=1.5+(i*7%4)*.6, block=new THREE.Mesh(new THREE.BoxGeometry(2.1,height,2.8),material);
    block.position.set(-14+i*3.5,height/2-.6,-13-(i%2)*2);city.add(block);
    for(let y=0;y<height-1;y++){
      const window=new THREE.Mesh(new THREE.BoxGeometry(1.3,.3,.02),new THREE.MeshBasicMaterial({color:i%3?'#b59972':'#759b9b'}));
      window.position.set(block.position.x,y+.5,block.position.z+1.42);city.add(window);
    }
  }
  scene.add(city);
}
