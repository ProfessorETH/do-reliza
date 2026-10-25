import { agentProfile, initCareer, isCareer, contractTerms, releaseIncome, finishCareer, validCareer } from './studio-career.js';
import { requestCoffee, callNextCoffee, coffeeInTransit, validCoffeeTrips } from './coffee-trip.js';
import { AGENTS } from '../data.js';
import { studioCapacity, upgradeLock, MISSION_REWARDS, missionReward } from './studio-progression.js';

const clamp = n => Math.max(0, Math.min(100, n));
const member = () => ({ energy: 85, stress: 15, morale: 70, breaks: 0, restTrip: null, restSerial: 0, raises: 0, praised: 0, warnings: 0 });
export const CONTRACTS = [
  { id: 'festival', name: 'Орбита · фестиваль', client: 'Школьный клуб', text: 'Первый показ космической игры. Собрать три батареи и доставить их на станцию.', budget: 36000, deadline: 16, reward: 4500, factors: {} },
  { id: 'club', name: 'Орбита · исследователи', client: 'Кружок астрономии', text: 'Экспедиция в туманность: ретранслятор открывает ионный барьер, две аномалии нужно просканировать и привезти две батареи на станцию.', budget: 43000, deadline: 18, reward: 5500, factors: { design: 1.35, qa: 1.2 } },
  { id: 'cup', name: 'Орбита · кубок пилотов', client: 'Организаторы турнира', text: 'Гонка: одна батарея, три последовательных ворот, движущийся патруль и медаль за число ходов. За перехват без щита — штраф.', budget: 45000, deadline: 15, reward: 7000, factors: { code: 1.3, qa: 1.3 } },
];
export const UPGRADES = [
  { id: 'coffee', name: 'Кофейная станция', price: 2000, text: 'Чай, какао и кофе для команды. Один напиток за смену: сотрудник подходит к станции и пьёт. После напитка энергия +15, настроение +5. Действие доступно через сотрудника; отдых по-прежнему нужен.' },
  { id: 'desk4', name: 'Открыть крыло студии', price: 6000, text: 'Дополнительное помещение с четвёртым компьютером. Можно нанять четвёртого коллегу перед следующим заказом и разделить задачи.' },
  { id: 'desk5', name: 'Пятое рабочее место', price: 8000, text: 'Ещё один компьютер в новом крыле. Команда до пяти человек: каждому можно поручить свой этап. Найм и оплата требуют отдельного бюджета.' },
  { id: 'lounge', name: 'Обустроить зону отдыха', price: 2500, text: 'В зоне отдыха появятся мягкая накидка и чайный набор. Перерыв восстанавливает 45 энергии вместо 30.' },
  { id: 'quiet', name: 'Организовать тихий офис', price: 3000, text: 'На столах появятся акустические экраны: напряжение от работы +1 вместо +2; событие с шумом решается без потери часа.' },
  { id: 'computers', name: 'Обновить компьютеры', price: 4500, text: 'У столов появятся новые системные блоки. Код и сборка выполняются на 10% быстрее; сбой компьютера устраняется без потери часа.' },
];
export const INCIDENTS = {
  noise: { title: 'Созвон за соседним столом', text: 'Громкое обсуждение мешает сосредоточиться. Сотрудник уже несколько раз терял мысль.', upgrade: 'quiet', care: 'Договориться о тихом часе', effect: 'Напряжение −12 · +1 ч без тихого офиса' },
  computer: { title: 'Сборка снова зависла', text: 'Компьютер подвёл в середине работы. Сотрудник переживает, что задерживает всех.', upgrade: 'computers', care: 'Помочь настроить компьютер', effect: 'Напряжение −12 · +1 ч без обновления компьютеров' },
  idea: { title: 'Получилось лучше, чем ожидали', text: 'Сотрудник нашёл удачный приём и хочет показать его коллегам. У команды появился повод порадоваться.', care: 'Дать поделиться находкой', effect: 'Настроение всей команды +8 · +1 ч' },
  tension: { title: 'Разговор на повышенных тонах', text: 'Напряжение накопилось. Коллеги спорят о том, как продолжать работу, и уже перестали слышать друг друга.', care: 'Выслушать обоих и договориться о задачах', effect: 'Напряжение обоих −18 · настроение +8 · +1 ч' },
};

