import { createOnboarding } from './assets/onboarding/onboarding.js?v=1';
import { WAITING } from './office-layout.js';
import { mountOfficeWorld, detachOfficeWorld, resetOfficeWorld, officeCamera, canWalkTo } from './office-world.js';
import { renderOffice } from './office.js';
import { AGENTS, TASKS, SKILLS, DIFFICULTIES, EVENTS } from './data.js';
import { createGame, agentById, hire, beginPlan, assign, fit as baseFit, recommend, beginWork, tick, taskStatus, activeTasks, resolveEvent, getResult, validSave, supportTask, restoreOffice, seatAgent, teamSeated, walkInOffice } from './engine.js';

const root = document.querySelector('#app');
const dialog = document.querySelector('#info-dialog');
const SAVE = 'before-release-v1';
const MINI = 'before-release-orbit-v1';
let officeSelection = null, officeMoving = false;
let game = null, candidate = 'mira', difficulty = 'calm', automatic = null, saved = null, savingAvailable = true, mini = null;
const fit = (id, task) => baseFit(id, task, game);
const onboarding = createOnboarding({ storageKey: `${SAVE}-onboarding-v1`, pause: stopAuto, refresh: render });
try { const raw = JSON.parse(localStorage.getItem(SAVE)); if (validSave(raw)) saved = restoreOffice(raw); } catch { /* No usable saved session. */ }
const money = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const icon = (name, size = 20) => {
  const p = { arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M4 5V3h14v2m-3 7h6v4h-6z"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>', cross: '<path d="m6 6 12 12M6 18 18 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    play: '<path d="m8 5 11 7-11 7z"/>', pause: '<path d="M8 5v14M16 5v14"/>', star: '<path d="m12 3 3 6 6 1-4.5 4.5 1 6-5.5-3-5.5 3 1-6L3 10l6-1z"/>',
    bolt: '<path d="m14 2-9 12h7l-2 8 9-12h-7z"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    rocket: '<path d="M9 15 5 19m4-4 6-6m-6 6-4-1 2-6 5-1 3-4 6-1-1 6-4 3-1 5-6 2-1-4z"/><circle cx="16" cy="7" r="1"/>',
    reset: '<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>', sound: '<path d="m4 9 5 0 5-4v14l-5-4H4zm13-1a6 6 0 0 1 0 8"/>',
    brief: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zm0 9h6m-6 4h4"/>',
    flag: '<path d="M5 22V3m0 1h14l-3 5 3 5H5"/>',
  }[name] || '<circle cx="12" cy="12" r="7"/>';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
};
const portrait = (a, extra = '') => `<span class="portrait ${extra}" role="img" aria-label="${a.name}" style="--px:${(a.index % 3) * 50}%;--py:${Math.floor(a.index / 3) * 100}%;--agent:${a.color}"></span>`;
const logo = () => `<span class="brand">ДО РЕЛИЗА<span class="brand-period">.</span><small>СИМУЛЯТОР ТИМЛИДА</small></span>`;
const badge = (text, cls = '') => `<span class="badge ${cls}">${text}</span>`;
function persist() {
  if (!game) return;
  try { localStorage.setItem(SAVE, JSON.stringify(game)); saved = structuredClone(game); savingAvailable = true; }
  catch { savingAvailable = false; }
}
let toastTimeout;
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('visible'), 3400); }
function stopAuto() { clearInterval(automatic); automatic = null; }
function showDialog(html) { if (automatic) { stopAuto(); render(); } document.querySelector('#dialog-content').innerHTML = `<button class="icon-btn dialog-close" data-action="close-dialog" aria-label="Закрыть окно">${icon('cross')}</button>${html}`; if (!dialog.open) dialog.showModal(); }
function radar(a) {
  const point = (i, value) => { const ang = -Math.PI / 2 + i * Math.PI * 2 / 5; return [150 + Math.cos(ang) * 77 * value, 112 + Math.sin(ang) * 77 * value]; };
  const ring = r => SKILLS.map((_, i) => point(i, r).join(',')).join(' ');
  const labels = [{x:150,y:16,anchor:'middle'},{x:246,y:80,anchor:'start'},{x:207,y:209,anchor:'middle'},{x:85,y:209,anchor:'middle'},{x:54,y:80,anchor:'end'}];
  return `<svg class="radar" viewBox="0 0 300 230" role="img" aria-label="Характеристики ${a.name}: ${SKILLS.map(s => s.label + ' ' + a.stats[s.key]).join(', ')}">
    ${[.25,.5,.75,1].map(r => `<polygon points="${ring(r)}" fill="none" stroke="#ffffff18"/>`).join('')}
    ${SKILLS.map((_,i) => `<line x1="150" y1="112" x2="${point(i,1)[0]}" y2="${point(i,1)[1]}" stroke="#ffffff16"/>`).join('')}
    <polygon points="${SKILLS.map((s,i) => point(i,a.stats[s.key]/100).join(',')).join(' ')}" fill="${a.color}30" stroke="${a.color}" stroke-width="2"/>
    ${SKILLS.map((s,i) => `<circle cx="${point(i,a.stats[s.key]/100)[0]}" cy="${point(i,a.stats[s.key]/100)[1]}" r="3" fill="${a.color}"/><text x="${labels[i].x}" y="${labels[i].y}" text-anchor="${labels[i].anchor}" fill="#b9c8cd" font-size="10">${s.label}</text><text x="${labels[i].x}" y="${labels[i].y+15}" text-anchor="${labels[i].anchor}" fill="#f2f5ef" font-size="13" font-weight="700">${a.stats[s.key]}</text>`).join('')}
  </svg>`;
}
function intro() {
  return `<main class="landing">
    <div class="office-backdrop"></div><div class="landing-shade"></div>
    <header class="topbar">${logo()}<button class="icon-btn" data-action="about" aria-label="Как играть">${icon('info')}</button></header>
    <section class="intro-copy"><div class="chapter-label"><span>01</span> Первая смена</div>
      <h1>Завтра фестиваль.<br>Игры пока нет.</h1>
      <p>Школьники ждут космическую игру.<br>Твоя команда может её сделать.</p>
      <div class="intro-letter"><span class="letter-avatar">Ш</span><div><b>Школьный клуб <span>новое сообщение</span></b><p>«Хотим летать на корабле и собирать батареи. Сможете подготовить игру к фестивалю?»</p></div></div>
      <p class="intro-role"><b>Ты — тимлид.</b> Собери трёх агентов, раздай задачи и помоги команде справиться с ошибками.</p>
      <fieldset class="difficulty"><legend>Сложность</legend>${Object.entries(DIFFICULTIES).map(([id,d]) => `<label class="difficulty-option ${difficulty===id?'chosen':''}"><input type="radio" name="difficulty" value="${id}" ${difficulty===id?'checked':''}><span>${d.name}</span></label>`).join('')}</fieldset>
      <div class="intro-cta">${saved?`<button class="primary large" data-action="continue">Продолжить смену ${icon('play',17)}</button><button class="text-button" data-action="new-game">Новая игра</button>`:`<button class="primary large" data-action="new-game">Собрать команду ${icon('arrow')}</button>`}</div>
    </section>
    <div class="office-caption"><span class="live-dot"></span> Студия ждёт команду</div>
    <footer class="landing-footer"><span>Сохранение на этом устройстве</span><span>3D-студия · v0.4</span></footer>
  </main>`;
}
function topbar() {
  return `<header class="topbar game-topbar">${logo()}<div class="project-title"><span class="tiny">ПРОЕКТ 01</span>ОРБИТА ${badge('ФЕСТИВАЛЬ')}</div><div class="hud-stats"><div class="hud-stat">${icon('wallet')}<span><small>Резерв проекта</small><strong>${money(game.budget)}</strong></span></div><div class="hud-stat ${game.time>game.deadline?'late':''}">${icon('clock')}<span><small>${game.time>game.deadline?'Задержка':'До показа'}</small><strong>${game.time>game.deadline?'+':''}${Math.abs(game.deadline-game.time)} ч</strong></span></div><button class="icon-btn" data-action="menu" aria-label="Меню игры">${icon('info')}</button></div></header>`;
}
function scene() { return renderOffice(game, officeSelection, officeMoving); }
function hirePanel() {
  const a=agentById(candidate), hired=game.team.includes(a.id), canHire=hired||(game.team.length<3&&game.budget>=a.cost);
  return `<div class="panel-header"><div class="eyebrow">1 / 4 · КОМАНДА</div><h1>Кого берём?</h1><p>Три места. Шесть кандидатов.<br>Найми агента, затем выбери для него компьютер в офисе.</p></div>
    <div class="candidate-grid" aria-label="Кандидаты">${AGENTS.map(x=>`<button class="candidate ${candidate===x.id?'selected':''} ${game.team.includes(x.id)?'hired':''}" data-action="candidate" data-id="${x.id}" aria-label="${x.name}, ${x.role}, ${money(x.cost)}" aria-pressed="${candidate===x.id}">${portrait(x)}<span><b>${x.name}</b><small>${money(x.cost)}</small></span>${game.team.includes(x.id)?`<span class="hired-check">${icon('check',13)}</span>`:''}</button>`).join('')}</div>
    <section class="agent-detail" style="--agent:${a.color}"><div class="agent-profile"><div class="portrait-frame">${portrait(a,'large-portrait')}${badge(a.role)}</div><div class="radar-wrap">${radar(a)}</div></div>
      <dl class="mobile-skills">${SKILLS.map(s=>`<div><dt>${s.label}</dt><dd>${a.stats[s.key]}</dd></div>`).join('')}</dl>
      <div class="agent-name-row"><h2>${a.name} <span>/ ${String(a.index+1).padStart(2,'0')}</span></h2><strong>${money(a.cost)}<small>за весь проект</small></strong></div>
      <h3 class="agent-trait">${a.trait}</h3><p class="agent-description">${a.desc}</p><div class="agent-caution">${icon('info',14)} ${a.weakness}</div>
      <button class="${hired?'secondary hired-button':'primary'} full" data-action="hire" data-id="${a.id}" ${canHire?'':'disabled'}>${hired?`${icon('check')} В команде · убрать`:game.team.length===3?'Команда укомплектована':game.budget<a.cost?'Не хватает бюджета':`${icon('people')} Нанять за ${money(a.cost)}`}</button>
    </section>
    <div class="panel-bottom"><div class="coverage">${[['code','Код'],['design','Дизайн'],['qa','Тесты']].map(([key,label])=>{const covered=game.team.some(id=>agentById(id).stats[key]>=70);return `<span class="${covered?'covered':''}">${icon(covered?'check':'people',13)}${label}</span>`;}).join('')}</div><span>${game.team.length===3?(game.budget<1500?'Резерв меньше 1 500 ₽. Исправить ошибку за деньги не получится.':'Состав готов. Деньги в резерве пригодятся на исправления.'):`Выбрано ${game.team.length} из 3. После найма нажми на свободный компьютер.`}</span><button class="primary full" data-action="plan" ${teamSeated(game)&&!officeMoving?'':'disabled'}>${officeMoving&&teamSeated(game)?'Команда занимает места…':game.team.length===3&&!teamSeated(game)?`Рассади команду · ${game.seats.filter(Boolean).length}/3`: 'Раздать задачи'} ${icon('arrow')}</button></div>`;
}
function planPanel() {
  const complete=TASKS.every(t=>game.assignments[t.id]);
  return `<div class="panel-header"><div class="eyebrow">2 / 4 · ЗАДАЧИ</div><h1>Кто за что отвечает?</h1><p>Выбери исполнителя для каждой задачи.</p></div>
    <div class="dependency-map" aria-label="Порядок задач: задание, затем экран и код параллельно, потом тесты и сборка"><span>Задание</span><b>→</b><span class="parallel-tasks"><i>Экран</i><i>Код</i></span><b>→</b><span>Тесты</span><b>→</b><span>Сборка</span></div>
    <div class="plan-toolbar"><span>Один агент — одна задача за раз</span><button class="text-button" data-action="recommend">Подсказать ${icon('info',14)}</button></div>
    <div class="task-plan">${TASKS.map((t,i)=>{const id=game.assignments[t.id];const f=fit(id,t);return `<article class="plan-task"><div class="task-number">0${i+1}</div><div class="task-body"><h2>${t.name}</h2><p>${t.description}</p><div class="task-select-row"><select aria-label="Исполнитель: ${t.name}" data-task="${t.id}"><option value="">Выбрать агента</option>${game.team.map(aid=>{const a=agentById(aid);return `<option value="${aid}" ${id===aid?'selected':''}>${a.name} · ${SKILLS.find(s=>s.key===t.skill).label} ${a.stats[t.skill]}</option>`;}).join('')}</select>${id?`<span class="fit ${f>=75?'good':f>=55?'medium':'low'}">${f}/100</span>`:''}</div></div></article>`;}).join('')}</div>
    ${game.assignments.design&&game.assignments.design===game.assignments.code?'<div class="warning-note">Один агент назначен на код и дизайн. Эти задачи будут выполняться по очереди.</div>':''}
    <div class="panel-bottom"><button class="primary full" data-action="work" ${complete&&teamSeated(game)&&!officeMoving?'':'disabled'}>${officeMoving?'Команда занимает места…':!teamSeated(game)?'Сначала рассади команду':'Начать смену'} ${icon('play',17)}</button><button class="text-button centered" data-action="back-hire">Изменить команду</button></div>`;
}
function workPanel() {
  const active=activeTasks(game);
  const support=active.reduce((low,t)=>!low||fit(game.assignments[t.id],t)<fit(game.assignments[low.id],low)?t:low,null);
  return `<div class="panel-header"><div class="eyebrow">3 / 4 · СМЕНА</div><h1>Команда за работой</h1><p>Пропусти час или помоги агенту с его задачей.</p></div>
    <div class="work-controls"><button class="primary" data-action="tick">${icon('clock',18)} Следующий час</button><button class="secondary auto-toggle" data-action="auto" aria-pressed="${!!automatic}">${icon(automatic?'pause':'play',16)} ${automatic?'Пауза':'Авто'}</button></div>
    <div class="time-strip">Прошло <strong>${game.time} ч</strong><span>План: ${game.deadline} ч</span></div>
    <div class="work-tasks">${TASKS.map(t=>{const status=taskStatus(game,t), a=agentById(game.assignments[t.id]);const running=active.some(x=>x.id===t.id);return `<article class="work-task ${status==='done'?'done':running?'active':''}"><div class="work-task-icon">${icon(status==='done'?'check':running?'bolt':'lock',17)}</div><div><h2>${t.name}</h2><span>${a.name} · ${status==='done'?'Готово':running?'В работе':status==='locked'?'Ждёт предыдущие задачи':'Агент занят'}</span><div class="meter"><i style="width:${game.progress[t.id]}%"></i></div></div><strong>${Math.round(game.progress[t.id])}%</strong></article>`;}).join('')}</div>
    <div class="activity-log"><div class="eyebrow">ИЗ СТУДИИ</div>${game.log.slice(-3).reverse().map((m,i)=>`<p class="${i===0?'latest':''}"><span></span>${esc(m)}</p>`).join('')}</div>
    ${game.support?`<div class="support-done">${icon('check',18)}<span>Разбор проведён: ${agentById(game.support.agentId).name}<small>Навык для задачи «${TASKS.find(t=>t.id===game.support.taskId).name}» повышен на 15, максимум до 100.</small></span></div>`:support?`<div class="support-card"><div class="eyebrow">ПОМОЩЬ ТИМЛИДА</div><h2>${agentById(game.assignments[support.id]).name}: «${support.name}»</h2><p>Разберите задачу вместе. Агент лучше справится с ней, но ты потратишь час.</p><button class="secondary full" data-action="support" data-id="${support.id}">Помочь с задачей <span>+1 ч</span></button></div>`:''}`;
}
function eventPanel() {
  const ev=EVENTS[game.currentEvent], speaker=agentById(game.currentEvent==='bug'?game.assignments.qa:game.currentEvent==='review'?game.assignments.code:game.assignments.brief);
  return `<div class="event-heading"><span class="event-alert">${icon('bolt',17)} НУЖНО ВАШЕ РЕШЕНИЕ</span><span>Время на паузе</span></div>
    <div class="speaker">${portrait(speaker)}<span><b>${speaker.name}</b><small>${speaker.role}</small></span></div>
    <div class="panel-header event-copy"><div class="eyebrow">${ev.tag}</div><h1>${ev.title}</h1><p>${ev.text}</p></div>
    ${game.currentEvent==='review'?'<div class="code-review"><span>Сейчас в коде</span><ol><li>Передвинуть корабль</li><li>Проверить, есть ли астероид</li></ol><p>Проверка приходит слишком поздно.</p></div>':''}
    <div class="event-options">${ev.options.map((o,i)=>{const cost=(o.id==='shield'?2000:o.id==='fix'?1500:0);return `<button class="event-option ${['ignore','review-skip'].includes(o.id)?'risky':''}" data-action="decision" data-id="${o.id}" ${game.budget<cost?'disabled':''}><span class="option-number">0${i+1}</span><span><b>${o.title}</b><span class="option-description">${o.text}</span><small>${o.effect}${game.budget<cost?' · не хватает резерва':''}</small></span>${icon('arrow',16)}</button>`;}).join('')}</div>
    <div class="lesson-note">${icon('info',19)}<p>${ev.lesson}</p></div>`;
}
function resultPanel() {
  const r=getResult(game);
  return `<div class="panel-header"><div class="eyebrow">ШАГ 04 · РЕЗУЛЬТАТ</div><h1>${r.title}</h1><p>${r.summary}</p></div>
    <div class="result-score"><span class="score-orbit">${icon(r.passed?'rocket':'flag',32)}</span><div><strong>${r.score}<small>/ 100</small></strong><span>оценка проекта в игре</span></div>${badge(r.passed?'РЕЛИЗ ПРИНЯТ':'НУЖНА ДОРАБОТКА',r.passed?'success':'danger')}</div>
    <div class="result-metrics"><div><small>Качество работы</small><b>${r.quality}%</b></div><div><small>Срок</small><b class="${r.late?'coral':'mint'}">${r.late?`+${r.late} ч`:'Вовремя'}</b></div><div><small>Резерв</small><b>${money(game.budget)}</b></div><div><small>Доверие к команде</small><b>${game.trust}%</b></div></div>
    <button class="game-preview" data-action="play-mini"><span class="preview-space"><i>✦</i>${icon('rocket',48)}<i>✧</i></span><span><small>СДЕЛАНО ВАШЕЙ КОМАНДОЙ</small><b>ОРБИТА</b><span>Сыграть в получившуюся игру ${icon('arrow',16)}</span></span>${icon('play',24)}</button>
    <div class="release-features">${game.wallBug?'<span class="coral">Ошибка: астероиды не останавливают корабль</span>':''}<span>${icon(game.shield?'check':'cross',14)} ${game.shield?'Защитный щит':'Без щита'}</span><span>${icon(game.checkpoint&&!game.criticalBug?'check':'cross',14)} ${game.criticalBug?'Баг сохранения':game.checkpoint?'Сохранение работает':'Сессия без сохранения'}</span></div>
    <div class="career-result"><span class="eyebrow">ЧТО ДЕЛАЛ ТИМЛИД</span><h2>Помог команде выпустить игру</h2><ul class="lead-recap"><li>${game.support?'Разобрал сложную задачу вместе с агентом':'Распределил задачи по навыкам'}</li><li>${game.choices.review==='review-skip'?'Пропустил ошибку при проверке кода':'Нашёл ошибку при проверке кода'}</li><li>Решил, что исправлять перед показом</li></ul><button class="text-button" data-action="debrief">Почему такой результат? ${icon('arrow',15)}</button></div>
    <div class="panel-bottom"><button class="secondary full" data-action="restart">${icon('reset',17)} Попробовать другую команду</button></div>`;
}
function timeline() {
  const stages=['hire','plan','work','result'], titles=['Команда','План','Работа','Релиз'];
  const step=stages.indexOf(game.stage==='event'?'work':game.stage);
  return `<footer class="game-footer"><div class="timeline">${stages.map((s,i)=>`<div class="timeline-step ${i===step?'current':''} ${i<step?'completed':''}"><span>${i<step?icon('check',12):i+1}</span><b>${titles[i]}</b></div>`).join('')}</div><span class="save-status">${icon(savingAvailable?'check':'info',13)} ${savingAvailable?'Прогресс сохранён в браузере':'Сохранение недоступно'}</span></footer>`;
}
let renderedStage = null;
function render() {
  const focused=document.activeElement;
  const oldAction=focused?.dataset?.action, oldId=focused?.dataset?.id, oldTask=focused?.dataset?.task;
  const nextStage=game?.stage||'intro', stageChanged=nextStage!==renderedStage;
  renderedStage=nextStage;
  if (!game) { detachOfficeWorld(); root.innerHTML=intro(); onboarding.sync(null); if(stageChanged)window.scrollTo(0,0); return; }
  const panels={hire:hirePanel,plan:planPanel,work:workPanel,event:eventPanel,result:resultPanel};
  root.innerHTML=`<main class="game-shell ${game.stage==='event'?'event-state':''}">${topbar()}<div class="game-layout">${scene()}<section class="control-panel" aria-label="Управление проектом">${panels[game.stage]()}</section></div>${timeline()}</main>`;
  mountOfficeWorld(game,officeSelection,{
    onBusy:busy=>{if(officeMoving!==busy){officeMoving=busy;if(game)render();}},
    onActor:id=>{if(!game)return;if(['hire','plan'].includes(game.stage)){officeSelection=officeSelection===id?null:id;render();}else inspect(id);},
    onDesk:index=>{if(game)officeDeskAction(index);},
    onFloor:point=>officeWalk(point),
    onError:message=>{toast(message);if(game)render();},
  });
  onboarding.sync(game, officeMoving);
  if(oldTask) root.querySelector(`[data-task="${oldTask}"]`)?.focus({preventScroll:true});
  else if(oldAction) root.querySelector(`[data-action="${oldAction}"]${oldId?`[data-id="${oldId}"]`:''}`)?.focus({preventScroll:true});
  if(stageChanged){
    if(window.innerWidth<=1000&&['plan','work','event','result'].includes(nextStage))root.querySelector('.control-panel').scrollIntoView({block:'start'});
    else window.scrollTo(0,0);
  }
}
function officeWalk(point) {
  if(!game||!officeSelection)return;
  if(!canWalkTo(officeSelection,point)){toast('Не пройти: выбери свободное место ближе к проходу.');return;}
  const error=walkInOffice(game,officeSelection,point);
  if(error)toast(error);else{persist();render();}
}
function officeDeskAction(index) {
  const occupant=game.seats[index];
  if(['hire','plan'].includes(game.stage)){
    if(officeSelection){const name=agentById(officeSelection).name;const error=seatAgent(game,officeSelection,index);if(error)toast(error);else{officeSelection=null;persist();render();toast(`${name} направляется к компьютеру ${index+1}.`);}}
    else if(occupant){officeSelection=occupant;render();}
    else toast(game.team.length?'Выбери персонажа в команде, затем этот компьютер.':'Сначала выбери и найми агента.');
  }else if(occupant)inspect(occupant);
}
function advance() { if(tick(game)){if(game.stage!=='work')stopAuto(); persist();render();} }
function newGame() { stopAuto(); resetOfficeWorld(); officeMoving=false; game=createGame(difficulty); candidate='mira'; officeSelection=null; mini=null; try{localStorage.removeItem(MINI);}catch{} persist(); render(); onboarding.start(game); }
function resetDialog() { showDialog(`<div class="eyebrow">НОВАЯ ПОПЫТКА</div><h2 id="dialog-title">Начать с чистого листа?</h2><p>Текущая команда и прогресс будут заменены. Можно попробовать другой состав и решения.</p><div class="dialog-actions"><button class="secondary" data-action="close-dialog">Остаться</button><button class="primary" data-action="confirm-new">Начать заново</button></div>`); }
function about() { showDialog(`<div class="eyebrow">ДО РЕЛИЗА · v0.4</div><h2 id="dialog-title">Кто такой тимлид?</h2><p>Это разработчик, который руководит командой: помогает разобраться с задачами, выбирает технические решения и проверяет код.</p><p>Найми троих агентов и посади каждого за компьютер: выбери персонажа, затем рабочее место. Он дойдёт до него и сядет. До начала смены можно нажать на свободный пол, чтобы пройтись по офису. Потяни сцену мышью или пальцем, чтобы повернуть её. Дальше собери план для маленькой игры. Код отвечает за механику, дизайн — за экран, тесты — за поиск ошибок, общение — за понимание задания. Темп показывает, как быстро агент работает.</p><p>Время двигается кнопкой «Следующий час». Во время обсуждения оно стоит. Сложную задачу можно разобрать вместе с агентом.</p><p class="small-muted">Это игровая модель профессии. Агенты — персонажи с заданными навыками; реальные языковые модели не подключены. Графика создана с помощью ИИ. Сохранение работает в этом браузере.</p><button class="primary full" data-action="close-dialog">Понятно ${icon('check')}</button>`); }
function inspect(id) {
  const a=agentById(id); if(!a)return;
  if(game.stage==='hire'){candidate=id;render();return;}
  const task=activeTasks(game).find(t=>game.assignments[t.id]===id);
  const waiting=TASKS.find(t=>game.assignments[t.id]===id&&game.progress[t.id]<100);
  const status=game.stage==='event'?'Ждёт твоего решения':game.stage==='result'?'Игра выпущена':task?task.verb:waiting?'Ждёт предыдущую задачу':'Свободен — его задачи готовы';
  showDialog(`<div class="speaker">${portrait(a)}<span><b>${a.name}</b><small>Компьютер ${game.seats.indexOf(id)+1} · ${a.role}</small></span></div><h2 id="dialog-title">${status}</h2><blockquote>«${a.quote}»</blockquote><div class="inspect-work">${task?`<h3>${task.name} · ${Math.round(game.progress[task.id])}%</h3><div class="meter"><i style="width:${game.progress[task.id]}%"></i></div><p>${task.description}</p>${game.stage==='work'&&!game.support?`<button class="secondary full" data-action="support" data-id="${task.id}">Разобрать задачу вместе · +1 ч</button>`:''}`:`<p>${waiting?'Сейчас работа зависит от других задач. Можно продвинуть время и проверить команду.':'Все назначенные задачи завершены.'}</p>`}</div><p class="small-muted">Часов в работе: ${game.workload[a.id]||0}. После восьми часов подряд темп немного снижается.</p><details class="inspect-details"><summary>Пять навыков и профиль</summary><div class="inspect-radar">${radar(a)}</div><p>${a.desc}</p></details><button class="primary full" data-action="close-dialog">Вернуться в студию</button>`);
}
function debrief() {
  const r=getResult(game), weakest=TASKS.reduce((a,b)=>fit(game.assignments[a.id],a)<fit(game.assignments[b.id],b)?a:b);
  showDialog(`<div class="eyebrow">РАЗБОР ПРОЕКТА</div><h2 id="dialog-title">Что изменили ваши решения</h2><ul class="debrief-list"><li><b>Подбор и распределение.</b> Среднее соответствие навыков задачам — ${r.quality}%. Самое слабое место: «${weakest.name}» (${fit(game.assignments[weakest.id],weakest)}/100).</li><li><b>Объём.</b> ${game.choices.scope==='focus'?'Вы договорились перенести новую функцию. Это сохранило время и резерв.':game.choices.scope==='shield'?'Добавили щит за 2 000 ₽ и увеличили объём кода. Щит работает в вашей мини-игре.':'Обменяли часть оформления на щит. Дополнительная механика появилась, интерфейс стал проще.'}</li><li><b>Качество.</b> ${game.choices.bug==='fix'?'Вы потратили 2 часа и 1 500 ₽, чтобы исправить сохранение. Теперь мини-игра восстанавливает прогресс.':game.choices.bug==='cut'?'Вы честно сократили функциональность. Мини-игру нужно проходить за одну сессию.':'Вы выпустили известную ошибку. При перезапуске мини-игры прогресс теряется.'}</li><li><b>Проверка кода.</b> ${game.wallBug ? 'Проверка пропущена. В мини-игре корабль проходит сквозь астероиды.' : 'Вы исправили порядок действий: проверка препятствия выполняется до движения.'}</li><li><b>Помощь.</b> ${game.support ? 'Вы провели совместный разбор: агент лучше справился с конкретной задачей, но понадобился дополнительный час.' : 'В этой смене команда справлялась без совместного разбора.'}</li><li><b>Срок.</b> ${r.late?`Задержка ${r.late} ч. Резерв времени и параллельная работа помогут в следующей попытке.`:'Команда уложилась в согласованный срок.'}</li></ul><p class="small-muted">Оценка: качество — до 45 баллов; срок — до 25; бюджет — 10; доверие — до 10; отсутствие критического бага — 10. Упрощение визуала снижает оценку на 2,4 балла.</p><button class="primary full" data-action="close-dialog">Вернуться к результату</button>`);
}

