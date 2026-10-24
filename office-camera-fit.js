// Projection of the whole 10 x 8 m studio, including 3.05 m walls.
// Keep the fit independent of viewport shape and the user's zoom level.
export function officeFrame(aspect, direction, padding = 1.07) {
  const length = Math.hypot(...direction);
  const forward = direction.map(v => v / length);
  const horizontal = Math.hypot(forward[0], forward[2]);
  const right = [forward[2] / horizontal, 0, -forward[0] / horizontal];
  const up = [forward[1] * right[2], horizontal, -forward[1] * right[0]];
  const extent = axis => 5.2 * Math.abs(axis[0]) + 1.8 * Math.abs(axis[1]) + 4.2 * Math.abs(axis[2]);
  return Math.max(extent(up), extent(right) / aspect) * padding;
}

export function officeWallVisible(side, direction) {
  const [x, , z] = direction;
  return ({back:z, front:-z, left:x, right:-x})[side] > .01;
}
