import { renderEmployeeCard } from './assets/employee-card.js';
import { renderSceneFeedback } from './assets/scene-feedback.js';
import { shiftTime } from './assets/shift-clock.js';
import { memberPortrait, memberMeters, visualIcon } from './assets/studio-visuals.js';
import { employeeEvent } from './assets/employee-event.js';
import { studioCapacity } from './assets/studio-progression.js';
import { condition } from './assets/studio-life.js';
import { TASKS } from './data.js';
import { activeTasks, agentById, totalProgress } from './engine.js?v=shift-ux-20261024-v2';

const allStations = [{ x: 300, y: 356 }, { x: 666, y: 356 }, { x: 482, y: 478 }, {x:800,y:470}, {x:790,y:590}];
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const faces = [
  { hair: '#c66c32', skin: '#efb99a', style: 'long' },
  { hair: '#352d29', skin: '#e9b597', style: 'short' },
  { hair: '#343132', skin: '#bf8e72', style: 'short' },
  { hair: '#b94e42', skin: '#f0b79b', style: 'bun' },
  { hair: '#c8ab78', skin: '#e9b79b', style: 'long' },
  { hair: '#3d3534', skin: '#e3ac84', style: 'short' },
];

function character(agent, working) {
  const { hair, skin, style } = faces[agent.index];
  return `<g class="office-person ${working ? 'is-typing' : ''}" style="--person:${agent.color}">
    <ellipse cx="-34" cy="48" rx="33" ry="13" fill="#111e25" opacity=".3"/>
    <path d="M-46 34v18m21-20v14" stroke="#263849" stroke-width="13" stroke-linecap="round"/>
    <path d="m-49 52 14 5m11-10 12 4" stroke="#11202b" stroke-width="9" stroke-linecap="round"/>
    ${style === 'long' ? `<path d="M-62-36Q-69-5-59 16h39l-1-48Z" fill="${hair}"/>` : ''}
    <path d="M-59 9q17-13 35-1l12 31q-22 14-50-1Z" fill="${agent.color}"/>
    <path d="M-57 9q-9 15-4 25l21 7" fill="none" stroke="${agent.color}" stroke-width="13" stroke-linecap="round"/>
    <g class="typing-arm"><path d="m-25 10 14 12L9 2" fill="none" stroke="${agent.color}" stroke-width="11" stroke-linecap="round"/><path d="m7 4 10-6" stroke="${skin}" stroke-width="8" stroke-linecap="round"/></g>
    <path d="m-42-2 1 13" stroke="${skin}" stroke-width="12"/>
    <g class="person-head"><ellipse cx="-43" cy="-23" rx="20" ry="24" fill="${skin}"/>
    <path d="M-64-23q-4-31 22-29 29 1 21 31l-9-17q-9 11-27 7Z" fill="${hair}"/>
    ${style === 'bun' ? `<circle cx="-61" cy="-45" r="12" fill="${hair}"/>` : ''}
    <path d="m-28-20 3 1" stroke="#3c3435" stroke-width="3" stroke-linecap="round"/>
    ${agent.id === 'echo' || agent.id === 'nord' ? '<path d="m-40-22 16 4m-15-4v10h10v-8" fill="none" stroke="#24343d" stroke-width="2.5"/>' : ''}
    <path d="m-31-9 5-1" stroke="#ab7567" stroke-width="2" stroke-linecap="round"/></g>
    <path d="M-65 15q-21-4-19 15l4 20q19 12 36 4l-2-24Z" fill="#334652" stroke="#4c6370" stroke-width="2"/>
    <path d="m-62 54 1 18m-17 0 17-4 16 5" fill="none" stroke="#223440" stroke-width="5" stroke-linecap="round"/>
  </g>`;
}

function monitorContent(task, progress) {
  if (!task) return '<path d="m7-63 15 7-15 8-15-8Z" fill="#79b1b7" opacity=".5"/><path d="M-4-43 30-26" stroke="#7aa1a7" stroke-width="2" opacity=".4"/>';
  if (task.id === 'design') return '<path d="m-2-71 36 18v23L-2-48Z" fill="#47665e"/><path d="m3-65 26 13v8L3-57Z" fill="#7ed9b8"/><path d="m3-51 12 6v6L3-45Z" fill="#ffc56f"/><path d="m20-43 10 5" stroke="#bad4c7" stroke-width="2"/>';
  if (task.id === 'qa') return '<path d="m-3-65 4 5 6-4m-10 12 4 5 6-4m-10 12 4 5 6-4" stroke="#7ed9b8" stroke-width="2.5" fill="none"/><path d="m13-54 20 10M13-41l20 10M13-28l13 6" stroke="#93acb5" stroke-width="2"/>';
  if (task.id === 'code' || task.id === 'release') return '<path d="m-4-69 26 13m-21-3 34 17m-30-7 16 8m-22-2 34 17m-30-7 23 12" fill="none" stroke="#7ed9b8" stroke-width="2.5"/><path class="code-cursor" d="m24-19 8 4" stroke="#ffbc55" stroke-width="3"/>';
  return `<path d="m-4-68 34 17M-4-59l26 13M-4-50l31 15" stroke="#b3c4bd" stroke-width="2"/><path d="m-4-37 ${Math.max(2, progress * .34)} ${Math.max(1, progress * .17)}" stroke="#ffbc55" stroke-width="4"/>`;
}

