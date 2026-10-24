// The playable release and its checkpoint must use the same team decisions.
export const rocks = new Set(['1,1', '3,1', '5,1', '1,3', '3,3', '5,3']);
export const batteriesFor = game => game.life?.contract === 'club' ? ['1,0', '4,4', '6,2']
  : game.life?.contract === 'cup' ? ['2,4', '4,0', '6,2'] : ['2,0', '4,2', '0,4'];
export const canSaveOrbit = game => game.checkpoint && !game.criticalBug;
export const orbitFeatures = (game, design) => ({
  decorated: game.choices.scope !== 'swap' && design >= 70,
  edgeGuard: game.choices.review === 'review-pair',
  saveMode: game.criticalBug ? 'broken' : game.checkpoint ? 'working' : 'removed',
});
export const outsideOrbit = (x, y) => x < 0 || x > 6 || y < 0 || y > 4;
export const releaseKey = game => JSON.stringify([
  game.life?.seed, game.life?.completed, game.life?.contract,
  game.choices.scope, game.choices.review, game.choices.bug,
  Boolean(game.shield), Boolean(game.wallBug), Boolean(game.checkpoint), Boolean(game.criticalBug), game.designPenalty,
]);
export function freshOrbit(game) {
  return { version: 2, release: releaseKey(game), x: 0, y: 0, collected: [], shield: Boolean(game.shield), won: false, moves: 0 };
}
export function restoreOrbit(game, saved) {
  const fresh = freshOrbit(game), batteries = batteriesFor(game);
  // Old checkpoints have no release identity. Keep the studio save, start a fresh flight.
  if (!canSaveOrbit(game) || !saved || saved.version !== 2 || saved.release !== fresh.release
    || !Number.isInteger(saved.x) || saved.x < 0 || saved.x > 6
    || !Number.isInteger(saved.y) || saved.y < 0 || saved.y > 4
    || !Array.isArray(saved.collected) || new Set(saved.collected).size !== saved.collected.length
    || !saved.collected.every(key => batteries.includes(key))
    || typeof saved.shield !== 'boolean' || (!game.shield && saved.shield)
    || typeof saved.won !== 'boolean' || (saved.won && (saved.x !== 6 || saved.y !== 4 || saved.collected.length !== 3))
    || !Number.isSafeInteger(saved.moves) || saved.moves < 0) return fresh;
  return { ...fresh, x: saved.x, y: saved.y, collected: [...saved.collected], shield: saved.shield, won: saved.won, moves: saved.moves };
}
export function moveOrbit(game, flight, dx, dy) {
  return stepOrbit(game, flight, dx, dy).message;
}
export function stepOrbit(game, flight, dx, dy) {
  if (!flight || flight.won || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1) return { kind: 'idle', message: '' };
  const x = flight.x + dx, y = flight.y + dy, key = `${x},${y}`;
  if (outsideOrbit(x,y)) return { kind: 'edge', cell: `${flight.x},${flight.y}`, message: game.choices.review === 'review-pair'
    ? 'Защита границы остановила корабль. Этот случай команда проверила вместе.' : 'Здесь край карты. Выбери другое направление.' };
  let message = '', kind = 'move';
  if (rocks.has(key)) {
    if (game.wallBug) { kind = 'phase'; message = 'Ошибка движения: корабль прошёл сквозь астероид. Проверка кода была пропущена.'; }
    else if (!flight.shield) return { kind: 'blocked', cell: key, message: 'Астероид преградил путь. Найди обходной маршрут.' };
    else { flight.shield = false; kind = 'shield-hit'; message = 'Щит поглотил удар! Заряд израсходован — следующие астероиды нужно обходить.'; }
  }
  flight.x = x; flight.y = y; flight.moves++;
  if (batteriesFor(game).includes(key) && !flight.collected.includes(key)) {
    flight.collected.push(key); kind = 'collect'; message = `Батарея на борту: ${flight.collected.length} / 3.`;
  }
  if (x === 6 && y === 4) {
    flight.won = flight.collected.length === 3;
    kind = 'dock';
    message = flight.won ? 'Станция получила энергию. Миссия выполнена!' : 'Для станции нужны все три батареи.';
  }
  return { kind, cell: key, message };
}
