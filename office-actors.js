import * as THREE from 'three';
import { DESKS, ENTRANCE, WAITING, findOfficePath, isWalkable, distance } from './office-layout.js';

const lerp = THREE.MathUtils.lerp;
const seatedAngle = Math.acos(.3);
const turn = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;

export class OfficeActor {
  constructor(id, model, color, order) {
    this.id = id; this.order = order; this.group = new THREE.Group(); this.group.userData.agentId = id;
    this.group.add(model); this.group.position.set(ENTRANCE[0], 0, ENTRANCE[1]);
    this.joints = {};
    model.traverse(node => {
      if (node.name.startsWith(`Release3D_${id}_`)) this.joints[node.name.slice(`Release3D_${id}_`.length)] = node;
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(.12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .2, roughness: .5 }));
    this.marker.position.y = 2.25; this.marker.scale.y = 1.65; this.marker.visible = false;
    this.group.add(this.marker);
    this.path = []; this.sit = 0; this.phase = order * 1.7; this.signature = ''; this.seat = -1; this.failed = false;
  }
  get point() { return [this.group.position.x, this.group.position.z]; }
  get moving() { return !!this.path.length || (this.seat >= 0 && this.sit < .98); }
  destination(game, instant = false) {
    const seat = game.seats.indexOf(this.id), point = seat >= 0 ? DESKS[seat].seat : game.officeTargets[this.id] || WAITING[this.order % WAITING.length];
    const signature = `${seat}:${point.join(',')}`;
    if (signature === this.signature) return;
    this.signature = signature; this.seat = seat; this.failed = false;
    if (instant) { this.group.position.set(point[0], 0, point[1]); this.sit = seat >= 0 ? 1 : 0; this.path = []; this.group.rotation.y = seat >= 0 ? 0 : Math.PI; }
    else {
      const route = findOfficePath(this.point, point);
      if (route === null) { this.failed = true; this.path = []; }
      else this.path = route;
    }
  }
  canReach(point) { return findOfficePath(this.point, point) !== null; }
  update(dt, elapsed, others, working, reducedMotion, selected) {
    const canSit = this.seat >= 0 && !this.path.length && !this.failed;
    this.sit = THREE.MathUtils.damp(this.sit, canSit ? 1 : 0, 8, dt);
    if (Math.abs(this.sit - (canSit ? 1 : 0)) < .005) this.sit = canSit ? 1 : 0;
    let walking = false;
    if (this.path.length && this.sit < .05) {
      const point = this.point, next = this.path[0], remaining = distance(point, next);
      const speed = Math.min(1.65, .35 + distance(point, this.path.at(-1)) * 3);
      const step = Math.min(remaining, speed * dt);
      if (remaining > .005) {
        let dx = (next[0] - point[0]) / remaining * step, dz = (next[1] - point[1]) / remaining * step;
        // Small local separation; furniture navigation always wins over steering.
        for (const other of others) if (other !== this) {
          const dist = distance(point, other.point);
          if (dist < .48 && dist > .03) { dx += (point[0] - other.point[0]) / dist * dt * .3; dz += (point[1] - other.point[1]) / dist * dt * .3; }
        }
        if (!isWalkable([point[0] + dx, point[1] + dz])) { dx = (next[0] - point[0]) / remaining * step; dz = (next[1] - point[1]) / remaining * step; }
        this.group.position.x += dx; this.group.position.z += dz;
        this.group.rotation.y = turn(this.group.rotation.y, Math.atan2(-dx, -dz), Math.min(1, dt * 12));
        this.phase += step * 7; walking = true;
      }
      if (distance(this.point, next) < .04) this.path.shift();
    }
    if (canSit) this.group.rotation.y = turn(this.group.rotation.y, 0, Math.min(1, dt * 10));
    this.pose(walking, working && canSit, elapsed, reducedMotion);
    this.marker.visible = selected; this.marker.rotation.y = reducedMotion ? 0 : elapsed * .6;
  }
  pose(walking, typing, elapsed, reduced) {
    const s = this.sit, wave = walking && !reduced ? Math.sin(this.phase) : 0;
    const gait = wave * .55, blend = (a, b) => lerp(a, b, s);
    this.joints.Hips.position.z = blend(.88 + (walking && !reduced ? Math.abs(Math.sin(this.phase * 2)) * .025 : 0), .60);
    this.joints.Hips.rotation.y = walking && !reduced ? Math.sin(this.phase) * .025 : 0;
    this.joints.Head.rotation.z = typing && !reduced ? Math.sin(elapsed * 1.7) * .035 : 0;
    for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
      this.joints[side + 'Thigh'].rotation.x = blend(gait * sign, seatedAngle);
      this.joints[side + 'Shin'].rotation.x = blend(-Math.max(0, -wave * sign) * .75, -seatedAngle);
      const tap = typing && !reduced ? Math.sin(elapsed * 12 + sign) * .025 : 0;
      this.joints[side + 'UpperArm'].rotation.x = blend(-gait * sign * .7, THREE.MathUtils.degToRad(63) + tap);
      this.joints[side + 'Forearm'].rotation.x = blend(-.08, THREE.MathUtils.degToRad(28) - tap * .6);
    }
  }
}
