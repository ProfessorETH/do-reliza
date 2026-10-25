import { SKILLS } from '../data.js';

export function candidatePicker(agents, selected, team, {portrait, icon, money, esc}) {
  return `<div class="candidate-grid" aria-label="Кандидаты">${agents.map(a => `<button
    class="candidate ${selected===a.id?'selected':''} ${team.includes(a.id)?'hired':''}"
    style="--agent:${a.color}" data-action="candidate" data-id="${a.id}"
    aria-label="${esc(a.name)}, ${esc(a.role)}, ${money(a.cost)}" aria-pressed="${selected===a.id}">
    <span class="candidate-art">${portrait(a,'candidate-portrait')}
      ${team.includes(a.id)?`<span class="hired-check">${icon('check',11)}</span>`:''}</span>
    <span class="candidate-caption"><b>${esc(a.name)}</b><small>${esc(a.short)}</small><span class="candidate-price">${money(a.cost)}</span></span>
  </button>`).join('')}</div>`;
}

export function agentDossier(a, {hired, canHire, teamCount, budget, capacity=3}, {portrait, icon, money, esc, radar}) {
  const action = hired ? 'Убрать из команды' : teamCount===capacity ? 'Все места заняты' : budget<a.cost ? `Не хватает ${money(a.cost-budget)}` : `Нанять за ${money(a.cost)}`;
  return `<section class="agent-detail agent-dossier" style="--agent:${a.color}" aria-label="Досье: ${esc(a.name)}">
    <header class="dossier-header"><div class="dossier-portrait">${portrait(a,'dossier-face')}</div>
      <div class="dossier-identity"><span class="dossier-role">${esc(a.role)}</span><h2>${esc(a.name)}</h2></div>
      <button class="profile-more" data-action="candidate-info" data-id="${a.id}" aria-label="Подробнее о персонаже ${esc(a.name)}">Профиль ↗</button></header>
    <div class="dossier-skills">
      <dl class="skill-list">${SKILLS.map(s=>`<div><dt>${s.label}</dt><dd><b>${a.stats[s.key]}</b><span class="skill-track" aria-hidden="true"><i style="width:${a.stats[s.key]}%"></i></span></dd></div>`).join('')}</dl></div>
    <div class="dossier-note"><h3>${esc(a.trait)}</h3><p>${esc(a.strength)}</p></div>
    <div class="agent-caution">${icon('info',16)}<span>${esc(a.weakness)}</span></div>
    <div class="dossier-offer"><strong>${hired?'В команде':money(a.cost)}<small>${hired?'При удалении оплата вернётся':`за весь проект · останется ${money(Math.max(0,budget-a.cost))}`}</small></strong>
      <button class="${hired?'secondary hired-button':'primary'}" data-action="hire" data-id="${a.id}" ${canHire?'':'disabled'}>${action}</button></div>
  </section>`;
}
