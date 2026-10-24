import { missionFor } from '../assets/orbit-missions.js';
import { stepOrbit, actOrbit, outsideOrbit } from '../assets/orbit.js';

// Find safe routes through the real movement rules, including the patrol's next turn.
export function routeTo(game,flight,target) {
  const mission=missionFor(game),queue=[[structuredClone(flight),[]]],seen=new Set();
  for(let cursor=0;cursor<queue.length;cursor++){
    const [state,path]=queue[cursor],key=[state.x,state.y,state.turns%Math.max(1,mission.patrol.length),state.relay,state.gates].join(':');
    if(seen.has(key))continue;seen.add(key);
    if(`${state.x},${state.y}`===target)return path;
    for(const move of [[1,0],[0,1],[-1,0],[0,-1],'wait']){
      if(move!=='wait'&&(outsideOrbit(state.x+move[0],state.y+move[1],game)||mission.rocks.includes(`${state.x+move[0]},${state.y+move[1]}`)))continue;
      const next=structuredClone(state),effect=move==='wait'?actOrbit(game,next,'wait'):stepOrbit(game,next,...move);
      if(['idle','blocked','barrier','patrol-hit'].includes(effect.kind))continue;
      queue.push([next,[...path,move]]);
    }
  }
  throw new Error(`No safe route to ${target}`);
}
export function followRoute(game,flight,path){for(const move of path)move==='wait'||move==='scan'?actOrbit(game,flight,move):stepOrbit(game,flight,...move);}
export function missionRoute(game,flight){
  const mission=missionFor(game),path=[];
  const go=target=>{const part=routeTo(game,flight,target);followRoute(game,flight,part);path.push(...part);};
  if(mission.relay&&!flight.relay)go(mission.relay);
  for(const target of mission.batteries)go(target);
  for(const target of mission.scans)if(!flight.scanned.includes(target)){go(target);actOrbit(game,flight,'scan');path.push('scan');}
  for(const target of mission.gates.slice(flight.gates))go(target);
  go(mission.finish);return path;
}
