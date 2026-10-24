import { SKILLS } from '../data.js';

export function candidatePicker(agents, selected, team, {portrait, icon, money, esc}) {
  return `<div class="candidate-grid" aria-label="Кандидаты">${agents.map(a => `<button
    class="candidate ${selected===a.id?'selected':''} ${team.includes(a.id)?'hired':''}"
    style="--agent:${a.color}" data-action="candidate" data-id="${a.id}"
    aria-label="${esc(a.name)}, ${esc(a.role)}, ${money(a.cost)}" aria-pressed="${selected===a.id}">
    <span class="candidate-art">${portrait(a,'candidate-portrait')}<span class="candidate-price">${money(a.cost)}</span>
      ${team.includes(a.id)?`<span class="hired-check">${icon('check',13)}</span>`:''}</span>
    <span class="candidate-caption"><b>${esc(a.name)}</b><small>${esc(a.short)}</small></span>
  </button>`).join('')}</div>`;
}

export function agentDossier(a, {hired, canHire, teamCount, budget}, {portrait, icon, money, esc, radar}) {
  const action = hired ? `${icon('check',18)} В команде · убрать` : teamCount===3 ? 'Команда укомплектована' : budget<a.cost ? 'Не хватает бюджета' : `В команду ${icon('arrow',18)}`;
  return `<section class="agent-detail agent-dossier" style="--agent:${a.color}" aria-label="Досье: ${esc(a.name)}">
    <header class="dossier-header"><div class="dossier-portrait">${portrait(a,'dossier-face')}</div>
      <div class="dossier-identity"><span class="dossier-role">${esc(a.role)}</span><h2>${esc(a.name)}</h2><p>«${esc(a.quote)}»</p></div>
      <span class="dossier-serial">${String(a.index+1).padStart(2,'0')}</span></header>
    <div class="dossier-skills"><div class="radar-wrap" aria-hidden="true">${radar(a)}</div>
      <dl class="skill-list">${SKILLS.map(s=>`<div><dt>${s.label}</dt><dd><b>${a.stats[s.key]}</b><span class="skill-track" aria-hidden="true"><i style="width:${a.stats[s.key]}%"></i></span></dd></div>`).join('')}</dl></div>
    <div class="dossier-note"><h3>${esc(a.trait)}</h3><p>${esc(a.desc)}</p></div>
    <div class="agent-caution">${icon('info',16)}<span>${esc(a.weakness)}</span></div>
    <div class="dossier-offer"><strong>${money(a.cost)}<small>за весь проект</small></strong>
      <button class="${hired?'secondary hired-button':'primary'}" data-action="hire" data-id="${a.id}" ${canHire?'':'disabled'}>${action}</button></div>
  </section>`;
}
