import { studioCapacity } from './studio-progression.js';
import { AGENTS } from '../data.js';
import { activeTasks } from '../engine.js?v=shift-ux-20261024-v2';
import { condition } from './studio-life.js?v=shift-ux-20261024-v2';
import { characterLine, characterMoment } from './character-dialogue.js';
import { CHARACTER_VOICES } from './character-voice-manifest.js';

const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const workLines = {
  brief:'Разложим пожелания по полочкам. Тогда и делать будет проще.',
  design:'Собираю экран. Хочу, чтобы всё читалось с первого взгляда.',
  code:'Сейчас оживим механику. И проверим, куда летит корабль.',
  qa:'Попробую сломать сборку, пока этого не сделали игроки.',
  release:'Собираю всё вместе. Скоро можно будет играть!',
};

export function teamMemberState(game, id) {
  const agent = AGENTS.find(a => a.id === id);
  if (!agent || !game.team.includes(id)) return null;
  const current = condition(game,id), member = game.life.members[id];
  const task = game.stage === 'work' ? activeTasks(game).find(t => game.assignments[t.id] === id) : null;
  const tone = member.energy<=25&&member.stress>=65 ? 'urgent' : member.energy<35||member.stress>=65||member.morale<35 ? 'low' : member.morale>=80 ? 'bright' : 'calm';
  let activity = game.stage==='plan' ? 'Готовится к смене' : 'На месте';
  let line = agent.quote;
  if (member.restTrip?.phase==='queued') { activity='Ждёт кресло'; line='Как освободится кресло — возьму паузу. Пока продолжу.'; }
  else if (member.restTrip?.phase==='outbound') { activity='Идёт отдыхать'; line='Небольшая пауза — и вернусь со свежей головой.'; }
  else if (member.restTrip?.phase==='returning') { activity='Возвращается'; line='Уже лучше. Возвращаюсь к задаче.'; }
  else if (member.breaks) { activity='На перерыве'; line='Пару минут тишины. Сейчас восстановлю силы.'; }
  else if (game.stage==='result') { activity='Релиз готов'; line='Мы выпустили игру! Давайте проверим её сами.'; }
  else if (game.stage==='event') { activity='Обсуждает решение'; line='Давайте сначала договоримся, что сейчас важнее для проекта.'; }
  else if (!game.seats.includes(id)) { activity=game.officeTargets?.[id]?'На прогулке':'Ждёт у входа'; line=game.officeTargets?.[id]?'Разомнусь и вернусь.':'Какой компьютер займём?'; }
  else if (task) { activity=task.verb; line=workLines[task.id]; }
  else if (game.stage==='work') { activity='Ждёт свой этап'; line='Жду результат коллег. Потом подключусь к своему этапу.'; }
  if (!member.restTrip && !member.breaks && !['event','result'].includes(game.stage)) {
    if (tone==='urgent') line='Сил почти не осталось. Нужны отдых и помощь с задачей.';
    else if (member.energy<35) line='Нужна короткая пауза. Потом смогу продолжить.';
    else if (member.stress>=65) line='Сложно продвигаться дальше. Разберём задачу вместе?';
    else if (member.morale<35) line='Не всё получается. Давайте обсудим, как идти дальше.';
  }
  const voice = characterMoment(game,id);
  if (voice) line = characterLine(id,voice);
  return {agent, mood:current.label, tone, activity, line, voice, energy:Math.round(member.energy), morale:Math.round(member.morale), stress:Math.round(member.stress), progress:task?Math.round(game.progress[task.id]):null};
}

function face(tone) {
  const mouth = tone==='urgent'||tone==='low' ? 'M7 15q5-5 10 0' : tone==='bright' ? 'M7 12q5 8 10 0Z' : 'M8 14q4 4 8 0';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 8h.01M16 8h.01" stroke-width="3" stroke-linecap="round"/><path d="${mouth}"/></svg>`;
}

