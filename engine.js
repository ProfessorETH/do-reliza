import { studioCapacity } from './assets/studio-progression.js';
import { studyDecision, recordDiscussion, validDiscussions } from './assets/team-discussion.js';
export { studyDecision };
import { validEventClock } from './assets/event-clock.js';
import { AGENTS, TASKS, DIFFICULTIES } from './data.js';
import { isWalkable } from './office-layout.js?v=shift-ux-20261024-v2';
import { ensureLife, condition, lifeHour, scheduleIncident, resolveIncident, settleProject, validLife, awayForRest, CONTRACTS, contractFor } from './assets/studio-life.js?v=shift-ux-20261024-v2';
export const VERSION = 1;
export const agentById = id => AGENTS.find(a => a.id === id);
export const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export function createGame(difficulty = 'normal') {
  const mode = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const state = { version: VERSION, stage: 'hire', difficulty: DIFFICULTIES[difficulty] ? difficulty : 'normal',
    budget: mode.budget, initialBudget: mode.budget, deadline: mode.deadline, time: 0,
    team: [], seats: [null, null, null], officeTargets: {}, assignments: {}, progress: Object.fromEntries(TASKS.map(t => [t.id, 0])),
    workload: {}, choices: {}, currentEvent: null, trust: 80, designPenalty: 0,
    shield: false, checkpoint: true, criticalBug: false, extraCode: 0,
    log: ['Получен заказ: подготовить игру «Орбита» к школьному фестивалю.'] };
  ensureLife(state); return state;
}
export function hire(state, id) {
  const a = agentById(id);
  if (!a || state.stage !== 'hire') return 'Сейчас команда уже работает.';
  if (state.life?.away?.includes(id)) return 'Сотрудник ушёл из студии и пропускает этот заказ.';
  if (state.team.includes(id)) {
    state.team = state.team.filter(x => x !== id); state.budget += a.cost;
    state.seats = state.seats.map(x => x === id ? null : x);
    delete state.officeTargets[id];
    if (state.life) state.life.departures = state.life.departures.filter(x => x !== id);
    Object.keys(state.assignments).forEach(k => { if (state.assignments[k] === id) delete state.assignments[k]; });
    return null;
  }
  if (state.team.length >= studioCapacity(state)) return 'Все рабочие места заняты. Купи расширение офиса или освободи место.';
  if (state.budget < a.cost) return 'Не хватает бюджета. Попробуйте другую комбинацию.';
  state.team.push(id); state.budget -= a.cost; return null;
}
// Saves from checkpoint 01 had no office layout. Keep their project progress.
export function restoreOffice(state) {
  if (!state.seats) state.seats = Array.from({ length: studioCapacity(state) }, (_, i) => state.stage === 'hire' ? null : state.team[i] || null);
  if (!state.officeTargets) state.officeTargets = {};
  ensureLife(state);
  if (state.stage === 'result') settleProject(state, getResult(state));
  return state;
}
export const teamSeated = state => state.team.length >= 3 && state.team.length <= studioCapacity(state) && state.team.every(id => state.seats?.includes(id));
export function seatAgent(state, agentId, index) {
  if (!['hire', 'plan'].includes(state.stage)) return 'Пересадить команду можно до начала смены.';
  if (!state.team.includes(agentId) || !Number.isInteger(index) || index < 0 || index >= studioCapacity(state)) return 'Выбери разработчика из команды и рабочее место.';
  const previous = state.seats.indexOf(agentId), occupant = state.seats[index];
  if (previous === index) return null;
  if (previous >= 0) state.seats[previous] = occupant;
  state.seats[index] = agentId;
  delete state.officeTargets[agentId];
  return null;
}
export function walkInOffice(state, agentId, point) {
  if (!['hire', 'plan'].includes(state.stage)) return 'Во время смены команда занята задачами.';
  if (!state.team.includes(agentId)) return 'Сначала выбери разработчика из команды.';
  if (!isWalkable(point, undefined, studioCapacity(state))) return 'Там мебель или край комнаты. Выбери свободный участок пола.';
  const target = point.map(n => Math.round(n * 10000) / 10000);
  if (!isWalkable(target, undefined, studioCapacity(state))) return 'Слишком близко к мебели. Выбери точку чуть дальше.';
  state.seats = state.seats.map(id => id === agentId ? null : id);
  state.officeTargets[agentId] = target;
  return null;
}
export function beginPlan(state) {
  if (state.stage !== 'hire' || !teamSeated(state)) return false;
  state.stage = 'plan'; return true;
}
export function assign(state, taskId, agentId) {
  if (state.stage !== 'plan' || !TASKS.some(t => t.id === taskId) || !state.team.includes(agentId)) return false;
  state.assignments[taskId] = agentId; return true;
}
export const fit = (agentId, task, state) => clamp((agentById(agentId)?.stats[task.skill] || 0) + (state?.support && state.support.agentId === agentId && state.support.taskId === task.id ? 15 : 0));
export function supportTask(state, taskId) {
  if (state.stage !== 'work') return 'Сначала вернитесь к работе.';
  if (state.support) return 'На этой смене вы уже провели совместный разбор.';
  const task = activeTasks(state).find(t => t.id === taskId);
  if (!task) return 'Помочь можно с задачей, которая сейчас в работе.';
  state.support = { taskId, agentId: state.assignments[taskId] };
  const member = ensureLife(state).members[state.support.agentId];
  member.stress = clamp(member.stress - 12); member.morale = clamp(member.morale + 5);
  state.time += 1;
  state.log.push(`Вы разобрали задачу «${task.name}» вместе с ${agentById(state.support.agentId).name}. Навык для этой задачи +15, потрачен 1 час.`);
  return null;
}
export function recommend(state) {
  if (state.stage !== 'plan') return;
  for (const task of TASKS) state.assignments[task.id] = [...state.team].sort((a, b) => fit(b, task) - fit(a, task))[0];
}
export function beginWork(state) {
  if (state.stage !== 'plan' || !teamSeated(state) || !TASKS.every(t => state.team.includes(state.assignments[t.id]))) return false;
  state.stage = 'work'; state.log.push('План согласован. Команда приступила к работе.'); return true;
}
export function taskStatus(state, task) {
  if (state.progress[task.id] >= 100) return 'done';
  return task.depends.every(id => state.progress[id] >= 100) ? 'ready' : 'locked';
}
export function activeTasks(state) {
  const busy = new Set();
  return TASKS.filter(task => {
    const id = state.assignments[task.id];
    if (!id || awayForRest(state.life?.members[id]) || taskStatus(state, task) !== 'ready' || busy.has(id)) return false;
    busy.add(id); return true;
  });
}
export function tick(state) {
  if (state.stage !== 'work') return false;
  const active = activeTasks(state);
  const pendingCare=()=>state.team.some(id=>{const m=state.life?.members[id];return m?.restTrip||m?.coffeeTrip||m?.breaks;});
  if (!active.length && !pendingCare() && TASKS.every(t => state.progress[t.id] >= 100)) { state.stage = 'result'; settleProject(state,getResult(state)); return true; }
  if (!active.length && !pendingCare()) return false;
  state.time += 1;
  const completed = [];
  for (const task of active) {
    const id = state.assignments[task.id], a = agentById(id);
    const hours = state.workload[id] || 0;
    const fatigue = hours > 7 ? .85 : 1;
    const equipment = state.life?.upgrades.includes('computers') && ['code','release'].includes(task.id) ? 1.1 : 1;
    const speed = (.7 + a.stats.pace / 180) * (.65 + fit(id, task, state) / 180) * fatigue * condition(state,id).factor * equipment;
    const base = (task.base + (task.id === 'code' ? state.extraCode : 0)) * (contractFor(state).factors[task.id] || 1);
    state.progress[task.id] = clamp(state.progress[task.id] + speed * 100 / base);
    state.workload[id] = hours + 1;
    if (state.progress[task.id] >= 100) { completed.push(task); state.log.push(`${a.name}: «${task.name}» — готово.`); }
  }
  lifeHour(state, active, completed);
  if (!state.choices.scope && state.time >= 3) { state.currentEvent = 'scope'; state.stage = 'event'; }
  else if (!state.choices.review && state.progress.code >= 100) { state.currentEvent = 'review'; state.stage = 'event'; }
  else if (!state.choices.bug && state.progress.qa >= 100) { state.currentEvent = 'bug'; state.stage = 'event'; }
  else if (scheduleIncident(state)) { /* The persisted event pauses time like technical decisions. */ }
  else if (!pendingCare() && TASKS.every(t => state.progress[t.id] >= 100)) { state.stage = 'result'; state.log.push('Версия передана заказчику. Пора проверить результат.'); settleProject(state,getResult(state)); }
  return true;
}
export function resolveEvent(state, optionId) {
  if (state.stage !== 'event') return 'Сейчас нет события.';
  const event = state.currentEvent;
  if (event === 'life') return resolveIncident(state, optionId);
  const before = {time:state.time, budget:state.budget, trust:state.trust};
  if (event === 'scope') {
    if (!['focus', 'shield', 'swap'].includes(optionId)) return 'Выберите решение.';
    if (optionId === 'shield' && state.budget < 2000) return 'В резерве нужно 2 000 ₽.';
    if (optionId === 'focus') { state.trust += 4; state.log.push('Согласовано: щит переносим в следующий релиз, сохраняем основной объём.'); }
    if (optionId === 'shield') { state.budget -= 2000; state.progress.code *= (4 + state.extraCode) / (6 + state.extraCode); state.extraCode += 2; state.shield = true; state.trust += 6; state.log.push('Согласованы дополнительная функция и расходы: добавляем щит.'); }
    if (optionId === 'swap') { state.progress.code *= (4 + state.extraCode) / (5 + state.extraCode); state.extraCode += 1; state.designPenalty = 12; state.shield = true; state.trust += 2; state.log.push('Объём пересогласован: упрощаем оформление ради щита.'); }
  } else if (event === 'review') {
    if (!['review-fix', 'review-pair', 'review-skip'].includes(optionId)) return 'Выберите решение проверки кода.';
    if (optionId === 'review-fix') { state.time += 1; state.trust += 3; state.log.push('Вы заметили неверный порядок действий: сначала проверить клетку, потом двигать корабль. Исправлено за 1 час.'); }
    if (optionId === 'review-pair') { state.time += 2; state.trust += 7; state.log.push('Вы вместе с разработчиком исправили движение и разобрали ещё один крайний случай. Потрачено 2 часа.'); }
    if (optionId === 'review-skip') { state.wallBug = true; state.trust -= 20; state.log.push('Проверка кода пропущена. В игру попала ошибка: корабль проходит сквозь астероиды.'); }
  } else if (event === 'bug') {
    if (!['fix', 'cut', 'ignore'].includes(optionId)) return 'Выберите решение.';
    if (optionId === 'fix' && state.budget < 1500) return 'На исправление нужно 1 500 ₽. Можно честно сократить объём.';
    if (optionId === 'fix') { state.budget -= 1500; state.time += 2; state.trust += 6; state.log.push('Ошибка сохранения исправлена и повторно проверена. Потрачено 2 часа.'); }
    if (optionId === 'cut') { state.checkpoint = false; state.trust -= 6; state.log.push('Сохранение убрано из релиза. Заказчик предупреждён о короткой сессии.'); }
    if (optionId === 'ignore') { state.criticalBug = true; state.trust -= 24; state.log.push('Известная ошибка попала в релиз: прогресс прототипа теряется при перезапуске.'); }
  } else return 'Неизвестное событие.';
  state.trust = clamp(state.trust); state.choices[event] = optionId;
  ensureLife(state);
  recordDiscussion(state, event, optionId, before);
  state.currentEvent = null; state.stage = 'work'; return null;
}
export function getResult(state) {
  const quality = Math.round(TASKS.reduce((sum, t) => sum + fit(state.assignments[t.id], t, state), 0) / TASKS.length);
  const critical = state.criticalBug || state.wallBug;
  const late = Math.max(0, state.time - state.deadline);
  const score = Math.round(clamp(quality * .45 + Math.max(0, 25 - late * 5) + (state.budget >= 0 ? 10 : 0) + state.trust * .1 + (critical ? 0 : 10) - state.designPenalty * .2));
  const passed = score >= 65 && !critical;
  return { quality, late, score, passed, critical, design: clamp(fit(state.assignments.design, TASKS[1], state) - state.designPenalty),
    title: critical ? 'Перед показом нужен патч' : passed ? (late ? 'Готово, но позже срока' : 'Можно звать игроков!') : 'Попробуем ещё раз?',
    summary: critical ? 'В версии осталась ошибка. Запустите игру и посмотрите, как она влияет на игрока.' : late ? `Игра готова на ${late} ч позже. В следующей смене попробуйте распределить работу иначе.` : 'Команда закончила игру. Теперь можно проверить её самим.' };
}
export const totalProgress = s => Math.round(Object.values(s.progress).reduce((a, b) => a + b, 0) / TASKS.length);
export function nextProject(state, contractId) {
  if (state.stage !== 'result') return 'Сначала заверши текущий заказ.';
  const contract = CONTRACTS.find(c => c.id === contractId);
  if (!contract) return 'Выбери следующий заказ.';
  settleProject(state, getResult(state));
  const l = ensureLife(state);
  const payroll = state.team.filter(id => !l.departures.includes(id)).reduce((sum,id) => sum + l.members[id].raises * 1000, 0);
  if (l.cash < payroll) return `Для обещанных доплат нужно ${payroll} ₽. В окне сотрудника можно не продлевать контракт и нанять замену на следующий заказ.`;
  const next = createGame(state.difficulty), team = state.team.filter(id => !l.departures.includes(id));
  next.budget = next.initialBudget = contract.budget + DIFFICULTIES[state.difficulty].budget - 36000;
  next.deadline = contract.deadline + DIFFICULTIES[state.difficulty].deadline - 16;
  const departed=[...l.departures], away=departed.slice(0,AGENTS.length-3);
  const fees = team.reduce((sum,id) => sum + agentById(id).cost, 0);
  const replacements=AGENTS.filter(a=>!team.includes(a.id)&&!away.includes(a.id)).sort((a,b)=>a.cost-b.cost).slice(0,Math.max(0,3-team.length));
  const minimumFees=fees+replacements.reduce((sum,a)=>sum+a.cost,0);
  if (next.budget+l.cash-payroll<minimumFees) return 'Не хватает общего бюджета для состава команды (нужно минимум трое). Выбери более оплачиваемый заказ или сохрани часть команды.';
  const subsidy = Math.max(0, fees - next.budget);
  if (l.cash < payroll + subsidy) return `Для доплат и расширенного состава нужно ${payroll + subsidy} ₽ в кассе. Выбери другой заказ или не продлевай один из контрактов.`;
  next.budget += subsidy;
  l.cash -= payroll + subsidy; l.away = away; l.departures = [];
  next.team = team; next.budget -= fees; next.seats = state.seats.map(id => team.includes(id) ? id : null);
  for (const { id } of AGENTS) {
    const m = l.members[id]; m.energy = clamp(m.energy + 35); m.stress = clamp(m.stress - 20); m.breaks = 0; m.restTrip = null; m.praised = 0; m.coffee = false; m.coffeeTrip = null;
    if (departed.includes(id)) { m.raises = 0; m.warnings = 0; } // Ended agreements do not create future payroll obligations.
  }
  l.contract = contract.id; l.incident = null; l.incidentDone = false; l.conflictDone = false; l.settled = false; l.seed = (Math.imul(l.seed,1664525) + 1013904223) >>> 0;
  next.life = l; next.timedEvents = state.timedEvents; next.orbitRecords = state.orbitRecords;
  next.log = [`Новый заказ: ${contract.name}. ${contract.text}`, `Доплаты из кассы студии: ${payroll} ₽; поддержка расширенного состава: ${subsidy} ₽. Команда отдохнула между заказами.`];
  if(departed.length>away.length)next.log.push('Часть ушедших коллег готова обсудить новый контракт сразу: в списке найма всегда доступны минимум три специалиста.');
  if (l.away.length) next.log.push(`Команду покинули: ${l.away.map(id => agentById(id).name).join(', ')}. Найми замену; ушедшие пропустят этот заказ.`);
  // Optional project flags (support, wallBug) must not leak into a new commission.
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state,next); return null;
}
export function validSave(s) {
  return s && (s.orbitRecords===undefined || s.orbitRecords && typeof s.orbitRecords==='object' && !Array.isArray(s.orbitRecords) && Object.entries(s.orbitRecords).every(([key,value])=>['festival','club','cup'].includes(key)&&Number.isSafeInteger(value)&&value>=0)) && validEventClock(s) && s.version === VERSION && ['hire', 'plan', 'work', 'event', 'result'].includes(s.stage)
    && (s.autoPlay===undefined||typeof s.autoPlay==='boolean')
    && (s.clockFraction===undefined||Number.isFinite(s.clockFraction)&&s.clockFraction>=0&&s.clockFraction<1)
    && DIFFICULTIES[s.difficulty] && Array.isArray(s.team) && s.team.length <= studioCapacity(s) && new Set(s.team).size === s.team.length
    && s.team.every(id => !!agentById(id)) && validDiscussions(s) && Number.isFinite(s.budget) && s.budget >= 0
    && (s.seats === undefined || (Array.isArray(s.seats) && s.seats.length === studioCapacity(s)
      && s.seats.every(id => id === null || s.team.includes(id))
      && new Set(s.seats.filter(Boolean)).size === s.seats.filter(Boolean).length))
    && (['hire','plan'].includes(s.stage) || s.seats === undefined || teamSeated(s))
    && (s.officeTargets === undefined || (s.officeTargets && typeof s.officeTargets === 'object' && !Array.isArray(s.officeTargets)
      && Object.entries(s.officeTargets).every(([id,p]) => s.team.includes(id) && !s.seats?.includes(id) && isWalkable(p, undefined, studioCapacity(s)))))
    && Number.isFinite(s.time) && s.time >= 0 && Number.isFinite(s.deadline) && s.deadline > 0
    && s.progress && TASKS.every(t => Number.isFinite(s.progress[t.id]) && s.progress[t.id] >= 0 && s.progress[t.id] <= 100)
    && s.assignments && Object.values(s.assignments).every(id => s.team.includes(id))
    && (['hire','plan'].includes(s.stage) || TASKS.every(t => s.team.includes(s.assignments[t.id])))
    && s.choices && s.workload && Number.isFinite(s.trust) && Number.isFinite(s.designPenalty) && Number.isFinite(s.extraCode)
    && (!s.support || (s.team.includes(s.support.agentId) && TASKS.some(t => t.id === s.support.taskId)))
    && Array.isArray(s.log) && s.log.every(x => typeof x === 'string') && (s.stage !== 'event' || ['scope','review','bug','life'].includes(s.currentEvent))
    && (s.currentEvent !== 'life' || s.life?.incident) && validLife(s);
}