function workstation(index, agent, task, game) {
  const { x, y } = allStations[index], working = game.stage === 'work' && !!task;
  const progress = task ? game.progress[task.id] : 0;
  return `<g transform="translate(${x} ${y})" class="station-art ${working ? 'station-running' : ''}">
    <ellipse cx="6" cy="44" rx="113" ry="40" fill="#0b1920" opacity=".22"/>
    <path d="M-84-24v64m97-29v65m92-120v63" stroke="#283944" stroke-width="9"/>
    <path d="m-95-28 103 51 112-56L17-84Z" fill="#654d3d"/>
    <path d="m-95-36 103 51 112-56L17-92Z" fill="#ad8057" stroke="#d0a77a" stroke-width="1.5"/>
    <path d="m8 15 112-56v8L8 23Z" fill="#75563f"/>
    <path d="m-16-63 70 35v-49l-70-35Z" fill="#1a2a35" stroke="#536877" stroke-width="3"/>
    <path d="m-10-65 58 29v-37l-58-29Z" fill="${task ? '#203e46' : '#263c44'}" class="monitor-glass"/>
    <g transform="translate(0 -28)">${monitorContent(task, progress)}</g>
    <path d="m19-44 1 11m-10 0 22 11 14-7" fill="none" stroke="#344c59" stroke-width="5"/>
    <path d="m-21-18 41 20 19-10-40-20Z" fill="#d5c4a4"/><path d="m-13-17 31 16m-22-20 31 16" stroke="#786d60" stroke-width="1.5"/>
    <path d="m62-27 10 5 7-4-10-5Z" fill="#d5c4a4"/>
    <path d="m-70-41 11 5 9-4v-13l-20-1Z" fill="#efe0c3"/><path d="m-50-49q15 2 7 11l-7-2" stroke="#efe0c3" stroke-width="3" fill="none"/>
    ${agent ? character(agent, working) : '<path d="M-65 15q-21-4-19 15l4 20q19 12 36 4l-2-24Z" fill="#334652" stroke="#4c6370" stroke-width="2"/><path d="m-62 54 1 18m-17 0 17-4 16 5" stroke="#223440" stroke-width="5" fill="none"/>'}
    ${working ? '<g class="work-spark"><circle cx="66" cy="-97" r="3" fill="#7ed9b8"/><circle cx="78" cy="-91" r="3" fill="#7ed9b8"/><circle cx="90" cy="-85" r="3" fill="#7ed9b8"/></g>' : ''}
  </g>`;
}

