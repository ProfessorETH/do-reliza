// Metres, glTF Y-up. Source furniture anchors: art/blender/office_recipe.py.
export const DESKS = [
  { x: -2.65, z: -1.95, seat: [-2.65, -1.01] },
  { x: 1.4, z: -1.95, seat: [1.4, -1.01] },
  { x: -.9, z: 1.45, seat: [-.9, 2.39] },
];
export const ALL_DESKS = [...DESKS, {x:6.6,z:-1.95,seat:[6.6,-1.01]}, {x:6.6,z:1.45,seat:[6.6,2.39]}];
export const ENTRANCE = [4.1, 3.25];
export const WAITING = [[3.9, 2.8], [3.1, 3.2], [2.3, 3.25]];
// One physical beanbag. Only its owner enters the furniture footprint during
// the authored lowering/rising transition; navigation ends on the clear floor.
export const LOUNGE_SEAT = { point: [-3.68, 2.97], approach: [-2.85, 2.97], stance: [-3.38, 2.97], yaw: -Math.PI / 2, surfaceHeight: .50, hipHeight: .62, footForward: .36 };
// All four inner wall faces are x=±4.91 / z=±3.91. Keep a body-width margin.
export const WALK_BOUNDS = { minX: -4.55, maxX: 4.55, minZ: -3.55, maxZ: 3.55 };
export const BODY_RADIUS = .34;
const furnitureFor = (capacity=3) => [
  ...ALL_DESKS.slice(0,capacity).map(d => ({ x: d.x, z: d.z, w: 2.3, d: 1 })),
  { x: -.9, z: -3.64, w: 2.7, d: .62 },
  { x: -3.7, z: -3.5, w: .80, d: .52 },
  { x: 3.85, z: -3.38, w: .85, d: .75 },
  { x: 4.22, z: -1.9, w: .68, d: .68 },
  { x: -3.95, z: 2.7, w: 1.2, d: 1.2 },
  { x: -3.93, z: 3.59, w: 1.05, d: .60 },
];
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function isWalkable(point, radius = BODY_RADIUS, capacity = 3) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) return false;
  const [x, z] = point, b = boundsFor(capacity);
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
  return !furnitureFor(capacity).some(o => Math.abs(x - o.x) < o.w / 2 + radius && Math.abs(z - o.z) < o.d / 2 + radius);
}
const boundsFor = capacity => capacity>3 ? {...WALK_BOUNDS,maxX:8.55} : WALK_BOUNDS;
export const isChairClear = (point,capacity=3) => !ALL_DESKS.slice(0,capacity).some(d => Math.abs(point[0] - d.seat[0]) < .68 && point[1] > d.seat[1] - .59 && point[1] < d.seat[1] + .95);
function crossesInterior(a,b,minX,maxX,minZ,maxZ) {
  let enter=0,leave=1;
  for (const [axis,min,max] of [[0,minX,maxX],[1,minZ,maxZ]]) {
    const delta=b[axis]-a[axis];
    if (Math.abs(delta)<1e-12) { if(a[axis]<=min||a[axis]>=max)return false; continue; }
    const near=(min-a[axis])/delta,far=(max-a[axis])/delta;
    enter=Math.max(enter,Math.min(near,far));leave=Math.min(leave,Math.max(near,far));
    if(enter>=leave-1e-10)return false;
  }
  return leave>0&&enter<1;
}
export function clearSegment(a, b, avoidChairs = false, capacity = 3) {
  if(!isWalkable(a,undefined,capacity)||!isWalkable(b,undefined,capacity)||avoidChairs&&(!isChairClear(a,capacity)||!isChairClear(b,capacity)))return false;
  // Exact slab intersections prevent a short corner crossing being missed by
  // 5 cm samples, which otherwise leaves an actor stuck midway through a path.
  if(furnitureFor(capacity).some(o=>crossesInterior(a,b,o.x-o.w/2-BODY_RADIUS,o.x+o.w/2+BODY_RADIUS,o.z-o.d/2-BODY_RADIUS,o.z+o.d/2+BODY_RADIUS)))return false;
  return !avoidChairs||!ALL_DESKS.slice(0,capacity).some(d=>crossesInterior(a,b,d.seat[0]-.68,d.seat[0]+.68,d.seat[1]-.59,d.seat[1]+.95));
}

// A* on a 20 cm grid. Diagonal moves may not cut furniture corners.
export function findOfficePath(start, end, avoidChairs = false, capacity = 3) {
  const segment = (a,b) => clearSegment(a,b,avoidChairs,capacity);
  if (!isWalkable(start,undefined,capacity) || !isWalkable(end,undefined,capacity) || avoidChairs && (!isChairClear(start,capacity) || !isChairClear(end,capacity))) return null;
  if (segment(start, end)) return distance(start, end) < .02 ? [] : [end];
  const step = .2, b = boundsFor(capacity);
  const cols = Math.floor((b.maxX - b.minX) / step) + 1, rows = Math.floor((b.maxZ - b.minZ) / step) + 1;
  const point = id => [b.minX + id % cols * step, b.minZ + Math.floor(id / cols) * step];
  const grid = p => [Math.round((p[0] - b.minX) / step), Math.round((p[1] - b.minZ) / step)];
  function nearest(p) {
    const [cx, cz] = grid(p); let best = null, bestDistance = Infinity;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= cols || z >= rows) continue;
      const id = z * cols + x, q = point(id), d = distance(p, q);
      if (d < bestDistance && segment(p, q)) { best = id; bestDistance = d; }
    }
    return best;
  }
  const first = nearest(start), last = nearest(end);
  if (first === null || last === null) return null;
  const open = new Set([first]), previous = new Map(), cost = new Map([[first, 0]]), closed = new Set();
  while (open.size) {
    let current = null, score = Infinity;
    for (const id of open) { const s = cost.get(id) + distance(point(id), end); if (s < score) { current = id; score = s; } }
    if (current === last) {
      const reverse = [end]; let id = last;
      while (id !== first) { reverse.push(point(id)); id = previous.get(id); }
      reverse.push(point(first)); const route = reverse.reverse(), simplified = [];
      let cursor = start, next = 0;
      while (next < route.length) {
        let far = next;
        while (far + 1 < route.length && segment(cursor, route[far + 1])) far++;
        simplified.push(route[far]); cursor = route[far]; next = far + 1;
      }
      return simplified;
    }
    open.delete(current); closed.add(current);
    const cx = current % cols, cz = Math.floor(current / cols), p = point(current);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= cols || z >= rows) continue;
      const id = z * cols + x, q = point(id);
      if (closed.has(id) || !segment(p, q)) continue;
      const nextCost = cost.get(current) + Math.hypot(dx, dz) * step;
      if (nextCost < (cost.get(id) ?? Infinity)) { cost.set(id, nextCost); previous.set(id, current); open.add(id); }
    }
  }
  return null;
}

export const COFFEE_STATION = {point:[-.75,-2.7],look:[-1,-3.55]};
