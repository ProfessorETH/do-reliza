import { TASKS } from '../data.js';
import { nightShift } from './night-shift.js';
import { activeTasks } from '../engine.js';
import { condition } from './studio-life.js';
import { teamMemberState } from './team-hud.js';

// Read-only presentation of the selected colleague; actions still go through the engine.
export function employeeOverview(game,id) {
  const state=teamMemberState(game,id);if(!state)return null;
  const member=game.life.members[id],active=activeTasks(game).find(t=>game.assignments[t.id]===id);
  const away=!!(member.restTrip&&member.restTrip.phase!=='queued'||member.coffeeTrip&&member.coffeeTrip.phase!=='queued');
  const task=game.stage==='work'&&!away?active:null;
  const next=TASKS.find(t=>game.assignments[t.id]===id&&game.progress[t.id]<100);
  const waiting=next?.depends.filter(dep=>game.progress[dep]<100).map(dep=>TASKS.find(t=>t.id===dep).name)||[];
  const done=TASKS.filter(t=>game.assignments[t.id]===id&&game.progress[t.id]>=100).length;
  let explanation=condition(game,id).reason;
  if(task&&['calm','bright'].includes(state.tone))explanation=task.description;
  if(away)explanation=member.coffeeTrip?'Энергия восстановится после напитка. Затем сотрудник вернётся к задаче.':'Работа продолжится после отдыха и возвращения за компьютер.';
  else if(game.stage==='work'&&!task)explanation=waiting.length?'Сначала нужны результаты: '+waiting.map(name=>'«'+name+'»').join(', ')+'.':next?'Пока занят другой задачей.':'Все назначенные задачи завершены.';
  const actions=[];
  const action=(name,key,label)=>actions.push({action:name,id:key,label});
  if(game.stage==='work'&&nightShift(game).active)action('night-preview','','Команду домой до 09:00');
  if(game.stage==='work') {
    if(!task&&!away&&state.tone!=='urgent'&&member.energy>=35)action('studio-project','','Показать задачи');
    if(task&&!game.support)action('support',task.id,'Разобрать вместе · 1 ч');
    if(!member.restTrip&&!member.breaks&&!member.coffeeTrip)action('life-break',id,'На перерыв · 1 ч');
    if(!member.restTrip&&!member.coffeeTrip&&!member.coffee&&game.life.upgrades.includes('coffee'))action('life-coffee',id,'За напитком · +15 энергии');
  }
  if(['work','result'].includes(game.stage)&&done>member.praised)action('life-praise',id,'Отметить результат · +10 настроения');
  if(member.energy<35)actions.sort((a,b)=>Number(b.action==='life-break')-Number(a.action==='life-break'));
  else if(done>member.praised)actions.sort((a,b)=>Number(b.action==='life-praise')-Number(a.action==='life-praise'));
  if(!actions.length&&['hire','plan'].includes(game.stage))action('seating','', 'Рабочие места');
  if(game.stage==='event')action('event-open','','Обсудить решение');
  return {...state,task:task?{id:task.id,name:task.name,progress:Math.round(game.progress[task.id])}:null,explanation,actions:actions.slice(0,2)};
}
