import { activeTasks, fit } from '../engine.js';
import { freshOfficeChatter } from './office-chatter-state.js';

export function selectOfficeConversation(s,now) {
  if(s?.stage!=='work')return null;
  const m=s.officeChatter||freshOfficeChatter();
  if(now<m.nextAt || m.hour===s.time && m.count>=2)return null;
  const present=s.team.filter(id=>s.seats.includes(id)&&s.life.members[id]&&!s.life.members[id].restTrip&&!s.life.members[id].coffeeTrip&&!s.life.members[id].breaks);
  if(present.length<2)return null;
  const running=activeTasks(s).filter(t=>present.includes(s.assignments[t.id])),candidates=[];
  const add=(id,topic,kind,reply,priority)=>{
    for(const other of present.filter(other=>other!==id)){
      const lines=[{id,kind,listenerId:other},{id:other,kind:reply,listenerId:id}];
      const clipKeys=lines.map(line=>`${line.id}-${line.kind}`);
      // The previous exchange never repeats, including after a reload.
      if(clipKeys.some(key=>m.recent.slice(-2).includes(key)))continue;
      const novelty=clipKeys.reduce((sum,key)=>sum+(m.recent.includes(key)?m.recent.length-m.recent.indexOf(key):30),0);
      const listener=s.life.members[other],available=listener.energy>=35&&listener.stress<75?10:0;
      candidates.push({topic,lines,score:priority-(m.lastTopic===topic?30:0)+novelty+available});
    }
  };
  for(const t of running){
    const id=s.assignments[t.id],member=s.life.members[id],progress=s.progress[t.id];
    add(id,progress>=70?'handoff':'progress','chat-progress','chat-ready',40);
    if(fit(id,t,s)<65&&s.time>=2&&progress<75)add(id,'stuck','chat-stuck','chat-help',110);
    if(member.energy<45||member.stress>=60)add(id,'tired','chat-tired','chat-help',130);
    if(s.deadline-s.time<=3)add(id,'deadline','chat-deadline','chat-ready',155);
  }
  // Rotation resolves equal scores without resetting the sequence on reload.
  candidates.sort((a,b)=>b.score-a.score);
  const best=candidates.filter(c=>c.score===candidates[0]?.score);
  return best.length?best[m.turn%best.length]:null;
}
