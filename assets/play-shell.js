import { TASKS } from '../data.js';
import { teamSeated } from '../engine.js';
import { contractFor, restInTransit } from './studio-life.js';
import { employeeEvent } from './employee-event.js';
import { assetURL } from '../asset-url.js';

const phases={hire:'Команда',plan:'План',work:'Разработка',event:'Решение',result:'Релиз'};
const steps={hire:1,plan:2,work:3,event:3,result:4};
export function managementBar(expanded,{icon}) {
  return `<div class="management-topbar"><span>Твой проект</span><div class="management-tools"><button class="secondary panel-size-toggle" data-action="panel-size" aria-pressed="${expanded}" aria-label="${expanded?'Свернуть панель и показать офис':'Развернуть панель для удобной работы'}">↕ ${expanded?'Меньше':'Больше'}</button><button class="management-help" data-action="guide-open" aria-label="Ника: помощь с этим шагом"><img src="${assetURL('onboarding/nika-avatar.webp')}" width="28" height="28" alt=""></button><button class="secondary" data-action="workspace" data-id="office" aria-label="Закрыть панель проекта и вернуться в студию">${icon('cross',18)} В студию</button></div></div>`;
}
export function sceneAction(game,busy=false) {
  if(game.stage==='hire')return game.team.length>=3&&teamSeated(game)
    ? {action:'plan',label:busy?'Команда садится…':'Раздать задачи',disabled:busy}
    : {action:'studio-project',label:game.team.length<3?'Нанять команду':'Рассадить команду'};
  if(game.stage==='plan')return TASKS.every(t=>game.assignments[t.id])&&teamSeated(game)
    ? {action:'work',label:busy?'Команда садится…':'Начать смену',disabled:busy}
    : {action:'studio-project',label:'Распределить задачи'};
  if(game.stage==='work')return {action:'tick',label:restInTransit(game)?'Коллега в пути…':'Следующий час',disabled:restInTransit(game)};
  if(game.stage==='event')return {action:'event-open',label:employeeEvent(game)?'Обсудить с коллегой':'Принять решение'};
  return {action:'play-mini',label:'Играть в «Орбиту»'};
}
export function sceneHeader(game,{logo,icon,money,time,soundEnabled,status}) {
  return `<header class="game-topbar scene-header">${logo()}
    <button class="scene-contract" data-action="brief"><span>Заказ ${game.life.completed+(game.stage==='result'?0:1)} · ${steps[game.stage]}/4 ${phases[game.stage]}</span><b>${contractFor(game).name}</b></button>
    <div class="scene-budget"><span>Резерв проекта</span><b>${money(game.budget)}</b></div>
    <div class="play-clock"><div aria-label="Время в студии"><span data-clock="day">${time.now.split(' · ')[1]||'В студии'}</span><b data-clock="now">${time.now.split(' · ')[0]}</b></div><div><span>До показа</span><b data-clock="remaining">${time.remaining}</b></div><span class="sr-only">Показ: <span data-clock="end">${time.end}</span></span>
    <button class="secondary scene-auto" data-action="auto" aria-describedby="play-clock-status" aria-pressed="${!!game.autoPlay}" ${game.stage==='result'?'disabled':''}>${icon(game.autoPlay?'pause':'play',18)}${game.autoPlay?'Пауза':'Авто'}</button><span class="sr-only" id="play-clock-status" data-clock="status">${status}</span></div>
    <div class="scene-header-tools"><button class="scene-tool" data-action="sound" aria-pressed="${soundEnabled}" aria-label="${soundEnabled?'Выключить':'Включить'} звук">${icon('sound',20)}<span>Звук</span></button><button class="scene-tool" data-action="menu" aria-label="Меню игры">${icon('menu',20)}<span>Меню</span></button></div></header>`;
}
export function sceneDock(game,{icon,money,busy,panelOpen}) {
  const next=sceneAction(game,busy), progress=Math.round(TASKS.reduce((n,t)=>n+game.progress[t.id],0)/TASKS.length);
  const descriptions={hire:game.team.length<3?`${game.team.length} из 3 коллег в студии`:'Команда готова к первому шагу',plan:'Пять задач · выбери исполнителей',work:`Готовность проекта ${progress}%`,event:'Смена ждёт твоего решения',result:'Игра готова. Проверь, что получилось'};
  return `<footer class="scene-footer"><div class="scene-next"><div><span>${steps[game.stage]}/4 · ${phases[game.stage]}</span><p>${descriptions[game.stage]}</p></div><button class="primary" data-action="${next.action}" ${next.disabled?'disabled':''}>${next.label}${icon(next.action==='tick'?'clock':'arrow',20)}</button></div>
    <nav class="scene-dock" aria-label="Управление студией"><button data-action="workspace" data-id="office" aria-pressed="${!panelOpen}">${icon('home',20)}<span>Студия</span></button><button data-action="workspace" data-id="project" aria-controls="project-panel" aria-expanded="${panelOpen}" aria-pressed="${panelOpen}">${icon('brief',20)}<span>${game.stage==='hire'?'Найм':game.stage==='result'?'Результат':'Задачи'}</span></button><button data-action="studio-team">${icon('people',20)}<span>Команда <small>${game.team.length}</small></span></button><button data-action="life-office">${icon('settings',20)}<span>Улучшения <small>${money(game.life.cash)}</small></span></button></nav></footer>`;
}
