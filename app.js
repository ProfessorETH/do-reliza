import { coffeeArrival } from './assets/coffee-trip.js';
import { captureMembers, queueActorReaction, queueMemberFeedback, queuePurchaseFeedback, clearSceneFeedback } from './assets/scene-feedback.js';

import { renderDecisionPanel, renderDecisionReceipt } from './assets/decision-view.js';
import { discussionSpeakers, studyDecision } from './assets/team-discussion.js';
import { purchasePanel, contractPreview } from './assets/commission-view.js';
import { employeeEvent } from './assets/employee-event.js';
import { sceneHeader, sceneDock, managementBar } from './assets/play-shell.js';
import { studioCapacity, fundTeam } from './assets/studio-progression.js';
import { ensureEventClock, advanceEventClock, eventKey } from './assets/event-clock.js';
import { missionFor } from './assets/orbit-missions.js';
import { canSaveOrbit, freshOrbit, restoreOrbit, stepOrbit, actOrbit, orbitFeatures, recordOrbitResult } from './assets/orbit.js?v=orbit-3';
import { renderOrbit } from './assets/orbit-view.js?v=orbit-3';
import { createOnboarding } from './assets/onboarding/onboarding.js?v=scene-first-20261025';
import { advanceShiftClock, shiftTime } from './assets/shift-clock.js?v=shift-ux-2';
import { renderStartScreen } from './assets/start-screen.js?v=start-clarity-20261024';
import { createSound } from './assets/sound.js?v=original-cast-20261024';
import { WAITING } from './office-layout.js?v=shift-ux-20261024-v2';
import { createDemoGame } from './demo.js?v=shift-ux-20261024-v2';
import { mountOfficeWorld, detachOfficeWorld, resetOfficeWorld, officeCamera, canWalkTo, graphicsSettingsHTML } from './assets/office-runtime.js?v=team-hud-20261024';
import { renderOffice } from './office.js?v=scene-first-20261025';
import { AGENTS, TASKS, SKILLS, DIFFICULTIES, EVENTS } from './data.js';
import { candidatePicker, agentDossier } from './assets/studio-ui-components.js?v=shift-ux-2';
import { renderTeamHUD } from './assets/team-hud.js?v=mobile-voices-20261024';
import { characterLine, characterMoment } from './assets/character-dialogue.js';
import { ensureLife, condition, careFor, buyUpgrade, restArrival, awayForRest, UPGRADES, CONTRACTS, contractFor } from './assets/studio-life.js?v=shift-ux-20261024-v2';
import { memberPanel, officePanel, contractsPanel } from './assets/studio-life-view.js?v=shift-ux-20261024-v2';
import { nextProject } from './engine.js?v=shift-ux-20261024-v2';
import { createGame, agentById, hire, beginPlan, assign, fit as baseFit, recommend, beginWork, tick, taskStatus, activeTasks, resolveEvent, getResult, validSave, supportTask, restoreOffice, seatAgent, teamSeated, walkInOffice } from './engine.js?v=shift-ux-20261024-v2';

