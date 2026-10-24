import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoGame } from '../demo.js';
import { resolveEvent, nextProject } from '../engine.js';
import { decisionChoices } from '../assets/decision-view.js';
import { contractCosts } from '../assets/commission-view.js';
import { CONTRACTS } from '../assets/studio-life.js';
import { renderTeamHUD } from '../assets/team-hud.js';

test('incident outcomes displayed before choice match the engine including upgraded office and two participants',()=>{
  for(const type of ['noise','computer','idea','tension'])for(const upgraded of [false,true])for(const id of ['life-care','life-wait']){
    const s=createDemoGame();s.stage='event';s.currentEvent='life';s.life.incident={type,id:s.team[0],otherId:s.team[1]};s.life.upgrades=upgraded?['quiet','computers']:[];
    for(const m of Object.values(s.life.members)){m.morale=50;m.stress=50;}
    const choice=decisionChoices(s).find(o=>o.id===id),labels=choice.effects.map(e=>e.label).join(' ').replaceAll('−','-'),before=s.time;
    assert.equal(resolveEvent(s,id),null);
    assert.match(labels,new RegExp(s.time>before?'\\+1 ч':'Без задержки'));
    if(type==='idea')assert.match(labels,id==='life-care'?/команды \+8/:/автора \+2/);
    else {const m=s.life.members[s.team[0]];assert.match(labels,new RegExp(`Настроение${type==='tension'&&id==='life-care'?' обоих':''} ${m.morale>50?'\\+':''}${m.morale-50}`));}
  }
});
test('commission preview balances equal the actual next-order ledger including expanded team subsidy',()=>{
  for(const c of CONTRACTS)for(const expanded of [false,true]){
    const s=createDemoGame();s.stage='result';s.life.settled=true;s.life.cash=50000;
    if(expanded){s.life.upgrades=['desk4','desk5'];s.team.push('pixel','saga');s.seats=[...s.team];}
    s.life.members[s.team[0]].raises=2;
    const cost=contractCosts(s,c);assert.equal(nextProject(s,c.id),null);
    assert.equal(s.life.cash,cost.cashAfter);assert.equal(s.budget,cost.reserve);assert.equal(s.deadline,cost.deadline);
  }
});
test('closing employee card removes the selected content instead of reopening the first employee',()=>{
  const s=createDemoGame();
  assert.doesNotMatch(renderTeamHUD(s,null),/<section class="team-thought"/);
  assert.match(renderTeamHUD(s,s.team[1]),/<section class="team-thought"/);
  assert.doesNotMatch(renderTeamHUD(s,null),/aria-expanded="true"/);
});
test('technical choice costs and trust labels agree with actual game effects',()=>{
  for(const event of ['scope','review','bug']) {
    const base=createDemoGame();base.stage='event';base.currentEvent=event;base.trust=50;
    for(const choice of decisionChoices(base)) {
      const s=structuredClone(base),before={time:s.time,budget:s.budget,code:s.extraCode};
      assert.equal(resolveEvent(s,choice.id),null);
      assert.equal(choice.cost,before.budget-s.budget);
      const labels=choice.effects.map(e=>e.label).join(' ').replaceAll('−','-');
      const trust=s.trust-50;assert.ok(labels.includes(`Доверие ${trust>0?'+':''}${trust}`));
      if(s.extraCode>before.code)assert.ok(labels.includes(`Объём кода +${s.extraCode-before.code} ч`));
      if(s.time>before.time)assert.ok(labels.includes(`+${s.time-before.time} ч`));
    }
  }
});
