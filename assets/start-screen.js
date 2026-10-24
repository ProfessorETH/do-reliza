import { DIFFICULTIES } from '../data.js';
import { assetURL } from '../asset-url.js';
import { graphicsSettingsHTML } from './office-runtime.js?v=team-hud-20261024';

export const DIFFICULTY_OPTIONS = [
  { id:'calm', title:'Легко', description:'Для первого раза: больше времени и денег на ошибки.' },
  { id:'normal', title:'Обычно', description:'Обычный запас времени и денег. Продумай план команды.' },
  { id:'hard', title:'Сложно', description:'Меньше времени и денег. Для опытных тимлидов.' },
];

export function renderStartScreen({ difficulty, saved, demo, logo, icon, money, soundEnabled, soundPreviewed }) {
  const mode=DIFFICULTY_OPTIONS.find(option=>option.id===difficulty)||DIFFICULTY_OPTIONS[0];
  const settings=DIFFICULTIES[mode.id], audioReady=soundEnabled&&soundPreviewed;
  const stages={hire:'Собираем команду',plan:'Распределяем задачи',work:'Команда работает',event:'Нужно твоё решение',result:'Игра выпущена'};
  const setup=`<fieldset class="difficulty-picker"><legend>Сложность игры</legend>
    <div class="difficulty-choices">${DIFFICULTY_OPTIONS.map(option=>`<label class="difficulty-choice${mode.id===option.id?' chosen':''}"><input type="radio" name="difficulty" value="${option.id}" ${mode.id===option.id?'checked':''} aria-describedby="difficulty-description"><span>${option.title}</span></label>`).join('')}</div>
    <p id="difficulty-description" class="difficulty-description">${mode.description}</p>
    <div class="difficulty-resources"><span>Бюджет команды <b>${money(settings.budget)}</b></span><span>До релиза <b>${settings.deadline} игровых часов</b></span></div>
  </fieldset>`;
  const audio=`<section class="start-audio" data-ready="${audioReady}" aria-labelledby="start-audio-title">
    <img src="${assetURL('onboarding/nika-avatar.webp')}" alt="" width="44" height="44">
    <div class="start-audio-copy"><h3 id="start-audio-title">${audioReady?'Ника на связи!':'Играй со звуком'}</h3><p>${audioReady?'Голос включён.':'Ника объяснит правила.'}</p></div>
    <button class="start-audio-button" data-action="start-sound">${icon(audioReady?'play':'sound',20)} ${audioReady?'Послушать ещё раз':'Включить голос Ники'}</button>
    <p class="start-audio-note" role="status">${audioReady?'Проверь громкость на устройстве.':'Включи динамики или надень наушники.'}</p>
  </section>`;
  return `<main class="landing start-screen" data-saved="${!!saved}">
    <div class="office-backdrop"></div><div class="landing-shade"></div>
    <header class="topbar">${logo()}<span class="start-header-note">Маленькая студия. Большой первый релиз.</span><div class="start-tools"><button class="start-tool" data-action="sound" aria-pressed="${soundEnabled}" aria-label="${soundEnabled?'Выключить':'Включить'} звук">${icon('sound',18)}<span>Звук<span class="start-tool-state"> ${soundEnabled?'вкл.':'выкл.'}</span></span></button><button class="start-tool" data-action="about" aria-label="Как играть">${icon('info',18)}<span>Правила</span></button></div></header>
    <div class="start-layout">
      <section class="start-copy" aria-labelledby="start-title">
        <div class="start-chapter"><span aria-hidden="true">01</span> ТВОЯ ПЕРВАЯ СТУДИЯ</div>
        <h1 id="start-title">Собери команду.<br><em>Выпусти игру.</em></h1>
        <p class="start-lead">Ты — <b>тимлид</b>. Собери команду и выпусти с ней «Орбиту» к фестивалю.</p>
        <section class="start-how" aria-labelledby="start-how-title"><h2 id="start-how-title">Всё начинается с тебя</h2><ol>
          <li><span>01</span><div><b>Собери команду</b><p>Найди сильные стороны коллег</p></div></li>
          <li><span>02</span><div><b>Помоги в работе</b><p>Распредели задачи и решай сложности</p></div></li>
          <li><span>03</span><div><b>Доведи до релиза</b><p>Проверь результат и сыграй в него</p></div></li>
        </ol></section>
        <div class="start-crew"><div class="start-crew-faces" aria-hidden="true"><span style="--px:0%;--py:0%"></span><span style="--px:0%;--py:100%"></span><span style="--px:100%;--py:100%"></span></div><p><b>Шесть характеров. Одна команда.</b><span>Выбирай коллег и заботься о них по ходу игры.</span></p></div>
        <aside class="start-world-note"><span aria-hidden="true">${icon('rocket',18)}</span><p><b>Первый заказ — «Орбита»</b><span>Космическая игра, которую ждут на школьном фестивале.</span></p></aside>
      </section>
      <section class="start-console" aria-labelledby="start-console-title">
        <header class="start-console-header"><span class="start-console-label">${saved?'ТВОЯ СТУДИЯ':'НОВАЯ ИСТОРИЯ'}</span><h2 id="start-console-title">${saved?'Продолжим?':'Начнём с команды'}</h2>${saved?'<p>Твой прогресс сохранён в этом браузере.</p>':''}</header>
        ${saved?`<div class="start-save"><span class="live-dot" aria-hidden="true"></span><div><b>${stages[saved.stage]}</b><span>Прошло ${saved.time} из ${saved.deadline} игровых часов</span></div></div>`:setup}
        ${audio}
        <div class="start-actions"><button class="primary large" data-action="${saved?'continue':'new-game'}">${saved?'Продолжить игру':'Начать игру'} ${icon(saved?'play':'arrow',18)}</button></div>
        <p class="start-reassurance">${saved?'Вернёшься к команде с сохранённым прогрессом.':'Без регистрации. Ника поможет освоиться.'}</p>
        <div class="start-other-actions">${saved?`<details class="start-new-story" id="start-new-story"><summary><span class="start-row-icon" aria-hidden="true">${icon('reset',20)}</span><span>Начать заново</span></summary><div class="start-new-content">${setup}<button class="secondary full" data-action="new-game">Начать новую игру ${icon('arrow',18)}</button><p>Сохранённая студия заменится после подтверждения.</p></div></details>`:''}
        <details class="start-settings" id="start-settings"><summary><span class="start-row-icon" aria-hidden="true">${icon('settings',20)}</span><span>Графика и скорость</span></summary>${graphicsSettingsHTML()}</details>
        ${!demo?`<a class="start-demo" href="?demo=1"><span class="start-row-icon" aria-hidden="true">${icon('play',20)}</span><span><b>Попробовать демо</b><small>Готовая команда · отдельная партия</small></span><span aria-hidden="true">↗</span></a>`:''}</div>
      </section>
    </div>
    <footer class="landing-footer"><span>Без регистрации · прогресс сохраняется</span><span>До релиза · симулятор тимлида</span></footer>
  </main>`;
}
