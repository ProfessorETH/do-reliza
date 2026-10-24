import { DIFFICULTIES } from '../data.js';
import { graphicsSettingsHTML } from './office-runtime.js?v=seated-breaks-20261024-v2';

export const DIFFICULTY_OPTIONS = [
  { id: 'calm', title: 'Легко', description: 'Для первого знакомства. Больше времени и денег на исправление ошибок.' },
  { id: 'normal', title: 'Обычно', description: 'Для уверенного старта. Планируй время и оставляй деньги в резерве.' },
  { id: 'hard', title: 'Сложно', description: 'Для опытного тимлида. Меньше ресурсов, каждое решение важнее.' },
];

export function renderStartScreen({ difficulty, saved, demo, logo, icon, money, soundButton, soundEnabled, soundPreviewed }) {
  const mode = DIFFICULTY_OPTIONS.find(option => option.id === difficulty) || DIFFICULTY_OPTIONS[0];
  const settings = DIFFICULTIES[mode.id];
  const audioReady = soundEnabled && soundPreviewed;
  const stages = { hire: 'сбор команды', plan: 'распределение задач', work: 'команда работает', event: 'команда ждёт решения', result: 'игра выпущена' };
  return `<main class="landing start-screen">
    <div class="office-backdrop"></div><div class="landing-shade"></div>
    <header class="topbar">${logo()}<div class="start-tools">${soundButton}<button class="icon-btn" data-action="about" aria-label="Как играть">${icon('info')}</button></div></header>
    <div class="start-layout"><section class="start-copy" aria-labelledby="start-title">
      <div class="start-chapter"><span>01</span> ПЕРВЫЙ ЗАКАЗ <i></i> ВЕЧЕР ПЕРЕД РЕЛИЗОМ</div>
      <h1 id="start-title">Твоя студия.<br><em>Твои решения.</em></h1>
      <p class="start-lead">Три пустых стола. Один шанс начать заново.<br>И первая игра, которую ждут уже завтра.</p>
      <p class="start-role">Ты — <b>основатель студии и её тимлид</b>. Найми команду, помоги ей выпустить «Орбиту», затем развивай офис и бери новые заказы.</p>
      <section class="start-audio" aria-labelledby="start-audio-title">
        <img src="assets/onboarding/nika-avatar.webp" alt="" width="48" height="48">
        <div class="start-audio-copy"><h2 id="start-audio-title">${audioReady?'Звук включён. Ника на связи!':'Включи звук, чтобы услышать Нику'}</h2><p>Голосовая помощница объяснит правила и поможет освоиться.</p></div>
        <button class="start-audio-button" data-action="start-sound">${icon('sound',18)} ${audioReady?'Послушать ещё раз':'Включить и послушать'}</button>
        <p class="start-audio-note" role="status">${audioReady?'Проверь громкость на устройстве. Звук можно выключить кнопкой сверху.':'Приготовь наушники или включи динамики.'}</p>
      </section>
      ${saved ? `<div class="start-save"><span class="live-dot"></span><div><b>Твоя студия ждёт</b><span>${stages[saved.stage]} · прошло ${saved.time} из ${saved.deadline} игровых часов</span></div></div>` : ''}
      <fieldset class="difficulty-picker"><legend>${saved ? 'Сложность новой игры' : 'Сложность игры'}</legend><div class="difficulty-choices">${DIFFICULTY_OPTIONS.map(option =>
        `<label class="difficulty-choice${difficulty === option.id ? ' chosen' : ''}"><input type="radio" name="difficulty" value="${option.id}" ${difficulty === option.id ? 'checked' : ''} aria-describedby="difficulty-description"><span>${option.title}</span></label>`
      ).join('')}</div><p id="difficulty-description" class="difficulty-description">${mode.description}</p>
        <div class="difficulty-resources"><span>Бюджет команды <b>${money(settings.budget)}</b></span><span>До показа <b>${settings.deadline} игровых часов</b></span></div>
      </fieldset>
      <div class="start-actions">${saved ? `<button class="primary large" data-action="continue">Вернуться в студию ${icon('play',17)}</button><button class="text-button" data-action="new-game">Начать новую историю</button>` : `<button class="primary large" data-action="new-game">Открыть студию ${icon('arrow')}</button>`}</div>
      <p class="start-reassurance">${saved ? 'Новая история заменит текущую партию после подтверждения.' : 'Ника встретит внутри и поможет с первыми шагами.'}</p>
      ${graphicsSettingsHTML()}
      ${!demo ? '<a class="start-demo" href="?demo=1">Быстрый показ с готовой командой <span aria-hidden="true">↗</span></a>' : ''}
    </section>
    <aside class="first-order" aria-label="Первый заказ от школьного клуба"><div class="order-clip" aria-hidden="true"></div><div class="order-meta"><span>ВХОДЯЩЕЕ / 001</span><span>ШКОЛЬНЫЙ КЛУБ</span></div><p class="order-sender">Привет, новая студия!</p><h2>Нам нужна игра.<br>К завтрашнему<br>фестивалю.</h2><p>Пусть игрок летает на корабле,<br>собирает батареи и спасает станцию.</p><ul><li>Открывается в браузере</li><li>Управление понятно с первого раза</li><li>Можно пройти до конца</li></ul><div class="order-signature"><span>Ждём вашу «Орбиту»!</span><span class="order-stamp">ПЕРВЫЙ<br>РЕЛИЗ</span></div></aside></div>
    <footer class="landing-footer"><span>Без регистрации · прогресс сохраняется</span><span>Глава 01 · До релиза</span></footer>
  </main>`;
}
