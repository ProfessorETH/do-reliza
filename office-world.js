import { settleCoffeeFallback } from './assets/coffee-trip.js';
import { reactionForChanges, planInspection } from './assets/character-reactions.js';
import { sceneActions } from './assets/scene-feedback.js';
import { placeSpeechElement } from './assets/office-speech.js';
import { placeFeedback } from './assets/scene-feedback.js';
import { mountSceneClock } from './assets/scene-clock.js';
import { mountStudioExpansion, mountStudioSurroundings } from './assets/studio-expansion.js';
import { clone as cloneSkeleton } from './vendor/three/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt/meshopt_decoder.mjs';
import { OrbitControls } from './vendor/three/controls/OrbitControls.js';
import { OfficeActor } from './office-actors.js?v=portrait-team-v4-20261024';
import { ALL_DESKS as DESKS, LOUNGE_SEAT, distance } from './office-layout.js?v=shift-ux-20261024-v2';
import { agentById, activeTasks } from './engine.js?v=shift-ux-20261024-v2';
import { makeScreen, paintScreen } from './office-screens.js';
import { createOfficeAtmosphere } from './assets/office-atmosphere.js?v=3-workspace';
import { mountOfficeUpgrades } from './assets/office-upgrades.js?v=office-life-1';
import { prepareLoungeSeat } from './assets/lounge-seat.js?v=seated-breaks-1';
import { officeFrame, officeWallVisible } from './office-camera-fit.js';
import { assetURL } from './asset-url.js';

let world;
const modelCache = new Map();
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const loadModel = name => {
  if (!modelCache.has(name)) modelCache.set(name, loader.loadAsync(assetURL(`models/${name}.glb?v=body-team-v5-20261025`)).catch(error => { modelCache.delete(name); throw error; }));
  return modelCache.get(name);
};

