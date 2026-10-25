import { OFFICE_CHATTER_LINES } from './office-chatter-lines.js';

const keys=new Set(Object.entries(OFFICE_CHATTER_LINES).flatMap(([id,lines])=>Object.keys(lines).map(kind=>`${id}-${kind}`)));
export const freshOfficeChatter=()=>({version:1,recent:[],turn:0,hour:0,count:0,nextAt:0,lastTopic:''});
export function validOfficeChatter(s) {
  const m=s.officeChatter;if(m===undefined)return true;
  return !!m && m.version===1 && Array.isArray(m.recent) && m.recent.length<=24 && new Set(m.recent).size===m.recent.length && m.recent.every(key=>keys.has(key))
    && Number.isInteger(m.turn) && m.turn>=0 && m.turn<10000 && Number.isFinite(m.hour) && m.hour>=0
    && Number.isInteger(m.count) && m.count>=0 && m.count<=2 && Number.isFinite(m.nextAt) && m.nextAt>=0
    && ['','progress','handoff','stuck','tired','deadline'].includes(m.lastTopic);
}
export function reserveOfficeConversation(s,choice,now) {
  const m=s.officeChatter??=freshOfficeChatter();
  if(m.hour!==s.time){m.hour=s.time;m.count=0;}
  m.count++;m.turn=(m.turn+1)%10000;m.lastTopic=choice.topic;m.nextAt=now+46000;
}
export function rememberOfficeLine(s,line) {
  const m=s.officeChatter??=freshOfficeChatter(),key=`${line.id}-${line.kind}`;
  m.recent=[...m.recent.filter(k=>k!==key),key].slice(-24);
}
export function carryOfficeChatter(s) {
  return s.officeChatter?{...s.officeChatter,recent:[...s.officeChatter.recent],hour:0,count:0}:undefined;
}
