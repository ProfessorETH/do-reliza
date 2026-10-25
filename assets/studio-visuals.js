import { assetURL } from '../asset-url.js';
export function visualIcon(kind,size=24) {
  const paths={energy:'M13 2 4 14h7l-1 8 10-13h-7Z',mood:'M8 9h.01M16 9h.01M7 14q5 6 10 0',stress:'m4 17 5-10 5 7 6-10',rest:'M4 12V8q0-3 3-3h10q3 0 3 3v4M3 12h18v6H3zM5 18v3m14-3v3',coffee:'M4 6h12v9q0 5-6 5t-6-5ZM16 8h2a3 3 0 0 1 0 6h-2M7 2v2m6-2v2',info:'M12 10v7m0-11v1',focus:'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6',talk:'M3 4h18v13H9l-5 4v-4H3Z'};
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${['mood','info'].includes(kind)?'<circle cx="12" cy="12" r="10"/>':''}<path d="${paths[kind]||paths.info}"/></svg>`;
}
export function memberPortrait(a){return `<span class="compact-portrait" style="--px:${a.index%3*50}%;--py:${Math.floor(a.index/3)*100}%" aria-hidden="true"></span>`;}
export function memberMeters(m){return `<div class="visual-vitals">${[['energy','Энергия',m.energy],['mood','Настроение',m.morale],['stress','Напряжение',m.stress]].map(([kind,label,value])=>`<div class="vital ${kind}" data-low="${kind==='stress'?value>=65:value<35}" title="${label}: ${Math.round(value)} из 100">${visualIcon(kind)}<span>${label}<b>${Math.round(value)}</b><meter min="0" max="100" value="${value}" aria-label="${label}">${Math.round(value)}</meter></span></div>`).join('')}</div>`;}

export const UPGRADE_COPY={coffee:['Напитки для команды','+15 энергии · +5 настроения'],desk4:['Четвёртое место','Новое крыло · команда до 4'],desk5:['Пятое место','Ещё один коллега · команда до 5'],lounge:['Уютный отдых','Перерыв: +45 энергии вместо 30'],quiet:['Тихий офис','Напряжение от работы: +1 вместо +2'],computers:['Быстрые компьютеры','Код и сборка быстрее на 10%']};
export function upgradeArt(id,{eager=false}={}) {
  if(!UPGRADE_COPY[id])return '';
  return `<img class="upgrade-art model-poster" src="${assetURL('previews/upgrade-'+id+'.webp')}" alt="${UPGRADE_COPY[id][0]} — предмет из игрового офиса" width="720" height="480" loading="${eager?'eager':'lazy'}" decoding="async">`;
}
