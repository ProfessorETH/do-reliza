import { STORY, guideFor } from './onboarding-model.js?v=office-life-20261024-v3';

const AVATAR = new URL('./nika-avatar.webp', import.meta.url).href;
const money = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
const character = expression => `<span class="nika-character" data-expression="${expression}" role="img" aria-label="Ника, помощница студии"></span>`;

export function createOnboarding({ storageKey, pause, refresh, sound }) {
  let preferences = { enabled: true, collapsed: true, story: null };
  let currentGame = null, moving = false, returnFocus = null;
  let lastLine = '';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved.enabled === 'boolean') preferences = { enabled: saved.enabled, collapsed: saved.collapsed === true, story: Number.isInteger(saved.story) && saved.story >= 0 && saved.story < STORY.length ? saved.story : null };
  } catch { /* Guidance also works without browser storage. */ }
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* Session only. */ } };
  const storyDialog = document.createElement('dialog');
  storyDialog.className = 'onboarding-story';
  storyDialog.setAttribute('aria-labelledby', 'nika-story-title');
  document.body.append(storyDialog);

  function stopAnimation() {
    document.querySelectorAll('.nika-character').forEach(el => el.classList.remove('is-speaking', 'is-blinking'));
  }

  function animateCharacters(key, text, voiceKey = key) {
    if (document.hidden || (!storyDialog.open && (!preferences.enabled || preferences.collapsed))) { stopAnimation(); sound?.stopVoice(); return; }
    if (lastLine !== key) { lastLine = key; sound?.speak(voiceKey); }
  }

  function finishStory(enabled = true) {
    preferences.story = null; preferences.enabled = enabled; preferences.collapsed = true; save();
    storyDialog.close(); stopAnimation(); sound?.stopVoice(); refresh();
    const focus = returnFocus?.isConnected ? returnFocus : document.querySelector('[data-guide="toggle"]');
    focus?.focus({ preventScroll: true });
  }

  function showStory() {
    if (!currentGame || preferences.story === null) return;
    pause();
    const page = STORY[preferences.story];
    storyDialog.innerHTML = `<div class="nika-art">${character(preferences.story === 0 ? 'thoughtful' : preferences.story === 2 ? 'happy' : 'neutral')}<span class="nika-name">НИКА <small>помощница студии</small></span></div>
      <div class="nika-story-copy"><p class="nika-eyebrow">${page.chapter}</p><p class="nika-story-progress" aria-label="Часть ${preferences.story + 1} из ${STORY.length}">${STORY.map((_, i) => `<span class="${i <= preferences.story ? 'read' : ''}"></span>`).join('')}</p>
      <h2 id="nika-story-title">${page.title}</h2><p>${page.text}</p><blockquote>${page.note}</blockquote>
      ${preferences.story === 2 ? `<p class="nika-contract">На проект: <b>${money(currentGame.initialBudget)}</b> · <b>${currentGame.deadline} игровых часов</b><small>Аренда уже оплачена. Резерв — на команду и непредвиденные задачи.</small></p>` : ''}
      <div class="nika-story-actions"><button class="primary" data-guide="next" autofocus>${page.next} <span aria-hidden="true">→</span></button>${preferences.story > 0 ? '<button class="text-button" data-guide="back">Назад</button>' : ''}</div>
      <button class="text-button nika-skip" data-guide="skip-story">Пропустить историю</button><button class="text-button nika-skip" data-guide="skip-all">Играть без подсказок</button><div class="nika-audio-tools">${sound?.hasVoice(`story-${preferences.story}`)?'<button class="text-button nika-skip" data-guide="replay">Прослушать ещё раз</button>':''}<button class="text-button nika-skip" data-guide="sound">${sound?.enabled?'Выключить':'Включить'} звук</button></div></div>`;
    if (!storyDialog.open) { returnFocus = document.activeElement; storyDialog.showModal(); }
    else storyDialog.querySelector('[data-guide="next"]').focus({ preventScroll: true });
    animateCharacters(`story-${preferences.story}`, page.text);
  }

  function sync(game, busy = false) {
    currentGame = game; moving = busy;
    document.querySelector('.nika-guide')?.remove();
    document.querySelectorAll('.nika-target').forEach(el => el.classList.remove('nika-target'));
    if (!game) { if (storyDialog.open) storyDialog.close(); stopAnimation(); sound?.stopVoice(); lastLine = ''; return; }
    const step = guideFor(game, busy), panel = document.querySelector('.control-panel');
    if (!step || !panel) return;
    const collapsed = !preferences.enabled || preferences.collapsed;
    const guide = document.createElement('aside');
    guide.className = `nika-guide${collapsed ? ' nika-collapsed' : ''}`;
    guide.setAttribute('aria-label', 'Подсказка Ники');
    guide.innerHTML = `<div class="nika-guide-head"><span class="nika-avatar" style="background-image:url('${AVATAR}')" aria-hidden="true"></span><div><b>Ника</b><span>${collapsed ? 'Помощница студии' : `Заказ ${game.life ? game.life.completed + (game.stage === 'result' ? 0 : 1) : 1} · шаг ${step.number} / 5`}</span></div><button class="nika-toggle" data-guide="toggle" aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Открыть подсказку Ники' : 'Свернуть подсказку Ники'}">${collapsed ? 'Подсказка' : 'Свернуть'}</button></div>
      ${collapsed ? '' : `<div class="nika-guide-copy"><h2>${step.title}</h2><p>${step.text}</p>${step.hint ? `<strong class="nika-hint">${step.hint}</strong>` : ''}<div class="nika-guide-actions"><button data-guide="locate">Показать где <span aria-hidden="true">↗</span></button>${sound?.hasVoice(step.voice||`guide-${step.id}`)?'<button data-guide="replay-guide">Повторить голос</button>':''}<button data-guide="story">История</button><button data-guide="disable">${step.id==='result'?'Спасибо, Ника!':'Без подсказок'}</button></div></div>`}`;
    panel.prepend(guide);
    if (preferences.story !== null && !storyDialog.open && !document.querySelector('dialog[open]')) showStory();
    else if (!storyDialog.open && !document.querySelector('dialog[open]')) animateCharacters(`guide-${step.id}-${step.title}`, step.text, step.voice || `guide-${step.id}`);
  }

  // Separate data attribute keeps the host game's action handler untouched.
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-guide]');
    if (!button) return;
    const action = button.dataset.guide;
    if (action === 'sound') { sound?.toggle(); button.textContent = `${sound?.enabled?'Выключить':'Включить'} звук`; if(sound?.enabled) sound.speak(`story-${preferences.story}`, true); return; }
    sound?.unlock();
    sound?.effect('page');
    if (action === 'next') {
      if (preferences.story < STORY.length - 1) { preferences.story++; save(); showStory(); }
      else finishStory();
    } else if (action === 'back') { preferences.story = Math.max(0, preferences.story - 1); save(); showStory(); }
    else if (action === 'skip-story') finishStory();
    else if (action === 'skip-all') finishStory(false);
    else if (action === 'story') { preferences.story = 0; save(); showStory(); }
    else if (action === 'replay') sound?.speak(`story-${preferences.story}`, true);
    else if (action === 'replay-guide') { const step=guideFor(currentGame,moving); if(step) sound?.speak(step.voice || `guide-${step.id}`,true); }
    else if (action === 'locate') {
      const selector = guideFor(currentGame, moving)?.target;
      const inOffice = document.querySelector(selector)?.closest('.playable-office');
      preferences.collapsed = true; save(); refresh();
      let target = document.querySelector(selector);
      if (target && !target.getClientRects().length) {
        document.querySelector(`[data-action="workspace"][data-id="${inOffice ? 'office' : 'project'}"]`)?.click();
        target = document.querySelector(selector);
      }
      if (target) {
        document.querySelectorAll('.nika-target').forEach(el => el.classList.remove('nika-target'));
        target.classList.add('nika-target');
        target.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        (target.matches('button,select') ? target : target.querySelector('button,select'))?.focus({ preventScroll: true });
      }
    } else {
      if (action === 'disable') preferences.enabled = false;
      if (action === 'toggle') { if (!preferences.enabled) { preferences.enabled = true; preferences.collapsed = false; } else preferences.collapsed = !preferences.collapsed; }
      save(); sync(currentGame, moving);
      document.querySelector('[data-guide="toggle"]')?.focus({ preventScroll: true });
    }
  });
  storyDialog.addEventListener('cancel', event => { event.preventDefault(); finishStory(); });
  document.addEventListener('nika-voice-state', event => { document.querySelectorAll('.nika-character').forEach(el => el.classList.toggle('is-speaking', event.detail.speaking)); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAnimation(); else if (currentGame) sync(currentGame, moving); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) stopAnimation(); });
  return {
    sync,
    start(game) { currentGame = game; preferences = { enabled: true, collapsed: true, story: 0 }; save(); sync(game); },
  };
}