const rocks=new Set(['1,1','3,1','5,1','1,3','3,3','5,3']);
const batteries=['2,0','4,2','0,4'];
function freshMini(){return {x:0,y:0,collected:[],shield:game.shield,won:false,moves:0};}
function openMini() {
  mini=freshMini();
  if(game.checkpoint&&!game.criticalBug){try{const m=JSON.parse(localStorage.getItem(MINI));if(m&&Number.isInteger(m.x)&&Number.isInteger(m.y)&&m.x>=0&&m.x<7&&m.y>=0&&m.y<5&&Array.isArray(m.collected)&&m.collected.every(k=>batteries.includes(k)))mini=m;}catch{}}
  showDialog('<h2 id="dialog-title">Орбита</h2>');renderMini();
}
function renderMini() {
  const full=getResult(game).design>=70;
  document.querySelector('#dialog-content').innerHTML=`<button class="icon-btn dialog-close" data-action="close-dialog" aria-label="Закрыть игру">${icon('cross')}</button><div class="mini-game ${full?'polished':'simple'}"><div class="eyebrow">ИГРА ВАШЕЙ КОМАНДЫ</div><h2 id="dialog-title">ОРБИТА <span>0${mini.collected.length} / 03</span></h2><p>${mini.won?'Станция получила энергию. Миссия выполнена!':'Соберите 3 батареи и доберитесь до станции справа внизу.'}</p><div class="mini-board" role="group" aria-label="Карта. Управление стрелками клавиатуры или соседними клетками.">${Array.from({length:35},(_,i)=>{const x=i%7,y=Math.floor(i/7),key=`${x},${y}`,ship=mini.x===x&&mini.y===y,rock=rocks.has(key),bat=batteries.includes(key)&&!mini.collected.includes(key),end=x===6&&y===4;return `<button class="tile ${ship?'ship':''} ${rock?'rock':''} ${end?'station':''} ${bat?'battery':''}" data-action="tile" data-x="${x}" data-y="${y}" aria-label="${ship?'Корабль':rock?'Астероид':end?'Станция':bat?'Батарея':'Космос'}, ${x+1}, ${y+1}">${ship?icon('rocket',30):rock?'◆':bat?icon('bolt',23):end?icon('flag',24):'<span>·</span>'}</button>`;}).join('')}</div><div class="mini-status"><span>${mini.shield?'◈ Щит готов':game.shield?'Щит израсходован':'Без щита'}</span><span>${game.criticalBug?'Баг сохранения':game.checkpoint?'Автосохранение':'Одна сессия'}</span></div><div class="mini-controls"><button class="secondary" data-action="move" data-dir="left" aria-label="Влево">←</button><div><button class="secondary" data-action="move" data-dir="up" aria-label="Вверх">↑</button><button class="secondary" data-action="move" data-dir="down" aria-label="Вниз">↓</button></div><button class="secondary" data-action="move" data-dir="right" aria-label="Вправо">→</button><p>Стрелки или соседняя клетка.${game.shield?' Щит позволяет один раз пройти через астероид.':''}</p></div>${mini.won?'<div class="mini-win">Маршрут завершён. Ваша команда сделала работающую игру!</div>':''}<div class="dialog-actions"><button class="secondary" data-action="reload-mini">${icon('reset',15)} Перезапустить</button><button class="primary" data-action="close-dialog">В студию</button></div></div>`;
}
function moveMini(dx,dy) {
  if(!mini||mini.won||Math.abs(dx)+Math.abs(dy)!==1)return;
  const x=mini.x+dx,y=mini.y+dy,key=`${x},${y}`;if(x<0||x>6||y<0||y>4)return;
  if(rocks.has(key)&&!game.wallBug){if(!mini.shield){toast('Астероид. Найди обходной маршрут.');return;} mini.shield=false;}
  mini.x=x;mini.y=y;mini.moves++;if(batteries.includes(key)&&!mini.collected.includes(key))mini.collected.push(key);
  if(x===6&&y===4){if(mini.collected.length===3)mini.won=true;else toast('Для станции нужны все три батареи.');}
  if(game.checkpoint&&!game.criticalBug){try{localStorage.setItem(MINI,JSON.stringify(mini));}catch{toast('Браузер не разрешил сохранить мини-игру.');}}
  renderMini();
}
document.addEventListener('keydown',e=>{
  if(dialog.open&&document.querySelector('.mini-board')){const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(d){e.preventDefault();moveMini(...d);}}
});
document.addEventListener('change',e=>{
  if(e.target.name==='difficulty'){difficulty=e.target.value;render();}
  if(e.target.dataset.task&&game){assign(game,e.target.dataset.task,e.target.value);persist();render();}
});
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el||el.disabled)return;
  const action=el.dataset.action,id=el.dataset.id;
  if(action==='close-dialog'){dialog.close();return;}
  if(action==='about'){about();return;}
  if(action==='new-game'){if(saved)resetDialog();else newGame();return;}
  if(action==='confirm-new'){dialog.close();newGame();return;}
  if(action==='continue'){game=structuredClone(saved);difficulty=game.difficulty;candidate=game.team[0]||'mira';render();return;}
  if(!game)return;
  if(action==='candidate'){candidate=id;render();}
  if(action==='hire'){const error=hire(game,id);if(error)toast(error);else{officeSelection=game.team.includes(id)?id:null;persist();render();if(officeSelection)toast(`${agentById(id).name} в студии. Выбери компьютер в офисе.`);}}
  if(action==='plan'){if(!officeMoving&&beginPlan(game)){officeSelection=null;persist();render();}}
  if(action==='recommend'){recommend(game);persist();render();toast('Предложил исполнителей. Проверь: один агент не может делать код и экран одновременно.');}
  if(action==='back-hire'){game.stage='hire';persist();render();}
  if(action==='work'){if(!officeMoving&&beginWork(game)){officeSelection=null;persist();render();}}
  if(action==='tick')advance();
  if(action==='support'){if(dialog.open)dialog.close();stopAuto();const error=supportTask(game,id);if(error)toast(error);else{persist();render();toast('Разобрались вместе: навык для этой задачи +15. Потрачен 1 час.');}}
  if(action==='auto'){if(automatic)stopAuto();else automatic=setInterval(advance,1600);render();}
  if(action==='decision'){const error=resolveEvent(game,id);if(error)toast(error);else{persist();render();}}
  if(action==='office-select'){officeSelection=officeSelection===id?null:id;render();}
  if(action==='office-walk')officeWalk(WAITING[game.team.indexOf(officeSelection)]);
  if(action==='office-cancel'){officeSelection=null;render();}
  if(action==='office-desk')officeDeskAction(Number(id));
  if(action==='office-camera')officeCamera(id);
  if(action==='inspect-agent')inspect(id);
  if(action==='restart')resetDialog();
  if(action==='debrief')debrief();
  if(action==='play-mini')openMini();
  if(action==='tile')moveMini(Number(el.dataset.x)-mini.x,Number(el.dataset.y)-mini.y);
  if(action==='move'){const d={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]}[el.dataset.dir];moveMini(...d);}
  if(action==='reload-mini'){openMini();toast(game.criticalBug?'Прогресс потерян: известный баг попал в релиз.':game.checkpoint?'Прогресс восстановлен из сохранения.':'Короткая сессия началась заново — как согласовано с заказчиком.');}
  if(action==='brief')showDialog(`<div class="eyebrow">ЗАКАЗ · ШКОЛЬНЫЙ ФЕСТИВАЛЬ</div><h2 id="dialog-title">Маленькая игра.<br>Настоящий проект.</h2><p>Нужна космическая игра «Орбита»: игрок управляет кораблём, собирает три батареи и добирается до станции. Управление должно быть понятным, а игру можно открыть в браузере.</p><ul class="debrief-list"><li>Бюджет на команду и резерв: <b>${money(game.initialBudget)}</b>.</li><li>Срок: <b>${game.deadline} игровых часов</b>.</li><li>Команда: три агента на ваш выбор.</li><li>Согласуйте новые функции и ограничения до показа.</li></ul><p>Твоя работа как тимлида — разобрать задачу с командой, помочь с трудностями и проверить код перед показом.</p><button class="primary full" data-action="close-dialog">За работу</button>`);
  if(action==='menu'){stopAuto();render();showDialog(`<div class="eyebrow">СТУДИЯ НА ПАУЗЕ</div><h2 id="dialog-title">До релиза</h2><p>${savingAvailable?'Прогресс автоматически сохранён в этом браузере.':'Сохранение недоступно. Не закрывайте вкладку до конца сессии.'}</p><div class="menu-buttons"><button class="primary full" data-action="close-dialog">Продолжить игру</button><button class="secondary full" data-action="about">Как играть</button><button class="secondary full" data-action="home">На главный экран</button></div>`);}
  if(action==='home'){dialog.close();stopAuto();persist();game=null;render();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&automatic){stopAuto();render();}});
render();
