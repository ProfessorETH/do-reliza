import { AGENTS } from '../data.js';
import { ALL_DESKS } from '../office-layout.js';

export function speechPlacement({x,y,width,height,roomWidth,roomHeight}) {
  const left=Math.max(8,Math.min(Math.max(8,roomWidth-width-8),x-width/2));
  const top=Math.max(12,Math.min(Math.max(12,roomHeight-height-76),y-height-26));
  return {left,top,anchorX:Math.max(12,Math.min(width-12,x-left)),offscreen:x<0||x>roomWidth||y<0||y>roomHeight};
}
export function placeSpeechElement(el,point,room) {
  const bounds=room.getBoundingClientRect(),footer=document.querySelector('.scene-footer')?.getBoundingClientRect();
  const usableHeight=footer?Math.min(room.clientHeight,footer.top-bounds.top+68):room.clientHeight;
  el.querySelector('p').style.maxHeight=`${Math.max(55,usableHeight-180)}px`;
  const width=el.offsetWidth,height=el.offsetHeight,maxTop=Math.max(12,usableHeight-height-76);
  const p=speechPlacement({x:point.x,y:point.y,width,height,roomWidth:room.clientWidth,roomHeight:usableHeight});
  const overlaps=r=>p.left<r.right-bounds.left&&p.left+width>r.left-bounds.left&&p.top<r.bottom-bounds.top&&p.top+height>r.top-bounds.top;
  const camera=room.querySelector('.scene-camera>summary')?.getBoundingClientRect();
  if(camera&&overlaps(camera)){
    const left=camera.left-bounds.left-width-8,right=camera.right-bounds.left+8;
    if(left>=8)p.left=left;
    else if(right+width<=room.clientWidth-8)p.left=right;
    else p.top=Math.max(12,Math.min(maxTop,camera.bottom-bounds.top+8));
  }
  const hud=document.querySelector('.team-hud')?.getBoundingClientRect();
  if(hud&&hud.width&&overlaps(hud))p.top=Math.max(12,Math.min(maxTop,hud.bottom-bounds.top+8));
  p.anchorX=Math.max(12,Math.min(width-12,point.x-p.left));
  el.style.left=`${p.left}px`;el.style.top=`${p.top}px`;el.style.setProperty('--speech-tail',`${p.anchorX}px`);
  el.dataset.offscreen=String(Boolean(point.offscreen||p.offscreen));
}
export function positionFallbackSpeech(room,s) {
  const el=room.querySelector('[data-office-speech]');if(!el)return;
  const index=s.seats.indexOf(el.dataset.officeSpeech),d=ALL_DESKS[index];
  const seats=[[.3,.43],[.67,.43],[.48,.6],[.8,.6],[.76,.76]];
  const p=d?(seats[index]||[.5,.4]):[.5,.4];placeSpeechElement(el,{x:room.clientWidth*p[0],y:room.clientHeight*p[1]},room);
}
export function createOfficeSpeech() {
  let element=null,key='';
  function update(speech,game){
    const room=document.querySelector('.office-room');
    // Dialogues already show their own captions; keep the office overlay quiet behind them.
    if(!speech||!room||document.hidden||document.querySelector('dialog[open]')){element?.remove();element=null;key='';return;}
    if(!element?.isConnected){
      element=document.createElement('aside');element.className='office-speech';element.setAttribute('role','status');element.setAttribute('aria-live','polite');
      element.innerHTML='<div class="office-speech-heading"><button class="office-speech-who" data-action="office-talk-focus"></button><span class="office-speech-bars" aria-hidden="true"><i></i><i></i><i></i></span><button class="office-speech-skip" data-action="office-talk-skip" aria-label="Пропустить разговор">×</button></div><p></p><small class="office-speech-edge">За краем кадра · нажми на имя</small>';
      room.append(element);key='';
    }
    if(key!==speech.key){
      key=speech.key;element.dataset.officeSpeech=speech.id;
      const a=AGENTS.find(a=>a.id===speech.id),b=AGENTS.find(a=>a.id===speech.listenerId),button=element.querySelector('.office-speech-who');
      button.textContent=b?`${a.name} → ${b.name}`:a.name;button.dataset.id=speech.id;button.setAttribute('aria-label',`Показать ${a.name} в офисе`);
      element.querySelector('p').textContent=speech.text;element.querySelector('.office-speech-skip').hidden=!speech.ambient;
    }
    element.dataset.audible=String(speech.audible);element.style.setProperty('--voice-level',String(speech.level));
    // Also supplies a stable position before GLB loading and in the lightweight renderer.
    if(room.dataset.officeState!=='ready')positionFallbackSpeech(room,game);
  }
  return {update};
}
