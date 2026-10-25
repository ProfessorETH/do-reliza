export function eventKey(game) {
  return game?.stage === 'event' ? [game.life?.seed,game.life?.completed,game.currentEvent,game.life?.incident?.type,game.life?.incident?.id,...(game.life?.incident?.type==='night'?[game.life.night?.lastAsked]:[])].join(':') : null;
}
export function ensureEventClock(game) {
  const key=eventKey(game);
  if(!key || game.currentEvent!=='life' || ['idea','salary','night'].includes(game.life.incident?.type) || game.difficulty==='calm' || game.timedEvents===false)return null;
  if(game.eventClock?.key!==key)game.eventClock={key,remaining:game.difficulty==='hard'?30000:45000,paused:false};
  return game.eventClock;
}
export function advanceEventClock(game,delta,blocked=false) {
  const clock=ensureEventClock(game);
  if(!clock||clock.paused||blocked)return false;
  clock.remaining=Math.max(0,clock.remaining-Math.min(500,Math.max(0,Number.isFinite(delta)?delta:0)));
  return clock.remaining===0;
}
export function validEventClock(game) {
  return (game.timedEvents===undefined||typeof game.timedEvents==='boolean') && (game.eventClock===undefined ||
    game.eventClock && typeof game.eventClock.key==='string' && game.eventClock.key.length<180
    && Number.isFinite(game.eventClock.remaining)&&game.eventClock.remaining>=0&&game.eventClock.remaining<=45000&&typeof game.eventClock.paused==='boolean');
}