function room() {
  return `<defs>
    <linearGradient id="wall-left" x2="1" y2="1"><stop stop-color="#38505c"/><stop offset="1" stop-color="#223942"/></linearGradient>
    <linearGradient id="wall-right" x2="0" y2="1"><stop stop-color="#40535a"/><stop offset="1" stop-color="#263d45"/></linearGradient>
    <linearGradient id="night-window" x2="0" y2="1"><stop stop-color="#42566b"/><stop offset="1" stop-color="#a9796d"/></linearGradient>
    <pattern id="wood-floor" width="84" height="42" patternUnits="userSpaceOnUse" patternTransform="matrix(1 .5 -1 .5 0 0)"><rect width="84" height="42" fill="#807461"/><path d="M0 0h84v42H0Z" fill="none" stroke="#675e51" stroke-width="2"/><path d="M7 10h31m8 18h28" stroke="#b29b78" opacity=".18" stroke-width="2"/></pattern>
  </defs>
  <ellipse cx="500" cy="460" rx="418" ry="163" fill="#07151c" opacity=".5"/>
  <path d="M80 403 500 193 920 403v17L500 630 80 420Z" fill="#3c433e"/>
  <path d="M80 403 500 193 920 403 500 613Z" fill="url(#wood-floor)" stroke="#a18c6d" stroke-width="2"/>
  <path d="M80 403V205L500-5v198Z" fill="url(#wall-left)"/>
  <path d="M500-5 920 205v198L500 193Z" fill="url(#wall-right)"/>
  <path d="M80 205 500-5 920 205" fill="none" stroke="#73817a" stroke-width="8"/>
  <path d="M86 395 500 188l414 207" fill="none" stroke="#172e39" stroke-width="10"/>
  <g><path d="m139 211 234-117v126L139 337Z" fill="#162c3a" stroke="#7f8f8d" stroke-width="6"/>
    <path d="m148 216 216-108v106L148 322Z" fill="url(#night-window)"/>
    <path d="m151 290 26-13v-36l21-10v19l24-12v-44l24-12v36l27-14v-28l28-14v42l27-14v-30l32-16v63L151 317Z" fill="#293e50"/>
    <path d="m179 259 7-4m40-32 7-4m20-6 7-4m42-21 7-4m26 2 7-4m-133 80 7-4m57-29 7-4m30-15 7-4" stroke="#e4bc7d" stroke-width="4"/>
    <path d="m253 162v107m-109-2 217-109" stroke="#7f8f8d" stroke-width="5"/>
  </g>
  <path d="m555 95 129 65v91l-129-64Z" fill="#c5c1a3" stroke="#223944" stroke-width="7"/>
  <path d="m572 120 93 47m-93-33 51 26" stroke="#6c7f79" stroke-width="3"/>
  <path d="m571 153 18 9v16l-18-9Zm25 12 18 9v16l-18-9Zm25 12 18 9v16l-18-9Z" fill="#bb8351"/>
  <path d="m596 144 18 9v16l-18-9Z" fill="#789b88"/>
  <path d="m768 230 89 44v51l-89-44Z" fill="#725840"/><path d="m763 227 91 45 15-8-91-45Z" fill="#b19165"/>
  <path d="m778 249v-21l9 4v21m8 3v-28l10 5v28m8 3v-22l12 6v22" stroke="#bad1bf" stroke-width="6"/>
  <path d="m780 283 58 29m-29-12v17" stroke="#493e34" stroke-width="3"/>
  <path d="m698 352 91 46-146 73-91-45Z" fill="#414f4c" opacity=".55"/>
  <g transform="translate(826 369)"><ellipse cy="25" rx="23" ry="11" fill="#172b32" opacity=".4"/><path d="m-18-2 5 31q14 10 28-3l4-28Z" fill="#bb8b61"/><ellipse rx="19" ry="8" fill="#5d5547"/><path d="M0 0v-71m0 33q-46-3-29-37Q-3-70 0-38m0 14q36-6 30-36Q3-56 0-24m0-24q27-15 15-39Q-8-73 0-48m0 35q-31 1-31-21Q-5-36 0-13" fill="#6d9272" stroke="#355e50" stroke-width="3"/></g>
  <g transform="translate(178 402)"><path d="m-28 7 43 22 36-18V-8L8-30-28-12Z" fill="#243b43"/><path d="m-28-12 43 22 36-18-43-22Z" fill="#b78c60"/><path d="M-10-12v-31l26 13v31" fill="#d8bc84"/><path d="m-20-45 37-19 31 35-37 19Z" fill="#e8ca8a"/><ellipse cx="20" cy="7" rx="47" ry="23" fill="#ffc56f" opacity=".07"/></g>
  <path d="m374 565 126 63 103-52" fill="none" stroke="#1f3139" stroke-width="4"/>
  <text x="700" y="151" transform="rotate(26.5 700 151)" fill="#cad2c4" font-size="16" font-family="Bahnschrift, sans-serif" letter-spacing="3">ДО РЕЛИЗА.</text>`;
}

