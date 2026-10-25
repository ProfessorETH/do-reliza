import { isCareer, careerPremium } from './studio-career.js';
// Permanent studio discoveries, separate from a flight checkpoint or best time.
export const MISSION_REWARDS = {
  festival: { cash: 3000, unlock: 'Кофейная станция' },
  club: { cash: 6000, unlock: 'Крыло студии · четвёртое место' },
  cup: { cash: 8000, unlock: 'Пятое рабочее место' },
};
export const missionReward=(s,id)=>({...MISSION_REWARDS[id],cash:isCareer(s)?careerPremium(id):MISSION_REWARDS[id].cash});
export const studioCapacity = s => !Array.isArray(s?.life?.upgrades) ? 3 : s.life.upgrades.includes('desk5') ? 5 : s.life.upgrades.includes('desk4') ? 4 : 3;
export function upgradeLock(s, id) {
  const wins = s.life?.missionsWon || [];
  if (id === 'coffee' && !wins.includes('festival')) return 'Пройди фестивальную миссию';
  if (id === 'desk4' && !wins.includes('club')) return 'Пройди экспедицию исследователей';
  if (id === 'desk5' && !wins.includes('cup')) return 'Пройди кубок пилотов';
  if (id === 'desk5' && !s.life?.upgrades?.includes('desk4')) return 'Сначала открой четвёртое место';
  return '';
}
export function claimMissionReward(game) {
  const l = game.life, reward = MISSION_REWARDS[l?.contract]&&missionReward(game,l.contract);
  if (game.stage !== 'result' || !l?.settled || !reward) return false;
  // One payment per released order, even after replay, reload or a new record.
  if (l.missionReward?.order === l.completed) return false;
  l.missionsWon ||= [];
  const discovered = !l.missionsWon.includes(l.contract);
  if (discovered) l.missionsWon.push(l.contract);
  l.cash += reward.cash;
  l.missionReward = { order: l.completed, contract: l.contract, cash: reward.cash };
  game.log.push(`Миссия пройдена: премия +${reward.cash} ₽ в кассу студии.${discovered ? ' Открыто: '+reward.unlock+'. Улучшение можно купить в офисе.' : ''}`);
  return true;
}
export function fundTeam(game) {
  if (game.stage !== 'hire') return 'Бюджет команды пополняется перед наймом.';
  if (game.life.cash <= 0) return 'Касса студии пуста.';
  const amount=Math.min(5000,game.life.cash);
  game.life.cash -= amount; game.budget += amount;
  game.log.push(`Из кассы студии выделено ${amount} ₽ на состав команды текущего заказа.`);
  return null;
}
