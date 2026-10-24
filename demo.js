import { createGame, hire, seatAgent, beginPlan, recommend } from './engine.js?v=office-life-20261024-v3';

// A real playable setup. Separate browser storage keeps the player's own run intact.
export function createDemoGame() {
  const game = createGame('calm');
  for (const [index, id] of ['mira','iskra','echo'].entries()) { hire(game,id); seatAgent(game,id,index); }
  beginPlan(game); recommend(game); game.stage = 'hire';
  return game;
}
