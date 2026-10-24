import { TASKS } from '../../data.js';

export const STORY = [
  { chapter: 'Пролог · вчера', title: 'Это был твой последний рабочий день.', text: 'Большая студия закрыла ваш отдел. Коробка с вещами, непрочитанный чат команды и вопрос: что дальше?', note: 'Ты решаешь собрать собственную маленькую команду.', next: 'Начать свою историю' },
  { chapter: 'Пролог · сегодня', title: 'Три компьютера. И шанс начать заново.', text: 'Ты арендовал небольшую студию. Здесь ещё тихо, но скоро за этими столами будут работать твои люди.', note: 'Ты — основатель и тимлид: собираешь команду, помогаешь ей и развиваешь студию от заказа к заказу.', next: 'Кто-то написал…' },
  { chapter: 'Первый заказ · «Орбита»', title: 'Завтра фестиваль. Игры пока нет.', text: 'Школьный клуб просит сделать космическую игру: летать на корабле, собирать батареи и добраться до станции. Это ваш первый заказ.', note: 'Я Ника, помощница студии. Помогу освоиться. Решения за тобой!', next: 'Ника, покажи студию' },
];

// Derived from the actual game, so reloads, returning to hiring and manual
// assignments cannot leave a click-through tutorial on the wrong step.
export function guideFor(game, moving = false) {
  if (!game) return null;
  if (game.stage === 'hire') {
    const unseated = game.team.filter(id => !game.seats.includes(id));
    if (game.team.length < 3) return { id: 'hire', number: 1, title: 'Начнём с команды', text: 'Выбери кандидата и посмотри на пять навыков. Нужны трое: кто напишет код, кто сделает экран, кто найдёт ошибки. Оставь немного денег в резерве.', hint: `${game.team.length} из 3 разработчиков в команде`, target: '.candidate-grid' };
    if (unseated.length) return { id: 'seat', number: 2, title: 'У каждого — своё место', text: 'Нанятый разработчик ждёт у входа. Выбери его в офисе, затем нажми на свободный компьютер. Повтори для каждого.', hint: `${game.seats.filter(Boolean).length} из ${game.team.length} сотрудников за компьютерами`, target: '[data-action="office-desk"]' };
    return { id: 'plan', voice: moving ? 'guide-wait' : 'guide-plan', number: 3, title: moving ? 'Команда занимает места' : 'Все в сборе!', text: moving ? 'Подождём, пока все дойдут до компьютеров. Затем можно раздать задачи.' : 'Теперь нажми «Раздать задачи». Выберем исполнителей и поймём, что нужно сделать сначала.', target: '[data-action="plan"]' };
  }
  if (game.stage === 'plan') {
    const count = TASKS.filter(task => game.team.includes(game.assignments[task.id])).length;
    return { id: 'assign', voice: count < TASKS.length ? 'guide-assign' : 'guide-ready', number: 3, title: count < TASKS.length ? 'Пять задач, три специалиста' : 'План готов. Проверь его', text: count < TASKS.length ? 'Назначь исполнителя каждой задаче. «Подсказать» предложит вариант. Смотри на нужный навык: один человек делает свои задачи по очереди.' : 'Механика и экран могут делаться параллельно, если у них разные исполнители. Проверил назначения? Начинай смену.', hint: `${count} из ${TASKS.length} задач назначено`, target: count < TASKS.length ? '[data-action="recommend"]' : '[data-action="work"]' };
  }
  if (game.stage === 'event') return { id: 'event', voice: game.currentEvent === 'life' ? 'guide-team-event' : 'guide-event', number: 5, title: 'Команде нужно твоё решение', text: game.currentEvent === 'life' ? 'Это событие из жизни команды. Смотри на настроение и напряжение сотрудника. Помощь может стоить часа; улучшения офиса иногда позволяют сэкономить время.' : 'Время остановилось. Прочитай ситуацию и последствия вариантов. Выбери, что важнее для этого заказа: новая функция, срок или качество.', target: '.event-options' };
  if (game.stage === 'result') return { id: 'result', voice: 'guide-studio-result', number: 5, title: game.life?.completed > 1 ? 'Ещё один заказ завершён!' : 'Ваш первый релиз!', text: 'Сыграй в «Орбиту» и посмотри результат решений. Студия получила доход: теперь можно улучшить офис, обсудить оплату и взять следующий заказ с той же командой.', target: '[data-action="life-contracts"]' };
  if (game.stage === 'work') {
    if (game.team.some(id=>['outbound','returning'].includes(game.life?.members[id]?.restTrip?.phase))) return {id:'travel',voice:'guide-rest-travel',number:4,title:'Коллега направляется на перерыв',text:'Дождись, пока сотрудник дойдёт до зоны отдыха или вернётся за компьютер. Дорога не расходует игровые часы. Во время самого перерыва остальные работают как обычно.',target:'#office-webgl'};
    if (game.team.some(id=>game.life?.members[id]?.restTrip?.phase==='resting')) return {id:'resting',voice:'guide-resting-chair',number:4,title:'Коллега отдыхает в кресле',text:'Нажми «Следующий час»: коллега восстановит силы и вернётся к компьютеру. Остальные продвинут свои задачи. Если кто-то ждёт кресло, он отправится отдыхать следующим.',target:'[data-action="tick"]'};
    const needsCare = game.team.find(id => { const m = game.life?.members[id]; return m && !m.breaks && !m.restTrip && (m.energy < 35 || m.stress >= 65 || m.morale < 35); });
    if (needsCare) return { id: 'care', voice: 'guide-team-care', number: 4, title: 'Заметь, как чувствует себя команда', text: 'В панели команды видны настроение и текущие задачи. Открой состояние сотрудника: перерыв занимает час только у него, остальные продолжают работу. За готовый результат можно поблагодарить.', target: '[data-action="studio-team"]' };
    const canSupport = TASKS.some(t => game.assignments[t.id] && !game.life?.members[game.assignments[t.id]]?.breaks && !game.life?.members[game.assignments[t.id]]?.restTrip && game.progress[t.id] < 100 && t.depends.every(id => game.progress[id] >= 100));
    if (!game.support && game.time >= 2 && canSupport) return { id: 'support', number: 5, title: 'Тимлид помогает, когда трудно', text: 'Один раз за смену можно разобрать активную задачу вместе с разработчиком. Его навык для неё вырастет на 15, но пройдёт один час. Решай, нужна ли помощь сейчас.', target: '[data-action="studio-project"]' };
    return { id: 'time', number: 4, title: 'Пора дать команде поработать', text: 'Нажми «Следующий час» и посмотри, как продвигаются задачи. Часы вверху — игровое время. «Авто» двигает его само; обсуждения и окна ставят его на паузу.', target: '[data-action="tick"]' };
  }
  return null;
}
