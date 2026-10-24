import { AGENTS } from '../data.js';
import { INCIDENTS } from './studio-life.js';
import { eventKey } from './event-clock.js';

// The incident already owns a persisted employee. Never re-roll on render/reload.
export function employeeEvent(game) {
  if(game?.stage!=='event'||game.currentEvent!=='life')return null;
  const incident=game.life?.incident, agent=AGENTS.find(a=>a.id===incident?.id);
  if(!agent||!game.team.includes(agent.id)||!INCIDENTS[incident.type])return null;
  return {id:agent.id,name:agent.name,type:incident.type,title:INCIDENTS[incident.type].title,key:eventKey(game)};
}
