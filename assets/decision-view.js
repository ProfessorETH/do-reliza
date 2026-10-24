import { EVENTS, AGENTS } from '../data.js';
import { INCIDENTS } from './studio-life.js';
import { memberPortrait, visualIcon } from './studio-visuals.js';

const pill=(label,tone='neutral')=>({label,tone});
export function decisionChoices(s) {
  if(s.currentEvent==='life') {
    const incident=s.life.incident, type=incident.type, covered=s.life.upgrades.includes(INCIDENTS[type].upgrade);
    const scope=type==='tension'?'Оба участника':type==='idea'?'Вся команда':'Сотрудник';
    const care=type==='idea'?[pill('+1 ч','cost'),pill('Настроение команды +8','good')]:type==='tension'?[pill('+1 ч','cost'),pill('Напряжение обоих −18','good'),pill('Настроение обоих +8','good')]:[pill(covered?'Без задержки':'+1 ч',covered?'good':'cost'),pill('Напряжение −12','good'),pill('Настроение +6','good')];
    const wait=type==='idea'?[pill('Без задержки'),pill('Настроение автора +2','good')]:[pill('Без задержки'),pill('Напряжение +10','bad'),pill('Настроение −8','bad')];
    return [{id:'life-care',title:INCIDENTS[type].care,icon:type==='idea'?'mood':'talk',scope,effects:care,note:covered?'Улучшение офиса экономит час.':''},{id:'life-wait',title:type==='idea'?'Записать на потом':'Отложить до релиза',icon:'rest',scope:type==='idea'?'Автор находки':scope,effects:wait}];
  }
  const effects={
    focus:[pill('Без затрат'),pill('Доверие +4','good'),pill('Без щита')],
    shield:[pill('Резерв −2 000 ₽','cost'),pill('Объём кода +2 ч','cost'),pill('Щит в игре','good'),pill('Доверие +6','good')],
    swap:[pill('Объём кода +1 ч','cost'),pill('Визуал −12','bad'),pill('Щит в игре','good'),pill('Доверие +2','good')],
    'review-fix':[pill('+1 ч','cost'),pill('Астероиды останавливают корабль','good'),pill('Доверие +3','good')],
    'review-pair':[pill('+2 ч','cost'),pill('Астероиды + защита границы','good'),pill('Доверие +7','good')],
    'review-skip':[pill('Без задержки'),pill('Полёт сквозь астероиды','bad'),pill('Доверие −20','bad')],
    fix:[pill('Резерв −1 500 ₽','cost'),pill('+2 ч','cost'),pill('Сохранение работает','good'),pill('Доверие +6','good')],
    cut:[pill('Без задержки'),pill('Игра без сохранения','cost'),pill('Доверие −6','bad')],
    ignore:[pill('Без задержки'),pill('Прогресс теряется','bad'),pill('Доверие −24','bad')],
  };
  return EVENTS[s.currentEvent].options.map(o=>({...o,effects:effects[o.id],icon:s.currentEvent==='scope'?'focus':s.currentEvent==='bug'?'info':'talk',note:['bug','review'].includes(s.currentEvent)?(['ignore','review-skip'].includes(o.id)?'У сотрудника: настроение −8 · напряжение +10':'У сотрудника: настроение +5 · напряжение −8'):'',cost:o.id==='shield'?2000:o.id==='fix'?1500:0}));
}

export const effectPills=items=>`<span class="effect-pills">${items.map(p=>`<span class="effect-pill" data-tone="${p.tone}">${p.label}</span>`).join('')}</span>`;

export function renderDecisionPanel(s) {
  const life=s.currentEvent==='life', incident=s.life.incident;
  const ev=life?INCIDENTS[incident.type]:EVENTS[s.currentEvent];
  const ids=life?[incident.id,...(incident.otherId?[incident.otherId]:[])]:[s.assignments[s.currentEvent==='bug'?'qa':s.currentEvent==='review'?'code':'brief']];
  const people=ids.map(id=>AGENTS.find(a=>a.id===id));
  const summary=life?({noise:'Шум мешает сосредоточиться.',computer:'Сборка зависла. Коллеге нужна помощь.',idea:'У коллеги удачная находка. Поделимся с командой?',tension:'Двое спорят и не слышат друг друга.'})[incident.type]:({scope:'Заказчик просит щит. Выбери объём этого релиза.',review:'Корабль замечает астероид после столкновения.',bug:'После перезапуска собранная энергия теряется.'})[s.currentEvent];
  return `<div class="decision-scene" data-kind="${life?incident.type:s.currentEvent}"><div class="decision-people">${people.map(a=>`<span>${memberPortrait(a)}<b>${a.name}</b></span>`).join('')}</div><div class="decision-symbol" aria-hidden="true">${visualIcon(life?(incident.type==='idea'?'mood':incident.type==='computer'?'info':'talk'):s.currentEvent==='scope'?'focus':'info',48)}</div><span>${life?'Жизнь команды':ev.tag}</span></div><div class="panel-header event-copy"><h1>${ev.title}</h1><p>${summary}</p></div><div class="event-options visual-decisions">${decisionChoices(s).map(o=>`<button class="event-option decision-card" data-action="decision" data-id="${o.id}" ${s.budget<(o.cost||0)?'disabled':''}><span class="decision-icon">${visualIcon(o.icon,26)}</span><span class="decision-body"><b>${o.title}</b>${o.scope?`<span class="decision-scope">${o.scope}</span>`:''}${effectPills(o.effects)}${s.budget<(o.cost||0)?`<span class="decision-note">Не хватает ${new Intl.NumberFormat('ru-RU').format(o.cost-s.budget)} ₽ резерва</span>`:o.note?`<span class="decision-note">${o.note}</span>`:''}</span><span class="decision-arrow" aria-hidden="true">→</span></button>`).join('')}</div><details class="decision-details"><summary>Контекст и подробности</summary><p>${ev.text}</p>${life?'':ev.options.map(o=>`<p><b>${o.title}.</b> ${o.text}</p>`).join('')+`<p>${ev.lesson}</p>`}</details>`;
}
