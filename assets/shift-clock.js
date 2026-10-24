export const AUTO_HOUR_MS = 4000;
const START_MINUTE = 9 * 60;
export function advanceShiftClock(game, deltaMs, blocked = false) {
  if (!game?.autoPlay || game.stage !== 'work' || blocked) return false;
  game.clockFraction = (game.clockFraction || 0) + Math.max(0, Math.min(deltaMs, 500)) / AUTO_HOUR_MS;
  if (game.clockFraction < 1) return false;
  game.clockFraction = 0;
  return true;
}
export function shiftTime(game) {
  const elapsed = Math.floor((game.time + (game.clockFraction || 0)) * 60);
  const format = minutes => `${String(Math.floor(minutes / 60) % 24).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}${minutes >= 1440 ? ` · день ${Math.floor(minutes / 1440) + 1}` : ''}`;
  const remaining = game.deadline * 60 - elapsed, absolute = Math.abs(remaining);
  return { now: format(START_MINUTE + elapsed), end: format(START_MINUTE + game.deadline * 60), remaining: `${remaining < 0 ? '+' : ''}${Math.floor(absolute/60)} ч ${String(absolute%60).padStart(2,'0')} мин`, late: remaining < 0 };
}
