import { DIFFICULTIES } from '../data.js';
import { assetURL } from '../asset-url.js';
import { graphicsSettingsHTML } from './office-runtime.js?v=team-hud-20261024';

export const DIFFICULTY_OPTIONS = [
  { id:'calm', title:'Легко', description:'Для первого знакомства. Больше времени и денег на исправление ошибок.' },
  { id:'normal', title:'Обычно', description:'Для уверенного старта. Планируй время и оставляй деньги в резерве.' },
  { id:'hard', title:'Сложно', description:'Для опытного тимлида. Меньше ресурсов, каждое решение важнее.' },
];

export function renderStartScreen({ difficulty, saved, demo, logo, icon, money, soundButton, soundEnabled, soundPreviewed }) {
  const mode=DIFFICULTY_OPTIONS.find(option=>option.id===difficulty)||DIFFICULTY_OPTIONS[0];
  const settings=DIFFICULTIES[mode.id], audioReady=soundEnabled&&soundPreviewed;
  const stages={hire:'Собираем команду',plan:'Распределяем задачи',work:'Команда работает',event:'Нужно твоё решение',result:'Игра выпущена'};
  const setup=`<fieldset class="difficulty-picker"><legend>Выбери сложность</legend>
    <div class="difficulty-choices">${DIFFICULTY_OPTIONS.map(option=>`<label class="difficulty-choice${mode.id===option.id?' chosen':''}"><input type="radio" name="difficulty" value="${option.id}" ${mode.id===option.id?'checked':''} aria-describedby="difficulty-description"><span>${option.title}</span></label>`).join('')}</div>
    <p id="difficulty-description" class="difficulty-description">${mode.description}</p>
    <div class="difficulty-resources"><span>Бюджет проекта <b>${money(settings.budget)}</b></span><span>До показа <b>${settings.deadline} игровых часов</b></span></div>
  </fieldset>`;
  const audio=`<section class="start-audio" data-ready="${audioReady}" aria-labelledby="start-audio-title">
    <img src="${assetURL('onboarding/nika-avatar.webp')}" alt="" width="44" height="44">
    <div class="start-audio-copy"><h3 id="start-audio-title">${audioReady?'Ника на связи!':'Играй со звуком'}</h3><p>${audioReady?'Голос включён. Можно начинать.':'Ника объясняет правила голосом.'}</p></div>
    <button class="start-audio-button" data-action="start-sound">${icon('sound',16)} ${audioReady?'Послушать ещё раз':'Включить и послушать'}</button>
    <p class="start-audio-note" role="status">${audioReady?'Проверь громкость на устройстве.':'Включи динамики или надень наушники.'}</p>
  </section>`;
  return `<main class="landing start-screen" data-saved="${!!saved}">
    <div class="office-backdrop"></div><div class="landing-shade"></div>
    <header class="topbar">${logo()}<span class="start-header-note">Маленькая студия. Большой первый релиз.</span><div class="start-tools">${soundButton}<button class="icon-btn" data-action="about" aria-label="Как играть">${icon('info')}</button></div></header>
    <div class="start-layout">
      <section class="start-copy" aria-labelledby="start-title">
        <div class="start-chapter"><span aria-hidden="true">01</span> ТВОЯ ПЕРВАЯ СТУДИЯ</div>
        <h1 id="start-title">Собери команду.<br><em>Выпусти игру.</em></h1>
        <p class="start-lead">Ты — <b>тимлид небольшой студии</b>. Найми трёх разработчиков, помоги им справиться с задачами и выпусти «Орбиту» к фестивалю.</p>
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
        <p class="start-reassurance">${saved?'Команда и твои решения ждут тебя.':'Ника встретит внутри и поможет с первыми шагами.'}</p>
        ${saved?`<details class="start-new-story" id="start-new-story"><summary>Начать новую игру</summary><div class="start-new-content">${setup}<button class="secondary full" data-action="new-game">Начать заново ${icon('arrow',16)}</button><p>Новая игра заменит сохранённую студию после подтверждения.</p></div></details>`:''}
        <details class="start-settings" id="start-settings"><summary>Настройки графики</summary>${graphicsSettingsHTML()}</details>
        ${!demo?'<a class="start-demo" href="?demo=1">Посмотреть демо с готовой командой <span aria-hidden="true">↗</span></a>':''}
      </section>
    </div>
    <footer class="landing-footer"><span>Без регистрации · прогресс сохраняется</span><span>До релиза · симулятор тимлида</span></footer>
  </main>`;
}
