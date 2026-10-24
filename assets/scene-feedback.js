import { AGENTS } from '../data.js';
import { UPGRADE_COPY, visualIcon } from './studio-visuals.js';

export const FEEDBACK_MS=7000;
// Keep simultaneous reactions readable while preserving the nearest free spot to each head.
export function placeFeedback(items,width,height) {
  const placed=[];
  for(const item of items){
    const clampX=x=>Math.max(8,Math.min(width-item.width-8,x));
    const clampY=y=>Math.max(54,Math.min(height-item.height-65,y));
    const wanted={x:clampX(item.x-item.width/2),y:clampY(item.y-item.height)};
    const xs=items.length>1&&width<item.width*2.5&&width>=item.width*2+22?[8,width-item.width-8]:[wanted.x,8,width-item.width-8];
    const ys=[wanted.y,54,...placed.flatMap(r=>[r.y-item.height-8,r.y+r.height+8])];
    const candidates=xs.flatMap(x=>ys.map(y=>({x:clampX(x),y:clampY(y),width:item.width,height:item.height})));
    const free=candidates.filter(r=>placed.every(p=>r.x+r.width+6<=p.x||p.x+p.width+6<=r.x||r.y+r.height+6<=p.y||p.y+p.height+6<=r.y));
    const best=(free.length?free:candidates).sort((a,b)=>(a.x-wanted.x)**2+(a.y-wanted.y)**2-((b.x-wanted.x)**2+(b.y-wanted.y)**2))[0];
    placed.push(best);
  }
  return placed;
}
const pending=new WeakMap();
let serial=0;
export const captureMembers=s=>Object.fromEntries(s.team.map(id=>[id,{...s.life.members[id]}]));
export function memberChanges(s,before,include=[]) {
  return s.team.flatMap(id=>{
    const old=before[id],now=s.life.members[id];if(!old)return [];
    const changes=['morale','energy','stress'].map(key=>({key,value:now[key],delta:Math.round((now[key]-old[key])*10)/10}));
    return (include.includes(id)||changes.some(c=>c.delta!==0))?[{id,changes}]:[];
  });
}
function enqueue(s,items) {
  const now=performance.now(),list=(pending.get(s)||[]).filter(item=>item.expires>now);
  const entries=items.map(item=>({...item,key:++serial,created:now,expires:now+FEEDBACK_MS}));
  pending.set(s,[...list,...entries]);
  for(const entry of entries)setTimeout(()=>document.querySelector(`[data-scene-feedback="${entry.key}"]`)?.remove(),FEEDBACK_MS+30);
}
export function queueMemberFeedback(s,before,include=[]) { enqueue(s,memberChanges(s,before,include).map(change=>({...change,type:'person'}))); }
export function queuePurchaseFeedback(s,id,cost) { enqueue(s,[{type:'purchase',id,cost,cash:s.life.cash}]); }
export function clearSceneFeedback(s) { pending.delete(s); }
const signed=n=>n>0?'+'+n:String(n).replace('-','−');
const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
export function renderSceneFeedback(s) {
  const now=performance.now();
  return (pending.get(s)||[]).filter(item=>item.expires>now).map(item=>{
    const attr=`data-scene-feedback="${item.key}" style="--feedback-age:-${now-item.created}ms"`;
    if(item.type==='purchase')return `<div class="scene-feedback purchase-feedback" ${attr} data-feedback-upgrade="${item.id}" role="status"><span class="feedback-installed">✓ Установлено</span><b>${UPGRADE_COPY[item.id][0]}</b><strong>−${money(item.cost)}</strong><small>В кассе ${money(item.cash)}</small></div>`;
    const a=AGENTS.find(a=>a.id===item.id),seat=s.seats.indexOf(item.id);
    return `<div class="scene-feedback person-feedback" ${attr} data-feedback-actor="${item.id}" data-feedback-seat="${seat}" role="status"><svg class="feedback-link" aria-hidden="true"><line/></svg><b>${a.name}</b>${item.changes.filter(c=>c.delta!==0||['energy','morale'].includes(c.key)).map(c=>{
      const kind={morale:'mood',energy:'energy',stress:'stress'}[c.key],label={morale:'Настроение',energy:'Энергия',stress:'Напряжение'}[c.key];
      const tone=c.delta===0?'neutral':(c.key==='stress'?c.delta<0:c.delta>0)?'good':'bad';
      return `<span data-tone="${tone}">${visualIcon(kind,16)}${label}<strong>${c.delta?signed(c.delta):Math.round(c.value)+' → '+Math.round(c.value)}</strong></span>`;
    }).join('')}</div>`;
  }).join('');
}

export function positionFallbackFeedback(room) {
  if(!room.isConnected)return;
  const bounds=room.getBoundingClientRect(),elements=[...room.querySelectorAll('[data-scene-feedback]')];
  const seats=[[.3,.43],[.67,.43],[.48,.6],[.8,.6],[.76,.76]];
  const items=elements.map(el=>{const p=seats[Number(el.dataset.feedbackSeat)]||[.5,.45];return {x:bounds.width*p[0],y:bounds.height*p[1],width:el.offsetWidth,height:el.offsetHeight};});
  placeFeedback(items,bounds.width,bounds.height).forEach((p,i)=>{elements[i].style.left=(p.x+p.width/2)+'px';elements[i].style.top=(p.y+p.height)+'px';});
}
