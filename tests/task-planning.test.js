import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoGame} from '../demo.js';
import {assign,beginWork,recommend} from '../engine.js';
import {TASKS} from '../data.js';
import {initCareer} from '../assets/studio-career.js';
import {renderTaskPlanning} from '../assets/task-planning.js';
const portrait=a=>`<span class="portrait">${a.name}</span>`;
test('planning allows work only after all five real team assignments and seating',()=>{
  const s=createDemoGame();s.stage='plan';s.assignments={};
  let html=renderTaskPlanning(s,{portrait});
  assert.match(html,/Назначено 0 из 5/);assert.match(html,/data-action="work" disabled/);
  for(const t of TASKS)assert.equal(assign(s,t.id,s.team[0]),true);
  html=renderTaskPlanning(s,{portrait});assert.match(html,/Назначено 5 из 5/);assert.doesNotMatch(html,/data-action="work" disabled/);
  assert.match(html,/экран и код по очереди/);
  assert.match(renderTaskPlanning(s,{portrait,busy:true}),/data-action="work" disabled/);
  assert.equal(beginWork(structuredClone(s)),true);
  s.seats[0]=null;assert.match(renderTaskPlanning(s,{portrait}),/data-action="work" disabled/);
});
test('planning offers every teammate per task with correct state-aware skills and selection',()=>{
  const s=createDemoGame();s.stage='plan';s.assignments={};
  s.difficulty='bootstrap';initCareer(s);s.life.career.skills.iskra.code=47;
  assign(s,'code','iskra');
  const html=renderTaskPlanning(s,{portrait});
  assert.equal((html.match(/data-action="plan-assign"/g)||[]).length,TASKS.length*s.team.length);
  assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
  assert.match(html,/data-id="iskra" data-task="code" aria-pressed="true"/);
  assert.match(html,/Исполнитель: Написать механику/);
  assert.match(html,/Искра, Код: 47 из 100/);
  assert.match(html,/Предложить исполнителей/);
  assert.doesNotMatch(html,/<select/);
});
test('suggested plan uses trained career skills shown on the portraits',()=>{
  const s=createDemoGame();s.stage='plan';s.difficulty='bootstrap';initCareer(s);
  s.life.career.skills.mira.code=80;s.life.career.skills.iskra.code=20;
  recommend(s);assert.equal(s.assignments.code,'mira');assert.equal(s.assignments.release,'mira');
});