export function renderOffice(game, selectedId, moving = false, lifeHTML = '', expanded = false) {
  const incident=employeeEvent(game);
  const stations = allStations.slice(0,studioCapacity(game));
  const editable = ['hire', 'plan'].includes(game.stage), active = activeTasks(game);
  const idleStatus = id => ({queued:'Ждёт свободное кресло',outbound:'Идёт на перерыв',resting:'Отдыхает в кресле',returning:'Возвращается за компьютер'})[game.life?.members[id]?.restTrip?.phase] || (TASKS.some(t => game.assignments[t.id] === id && game.progress[t.id] < 100) ? 'Ждёт этап' : 'Задачи готовы');
  const selected = agentById(selectedId), unseated = game.team.filter(id => !game.seats.includes(id));
  const seated = game.seats.filter(Boolean).length;
  const hint = editable ? selected ? `${selected.name}: выбери компьютер${game.seats.includes(selectedId) ? ' для пересадки' : ''} или свободный участок пола.` : seated === game.team.length ? moving ? 'Команда занимает места. Пока можно осмотреть офис.' : game.stage === 'plan' ? 'Распредели задачи. Код и экран можно делать параллельно.' : 'Все на местах. Пора распределить задачи.' : game.team.length ? 'Выбери персонажа в команде, затем компьютер.' : 'Найми первого разработчика — он придёт в студию.' : game.stage === 'event' ? 'Команда ждёт твоего решения. Время на паузе.' : game.stage === 'result' ? 'Релиз готов. Пора сыграть в «Орбиту»!' : 'Нажми на сотрудника, чтобы узнать, как идут дела.';
  return `<section class="studio-scene playable-office" aria-label="Офис команды">
    <header class="office-heading"><div><span class="eyebrow">СТУДИЯ 01 · ВЕЧЕРНЯЯ СМЕНА</span><h2>Офис твоей команды</h2></div><div class="office-header-actions"><button class="office-brief" data-action="brief">Задание ↗</button><button class="office-expand" data-action="office-expand" aria-label="${expanded?'Вернуть интерфейс':'Развернуть офис'}" title="${expanded?'Вернуть интерфейс · Esc':'Развернуть офис'}">${expanded?'✕':'⛶'}</button></div></header>
    <nav class="studio-dock" aria-label="Управление студией">${incident?`<button class="incident-dock" data-action="event-open">! ${incident.name} · событие</button>`:''}${!incident?`<button data-action="studio-project">${({hire:'Найм команды',plan:'Задачи',work:'Смена',event:'Событие',result:'Релиз'})[game.stage]}</button>`:''}<button data-action="studio-team">Команда · ${game.team.length}</button><button data-action="life-office">Улучшения · ${game.life.cash.toLocaleString('ru-RU')} ₽</button>${game.stage==='work'?`<button data-action="auto" aria-pressed="${!!game.autoPlay}">${game.autoPlay?'Пауза авто':'Авто'}</button><button data-action="tick">+1 час</button>`:''}</nav><div class="office-room" data-office-state="loading"><div id="office-webgl"></div><button class="scene-time" data-action="scene-time" aria-label="Часы и дедлайн студии"><strong data-clock="now">${shiftTime(game).now}</strong><span>До показа <b data-clock="remaining">${shiftTime(game).remaining}</b></span></button>${renderOfficeCamera(game)}<span class="office-render-status" role="status">Загружаем 3D-студию…</span><span class="office-movement" aria-live="polite"></span><svg class="room-art" viewBox="0 -20 1000 700" aria-hidden="true">${room()}${stations.map((_, i) => workstation(i, agentById(game.seats[i]), active.find(t => game.assignments[t.id] === game.seats[i]), game)).join('')}</svg>
      ${renderSceneFeedback(game)}${incident?eventSignal(game,incident):''}${selected&&game.team.includes(selectedId)&&selectedId!==incident?.id?renderEmployeeCard(game,selected.id):''}<div class="object-hotspots"><button data-action="office-object" data-id="office" data-hotspot="office" aria-label="Зона отдыха и улучшения">♧</button>${game.life.upgrades.includes('coffee')?'<button data-action="office-object" data-id="coffee" data-hotspot="coffee" aria-label="Кофейная станция">☕</button>':''}<button data-action="office-object" data-id="arcade" data-hotspot="arcade" aria-label="Играть в Орбиту">▶</button></div><div class="desk-interactions">${stations.map(({ x, y }, i) => {
        const agent = agentById(game.seats[i]), task = active.find(t => game.assignments[t.id] === agent?.id);
        const status = game.stage === 'result' ? 'Релиз готов!' : game.stage === 'event' ? 'Обсуждение' : game.stage === 'work' ? task ? task.verb : idleStatus(agent?.id) : 'Готов к смене';
        return `<button class="office-desk ${agent ? 'occupied' : 'empty'} ${agent?.id === selectedId && editable ? 'selected' : ''} ${editable && selected ? 'can-seat' : ''} ${task && game.stage === 'work' ? 'running' : ''}" style="--desk-x:${x / 10}%;--desk-y:${(y + 20) / 7}%;--person:${agent?.color || '#ffbc55'}" data-action="office-desk" data-id="${i}" aria-label="Компьютер ${i + 1}: ${agent ? agent.name + ', ' + status : 'свободен'}${editable && selected ? ', посадить ' + selected.name : ''}"><span class="desk-counter">${i+1}</span><span class="desk-tag">${agent ? `<b>${agent.name}</b><small>${status}</small>${task && game.stage === 'work' ? `<span class="desk-progress"><i style="width:${game.progress[task.id]}%"></i></span>` : ''}` : `<b><span>＋</span> Компьютер ${i + 1}</b><small>${selected && editable ? 'Посадить сюда' : 'Свободное место'}</small>`}</span></button>`;
      }).join('')}</div>
    </div>
    <div class="office-guidance" role="status"><span class="office-step">${editable ? `${seated}/${game.team.length}` : `${totalProgress(game)}%`}</span><p>${escape(hint)}</p>${editable && selected ? '<button class="text-button" data-action="office-cancel">Отмена</button>' : '<span class="office-live-dot"></span>'}</div>
    <div class="office-arrivals ${!unseated.length&&!selected?'vacant-row':''}">${selected&&editable?'<button class="office-walk-button" data-action="office-walk">Пройтись к входу ↗</button><button class="office-mobile-cancel" data-action="office-cancel">Снять выбор</button>':''}${unseated.length ? `<span>В СТУДИИ</span>${unseated.map(id => { const a = agentById(id); return `<button class="arrival ${selectedId === id ? 'selected' : ''}" data-action="office-select" data-id="${id}" aria-pressed="${selectedId === id}" style="--person:${a.color}"><span class="arrival-head">${a.name[0]}</span>${a.name}<small>Выбрать →</small></button>`; }).join('')}` : ''}</div>
    ${lifeHTML}
    <div class="office-roster"><div class="office-roster-title"><span>ТВОЯ КОМАНДА</span><b>${game.team.length} / ${studioCapacity(game)}</b></div><div class="office-roster-slots">${Array.from({ length: studioCapacity(game) }, (_, i) => {
      const a = agentById(game.team[i]);
      if (!a) return `<div class="office-roster-empty"><span>＋</span><small>Место для разработчика</small></div>`;
      const task = active.find(t => game.assignments[t.id] === a.id);
      return `<button class="office-member ${selectedId === a.id && editable ? 'selected' : ''}" data-action="${editable ? 'office-select' : 'inspect-agent'}" data-id="${a.id}" aria-pressed="${editable && selectedId === a.id}" style="--person:${a.color}"><span class="roster-portrait" style="--px:${a.index % 3 * 50}%;--py:${Math.floor(a.index / 3) * 100}%"></span><span><b>${a.name}</b><small>${!game.seats.includes(a.id) ? game.officeTargets[a.id]?'На прогулке':'Ждёт у входа' : game.stage === 'work' ? task ? task.verb : idleStatus(a.id) : a.short}</small></span></button>`;
    }).join('')}</div></div>
  </section>`;
}


