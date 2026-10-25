import { employeeOverview } from './employee-selection.js';
import { memberPortrait, memberMeters } from './studio-visuals.js';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderEmployeeCard(game,id,{compact=false}={}) {
  const s=employeeOverview(game,id);if(!s)return '';
  return `<section class="actor-actions employee-card" id="employee-card" data-actor="${id}" data-tone="${s.tone}" aria-labelledby="employee-name">
    <header>${memberPortrait(s.agent)}<div><small>${esc(s.agent.role)}</small><h2 id="employee-name" tabindex="-1">${esc(s.agent.name)}</h2></div><button data-action="office-cancel" aria-label="Закрыть карточку ${esc(s.agent.name)}">×</button></header>
    <div class="employee-card-body"><div class="employee-current"><span class="eyebrow">СЕЙЧАС</span><strong data-employee-activity="${id}" data-base-activity="${esc(s.activity)}">${esc(s.activity)}</strong>${s.task?`<span>Готовность задачи <b>${s.task.progress}%</b></span><progress max="100" value="${s.task.progress}" aria-label="Готовность задачи: ${esc(s.task.name)}">${s.task.progress}%</progress>`:''}</div><details class="employee-context" ${compact?'':'open'}><summary>Энергия ${s.energy} · настроение ${s.morale}<span aria-hidden="true">⌄</span></summary><p class="employee-explanation">${esc(s.explanation)}</p>${memberMeters(game.life.members[id])}</details></div>
    <footer class="employee-card-footer">${s.actions.length?`<div class="employee-help" aria-label="Как помочь ${esc(s.agent.name)}">${s.actions.map((a,i)=>`<button class="${i===0?'primary':'secondary'}" data-action="${a.action}" data-id="${a.id}">${esc(a.label)}</button>`).join('')}</div>`:''}<div class="employee-more"><button data-action="office-camera" data-id="focus" aria-label="Приблизить выбранного сотрудника">⌕ Ближе</button><button data-action="life-member" data-id="${id}">Забота и история ↗</button></div></footer>
  </section>`;
}
