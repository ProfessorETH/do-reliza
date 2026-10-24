import { AGENTS, TASKS, DIFFICULTIES } from './data.js';
export const VERSION = 1;
export const agentById = id => AGENTS.find(a => a.id === id);
export const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
export function createGame(difficulty = 'normal') {
  const mode = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  return { version: VERSION, stage: 'hire', difficulty: DIFFICULTIES[difficulty] ? difficulty : 'normal',
    budget: mode.budget, initialBudget: mode.budget, deadline: mode.deadline, time: 0,
    team: [], assignments: {}, progress: Object.fromEntries(TASKS.map(t => [t.id, 0])),
    workload: {}, choices: {}, currentEvent: null, trust: 80, designPenalty: 0,
    shield: false, checkpoint: true, criticalBug: false, extraCode: 0,
    log: ['Получен заказ: подготовить игру «Орбита» к школьному фестивалю.'] };
}
export function hire(state, id) {
  const a = agentById(id);
  if (!a || state.stage !== 'hire') return 'Сейчас команда уже работает.';
  if (state.team.includes(id)) {
    state.team = state.team.filter(x => x !== id); state.budget += a.cost;
    Object.keys(state.assignments).forEach(k => { if (state.assignments[k] === id) delete state.assignments[k]; });
    return null;
  }
  if (state.team.length >= 3) return 'В студии три места. Сначала освободите одно.';
  if (state.budget < a.cost) return 'Не хватает бюджета. Попробуйте другую комбинацию.';
  state.team.push(id); state.budget -= a.cost; return null;
}
export function beginPlan(state) {
  if (state.stage !== 'hire' || state.team.length !== 3) return false;
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
  state.time += 1;
  state.log.push(`Вы разобрали задачу «${task.name}» вместе с ${agentById(state.support.agentId).name}. Навык для этой задачи +15, потрачен 1 час.`);
  return null;
}
export function recommend(state) {
  if (state.stage !== 'plan') return;
  for (const task of TASKS) state.assignments[task.id] = [...state.team].sort((a, b) => fit(b, task) - fit(a, task))[0];
}
export function beginWork(state) {
  if (state.stage !== 'plan' || !TASKS.every(t => state.team.includes(state.assignments[t.id]))) return false;
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
    if (!id || taskStatus(state, task) !== 'ready' || busy.has(id)) return false;
    busy.add(id); return true;
  });
}
export function tick(state) {
  if (state.stage !== 'work') return false;
  const active = activeTasks(state);
  if (!active.length) return false;
  state.time += 1;
  for (const task of active) {
    const id = state.assignments[task.id], a = agentById(id);
    const hours = state.workload[id] || 0;
    const fatigue = hours > 7 ? .85 : 1;
    const speed = (.7 + a.stats.pace / 180) * (.65 + fit(id, task, state) / 180) * fatigue;
    const base = task.base + (task.id === 'code' ? state.extraCode : 0);
    state.progress[task.id] = clamp(state.progress[task.id] + speed * 100 / base);
    state.workload[id] = hours + 1;
    if (state.progress[task.id] >= 100) state.log.push(`${a.name}: «${task.name}» — готово.`);
  }
  if (!state.choices.scope && state.time >= 3) { state.currentEvent = 'scope'; state.stage = 'event'; }
  else if (!state.choices.review && state.progress.code >= 100) { state.currentEvent = 'review'; state.stage = 'event'; }
  else if (!state.choices.bug && state.progress.qa >= 100) { state.currentEvent = 'bug'; state.stage = 'event'; }
  else if (TASKS.every(t => state.progress[t.id] >= 100)) { state.stage = 'result'; state.log.push('Версия передана заказчику. Пора проверить результат.'); }
  return true;
}
export function resolveEvent(state, optionId) {
  if (state.stage !== 'event') return 'Сейчас нет события.';
  const event = state.currentEvent;
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
export function validSave(s) {
  return s && s.version === VERSION && ['hire', 'plan', 'work', 'event', 'result'].includes(s.stage)
    && DIFFICULTIES[s.difficulty] && Array.isArray(s.team) && s.team.length <= 3 && new Set(s.team).size === s.team.length
    && s.team.every(id => !!agentById(id)) && Number.isFinite(s.budget) && s.budget >= 0
    && Number.isFinite(s.time) && s.time >= 0 && Number.isFinite(s.deadline) && s.deadline > 0
    && s.progress && TASKS.every(t => Number.isFinite(s.progress[t.id]) && s.progress[t.id] >= 0 && s.progress[t.id] <= 100)
    && s.assignments && Object.values(s.assignments).every(id => s.team.includes(id))
    && (['hire','plan'].includes(s.stage) || TASKS.every(t => s.team.includes(s.assignments[t.id])))
    && s.choices && s.workload && Number.isFinite(s.trust) && Number.isFinite(s.designPenalty) && Number.isFinite(s.extraCode)
    && (!s.support || (s.team.includes(s.support.agentId) && TASKS.some(t => t.id === s.support.taskId)))
    && Array.isArray(s.log) && s.log.every(x => typeof x === 'string') && (s.stage !== 'event' || ['scope','review','bug'].includes(s.currentEvent));
}