function eventSignal(game,event) {
  const seat=allStations[game.seats.indexOf(event.id)]||{x:800,y:400};
  return `<button class="employee-event-signal" data-action="event-open" data-event-actor="${event.id}" style="left:${seat.x/10}%;top:${(seat.y-90)/7}%" aria-label="${event.name}: ${event.title}. Открыть событие"><span aria-hidden="true">!</span><b>${event.name}<small>Нужно решение</small></b></button><span class="sr-only" role="status">${event.name}: ${event.title}. Смена ждёт. Нажми на сотрудника или красный сигнал, чтобы открыть событие.</span>`;
}

function renderOfficeCamera(game) {
  const buttons=[['out','−','Дальше','Отдалить офис'],['in','+','Ближе','Приблизить офис'],['focus','⌕','Коллега','Приблизить выбранного персонажа'],['left','↶','Влево','Повернуть офис влево'],['right','↷','Вправо','Повернуть офис вправо'],['reset','⌂','Весь офис','Вернуть исходный вид офиса']];
  return `<details class="scene-camera"><summary><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 8V4h4m8 0h4v4M4 16v4h4m8 0h4v-4"/><circle cx="12" cy="12" r="4"/></svg>Камера</summary><div class="office-camera-controls" aria-label="Камера офиса">${buttons.map(([id,glyph,label,aria])=>`<button data-action="office-camera" data-id="${id}" aria-label="${aria}" title="${aria}" ${id==='focus'&&!game.team.length?'disabled':''}><span>${glyph}</span><small>${label}</small></button>`).join('')}<details class="camera-advanced"><summary>Свободный полёт</summary><div>${[['flight','WASD','Свободный полёт камерой'],['forward','↑','Камера вперёд'],['back','↓','Камера назад'],['up','↟','Камера выше'],['down','↡','Камера ниже']].map(([id,glyph,label])=>`<button data-action="office-camera" data-id="${id}" aria-label="${label}">${glyph}</button>`).join('')}</div></details></div></details>`;
}
