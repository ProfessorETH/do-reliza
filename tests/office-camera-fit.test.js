import test from 'node:test';
import assert from 'node:assert/strict';
import { officeFrame, officeWallVisible } from '../office-camera-fit.js';
import { WALK_BOUNDS, BODY_RADIUS } from '../office-layout.js';

test('whole studio fits narrow and wide viewports across a full camera orbit', () => {
  for (const aspect of [.5, .8, 1, 1.8, 3]) {
    for (let angle=0;angle<Math.PI*2;angle+=.2) {
      const direction=[Math.sin(angle),.6,Math.cos(angle)];
      const magnitude=Math.hypot(...direction), forward=direction.map(v=>v/magnitude);
      const h=Math.hypot(forward[0],forward[2]);
      const right=[forward[2]/h,0,-forward[0]/h], up=[forward[1]*right[2],h,-forward[1]*right[0]];
      const halfHeight=officeFrame(aspect,direction);
      for (const x of [-5.2,5.2]) for (const y of [-1.8,1.8]) for (const z of [-4.2,4.2]) {
        const point=[x,y,z], dot=axis=>point.reduce((sum,v,i)=>sum+v*axis[i],0);
        assert.ok(Math.abs(dot(right))<halfHeight*aspect, 'Side of room is cropped');
        assert.ok(Math.abs(dot(up))<halfHeight, 'Top or base of room is cropped');
      }
    }
  }
});

test('the two far walls remain visible in every camera quadrant', () => {
  const sides=['back','front','left','right'];
  for (const [direction,expected] of [
    [[1,1,1],['back','left']], [[-1,1,1],['back','right']],
    [[-1,1,-1],['front','right']], [[1,1,-1],['front','left']],
  ]) assert.deepEqual(sides.filter(s=>officeWallVisible(s,direction)),expected);
});

test('navigation keeps the full body clear of all four wall planes', () => {
  assert.ok(WALK_BOUNDS.maxX + BODY_RADIUS < 4.91);
  assert.ok(WALK_BOUNDS.minX - BODY_RADIUS > -4.91);
  assert.ok(WALK_BOUNDS.maxZ + BODY_RADIUS < 3.91);
  assert.ok(WALK_BOUNDS.minZ - BODY_RADIUS > -3.91);
});
