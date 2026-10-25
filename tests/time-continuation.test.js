import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoGame} from '../demo.js';
import {sceneAction,sceneDock,sceneHeader} from '../assets/play-shell.js';
import {renderOrbit} from '../assets/orbit-view.js';
import {freshOrbit,recordOrbitResult} from '../assets/orbit.js';
import {missionRoute} from './orbit-route.js';
const icon=()=>'',money=n=>String(n),logo=()=>'';
test('time controls move to the lower dock and keep the current auto state',()=>{
 const s=createDemoGame();s.stage='work';s.autoPlay=true;
 const header=sceneHeader(s,{icon,money,logo,time:{now:'09:00',remaining:'16 ч',end:'01:00'},soundEnabled:false,status:'Авто'});
 assert.doesNotMatch(header,/data-action="auto"/);
 const dock=sceneDock(s,{icon,money});assert.match(dock,/data-action="auto"[^>]*aria-pressed="true"/);assert.match(dock,/data-action="tick"/);
});
test('winning offers the next order inside the game and on the release dock',()=>{
 const s=createDemoGame();s.stage='result';s.life.settled=true;s.life.completed=1;s.choices={scope:'focus',review:'review-pair',bug:'fix'};
 const f=freshOrbit(s);missionRoute(s,f);assert.equal(f.won,true);
 const html=renderOrbit(s,f,{icon,design:90,stored:true});assert.match(html,/data-action="life-contracts">Следующий заказ/);
 assert.equal(recordOrbitResult(s,f),true);assert.equal(sceneAction(s).action,'life-contracts');
 assert.match(sceneDock(s,{icon,money}),/data-action="play-mini"/);
});
