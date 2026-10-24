import * as THREE from "three";
import { GLTFLoader } from "../../vendor/three/loaders/GLTFLoader.js";
import { OrbitControls } from "../../vendor/three/controls/OrbitControls.js";
import { AGENTS } from "../../data.js";

const viewport = document.querySelector("#viewport"),
  status = document.querySelector("#status");
const person = document.querySelector("#person"),
  motion = document.querySelector("#motion");
const controlsButtons = [...document.querySelectorAll("button")];
const loader = new GLTFLoader(),
  cache = new Map();
const portraitPreview = new URLSearchParams(location.search).get('portrait') === '4';
const reviewManifest = portraitPreview ? fetch('portrait-v4/review-manifest.json').then(response=>response.json()) : Promise.resolve(null);
let faceView = true;
let model,
  mixer,
  skeleton,
  actions,
  activeAction,
  token = 0,
  paused = false;
let renderer, scene, camera, orbit;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let expressionTime=0;

function poseView(back = false) {
  const bone=model?.getObjectByName(`Skin_${person.value}_Head`);
  const target=faceView&&bone?bone.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.21,0)):new THREE.Vector3(0,.94,0);
  orbit.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(0,.04,back?(faceView?1.45:3.9):-(faceView?1.45:3.9)));
  orbit.update();
}
function angleView(angle){const d=camera.position.distanceTo(orbit.target);camera.position.copy(orbit.target).add(new THREE.Vector3(Math.sin(angle)*d,.04,-Math.cos(angle)*d));orbit.update();}
function play() {
  if (!actions) return;
  const action = actions[motion.value];
  if (!action) return;
  activeAction?.fadeOut(0.18);
  action.reset().fadeIn(0.18);
  action.setLoop(
    ["Sit", "Stand"].includes(motion.value) ? THREE.LoopOnce : THREE.LoopRepeat,
    Infinity,
  );
  action.clampWhenFinished = true;
  action.play();
  activeAction = action;
}

async function load() {
  const request = ++token,
    id = person.value,
    agent = AGENTS.find((a) => a.id === id);
  viewport.setAttribute("aria-busy", "true");
  status.textContent = `Загружаем ${agent.name}…`;
  controlsButtons.forEach((b) => (b.disabled = true));
  try {
    const manifest=await reviewManifest;
    if(manifest){
      for(const option of person.options)option.disabled=!manifest.models[option.value];
      const label=document.querySelector('footer p');label.textContent=manifest.acceptance?'Портретные модели уже в игре. Сравнивай их с исходными портретами, меняй ракурс и проверяй движения.':'Предпросмотр новой головы. Тела и анимации взяты из рабочей игры. Сравниваем лицо и волосы с исходным портретом перед обновлением основной версии.';
      if(!manifest.models[id])throw new Error('Head candidate is not ready');
    }
    if (!cache.has(id))
      cache.set(
        id,
        loader.loadAsync(manifest?`portrait-v4/assembled/${manifest.models[id].file}?v=${manifest.updated}`:`../../assets/models/${id}.glb?v=portrait-v4`),
      );
    const gltf = await cache.get(id);
    if (request !== token) return;
    if (model) scene.remove(model);
    if (skeleton) {
      scene.remove(skeleton);
      skeleton.geometry.dispose();
      skeleton.material.dispose();
    }
    mixer?.stopAllAction();
    model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    scene.add(model);
    mixer = new THREE.AnimationMixer(model);
    actions = Object.fromEntries(
      gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]),
    );
    activeAction = null;
    skeleton = new THREE.SkeletonHelper(model);
    skeleton.material.depthTest = false;
    skeleton.material.transparent = true;
    skeleton.material.opacity = 0.85;
    skeleton.visible =
      document.querySelector("#toggle-bones").getAttribute("aria-pressed") ===
      "true";
    scene.add(skeleton);
    const title = document.querySelector("#title");
    title.replaceChildren(document.createTextNode(agent.name));
    const role = document.createElement("span");
    role.textContent = agent.role;
    title.append(role);
    const portrait = document.querySelector("#portrait");
    portrait.style.backgroundPosition = `${(agent.index % 3) * 50}% ${Math.floor(agent.index / 3) * 100}%`;
    portrait.setAttribute("aria-label", `Исходный портрет: ${agent.name}`);
    let bones = 0,
      triangles = 0;
    model.traverse((o) => {
      if (o.isBone) bones++;
      if (o.isMesh)
        triangles +=
          (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    });
    document.querySelector("#rig-info").textContent =
      `${bones} костей · ${gltf.animations.length} анимаций`;
    document.querySelector("#metrics").textContent =
      `${Math.round(triangles).toLocaleString("ru-RU")} треугольников`;
    play();
    poseView();
    status.textContent = "";
    viewport.setAttribute("aria-busy", "false");
    controlsButtons.forEach((b) => (b.disabled = false));
  } catch (error) {
    cache.delete(id);
    console.error(error);
    status.textContent =
      "Не удалось загрузить персонажа. Выбери его ещё раз или обнови страницу.";
    viewport.setAttribute("aria-busy", "false");
  }
}

