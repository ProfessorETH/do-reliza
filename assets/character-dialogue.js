import { AGENTS } from '../data.js';
import { getResult } from '../engine.js?v=shift-ux-20261024-v2';

// Written for these characters. Every voiced sentence also appears as text.
export const CHARACTER_LINES = {
  mira: {
    work: 'Хочу, чтобы игрок разобрался без длинных объяснений.',
    support: 'Спасибо! Теперь понятно, что поправить. Покажу новый вариант.',
    concern: 'Давайте уточним, что должен понять игрок. Тогда найдём решение.',
    release: 'Всё на своих местах. Можно звать первых игроков!',
    conflict: 'Да сколько можно гнать? Мне нужно время, чтобы сделать нормально!',
  },
  pixel: {
    work: 'Сначала соберу рабочий набросок. Детали доведём после проверки.',
    support: 'А, понял! Этот вариант и проще, и быстрее. Сейчас переделаю.',
    concern: 'Есть идея, как это обойти. Только давайте сначала проверим.',
    release: 'А ведь начинали с пустого экрана. Теперь в это можно играть!',
    conflict: 'Опять передумываем? Выберите уже один вариант, а то мы так ничего не закончим!',
  },
  nord: {
    work: 'Проверю обычный сценарий и то, что происходит на границе.',
    support: 'Да, теперь причина ясна. Исправлю и проверю соседние случаи.',
    concern: 'Тут важно не торопиться. Сначала разберём причину, потом решение.',
    release: 'Проверки пройдены. Эту версию можно показывать.',
    conflict: 'Хватит торопить. Пропустим проверку — потом будем всё переделывать.',
  },
  iskra: {
    work: 'Соберу первую версию, чтобы было что попробовать.',
    support: 'Вот оно! Спасибо, теперь знаю, как доделать без лишних обходов.',
    concern: 'Кажется, здесь есть подвох. Давайте разберёмся, пока есть время.',
    release: 'Есть! Оно работает. Ну что, кто первым сыграет?',
    conflict: 'Да решите уже, что важнее! Я не могу делать всё одновременно!',
  },
  saga: {
    work: 'Попробую необычный сценарий. Лучше найти проблему сейчас.',
    support: 'Хорошо, проверю ещё раз. И соседний сценарий тоже.',
    concern: 'Давайте остановимся на минуту и проверим спорный момент.',
    release: 'Основные сценарии проверены. Можно выдохнуть и сыграть самим.',
    conflict: 'Я не буду закрывать глаза на проблемы ради красивого отчёта!',
  },
  echo: {
    work: 'Сверю результат с заданием, чтобы все понимали его одинаково.',
    support: 'Теперь договорились. Запишу решение, чтобы никто не потерялся.',
    concern: 'Давайте сверим, что обещали и что успеваем. Потом решим вместе.',
    release: 'Мы договорились, помогли друг другу и выпустили игру. Классная команда!',
    conflict: 'Так, стоп. Мы друг друга перебиваем. Сейчас никто никого не слышит.',
  },
};
for (const agent of AGENTS) CHARACTER_LINES[agent.id].intro = agent.quote;

export function characterLine(id, kind = 'intro') {
  return CHARACTER_LINES[id]?.[kind] || '';
}

export function characterMoment(game, id) {
  const member = game?.life?.members?.[id];
  if (!game?.team.includes(id) || !member) return null;
  if (member.restTrip || member.breaks) return null;
  if (game.stage === 'result') return getResult(game).passed ? 'release' : 'concern';
  if (game.stage === 'event' && game.life.incident?.type === 'tension') return game.life.incident.id === id ? 'conflict' : 'concern';
  if (game.stage === 'event') return 'concern';
  // A tired colleague must keep asking for the actual care they need.
  if (member.energy < 35 || member.stress >= 65 || member.morale < 35) return null;
  if (game.stage === 'work') return game.support?.agentId === id ? 'support' : 'work';
  return 'intro';
}
