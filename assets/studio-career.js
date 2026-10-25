import { AGENTS, SKILLS, TASKS, DIFFICULTIES } from '../data.js';
export const isCareer=s=>s?.difficulty==='bootstrap';
export const TRAINING_COST=600;
export const careerPremium=id=>({festival:500,club:900,cup:1300})[id];
export const scorePay=s=>isCareer(s)?5:20;
export const startingSkills=a=>Object.fromEntries(SKILLS.map(k=>[k.key,Math.max(10,Math.round(a.stats[k.key]/3))]));
export function initCareer(s){
  s.life.cash=800;
  s.life.career={version:1,reputation:0,rateOrder:0,skills:Object.fromEntries(AGENTS.map(a=>[a.id,startingSkills(a)])),trained:{},lastGrowth:{},lastResult:null};
  s.timedEvents=false;
}
export function careerFee(s,id,next=false){
  const a=AGENTS.find(a=>a.id===id);if(!a)return 0;
  if(!isCareer(s))return a.cost;
  const order=next?s.life.completed:s.life?.career?.rateOrder||0;
  return Math.round(a.cost/500)*100+Math.min(1200,Math.floor(order/2)*150);
}
export function agentProfile(s,id){
  const a=AGENTS.find(a=>a.id===id);if(!a||!isCareer(s))return a;
  const stats=s.life?.career?.skills[id]||startingSkills(a);
  const strongest=SKILLS.reduce((best,k)=>stats[k.key]>stats[best.key]?k:best,SKILLS[0]);
  const primary=Math.max(stats.code,stats.design,stats.qa,stats.talk),level=primary>=80?'Опытный специалист':primary>=60?'Уверенный специалист':primary>=40?'Растущий специалист':'Начинающий специалист';
  return {...a,stats:{...stats},cost:careerFee(s,id),trait:level,strength:`${strongest.label} ${stats[strongest.key]}`,weakness:'Навыки растут на выполненных задачах и обучении.',desc:level+'. Практика на заказах развивает профильные навыки, обучение позволяет выбрать направление роста.'};
}
export function contractTerms(s,c){
  if(!isCareer(s))return {...c,budget:c.budget+DIFFICULTIES[s.difficulty].budget-36000,deadline:c.deadline+DIFFICULTIES[s.difficulty].deadline-16};
  const tier=Math.min(4,Math.floor((s.life?.completed||0)/2));
  return {...c,budget:8000+tier*1500+({festival:0,club:1000,cup:2000})[c.id],deadline:32+c.deadline-16,reward:({festival:1400,club:2100,cup:2800})[c.id]};
}
export function contractLock(s,id){
  if(!isCareer(s))return '';
  const needed=({festival:0,club:20,cup:45})[id];
  return s.life.career.reputation<needed?`Нужна репутация ${needed} · сейчас ${s.life.career.reputation}`:'';
}
export function trainingLock(s,id,skill){
  if(!isCareer(s)||!s.team.includes(id)||!SKILLS.some(k=>k.key===skill))return 'Выбери сотрудника и навык.';
  if(!['hire','result'].includes(s.stage))return 'Обучение доступно между заказами, до распределения задач.';
  if(s.life.career.trained[id]===s.life.completed)return 'На этом этапе сотрудник уже прошёл обучение.';
  if(s.life.career.skills[id][skill]>=90)return 'Навык уже на пределе программы.';
  if(s.life.cash<TRAINING_COST)return 'В кассе не хватает 600 ₽ на обучение.';
  return '';
}
export function trainEmployee(s,id,skill){
  const error=trainingLock(s,id,skill);if(error)return error;
  const c=s.life.career,old=c.skills[id][skill];s.life.cash-=TRAINING_COST;c.skills[id][skill]=Math.min(90,old+4);c.trained[id]=s.life.completed;
  s.log.push(`${agentProfile(s,id).name}: обучение «${SKILLS.find(k=>k.key===skill).label}» ${old} → ${c.skills[id][skill]}. Из кассы −600 ₽.`);return null;
}
export function releaseIncome(s,result,c){
  const gross=result.passed?c.reward+result.score*scorePay(s):isCareer(s)?900:2000;
  const upkeep=isCareer(s)?300+Math.max(0,s.team.length-3)*100:0;
  return {gross,upkeep,net:Math.max(0,gross-upkeep)};
}
export function finishCareer(s,result){
  if(!isCareer(s))return;
  const c=s.life.career,gains={};
  const add=(id,skill,amount)=>{const old=c.skills[id][skill];c.skills[id][skill]=Math.min(90,old+amount);const actual=c.skills[id][skill]-old;if(actual)(gains[id]||={})[skill]=((gains[id]||{})[skill]||0)+actual;};
  const practiced=new Set();
  for(const task of TASKS){const id=s.assignments[task.id];if(s.progress[task.id]>=100&&s.team.includes(id)){add(id,task.skill,2);practiced.add(id);}}
  for(const id of practiced)add(id,'pace',1);
  if(s.support&&s.progress[s.support.taskId]>=100&&s.team.includes(s.support.agentId))add(s.support.agentId,TASKS.find(t=>t.id===s.support.taskId).skill,2);
  c.reputation=Math.max(0,Math.min(100,c.reputation+(result.passed?10:-5)));c.lastGrowth=gains;c.lastResult={...result,critical:!!result.critical};
}
export function validCareer(s){
  const c=s.life?.career;if(!isCareer(s))return c==null;
  const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
  const known=id=>AGENTS.some(a=>a.id===id);
  return !!c&&c.version===1&&integer(c.reputation,0,100)&&integer(c.rateOrder,0,s.life.completed)
    &&c.skills&&AGENTS.every(a=>c.skills[a.id]&&SKILLS.every(k=>integer(c.skills[a.id][k.key],10,90)))
    &&c.trained&&Object.entries(c.trained).every(([id,n])=>known(id)&&integer(n,0,s.life.completed))
    &&c.lastGrowth&&Object.entries(c.lastGrowth).every(([id,g])=>known(id)&&g&&Object.entries(g).every(([key,n])=>SKILLS.some(k=>k.key===key)&&integer(n,1,90)))
    &&(c.lastResult===null||c.lastResult&&integer(c.lastResult.score,0,100)&&integer(c.lastResult.quality,0,100)&&typeof c.lastResult.passed==='boolean'&&typeof c.lastResult.title==='string'&&typeof c.lastResult.summary==='string'&&typeof c.lastResult.critical==='boolean'&&Number.isFinite(c.lastResult.late)&&c.lastResult.late>=0&&Number.isFinite(c.lastResult.design));
}
