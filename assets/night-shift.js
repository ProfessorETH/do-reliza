import { TASKS, AGENTS } from '../data.js';
import { shiftMinutes, shiftTime } from './shift-clock.js';
const clamp=n=>Math.max(0,Math.min(100,n));
export function nightShift(s){
  const minute=shiftMinutes(s),hour=minute%1440/60;
  return {active:hour>=22||hour<6,hour,night:Math.floor((minute-360)/1440)};
}
export function ensureNight(s){return s.life.night??={version:1,lastAsked:-1,lastDecision:null,lastRest:null};}
export function overnightPreview(s){
  const minute=shiftMinutes(s),wake=Math.floor(minute/1440)*1440+540;
  const target=wake<=minute?wake+1440:wake,hours=(target-minute)/60;
  const time=(target-540)/60;
  return {hours,time,energy:Math.min(90,Math.round(hours*10)),stress:Math.min(35,Math.round(hours*4)),morale:8,late:Math.max(0,time-s.deadline),remaining:s.deadline-time,wake:shiftTime({...s,time,clockFraction:0}).now};
}
export function scheduleNight(s){
  if(s.stage!=='work'||!s.team.length||s.life.incident||!TASKS.some(t=>s.progress[t.id]<100))return false;
  const n=nightShift(s),state=ensureNight(s);if(!n.active||state.lastAsked>=n.night)return false;
  const id=s.team.reduce((a,b)=>s.life.members[a].energy<=s.life.members[b].energy?a:b);
  state.lastAsked=n.night;s.life.incident={type:'night',id};s.currentEvent='life';s.stage='event';
  s.log.push(`${AGENTS.find(a=>a.id===id).name}: уже ночь, команда просит закончить смену.`);return true;
}
export function nightDecision(s,choice){
  const event=s.stage==='event'&&s.currentEvent==='life'&&s.life.incident?.type==='night';
  if(!event&&!(s.stage==='work'&&choice==='rest'))return 'Отдых до утра доступен ночью во время работы.';
  if(!nightShift(s).active||!['rest','work'].includes(choice))return 'Выбери ночной режим работы.';
  const n=ensureNight(s),preview=overnightPreview(s),before=s.time+(s.clockFraction||0);n.lastAsked=Math.max(n.lastAsked,nightShift(s).night);
  if(choice==='rest'){
    s.time=preview.time;s.clockFraction=0;
    for(const id of s.team){const m=s.life.members[id];m.energy=clamp(m.energy+preview.energy);m.stress=clamp(m.stress-preview.stress);m.morale=clamp(m.morale+8);m.breaks=0;m.restTrip=null;m.coffeeTrip=null;m.coffee=false;s.workload[id]=0;}
    n.lastRest={from:before,to:s.time,hours:preview.hours};
    s.log.push(`Команда ушла отдыхать до ${preview.wake}. Прошло ${Number(preview.hours.toFixed(2))} ч без работы над задачами. Энергия до +${preview.energy}, напряжение до −${preview.stress}, настроение до +8. ${preview.late?`Уже опаздываем на ${Number(preview.late.toFixed(2))} ч.`:`До показа ${Number(preview.remaining.toFixed(2))} ч.`}`);
  }else{
    for(const id of s.team){const m=s.life.members[id];m.morale=clamp(m.morale-5);m.stress=clamp(m.stress+5);}
    s.log.push('Продолжаем работать ночью ради дедлайна: работающий сотрудник теряет 12 энергии за час вместо 7, получает ещё +2 напряжения и −1 настроения. Решение: настроение команды −5, напряжение +5. Отправить команду домой можно до 06:00.');
  }
  n.lastDecision={night:n.lastAsked,choice,time:s.time};
  if(event){s.life.incident=null;s.currentEvent=null;s.stage='work';}
  delete s.eventClock;return null;
}
export function validNight(s){
  const n=s.life?.night;if(n===undefined)return true;
  const finite=x=>Number.isFinite(x)&&x>=0;
  return n&&n.version===1&&Number.isSafeInteger(n.lastAsked)&&n.lastAsked>=-1&&n.lastAsked<=nightShift(s).night
    &&(n.lastDecision===null||n.lastDecision&&['rest','work'].includes(n.lastDecision.choice)&&Number.isSafeInteger(n.lastDecision.night)&&n.lastDecision.night>=0&&n.lastDecision.night<=n.lastAsked&&finite(n.lastDecision.time)&&n.lastDecision.time<=s.time)
    &&(n.lastRest===null||n.lastRest&&finite(n.lastRest.from)&&finite(n.lastRest.to)&&n.lastRest.to<=s.time&&n.lastRest.to>n.lastRest.from&&n.lastRest.to%24===0&&Number.isFinite(n.lastRest.hours)&&n.lastRest.hours>0&&n.lastRest.hours<=11&&Math.abs(n.lastRest.to-n.lastRest.from-n.lastRest.hours)<.00001);
}
