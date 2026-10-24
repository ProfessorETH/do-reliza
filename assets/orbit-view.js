import { rocks, batteriesFor, orbitFeatures, outsideOrbit } from './orbit.js';

export function renderOrbit(game, flight, { icon, design, message = '', effect = {}, stored = false }) {
  const { decorated, edgeGuard, saveMode } = orbitFeatures(game, design);
  const batteries = batteriesFor(game), ready = flight.collected.length === 3;
  const shieldText = flight.shield ? 'Щит активен · 1 / 1' : game.shield ? 'Щит израсходован · 0 / 1' : 'Без щита · отложен командой';
  const shieldReason = game.choices.scope === 'swap' ? 'Команда заменила часть оформления на защиту.'
    : game.shield ? 'Команда добавила защиту за 2 000 ₽.' : 'Команда сохранила основной объём релиза.';
  const saveTitle = saveMode === 'removed' ? 'Одна сессия · без сохранения'
    : saveMode === 'broken' ? 'Ошибка записи · прогресс не сохранён'
      : stored ? `Сохранено · ${flight.collected.length} / 3 батареи` : 'Браузер не смог записать прогресс';
  const saveDetail = saveMode === 'working' && stored ? `Клетка ${flight.x + 1}:${flight.y + 1} · щит ${flight.shield ? '1' : '0'}. Можно закрыть игру и продолжить.`
    : saveMode === 'removed' ? 'Команда убрала сохранение. Закончите маршрут до закрытия игры.'
      : saveMode === 'broken' ? 'Команда выпустила известный баг. Перезапуск вернёт корабль на старт и уберёт собранные батареи.'
        : 'Сохранение исправлено командой, но недоступно в этом браузере. Не закрывайте полёт.';
  const contract = { festival: 'Фестиваль', club: 'Исследователи', cup: 'Кубок пилотов' }[game.life?.contract] || 'Фестиваль';
  const tile = i => {
    const x = i % 7, y = Math.floor(i / 7), key = `${x},${y}`;
    const ship = flight.x === x && flight.y === y, rock = rocks.has(key), end = x === 6 && y === 4;
    const batteryIndex = batteries.indexOf(key), bat = batteryIndex !== -1 && !flight.collected.includes(key);
    const hit = effect.cell === key && ['blocked','phase','shield-hit','edge'].includes(effect.kind);
    const label = ship ? `${flight.shield ? 'Корабль под щитом' : 'Корабль'}${rock ? ', внутри астероида' : ''}`
      : rock ? 'Астероид' : end ? (ready ? 'Станция готова принять энергию' : 'Станция ждёт три батареи') : bat ? `Батарея ${batteryIndex+1}` : 'Космос';
    const classes = ['tile', ship && 'ship', ship && flight.shield && 'shielded', rock && 'rock', end && 'station', bat && 'battery',
      hit && `impact-${effect.kind}`, ship && rock && game.wallBug && 'collision-bug', end && ready && 'station-ready'].filter(Boolean).join(' ');
    const asteroid = decorated ? '<svg class="orbit-rock" viewBox="0 0 40 40" aria-hidden="true"><path d="m10 3 17 2 10 12-5 16-16 5L3 27 2 13z"/><circle cx="14" cy="14" r="4"/><circle cx="26" cy="25" r="5"/></svg>' : '<span class="orbit-rock" aria-hidden="true">◆</span>';
    const scenery = rock ? asteroid : bat ? `<span class="orbit-battery" aria-hidden="true">${icon('bolt',23)}</span>${decorated?`<small class="orbit-map-label" aria-hidden="true">${batteryIndex+1}</small>`:''}`
      : end ? `<span class="orbit-station" aria-hidden="true">${icon('flag',24)}</span>${decorated?`<span class="orbit-dock-lights" aria-hidden="true">${[0,1,2].map(n=>`<i class="${n<flight.collected.length?'lit':''}"></i>`).join('')}</span>`:''}` : '<span class="orbit-star" aria-hidden="true">·</span>';
    return `<button class="${classes}" data-action="tile" data-x="${x}" data-y="${y}" aria-label="${label}, ${x+1}, ${y+1}">${scenery}${ship?`<span class="orbit-ship" aria-hidden="true">${icon('rocket',30)}</span>`:''}${ship&&flight.shield?'<span class="orbit-shield-ring" aria-hidden="true"></span>':''}${ship&&rock&&game.wallBug?'<span class="orbit-bug-mark" aria-hidden="true">!</span>':''}${hit&&effect.kind==='blocked'?'<span class="orbit-block-mark" aria-hidden="true">×</span>':''}</button>`;
  };
  const direction = (dir, dx, dy, label, arrow) => `<button class="secondary" data-action="move" data-dir="${dir}" aria-label="${label}${edgeGuard&&outsideOrbit(flight.x+dx,flight.y+dy)?' · граница карты':''}" ${flight.won || (edgeGuard&&outsideOrbit(flight.x+dx,flight.y+dy))?'disabled':''}>${arrow}</button>`;
  return `<button class="icon-btn dialog-close" data-action="close-dialog" aria-label="Закрыть игру">${icon('cross')}</button>
    <div class="mini-game ${decorated?'polished':'simple'}" data-save-mode="${saveMode}">
      <div class="eyebrow">ИГРА ВАШЕЙ КОМАНДЫ · ${contract}</div>
      <h2 id="dialog-title">ОРБИТА <span>0${flight.collected.length} / 03</span></h2>
      <p>${flight.won?'Станция получила энергию. Миссия выполнена!':'Соберите 3 батареи и доберитесь до станции справа внизу.'}</p>
      <div class="orbit-shield ${flight.shield?'charged':''}">${icon('shield',32)}<div><strong>${shieldText}</strong><span>${shieldReason} ${game.shield?'Щит автоматически защищает при одном столкновении.':''}</span></div></div>
      <div class="orbit-map-heading"><span>${decorated?'Навигация и оформление команды':game.choices.scope==='swap'?'Простой интерфейс · вместо оформления выбран щит':'Базовое оформление команды'}</span>${edgeGuard?'<b>Защита границы</b>':''}</div>
      <div class="mini-board ${edgeGuard?'edge-tested':''} ${effect.kind==='edge'?'edge-contact':''}" role="group" aria-label="Карта. Управление стрелками клавиатуры или соседними клетками.">${Array.from({length:35},(_,i)=>tile(i)).join('')}</div>
      <div class="orbit-feedback ${['phase','blocked','lost'].includes(effect.kind)?'orbit-warning':''}" role="status">${message || (flight.won?'Миссия выполнена!':edgeGuard?'Выход за карту заблокирован: недоступные направления выключены.':'Корабль готов. Выбери направление.')}</div>
      <div class="mini-controls">${direction('left',-1,0,'Влево','←')}<div>${direction('up',0,-1,'Вверх','↑')}${direction('down',0,1,'Вниз','↓')}</div>${direction('right',1,0,'Вправо','→')}<p>Стрелки или соседняя клетка.</p></div>
      <div class="orbit-save ${saveMode==='broken'||(saveMode==='working'&&!stored)?'orbit-save-error':''}" role="status">${icon(saveMode==='working'&&stored?'check':saveMode==='removed'?'info':'cross',26)}<div><strong>${saveTitle}</strong><span>${saveDetail}</span></div></div>
      ${flight.won?'<div class="mini-win">Маршрут завершён. Ваша команда сделала работающую игру!</div>':''}
      <div class="dialog-actions">${saveMode!=='removed'?`<button class="secondary" data-action="reload-mini">${icon('reset',15)} ${saveMode==='working'?'Загрузить сохранение':'Перезапустить игру'}</button>`:''}<button class="secondary" data-action="fresh-mini">${saveMode==='removed'?'Начать сессию заново':'Новый полёт'}</button><button class="primary" data-action="close-dialog">В студию</button></div>
    </div>`;
}
