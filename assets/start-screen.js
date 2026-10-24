import { DIFFICULTIES } from '../data.js';

export const CONTRACTS = [
  { id: 'calm', title: 'С запасом', note: 'Для первого знакомства', description: 'Есть время освоиться и исправить ошибки.' },
  { id: 'normal', title: 'Без лишнего', note: 'Для уверенного старта', description: 'Придётся внимательнее делить время и деньги.' },
  { id: 'hard', title: 'Аврал', note: 'Для повторной игры', description: 'Меньше резерв. Каждый лишний час ощутим.' },
];

export function renderStartScreen({ difficulty, saved, demo, logo, icon, money, soundButton }) {
  const mode = CONTRACTS.find(contract => contract.id === difficulty) || CONTRACTS[0];
  const stages = { hire: 'сбор команды', plan: 'распределение задач', work: 'команда работает', event: 'команда ждёт решения', result: 'игра выпущена' };
  return `<main class="landing start-screen">
    <div class="office-backdrop"></div><div class="landing-shade"></div>
    <header class="topbar">${logo()}<div class="start-tools">${soundButton}<button class="icon-btn" data-action="about" aria-label="Как играть">${icon('info')}</button></div></header>
    <div class="start-layout"><section class="start-copy" aria-labelledby="start-title">
      <div class="start-chapter"><span>01</span> ПЕРВЫЙ ЗАКАЗ <i></i> ВЕЧЕР ПЕРЕД РЕЛИЗОМ</div>
      <h1 id="start-title">Твоя студия.<br><em>Твои решения.</em></h1>
      <p class="start-lead">Три пустых стола. Один шанс начать заново.<br>И первая игра, которую ждут уже завтра.</p>
      <p class="start-role">Ты — <b>основатель студии и её тимлид</b>. Найми команду, помоги ей выпустить «Орбиту», затем развивай офис и бери новые заказы.</p>
      ${saved ? `<div class="start-save"><span class="live-dot"></span><div><b>Твоя студия ждёт</b><span>${stages[saved.stage]} · прошло ${saved.time} из ${saved.deadline} игровых часов</span></div></div>` : ''}
      <fieldset class="contract-picker"><legend>${saved ? 'Условия новой игры' : 'С каким запасом начнём?'}</legend><div class="contract-options">${CONTRACTS.map(contract => {
        const settings = DIFFICULTIES[contract.id];
        return `<label class="contract-option${difficulty === contract.id ? ' chosen' : ''}"><input type="radio" name="difficulty" value="${contract.id}" ${difficulty === contract.id ? 'checked' : ''} aria-describedby="contract-description"><span class="contract-name">${contract.title}<i aria-hidden="true"></i></span><span class="contract-figures"><b>${money(settings.budget)}</b><span>${settings.deadline} ч</span></span><small>${contract.note}</small></label>`;
      }).join('')}</div><p id="contract-description" class="contract-description"><b>${mode.title}.</b> ${mode.description} <span>Часы — игровое время.</span></p></fieldset>
      <div class="start-actions">${saved ? `<button class="primary large" data-action="continue">Вернуться в студию ${icon('play',17)}</button><button class="text-button" data-action="new-game">Начать новую историю</button>` : `<button class="primary large" data-action="new-game">Открыть студию ${icon('arrow')}</button>`}</div>
      <p class="start-reassurance">${saved ? 'Новая история заменит текущую партию после подтверждения.' : 'Ника встретит внутри и поможет с первыми шагами.'}</p>
      ${!demo ? '<a class="start-demo" href="?demo=1">Быстрый показ с готовой командой <span aria-hidden="true">↗</span></a>' : ''}
    </section>
    <aside class="first-order" aria-label="Первый заказ от школьного клуба"><div class="order-clip" aria-hidden="true"></div><div class="order-meta"><span>ВХОДЯЩЕЕ / 001</span><span>ШКОЛЬНЫЙ КЛУБ</span></div><p class="order-sender">Привет, новая студия!</p><h2>Нам нужна игра.<br>К завтрашнему<br>фестивалю.</h2><p>Пусть игрок летает на корабле,<br>собирает батареи и спасает станцию.</p><ul><li>Открывается в браузере</li><li>Управление понятно с первого раза</li><li>Можно пройти до конца</li></ul><div class="order-signature"><span>Ждём вашу «Орбиту»!</span><span class="order-stamp">ПЕРВЫЙ<br>РЕЛИЗ</span></div></aside></div>
    <footer class="landing-footer"><span>Без регистрации · прогресс сохраняется</span><span>Глава 01 · До релиза</span></footer>
  </main>`;
}
