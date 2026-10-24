// Metres, glTF Y-up. Source furniture anchors: art/blender/office_recipe.py.
export const DESKS = [
  { x: -2.65, z: -1.95, seat: [-2.65, -1.01] },
  { x: 1.4, z: -1.95, seat: [1.4, -1.01] },
  { x: -.9, z: 1.45, seat: [-.9, 2.39] },
];
export const ENTRANCE = [4.1, 3.25];
export const WAITING = [[3.9, 2.8], [3.1, 3.2], [2.3, 3.25]];
// Standing rest positions around the existing beanbag; outside its collision box.
// The three slots keep simultaneous breaks apart without changing desk ownership.
export const REST_SPOTS = [
  { point: [-2.85, 2.8], yaw: Math.PI / 2 },
  { point: [-3.2, 1.55], yaw: Math.PI },
  { point: [-4.25, 1.55], yaw: Math.PI },
];
export const WALK_BOUNDS = { minX: -4.65, maxX: 4.65, minZ: -3.65, maxZ: 3.65 };
export const BODY_RADIUS = .34;
const furniture = [
  ...DESKS.map(d => ({ x: d.x, z: d.z, w: 2.3, d: 1 })),
  { x: -.9, z: -3.64, w: 2.7, d: .62 },
  { x: -3.7, z: -3.5, w: .80, d: .52 },
  { x: 3.85, z: -3.38, w: .85, d: .75 },
  { x: 4.22, z: -1.9, w: .68, d: .68 },
  { x: -3.95, z: 2.7, w: 1.2, d: 1.2 },
  { x: -3.93, z: 3.59, w: 1.05, d: .60 },
];
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function isWalkable(point, radius = BODY_RADIUS) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) return false;
  const [x, z] = point, b = WALK_BOUNDS;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
  return !furniture.some(o => Math.abs(x - o.x) < o.w / 2 + radius && Math.abs(z - o.z) < o.d / 2 + radius);
}
export const isChairClear = point => !DESKS.some(d => Math.abs(point[0] - d.seat[0]) < .68 && point[1] > d.seat[1] - .59 && point[1] < d.seat[1] + .95);
export function clearSegment(a, b, avoidChairs = false) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / .05));
  for (let i = 0; i <= steps; i++) {
    const p = [a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps];
    if (!isWalkable(p) || avoidChairs && !isChairClear(p)) return false;
  }
  return true;
}

// A* on a 20 cm grid. Diagonal moves may not cut furniture corners.
export function findOfficePath(start, end, avoidChairs = false) {
  const segment = (a,b) => clearSegment(a,b,avoidChairs);
  if (!isWalkable(start) || !isWalkable(end) || avoidChairs && (!isChairClear(start) || !isChairClear(end))) return null;
  if (segment(start, end)) return distance(start, end) < .02 ? [] : [end];
  const step = .2, b = WALK_BOUNDS;
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
