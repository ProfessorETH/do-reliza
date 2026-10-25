import { furnitureInBounds } from './furniture-preview-parts.js';
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';
import { OrbitControls } from '../vendor/three/controls/OrbitControls.js';
import { mountStudioExpansion } from './studio-expansion.js';
import { assetURL } from '../asset-url.js';

const files=new Map(),loader=new GLTFLoader();
const load=name=>{if(!files.has(name))files.set(name,loader.loadAsync(assetURL(`models/${name}.glb`)).catch(error=>{files.delete(name);throw error;}));return files.get(name);};
let sources;
async function furniture() {
  if(!sources)sources=Promise.all([load('office'),load('office-upgrades'),load('office-cozy')]).then(([base,upgrades,cozy])=>{
    const room=base.scene.clone(true);mountStudioExpansion(room);room.updateMatrixWorld(true);upgrades.scene.updateMatrixWorld(true);cozy.scene.updateMatrixWorld(true);return {room,upgrades:upgrades.scene,cozy:cozy.scene};
  }).catch(error=>{sources=null;throw error;});
  return sources;
}
async function buildUpgradeModel(id,after=true) {
  if(!['lounge','quiet','computers','coffee','desk4','desk5'].includes(id))throw Error('Unknown office item');
  const {room,upgrades,cozy}=await furniture(),group=new THREE.Group();group.name='Preview_'+id;
  const add=(source,name)=>{const object=source.getObjectByName(name);if(!object)throw Error('Missing authored furniture: '+name);const copy=object.clone(true);object.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);copy.visible=true;group.add(copy);};
  const footprint=id==='lounge'?new THREE.Box3(new THREE.Vector3(-4.65,-.05,2),new THREE.Vector3(-3.15,1.8,3.98)):new THREE.Box3(new THREE.Vector3(-4,-.05,-2.8),new THREE.Vector3(-1.3,2.4,-.45));
  const baseRoom=()=>{const base=new THREE.Group();room.traverse(node=>{if(node.name.startsWith('Release3D_Static_Room_')&&!/_floor$|_rug$/.test(node.name)){const copy=node.clone(true);node.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);base.add(copy);}});return base;};
  if(id==='lounge'){group.add(furnitureInBounds(baseRoom(),footprint,{skipBelow:.12}));add(cozy,'CZ_Lounge');}
  else if(id==='coffee'){add(room,'CoffeeStation');group.add(furnitureInBounds(baseRoom(),new THREE.Box3(new THREE.Vector3(-2.4,0,-3.98),new THREE.Vector3(.65,1.25,-3.1)),{skipBelow:.12}));}
  else if(id==='desk4'||id==='desk5')add(room,'Release3D_Desk0');
  else add(room,'Release3D_Desk0');
  if(after&&['lounge','quiet','computers'].includes(id))group.add(furnitureInBounds(upgrades.getObjectByName('Upgrade_'+id),footprint));
  group.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(group),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  for(const object of group.children)object.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));
  group.scale.setScalar(3/Math.max(size.x,size.y,size.z));
  group.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
  return group;
}

const previews=new Map();
export async function createUpgradeModel(id,after=true){const key=id+':'+after;if(!previews.has(key))previews.set(key,buildUpgradeModel(id,after).catch(error=>{previews.delete(key);throw error;}));return (await previews.get(key)).clone(true);}

export class UpgradeModelViewer {
  constructor(host,{width,height}={}) {
    this.host=host;this.ticket=0;this.id=host.dataset.modelViewer;this.after=true;this.disposed=false;
    this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:!!width,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.35;
    this.renderer.domElement.setAttribute('aria-label','3D-модель улучшения. Потяни, чтобы повернуть.');this.renderer.domElement.setAttribute('role','img');
    this.onContextLost=()=>{if(!this.disposed)this.fail();};this.renderer.domElement.addEventListener('webglcontextlost',this.onContextLost);
    this.canvasHost=host.querySelector('.model-canvas')||host;this.canvasHost.append(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.add(new THREE.HemisphereLight(0xe8f0ff,0x52645c,2));
    const key=new THREE.DirectionalLight(0xffdfb0,3.2);key.position.set(-3,6,5);key.castShadow=true;key.shadow.mapSize.set(512,512);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xbad9e7,1.5);fill.position.set(4,3,-3);this.scene.add(fill);
    this.ground=new THREE.Mesh(new THREE.CylinderGeometry(2.15,2.25,.06,64),new THREE.MeshStandardMaterial({color:0x273d45,roughness:1}));this.ground.position.y=-.04;this.ground.receiveShadow=true;this.scene.add(this.ground);
    this.camera=new THREE.PerspectiveCamera(36,1,.01,80);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enablePan=false;this.controls.minPolarAngle=.3;this.controls.maxPolarAngle=1.48;
    this.controls.addEventListener('change',()=>this.draw());
    this.onClick=e=>{const button=e.target.closest('[data-preview-action]');if(!button||!this.model)return;const action=button.dataset.previewAction;
      if(action==='before'||action==='after'){this.after=action==='after';host.querySelectorAll('[data-preview-action=before],[data-preview-action=after]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));this.show(this.id,this.after).catch(()=>this.fail());}
      else if(action==='reset')this.reset();else if(action==='in'||action==='out'){this.camera.position.sub(this.controls.target).multiplyScalar(action==='in'?.85:1.18).clampLength(this.controls.minDistance,this.controls.maxDistance).add(this.controls.target);this.controls.update();}
      else {const offset=this.camera.position.clone().sub(this.controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),action==='left'?-.35:.35);this.camera.position.copy(this.controls.target).add(offset);this.controls.update();}
    };
    host.addEventListener('click',this.onClick);this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.canvasHost);this.fixedSize=width&&height?{width,height}:null;
  }
  async show(id=this.id,after=this.after) {
    const ticket=++this.ticket,model=await createUpgradeModel(id,after);if(this.disposed||ticket!==this.ticket)return;
    if(this.model)this.scene.remove(this.model);this.model=model;this.scene.add(model);this.id=id;this.after=after;this.reset();this.resize();this.host.querySelectorAll('[data-preview-action]').forEach(button=>button.disabled=false);this.host.dataset.modelReady='true';this.host.querySelector('.model-status')?.setAttribute('hidden','');
  }
  reset(){if(!this.model)return;const bounds=new THREE.Box3().setFromObject(this.model),height=bounds.getSize(new THREE.Vector3()).y;this.controls.target.set(0,height*.42,0);this.camera.position.set(4.1,height*.42+3.1,5.2);this.controls.minDistance=3.4;this.controls.maxDistance=11;this.controls.update();this.draw();}
  resize(){if(this.disposed)return;const width=this.fixedSize?.width||this.canvasHost.clientWidth,height=this.fixedSize?.height||this.canvasHost.clientHeight;if(!width||!height)return;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.draw();}
  draw(){if(!this.disposed)this.renderer.render(this.scene,this.camera);}
  fail(){this.host.dataset.modelReady='false';const status=this.host.querySelector('.model-status');if(status){status.hidden=false;status.textContent='Показан снимок предмета из офиса';}}
  dispose(){this.disposed=true;this.ticket++;this.resizeObserver.disconnect();this.host.removeEventListener('click',this.onClick);this.controls.dispose();this.renderer.domElement.removeEventListener('webglcontextlost',this.onContextLost);this.ground.geometry.dispose();this.ground.material.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
}
