import { ALL_DESKS, distance, findOfficePath, isChairClear, isWalkable } from '../office-layout.js';
import { UPGRADE_COPY } from './studio-visuals.js';

const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export const REACTION_SECONDS=3;
export function reactionForChanges(changes) {
  const value=key=>changes.find(c=>c.key===key)?.delta||0;
  if(value('morale')<0||value('stress')>0)return 'sad';
  if(value('stress')<0)return 'calm';
  return value('morale')>0||value('energy')>0?'joy':'calm';
}
export function reactionMotion(kind,time,reduced=false) {
  const strength=smooth(time/.28)*(1-smooth((time-1.75)/1.25));
  const wave=reduced?0:Math.sin(time*5)*Math.exp(-time*.7);
  return {kind,strength:strength*(reduced ? .4 : 1),wave};
}

export const UPGRADE_LOOK={coffee:[-1,-3.4],lounge:[-3.68,2.77],quiet:[1.4,-1.95],computers:[-2.65,-1.95],desk4:[6.6,-1.95],desk5:[6.6,1.45]};
export function inspectionSpots(id,capacity) {
  const focus=UPGRADE_LOOK[id];if(!focus)return [];
  const points=[];
  for(const radius of [1.1,1.5,1.9,2.3])for(let i=0;i<16;i++){
    const p=[focus[0]+Math.cos(i*Math.PI/8)*radius,focus[1]+Math.sin(i*Math.PI/8)*radius];
    if(isWalkable(p,undefined,capacity)&&isChairClear(p,capacity))points.push(p);
  }
  return points;
}
export function planInspection(game,id,actors) {
  const look=UPGRADE_LOOK[id],spots=inspectionSpots(id,game.seats.length);if(!look)return [];
  const eligible=actors.filter(a=>!a.visit&&!game.life.members[a.id]?.restTrip&&['seated','idle'].includes(a.state));
  eligible.sort((a,b)=>distance(a.point,look)-distance(b.point,look));
  const result=[];
  for(const a of eligible){
    const seat=game.seats.indexOf(a.id),start=seat>=0?[ALL_DESKS[seat].seat[0]+.72,ALL_DESKS[seat].seat[1]+.4]:a.point;
    const candidates=spots.filter(p=>result.every(r=>distance(p,r.point)>.8)).sort((p,q)=>distance(start,p)+distance(p,look)*.65-distance(start,q)-distance(q,look)*.65);
    for(const point of candidates){
      if(findOfficePath(start,point,true,game.seats.length)!==null){result.push({id:a.id,point,look,label:UPGRADE_COPY[id][0],delay:result.length*.9+.4});break;}
    }
    if(result.length===2)break;
  }
  return result;
}
