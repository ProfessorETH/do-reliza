import { AGENTS } from '../data.js';
import { characterLine } from './character-dialogue.js';
import { selectOfficeConversation } from './office-chatter.js';
import { reserveOfficeConversation, rememberOfficeLine } from './office-chatter-state.js';

export function createOfficeConversations({sound,getGame,isBlocked,persist,draw=()=>{},now=()=>Date.now()}) {
  let enabled=true,flow=null,signature='',grace=now()+14000,caption=null;
  try{enabled=localStorage.getItem('before-release-office-talk-v1')!=='off';}catch{/* Session setting. */}
  function finish(){
    if(!flow)return;
    const old=flow;flow=null;caption=null;
    if(old.game===getGame()&&old.game.officeChatter){old.game.officeChatter.nextAt=Math.max(old.game.officeChatter.nextAt,now()+28000);persist();}
  }
  function stop(){sound.stopAmbient();finish();}
  function started(line){
    if(!flow)return;
    const s=flow.game;
    if(!flow.reserved){reserveOfficeConversation(s,flow.choice,now());flow.reserved=true;}
    // onplaying can fire again after buffering: log each turn only once.
    const key=`${line.id}-${line.kind}`;
    if(flow.started.has(key))return;
    flow.started.add(key);rememberOfficeLine(s,line);
    const name=id=>AGENTS.find(a=>a.id===id).name;
    s.log.push(`В офисе · ${name(line.id)} → ${name(line.listenerId)}: «${characterLine(line.id,line.kind)}»`);persist();
  }
  function nextText(){
    const line=flow?.choice.lines[flow.index++];
    if(!line){finish();return;}
    started(line);const text=characterLine(line.id,line.kind);
    caption={...line,key:`${line.id}-${line.kind}`,text,level:0,audible:false,ambient:true};
    flow.until=now()+Math.max(4500,Math.min(9500,text.length*65));
  }
  function speech(){
    const voiced=sound.characterSpeech;
    if(voiced){const line=flow?.choice.lines.find(l=>l.id===voiced.id&&`${l.id}-${l.kind}`===voiced.key);return {...voiced,listenerId:line?.listenerId};}
    return caption;
  }
  function tick(){
    const s=getGame(),time=now(),identity=s?`${s.life.seed}:${s.life.completed}:${s.life.contract}`:'';
    if(identity!==signature){stop();signature=identity;grace=time+14000;}
    const blocked=!s||s.stage!=='work'||isBlocked()||!enabled;
    if(blocked){if(flow)stop();grace=time+5000;}
    else if(flow){
      const present=flow.choice.lines.every(l=>s.team.includes(l.id)&&!s.life.members[l.id].restTrip&&!s.life.members[l.id].coffeeTrip&&!s.life.members[l.id].breaks);
      if(!present||flow.game!==s||flow.text&&sound.busy)stop();
      else if(flow.text&&time>=flow.until)nextText();
    }else if(sound.busy){grace=time+4000;}
    else if(time>=grace){
      const choice=selectOfficeConversation(s,time);
      if(choice){
        const text=!sound.enabled||choice.lines.some(l=>!sound.hasCharacterVoice(l.id,l.kind));
        flow={game:s,choice,text,index:0,until:0,reserved:false,started:new Set()};
        if(text)nextText();
        else if(!sound.speakExchange(choice.lines,false,{ambient:true,onStart:started,onDone:finish})){flow=null;grace=time+2000;}
      }
    }
    draw(speech(),s);
  }
  return {tick,stop,skip:()=>{stop();grace=now()+35000;draw(speech(),getGame());},get speech(){return speech();},
    toggle(){enabled=!enabled;if(!enabled)stop();grace=now()+8000;try{localStorage.setItem('before-release-office-talk-v1',enabled?'on':'off');}catch{}return enabled;},
    get enabled(){return enabled;},get active(){return Boolean(flow);}};
}