const root = document.querySelector('#app');
const dialog = document.querySelector('#info-dialog');
const mobileUI=matchMedia('(max-width:700px), (max-height:500px) and (pointer:coarse)');
const eventDialog=document.querySelector('#event-dialog');
let shownEvent=null,eventSaveSecond=-1,openedIncidentKey=null;
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const DEMO = new URLSearchParams(window.location.search).get('demo') === '1';
const SAVE = DEMO ? 'before-release-demo-v1' : 'before-release-v1';
const MINI = DEMO ? 'before-release-demo-orbit-v1' : 'before-release-orbit-v1';
let officeSelection = null, officeMoving = false;
let workspaceView = 'office';
let soundPreviewed = false;
let officeExpanded = false;
let decisionFeedback = null;
let managementExpanded = false;
let game = null, candidate = 'mira', difficulty = 'calm', saved = null, savingAvailable = true, mini = null;
const fit = (id, task) => baseFit(id, task, game);
const sound = createSound();
const onboarding = createOnboarding({ storageKey: `${SAVE}-onboarding-v1`, pause: () => {}, refresh: render, sound, onOpen:()=>{workspaceView='office';officeSelection=null;officeExpanded=false;} });
try { const raw = JSON.parse(localStorage.getItem(SAVE)); if (validSave(raw)) saved = restoreOffice(raw); } catch { /* No usable saved session. */ }
const money = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const icon = (name, size = 20) => {
  const p = { arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M4 5V3h14v2m-3 7h6v4h-6z"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>', cross: '<path d="m6 6 12 12M6 18 18 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', home: '<path d="m3 11 9-8 9 8M5 9v12h5v-7h4v7h5V9"/>',
    settings: '<path d="M3 6h8m6 0h4M3 12h2m6 0h10M3 18h10m6 0h2"/><circle cx="14" cy="6" r="3"/><circle cx="8" cy="12" r="3"/><circle cx="16" cy="18" r="3"/>',
    play: '<path d="m8 5 11 7-11 7z"/>', pause: '<path d="M8 5v14M16 5v14"/>', star: '<path d="m12 3 3 6 6 1-4.5 4.5 1 6-5.5-3-5.5 3 1-6L3 10l6-1z"/>',
    bolt: '<path d="m14 2-9 12h7l-2 8 9-12h-7z"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    rocket: '<path d="M9 15 5 19m4-4 6-6m-6 6-4-1 2-6 5-1 3-4 6-1-1 6-4 3-1 5-6 2-1-4z"/><circle cx="16" cy="7" r="1"/>',
    reset: '<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>', sound: '<path d="m4 9 5 0 5-4v14l-5-4H4zm13-1a6 6 0 0 1 0 8"/>',
    brief: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zm0 9h6m-6 4h4"/>',
    shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/>',
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
function stopAuto() { if(game) game.autoPlay = false; }
function clockBlocked() { return document.hidden || !!document.querySelector('dialog[open],.nika-guide:not(.nika-collapsed)'); }
function clockStatus() {
  if(game.stage==='result')return 'Смена завершена';
  if(!game.autoPlay)return 'Авто выключено';
  if(game.stage==='event')return 'Авто ждёт твоего решения';
  if(game.stage!=='work')return 'Авто начнётся со сменой';
  if(document.querySelector('dialog[open],.nika-guide:not(.nika-collapsed)'))return 'Авто ждёт закрытия окна';
  return 'Авто ведёт смену';
}
function updateClock() {
  if(!game)return;
  const time=shiftTime(game);
  for(const [key,value] of Object.entries({...time,now:time.now.split(' · ')[0],day:time.now.split(' · ')[1]||'В студии',status:clockStatus()}))for(const el of root.querySelectorAll(`[data-clock="${key}"]`)){
    const label=key==='now'&&el.closest('.scene-time')?time.now:value;
    if(el.textContent!==String(label))el.textContent=label;
  }
}
let lastClockFrame=performance.now();
setInterval(()=>{const now=performance.now(),delta=now-lastClockFrame;lastClockFrame=now;if(game){if(advanceShiftClock(game,delta,clockBlocked()))advance();updateClock();updateEventClock(delta);}},100);
document.addEventListener('visibilitychange',()=>{lastClockFrame=performance.now();persist();});
window.addEventListener('pagehide',persist);
let dialogOrigin = null;
function showDialog(html) {
  if (!dialog.open) { const trigger = document.activeElement?.closest('[data-action]'); dialogOrigin = trigger ? { action: trigger.dataset.action, id: trigger.dataset.id } : null; }
  sound.stopVoice();
  document.querySelector('#dialog-content').innerHTML = `<button class="icon-btn dialog-close" data-action="close-dialog" aria-label="Закрыть окно">${icon('cross')}</button>${html}`;
  if (!dialog.open) dialog.showModal(); else dialog.querySelector('button')?.focus({preventScroll:true});
  dialog.scrollTop=0;
}
dialog.addEventListener('cancel',()=>sound.stopVoice('character'));
dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){sound.stopVoice('character');dialog.close();}});
dialog.addEventListener('close', () => {
  if(decisionFeedback){const feedback=decisionFeedback;decisionFeedback=null;if(feedback.game===game){queueMemberFeedback(game,feedback.before,feedback.affected);for(const response of feedback.responses)queueActorReaction(game,response.id,response.kind==='agree'?'joy':response.kind==='reconsider'?'calm':'sad');render();root.querySelector('[data-action="tick"]')?.focus({preventScroll:true});}}
  if (dialogOrigin) [...root.querySelectorAll('[data-action]')].find(el => el.dataset.action === dialogOrigin.action && el.dataset.id === dialogOrigin.id)?.focus({ preventScroll: true });
});
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
  return renderStartScreen({ difficulty, saved, demo: DEMO, logo, icon, money, soundEnabled:sound.enabled, soundPreviewed });
}
function topbar() {
  return sceneHeader(game,{logo,icon,money,time:shiftTime(game),soundEnabled:sound.enabled,status:clockStatus()});
}
function scene() { return renderOffice(game, officeSelection, officeMoving, `<div class="studio-wallet-row"><span>Твоя студия</span><button data-action="life-office">Касса <b>${money(game.life.cash)}</b> · улучшения ↗</button></div>`, officeExpanded, mobileUI.matches); }
function seatingPanel() {
  if(!game.team.length)return '';
  return `<section class="seating-panel" aria-label="Рассадка команды"><div><h2>Кто за каким компьютером?</h2><p>После найма место назначается автоматически. Здесь можно пересадить коллег.</p></div><div class="seating-cards">${game.seats.map((id,index)=>`<label class="seating-card"><b>Компьютер ${index+1}</b><span>${id?`${agentById(id).name} · место назначено`:'Свободное место'}</span><select data-seat="${index}" aria-label="Кто за компьютером ${index+1}"><option value="" disabled ${id?'':'selected'}>Выбрать сотрудника</option>${game.team.map(aid=>`<option value="${aid}" ${id===aid?'selected':''}>${agentById(aid).name}${game.seats.includes(aid)?` · ПК ${game.seats.indexOf(aid)+1}`:' · ждёт места'}</option>`).join('')}</select></label>`).join('')}</div><p class="seating-status" role="status">${officeMoving?'Команда занимает места. Когда все сядут, можно раздать задачи.':teamSeated(game)?'Все места назначены. Можно переходить к задачам.':'Выбери сотрудника для свободного компьютера.'}</p><button class="text-button" data-action="workspace" data-id="office">Посмотреть рассадку в офисе ↗</button></section>`;
}
function hirePanel() {
  const a=agentById(candidate), hired=game.team.includes(a.id), canHire=hired||(game.team.length<studioCapacity(game)&&game.budget>=a.cost&&!game.life.away?.includes(a.id));
  const quickTeam = game.team.length >= 3;
  const coverage=`<div class="coverage">${[['code','Код'],['design','Дизайн'],['qa','Тесты']].map(([key,label])=>{const covered=game.team.some(id=>agentById(id).stats[key]>=70);return `<span class="${covered?'covered':''}">${icon(covered?'check':'people',13)}${label}</span>`;}).join('')}</div>`;
  return `<div class="panel-header"><div class="eyebrow">01 / КОМАНДА</div><h1>${quickTeam?'Пора за работу':'Собери команду'}</h1><p>${quickTeam?'Команда в сборе. Следующий шаг — распределить задачи.':'Найми троих — они сами займут компьютеры.'}</p></div>
    ${!quickTeam?`<div class="hire-progress"><b>${game.team.length}/${studioCapacity(game)}</b>${coverage}</div>`:''}
    ${quickTeam?`<div class="team-ready"><span class="ready-symbol">${icon('rocket',28)}</span><h2>Ваша цель — релиз</h2><p>Собери план, помогай коллегам и проверь игру перед показом.</p><ol><li>Распредели пять задач</li><li>Помоги с трудными моментами</li><li>Выпусти «Орбиту»</li></ol></div><details class="crew-manage"><summary>Изменить состав команды</summary>`:''}
    ${candidatePicker(AGENTS,candidate,game.team,{portrait,icon,money,esc})}
    ${game.life.completed>0?`<p class="staffing-budget">Команда: ${game.team.length}/${studioCapacity(game)}. Начать можно втроём.<button class="secondary" data-action="fund-team" ${game.life.cash<=0?'disabled':''}>Добавить ${money(Math.min(5000,game.life.cash))} из кассы</button></p>`:''}${agentDossier(a,{hired,canHire,teamCount:game.team.length,budget:game.budget,capacity:studioCapacity(game)},{portrait,icon,money,esc,radar})}
    ${game.life.away?.includes(a.id)?'<p class="life-notice">Сотрудник покинул студию и пропускает этот заказ. Выбери другого кандидата.</p>':''}
    ${quickTeam?'</details>':''}
    ${game.team.length?`<button class="crew-seating" data-action="seating">${icon('people',16)} Рабочие места <b>${game.seats.filter(Boolean).length}/${game.team.length}</b> <span>↗</span></button>`:''}
    <div class="panel-bottom">${coverage}<span>${game.team.length>=3?(game.budget<1500?'Резерв меньше 1 500 ₽. Исправить ошибку за деньги не получится.':'Состав готов. Деньги в резерве пригодятся на исправления.'):`Выбрано ${game.team.length}. Для начала нужно 3; доступно ${studioCapacity(game)} места. Места назначаются автоматически.`}</span><button class="primary full" data-action="plan" ${teamSeated(game)&&!officeMoving?'':'disabled'}>${officeMoving&&teamSeated(game)?'Команда занимает места…':game.team.length>=3&&!teamSeated(game)?`Рассади команду · ${game.seats.filter(Boolean).length}/${game.team.length}`: 'Раздать задачи'} ${icon('arrow')}</button></div>`;
}
function planPanel() {
  const complete=TASKS.every(t=>game.assignments[t.id]);
  return `<div class="panel-header"><div class="eyebrow">2 / 4 · ЗАДАЧИ</div><h1>Кто за что отвечает?</h1><p>Выбери исполнителя для каждой задачи.</p></div>
    <div class="dependency-map" aria-label="Порядок задач: задание, затем экран и код параллельно, потом тесты и сборка"><span>Задание</span><b>→</b><span class="parallel-tasks"><i>Экран</i><i>Код</i></span><b>→</b><span>Тесты</span><b>→</b><span>Сборка</span></div>
    <div class="plan-toolbar"><span>Один разработчик — одна задача за раз</span><button class="text-button" data-action="recommend">Подсказать ${icon('info',14)}</button></div>
    <div class="task-plan">${TASKS.map((t,i)=>{const id=game.assignments[t.id];const f=fit(id,t), skill=SKILLS.find(s=>s.key===t.skill).label;const fitHTML=id?`<span class="fit ${f>=75?'good':f>=55?'medium':'low'}">${f}/100</span>`:'';return `<article class="plan-task"><div class="task-number">0${i+1}</div><div class="task-body"><h2><button class="task-info" data-action="task-info" data-id="${t.id}" aria-label="Подробнее: ${t.name}"><span>${t.name}</span><small class="mobile-task-skill">${skill} ${fitHTML}</small></button></h2><p>${t.description}</p><div class="task-select-row"><select aria-label="Исполнитель: ${t.name}" data-task="${t.id}"><option value="">Выбрать разработчика</option>${game.team.map(aid=>{const a=agentById(aid);return `<option value="${aid}" ${id===aid?'selected':''}>${a.name} · ${mobileUI.matches?'':skill+' '}${a.stats[t.skill]}</option>`;}).join('')}</select>${fitHTML}</div></div></article>`;}).join('')}</div>
    ${game.assignments.design&&game.assignments.design===game.assignments.code?'<div class="warning-note">Один разработчик назначен на код и дизайн. Эти задачи будут выполняться по очереди.</div>':''}
    <div class="panel-bottom"><button class="primary full" data-action="work" ${complete&&teamSeated(game)&&!officeMoving?'':'disabled'}>${officeMoving?'Команда занимает места…':!teamSeated(game)?'Сначала рассади команду':'Начать смену'} ${icon('play',17)}</button><button class="text-button centered" data-action="back-hire">Изменить команду</button></div>`;
}
function workPanel() {
  const active=activeTasks(game);
  const support=active.reduce((low,t)=>!low||fit(game.assignments[t.id],t)<fit(game.assignments[low.id],low)?t:low,null);
  return `<div class="panel-header"><div class="eyebrow">3 / 4 · СМЕНА</div><h1>Команда за работой</h1><p>Пропусти час или помоги разработчику с его задачей.</p></div>
    <div class="work-controls"><button class="primary" data-action="tick">${icon('clock',18)} Следующий час</button></div>
    <div class="time-strip" role="status">Прошло <strong>${game.time} ч</strong><span>План: ${game.deadline} ч</span></div>
    <div class="work-tasks">${TASKS.map(t=>{const status=taskStatus(game,t), a=agentById(game.assignments[t.id]);const running=active.some(x=>x.id===t.id);return `<article class="work-task ${status==='done'?'done':running?'active':''}"><div class="work-task-icon">${icon(status==='done'?'check':running?'bolt':'lock',17)}</div><div><h2>${t.name}</h2><span>${a.name} · ${status==='done'?'Готово':running?'В работе':status==='locked'?'Ждёт предыдущие задачи':awayForRest(game.life.members[a.id])?condition(game,a.id).label:'Разработчик занят'}</span><div class="meter"><i style="width:${game.progress[t.id]}%"></i></div></div><strong>${Math.round(game.progress[t.id])}%</strong></article>`;}).join('')}</div>
    <div class="activity-log"><div class="eyebrow">ИЗ СТУДИИ</div><button class="text-button" data-action="activity">Журнал ↗</button>${game.log.slice(-1).reverse().map((m,i)=>`<p class="${i===0?'latest':''}"><span></span>${esc(m)}</p>`).join('')}</div>
    ${game.support?`<div class="support-done">${icon('check',18)}<span>Разбор проведён: ${agentById(game.support.agentId).name}<small>Навык для задачи «${TASKS.find(t=>t.id===game.support.taskId).name}» повышен на 15, максимум до 100.</small></span></div>`:support?`<div class="support-card"><div class="eyebrow">ПОМОЩЬ ТИМЛИДА</div><h2>${agentById(game.assignments[support.id]).name}: «${support.name}»</h2><p>Разберите задачу вместе. Разработчик лучше справится с ней, но ты потратишь час.</p><button class="secondary full" data-action="support" data-id="${support.id}">Помочь с задачей <span>+1 ч</span></button></div>`:''}`;
}
function eventVoices() {
  if (!game || game.stage !== 'event') return [];
  if (game.currentEvent === 'life') {
    const incident = game.life.incident;
    return incident.type === 'tension' ? [{id:incident.id,kind:'conflict'},{id:incident.otherId,kind:'concern'}]
      : [{id:incident.id,kind:incident.type === 'idea' ? 'work' : 'concern'}];
  }
  return discussionSpeakers(game);
}
function characterQuote(id,kind) {
  const agent=agentById(id); if(!agent)return '';
  return `<blockquote class="character-event-line"><b>${agent.name}</b><p>«${esc(characterLine(id,kind))}»</p>${sound.hasCharacterVoice(id,kind)?`<button class="secondary team-voice" data-action="character-voice" data-id="${id}" data-kind="${kind}" aria-label="Прослушать реплику: ${agent.name}">Послушать</button>`:''}</blockquote>`;
}
function syncCharacterSpeaking() {
  document.querySelectorAll('[data-character-speaker]').forEach(el=>el.classList.toggle('is-speaking',el.dataset.characterSpeaker===sound.speakingCharacter));
}
document.addEventListener('character-voice-state',syncCharacterSpeaking);
function eventPanel() { return renderDecisionPanel(game); }
function resultPanel() {
  const r=getResult(game);
  return `<div class="panel-header"><div class="eyebrow">ШАГ 04 · РЕЗУЛЬТАТ</div><h1>${r.title}</h1><p>${r.summary}</p></div>
    <div class="result-score"><span class="score-orbit">${icon(r.passed?'rocket':'flag',32)}</span><div><strong>${r.score}<small>/ 100</small></strong><span>оценка проекта в игре</span></div>${badge(r.passed?'РЕЛИЗ ПРИНЯТ':'НУЖНА ДОРАБОТКА',r.passed?'success':'danger')}</div>
    <div class="result-metrics"><div><small>Качество работы</small><b>${r.quality}%</b></div><div><small>Срок</small><b class="${r.late?'coral':'mint'}">${r.late?`+${r.late} ч`:'Вовремя'}</b></div><div><small>Резерв</small><b>${money(game.budget)}</b></div><div><small>Доверие к команде</small><b>${game.trust}%</b></div></div>
    <button class="game-preview" data-action="play-mini"><span class="preview-space"><i>✦</i>${icon('rocket',48)}<i>✧</i></span><span><small>СДЕЛАНО ВАШЕЙ КОМАНДОЙ</small><b>ОРБИТА</b><span>Сыграть в получившуюся игру ${icon('arrow',16)}</span></span>${icon('play',24)}</button>
    <div class="release-features">${game.wallBug?'<span class="coral">Ошибка: астероиды не останавливают корабль</span>':''}<span>${icon(game.shield?'check':'cross',14)} ${game.shield?'Защитный щит':'Без щита'}</span><span>${icon(game.checkpoint&&!game.criticalBug?'check':'cross',14)} ${game.criticalBug?'Баг сохранения':game.checkpoint?'Сохранение работает':'Сессия без сохранения'}</span></div>
    <div class="career-result"><span class="eyebrow">ЧТО ДЕЛАЛ ТИМЛИД</span><h2>Помог команде выпустить игру</h2><ul class="lead-recap"><li>${game.support?'Разобрал сложную задачу вместе с разработчиком':'Распределил задачи по навыкам'}</li><li>${game.choices.review==='review-skip'?'Пропустил ошибку при проверке кода':'Нашёл ошибку при проверке кода'}</li><li>Решил, что исправлять перед показом</li></ul><button class="text-button" data-action="debrief">Почему такой результат? ${icon('arrow',15)}</button></div>
    <section class="life-result" aria-label="Развитие студии"><h2>Студия живёт дальше</h2><p>За этот заказ: +${money(game.life.history.at(-1)?.reward||0)} в кассу. Всего: ${money(game.life.cash)}. Команда и улучшения сохраняются в следующей смене.</p>${game.life.departures.length?'<p class="life-notice">Есть риск ухода сотрудников. Проверь состояние команды до следующего заказа.</p>':''}<button class="primary" data-action="life-contracts">Следующий заказ →</button><button class="secondary" data-action="life-office">Обустройство и касса</button></section><div class="panel-bottom"><button class="secondary full" data-action="restart">${icon('reset',17)} Начать новую студию</button></div>`;
}
let renderedStage = null;
function workspaceTabs() {
  return sceneDock(game,{icon,money,busy:officeMoving,panelOpen:workspaceView==='project'});
}
function render() {
  const panelScroll=root.querySelector('.control-panel')?.scrollTop||0;
  const manageOpen=!!root.querySelector('.crew-manage')?.open;
  const focused=document.activeElement;
  const oldAction=focused?.dataset?.action, oldId=focused?.dataset?.id, oldTask=focused?.dataset?.task, oldSeat=focused?.dataset?.seat, oldGuide=focused?.dataset?.guide;
  const nextStage=game?.stage||'intro', stageChanged=nextStage!==renderedStage;
  renderedStage=nextStage;
  if (!game) {
    const openSections=[...root.querySelectorAll('.start-screen details[open]')].map(section=>section.id);
    syncEventDialog();detachOfficeWorld();root.innerHTML=intro();
    for(const id of openSections){const section=document.getElementById(id);if(section)section.open=true;}
    if(oldAction)root.querySelector(`[data-action="${oldAction}"]`)?.focus({preventScroll:true});
    if(stageChanged){onboarding.sync(null);window.scrollTo(0,0);}return;
  }
  const panels={hire:hirePanel,plan:planPanel,work:workPanel,event:()=>`<div class="event-waiting"><div class="eyebrow">КОМАНДА ЖДЁТ</div><h1>Нужно твоё решение</h1><p>${employeeEvent(game)?employeeEvent(game).name+' ждёт тебя в офисе. Нажми на красный сигнал над сотрудником. Таймер решения начнётся после открытия.':'Смена приостановлена. Ответь на событие, чтобы команда продолжила работу.'}</p><button class="primary" data-action="event-open">Открыть событие</button></div>`,result:resultPanel};
  if (stageChanged) { workspaceView = game.stage==='plan'||game.stage==='hire'&&game.team.length<3?'project':'office'; managementExpanded=workspaceView==='project';officeExpanded = false;if(employeeEvent(game))officeSelection=null; }
  if(onboarding.isOpen())workspaceView='office';
  root.innerHTML=`<main class="game-shell team-hud-layout scene-first ${game.stage==='event'?'event-state':''}" data-pane-expanded="${managementExpanded}" data-expanded="${officeExpanded}" data-stage="${game.stage}" data-event="${game.currentEvent||''}" data-workspace="${workspaceView}">${topbar()}${workspaceTabs()}<div class="game-layout">${renderTeamHUD(game,officeSelection)}${scene()}<section id="project-panel" class="control-panel" aria-label="Управление проектом" ${workspaceView==='project'?'':'hidden inert'}>${managementBar(managementExpanded,{icon})}${panels[game.stage]()}</section></div></main>`;
  mountOfficeWorld(game,officeSelection,{
    arriveOnLoad: DEMO && demoArrival,
    onBusy:busy=>{if(officeMoving!==busy){officeMoving=busy;if(game)render();}},
    onCoffee:(id,arrival,source)=>{if(game===source){const before=captureMembers(game);if(coffeeArrival(game,id,arrival)){if(arrival==='drank')queueMemberFeedback(game,before,[id]);persist();render();}}},
    onRest:(id,arrival)=>{if(game&&restArrival(game,id,arrival)){persist();render();}},
    onActor:id=>selectEmployee(id),
    onObject:id=>officeObject(id),
    onDesk:index=>{if(game)officeDeskAction(index);},
    onFloor:point=>officeWalk(point),
    onError:message=>{toast(message);if(game)render();},
  });
  onboarding.sync(game, officeMoving);
  syncCharacterSpeaking();
  if(manageOpen&&!stageChanged&&root.querySelector('.crew-manage'))root.querySelector('.crew-manage').open=true;
  syncEventDialog();
  if(!stageChanged&&root.querySelector('.control-panel'))root.querySelector('.control-panel').scrollTop=panelScroll;
  if (officeExpanded) root.querySelectorAll('.game-topbar,.scene-footer,.control-panel,.team-hud').forEach(el => { el.inert = true; });
  if(oldTask) root.querySelector(`[data-task="${oldTask}"]`)?.focus({preventScroll:true});
  else if(oldSeat!==undefined) root.querySelector(`[data-seat="${oldSeat}"]`)?.focus({preventScroll:true});
  else if(oldGuide) document.querySelector(`[data-guide="${oldGuide}"]`)?.focus({preventScroll:true});
  else if(oldAction) root.querySelector(`[data-action="${oldAction}"]${oldId?`[data-id="${oldId}"]`:''}`)?.focus({preventScroll:true});
  if(stageChanged){
    if(nextStage==='result')sound.effect('result');
    if(nextStage==='result')sound.speakCharacter(game.assignments.release,characterMoment(game,game.assignments.release));
    if(nextStage==='work' && game.time===0)sound.speakCharacter(game.assignments.brief,'work');
    window.scrollTo(0,0);
    if(!document.querySelector('dialog[open]')){
      const destination=workspaceView==='project'?root.querySelector('.control-panel h1'):root.querySelector('.scene-next .primary');
      if(destination?.tagName==='H1')destination.tabIndex=-1;
      destination?.focus({preventScroll:true});
    }
  }
}
function syncEventDialog(requestOpen=false) {
  const key=eventKey(game);
  if(!key){if(eventDialog.open){eventDialog.close();sound.stopVoice('character');}shownEvent=null;openedIncidentKey=null;return;}
  const incident=employeeEvent(game);
  if(incident){
    if(requestOpen)openedIncidentKey=key;
    if(openedIncidentKey!==key){if(eventDialog.open){eventDialog.close();sound.stopVoice('character');}return;}
  }
  const fresh=shownEvent!==key;
  if(fresh){
    shownEvent=key;eventSaveSecond=-1;
    const timer=ensureEventClock(game);persist();
    const contents=eventPanel().replace('<h1>','<h2 id="event-title" tabindex="-1">').replace('</h1>','</h2>');
    eventDialog.innerHTML='<div class="event-modal-label">СОБЫТИЕ В СТУДИИ</div>'+
      (timer?'<div class="decision-clock"><div><b data-event-seconds></b><span>По таймеру: отложить · напряжение +10 · настроение −8</span></div><progress max="'+(game.difficulty==='hard'?30000:45000)+'" value="'+timer.remaining+'" data-event-progress aria-label="Осталось времени"></progress><div class="event-timer-actions"><button class="secondary" data-action="event-pause"></button><button class="text-button" data-action="event-untimed">Играть без таймеров</button></div></div>':'<p class="event-unlimited">Без ограничения времени. Смена продолжится после решения.</p>')+
      contents+(incident?'<details class="decision-details decision-voices"><summary>Что говорят коллеги</summary>'+eventVoices().map(line=>characterQuote(line.id,line.kind)).join('')+'</details><button class="secondary event-return" data-action="event-dismiss">Вернуться в офис · пауза решения</button>':'')+'<button class="text-button event-menu" data-action="menu">Меню игры</button>';
    eventDialog.classList.remove('event-clock-compact');eventDialog.scrollTop=0;sound.stopVoice();
  }
  if(!eventDialog.open){eventDialog.showModal();eventDialog.querySelector('#event-title')?.focus({preventScroll:true});eventDialog.scrollTop=0;}
  updateEventClock(0);
  if(fresh)sound.speakExchange(eventVoices(),true);
}
function completeDecision(id,expired=false){
  const event=game.currentEvent;
  const incident=game.life.incident,kind=game.currentEvent;
  const affected=kind==='life'?(incident.type==='idea'&&id==='life-care'?[...game.team]:[incident.id,...(incident.type==='tension'?[incident.otherId]:[])]):discussionSpeakers(game).map(line=>line.id);
  const before=captureMembers(game);
  const error=resolveEvent(game,id);
  if(error){toast(error);return;}
  if(event==='life')queueMemberFeedback(game,before,affected);
  else decisionFeedback={game,before,affected,responses:game.discussions[event].responses};
  delete game.eventClock;
  if(expired)game.log.push('Время решения вышло: проблема отложена до релиза.');
  persist();render();
  if(event!=='life') {showDialog(renderDecisionReceipt(game,event));sound.speakExchange(game.discussions[event].responses,true);}
  if(expired)toast('Время вышло: проблему отложили. Напряжение +10, настроение −8.');
}
function updateEventClock(delta){
  if(!game||game.stage!=='event')return;
  const clock=ensureEventClock(game);if(!clock)return;
  const blocked=document.hidden||dialog.open||!eventDialog.open;
  if(advanceEventClock(game,delta,blocked)){completeDecision('life-wait',true);return;}
  const seconds=Math.ceil(clock.remaining/1000),label=eventDialog.querySelector('[data-event-seconds]');
  if(label)label.textContent=(clock.paused?'Пауза · ':blocked?'Ожидание · ':'На решение · ')+seconds+' с';
  const bar=eventDialog.querySelector('[data-event-progress]');if(bar)bar.value=clock.remaining;
  const button=eventDialog.querySelector('[data-action="event-pause"]');if(button){button.textContent=clock.paused?'Продолжить таймер':'Пауза таймера';button.setAttribute('aria-pressed',String(clock.paused));}
  if(seconds!==eventSaveSecond){eventSaveSecond=seconds;persist();}
}
eventDialog.addEventListener('close',()=>sound.stopVoice('character'));
eventDialog.addEventListener('scroll',()=>eventDialog.classList.toggle('event-clock-compact',eventDialog.scrollTop>80),{passive:true});
eventDialog.addEventListener('cancel',e=>{e.preventDefault();if(employeeEvent(game)){openedIncidentKey=null;eventDialog.close();return;}const clock=game&&ensureEventClock(game);if(clock){clock.paused=true;persist();updateEventClock(0);}else eventDialog.querySelector('#event-title')?.focus();});
function selectEmployee(id,{focus=true}={}) {
  if(!game?.team.includes(id))return;
  const changed=officeSelection!==id;
  officeSelection=id;workspaceView='office';onboarding.collapseGuide();
  if(dialog.open)dialog.close();
  render();
  if(employeeEvent(game)?.id===id){syncEventDialog(true);return;}
  if(focus)root.querySelector('#employee-name')?.focus({preventScroll:true});
  if(changed){const kind=characterMoment(game,id);if(kind)sound.speakCharacter(id,kind,true);else sound.stopVoice('character');}
}
function clearEmployeeSelection() {
  const previous=officeSelection;officeSelection=null;sound.stopVoice('character');render();
  root.querySelector(`[data-action="team-focus"][data-id="${previous}"]`)?.focus({preventScroll:true});
}
function officeWalk(point) {
  if(!game||!officeSelection)return;
  if(!canWalkTo(officeSelection,point)){toast('Не пройти: выбери свободное место ближе к проходу.');return;}
  const error=walkInOffice(game,officeSelection,point);
  if(error)toast(error);else{persist();render();}
}
function officeDeskAction(index) {
  if(employeeEvent(game)?.id===game.seats[index]){syncEventDialog(true);return;}
  const occupant=game.seats[index];
  if(['hire','plan'].includes(game.stage)){
    if(officeSelection){const name=agentById(officeSelection).name;const error=seatAgent(game,officeSelection,index);if(error)toast(error);else{officeSelection=null;persist();render();toast(`${name} направляется к компьютеру ${index+1}.`);}}
    else if(occupant){selectEmployee(occupant);}
    else toast(game.team.length?'Выбери персонажа в команде, затем этот компьютер.':'Сначала выбери и найми разработчика.');
  }else if(occupant){selectEmployee(occupant);}
}
function advance() { if(!game||clockBlocked())return;if(tick(game)){game.clockFraction=0;if(game.stage==='result')stopAuto();persist();render();} }
function newGame() { stopAuto(); resetOfficeWorld(); officeMoving=false; game=createGame(difficulty); candidate='mira'; officeSelection=null; mini=null; try{localStorage.removeItem(MINI);}catch{} persist(); render(); onboarding.start(game); }
function resetDialog() { showDialog(`<div class="eyebrow">НОВАЯ СТУДИЯ</div><h2 id="dialog-title">Начать с чистого листа?</h2><p>Команда, касса, улучшения и история заказов будут заменены. Для продолжения текущей студии выбери следующий заказ после релиза.</p><div class="dialog-actions"><button class="secondary" data-action="close-dialog">Остаться</button><button class="primary" data-action="confirm-new">Начать заново</button></div>`); }
function about() { showDialog(`<div class="eyebrow">ДО РЕЛИЗА · v0.5</div><h2 id="dialog-title">Кто такой тимлид?</h2><p>Это разработчик, который руководит командой: помогает разобраться с задачами, выбирает технические решения и проверяет код.</p><p>Найми троих разработчиков: каждый сам займёт свободный компьютер. В панели команды можно выбрать, кто за каким компьютером сидит. До начала смены можно нажать на свободный пол, чтобы пройтись по офису. Потяни сцену мышью или пальцем, чтобы повернуть её. Дальше собери план для маленькой игры. Код отвечает за механику, дизайн — за экран, тесты — за поиск ошибок, общение — за понимание задания. Темп показывает, как быстро разработчик работает.</p><p>Время двигается кнопкой «Следующий час» или на «Авто». Во время обсуждения и открытого окна часы стоят, затем автоход продолжается. Сложную задачу можно разобрать вместе с разработчиком. Пока коллега отдыхает или пьёт, остальные работают. Вернувшийся продолжит свою задачу.</p><p class="small-muted">Это игровая модель профессии. Разработчики — персонажи с заданными навыками; реальные языковые модели не подключены. Графика создана с помощью ИИ. Сохранение работает в этом браузере.</p><button class="primary full" data-action="close-dialog">Понятно ${icon('check')}</button>`); }
function inspect(id) {
  if(employeeEvent(game)?.id===id){if(dialog.open)dialog.close();syncEventDialog(true);return;}
  const a=agentById(id); if(!a)return;
  if(game.stage==='hire'){candidate=id;render();return;}
  const task=activeTasks(game).find(t=>game.assignments[t.id]===id);
  const waiting=TASKS.find(t=>game.assignments[t.id]===id&&game.progress[t.id]<100);
  const kind=characterMoment(game,id);
  const status=game.stage==='event'?'Ждёт твоего решения':game.stage==='result'?'Игра выпущена':task?task.verb:waiting?'Ждёт предыдущую задачу':'Свободен — его задачи готовы';
  showDialog(`<div class="speaker">${portrait(a)}<span><b>${a.name}</b><small>Компьютер ${game.seats.indexOf(id)+1} · ${a.role}</small></span></div><h2 id="dialog-title">${status}</h2><blockquote>«${esc(kind?characterLine(id,kind):a.quote)}»</blockquote>${kind&&sound.hasCharacterVoice(id,kind)?`<button class="secondary full" data-action="character-voice" data-id="${id}" data-kind="${kind}" aria-label="Прослушать реплику: ${a.name}">Послушать реплику</button>`:''}<p>${condition(game,id).label}. ${condition(game,id).reason}</p><button class="secondary full" data-action="life-member" data-id="${id}">Состояние и забота о сотруднике</button><div class="inspect-work">${task?`<h3>${task.name} · ${Math.round(game.progress[task.id])}%</h3><div class="meter"><i style="width:${game.progress[task.id]}%"></i></div><p>${task.description}</p>${game.stage==='work'&&!game.support?`<button class="secondary full" data-action="support" data-id="${task.id}">Разобрать задачу вместе · +1 ч</button>`:''}`:`<p>${waiting?'Сейчас работа зависит от других задач. Можно продвинуть время и проверить команду.':'Все назначенные задачи завершены.'}</p>`}</div><p class="small-muted">Часов в работе: ${game.workload[a.id]||0}. После восьми часов темп немного снижается; ожидание и перерыв восстанавливают энергию.</p><details class="inspect-details"><summary>Пять навыков и профиль</summary><div class="inspect-radar">${radar(a)}</div><p>${a.desc}</p></details><button class="secondary full" data-action="watch-agent" data-id="${a.id}">Наблюдать за работой ↗</button><button class="primary full" data-action="close-dialog">Вернуться в студию</button>`);
  if(kind)sound.speakCharacter(id,kind,true);
}
function debrief() {
  const r=getResult(game), weakest=TASKS.reduce((a,b)=>fit(game.assignments[a.id],a)<fit(game.assignments[b.id],b)?a:b);
  showDialog(`<div class="eyebrow">РАЗБОР ПРОЕКТА</div><h2 id="dialog-title">Что изменили ваши решения</h2><ul class="debrief-list"><li><b>Подбор и распределение.</b> Среднее соответствие навыков задачам — ${r.quality}%. Самое слабое место: «${weakest.name}» (${fit(game.assignments[weakest.id],weakest)}/100).</li><li><b>Объём.</b> ${game.choices.scope==='focus'?'Вы договорились перенести новую функцию. Это сохранило время и резерв.':game.choices.scope==='shield'?'Добавили щит за 2 000 ₽ и увеличили объём кода. Щит работает в вашей мини-игре.':'Обменяли часть оформления на щит. Дополнительная механика появилась, интерфейс стал проще.'}</li><li><b>Качество.</b> ${game.choices.bug==='fix'?'Вы потратили 2 часа и 1 500 ₽, чтобы исправить сохранение. Теперь мини-игра восстанавливает прогресс.':game.choices.bug==='cut'?'Вы честно сократили функциональность. Мини-игру нужно проходить за одну сессию.':'Вы выпустили известную ошибку. При перезапуске мини-игры прогресс теряется.'}</li><li><b>Проверка кода.</b> ${game.wallBug ? 'Проверка пропущена. В мини-игре корабль проходит сквозь астероиды.' : 'Вы исправили порядок действий: проверка препятствия выполняется до движения.'}</li><li><b>Помощь.</b> ${game.support ? 'Вы провели совместный разбор: разработчик лучше справился с конкретной задачей, но понадобился дополнительный час.' : 'В этой смене команда справлялась без совместного разбора.'}</li><li><b>Срок.</b> ${r.late?`Задержка ${r.late} ч. Резерв времени и параллельная работа помогут в следующей попытке.`:'Команда уложилась в согласованный срок.'}</li></ul><p class="small-muted">Оценка: качество — до 45 баллов; срок — до 25; бюджет — 10; доверие — до 10; отсутствие критического бага — 10. Упрощение визуала снижает оценку на 2,4 балла.</p><button class="primary full" data-action="close-dialog">Вернуться к результату</button>`);
}

