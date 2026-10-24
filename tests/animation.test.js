import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import * as THREE from '../vendor/three/three.module.js';
import { OfficeActor } from '../office-actors.js';
import { DESKS, isWalkable, distance } from '../office-layout.js';
import { poseActor } from '../office-pose.js';

// Node has no browser import map; resolve the unmodified vendored addons locally.
registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier === 'three' ? new URL('../vendor/three/three.module.js', import.meta.url).href : specifier, context); } });
const { GLTFLoader } = await import('../vendor/three/loaders/GLTFLoader.js');

const ids = ['mira','pixel','nord','iskra','saga','echo'];
const models = new Map();
async function actor(id = 'mira', order = 0) {
  if (!models.has(id)) {
    const bytes = await readFile(new URL(`../assets/models/${id}.glb`, import.meta.url));
    models.set(id, await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''));
  }
  return new OfficeActor(id, models.get(id).scene.clone(true), '#7ed9b8', order);
}
const activity = { stage:'plan', task:null };
function update(a, frames, dt = 1 / 60, mode = activity) {
  for (let i = 0; i < frames; i++) {
    a.update(dt, i * dt, [a], mode, false, false);
    assert.ok(a.group.position.toArray().every(Number.isFinite), 'finite root motion');
  }
}

test('all six exported Blender rigs have wrists, fingers and blink pivots', async () => {
  for (const id of ids) {
    const a = await actor(id);
    for (const name of ['Hips','Torso','Head','EyeLeft','EyeRight','LeftWrist','RightWrist','LeftFinger0','RightFinger3','LeftFoot','RightFoot']) assert.ok(a.joints[name], `${id}: missing ${name}`);
  }
});

test('both feet remain on or above floor through a full gait and chair lowering', async () => {
  const a = await actor(); a.group.position.set(0,0,0);
  for (let i = 0; i < 120; i++) {
    a.sit = i < 60 ? 0 : (i - 60) / 59; a.gait = i < 60 ? 1 : 0; a.phase = i / 60;
    poseActor(a, i / 60, false); a.group.updateMatrixWorld(true);
    for (const side of ['Left','Right']) {
      const box = new THREE.Box3().setFromObject(a.joints[side + 'Foot'],true);
      assert.ok(box.min.y > -.006, `${side} foot penetrated floor at ${i}: ${box.min.y}`);
      const phase=((a.phase+(side==='Right'?.5:0))%1+1)%1;
      if (a.sit > 0 || phase < .6) assert.ok(Math.abs(box.min.y) < .006, `support foot floated at ${i}: ${box.min.y}`);
    }
  }
});

test('walk, align, lower and slide finish at all desks at 30/60/120 Hz', async () => {
  for (const dt of [1/30,1/60,1/120]) for (let seat = 0; seat < 3; seat++) {
    const a = await actor(); const game = { seats: [null,null,null], officeTargets:{} }; game.seats[seat] = a.id;
    a.destination(game); const states = new Set(); let previous = a.point;
    for (let i = 0; i < 30 / dt && a.moving; i++) {
      a.update(dt, i * dt, [a], activity, false, false); states.add(a.state);
      assert.ok(distance(previous, a.point) < .11, `root teleported: ${a.state}`); previous = a.point;
      if (a.state === 'walk') assert.ok(isWalkable(a.point));
    }
    assert.equal(a.state, 'seated'); assert.equal(a.sit, 1); assert.equal(a.chairPull, 0);
    assert.ok(distance(a.point, DESKS[seat].seat) < .001);
    for (const state of ['walk','align','lower','slide']) assert.ok(states.has(state), `missing ${state}`);
  }
});

test('seated agent stands before walking and survives destination changes mid-transition', async () => {
  const a = await actor(), game = { seats: ['mira',null,null], officeTargets:{} };
  a.destination(game, true); game.seats = [null,null,null]; game.officeTargets.mira = [3,3]; a.destination(game);
  update(a, 20); assert.equal(a.state, 'pullout');
  game.seats = [null,'mira',null]; a.destination(game); update(a, 1800);
  assert.equal(a.state, 'seated'); assert.ok(distance(a.point, DESKS[1].seat) < .001);
  game.seats = [null,null,'mira']; a.destination(game);
  for (let i = 0; i < 1800 && a.state !== 'lower'; i++) update(a, 1);
  update(a, 15); game.seats = [null,null,null]; game.officeTargets.mira = [3,3]; a.destination(game); update(a, 1800);
  assert.equal(a.state, 'idle'); assert.equal(a.sit, 0); assert.ok(distance(a.point, [3,3]) < .001);
});

test('hands reach keyboard and mouse without changing seated pelvis contact', async () => {
  for (const id of ids) {
    const a = await actor(id); a.destination({ seats:[id,null,null], officeTargets:{} }, true);
    update(a, 180, 1/60, { stage:'work', task:{skill:'design'} });
    for (const time of [1, 6]) {
      poseActor(a, time, true); a.group.updateMatrixWorld(true);
      for (const side of ['Left','Right']) {
        const p = a.joints.Hips.worldToLocal(a.joints[side + 'Wrist'].getWorldPosition(new THREE.Vector3()));
        assert.ok(p.y + .6 > .85 && p.y + .6 < .91, `${id} ${side} wrist height: ${p.y+.6}`);
        assert.ok(-p.z > .44 && -p.z < .57, `${id} ${side} wrist reach: ${-p.z}`);
      }
      assert.equal(a.joints.Hips.position.y, .6);
    }
  }
});
