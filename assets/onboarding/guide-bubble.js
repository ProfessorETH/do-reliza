import { bubblePlacement, normalizeBubble, readBubblePosition } from './bubble-position.js';
import { assetURL } from '../../asset-url.js';

export function createGuideBubble({storageKey,onToggle}) {
  let preferred=readBubblePosition(null),visible=false,drag=null,suppressClick=false,frame=0;
  try { preferred=readBubblePosition(localStorage.getItem(storageKey)); } catch { /* Session-only positioning. */ }
  const bubble=document.createElement('button');
  bubble.type='button';bubble.className='nika-bubble';bubble.dataset.nikaBubble='';bubble.hidden=true;
  bubble.setAttribute('aria-controls','nika-guide');bubble.setAttribute('aria-describedby','nika-move-help');
  bubble.title='Ника: помощь. Перетащи значок; стрелки перемещают, Home возвращает.';
  bubble.innerHTML=`<span class="nika-bubble-avatar"><img src="${assetURL('onboarding/nika-avatar.webp')}" alt="" draggable="false"><i aria-hidden="true">?</i></span><span class="nika-bubble-label">Ника · помощь</span>`;
  const help=document.createElement('span');help.id='nika-move-help';help.className='sr-only';help.textContent='Значок можно перетаскивать. Стрелки перемещают его, Home возвращает. Enter открывает помощь.';
  document.body.append(bubble,help);
  const view=()=>{const style=getComputedStyle(bubble),width=document.documentElement.clientWidth;return {width,height:window.innerHeight,sizeX:bubble.offsetWidth||72,sizeY:bubble.offsetHeight||76,top:(document.querySelector('.scene-header')?.getBoundingClientRect().bottom||0)+12,bottom:document.querySelector('.scene-footer')?.getBoundingClientRect().top||innerHeight,gap:12,left:12+(parseFloat(style.getPropertyValue('--bubble-safe-left'))||0),right:width-12-(parseFloat(style.getPropertyValue('--bubble-safe-right'))||0)};};
  const shown=e=>e?.getClientRects().length&&!e.closest('[hidden],[inert]')&&getComputedStyle(e).visibility!=='hidden';
  function place() {
    if(!visible||drag)return;
    const bounds=view(),compact=matchMedia('(max-width:900px), (max-height:500px) and (pointer:coarse)').matches;
    const blockers=[...document.querySelectorAll('.control-panel,.team-hud,.scene-camera,.office-expand,.actor-actions')].filter(shown).map(e=>e.getBoundingClientRect());
    const guide=document.querySelector('.nika-guide:not(.nika-collapsed)');
    if(guide&&compact)blockers.push(guide.getBoundingClientRect());
    const p=bubblePlacement(preferred,bounds,blockers);
    bubble.style.left=p.x+'px';bubble.style.top=p.y+'px';
    if(guide&&!compact) {
      const r=guide.getBoundingClientRect(),left=p.x>bounds.width/2?p.x-r.width-12:p.x+bounds.sizeX+12;
      guide.style.left=Math.max(12,Math.min(left,bounds.width-r.width-12))+'px';
      guide.style.top=Math.max(bounds.top,Math.min(p.y,bounds.bottom-r.height-12))+'px';
    }
  }
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(place);};
  function save() {try{localStorage.setItem(storageKey,JSON.stringify(preferred));}catch{/* Session only. */}}
  bubble.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;const r=bubble.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};suppressClick=false;bubble.setPointerCapture(e.pointerId);
  });
  bubble.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>6)drag.moved=true;if(!drag.moved)return;
    const b=view();bubble.dataset.dragging='true';bubble.style.left=Math.max(b.left,Math.min(drag.left+dx,b.right-b.sizeX))+'px';bubble.style.top=Math.max(b.top,Math.min(drag.top+dy,b.bottom-b.sizeY-12))+'px';
  });
  const finish=e=>{
    if(!drag||e.pointerId!==drag.id)return;const moved=drag.moved;drag=null;delete bubble.dataset.dragging;
    if(moved){const r=bubble.getBoundingClientRect();preferred=normalizeBubble({x:r.left,y:r.top},view());save();suppressClick=true;e.preventDefault();}
    else if(e.type==='pointerup'&&e.pointerType!=='mouse'){suppressClick=true;e.preventDefault();onToggle();}
    schedule();
  };
  bubble.addEventListener('pointerup',finish);bubble.addEventListener('pointercancel',finish);bubble.addEventListener('lostpointercapture',e=>{if(drag)finish(e);});
  bubble.addEventListener('click',e=>{if(suppressClick&&e.detail>0){suppressClick=false;e.preventDefault();return;}suppressClick=false;onToggle();});
  bubble.addEventListener('keydown',e=>{
    const delta={ArrowLeft:[-32,0],ArrowRight:[32,0],ArrowUp:[0,-32],ArrowDown:[0,32]}[e.key];
    if(e.key==='Home'){e.preventDefault();preferred={x:1,y:1};save();schedule();}
    else if(delta){e.preventDefault();const r=bubble.getBoundingClientRect();preferred=normalizeBubble({x:r.left,y:r.top+delta[1]},view());if(delta[0])preferred.x=delta[0]<0?0:1;save();schedule();}
  });
  document.addEventListener('toggle',schedule,true);
  window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
  return {
    sync(show,expanded){visible=show;bubble.hidden=!show;bubble.setAttribute('aria-expanded',String(expanded));bubble.setAttribute('aria-label',`Ника — помощница. ${expanded?'Свернуть':'Открыть'} подсказку`);schedule();},
    attention(value){bubble.dataset.attention=String(value);},
    focus(){if(visible)bubble.focus({preventScroll:true});},
    reset(){preferred={x:1,y:1};save();schedule();},
  };
}
