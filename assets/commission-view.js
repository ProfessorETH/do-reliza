import { careerFee, contractTerms, contractLock, scorePay, isCareer } from './studio-career.js';
import { MISSIONS } from './orbit-missions.js';
import { AGENTS } from '../data.js';
import { missionReward } from './studio-progression.js';
import { upgradeArt, UPGRADE_COPY } from './studio-visuals.js';

export const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
export function missionArt(id) {
  const m=MISSIONS[id], cell=24, pad=12;
  const xy=key=>key.split(',').map(Number).map(n=>pad+n*cell+cell/2);
  const mark=(key,body)=>{const [x,y]=xy(key);return `<g transform="translate(${x} ${y})">${body}</g>`;};
  return `<figure class="mission-preview"><svg viewBox="0 0 ${m.width*cell+pad*2} ${m.height*cell+pad*2}" aria-hidden="true">${Array.from({length:m.width*m.height},(_,i)=>`<rect x="${pad+i%m.width*cell}" y="${pad+Math.floor(i/m.width)*cell}" width="22" height="22" rx="4" fill="#ffffff07"/>`).join('')}${m.rocks.map(k=>mark(k,'<path d="m-8-4 6-6 8 4 3 8-8 7-9-5Z" fill="#72858a"/>')).join('')}${m.barriers.map(k=>mark(k,'<path d="M0-10v20" stroke="#b29be6" stroke-width="5"/>')).join('')}${m.patrol.length?`<polyline points="${m.patrol.map(k=>xy(k).join(',')).join(' ')}" fill="none" stroke="#ed9f87" stroke-width="2" stroke-dasharray="3 3"/>`:''}${m.batteries.map(k=>mark(k,'<path d="m1-9-7 11h5l-1 7 8-12H1Z" fill="#f2ce83"/>')).join('')}${m.scans.map(k=>mark(k,'<circle r="8" fill="none" stroke="#91cadd" stroke-width="2"/><path d="M-4 0h8M0-4v8" stroke="#91cadd"/>')).join('')}${m.relay?mark(m.relay,'<path d="M0 8V-5m-6 0q6-9 12 0" fill="none" stroke="#b9d6a8" stroke-width="2"/>'):''}${m.gates.map((k,i)=>mark(k,`<circle r="10" fill="#d6ba7530" stroke="#f2ce83"/><text text-anchor="middle" y="4" fill="#f2ce83" font-size="12">${i+1}</text>`)).join('')}${mark('0,0','<path d="m0-9 7 16-7-3-7 3Z" fill="#e9e2c8"/>')}${mark(m.finish,'<rect x="-8" y="-8" width="16" height="16" rx="4" fill="#a8c89e"/><path d="m-4 0 3 3 5-6" fill="none" stroke="#233a3d" stroke-width="2"/>')}</svg><figcaption>${m.width} × ${m.height} · ${id==='festival'?'⚡ батареи → станция':id==='club'?'Антенна → сканирование → станция':'Ворота 1 → 2 → 3 · патруль'}</figcaption></figure>`;
}

export const MISSION_GOALS={festival:'Собрать 3 батареи и вернуться на станцию',club:'Включить антенну, открыть барьер и исследовать 2 аномалии',cup:'Пройти 3 ворот по порядку и обойти патруль'};

export function contractCosts(s,c) {
  const team=s.team.filter(id=>!s.life.departures.includes(id));
  const fees=team.reduce((n,id)=>n+careerFee(s,id,true),0);
  const terms=contractTerms(s,c),budget=terms.budget;
  const payroll=team.reduce((n,id)=>n+s.life.members[id].raises*1000,0), subsidy=Math.max(0,fees-budget);
  return {budget,fees,payroll,subsidy,cashAfter:s.life.cash-payroll-subsidy,reserve:Math.max(0,budget-fees),deadline:terms.deadline};
}

export function balanceFlow(before,cost) {
  return `<dl class="balance-flow"><div><dt>В кассе</dt><dd>${money(before)}</dd></div><div><dt>Спишется</dt><dd>${cost?'−':''}${money(cost)}</dd></div><div class="balance-after"><dt>Останется</dt><dd>${money(before-cost)}</dd></div></dl>`;
}

export function purchasePanel(s,u) {
  return `<div class="eyebrow">ПОКУПКА ДЛЯ ОФИСА</div><h2 id="dialog-title">${UPGRADE_COPY[u.id][0]}</h2><div class="purchase-art">${upgradeArt(u.id)}</div><p>${UPGRADE_COPY[u.id][1]}</p>${balanceFlow(s.life.cash,u.price)}<p class="money-caption">Оплата из кассы студии · резерв проекта ${money(s.budget)}</p><details class="life-history"><summary>Что изменится</summary><p>${u.text}</p></details><div class="dialog-actions"><button class="secondary" data-action="life-office">Назад</button><button class="primary" data-action="life-buy" data-id="${u.id}" ${s.life.cash<u.price?'disabled':''}>Купить за ${money(u.price)}</button></div>`;
}

export function contractPreview(s,c) {
  const cost=contractCosts(s,c),reward=missionReward(s,c.id),terms=contractTerms(s,c),lock=contractLock(s,c.id);
  return `<div class="eyebrow">${c.client}</div><h2 id="dialog-title">${c.name}</h2>${missionArt(c.id)}<p>${MISSION_GOALS[c.id]}</p><div class="commission-numbers"><span>Резерв после оплаты команды<b>${money(cost.reserve)}</b></span><span>Дедлайн<b>${cost.deadline} ч</b></span></div><h3>Старт следующего заказа</h3>${balanceFlow(s.life.cash,cost.payroll+cost.subsidy)}<p class="money-caption">Доплаты ${money(cost.payroll)} · поддержка состава ${money(cost.subsidy)}</p><div class="commission-rewards"><span>За успешный релиз <b>+${money(terms.reward)}</b><small>и ${scorePay(s)} ₽ за каждый балл${isCareer(s)?' · до расходов':''}</small></span><span>За прохождение миссии <b>+${money(reward.cash)}</b><small>В кассу студии после релиза</small></span></div><details class="life-history"><summary>Команда и условия</summary><p>Бюджет заказчика ${money(cost.budget)}. Оплата состава ${money(cost.fees)}. Команда: энергия +35, напряжение −20.</p><p>${c.text}</p>${s.life.departures.length?`<p>Уходят: ${s.life.departures.map(id=>AGENTS.find(a=>a.id===id).name).join(', ')}. Перед работой найми замену.</p>`:''}</details>${lock?`<p class="life-notice">${lock}</p>`:''}${cost.cashAfter<0?'<p class="life-notice">В кассе не хватает денег на старт. Проверь доплаты и состав команды.</p>':''}<div class="dialog-actions"><button class="secondary" data-action="life-contracts">Назад</button><button class="primary" data-action="life-next" data-id="${c.id}" ${lock?`<p class="life-notice">${lock}</p>`:''}${cost.cashAfter<0||lock?'disabled':''}>Принять заказ</button></div>`;
}
