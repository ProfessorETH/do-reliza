import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { officePanel, memberPanel } from '../assets/studio-life-view.js';
import { buyUpgrade } from '../assets/studio-life.js';

test('catalog distinguishes mission locks, affordable upgrades and installed furniture',()=>{
  const s=createDemoGame();s.life.cash=10000;
  let html=officePanel(s);
  assert.match(html,/data-state="locked"[^]*?Напитки для команды/);
  assert.match(html,/data-filter="available"/);
  assert.equal(buyUpgrade(s,'lounge'),null);
  html=officePanel(s);
  assert.match(html,/data-state="owned"[^]*?Уютный отдых/);
  assert.match(html,/Куплено · 1/);
  s.life.missionsWon=['festival'];
  html=officePanel(s);
  assert.doesNotMatch(html,/Пройди фестивальную миссию/);
});
test('employee condition retains all three numeric states and action effects behind details',()=>{
  const s=createDemoGame(),id=s.team[0];s.life.members[id].energy=25;s.life.members[id].stress=70;
  const html=memberPanel(s,id);
  assert.match(html,/value="25" aria-label="Энергия"/);
  assert.match(html,/value="70" aria-label="Напряжение"/);
  assert.match(html,/aria-label="Настроение"/);
  assert.match(html,/Условия и эффекты действий/);
});
