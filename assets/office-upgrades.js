import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';
import { assetURL } from '../asset-url.js';

const url = new URL(assetURL('models/office-upgrades.glb?v=office-life-1'));
let loaded;
export function applyUpgradeVisibility(groups,purchases=[]) {
  for(const [id,group] of groups)group.visible=purchases.includes(id);
}

// Purchases own independent Blender groups. No room rebuild or navigation change.
export async function mountOfficeUpgrades(room) {
  loaded ||= new GLTFLoader().loadAsync(url.href).catch(error=>{loaded=null;throw error;});
  const additions=(await loaded).scene.clone(true), groups=new Map();
  additions.name='PurchasedOfficeUpgrades';
  additions.traverse(node=>{
    if(node.userData.upgradeId){groups.set(node.userData.upgradeId,node);node.visible=false;}
    if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}
  });
  room.add(additions);
  return {
    sync(purchases=[]) {
      applyUpgradeVisibility(groups,purchases);
      room.userData.purchasedUpgrades=[...purchases];
    },
    groups,
  };
}
