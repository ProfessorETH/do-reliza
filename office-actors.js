import { COFFEE_TIMING, coffeeMotion } from './assets/coffee-trip.js';
import { REACTION_SECONDS } from './assets/character-reactions.js';
import { bindOfficeSkin } from './office-skeleton.js?v=0.6.0';
import * as THREE from './vendor/three/three.module.js';
import { ALL_DESKS as DESKS, ENTRANCE, WAITING, LOUNGE_SEAT, COFFEE_STATION, findOfficePath, isWalkable, distance } from './office-layout.js?v=shift-ux-20261024-v2';
import { poseActor } from './office-pose.js?v=portrait-team-v4-20261024';

const { damp, lerp, clamp } = THREE.MathUtils;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const angle = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const approach = index => [DESKS[index].seat[0] + .72, DESKS[index].seat[1] + .4];

export class OfficeActor {
  constructor(id, model, color, order) {
    this.id = id; this.order = order; this.group = new THREE.Group(); this.group.userData.agentId = id;
    this.group.add(model); this.group.position.set(ENTRANCE[0], 0, ENTRANCE[1]); this.joints = {};
    model.traverse(node => {
      if (node.name.startsWith(`Release3D_${id}_`)) this.joints[node.name.slice(`Release3D_${id}_`.length)] = node;
      if (node.name.startsWith(`Team3D_${id}_`)) this.joints[node.name.slice(`Team3D_${id}_`.length)] = node;
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    this.portraitHead=model.getObjectByName(`DR_${id}_PortraitHead`)||null;
    this.skinBindings=bindOfficeSkin(model,this.joints);
    this.group.updateMatrixWorld(true); this.soles = {}; this.footMeshes={}; this.eyeMeshes={};
    for (const side of ['Left','Right']) {
      const foot = this.joints[side+'Foot'], inverse = foot.matrixWorld.clone().invert(), points = [];
      const footMesh=model.getObjectByName(`DR_${id}_${side}Foot_Rigid`)||foot;
      this.footMeshes[side]=footMesh;this.eyeMeshes[side]=model.getObjectByName(`DR_${id}_Eye${side}_Rigid`);
      footMesh.traverse(node => {
        if (!node.isMesh) return;
        const matrix = inverse.clone().multiply(node.matrixWorld), positions = node.geometry.attributes.position;
        for (let i=0;i<positions.count;i++) { const p = new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix); points.push(p.y,p.z); }
      }); this.soles[side] = points;
    }
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(.10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .3, roughness: .5 }));
    this.marker.position.y = 2.18; this.marker.scale.y = 1.6; this.marker.visible = false; this.group.add(this.marker);
    this.path = []; this.sit = 0; this.phase = order * .31; this.gait = 0; this.speed = 0;
    this.signature = ''; this.seat = -1; this.chairSeat = -1; this.chairPull = 0;
    this.state = 'idle'; this.stateTime = 0; this.workBlend = 0; this.eventBlend = 0; this.mouseBlend = 0; this.reactionTime = 100;
    this.cup=new THREE.Group();this.cup.name='CoffeeCup_'+id;this.cup.visible=false;this.group.add(this.cup);
    const porcelain=new THREE.MeshStandardMaterial({color:'#f0dfbc',roughness:.45});
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.058,.046,.125,20),porcelain);this.cup.add(body);
    const handle=new THREE.Mesh(new THREE.TorusGeometry(.038,.012,8,16),porcelain);handle.rotation.y=Math.PI/2;handle.position.x=.068;this.cup.add(handle);
    const drink=new THREE.Mesh(new THREE.CircleGeometry(.05,20),new THREE.MeshStandardMaterial({color:'#48352a',roughness:.7}));drink.rotation.x=-Math.PI/2;drink.position.y=.063;this.cup.add(drink);
    this.activity = { stage: 'hire' , task: null }; this.selected = false; this.failed = false;
  }
  get point() { return [this.group.position.x, this.group.position.z]; }
  soleHeight(side, pitch) {
    const points=this.soles[side], c=Math.cos(pitch), s=Math.sin(pitch); let min=Infinity;
    for(let i=0;i<points.length;i+=2) min=Math.min(min,points[i]*c-points[i+1]*s);
    return -min;
  }
  get moving() { return !['idle', 'seated', 'resting'].includes(this.state); }
  get motionLabel() { if(this.coffeePhase&&this.coffeePhase!=='queued')return this.coffeePhase==='returning'?'Возвращается с кофейной станции':this.state==='coffee-drink'?'Пьёт напиток':this.state==='coffee-pick'?'Берёт чашку':'Идёт за напитком'; if(this.visit&&this.visit.phase!=='pending')return this.state==='inspect'?'Осматривает: '+this.visit.label:this.visit.phase==='returning'?'Возвращается на своё место':'Идёт посмотреть: '+this.visit.label; return ({ walk: this.restPhase === 'outbound' ? 'Идёт в зону отдыха' : this.restPhase === 'returning' ? 'Возвращается за компьютер' : 'Идёт к компьютеру', 'rest-align':'Подходит к креслу', 'rest-lower':'Устраивается в кресле', 'rest-rise':'Встаёт после отдыха', 'rest-exit':'Возвращается к работе', align: 'Подходит к креслу', lower: 'Садится', slide: 'Придвигается к столу', rise: 'Встаёт', exit: 'Выходит из-за стола', pullout: 'Отодвигает кресло' })[this.state] || ''; }
  transition(state) { this.state = state; this.stateTime = 0; this.stateStart = this.point; }
  react(kind){this.reaction={kind,time:0};}
  inspect(visit,game){if(this.visit||game.life.members[this.id]?.restTrip)return;this.visit={...visit,phase:'pending',time:0,seat:game.seats.indexOf(this.id)};this.game=game;}
  destination(game, instant = false) {
    this.game=game;
    if(this.visit&&(game.life.members[this.id]?.restTrip||game.life.members[this.id]?.coffeeTrip||!['hire','plan','result'].includes(game.stage)||this.visit.seat!==game.seats.indexOf(this.id)))this.visit=null;
    this.capacity = game.seats.length;
    const m = game.life?.members[this.id], trip = m?.restTrip, resting = ['outbound','resting'].includes(trip?.phase);
    this.restPhase = trip?.phase || null; this.loungeTarget = resting;
    this.coffeePhase=m?.coffeeTrip?.phase||null;
    const serving=['outbound','drinking'].includes(this.coffeePhase);
    const visiting=['outbound','looking'].includes(this.visit?.phase);
    const seat = resting||visiting||serving ? -1 : game.seats.indexOf(this.id), point = serving?COFFEE_STATION.point:visiting?this.visit.point:resting ? LOUNGE_SEAT.point : seat >= 0 ? DESKS[seat].seat : game.officeTargets[this.id] || WAITING[this.order % WAITING.length];
    const signature = `${seat}:${point.join(',')}:${serving?'coffee:'+m.coffeeTrip.request:resting ? m.restSerial : visiting?'visit:'+this.visit.key:'desk'}`;
    if (signature === this.signature) return;
    this.signature = signature; this.seat = seat; this.goal = [...point]; this.failed = false;
    if (instant) {
      this.group.position.set(point[0], 0, point[1]); this.sit = resting || seat >= 0 ? 1 : 0; this.path = []; this.loungeBlend = resting ? 1 : 0;
      this.restBlend = resting ? 1 : 0;
      this.chairSeat = seat; this.chairPull = 0; this.group.rotation.y = serving?Math.atan2(point[0]-COFFEE_STATION.look[0],point[1]-COFFEE_STATION.look[1]):resting ? LOUNGE_SEAT.yaw : seat >= 0 ? 0 : Math.PI; this.transition(serving?'coffee-pick':resting ? 'resting' : seat >= 0 ? 'seated' : 'idle');
    } else if (this.loungeBlend > 0) {
      this.riseStart = this.sit; this.transition('rest-rise');
    } else if (this.sit > .01 || ['lower', 'slide', 'align'].includes(this.state)) {
      this.speed = 0; this.riseStart = this.sit; this.transition(this.sit > .8 ? 'pullout' : 'rise');
    } else if (!['pullout', 'rise', 'exit','coffee-put'].includes(this.state)) this.route();
  }
  route() {
    const target = this.loungeTarget ? LOUNGE_SEAT.approach : this.seat >= 0 ? approach(this.seat) : this.goal;
    this.path = findOfficePath(this.point, target, true, this.capacity) || [];
    this.failed = !this.path.length && distance(this.point, target) > .05;
    if(this.failed&&this.visit){this.visit=null;this.signature='';this.destination(this.game);return;}
    this.transition(this.failed ? 'idle' : this.path.length ? 'walk' : this.loungeTarget ? 'rest-align' : this.seat >= 0 ? 'align' : ['outbound','drinking'].includes(this.coffeePhase)?'coffee-pick':this.visit?.phase==='outbound'?'inspect':'idle');
    if (this.state === 'align') this.chairSeat = this.seat;
  }
  canReach(point) { return findOfficePath(this.chairSeat >= 0 ? approach(this.chairSeat) : this.point, point, true, this.capacity) !== null; }
  place(a, b, amount) { const t = smooth(amount); this.group.position.x = lerp(a[0], b[0], t); this.group.position.z = lerp(a[1], b[1], t); }
  walk(dt, others) {
    const next = this.path[0];
    if (!next) { this.speed = 0; this.chairSeat = this.seat; this.transition(this.loungeTarget ? 'rest-align' : this.seat >= 0 ? 'align' : ['outbound','drinking'].includes(this.coffeePhase)?'coffee-pick':this.visit?.phase==='outbound'?'inspect':'idle'); return; }
    const p = this.point, remaining = distance(p, next), final = this.path.length === 1;
    const heading = Math.atan2(p[0] - next[0], p[1] - next[1]), turn = angle(this.group.rotation.y, heading);
    this.group.rotation.y += clamp(turn, -dt * 4.8, dt * 4.8);
    const desired = Math.min(1.35 + this.order * .035, final ? Math.sqrt(2 * 2.8 * remaining) : 1.4) * Math.max(.12, 1 - Math.abs(turn) / Math.PI);
    this.speed = damp(this.speed, desired, desired < this.speed ? 12 : 5, dt);
    let step = Math.min(remaining, this.speed * dt);
    for (const other of others) if (other !== this && distance(p, other.point) < .52) {
      const ahead = (next[0] - p[0]) * (other.point[0] - p[0]) + (next[1] - p[1]) * (other.point[1] - p[1]);
      if (ahead > 0 && other.order < this.order && other.state === 'walk') step *= .4;
    }
    if (remaining > .0001) {
      const x = p[0] + (next[0] - p[0]) / remaining * step, z = p[1] + (next[1] - p[1]) / remaining * step;
      if (isWalkable([x, z],undefined,this.capacity)) { this.group.position.set(x, 0, z); this.phase += step / .8; }
    }
    if (distance(this.point, next) < .025) { this.group.position.set(next[0], 0, next[1]); this.path.shift(); }
  }
  update(dt, elapsed, others, activity, reducedMotion, selected) {
    if (this.activity.stage !== activity.stage) this.reactionTime = 0;
    if(this.reaction){this.reaction.time+=dt;if(this.reaction.time>=REACTION_SECONDS)this.reaction=null;}
    if(this.visit){
      this.visit.time+=dt;
      if(this.visit.phase==='pending'&&this.visit.time>=this.visit.delay&&['seated','idle'].includes(this.state)){
        this.visit.phase='outbound';this.signature='';this.destination(this.game);
      }else if(this.visit.phase==='outbound'&&this.state==='inspect'){
        this.visit.phase='looking';this.visit.time=0;this.react('curious');
      }else if(this.visit.phase==='looking'){
        const look=this.visit.look,heading=Math.atan2(this.point[0]-look[0],this.point[1]-look[1]);
        this.group.rotation.y+=clamp(angle(this.group.rotation.y,heading),-dt*3,dt*3);
        if(this.visit.time>=3.2){this.visit.phase='returning';this.signature='';this.destination(this.game);}
      }else if(this.visit.phase==='returning'&&['seated','idle'].includes(this.state))this.visit=null;
    }
    this.activity = activity; this.reactionTime += dt; this.selected = selected; this.stateTime += dt;
    const before = this.point;
    if (this.state === 'walk') this.walk(dt, others);
    const t = this.stateTime;
    if(['coffee-pick','coffee-drink','coffee-put'].includes(this.state)){
      this.group.rotation.y+=clamp(angle(this.group.rotation.y,Math.atan2(this.point[0]-COFFEE_STATION.look[0],this.point[1]-COFFEE_STATION.look[1])),-dt*3,dt*3);
      if(this.state==='coffee-pick'&&t>=COFFEE_TIMING.pick)this.transition('coffee-drink');
      else if(this.state==='coffee-drink'&&t>=COFFEE_TIMING.drink)this.transition('coffee-put');
      else if(this.state==='coffee-put'&&t>=COFFEE_TIMING.put)this.route();
    }
    if (this.state === 'rest-align') {
      this.loungeBlend = 1;
      this.group.rotation.y += clamp(angle(this.group.rotation.y, LOUNGE_SEAT.yaw), -dt*4, dt*4);
      if(t>.6) this.place(this.stateStart,LOUNGE_SEAT.stance,(t-.6)/.85);
      if(t>=1.45) this.transition('rest-lower');
    } else if (this.state === 'rest-lower') {
      // Back into the soft seat as the knees bend; the cushion compresses with
      // the pelvis, then the upper body settles a little later.
      this.sit = smooth(t/1.05);
      this.place(this.stateStart, LOUNGE_SEAT.point, t/1.05);
      if(t>=1.05) { this.sit=1;this.transition('resting'); }
    } else if (this.state === 'rest-rise') {
      this.sit=(this.riseStart??1)*(1-smooth(t/1.05));
      this.place(this.stateStart, LOUNGE_SEAT.stance, t/1.05);
      if(t>=1.05) { this.sit=0;this.riseStart=null;this.transition('rest-exit'); }
    } else if (this.state === 'rest-exit') {
      this.place(this.stateStart,LOUNGE_SEAT.approach,t/.85);
      if(t>=.85) { this.loungeBlend=0;this.route(); }
    } else if (this.state === 'align') {
      this.chairSeat = this.seat; this.chairPull = .28 * smooth(t / .4);
      const d = DESKS[this.chairSeat].seat;
      const heading = t < .9 ? Math.atan2(this.stateStart[0] - d[0], this.stateStart[1] - d[1] - .28) : 0;
      this.group.rotation.y += clamp(angle(this.group.rotation.y, heading), -dt * 5, dt * 5);
      if (t > .3) this.place(this.stateStart, [d[0], d[1] + .28], (t - .3) / .6);
      if (t >= 1.3) this.transition('lower');
    } else if (this.state === 'lower') {
      this.sit = smooth(t / .75); if (t >= .75) { this.sit = 1; this.transition('slide'); }
    } else if (this.state === 'slide') {
      this.chairPull = .28 * (1 - smooth(t / .6)); const d = DESKS[this.chairSeat].seat;
      this.group.position.set(d[0], 0, d[1] + this.chairPull);
      if (t >= .6) { this.chairPull = 0; this.transition('seated'); }
    } else if (this.state === 'pullout') {
      this.chairPull = lerp(this.chairPull, .28, Math.min(1, dt * 9)); const d = DESKS[this.chairSeat].seat;
      this.group.position.set(d[0], 0, d[1] + this.chairPull);
      if (t >= .55) { this.riseStart = this.sit; this.transition('rise'); }
    } else if (this.state === 'rise') {
      this.sit = (this.riseStart ?? 0) * (1 - smooth(t / .75));
      if (t >= .75) { this.sit = 0; this.riseStart = null; this.transition('exit'); }
    } else if (this.state === 'exit') {
      const d = this.chairSeat >= 0 ? approach(this.chairSeat) : this.point;
      const heading = Math.atan2(this.stateStart[0] - d[0], this.stateStart[1] - d[1]);
      this.group.rotation.y += clamp(angle(this.group.rotation.y, heading), -dt * 6, dt * 6);
      this.place(this.stateStart, d, (t - .25) / .7); this.chairPull = .28 * (1 - smooth(t / .95));
      if (t >= .95) { this.chairSeat = -1; this.chairPull = 0; this.route(); }
    }
    const travel = distance(before, this.point);
    this.restBlend = damp(this.restBlend || 0, this.state === 'resting' ? 1 : 0, 3, dt);
    if (['align','exit','rest-exit'].includes(this.state)) this.phase += travel / .8;
    if(this.state==='rest-align')this.phase-=travel/.8;
    const gait = ['walk','align','exit','rest-align','rest-exit'].includes(this.state) ? Math.min(1, travel / dt / 1.35) : 0;
    this.gait = damp(this.gait, gait, 12, dt);
    this.workBlend = damp(this.workBlend, this.state === 'seated' && activity.stage === 'work' && activity.task ? 1 : 0, 4, dt);
    this.eventBlend = damp(this.eventBlend, activity.stage === 'event' && activity.eventParticipant!==false && this.state==='seated' ? 1 : 0, 5, dt);
    const mouseShare = activity.task?.skill === 'design' ? .68 : activity.task?.skill === 'qa' ? .35 : .12;
    this.mouseBlend = damp(this.mouseBlend, (elapsed + this.order * 1.73) % 7 < mouseShare * 7 ? 1 : 0, 5, dt);
    this.talkBlend=damp(this.talkBlend||0,activity.speaking?1:0,10,dt);
    this.listenBlend=damp(this.listenBlend||0,activity.listening?1:0,7,dt);
    this.talkLevel=damp(this.talkLevel||0,activity.speaking?(activity.speechLevel||0):0,14,dt);
    const target=activity.speechTarget;
    const turn=target?angle(this.group.rotation.y,Math.atan2(this.point[0]-target[0],this.point[1]-target[1])):0;
    this.talkTurn=damp(this.talkTurn||0,clamp(turn,-.5,.5),5,dt);
    poseActor(this, elapsed, reducedMotion);this.updateCup(reducedMotion);
  }
  updateCup(reduced){
    const motion=coffeeMotion(this.state,this.stateTime,reduced);this.cup.visible=motion.holding;
    if(!this.cup.visible)return;
    const wrist=this.joints.RightWrist.getWorldPosition(new THREE.Vector3());this.group.worldToLocal(wrist);
    this.cup.position.copy(wrist).add(new THREE.Vector3(0,.035,0));this.cup.rotation.set(motion.tilt,0,0);
  }
  pose(_walking, _typing, elapsed, reduced) { poseActor(this, elapsed, reduced); }
}
