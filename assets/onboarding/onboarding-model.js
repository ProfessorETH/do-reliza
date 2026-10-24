import { TASKS } from '../../data.js';

export const STORY = [
  { chapter: 'Пролог · вчера', title: 'Это был твой последний рабочий день.', text: 'Большая студия закрыла ваш отдел. Коробка с вещами, непрочитанный чат команды и вопрос: что дальше?', note: 'Ты решаешь собрать собственную маленькую команду.', next: 'Начать свою историю' },
  { chapter: 'Пролог · сегодня', title: 'Три компьютера. И шанс начать заново.', text: 'Ты арендовал небольшую студию на вечер. Здесь ещё тихо, но скоро за этими столами будут работать твои люди.', note: 'Твоя роль — тимлид: собирать команду, помогать ей и отвечать за результат.', next: 'Кто-то написал…' },
  { chapter: 'Первый заказ · «Орбита»', title: 'Завтра фестиваль. Игры пока нет.', text: 'Школьный клуб просит сделать космическую игру: летать на корабле, собирать батареи и добраться до станции. Это ваш первый заказ.', note: 'Я Ника, помощница студии. Помогу освоиться. Решения за тобой!', next: 'Ника, покажи студию' },
];

// Derived from the actual game, so reloads, returning to hiring and manual
// assignments cannot leave a click-through tutorial on the wrong step.
export function guideFor(game, moving = false) {
  if (!game) return null;
  if (game.stage === 'hire') {
    const unseated = game.team.filter(id => !game.seats.includes(id));
    if (game.team.length < 3) return { id: 'hire', number: 1, title: 'Начнём с команды', text: 'Выбери кандидата и посмотри на пять навыков. Нужны трое: кто напишет код, кто сделает экран, кто найдёт ошибки. Оставь немного денег в резерве.', hint: `${game.team.length} из 3 агентов в команде`, target: '.candidate-grid' };
    if (unseated.length) return { id: 'seat', number: 2, title: 'У каждого — своё место', text: 'Нанятый агент ждёт у входа. Выбери его в офисе, затем нажми на свободный компьютер. Повтори для каждого.', hint: `${game.seats.filter(Boolean).length} из 3 мест занято`, target: '[data-action="office-desk"]' };
    return { id: 'plan', number: 3, title: moving ? 'Команда занимает места' : 'Все в сборе!', text: moving ? 'Подождём, пока все дойдут до компьютеров. Затем можно раздать задачи.' : 'Теперь нажми «Раздать задачи». Выберем исполнителей и поймём, что нужно сделать сначала.', target: '[data-action="plan"]' };
  }
  if (game.stage === 'plan') {
    const count = TASKS.filter(task => game.team.includes(game.assignments[task.id])).length;
    return { id: 'assign', number: 3, title: count < TASKS.length ? 'Пять задач, три специалиста' : 'План готов. Проверь его', text: count < TASKS.length ? 'Назначь исполнителя каждой задаче. «Подсказать» предложит вариант. Смотри на нужный навык: один человек делает свои задачи по очереди.' : 'Механика и экран могут делаться параллельно, если у них разные исполнители. Проверил назначения? Начинай смену.', hint: `${count} из ${TASKS.length} задач назначено`, target: count < TASKS.length ? '[data-action="recommend"]' : '[data-action="work"]' };
  }
  if (game.stage === 'event') return { id: 'event', number: 5, title: 'Команде нужно твоё решение', text: 'Время остановилось. Прочитай ситуацию и последствия вариантов. Выбери, что важнее для этого заказа: новая функция, срок или качество.', target: '.event-options' };
  if (game.stage === 'result') return { id: 'result', number: 5, title: 'Ваш первый релиз!', text: 'Теперь можно сыграть в «Орбиту». Кнопка разбора покажет, как твои решения повлияли на игру. Ты уже прошёл путь тимлида — от команды до результата.', target: '[data-action="play-mini"]' };
  if (game.stage === 'work') {
    if (!game.support && game.time >= 2) return { id: 'support', number: 5, title: 'Тимлид помогает, когда трудно', text: 'Один раз за смену можно разобрать активную задачу вместе с агентом. Его навык для неё вырастет на 15, но пройдёт один час. Решай, нужна ли помощь сейчас.', target: '[data-action="support"]' };
    return { id: 'time', number: 4, title: 'Пора дать команде поработать', text: 'Нажми «Следующий час» и посмотри, как продвигаются задачи. Часы вверху — игровое время. «Авто» двигает его само; обсуждения и окна ставят его на паузу.', target: '[data-action="tick"]' };
  }
  return null;
}
