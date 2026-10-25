import { SKILLS } from '../data.js';
import { salaryInbox } from './employment-view.js';
import { agentProfile, isCareer, TRAINING_COST, trainingLock } from './studio-career.js';
import { studioCapacity } from './studio-progression.js';
import { memberPortrait } from './studio-visuals.js';
const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
const skillName=key=>SKILLS.find(k=>k.key===key).label;
export function careerSummary(s){
  if(!isCareer(s))return '';
  const c=s.life.career;
  return `<section class="career-summary"><span>СТУДИЯ С НУЛЯ<b>Репутация ${c.reputation}/100 · заказов ${s.life.completed}</b></span><button class="secondary" data-action="career">Развитие →</button></section>`;
}
export function trainingPanel(s,id){
  if(!isCareer(s))return '';
  const a=agentProfile(s,id),reason=trainingLock(s,id,SKILLS.find(k=>a.stats[k.key]<90)?.key||'code');
  return `<section class="career-training"><h3>Развитие навыков</h3><p>Практика: +2 к навыку за готовую задачу, +1 к темпу за заказ. Обучение: до +4 к выбранному навыку за ${money(TRAINING_COST)}.</p><div class="career-skills">${SKILLS.map(k=>`<div><span>${k.label}</span><b>${a.stats[k.key]}</b><meter min="0" max="100" value="${a.stats[k.key]}" aria-label="${k.label}"></meter></div>`).join('')}</div><div class="career-training-actions">${SKILLS.map(k=>{const lock=trainingLock(s,id,k.key);return `<button class="secondary" data-action="career-train-preview" data-id="${id}" data-skill="${k.key}" ${lock?'disabled':''}>${k.label} +${Math.min(4,90-a.stats[k.key])}</button>`;}).join('')}</div><p class="small-muted">${reason||'Выбери программу. Один курс сотруднику между заказами; максимум навыка 90.'}</p></section>`;
}
export function careerResult(s){
  if(!isCareer(s))return '';
  const c=s.life.career,h=s.life.history.at(-1);
  return `<section class="studio-career-result"><h2>Студия становится сильнее</h2><p>Оценка относится к завершённому проекту; новые навыки помогут в следующем заказе.</p><p>Репутация ${c.reputation}/100 · закрыто заказов ${s.life.completed}</p>${h?`<div class="career-ledger"><span>Выплата<b>+${money(h.gross)}</b></span><span>Расходы студии<b>−${money(h.upkeep)}</b></span><span>В кассу<b>+${money(h.reward)}</b></span></div>`:''}${salaryInbox(s)}<div class="career-growth">${Object.entries(c.lastGrowth).map(([id,g])=>`<article>${memberPortrait(agentProfile(s,id))}<div><b>${agentProfile(s,id).name}</b><span>${Object.entries(g).map(([key,n])=>`${skillName(key)} +${n}`).join(' · ')}</span></div></article>`).join('')}</div><button class="secondary" data-action="career">Развитие и цели →</button></section>`;
}
export function careerPanel(s){
  const c=s.life.career;
  const profile=s.team.length?Math.round(s.team.reduce((sum,id)=>sum+Math.max(...['code','design','qa','talk'].map(key=>c.skills[id][key])),0)/s.team.length):0;
  const goals=[['Первый завершённый заказ',s.life.completed>=1,`${Math.min(1,s.life.completed)}/1`],['Заказы исследователей',c.reputation>=20,`Репутация ${c.reputation}/20`],['Кубок пилотов',c.reputation>=45,`Репутация ${c.reputation}/45`],['Четыре рабочих места',studioCapacity(s)>=4,`${studioCapacity(s)}/4`],['Профильные навыки команды',profile>=45,`${profile}/45`],['Восемь заказов и репутация 60',s.life.completed>=8&&c.reputation>=60,`${s.life.completed}/8 · репутация ${c.reputation}/60`]];
  const stable=goals.every(g=>g[1]);
  return `<div class="eyebrow">ДОЛГАЯ КАРЬЕРА</div><h2 id="dialog-title">${stable?'Студия встала на ноги':'Из маленькой команды — в студию'}</h2><p>Зарабатывай на небольших заказах, развивай людей и выбирай, на что хватит кассы.</p><div class="career-ledger"><span>В кассе<b>${money(s.life.cash)}</b></span><span>Репутация<b>${c.reputation}/100</b></span><span>Заказы<b>${s.life.completed}</b></span></div>${salaryInbox(s)}<div class="career-goals">${goals.map(([label,done,value])=>`<article data-complete="${done}"><b>${done?'✓':'○'} ${label}</b><span>${value}</span></article>`).join('')}</div><h3>Твоя команда</h3><div class="career-roster">${s.team.map(id=>{const a=agentProfile(s,id);return `<button class="secondary" data-action="life-member" data-id="${id}">${memberPortrait(a)}<span><b>${a.name}</b><small>Код ${a.stats.code} · дизайн ${a.stats.design} · тесты ${a.stats.qa}</small></span><span aria-hidden="true">→</span></button>`;}).join('')}</div><details class="life-history"><summary>Экономика карьеры</summary><p>Заказчик оплачивает состав из бюджета проекта. Выплата за релиз пополняет кассу после расходов: 300 ₽ за студию и 100 ₽ за каждого сотрудника сверх трёх. Прохождение миссии оплачивается отдельно.</p><p>Каждые два завершённых заказа оплата сотрудника за следующий проект растёт на 150 ₽, максимум +1 200 ₽. Одновременно увеличиваются бюджеты заказов. Репутация: +10 за успешный релиз, −5 за неудачу. Даже неудачный проект даёт опыт за реально выполненные задачи.</p><p>Обучение за 600 ₽ доступно после релиза или при сборе команды. Один курс каждому между заказами. Совместный разбор выполненной задачи дополнительно закрепляет +2 к навыку после релиза.</p></details><button class="primary full" data-action="close-dialog">${stable?'Продолжить развивать студию':'Вернуться в студию'}</button>`;
}