class OfficeWorld {
  constructor(callbacks) {
    this.callbacks = callbacks; this.actors = new Map(); this.loadingActors = new Set(); this.screens = new Map(); this.chairs = new Map(); this.selected = null; this.busy = false;
    this.restSignals = new Set();
    this.scene = new THREE.Scene();
    this.selectionRing=new THREE.Mesh(new THREE.RingGeometry(.38,.48,48),new THREE.MeshBasicMaterial({color:0xe7bd80,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));
    this.selectionRing.rotation.x=-Math.PI/2;this.selectionRing.visible=false;this.scene.add(this.selectionRing);
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
    this.controls.minZoom = .5; this.controls.maxZoom = 3; this.controls.update();
    this.controls.addEventListener('start', () => { this.cameraGoal = null; });
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.projected = new THREE.Vector3();
    this.art = createOfficeAtmosphere(this.scene, this.renderer);
    this.surroundings=mountStudioSurroundings(this.scene);
    this.neighborhood=this.scene.getObjectByName('EveningNeighborhood');
    this.neighborhood.visible=false;
    this.keys = new Set();
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.removeAttribute('aria-hidden');
    this.renderer.domElement.setAttribute('aria-label','3D-офис. Тяни для поворота. В режиме полёта: W A S D — движение, Q E — высота, Escape — выход.');
    this.renderer.domElement.addEventListener('keydown', e => { if (this.flying && ['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE'].includes(e.code)) { e.preventDefault(); this.keys.add(e.code); } if(e.key==='Escape'&&this.flying){e.stopPropagation();this.cameraAction('flight-off');} });
    this.renderer.domElement.addEventListener('keyup', e => this.keys.delete(e.code));
    this.renderer.domElement.addEventListener('blur', () => this.keys.clear());
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
      this.expansion = mountStudioExpansion(this.room);
      this.expansion.sync(this.game?.life?.upgrades);
      const arcade=this.room.getObjectByName('Release3D_Arcade'); if(arcade)arcade.userData.hotspot='arcade';
      this.room.traverse(node => {
        if (node.userData.wallSide) { if (!this.walls) this.walls = []; this.walls.push(node); }
        if (Number.isInteger(node.userData.chairIndex)) this.chairs.set(node.userData.chairIndex, { node, z: node.position.z });
        if (node.isMesh) {
          node.castShadow = !/_Static_Room_(floor|rug)$/.test(node.name); node.receiveShadow = true;
          if (Number.isInteger(node.userData.screenIndex)) this.screens.set(node.userData.screenIndex, makeScreen(node));
          if (node.name === 'Release3D_ArcadeScreen') this.arcade = makeScreen(node, true);
        }
      });
      await this.art.dress(this.room);
      this.sceneClock = mountSceneClock(this.room);
      this.purchases = await mountOfficeUpgrades(this.room);
      this.purchases.sync(this.game?.life?.upgrades);
      this.expansion.sync(this.game?.life?.upgrades);
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
    this.expansion?.sync(game.life?.upgrades);
    if(this.cameraCapacity!==game.seats.length){const center=game.seats.length>3?2:0,delta=center-this.controls.target.x;this.controls.target.x=center;this.camera.position.x+=delta;this.cameraCapacity=game.seats.length;}
    container.append(this.renderer.domElement); this.resizeObserver.disconnect(); this.resizeObserver.observe(container);
    this.refreshContainer(); this.resize(); this.syncActors();
    if (!this.frameId) { this.lastFrame = performance.now(); this.frameId = requestAnimationFrame(time => this.frame(time)); }
  }
  refreshContainer() {
    if (!this.container) return;
    const parent = this.container.closest('.office-room'); parent.classList.toggle('is-3d', !!this.ready && !this.failed);
    parent.dataset.officeState = this.failed ? 'fallback' : this.ready ? 'ready' : 'loading';
    const status = parent.querySelector('.office-render-status');
    const flyButton=parent.querySelector('[data-action="office-camera"][data-id="flight"]');if(flyButton){flyButton.setAttribute('aria-pressed',String(!!this.flying));flyButton.textContent=this.flying?'Стоп':'WASD';}
    if (status) status.textContent = this.failed || (this.ready ? this.flying ? 'Полёт: W A S D · Q / E — высота · тяни — осмотр · Esc — выход' : window.matchMedia('(pointer:coarse)').matches ? 'Тяни — поворот · два пальца — масштаб и сдвиг' : 'Тяни — поворот · колесо — масштаб · правая кнопка — сдвиг' : 'Загружаем 3D-студию…');
  }
  fail(message) { this.failed = message; this.refreshContainer(); this.callbacks.onBusy(false); this.callbacks.onError?.(message); this.reportRest(true);settleCoffeeFallback(this.game,this.callbacks.onCoffee); }
  resize() {
    if (!this.container?.isConnected) return;
    const w = this.container.clientWidth, h = this.container.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const ratio = w / h, halfH = officeFrame(ratio, this.camera.position.clone().sub(this.controls.target).toArray(),1.07,this.game?.seats.length>3?7.2:5.2);
    this.camera.left = -halfH * ratio; this.camera.right = halfH * ratio; this.camera.top = halfH; this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    if (this.ready) this.renderer.render(this.scene, this.camera);
  }
  async syncActors() {
    if (this.failed) { this.reportRest(true);settleCoffeeFallback(this.game,this.callbacks.onCoffee); return; }
    if (!this.ready || !this.game) return;
    // Start the selected team's downloads together. Installation stays ordered;
    // cached promises prevent duplicate transfers during intermediate renders.
    for(const id of this.game.team)if(!this.actors.has(id))void loadModel(id).catch(()=>{});
    for (const [id, actor] of this.actors) if (!this.game.team.includes(id)) { actor.speechMouth?.dispose(); this.scene.remove(actor.group); this.actors.delete(id); }
    for (const [order, id] of this.game.team.entries()) {
      let actor = this.actors.get(id);
      if (actor) { actor.order = order; actor.destination(this.game); continue; }
      if (this.loadingActors.has(id)) continue;
      this.loadingActors.add(id);
      try {
        const model = cloneSkeleton((await loadModel(id)).scene);
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
  reportCoffee(){
    for(const id of this.game.team){
      const trip=this.game.life.members[id].coffeeTrip,actor=this.actors.get(id);if(!trip||!actor)continue;
      const arrival=trip.phase==='outbound'&&['coffee-pick','coffee-drink'].includes(actor.state)?'station':trip.phase==='drinking'&&actor.state==='coffee-put'?'drank':trip.phase==='returning'&&actor.state==='seated'?'back':null;
      if(!arrival)continue;
      const source=this.game;queueMicrotask(()=>this.callbacks.onCoffee?.(id,arrival,source));
    }
  }
  frame(time) {
    this.frameId = 0;
    if (!this.container?.isConnected || !this.game || this.failed) return;
    const dt = Math.min(.05, (time - this.lastFrame) / 1000); this.lastFrame = time;
    if (!document.hidden) {
      this.fly(dt);
      this.controls.update();
      const active = activeTasks(this.game), actors = [...this.actors.values()];
      this.consumedActions ||= new Set();
      const actions=sceneActions(this.game),actionKeys=new Set(actions.map(a=>a.key));
      for(const key of this.consumedActions)if(!actionKeys.has(key))this.consumedActions.delete(key);
      for(const action of actions){
        if(this.consumedActions.has(action.key))continue;
        if(['person','reaction'].includes(action.type)){
          const actor=this.actors.get(action.id);if(!actor)continue;
          actor.react(action.type==='reaction'?action.reaction:reactionForChanges(action.changes));this.consumedActions.add(action.key);
        }else if(action.type==='purchase'&&['hire','plan','result'].includes(this.game.stage)){
          const visits=planInspection(this.game,action.id,actors);
          if(visits.length){for(const visit of visits)this.actors.get(visit.id).inspect({...visit,key:action.key},this.game);this.consumedActions.add(action.key);}
        }else if(action.type==='purchase')this.consumedActions.add(action.key);
      }
      const speech=this.callbacks.getSpeech?.();
      for (const actor of actors) actor.update(dt, time / 1000, actors, { speaking:speech?.id===actor.id, listening:speech?.listenerId===actor.id, speechLevel:speech?.level||0, speechTarget:this.actors.get(speech?.id===actor.id?speech?.listenerId:speech?.id)?.point, stage: this.game.stage, eventParticipant:this.game.currentEvent!=='life'||this.game.life?.incident?.id===actor.id, incident:this.game.currentEvent==='life'&&this.game.life?.incident?.id===actor.id?this.game.life.incident.type:null, task: active.find(t => this.game.assignments[t.id] === actor.id) }, this.reduced.matches, this.selected === actor.id);
      const selectedActor=this.actors.get(this.selected);
      this.selectionRing.visible=!!selectedActor;
      if(selectedActor)this.selectionRing.position.set(selectedActor.group.position.x,.035,selectedActor.group.position.z);
      this.container.dataset.selectedAgent=this.selected||'';
      this.reportRest();this.reportCoffee();
      this.container.dataset.coffee=actors.filter(a=>a.coffeePhase&&a.coffeePhase!=='queued').map(a=>a.id+':'+a.state).join(',');
      const stationCup=this.room?.getObjectByName('CoffeeStationCup');if(stationCup)stationCup.visible=!actors.some(a=>a.cup.visible);
      this.container.dataset.reactions=actors.filter(a=>a.reaction).map(a=>a.id+':'+a.reaction.kind).join(',');
      this.container.dataset.visiting=actors.filter(a=>a.visit).map(a=>a.id+':'+a.visit.phase).join(',');
      this.container.dataset.inspecting=actors.filter(a=>a.state==='inspect').map(a=>a.id).join(',');
      this.container.dataset.resting = actors.filter(a => a.state === 'resting').map(a=>a.id).join(',');
      this.loungeSeat?.update(Math.max(0,...actors.map(a=>(a.loungeBlend||0)*a.sit)));
      this.container.dataset.upgrades = (this.game.life?.upgrades || []).join(',');
      for (const [index, chair] of this.chairs) chair.node.position.z = chair.z + Math.max(0, ...actors.filter(a => a.chairSeat === index).map(a => a.chairPull));
      if(this.cameraGoal?.autoReturnAt && time>=this.cameraGoal.autoReturnAt)this.cameraAction('reset');
      if (this.cameraGoal) {
        const a = 1 - Math.exp(-dt * (this.reduced.matches ? 100 : 5)), goal = this.cameraGoal;
        const subject = this.actors.get(goal.actorId); if (subject) goal.target.copy(subject.group.position).y = .95;
        this.controls.target.lerp(goal.target, a); this.camera.position.lerp(goal.target.clone().add(goal.offset), a);
        this.camera.zoom = THREE.MathUtils.lerp(this.camera.zoom, goal.zoom, a); this.camera.updateProjectionMatrix(); this.controls.update();
      }
      const viewDirection = this.camera.position.clone().sub(this.controls.target).toArray();
      for (const wall of this.walls || []) wall.visible = officeWallVisible(wall.userData.wallSide, viewDirection);
      for (const [index, screen] of this.screens) { const id = this.game.seats[index], task = active.find(t => this.game.assignments[t.id] === id); paintScreen(screen, task, task ? this.game.progress[task.id] : 0, this.game.stage); }
      this.sceneClock?.update(this.game);
      const daylight=this.art.update(this.game,dt);this.surroundings.update(daylight);
      this.container.dataset.daylight=daylight.phase;
      if (this.arcade) paintScreen(this.arcade, null, 0, this.game.stage);
      this.labels();
      if (this.container.clientWidth && this.container.clientHeight) this.renderer.render(this.scene, this.camera);
      const busy = !this.ready || !!this.loadingActors.size || actors.some(a => a.moving&&!a.visit);
      this.container.dataset.moving = String(busy);
      if (busy !== this.busy) { this.busy = busy; queueMicrotask(() => { if (this.busy === busy) this.callbacks.onBusy(busy); }); }
    }
    this.frameId = requestAnimationFrame(next => this.frame(next));
  }
  labels() {
    const parent = this.container.closest('.office-room');
    const viewRect=this.container.getBoundingClientRect(),roomRect=parent.getBoundingClientRect();
    const point=()=>({x:viewRect.left-roomRect.left+(this.projected.x*.5+.5)*viewRect.width,y:viewRect.top-roomRect.top+(-this.projected.y*.5+.5)*viewRect.height});
    const balloon=parent.querySelector('[data-office-speech]'),speaker=this.actors.get(balloon?.dataset.officeSpeech);
    if(balloon&&speaker){
      speaker.joints.Head.getWorldPosition(this.projected);this.projected.y+=.22;this.projected.project(this.camera);
      const location=point();location.offscreen=Math.abs(this.projected.x)>1||Math.abs(this.projected.y)>1||Math.abs(this.projected.z)>1;
      placeSpeechElement(balloon,location,parent);
    }
    this.feedbackHighlights ||= new Map();
    const feedback=[...parent.querySelectorAll('[data-scene-feedback]')];
    const activeKeys=new Set(feedback.map(el=>el.dataset.sceneFeedback));
    for(const [key,entry] of this.feedbackHighlights)if(!activeKeys.has(key)){
      this.scene.remove(entry.helper);entry.helper.geometry.dispose();entry.helper.material.dispose();this.feedbackHighlights.delete(key);
    }
    const placements=[];
    for(const el of feedback){
      const key=el.dataset.sceneFeedback,actor=this.actors.get(el.dataset.feedbackActor);
      let point;
      if(actor)point=actor.group.position.clone().add(new THREE.Vector3(0,actor.sit>.5?1.9:2.35,0));
      if(el.dataset.feedbackUpgrade){
        let entry=this.feedbackHighlights.get(key);
        if(!entry){
          const id=el.dataset.feedbackUpgrade;
          const object=id==='coffee'?this.room.getObjectByName('CoffeeStation'):id==='desk4'?this.expansion.desks[0]:id==='desk5'?this.expansion.desks[1]:this.purchases.groups.get(id);
          if(object){
            this.room.updateMatrixWorld(true);
            const box=new THREE.Box3().setFromObject(object).expandByScalar(.08);
            if(!box.isEmpty()){
              const helper=new THREE.Box3Helper(box,0xe9c78f);helper.material.transparent=true;helper.material.opacity=.65;helper.userData.feedbackDecoration=true;this.scene.add(helper);
              const center=box.getCenter(new THREE.Vector3());
              entry={helper,point:center.clone().setY(box.max.y+.3)};this.feedbackHighlights.set(key,entry);
              if(!this.flying)this.cameraGoal={target:center,offset:new THREE.Vector3(7,5,8),zoom:['quiet','computers'].includes(id)?1.4:1.8,autoReturnAt:performance.now()+7000};
            }
          }
        }
        if(entry){point=entry.point;entry.helper.material.opacity=this.reduced.matches ? .65 :.55+Math.sin(performance.now()/280)*.2;}
      }
      if(!point)continue;
      this.projected.copy(point).project(this.camera);
      const room=parent.getBoundingClientRect(),canvas=this.container.getBoundingClientRect(),half=el.offsetWidth/2;
      placements.push({el,x:canvas.left-room.left+(this.projected.x*.5+.5)*canvas.width,y:canvas.top-room.top+(-this.projected.y*.5+.5)*canvas.height,width:el.offsetWidth,height:el.offsetHeight});
    }
    const offsetX=viewRect.left-roomRect.left,offsetY=viewRect.top-roomRect.top;
    const local=placements.map(p=>({...p,x:p.x-offsetX,y:p.y-offsetY}));
    placeFeedback(local,viewRect.width,viewRect.height).forEach((pos,i)=>{
      pos={...pos,x:pos.x+offsetX,y:pos.y+offsetY};
      const item=placements[i];item.el.style.left=(pos.x+pos.width/2)+'px';item.el.style.top=(pos.y+pos.height)+'px';
      const line=item.el.querySelector('.feedback-link line');
      if(line){for(const [key,value] of Object.entries({x1:pos.width/2,y1:pos.height,x2:item.x-pos.x,y2:item.y-pos.y}))line.setAttribute(key,value);}
    });

    for (const [i, d] of DESKS.entries()) {
      const button = parent.querySelector(`[data-action="office-desk"][data-id="${i}"]`); if (!button) continue;
      this.projected.set(d.seat[0], .35, d.seat[1] + .5).project(this.camera);
      const screen=point();
      button.style.setProperty('--desk-x', `${screen.x}px`);
      button.style.setProperty('--desk-y', `${screen.y}px`);
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
    const signal=parent.querySelector('[data-event-actor]'), subject=this.actors.get(signal?.dataset.eventActor);
    if(signal&&subject){
      this.projected.copy(subject.group.position).add(new THREE.Vector3(0,subject.sit>.5?1.85:2.25,0)).project(this.camera);
      const rect=this.container.getBoundingClientRect(),room=parent.getBoundingClientRect(),half=signal.offsetWidth/2;
      signal.style.left=Math.max(half+8,Math.min(room.width-half-8,rect.left-room.left+(this.projected.x*.5+.5)*rect.width))+'px';
      signal.style.top=Math.max(70,Math.min(room.height-100,rect.top-room.top+(-this.projected.y*.5+.5)*rect.height))+'px';
    }
    const menu=parent.querySelector('.actor-actions'), actor=this.actors.get(this.selected);
    if(menu&&actor){
      this.projected.copy(actor.group.position).add(new THREE.Vector3(0,actor.sit>.5?1.5:2.1,0)).project(this.camera);
      const screen=point(),width=menu.offsetWidth;
      menu.style.left=Math.max(width/2+8,Math.min(roomRect.width-width/2-8,screen.x))+'px';
      menu.style.top=Math.max(10,Math.min(viewRect.bottom-roomRect.top-menu.offsetHeight-10,screen.y-menu.offsetHeight-12))+'px';
    }
    for(const el of parent.querySelectorAll('[data-hotspot]')){
      const points={coffee:[-1,1.5,-3.4],arcade:[3.85,2,-3.38],office:[-3.68,1.1,2.77]};
      this.projected.fromArray(points[el.dataset.hotspot]).project(this.camera);
      const screen=point();el.style.left=screen.x+'px';el.style.top=screen.y+'px';
    }
    const info = parent.querySelector('.office-movement');
    const walking = [...this.actors.values()].filter(a => a.moving).map(a => agentById(a.id).name);
    if (info) { const text = walking.length ? `${walking.join(', ')} — в пути` : ''; if (info.textContent !== text) info.textContent = text; }
    const shell = parent.closest('.game-shell');
    for (const actor of this.actors.values()) {
      const statuses = shell?.querySelectorAll(`[data-team-activity="${actor.id}"],[data-employee-activity="${actor.id}"]`);
      for(const status of statuses||[]){const text=actor.moving?actor.motionLabel:status.dataset.baseActivity;if(status.textContent!==text)status.textContent=text;}
    }
  }
  pick(event) {
    if (!this.down || Math.hypot(event.clientX - this.down[0], event.clientY - this.down[1]) > 6 || !this.room) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([this.room, ...[...this.actors.values()].map(a => a.group)], true);
    const hit = hits.find(h=>{let n=h.object;while(n){if(!n.visible)return false;n=n.parent;}return true;}); if (!hit) return;
    let object = hit.object;
    while (object) {
      if (object.userData.hotspot) { this.callbacks.onObject?.(object.userData.hotspot); return; }
      if (object.userData.agentId) { this.callbacks.onActor(object.userData.agentId); return; }
      if (Number.isInteger(object.userData.deskIndex)) { this.callbacks.onDesk(object.userData.deskIndex); return; }
      object = object.parent;
    }
    if (hit.point.y < .08 && this.selected) this.callbacks.onFloor([hit.point.x, hit.point.z]);
  }
  fly(dt) {
    if(!this.flying||!this.keys.size)return;
    const forward=this.controls.target.clone().sub(this.camera.position);forward.y=0;forward.normalize();
    const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0));
    const delta=new THREE.Vector3().addScaledVector(forward,(this.keys.has('KeyW')-this.keys.has('KeyS'))*dt*5).addScaledVector(right,(this.keys.has('KeyD')-this.keys.has('KeyA'))*dt*5);
    delta.y=THREE.MathUtils.clamp(this.camera.position.y+(this.keys.has('KeyE')-this.keys.has('KeyQ'))*dt*4,.7,25)-this.camera.position.y;
    if(this.controls.target.clone().add(delta).length()>22)return;
    this.controls.target.add(delta);this.camera.position.add(delta);
  }
  cameraAction(action) {
    if(this.neighborhood&&['flight','flight-off'].includes(action))this.neighborhood.visible=action==='flight'&&!this.flying;
    if(this.neighborhood&&action==='reset')this.neighborhood.visible=false;
    if(action==='flight'||action==='flight-off'){this.flying=action==='flight'&&!this.flying;this.keys.clear();this.cameraGoal=null;this.controls.minPolarAngle=this.flying ? .1 : .45;this.controls.maxPolarAngle=this.flying?1.5:1.28;this.refreshContainer();if(this.flying)this.renderer.domElement.focus({preventScroll:true});return;}
    if(['forward','back','up','down'].includes(action)){this.cameraGoal=null;const vector=this.controls.target.clone().sub(this.camera.position);vector.y=0;vector.normalize().multiplyScalar(action==='forward'?1:-1);if(action==='up'||action==='down')vector.set(0,action==='up'?1:-1,0);vector.y=THREE.MathUtils.clamp(this.camera.position.y+vector.y,.7,25)-this.camera.position.y;if(this.controls.target.clone().add(vector).length()<22){this.camera.position.add(vector);this.controls.target.add(vector);}this.controls.update();return;}
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
    if (action === 'reset') { this.flying=false;this.keys.clear();this.controls.minPolarAngle=.45;this.controls.maxPolarAngle=1.28;this.refreshContainer(); const center=this.game.seats.length>3?2:0;this.controls.target.set(center,1.3,0); this.camera.position.set(11+center, 10.5, 13); this.camera.zoom = 1; }
    else {
      const offset = this.camera.position.clone().sub(this.controls.target), spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta += action === 'left' ? -.3 : .3;
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    }
    this.camera.updateProjectionMatrix(); this.controls.update(); this.resize();
  }
  reset() { for (const a of this.actors.values()) {a.speechMouth?.dispose();this.scene.remove(a.group);} this.actors.clear(); this.initialTeam = null; this.busy = false; }
  detach() { this.keys.clear(); this.container = null; this.resizeObserver.disconnect(); if (this.frameId) cancelAnimationFrame(this.frameId); this.frameId = 0; }
}

export function mountOfficeWorld(game, selected, callbacks) {
  const container = document.querySelector('#office-webgl'); if (!container) return;
  try { if (!world) world = new OfficeWorld(callbacks); world.attach(container, game, selected, callbacks); }
  catch (error) {
    container.parentElement.dataset.officeState = 'fallback';
    const status = container.parentElement.querySelector('.office-render-status'); if (status) status.textContent = '3D недоступно в этом браузере. Показан облегчённый офис.';
    callbacks.onBusy(false);settleCoffeeFallback(game,callbacks.onCoffee);
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