export function ensureLife(s) {
  if (!s.life) s.life = { version: 1, cash: 5000, completed: 0, contract: 'festival', upgrades: [], members: {}, history: [], seed: Math.floor(Math.random() * 0x100000000), incident: null, incidentDone: false, settled: false, departures: [] };
  if(isCareer(s)&&!s.life.career)initCareer(s);
  for (const a of AGENTS) s.life.members[a.id] ||= member();
  for (const id of s.team) {
    const m = s.life.members[id];
    m.restSerial ??= 0;
    if (m.breaks && !m.restTrip) m.restTrip = { phase: 'resting', slot: s.team.indexOf(id) }; // Old saved breaks have already started.
  }
  // Older builds allowed three simultaneous standing breaks. Preserve every
  // recovery entitlement, but restore a single occupant of the physical chair.
  let owner = false;
  for (const id of s.team) {
    const m = s.life.members[id];
    if (!['outbound','resting'].includes(m.restTrip?.phase)) continue;
    if (owner) m.restTrip.phase = 'queued';
    else owner = true;
  }
  callNextBreak(s);callNextCoffee(s);
  return s.life;
}
export const restInTransit = s => coffeeInTransit(s)||s.team.some(id => ['outbound','returning'].includes(s.life?.members[id]?.restTrip?.phase));
export const awayForRest = m => (!!m?.coffeeTrip&&m.coffeeTrip.phase!=='queued') || !!(m?.breaks || m?.restTrip) && m?.restTrip?.phase !== 'queued';
function callNextBreak(s) {
  if (s.team.some(id => { const t=s.life.members[id].restTrip;return t && t.phase!=='queued'; })) return;
  const id=s.team.filter(id=>s.life.members[id].restTrip?.phase==='queued').sort((a,b)=>(s.life.members[a].restTrip.request||0)-(s.life.members[b].restTrip.request||0))[0];
  if(id) { s.life.members[id].restTrip.phase='outbound';s.log.push(`${AGENTS.find(a=>a.id===id).name}: кресло освободилось, пора на перерыв.`); }
}
export function restArrival(s, id, arrival) {
  const m = s.life?.members[id], trip = m?.restTrip;
  if (!s.team.includes(id) || !trip) return false;
  if (arrival === 'resting' && trip.phase === 'outbound') { trip.phase = 'resting'; return true; }
  if (arrival === 'back' && trip.phase === 'returning') { m.restTrip = null; callNextBreak(s); return true; }
  return false;
}
export const contractFor = s => contractTerms(s,CONTRACTS.find(c => c.id === s.life?.contract) || CONTRACTS[0]);
export function condition(s, id) {
  const m = ensureLife(s).members[id];
  if(m.coffeeTrip){const phase=m.coffeeTrip.phase;return {label:({queued:'Ждёт напиток',outbound:'Идёт за напитком',drinking:'Пьёт напиток',returning:'Возвращается за компьютер'})[phase],reason:phase==='queued'?'Станция занята. Сотрудник ждёт своей очереди за компьютером.':'Энергия +15 и настроение +5 после напитка. Затем сотрудник вернётся на своё место.',factor:phase==='queued'?(m.energy<=25&&m.stress>=65?.75:m.energy<35||m.stress>=65?.9:m.morale<35?.95:1):1};}
  if (m.restTrip?.phase === 'queued') return { label: 'Ждёт свободное кресло', reason: 'Перерыв запланирован. Пока кресло занято, сотрудник продолжает работу; затем пойдёт отдыхать сам.', factor: m.energy<=25&&m.stress>=65?.75:m.energy<35||m.stress>=65?.9:m.morale<35?.95:1 };
  if (m.restTrip?.phase === 'outbound') return { label: 'Идёт на перерыв', reason: 'Направляется в зону отдыха. Остальная команда продолжает работу; отдых начнётся после посадки.', factor: 1 };
  if (m.restTrip?.phase === 'returning') return { label: 'Возвращается за компьютер', reason: 'Перерыв завершён. Работа продолжится после возвращения на своё место.', factor: 1 };
  if (m.breaks) return { label: 'На перерыве', reason: 'Отдыхает один игровой час в зоне отдыха; остальные продолжают работу.', factor: 1 };
  if (m.energy <= 25 && m.stress >= 65) return { label: 'На грани выгорания', reason: 'Мало энергии и много напряжения. Нужны отдых и помощь с причиной затруднений.', factor: .75 };
  if (m.energy < 35) return { label: 'Усталость', reason: 'Долго работает без отдыха. Перерыв вернёт энергию.', factor: .9 };
  if (m.stress >= 65) return { label: 'Нужна поддержка', reason: 'Накопилось напряжение от работы и событий. Помогут разбор и отдых.', factor: .9 };
  if (m.morale < 35) return { label: 'Настроение упало', reason: 'Неудачи и нерешённые проблемы расстраивают. Заметь результат и обсуди условия.', factor: .95 };
  return { label: m.morale >= 80 ? 'Воодушевление' : 'В порядке', reason: 'Успехи поднимают настроение; сложная работа и нерешённые проблемы его снижают.', factor: 1 };
}
export function lifeHour(s, active, completed) {
  const l = ensureLife(s);
  for (const id of s.team) {
    const m = l.members[id], task = active.find(t => s.assignments[t.id] === id);
    if (m.breaks && m.restTrip?.phase === 'resting') { m.breaks--; m.energy = clamp(m.energy + (l.upgrades.includes('lounge') ? 45 : 30)); m.stress = clamp(m.stress - 15); m.morale = clamp(m.morale + 3); m.restTrip = { phase: 'returning', slot: s.team.indexOf(id) }; }
    else if (awayForRest(m)) continue;
    else if (task) {
      m.energy = clamp(m.energy - 7);
      const difficult = agentProfile(s,id).stats[task.skill] < 60;
      m.stress = clamp(m.stress + (difficult ? 5 : l.upgrades.includes('quiet') ? 1 : 2));
      if (difficult || m.energy < 25) m.morale = clamp(m.morale - 2);
    } else { m.energy = clamp(m.energy + 3); m.stress = clamp(m.stress - 2); }
    if (completed.some(t => s.assignments[t.id] === id)) { m.morale = clamp(m.morale + 8); m.stress = clamp(m.stress - 6); }
  }
}
export function scheduleIncident(s) {
  const l = ensureLife(s);
  if (s.stage !== 'work' || l.incident) return false;
  const present = s.team.filter(id => !awayForRest(l.members[id]));
  const upset = present.find(id => l.members[id].stress >= 75 || l.members[id].morale <= 25);
  if (!l.conflictDone && s.time >= 2 && upset && present.length >= 2) {
    const otherId = present.filter(id => id !== upset).sort((a,b) => l.members[a].stress - l.members[b].stress)[0];
    l.incident = { type: 'tension', id: upset, otherId }; s.currentEvent = 'life'; s.stage = 'event';
    s.log.push(`${AGENTS.find(a=>a.id===upset).name} и ${AGENTS.find(a=>a.id===otherId).name}: напряжение вылилось в спор.`);
    return true;
  }
  if (l.incidentDone || s.time < 4 + l.seed % 3 || !present.length) return false;
  const type = ['noise','computer','idea'][(l.seed >>> 8) % 3];
  const id = present[(l.seed >>> 16) % present.length];
  l.incident = { type, id }; s.currentEvent = 'life'; s.stage = 'event';
  if (type !== 'idea') { l.members[id].stress = clamp(l.members[id].stress + 10); l.members[id].morale = clamp(l.members[id].morale - 6); }
  s.log.push(`${AGENTS.find(a => a.id === id).name}: ${INCIDENTS[type].title}.`);
  return true;
}
export function resolveIncident(s, option) {
  const l = ensureLife(s), ev = l.incident;
  if (s.stage !== 'event' || s.currentEvent !== 'life' || !ev || !['life-care', 'life-wait'].includes(option)) return 'Выбери решение события.';
  const m = l.members[ev.id], info = INCIDENTS[ev.type];
  if (ev.type === 'tension') {
    const participants = [ev.id,ev.otherId];
    if (option === 'life-care') s.time++;
    for (const id of participants) {
      l.members[id].stress = clamp(l.members[id].stress + (option === 'life-care' ? -18 : 10));
      l.members[id].morale = clamp(l.members[id].morale + (option === 'life-care' ? 8 : -8));
    }
    s.log.push(option === 'life-care' ? 'Выслушали обоих и согласовали задачи. Спор улажен; потрачен один час.' : 'Спор оставили без решения. Напряжение обоих +10, настроение −8.');
    l.conflictDone = true; l.incident = null; s.currentEvent = null; s.stage = 'work'; return null;
  }
  if (option === 'life-care') {
    if (!l.upgrades.includes(info.upgrade)) s.time++;
    if (ev.type === 'idea') for (const id of s.team) l.members[id].morale = clamp(l.members[id].morale + 8);
    else { m.stress = clamp(m.stress - 12); m.morale = clamp(m.morale + 6); }
    s.log.push(`${info.care}. ${l.upgrades.includes(info.upgrade) ? 'Улучшение офиса сэкономило час.' : 'Обсуждение заняло один час.'}`);
  } else {
    if (ev.type === 'idea') m.morale = clamp(m.morale + 2);
    else { m.stress = clamp(m.stress + 10); m.morale = clamp(m.morale - 8); }
    s.log.push(ev.type === 'idea' ? 'Находку записали для следующей встречи; настроение автора +2.' : 'Проблема отложена: напряжение +10, настроение −8.');
  }
  l.incidentDone = true; l.incident = null; s.currentEvent = null; s.stage = 'work'; return null;
}
export function careFor(s, id, action) {
  const l = ensureLife(s), m = l.members[id];
  if (!s.team.includes(id)) return 'Выбери сотрудника команды.';
  if (action === 'coffee') {
    return requestCoffee(s,id);
  } else if (action === 'break') {
    if (s.stage !== 'work' || m.breaks || m.restTrip || m.coffeeTrip) return 'Перерыв доступен во время работы, один за раз. Сначала вернись к компьютеру.';
    const occupied=s.team.some(a=>l.members[a].restTrip);
    const request=1+Math.max(0,...s.team.map(a=>l.members[a].restTrip?.request||0));
    m.breaks = 1; m.restSerial = (m.restSerial || 0) + 1; m.restTrip = { phase: occupied?'queued':'outbound', slot: s.team.indexOf(id), request };
    s.log.push(`${AGENTS.find(a => a.id === id).name} ${occupied?'ждёт свободное кресло и пока продолжает работу.':'идёт в зону отдыха на один игровой час. Остальные продолжат работу.'}`);
  } else if (action === 'praise') {
    if (!['work', 'result'].includes(s.stage)) return 'Поблагодарить можно за готовую задачу.';
    const count = Object.keys(s.progress).filter(t => s.assignments[t] === id && s.progress[t] >= 100).length;
    if (count <= m.praised) return 'Пока нет нового завершённого результата. Похвала не повторяет один и тот же бонус.';
    m.praised = count; m.morale = clamp(m.morale + 10); m.stress = clamp(m.stress - 5);
    s.log.push(`Ты отметил вклад ${AGENTS.find(a => a.id === id).name}: настроение +10.`);
  } else if (action === 'release') {
    if (s.stage !== 'result') return 'Состав команды меняем между заказами.';
    if (l.departures.includes(id)) return 'Следующий заказ уже запланирован без этого сотрудника.';
    l.departures.push(id); s.log.push(`Контракт ${AGENTS.find(a => a.id === id).name} не будет продлён. Для следующего заказа понадобится замена.`);
  } else if (action === 'raise') {
    if (s.stage !== 'result') return 'Условия оплаты обсуждаем между заказами.';
    if (m.raises >= 3) return 'Условия уже улучшены трижды.';
    if (l.cash < 1000) return 'В кассе студии нужно 1 000 ₽.';
    l.cash -= 1000; m.raises++; m.morale = clamp(m.morale + 15); m.warnings = 0;
    l.departures = l.departures.filter(x => x !== id);
    s.log.push(`Условия ${AGENTS.find(a => a.id === id).name} улучшены: +1 000 ₽ за каждый следующий заказ. Первые 1 000 ₽ выплачены сейчас.`);
  } else return 'Неизвестное действие.';
  return null;
}
export function buyUpgrade(s, id) {
  const l = ensureLife(s), u = UPGRADES.find(x => x.id === id);
  if (!['hire', 'plan', 'result'].includes(s.stage)) return 'Обустройство доступно до смены или после релиза.';
  if (!u) return 'Нет такого улучшения.';
  if (upgradeLock(s,id)) return upgradeLock(s,id);
  if (l.upgrades.includes(id)) return 'Уже установлено.';
  if (l.cash < u.price) return 'Недостаточно денег в кассе студии.';
  l.cash -= u.price; l.upgrades.push(id);
  while (s.seats.length < studioCapacity(s)) s.seats.push(null);
  s.log.push(`Студия: ${u.name}, ${u.price} ₽. ${u.text}`); return null;
}
export function settleProject(s, result) {
  const l = ensureLife(s);
  if (s.stage !== 'result' || l.settled) return;
  const income=releaseIncome(s,result,contractFor(s)),reward=income.net;
  finishCareer(s,result);
  l.cash += reward; l.completed++; l.settled = true;
  for (const id of s.team) {
    const m = l.members[id];
    m.morale = clamp(m.morale + (result.passed ? 5 : -10));
    if (m.morale < 30 || (m.energy <= 25 && m.stress >= 65)) m.warnings++; else m.warnings = 0;
    if (m.warnings >= 2 && !l.departures.includes(id)) l.departures.push(id);
  }
  l.history.push({ name: contractFor(s).name, score: result.score, reward, time: s.time, gross:income.gross, upkeep:income.upkeep });
  s.log.push(`Заказ закрыт: в кассу студии +${reward} ₽. Резерв заказчика не переносится.`);
}
export function validLife(s) {
  const l = s.life;
  if (l === undefined) return true; // Safe migration of 0.5 saves.
  const integer = (n, min, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= min && n <= max;
  return validCareer(s) && validCoffeeTrips(s) && l && l.version === 1 && integer(l.cash, 0) && integer(l.completed, 0) && integer(l.seed, 0, 0xffffffff)
    && (l.missionsWon === undefined || Array.isArray(l.missionsWon) && new Set(l.missionsWon).size === l.missionsWon.length && l.missionsWon.every(id=>Object.hasOwn(MISSION_REWARDS,id)))
    && (l.missionReward === undefined || l.missionReward && integer(l.missionReward.order,1,l.completed) && Object.hasOwn(MISSION_REWARDS,l.missionReward.contract) && l.missionReward.cash===missionReward(s,l.missionReward.contract).cash)
    && CONTRACTS.some(c => c.id === l.contract) && Array.isArray(l.upgrades) && new Set(l.upgrades).size === l.upgrades.length && l.upgrades.every(id => UPGRADES.some(u => u.id === id))
    && typeof l.settled === 'boolean' && typeof l.incidentDone === 'boolean' && (l.conflictDone === undefined || typeof l.conflictDone === 'boolean')
    && Array.isArray(l.departures) && l.departures.every(id => s.team.includes(id))
    && (l.away === undefined || (Array.isArray(l.away) && l.away.every(id => AGENTS.some(a => a.id === id) && !s.team.includes(id))))
    && Array.isArray(l.history) && l.history.every(h => h && typeof h.name === 'string' && integer(h.score, 0, 100) && integer(h.reward, 0) && Number.isFinite(h.time) && h.time >= 0)
    && l.members && AGENTS.every(a => { const m = l.members[a.id]; return m && ['energy','stress','morale'].every(k => Number.isFinite(m[k]) && m[k] >= 0 && m[k] <= 100) && integer(m.breaks,0,1) && integer(m.raises,0,3) && integer(m.praised,0,5) && integer(m.warnings,0)
      && (m.coffee === undefined || typeof m.coffee === 'boolean')
      && (m.restSerial === undefined || integer(m.restSerial,0))
      && (m.restTrip == null || (s.team.includes(a.id) && ['work','event','result'].includes(s.stage) && ['queued','outbound','resting','returning'].includes(m.restTrip.phase) && (m.restTrip.request===undefined||integer(m.restTrip.request,1)) && integer(m.restTrip.slot,0,4) && m.restTrip.slot === s.team.indexOf(a.id) && m.breaks === (m.restTrip.phase === 'returning' ? 0 : 1))); })
    && (l.incident === null ? s.currentEvent !== 'life' : l.incident && INCIDENTS[l.incident.type] && s.team.includes(l.incident.id) && s.currentEvent === 'life' && s.stage === 'event' && (l.incident.type === 'tension' ? !l.conflictDone && s.team.includes(l.incident.otherId) && l.incident.otherId !== l.incident.id : !l.incidentDone));
}
