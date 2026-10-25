import { AGENTS, TASKS } from '../data.js';
const career=s=>s?.difficulty==='bootstrap';
const clamp=n=>Math.max(0,Math.min(100,n));
const fresh=()=>({experience:0,reviewed:0,bonus:0,request:0,status:'settled',risk:0,decisionOrder:0});
export function ensureEmployment(s){
  if(!career(s))return null;
  const c=s.life.career;
  c.employment??=Object.fromEntries(AGENTS.map(a=>[a.id,fresh()]));
  return c.employment;
}
export const employment=(s,id)=>career(s)?s.life?.career?.employment?.[id]:null;
export const salaryBonus=(s,id)=>(s.life.members[id].raises||0)*1000+(employment(s,id)?.bonus||0);
export const pendingSalary=s=>career(s)?s.team.filter(id=>employment(s,id)?.status==='pending'):[];
export function requestSalary(s,id){
  const e=ensureEmployment(s)?.[id];if(!e||e.status!=='settled'||e.bonus>=900||e.experience<1||e.experience+1-e.reviewed<2)return false;
  const stats=s.life.career.skills[id];
  e.request=Math.min(900-e.bonus,200+Math.floor(Math.max(stats.code,stats.design,stats.qa,stats.talk)/20)*50);
  e.reviewed=e.experience+1;e.status='pending';
  s.log.push(`${AGENTS.find(a=>a.id===id).name} просит прибавку ${e.request} ₽ за заказ: накопился опыт.`);
  return true;
}
// Stable roll from the saved order/employee, never re-rolled by rendering or reload.
export function departureRoll(s,id){
  let n=s.life.seed^s.life.completed;for(const ch of id)n=Math.imul(n^ch.charCodeAt(0),16777619);
  return (n>>>0)%100;
}
export function settleEmployment(s){
  const all=ensureEmployment(s);if(!all)return;
  for(const id of s.team){
    const e=all[id],m=s.life.members[id];
    const worked=TASKS.some(t=>s.assignments[t.id]===id&&s.progress[t.id]>=100);
    if(worked){requestSalary(s,id);e.experience++;}
    if(e.status==='deferred'&&s.life.completed>e.decisionOrder){
      const risk=Math.min(90,e.risk+(m.morale<35?15:0));
      if(departureRoll(s,id)<risk){e.status='leaving';if(!s.life.departures.includes(id))s.life.departures.push(id);m.morale=clamp(m.morale-10);s.log.push(`${AGENTS.find(a=>a.id===id).name}: прибавку отложили, сотрудник решил уйти после заказа. Можно предложить новые условия до следующего заказа.`);}
      else{e.status='pending';e.risk=Math.min(90,e.risk+20);s.log.push(`${AGENTS.find(a=>a.id===id).name} остаётся, но снова просит обсудить оплату. Риск следующего отказа вырос.`);}
    }
  }
}
export function salaryDecision(s,id,choice){
  if(!career(s)||!s.team.includes(id))return 'Выбери сотрудника карьерной команды.';
  const e=ensureEmployment(s)[id],m=s.life.members[id];
  const event=s.stage==='event'&&s.currentEvent==='life'&&s.life.incident?.type==='salary'&&s.life.incident.id===id;
  if(!event&&s.stage!=='result')return 'Оплату обсуждаем в событии сотрудника или после релиза.';
  if(!['pending','deferred','leaving'].includes(e.status)||!e.request)return 'Сейчас нет запроса на прибавку.';
  if(!['accept','defer','replace'].includes(choice))return 'Выбери решение по оплате.';
  if(choice==='defer'&&e.status!=='pending')return 'Решение уже принято. Можно удержать сотрудника или найти замену.';
  const name=AGENTS.find(a=>a.id===id).name;
  if(choice==='accept'){
    if(s.life.cash<e.request)return `В кассе нужно ${e.request} ₽ на первую прибавку.`;
    s.life.cash-=e.request;e.bonus+=e.request;e.reviewed=Math.max(e.reviewed,e.experience+(event?1:0));e.status='settled';e.risk=0;e.request=0;m.morale=clamp(m.morale+15);m.stress=clamp(m.stress-8);m.warnings=0;
    s.life.departures=s.life.departures.filter(x=>x!==id);
    s.log.push(`${name}: прибавка согласована, доплата теперь ${e.bonus} ₽ за каждый заказ. Первая прибавка выплачена из кассы сейчас. Настроение +15, напряжение −8.`);
  }else if(choice==='defer'){
    e.status='deferred';e.risk=Math.min(90,Math.max(35,e.risk));e.decisionOrder=s.life.completed+(event?1:0);m.morale=clamp(m.morale-12);m.stress=clamp(m.stress+8);
    s.log.push(`${name}: прибавка отложена на один следующий заказ. Настроение −12; риск ухода после него ${e.risk}% (+15 п.п. при настроении ниже 35).`);
  }else{
    e.status='leaving';m.morale=clamp(m.morale-8);if(!s.life.departures.includes(id))s.life.departures.push(id);
    s.log.push(`${name}: договорились закончить заказ и не продлевать контракт. Следующий заказ потребует замены.`);
  }
  return null;
}
export function endEmployment(s,ids){
  const all=ensureEmployment(s);if(!all)return;
  for(const id of ids){const e=all[id];e.bonus=0;e.request=0;e.status='settled';e.risk=0;e.reviewed=e.experience;}
}
export function employmentCondition(s,id){
  const e=employment(s,id);if(!e)return null;
  return e.status==='pending'?{label:'Просит прибавку',reason:`Опыт вырос. Хочет +${e.request} ₽ за заказ. Обсуди оплату.`,factor:1}:e.status==='leaving'?{label:'Планирует уйти',reason:'Контракт заканчивается после этого заказа. До следующего можно пересогласовать оплату.',factor:1}:e.status==='deferred'?{label:'Ждёт пересмотра оплаты',reason:`Прибавка отложена: риск ухода ${e.risk}% после следующего заказа, +15 п.п. при настроении ниже 35 (до 90%).`,factor:1}:null;
}
export function validEmployment(s){
  const all=s.life?.career?.employment;if(all===undefined)return true;
  const int=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
  return !!all&&AGENTS.every(a=>{const e=all[a.id];return e&&['settled','pending','deferred','leaving'].includes(e.status)&&['experience','reviewed','decisionOrder'].every(k=>int(e[k]))&&int(e.bonus,0,900)&&int(e.request,0,450)&&e.bonus+e.request<=900&&int(e.risk,0,90)&&(e.status==='settled'?e.request===0:e.request>0)&&e.decisionOrder<=s.life.completed+1;});
}
