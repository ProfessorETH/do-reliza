import { AGENTS } from '../data.js';
export const COFFEE_TIMING={pick:1.2,drink:3.6,put:1.1};
export const coffeeInTransit=s=>s.team.some(id=>s.life?.members[id]?.coffeeTrip&&s.life.members[id].coffeeTrip.phase!=='queued');
export function callNextCoffee(s) {
  if(coffeeInTransit(s))return;
  const id=s.team.filter(id=>s.life.members[id].coffeeTrip?.phase==='queued').sort((a,b)=>s.life.members[a].coffeeTrip.request-s.life.members[b].coffeeTrip.request)[0];
  if(id)s.life.members[id].coffeeTrip.phase='outbound';
}
export function requestCoffee(s,id) {
  const m=s.life.members[id];
  if(s.stage!=='work'||!s.life.upgrades.includes('coffee'))return 'Напиток доступен во время смены после покупки кофейной станции.';
  if(m.coffee||m.coffeeTrip||m.restTrip)return 'Напиток уже получен, заказан или сотрудник отдыхает.';
  const request=1+Math.max(0,...s.team.map(id=>s.life.members[id].coffeeTrip?.request||0));
  m.coffeeTrip={phase:'queued',slot:s.team.indexOf(id),request};callNextCoffee(s);
  s.log.push(`${AGENTS.find(a=>a.id===id).name}: ${m.coffeeTrip.phase==='queued'?'ждёт свободную кофейную станцию':'идёт за напитком'}. Энергия восстановится после напитка.`);
  return null;
}
export function coffeeArrival(s,id,arrival) {
  const m=s.life?.members[id],trip=m?.coffeeTrip;
  if(!s.team.includes(id)||!trip)return false;
  if(arrival==='station'&&trip.phase==='outbound'){trip.phase='drinking';return true;}
  if(arrival==='drank'&&trip.phase==='drinking'&&!m.coffee){
    m.coffee=true;m.energy=Math.min(100,m.energy+15);m.morale=Math.min(100,m.morale+5);trip.phase='returning';
    s.log.push(`${AGENTS.find(a=>a.id===id).name} выпил напиток: энергия +15, настроение +5. Возвращается к работе.`);return true;
  }
  if(arrival==='back'&&trip.phase==='returning'){m.coffeeTrip=null;callNextCoffee(s);return true;}
  return false;
}
export function validCoffeeTrips(s) {
  let active=0;
  return AGENTS.every(a=>{
    const m=s.life?.members?.[a.id],t=m?.coffeeTrip;if(t==null)return true;
    if(t.phase!=='queued')active++;
    return s.team.includes(a.id)&&s.life.upgrades.includes('coffee')&&!m.restTrip&&['work','event','result'].includes(s.stage)
      &&['queued','outbound','drinking','returning'].includes(t.phase)&&t.slot===s.team.indexOf(a.id)
      &&Number.isSafeInteger(t.request)&&t.request>0&&(t.phase==='returning'?m.coffee===true:!m.coffee);
  })&&active<=1;
}
const fallbackTimers=new WeakMap();
export function settleCoffeeFallback(s,callback) {
  let timers=fallbackTimers.get(s);if(!timers){timers=new Map();fallbackTimers.set(s,timers);}
  for(const id of s.team){
    const t=s.life?.members[id]?.coffeeTrip;if(!t||t.phase==='queued')continue;
    const phase=t.phase,request=t.request;const key=id+':'+request+':'+phase;if(timers.has(key))continue;
    timers.set(key,true);
    setTimeout(()=>{timers.delete(key);const current=s.life?.members[id]?.coffeeTrip;if(current?.request!==request||current?.phase!==phase)return;callback?.(id,{outbound:'station',drinking:'drank',returning:'back'}[phase],s);},phase==='drinking'?COFFEE_TIMING.drink*1000:600);
  }
}

export function coffeeMotion(state,time,reduced=false){
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
  const active=['coffee-pick','coffee-drink','coffee-put'].includes(state);
  const sip=state==='coffee-drink'?smooth(time/.7)*(1-smooth((time-2.8)/.7)):0;
  return {active,sip,reach:state==='coffee-pick'?smooth(time/.65):state==='coffee-put'?1-smooth((time-.65)/.45):active?1:0,
    holding:state==='coffee-drink'||state==='coffee-pick'&&time>=.8||state==='coffee-put'&&time<.8,
    tilt:sip*(.32+(reduced?0:Math.sin(time*4)*.035))};
}
