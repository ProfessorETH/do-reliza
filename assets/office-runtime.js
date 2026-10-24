import { positionFallbackFeedback } from './scene-feedback.js';
// Keep Three.js and GLB downloads out of the lightweight mode and start screen.
const currentURL = new URL(globalThis.location?.href ?? 'http://localhost/');
const parameters = currentURL.searchParams;
const preferenceKey = 'before-release-graphics-v1';
let mode = parameters.get('graphics');
try {
  if (mode === 'lite' || mode === '3d') localStorage.setItem(preferenceKey, mode);
  else mode = localStorage.getItem(preferenceKey);
} catch { /* URL selection also works when browser storage is unavailable. */ }
mode = mode === 'lite' ? 'lite' : '3d';
let runtime, pending, generation = 0, importFailed = false;

function settleFallback(game, callbacks, ticket) {
  queueMicrotask(() => {
    if (ticket !== generation) return;
    callbacks.onBusy(false);
    for (const id of game.team) {
      if (ticket !== generation) return;
      const phase = game.life?.members[id]?.restTrip?.phase;
      if (phase === 'outbound' || phase === 'returning') callbacks.onRest?.(id, phase === 'outbound' ? 'resting' : 'back');
    }
  });
}

export function graphicsSettingsHTML() {
  const link = value => {
    const url = new URL(currentURL);
    url.searchParams.set('graphics', value);
    return `${url.pathname}${url.search}${url.hash}`.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  };
  return `<div class="graphics-settings" aria-label="Графика"><span>Вид офиса</span><a href="${link('3d')}" ${mode === '3d' ? 'aria-current="true"' : ''}>3D</a><a href="${link('lite')}" ${mode === 'lite' ? 'aria-current="true"' : ''}>Облегчённый</a><small>Если тормозит — выбери облегчённый вид. Смена вида перезагрузит страницу; сохранённая партия останется.</small></div>`;
}

export function mountOfficeWorld(game, selected, callbacks) {
  const container = document.querySelector('#office-webgl');
  if (!container) return;
  const ticket = ++generation;
  const room = container.closest('.office-room');
  room.insertAdjacentHTML('afterend', graphicsSettingsHTML());
  if (mode === 'lite' || importFailed) {
    room.dataset.officeState = 'fallback';
    room.querySelector('.office-render-status').textContent = importFailed
      ? '3D недоступно. Можно играть в облегчённом офисе.'
      : 'Облегчённый офис · 3D-модели не загружаются';
    requestAnimationFrame(()=>positionFallbackFeedback(room));
    settleFallback(game, callbacks, ticket);
    return;
  }
  if (runtime) { runtime.mountOfficeWorld(game, selected, callbacks); return; }
  pending ??= import('../office-world.js?v=team-hud-20261024');
  callbacks.onBusy(true);
  pending.then(module => {
    runtime = module;
    if (ticket === generation && container.isConnected) runtime.mountOfficeWorld(game, selected, callbacks);
  }).catch(() => {
    importFailed = true;
    if (ticket !== generation || !container.isConnected) return;
    room.dataset.officeState = 'fallback';
    room.querySelector('.office-render-status').textContent = '3D недоступно. Можно играть в облегчённом офисе.';
    requestAnimationFrame(()=>positionFallbackFeedback(room));
    settleFallback(game, callbacks, ticket);
  });
}

export function detachOfficeWorld() { generation++; runtime?.detachOfficeWorld(); }
export const resetOfficeWorld = () => runtime?.resetOfficeWorld();
export const officeCamera = action => runtime?.officeCamera(action);
export const canWalkTo = (id, point) => runtime?.canWalkTo(id, point) ?? false;
