import { shiftMinutes } from './shift-clock.js';
const palettes={
  night:{top:'#101d35',horizon:'#30425d',city:'#182b40',far:'#293b52',ground:'#162731',ambient:'#9cb7da',key:'#edc89b',ambientPower:.68,keyPower:1.25,moonPower:.85,lampPower:13,night:1},
  dawn:{top:'#6989ac',horizon:'#efc2a0',city:'#526775',far:'#7b8b98',ground:'#53666b',ambient:'#c5cddc',key:'#ffd4ab',ambientPower:1,keyPower:2.1,moonPower:.2,lampPower:7,night:.2},
  day:{top:'#508fbc',horizon:'#c6dfe2',city:'#526d7a',far:'#7993a3',ground:'#536c71',ambient:'#c4dfed',key:'#fff0cd',ambientPower:1.2,keyPower:2.8,moonPower:.12,lampPower:3.5,night:0},
  sunset:{top:'#526085',horizon:'#f2ac79',city:'#3b4a65',far:'#6a637e',ground:'#37474e',ambient:'#bdadcb',key:'#ffbd83',ambientPower:.9,keyPower:2.4,moonPower:.4,lampPower:10,night:.35},
  dusk:{top:'#233456',horizon:'#8c6c8b',city:'#24364e',far:'#3d4b68',ground:'#24363f',ambient:'#a5b3d4',key:'#efc197',ambientPower:.76,keyPower:1.6,moonPower:.7,lampPower:12,night:.8},
};
const stops=[[0,'night'],[5,'night'],[7,'dawn'],[10,'day'],[16,'day'],[18,'sunset'],[20,'dusk'],[22,'night'],[24,'night']];
const mix=(a,b,t)=>a+(b-a)*t;
function color(a,b,t){return '#'+[1,3,5].map(i=>Math.round(mix(parseInt(a.slice(i,i+2),16),parseInt(b.slice(i,i+2),16),t)).toString(16).padStart(2,'0')).join('');}
export function officeDaylight(game){
  const minute=shiftMinutes(game),hour=(minute%1440)/60;
  const index=stops.findIndex((v,i)=>i&&hour<v[0]),[start,a]=stops[index-1],[end,b]=stops[index];
  const raw=(hour-start)/(end-start),t=raw*raw*(3-2*raw),state={};
  for(const key of Object.keys(palettes.day)){const x=palettes[a][key],y=palettes[b][key];state[key]=typeof x==='string'?color(x,y,t):mix(x,y,t);}
  const phase=hour<6||hour>=22?'night':hour<11?'morning':hour<17?'day':hour<20?'evening':'night';
  return {...state,minute,hour,phase,label:({night:'Ночь',morning:'Утро',day:'День',evening:'Вечер'})[phase],sunX:.12+(hour-6)/14*.76,sunY:.73-Math.sin((hour-6)/14*Math.PI)*.52,moonX:.2+((hour<12?hour+24:hour)-18)/12*.6};
}

// One reusable canvas; skyline and lit windows remain stable across every day/save.
export function paintDaylightWindow(ctx,s){
  const w=ctx.canvas.width,h=ctx.canvas.height,sky=ctx.createLinearGradient(0,0,0,h);
  sky.addColorStop(0,s.top);sky.addColorStop(1,s.horizon);ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  ctx.globalAlpha=Math.max(0,1-s.night);ctx.fillStyle='#fff0c6';ctx.beginPath();ctx.arc(s.sunX*w,s.sunY*h,25,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=s.night;ctx.fillStyle='#d8e3ed';ctx.beginPath();ctx.arc(s.moonX*w,.24*h,20,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=s.top;ctx.beginPath();ctx.arc(s.moonX*w+8,.24*h-5,18,0,Math.PI*2);ctx.fill();
  for(let i=0;i<36;i++){ctx.globalAlpha=s.night*(.3+(i%4)*.15);ctx.fillStyle='#e8edf3';ctx.fillRect((i*173+43)%(w-20),15+(i*37)%(h*.48),i%5===0?2:1,2);}
  ctx.globalAlpha=1;
  for(let i=0;i<26;i++){
    const x=i*w/24-20,height=42+(i*67)%85,y=h-height;
    ctx.fillStyle=i%3===0?s.far:s.city;ctx.fillRect(x,y,w/30,height);
    ctx.fillStyle='#f5cc8b';ctx.globalAlpha=.08+.92*s.night;
    for(let row=0;row<7;row++)for(let col=0;col<3;col++)if((row*11+col+i)%4===0)ctx.fillRect(x+6+col*9,y+9+row*14,3,4);
    ctx.globalAlpha=1;
  }
}