try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xe6e3da);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  viewport.append(renderer.domElement);
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute(
    "aria-label",
    "Анимированная 3D-модель выбранного персонажа",
  );
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(33, 1, 0.01, 30);
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.enablePan = false;
  orbit.minDistance = 0.7;
  orbit.maxDistance = 7;
  orbit.maxPolarAngle = Math.PI * 0.85;
  scene.add(new THREE.HemisphereLight(0xfff4df, 0x687368, 2.2));
  const key = new THREE.DirectionalLight(0xfff0d9, 2.5);
  key.position.set(-2, 3, -4);
  key.target.position.set(0, 0.8, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {
    left: -1.4,
    right: 1.4,
    top: 1.4,
    bottom: -1.4,
    near: 0.1,
    far: 10,
  });
  key.shadow.normalBias = 0.004;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xffffff, 1.4);
  fill.position.set(3, 2, 2);
  scene.add(fill);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 64),
    new THREE.MeshStandardMaterial({ color: 0xcdd1c5, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  floor.receiveShadow = true;
  scene.add(floor);
  new ResizeObserver(() => {
    const { width, height } = viewport.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }).observe(viewport);
  person.addEventListener("change", load);
  motion.addEventListener("change", play);
  document.querySelector("#front").addEventListener("click", () => poseView());
  document.querySelector('#quarter').addEventListener('click',()=>angleView(Math.PI/4));
  document.querySelector('#profile').addEventListener('click',()=>angleView(Math.PI/2));
  document.querySelector('#face-view').addEventListener('click',()=>{faceView=true;poseView();});
  document.querySelector('#body-view').addEventListener('click',()=>{faceView=false;poseView();});
  document
    .querySelector("#back")
    .addEventListener("click", () => poseView(true));
  document.querySelector("#pause").addEventListener("click", (event) => {
    paused = !paused;
    event.currentTarget.setAttribute("aria-pressed", String(paused));
    event.currentTarget.textContent = paused ? "Продолжить" : "Пауза";
  });
  document.querySelector("#toggle-bones").addEventListener("click", (event) => {
    if (!skeleton) return;
    skeleton.visible = !skeleton.visible;
    event.currentTarget.setAttribute("aria-pressed", String(skeleton.visible));
    event.currentTarget.textContent = skeleton.visible
      ? "Скрыть скелет"
      : "Показать скелет";
  });
  let previous = 0;
  renderer.setAnimationLoop((time) => {
    const dt = Math.min((time - previous) / 1000, 0.05);
    previous = time;
    if (document.hidden) return;
    if (!paused){mixer?.update(dt);expressionTime+=dt;}
    const head=model?.getObjectByName(`DR_${person.value}_PortraitHead`);
    if(head?.morphTargetInfluences){
      const phase=(expressionTime+person.selectedIndex*.43)%4.1;
      head.morphTargetInfluences[head.userData.portraitBlinkMorph??0]=reducedMotion.matches?0:phase<.18?Math.sin(Math.PI*phase/.18):0;
    }
    if(faceView&&model){
      model.updateMatrixWorld(true);
      const bone=model.getObjectByName(`Skin_${person.value}_Head`);
      if(bone){const next=bone.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.21,0));camera.position.add(next.clone().sub(orbit.target));orbit.target.copy(next);}
    }
    orbit.update();
    renderer.render(scene, camera);
  });
  load();
} catch (error) {
  console.error(error);
  status.textContent =
    "Для 3D-просмотра нужен WebGL. Открой игру, чтобы использовать облегчённый офис.";
}