let miniMessage = '', miniEffect = {}, miniStored = false;
function saveMini() {
  if(recordOrbitResult(game,mini)){persist();render();}
  miniStored=false;
  if(canSaveOrbit(game)){try{localStorage.setItem(MINI,JSON.stringify(mini));miniStored=true;}catch{toast('Браузер не разрешил сохранить мини-игру.');}}
}
function openMini(reloading=false) {
  const previous=mini;
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(MINI)); } catch {}
  mini = restoreOrbit(game, stored);miniEffect={};
  const mode=orbitFeatures(game,getResult(game).design).saveMode;
  miniMessage = stored && canSaveOrbit(game) && mini.moves === 0 && stored.release !== mini.release
    ? 'Полёт начат заново для обновлённого релиза. Студия и решения команды сохранены.' : '';
  if(mode==='broken'){
    miniEffect={kind:'lost'};
    miniMessage=previous?.release===mini.release&&previous.moves>0
      ? 'Ошибка сохранения. Батарей потеряно: '+previous.collected.length+' / '+missionFor(game).batteries.length+'. Ходов сброшено: '+previous.moves+'. Корабль снова на старте.'
      : 'В релизе осталась ошибка сохранения. После перезапуска полёт всегда начинается заново.';
  }else if(mode==='removed')miniMessage='Короткая сессия без сохранения — так команда договорилась с заказчиком.';
  else if(reloading&&!miniMessage)miniMessage=mini.moves>0?'Положение корабля, батареи и заряд щита восстановлены.':'Сохранённый маршрут начинается здесь.';
  saveMini();
  showDialog('<h2 id="dialog-title">Орбита</h2>');renderMini();
}
function renderMini() {
  document.querySelector('#dialog-content').innerHTML=renderOrbit(game,mini,{icon,design:getResult(game).design,message:miniMessage,effect:miniEffect,stored:miniStored});
}
function moveMini(dx,dy) {
  if(!mini)return;
  const focus=document.activeElement?.closest('[data-action]');
  const selector=focus?.dataset.action==='move'?`[data-action="move"][data-dir="${focus.dataset.dir}"]`:'.tile.ship';
  const outcome=stepOrbit(game,mini,dx,dy);
  if(outcome.kind==='idle')return;
  miniEffect=outcome;miniMessage=outcome.message;
  saveMini();renderMini();
  const next=dialog.querySelector(selector);
  (next&&!next.disabled?next:dialog.querySelector('.tile.ship'))?.focus({preventScroll:true});
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!officeExpanded&&!document.querySelector('dialog[open]')) {
    if(officeSelection){clearEmployeeSelection();}
    else if(workspaceView==='project'){workspaceView='office';render();root.querySelector('.scene-dock [data-id="project"]')?.focus({preventScroll:true});}
  }
  if (e.key==='Escape' && officeExpanded && !document.querySelector('dialog[open]')) {
    if(officeSelection){clearEmployeeSelection();}else{officeExpanded=false; render(); root.querySelector('[data-action="office-expand"]')?.focus();}
  }
  const keyboardDialog=document.querySelector('dialog[open]');
  if(keyboardDialog&&e.key==='Tab'){
    const controls=[...keyboardDialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(first&&((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)||!keyboardDialog.contains(document.activeElement))){e.preventDefault();(e.shiftKey?last:first).focus();}
  }
  if(dialog.open&&document.querySelector('.mini-board')){const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(d){e.preventDefault();moveMini(...d);}}
});
document.addEventListener('change',e=>{
  if(e.target.dataset.seat!==undefined&&game){const error=seatAgent(game,e.target.value,Number(e.target.dataset.seat));if(error)toast(error);else{officeSelection=e.target.value;persist();render();if(dialog.open&&dialog.querySelector('.seating-panel')){showDialog(`<h2 id="dialog-title">Рабочие места</h2>${seatingPanel()}`);dialog.querySelector(`[data-seat="${e.target.dataset.seat}"]`)?.focus();}toast(`${agentById(officeSelection).name}: компьютер ${Number(e.target.dataset.seat)+1}.`);}return;}
  if(e.target.name==='difficulty'){difficulty=e.target.value;render();root.querySelector(`[name="difficulty"][value="${difficulty}"]`)?.focus({preventScroll:true});}
  if(e.target.dataset.task&&game){assign(game,e.target.dataset.task,e.target.value);persist();render();}
});
mobileUI.addEventListener('change',()=>{if(game)render();});
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-action]');if(!el||el.disabled)return;
  const action=el.dataset.action,id=el.dataset.id;
  if(action==='sound'){sound.toggle();render();return;}
  if(action==='start-sound'){
    if(!sound.enabled)sound.toggle();
    soundPreviewed=true; render();
    root.querySelector('[data-action="start-sound"]')?.focus({preventScroll:true});
    sound.unlock(); sound.speak('guide-hire',true); return;
  }
  sound.unlock();
  sound.effect(({hire:'hire',plan:'plan',work:'plan',decision:'decision'})[action]||'click');
  if(action==='close-dialog'){sound.stopVoice('character');dialog.close();return;}
  if(action==='about'){about();return;}
  if(action==='new-game'){if(saved)resetDialog();else newGame();return;}
  if(action==='confirm-new'){dialog.close();newGame();return;}
  if(action==='continue'){game=structuredClone(saved);difficulty=game.difficulty;candidate=game.team[0]||'mira';render();return;}
  if(!game)return;
  if(action==='workspace'){workspaceView=id==='project'&&workspaceView==='project'?'office':id;officeExpanded=false;officeSelection=null;if(dialog.open){sound.stopVoice('character');dialog.close();}onboarding.collapseGuide();render();}
  if(action==='team-focus'){selectEmployee(id);return;}
  if(action==='guide-open'){if(dialog.open)dialog.close();onboarding.openGuide();render();return;}
  if(action==='panel-size'){managementExpanded=!managementExpanded;render();return;}
  if(action==='studio-project'){officeExpanded=false;workspaceView='project';onboarding.collapseGuide();render();root.querySelector('.management-topbar [data-id="office"]')?.focus({preventScroll:true});return;}
  if(action==='guide-reset'){dialog.close();onboarding.resetBubble();onboarding.toggleGuide();render();return;}
  if(action==='studio-team'){showStudioTeam();return;}
  if(action==='office-object'){officeObject(id);return;}
  if(action==='fund-team'){const error=fundTeam(game);if(error)toast(error);else{persist();render();}return;}
  if(action==='character-voice'){sound.speakCharacter(id,el.dataset.kind,true);return;}
  if(action==='team-dismiss'){clearEmployeeSelection();return;}
  if(action==='seating'){showDialog(`<h2 id="dialog-title">Рабочие места</h2>${seatingPanel()}`);}
  if(action==='event-open'){syncEventDialog(true);return;}
  if(action==='event-dismiss'){openedIncidentKey=null;eventDialog.close();return;}
  if(action==='event-pause'){const clock=ensureEventClock(game);if(clock)clock.paused=!clock.paused;persist();updateEventClock(0);return;}
  if(action==='event-untimed'){game.timedEvents=false;delete game.eventClock;shownEvent=null;persist();syncEventDialog();return;}
  if(action==='orbit-scan'||action==='orbit-wait'){const outcome=actOrbit(game,mini,action==='orbit-scan'?'scan':'wait');miniEffect=outcome;miniMessage=outcome.message;saveMini();renderMini();dialog.querySelector('.tile.ship')?.focus({preventScroll:true});return;}
  if(action==='office-expand'){officeExpanded=!officeExpanded;workspaceView='office';onboarding.collapseGuide();render();}
  if(action==='task-info'){const t=TASKS.find(t=>t.id===id);showDialog(`<div class="eyebrow">ЗАДАЧА КОМАНДЫ</div><h2 id="dialog-title">${t.name}</h2><p>${t.description}</p><button class="primary full" data-action="close-dialog">К плану</button>`);}
  if(action==='activity')showDialog(`<div class="eyebrow">ИЗ СТУДИИ</div><h2 id="dialog-title">Журнал смены</h2>${Object.entries(game.discussions||{}).filter(([,r])=>r.option).map(([event])=>`<button class="secondary full" data-action="discussion-receipt" data-id="${event}">Решение и ответы команды · ${EVENTS[event].title}</button>`).join('')}<div class="activity-history">${game.log.slice().reverse().map(m=>`<p>${esc(m)}</p>`).join('')}</div><button class="primary full" data-action="close-dialog">К команде</button>`);
  if(action==='discussion-receipt' && game.discussions?.[id]?.option){showDialog(renderDecisionReceipt(game,id));return;}
  if(action==='event-info'){const ev=EVENTS[game.currentEvent];showDialog(`<div class="eyebrow">КОНТЕКСТ РЕШЕНИЯ</div><h2 id="dialog-title">${ev.title}</h2><p>${ev.text}</p>${ev.options.map(o=>`<p><b>${o.title}.</b> ${o.text}<br><small>${o.effect}</small></p>`).join('')}<p>${ev.lesson}</p><button class="primary full" data-action="close-dialog">Вернуться к решению</button>`);}
  if(action==='candidate-info'){const a=agentById(id);showDialog(`<div class="speaker">${portrait(a)}<span><b>${a.name}</b><small>${a.role}</small></span></div><h2 id="dialog-title">${a.trait}</h2><blockquote>«${a.quote}»</blockquote><p>${a.desc}</p><div class="inspect-radar">${radar(a)}</div><p class="profile-weakness">${a.weakness}</p>${sound.hasCharacterVoice(id,'intro')?`<button class="secondary full" data-action="character-voice" data-id="${id}" data-kind="intro" aria-label="Послушать голос: ${a.name}">Послушать голос</button>`:''}<button class="primary full" data-action="close-dialog">Вернуться к команде</button>`);sound.speakCharacter(id,'intro',true);}
  if(action==='shop-filter'){const catalog=dialog.querySelector('.office-catalog');if(catalog){catalog.dataset.filter=id;catalog.querySelectorAll('[data-action=shop-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===id)));}return;}
  if(action==='scene-time'){const t=shiftTime(game);showDialog(`<h2 id="dialog-title">Часы студии</h2><dl class="life-stats"><div><dt>Сейчас</dt><dd>${t.now}</dd></div><div><dt>Дедлайн</dt><dd>${t.end}</dd></div><div><dt>${t.late?'Опоздание':'Осталось'}</dt><dd>${t.remaining}</dd></div></dl><p>Время идёт вместе со сменой. Просмотр меню ставит её на паузу.</p>`);return;}
  if(action==='life-office'){showDialog(officePanel(game));return;}
  if(action==='life-member'){if(employeeEvent(game)?.id===id){if(dialog.open)dialog.close();syncEventDialog(true);return;}if(game.team.includes(id)){selectEmployee(id,{focus:false});showDialog(memberPanel(game,id));}return;}
  if(action==='life-contracts'){if(game.stage==='result')showDialog(contractsPanel(game));return;}
  if(action==='life-break'||action==='life-coffee'||action==='life-praise'||action==='life-raise'||action==='life-release'){
    const fromEmployeeCard=!!el.closest('.employee-card');
    const before=captureMembers(game);
    const error=careFor(game,id,action.slice(5));
    if(error)toast(error);else{queueMemberFeedback(game,before);if(action==='life-break'||action==='life-coffee')dialog.close();persist();render();if(action==='life-coffee'){officeSelection=id;workspaceView='office';officeExpanded=false;render();toast(game.life.members[id].coffeeTrip.phase==='queued'?'Напиток заказан. Сотрудник ждёт свободную станцию.':'Сотрудник идёт за напитком. Энергия восстановится после питья.');}else if(action!=='life-break'&&!fromEmployeeCard)showDialog(memberPanel(game,id));else if(action!=='life-break')toast('Результат отмечен. Настроение сотрудника улучшилось.');else toast(game.life.members[id].restTrip.phase==='queued'?`${agentById(id).name}: перерыв запланирован, ждём свободное кресло.`:`${agentById(id).name} идёт в зону отдыха.`);}return;
  }
  if(action==='life-release-preview'){
    if(!game.team.includes(id))return;
    showDialog(`<div class="eyebrow">СОСТАВ НА СЛЕДУЮЩИЙ ЗАКАЗ</div><h2 id="dialog-title">Не продлевать контракт ${agentById(id).name}?</h2><p>Сотрудник закончил текущий проект. Следующий заказ пройдёт без него и без его доплат. Перед началом работы нужно будет нанять и рассадить замену. Этот сотрудник пропустит один заказ.</p><div class="dialog-actions"><button class="secondary" data-action="life-member" data-id="${id}">Назад</button><button class="primary" data-action="life-release" data-id="${id}">Не продлевать</button></div>`);return;
  }
  if(action==='life-raise-preview'){
    if(!game.team.includes(id))return;
    showDialog(`<div class="eyebrow">УСЛОВИЯ РАБОТЫ</div><h2 id="dialog-title">Повысить оплату ${agentById(id).name}?</h2><p>Выплатить сейчас 1 000 ₽ из кассы студии. Каждый следующий заказ будет требовать ещё 1 000 ₽ доплаты этому сотруднику. Настроение +15; предупреждение об уходе снимается.</p><div class="dialog-actions"><button class="secondary" data-action="life-member" data-id="${id}">Назад</button><button class="primary" data-action="life-raise" data-id="${id}">Подтвердить · 1 000 ₽</button></div>`);return;
  }
  if(action==='life-buy-preview'){
    const u=UPGRADES.find(u=>u.id===id);if(!u)return;
    showDialog(purchasePanel(game,u));return;
  }
  if(action==='life-buy'){
    const cost=UPGRADES.find(u=>u.id===id)?.price;
    const error=buyUpgrade(game,id);if(error)toast(error);else{queuePurchaseFeedback(game,id,cost);dialog.close();officeSelection=null;workspaceView='office';officeExpanded=false;persist();render();}return;
  }
  if(action==='life-contract-preview'){
    const c=CONTRACTS.find(c=>c.id===id);if(!c||game.stage!=='result')return;
    showDialog(contractPreview(game,c));return;
  }
  if(action==='life-next'){
    clearSceneFeedback(game);
    const error=nextProject(game,id);if(error)toast(error);else{dialog.close();stopAuto();resetOfficeWorld();officeMoving=false;officeSelection=null;mini=null;try{localStorage.removeItem(MINI);}catch{}persist();render();}return;
  }
  if(action==='candidate'){candidate=id;render();}
  if(action==='hire'){const error=hire(game,id);if(error)toast(error);else{officeSelection=game.team.includes(id)?id:null;if(officeSelection){const free=game.seats.indexOf(null);if(free>=0)seatAgent(game,id,free);}persist();render();if(officeSelection){toast(`${agentById(id).name} идёт за компьютер ${game.seats.indexOf(id)+1}.`);sound.speakCharacter(id,'intro');}}}
  if(action==='plan'){if(!officeMoving&&beginPlan(game)){officeSelection=null;persist();render();}}
  if(action==='recommend'){recommend(game);persist();render();toast('Предложил исполнителей. Проверь: один разработчик не может делать код и экран одновременно.');}
  if(action==='back-hire'){game.stage='hire';persist();render();}
  if(action==='work'){if(!officeMoving&&beginWork(game)){officeSelection=null;persist();render();}}
  if(action==='tick')advance();
  if(action==='support'){if(dialog.open)dialog.close();const error=supportTask(game,id);if(error)toast(error);else{game.clockFraction=0;persist();render();toast('Разобрались вместе: навык для этой задачи +15. Потрачен 1 час.');sound.speakCharacter(game.support.agentId,'support');}}
  if(action==='auto'){game.autoPlay=!game.autoPlay;persist();render();}
  if(action==='study-decision'){const error=studyDecision(game);if(error){toast(error);return;}persist();shownEvent=null;render();return;}
  if(action==='decision'){completeDecision(id);return;}
  if(action==='office-select'){selectEmployee(id);return;}
  if(action==='office-walk')officeWalk(WAITING[game.team.indexOf(officeSelection)%WAITING.length]);
  if(action==='office-cancel'){clearEmployeeSelection();return;}
  if(action==='office-desk')officeDeskAction(Number(id));
  if(action==='office-camera')officeCamera(id);
  if(action==='inspect-agent')inspect(id);
  if(action==='watch-agent'){selectEmployee(id);officeCamera('focus');}
  if(action==='restart')resetDialog();
  if(action==='debrief')debrief();
  if(action==='play-mini')openMini();
  if(action==='tile')moveMini(Number(el.dataset.x)-mini.x,Number(el.dataset.y)-mini.y);
  if(action==='move'){const d={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]}[el.dataset.dir];moveMini(...d);}
  if(action==='fresh-mini'){mini=freshOrbit(game);miniEffect={};miniMessage='Новый полёт: оборудование восстановлено по решениям команды.';saveMini();renderMini();dialog.querySelector('.tile.ship')?.focus({preventScroll:true});return;}
  if(action==='reload-mini'){openMini(true);dialog.querySelector('.tile.ship')?.focus({preventScroll:true});}
  if(action==='brief')showDialog(`<div class="eyebrow">ЗАКАЗ · ${esc(contractFor(game).client)}</div><h2 id="dialog-title">${esc(contractFor(game).name)}</h2><p>${esc(contractFor(game).text)}</p><ul class="debrief-list"><li>Бюджет на команду и резерв: <b>${money(game.initialBudget)}</b>.</li><li>Срок: <b>${game.deadline} игровых часов</b>.</li><li>Команда: три разработчика на ваш выбор.</li><li>Согласуйте новые функции и ограничения до показа.</li></ul><p>Твоя работа как тимлида — разобрать задачу с командой, помочь с трудностями и проверить код перед показом.</p><button class="primary full" data-action="close-dialog">За работу</button>`);
  if(action==='menu'){showDialog(`<div class="eyebrow">СТУДИЯ НА ПАУЗЕ</div><h2 id="dialog-title">До релиза</h2><p>${savingAvailable?'Прогресс автоматически сохранён в этом браузере.':'Сохранение недоступно. Не закрывайте вкладку до конца сессии.'}</p><details class="menu-graphics"><summary>Графика и производительность</summary>${graphicsSettingsHTML()}</details><div class="menu-buttons"><button class="primary full" data-action="close-dialog">Продолжить игру</button><button class="secondary full" data-action="life-office">Касса и улучшения</button><button class="secondary full" data-action="guide-open">Ника · подсказки и голос</button><button class="secondary full" data-action="brief">Задание заказчика</button><button class="secondary full" data-action="about">Как играть</button><button class="secondary full" data-action="home">На главный экран</button></div>`);}
  if(action==='home'){dialog.close();persist();game=null;render();}
});
let demoArrival = false;
if (DEMO) {
  demoArrival = !saved; game = saved ? structuredClone(saved) : createDemoGame();
  difficulty = game.difficulty; officeSelection = null; persist();
}
render();

function showStudioTeam() {
  showDialog(`<h2 id="dialog-title">Команда студии · ${game.team.length}/${studioCapacity(game)}</h2><p>Выбери коллегу — камера найдёт его, а действия появятся рядом.</p><div class="studio-team-picker">${game.team.map(id=>`<button class="secondary" data-action="watch-agent" data-id="${id}">${agentById(id).name}<small>${condition(game,id).label} · энергия ${Math.round(game.life.members[id].energy)}</small></button>`).join('')}</div><button class="secondary" data-action="seating">Рассадка по компьютерам</button>`);
}
function officeObject(id) {
  if(id==='clock'){document.querySelector('[data-action=scene-time]')?.click();return;}
  if(id==='arcade'){if(game.stage==='result')openMini();else toast('Игровой автомат включится после релиза. Сначала заверши заказ.');return;}
  if(id==='coffee'){if(officeSelection){showDialog(memberPanel(game,officeSelection));}else showStudioTeam();return;}
  showDialog(officePanel(game));
}
