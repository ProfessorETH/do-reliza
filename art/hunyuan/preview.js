import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/loaders/GLTFLoader.js';
import { OrbitControls } from '../../vendor/three/controls/OrbitControls.js';

const viewport = document.querySelector('#viewport');
const status = document.querySelector('#status');
const buttons = [...document.querySelectorAll('button')];

async function start() {
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xe6e3da, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  viewport.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Объёмная модель Миры. Используй кнопки ниже для поворота и приближения.');
  renderer.domElement.setAttribute('role', 'img');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, .01, 30);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = .7;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI * .85;
  controls.autoRotateSpeed = 1;
  scene.add(new THREE.HemisphereLight(0xfff8e9, 0x687567, 2.6));
  for (const [position, color, intensity] of [
    [[2,3,4],0xffecd6,3], [[-3,2,-2],0xffffff,2],
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...position); scene.add(light);
    if(position[2]>0){
      light.castShadow=true; light.shadow.mapSize.set(1024,1024);
      Object.assign(light.shadow.camera,{left:-1.3,right:1.3,top:1.3,bottom:-1.3,near:.1,far:10});
      light.target.position.set(0,.85,0);scene.add(light.target);
      light.shadow.bias=-.0001;light.shadow.normalBias=.004;
    }
  }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(.65, 64), new THREE.MeshStandardMaterial({color:0xd2d4c9,roughness:1}));
  floor.rotation.x = -Math.PI/2; floor.position.y = -.001;floor.receiveShadow=true; scene.add(floor);
  let dirty = true;
  controls.addEventListener('change', () => { dirty = true; });
  const resize = () => {
    const {width,height} = viewport.getBoundingClientRect();
    renderer.setSize(width,height);
    camera.aspect=width/height; camera.updateProjectionMatrix(); dirty=true;
  };
  new ResizeObserver(resize).observe(viewport);
  const gltf = await new GLTFLoader().loadAsync('./mira/mira-review-v2.glb');
  const model = gltf.scene;
  const bounds = new THREE.Box3().setFromObject(model);
  model.scale.setScalar(1.72 / bounds.getSize(new THREE.Vector3()).y);
  const scaled = new THREE.Box3().setFromObject(model);
  const center = scaled.getCenter(new THREE.Vector3());
  model.position.set(-center.x,-scaled.min.y,-center.z);
  scene.add(model);
  let triangles=0;
  model.traverse(o => {if(o.isMesh){o.castShadow=true;triangles+=(o.geometry.index?.count ?? o.geometry.attributes.position.count)/3;}});
  document.querySelector('#metrics').textContent=`${Math.round(triangles).toLocaleString('ru-RU')} треугольников`;
  function view(back=false) {
    controls.target.set(0,.88,0);
    camera.position.set(0,1.04,back?-3.55:3.55);
    controls.update();dirty=true;
  }
  view(); resize();
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>view(button.dataset.view==='back')));
  const rotate = document.querySelector('#rotate');
  rotate.addEventListener('click',()=>{
    controls.autoRotate=!controls.autoRotate;
    rotate.setAttribute('aria-pressed',String(controls.autoRotate));
    rotate.textContent=controls.autoRotate?'Остановить':'Вращать';dirty=true;
  });
  function zoom(factor) {
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));
    camera.position.copy(controls.target).add(offset);controls.update();dirty=true;
  }
  document.querySelector('#zoom-in').addEventListener('click',()=>zoom(.8));
  document.querySelector('#zoom-out').addEventListener('click',()=>zoom(1.25));
  document.querySelector('#reset').addEventListener('click',()=>{
    controls.autoRotate=false;rotate.setAttribute('aria-pressed','false');rotate.textContent='Вращать';view();
  });
  buttons.forEach(button=>{button.disabled=false;});
  viewport.setAttribute('aria-busy','false');status.textContent='';
  document.addEventListener('visibilitychange',()=>{dirty=true;});
  renderer.setAnimationLoop(()=>{
    if(document.hidden)return;
    const changed=controls.update();
    if(dirty||changed){renderer.render(scene,camera);dirty=false;}
  });
  renderer.domElement.addEventListener('webglcontextlost',event=>{
    event.preventDefault();renderer.setAnimationLoop(null);
    status.textContent='3D-просмотр остановлен. Обнови страницу, чтобы загрузить модель снова.';
    buttons.forEach(button=>{button.disabled=true;});
  });
}

start().catch(error=>{
  console.error(error);
  viewport.setAttribute('aria-busy','false');
  status.textContent='Не удалось загрузить 3D. Обнови страницу; референс остаётся доступен рядом.';
});
