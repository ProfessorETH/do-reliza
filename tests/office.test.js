import test from 'node:test';
import assert from 'node:assert/strict';
import { DESKS, ENTRANCE, WAITING, LOUNGE_SEAT, isWalkable, clearSegment, findOfficePath } from '../office-layout.js';

test('all seats and entrance waiting spots are accessible without crossing furniture', () => {
  const points = [ENTRANCE, ...WAITING, ...DESKS.map(d => d.seat)];
  for (const a of points) for (const b of points) {
    assert.ok(isWalkable(a)); assert.ok(isWalkable(b));
    const path = findOfficePath(a, b); assert.ok(path, `no path ${a} -> ${b}`);
    let p = a;
    for (const q of path) { assert.ok(clearSegment(p, q), `blocked segment ${p} -> ${q}`); p = q; }
    assert.ok(Math.hypot(p[0] - b[0], p[1] - b[1]) < .02);
  }
});

test('desk interiors, lounge, wall and invalid destinations reject movement', () => {
  for (const point of [[-2.65, -1.95], [-3.95, 2.7], [8, 0], [NaN, 0], [0]]) {
    assert.equal(isWalkable(point), false);
    assert.equal(findOfficePath(ENTRANCE, point), null);
  }
  assert.equal(clearSegment(ENTRANCE, [-2.65, -2.8]), false);
});

test('walking routes approach chairs from the side without crossing another chair', () => {
  const points=[ENTRANCE,...WAITING,LOUNGE_SEAT.approach,...DESKS.map(d=>[d.seat[0]+.72,d.seat[1]+.4])];
  for(const a of points)for(const b of points){
    const path=findOfficePath(a,b,true);assert.ok(path,`${a} -> ${b}`);let p=a;
    for(const q of path){assert.ok(clearSegment(p,q,true));p=q;}
  }
  assert.equal(findOfficePath(ENTRANCE,DESKS[0].seat,true),null);
});
test('short diagonal corner crossings are rejected instead of stranding returning employees',()=>{
  assert.equal(clearSegment([-2.85,2.8],[-2.35,.45],true),false);
  const path=findOfficePath([-2.85,2.8],[-1.93,-.61],true);assert.ok(path);
  let p=[-2.85,2.8];
  for(const q of path){for(let i=0;i<=1000;i++)assert.ok(isWalkable([p[0]+(q[0]-p[0])*i/1000,p[1]+(q[1]-p[1])*i/1000]));p=q;}
});