export function renderTeamMemberPreview(game,id,activity) {
  const s=teamMemberState(game,id);if(!s)return '';
  const a=s.agent;
  return `<section class="mobile-team-card" data-tone="${s.tone}">
    <header class="mobile-team-person"><span class="mobile-team-portrait" style="--px:${a.index%3*50}%;--py:${Math.floor(a.index/3)*100}%" aria-hidden="true"></span><div><span class="eyebrow">${esc(a.role)}</span><h2 id="dialog-title">${esc(a.name)}</h2><p>${esc(s.mood)}</p></div></header>
    <p class="mobile-team-activity">${esc(activity||s.activity)}</p><blockquote>«${esc(s.line)}»</blockquote>
    ${CHARACTER_VOICES[`${a.id}-${s.voice}`]?`<button class="secondary full" data-action="character-voice" data-id="${a.id}" data-kind="${s.voice}" aria-label="Прослушать реплику: ${a.name}">Послушать реплику</button>`:''}
    <dl class="mobile-team-vitals">${[['Энергия',s.energy],['Настроение',s.morale],['Напряжение',s.stress]].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}<small>/100</small></dd></div>`).join('')}</dl>
    <button class="primary full" data-action="life-member" data-id="${a.id}">Отдых и забота ↗</button>
    <button class="secondary full" data-action="watch-agent" data-id="${a.id}">Найти в офисе ↗</button>
  </section>`;
}

export function renderTeamHUD(game, selected) {
  const states = game.team.map(id => teamMemberState(game,id));
  const focused = states.find(s => s.agent.id===selected) || states[0];
  return `<aside class="team-hud" data-count="${states.length}" data-open="${!!selected}" aria-label="Команда студии">
    <header class="team-hud-heading"><span>Команда</span><b>${states.length}<span>/${studioCapacity(game)}</span></b></header>
    <div class="team-hud-members">${Array.from({length:studioCapacity(game)},(_,i)=>{
      const s=states[i];
      if(!s)return `<div class="team-hud-vacant"><span aria-hidden="true">＋</span><small>Ждёт коллегу</small></div>`;
      const a=s.agent, active=a.id===focused.agent.id;
      return `<button class="team-hud-person ${active?'is-current':''}" data-character-speaker="${a.id}" data-action="team-focus" data-id="${a.id}" data-tone="${s.tone}" aria-pressed="${active}" aria-label="${esc(a.name)}. ${esc(s.mood)}. Показать реплику" aria-describedby="team-activity-${a.id}">
        <span class="team-portrait-ring" style="--morale:${s.morale}%"><span class="team-portrait" style="--px:${a.index%3*50}%;--py:${Math.floor(a.index/3)*100}%"></span><span class="team-mood-face">${face(s.tone)}</span></span>
        <b>${a.name}</b><span class="team-mood-label">${esc(s.mood)}</span><span class="team-activity" id="team-activity-${a.id}" data-team-activity="${a.id}" data-base-activity="${esc(s.activity)}${s.progress===null?'':` · ${s.progress}%`}">${esc(s.activity)}${s.progress===null?'':` · ${s.progress}%`}</span>
      </button>`;
    }).join('')}</div>
    ${focused?`<section class="team-thought" data-tone="${focused.tone}" aria-label="Реплика: ${focused.agent.name}">
      <div class="team-thought-who"><span>${focused.agent.name}</span>${CHARACTER_VOICES[`${focused.agent.id}-${focused.voice}`]?`<button class="team-voice" data-action="character-voice" data-id="${focused.agent.id}" data-kind="${focused.voice}" aria-label="Прослушать реплику: ${focused.agent.name}">Слушать</button>`:'<span aria-hidden="true">···</span>'}<button class="team-thought-close" data-action="team-dismiss" aria-label="Закрыть реплику">×</button></div><p>«${esc(focused.line)}»</p>
      <div class="team-vitals"><span>Энергия <b>${focused.energy}</b><i style="--value:${focused.energy}%"></i></span><span>Настроение <b>${focused.morale}</b><i style="--value:${focused.morale}%"></i></span></div>
      <button data-action="life-member" data-id="${focused.agent.id}" class="team-care">Состояние и забота ↗</button>
    </section>`:`<p class="team-hud-invite">Здесь появятся твои коллеги — с настроением и своими задачами.</p>`}
  </aside>`;
}
