// The playable release and its checkpoint must use the same team decisions.
export const rocks = new Set(['1,1', '3,1', '5,1', '1,3', '3,3', '5,3']);
export const batteriesFor = game => game.life?.contract === 'club' ? ['1,0', '4,4', '6,2']
  : game.life?.contract === 'cup' ? ['2,4', '4,0', '6,2'] : ['2,0', '4,2', '0,4'];
export const canSaveOrbit = game => game.checkpoint && !game.criticalBug;
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
  if (!flight || flight.won || Math.abs(dx) + Math.abs(dy) !== 1) return '';
  const x = flight.x + dx, y = flight.y + dy, key = `${x},${y}`;
  if (x < 0 || x > 6 || y < 0 || y > 4) return '';
  let message = '';
  if (rocks.has(key)) {
    if (game.wallBug) message = 'Ошибка движения: корабль прошёл сквозь астероид. Проверка кода была пропущена.';
    else if (!flight.shield) return 'Астероид преградил путь. Найди обходной маршрут.';
    else { flight.shield = false; message = 'Щит поглотил удар! Заряд израсходован — следующие астероиды нужно обходить.'; }
  }
  flight.x = x; flight.y = y; flight.moves++;
  if (batteriesFor(game).includes(key) && !flight.collected.includes(key)) flight.collected.push(key);
  if (x === 6 && y === 4) {
    flight.won = flight.collected.length === 3;
    message = flight.won ? 'Станция получила энергию. Миссия выполнена!' : 'Для станции нужны все три батареи.';
  }
  return message;
}
