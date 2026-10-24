import { missionFor, patrolAt, missionReady, MISSIONS } from './orbit-missions.js';
// The playable release and its checkpoint must use the same team decisions.
export const rocks = new Set(MISSIONS.festival.rocks);
export const batteriesFor = game => missionFor(game).batteries;
export const canSaveOrbit = game => game.checkpoint && !game.criticalBug;
export const orbitFeatures = (game, design) => ({
  decorated: game.choices.scope !== 'swap' && design >= 70,
  edgeGuard: game.choices.review === 'review-pair',
  saveMode: game.criticalBug ? 'broken' : game.checkpoint ? 'working' : 'removed',
});
export const outsideOrbit = (x, y, game) => x < 0 || x >= missionFor(game || {}).width || y < 0 || y >= missionFor(game || {}).height;
export const releaseKey = game => JSON.stringify([
  game.life?.seed, game.life?.completed, game.life?.contract,
  game.choices.scope, game.choices.review, game.choices.bug,
  Boolean(game.shield), Boolean(game.wallBug), Boolean(game.checkpoint), Boolean(game.criticalBug), game.designPenalty,
  ...(missionFor(game).id === 'festival' ? [] : ['mission-v3']),
]);
export function freshOrbit(game) {
  return { version: 3, release: releaseKey(game), x: 0, y: 0, collected: [], shield: Boolean(game.shield), won: false, moves: 0, turns: 0, scanned: [], gates: 0, relay: false };
}
export function restoreOrbit(game, saved) {
  const fresh = freshOrbit(game), mission = missionFor(game);
  if (saved?.version === 2 && mission.id === 'festival') saved = { ...saved, version:3, turns:saved.moves, scanned:[], gates:0, relay:false };
  if (!canSaveOrbit(game) || !saved || saved.version !== 3 || saved.release !== fresh.release
    || !Number.isInteger(saved.x) || !Number.isInteger(saved.y) || outsideOrbit(saved.x,saved.y,game)
    || !Array.isArray(saved.collected) || new Set(saved.collected).size !== saved.collected.length
    || !saved.collected.every(key => mission.batteries.includes(key))
    || !Array.isArray(saved.scanned) || new Set(saved.scanned).size !== saved.scanned.length || !saved.scanned.every(key=>mission.scans.includes(key))
    || !Number.isInteger(saved.gates) || saved.gates<0 || saved.gates>mission.gates.length || typeof saved.relay!=='boolean'
    || typeof saved.shield !== 'boolean' || (!game.shield && saved.shield)
    || typeof saved.won !== 'boolean' || (saved.won && (saved.x+','+saved.y!==mission.finish || !missionReady(mission,saved)))
    || !Number.isSafeInteger(saved.moves) || saved.moves < 0 || !Number.isSafeInteger(saved.turns) || saved.turns<0 || saved.turns>saved.moves) return fresh;
  return { ...fresh, x:saved.x, y:saved.y, collected:[...saved.collected], shield:saved.shield, won:saved.won, moves:saved.moves, turns:saved.turns, scanned:[...saved.scanned], gates:saved.gates, relay:saved.relay };
}
export function moveOrbit(game, flight, dx, dy) { return stepOrbit(game, flight, dx, dy).message; }
export function recordOrbitResult(game,flight){
  if(!flight?.won||flight.release!==releaseKey(game)||!missionReady(missionFor(game),flight))return false;
  const id=missionFor(game).id,previous=game.orbitRecords?.[id];
  if(previous!==undefined&&previous<=flight.moves)return false;
  (game.orbitRecords??={})[id]=flight.moves;return true;
}
export function stepOrbit(game, flight, dx, dy) {
  if (!flight || flight.won || !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx)+Math.abs(dy)!==1) return { kind:'idle', message:'' };
  const x=flight.x+dx,y=flight.y+dy,key=x+','+y,mission=missionFor(game);
  if(outsideOrbit(x,y,game)) return { kind:'edge',cell:flight.x+','+flight.y,message:game.choices.review==='review-pair'
    ? 'Защита границы остановила корабль. Этот случай команда проверила вместе.' : 'Здесь край карты. Выбери другое направление.' };
  if(mission.barriers.includes(key)&&!flight.relay) return {kind:'barrier',cell:key,message:'Ионный барьер закрыт. Сначала включите ретранслятор R: щит его не отключает.'};
  let effect={kind:'move',cell:key,message:''};
  if(mission.rocks.includes(key)){
    if(game.wallBug)effect={kind:'phase',cell:key,message:'Ошибка движения: корабль прошёл сквозь астероид. Проверка кода была пропущена.'};
    else if(!flight.shield)return {kind:'blocked',cell:key,message:'Астероид преградил путь. Найди обходной маршрут.'};
    else{flight.shield=false;effect={kind:'shield-hit',cell:key,message:'Щит поглотил удар! Заряд израсходован — следующие астероиды нужно обходить.'};}
  }
  return advanceFlight(game,flight,x,y,effect);
}
function advanceFlight(game,flight,x,y,effect){
  const mission=missionFor(game),key=x+','+y;
  flight.turns++;flight.moves++;
  if(patrolAt(mission,flight.turns)===key){
    if(flight.shield){flight.shield=false;effect={kind:'shield-hit',cell:key,message:'Щит поглотил столкновение с патрулём. Заряд израсходован.'};}
    else{flight.moves+=3;return {kind:'patrol-hit',cell:key,message:'Патруль перехватил корабль! Остались на прежней клетке, +3 штрафных хода. Жди или выбирай обход.'};}
  }
  flight.x=x;flight.y=y;
  const notices=effect.message?[effect.message]:[];
  if(mission.batteries.includes(key)&&!flight.collected.includes(key)){
    flight.collected.push(key);effect.kind='collect';notices.push('Батареи на борту: '+flight.collected.length+' / '+mission.batteries.length+'.');
  }
  if(mission.relay===key&&!flight.relay){flight.relay=true;effect.kind='relay';notices.push('Ретранслятор включён. Ионный барьер погас — путь во вторую часть туманности открыт.');}
  if(mission.scans.includes(key)&&!flight.scanned.includes(key))notices.push('Неизученная аномалия. Нажми «Сканировать», чтобы сохранить данные.');
  const gate=mission.gates.indexOf(key);
  if(gate===flight.gates&&gate>=0){flight.gates++;effect.kind='gate';notices.push('Ворота '+flight.gates+' / '+mission.gates.length+' пройдены.');}
  else if(gate>flight.gates)notices.push('Сначала пройди ворота '+(flight.gates+1)+'. Порядок важен!');
  if(key===mission.finish){flight.won=missionReady(mission,flight);effect.kind='dock';notices.push(flight.won?'Миссия выполнена! Все задачи приняты станцией.':'Станция ждёт: выполни все цели миссии, отмеченные над картой.');}
  effect.message=notices.join(' ');return effect;
}
export function actOrbit(game,flight,action){
  if(!flight||flight.won)return {kind:'idle',message:''};
  const mission=missionFor(game),key=flight.x+','+flight.y;
  if(action==='wait'&&mission.patrol.length)return advanceFlight(game,flight,flight.x,flight.y,{kind:'wait',cell:key,message:'Пропустили ход. Патруль переместился — проверь следующий шаг.'});
  if(action==='scan'&&mission.scans.includes(key)&&!flight.scanned.includes(key)){
    flight.scanned.push(key);flight.turns++;flight.moves++;
    return {kind:'scan',cell:key,message:'Аномалия изучена: '+flight.scanned.length+' / '+mission.scans.length+'. Данные на борту.'};
  }
  return {kind:'idle',message:''};
}
