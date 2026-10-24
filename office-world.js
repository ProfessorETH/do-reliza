import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/three/controls/OrbitControls.js';
import { OfficeActor } from './office-actors.js?v=seated-breaks-20261024-v2';
import { DESKS, LOUNGE_SEAT, distance } from './office-layout.js?v=seated-breaks-20261024-v2';
import { agentById, activeTasks } from './engine.js?v=seated-breaks-20261024-v2';
import { makeScreen, paintScreen, paintSunset } from './office-screens.js';
import { createOfficeAtmosphere } from './assets/office-atmosphere.js?v=3-workspace';
import { mountOfficeUpgrades } from './assets/office-upgrades.js?v=office-life-1';
import { prepareLoungeSeat } from './assets/lounge-seat.js?v=seated-breaks-1';
import { officeFrame, officeWallVisible } from './office-camera-fit.js';

let world;
const modelCache = new Map();
const loader = new GLTFLoader();
const loadModel = name => {
  if (!modelCache.has(name)) modelCache.set(name, loader.loadAsync(`assets/models/${name}.glb?v=0.5.0`).catch(error => { modelCache.delete(name); throw error; }));
  return modelCache.get(name);
};

class OfficeWorld {
  constructor(callbacks) {
    this.callbacks = callbacks; this.actors = new Map(); this.loadingActors = new Set(); this.screens = new Map(); this.chairs = new Map(); this.selected = null; this.busy = false;
    this.restSignals = new Set();
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.camera = new THREE.OrthographicCamera(-8, 8, 5.6, -5.6, .1, 90);
    this.camera.position.set(11, 10.5, 13); this.camera.zoom = 1;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.3, 0); this.controls.enablePan = true; this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true; this.controls.enableDamping = true;
    this.controls.minPolarAngle = .45; this.controls.maxPolarAngle = 1.28;
    this.controls.minZoom = .8; this.controls.maxZoom = 3; this.controls.update();
    this.controls.addEventListener('start', () => { this.cameraGoal = null; });
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.projected = new THREE.Vector3();
    this.art = createOfficeAtmosphere(this.scene, this.renderer);
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.renderer.domElement.addEventListener('pointerdown', e => { this.down = [e.clientX, e.clientY]; });
    this.renderer.domElement.addEventListener('pointerup', e => this.pick(e));
    this.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); this.fail('Браузер остановил 3D. Показан облегчённый офис.'); });
    this.loadRoom();
  }
  async loadRoom() {
    try {
      this.room = (await loadModel('office')).scene; this.scene.add(this.room);
      this.room.traverse(node => {
        if (node.userData.wallSide) { if (!this.walls) this.walls = []; this.walls.push(node); }
        if (Number.isInteger(node.userData.chairIndex)) this.chairs.set(node.userData.chairIndex, { node, z: node.position.z });
        if (node.isMesh) {
          node.castShadow = !/_Static_Room_(floor|rug)$/.test(node.name); node.receiveShadow = true;
          if (Number.isInteger(node.userData.screenIndex)) this.screens.set(node.userData.screenIndex, makeScreen(node));
          if (node.name === 'Release3D_ArcadeScreen') this.arcade = makeScreen(node, true);
          if (node.userData.windowTexture) paintSunset(node);
        }
      });
      await this.art.dress(this.room);
      this.purchases = await mountOfficeUpgrades(this.room);
      this.purchases.sync(this.game?.life?.upgrades);
      this.loungeSeat = prepareLoungeSeat(this.room);
      this.walls = [];
      this.room.traverse(node => { if (node.userData.wallSide) this.walls.push(node); });
      this.ready = true; this.refreshContainer(); this.syncActors();
    } catch (error) { this.fail('Не удалось загрузить 3D-модели. Показан облегчённый офис.'); console.error('Office assets:', error); }
  }
  attach(container, game, selected, callbacks) {
    if (!this.initialTeam) this.initialTeam = new Set(callbacks.arriveOnLoad ? [] : game.team);
    this.container = container; this.game = game; this.selected = selected; this.callbacks = callbacks;
    this.purchases?.sync(game.life?.upgrades);
    container.append(this.renderer.domElement); this.resizeObserver.disconnect(); this.resizeObserver.observe(container);
    this.refreshContainer(); this.resize(); this.syncActors();
    if (!this.frameId) { this.lastFrame = performance.now(); this.frameId = requestAnimationFrame(time => this.frame(time)); }
  }
  refreshContainer() {
    if (!this.container) return;
    const parent = this.container.closest('.office-room'); parent.classList.toggle('is-3d', !!this.ready && !this.failed);
    parent.dataset.officeState = this.failed ? 'fallback' : this.ready ? 'ready' : 'loading';
    const status = parent.querySelector('.office-render-status');
    if (status) status.textContent = this.failed || (this.ready ? window.matchMedia('(pointer:coarse)').matches ? 'Тяни — поворот · два пальца — масштаб и сдвиг' : 'Тяни — поворот · колесо — масштаб · правая кнопка — сдвиг' : 'Загружаем 3D-студию…');
  }
  fail(message) { this.failed = message; this.refreshContainer(); this.callbacks.onBusy(false); this.callbacks.onError?.(message); this.reportRest(true); }
  resize() {
    if (!this.container?.isConnected) return;
    const w = this.container.clientWidth, h = this.container.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const ratio = w / h, halfH = officeFrame(ratio, this.camera.position.clone().sub(this.controls.target).toArray());
    this.camera.left = -halfH * ratio; this.camera.right = halfH * ratio; this.camera.top = halfH; this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    if (this.ready) this.renderer.render(this.scene, this.camera);
  }
  async syncActors() {
    if (this.failed) { this.reportRest(true); return; }
    if (!this.ready || !this.game) return;
    for (const [id, actor] of this.actors) if (!this.game.team.includes(id)) { this.scene.remove(actor.group); this.actors.delete(id); }
    for (const [order, id] of this.game.team.entries()) {
      let actor = this.actors.get(id);
      if (actor) { actor.order = order; actor.destination(this.game); continue; }
      if (this.loadingActors.has(id)) continue;
      this.loadingActors.add(id);
      try {
        const model = (await loadModel(id)).scene.clone(true);
        if (!this.game.team.includes(id)) continue;
        actor = new OfficeActor(id, model, agentById(id).color, order);
        actor.destination(this.game, this.initialTeam.has(id)); actor.pose(false, false, 0, this.reduced.matches);
        this.actors.set(id, actor); this.scene.add(actor.group);
      } catch (error) { this.fail('Не удалось загрузить персонажа. Показан облегчённый офис.'); console.error('Office character:', error); }
      finally { this.loadingActors.delete(id); }
    }
  }
  reportRest(fallback = false) {
    if (!this.game) return;
    for (const id of this.game.team) {
      const trip = this.game.life?.members[id]?.restTrip, actor = this.actors.get(id);
      if (!trip) continue;
      const arrived = trip.phase === 'outbound' && (fallback || actor?.state === 'resting' && distance(actor.point,LOUNGE_SEAT.point) < .03) ? 'resting'
        : trip.phase === 'returning' && (fallback || actor?.state === 'seated') ? 'back' : null;
      const key = `${id}:${arrived}`;
      if (!arrived || this.restSignals.has(key)) continue;
      this.restSignals.add(key);
      queueMicrotask(() => { this.restSignals.delete(key); this.callbacks.onRest?.(id,arrived); });
    }
  }
  frame(time) {
    this.frameId = 0;
    if (!this.container?.isConnected || !this.game || this.failed) return;
    const dt = Math.min(.05, (time - this.lastFrame) / 1000); this.lastFrame = time;
    if (!document.hidden) {
      this.controls.update();
      const active = activeTasks(this.game), actors = [...this.actors.values()];
      for (const actor of actors) actor.update(dt, time / 1000, actors, { stage: this.game.stage, task: active.find(t => this.game.assignments[t.id] === actor.id) }, this.reduced.matches, this.selected === actor.id);
      this.reportRest();
      this.container.dataset.resting = actors.filter(a => a.state === 'resting').map(a=>a.id).join(',');
      this.loungeSeat?.update(Math.max(0,...actors.map(a=>(a.loungeBlend||0)*a.sit)));
      this.container.dataset.upgrades = (this.game.life?.upgrades || []).join(',');
      for (const [index, chair] of this.chairs) chair.node.position.z = chair.z + Math.max(0, ...actors.filter(a => a.chairSeat === index).map(a => a.chairPull));
      if (this.cameraGoal) {
        const a = 1 - Math.exp(-dt * (this.reduced.matches ? 100 : 5)), goal = this.cameraGoal;
        const subject = this.actors.get(goal.actorId); if (subject) goal.target.copy(subject.group.position).y = .95;
        this.controls.target.lerp(goal.target, a); this.camera.position.lerp(goal.target.clone().add(goal.offset), a);
        this.camera.zoom = THREE.MathUtils.lerp(this.camera.zoom, goal.zoom, a); this.camera.updateProjectionMatrix(); this.controls.update();
      }
      const viewDirection = this.camera.position.clone().sub(this.controls.target).toArray();
      for (const wall of this.walls || []) wall.visible = officeWallVisible(wall.userData.wallSide, viewDirection);
      for (const [index, screen] of this.screens) { const id = this.game.seats[index], task = active.find(t => this.game.assignments[t.id] === id); paintScreen(screen, task, task ? this.game.progress[task.id] : 0, this.game.stage); }
      if (this.arcade) paintScreen(this.arcade, null, 0, this.game.stage);
      this.labels();
      if (this.container.clientWidth && this.container.clientHeight) this.renderer.render(this.scene, this.camera);
      const busy = !this.ready || !!this.loadingActors.size || actors.some(a => a.moving);
      this.container.dataset.moving = String(busy);
      if (busy !== this.busy) { this.busy = busy; queueMicrotask(() => { if (this.busy === busy) this.callbacks.onBusy(busy); }); }
    }
    this.frameId = requestAnimationFrame(next => this.frame(next));
  }
  labels() {
    const parent = this.container.closest('.office-room');
    for (const [i, d] of DESKS.entries()) {
      const button = parent.querySelector(`[data-action="office-desk"][data-id="${i}"]`); if (!button) continue;
      this.projected.set(d.seat[0], .35, d.seat[1] + .5).project(this.camera);
      button.style.setProperty('--desk-x', `${(this.projected.x * .5 + .5) * 100}%`);
      button.style.setProperty('--desk-y', `${(-this.projected.y * .5 + .5) * 100}%`);
      const actor = this.actors.get(this.game.seats[i]);
      button.dataset.motion = actor?.moving ? actor.state : actor?.sit > .98 ? 'seated' : 'empty';
      const text = button.querySelector('small');
      if (text) {
        if (!button.dataset.restStatus) { button.dataset.restStatus = text.textContent; button.dataset.restLabel = button.getAttribute('aria-label'); }
        const status = actor?.moving ? actor.motionLabel : button.dataset.restStatus;
        if (text.textContent !== status) text.textContent = status;
        const label = actor?.moving ? `Компьютер ${i + 1}: ${agentById(actor.id).name}, ${actor.motionLabel.toLowerCase()}` : button.dataset.restLabel;
        if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      }
    }
    const info = parent.querySelector('.office-movement');
    const walking = [...this.actors.values()].filter(a => a.moving).map(a => agentById(a.id).name);
    if (info) { const text = walking.length ? `${walking.join(', ')} — в пути` : ''; if (info.textContent !== text) info.textContent = text; }
  }
  pick(event) {
    if (!this.down || Math.hypot(event.clientX - this.down[0], event.clientY - this.down[1]) > 6 || !this.room) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([this.room, ...[...this.actors.values()].map(a => a.group)], true);
    const hit = hits[0]; if (!hit) return;
    let object = hit.object;
    while (object) {
      if (object.userData.agentId) { this.callbacks.onActor(object.userData.agentId); return; }
      if (Number.isInteger(object.userData.deskIndex)) { this.callbacks.onDesk(object.userData.deskIndex); return; }
      object = object.parent;
    }
    if (hit.point.y < .08 && this.selected) this.callbacks.onFloor([hit.point.x, hit.point.z]);
  }
  cameraAction(action) {
    if (action === 'in' || action === 'out') {
      this.cameraGoal = null;
      this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * (action === 'in' ? 1.2 : 1/1.2), this.controls.minZoom, this.controls.maxZoom);
      this.camera.updateProjectionMatrix(); return;
    }
    if (action === 'focus') {
      const actor = this.actors.get(this.selected) || this.actors.values().next().value;
      if (!actor) return;
      this.cameraGoal = { target: actor.group.position.clone().add(new THREE.Vector3(0, .95, 0)), offset: new THREE.Vector3(6,4,-3), zoom: 2.7, actorId: actor.id }; return;
    }
    this.cameraGoal = null;
    if (action === 'reset') { this.controls.target.set(0,1.3,0); this.camera.position.set(11, 10.5, 13); this.camera.zoom = 1; }
    else {
      const offset = this.camera.position.clone().sub(this.controls.target), spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta += action === 'left' ? -.3 : .3;
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    }
    this.camera.updateProjectionMatrix(); this.controls.update(); this.resize();
  }
  reset() { for (const a of this.actors.values()) this.scene.remove(a.group); this.actors.clear(); this.initialTeam = null; this.busy = false; }
  detach() { this.container = null; this.resizeObserver.disconnect(); if (this.frameId) cancelAnimationFrame(this.frameId); this.frameId = 0; }
}

export function mountOfficeWorld(game, selected, callbacks) {
  const container = document.querySelector('#office-webgl'); if (!container) return;
  try { if (!world) world = new OfficeWorld(callbacks); world.attach(container, game, selected, callbacks); }
  catch (error) {
    container.parentElement.dataset.officeState = 'fallback';
    const status = container.parentElement.querySelector('.office-render-status'); if (status) status.textContent = '3D недоступно в этом браузере. Показан облегчённый офис.';
    console.warn('Office WebGL:', error.message);
    for (const id of game.team) {
      const phase = game.life?.members[id]?.restTrip?.phase;
      if (phase === 'outbound' || phase === 'returning') queueMicrotask(()=>callbacks.onRest?.(id,phase === 'outbound' ? 'resting' : 'back'));
    }
  }
}
export const detachOfficeWorld = () => world?.detach();
export const resetOfficeWorld = () => world?.reset();
export const officeCamera = action => world?.cameraAction(action);
export const canWalkTo = (id, point) => world?.actors.get(id)?.canReach(point) ?? false;
