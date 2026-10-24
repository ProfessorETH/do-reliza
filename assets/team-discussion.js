import { AGENTS } from '../data.js';

// Opinions, not hints from an omniscient narrator. Some assumptions are wrong.
export const OPINIONS = {
  mira: {
    scope: ['focus', 'У нас ещё первый экран толком не читается, а мы уже щит придумываем. Я бы сначала сделала так, чтобы человек понял, куда лететь. Щит подождёт следующей версии.'],
    review: ['review-pair', 'Если корабль летает сквозь камни, игрок решит, что так и надо. Давайте заодно проверим край карты. Жалко два часа, но объяснять сломанные правила на показе мне ещё меньше хочется.'],
    bug: ['cut', 'А нам точно нужно сохранение для короткого фестивального забега? Можно честно написать: одна попытка, без продолжения. Мне кажется, сейчас это разумнее, чем чинить всё в последний вечер.'],
  },
  pixel: {
    scope: ['shield', 'Со щитом хотя бы будет момент: бац, астероид, а ты выжил! Я за. Правда, готового кода у меня нет — придётся выкраивать время из основной работы. Но на показе это может выстрелить.'],
    review: ['review-skip', 'Слушай, а если пока оставить? Корабль же летает, батареи собираются. На показе можно облететь этот камень. Я бы лучше допилил эффекты, чем сейчас полез в движение.'],
    bug: ['ignore', 'У меня в открытой вкладке всё на месте. Может, это просто старый запуск? Я бы пока не трогал сохранение: полезем — ещё что-нибудь уроним. Хотя после перезапуска я сам не проверял.'],
  },
  nord: {
    scope: ['focus', 'Щит — это не только кнопка. Нужно решить, сколько он держится и что будет при втором ударе. Мы это ещё даже не обсудили. Я за то, чтобы закончить обещанное, а новую механику оценить отдельно.'],
    review: ['review-pair', 'Мы сначала меняем координату, потом спрашиваем, можно ли туда лететь. Я бы разобрал движение вместе: поправим столкновение и поставим защиту на границе. Два часа. Быстрее обещать не буду.'],
    bug: ['fix', 'Мы обещали продолжение после перезапуска. Сейчас его нет. Я за исправление, даже если сдвинем показ. Только учти: это два часа и полторы тысячи из резерва, они уже никуда больше не пойдут.'],
  },
  iskra: {
    scope: ['shield', 'Я хочу щит! Тогда можно рискнуть и пролететь там, где без него страшно. Но да, код займёт больше времени. Если берёмся, мне нужно разрешение отложить остальное, а не ещё одна задача сверху.'],
    review: ['review-fix', 'Вижу, где переставить проверку. Дай час — корабль перестанет проходить сквозь камни. Край карты сейчас не трогаю: это отдельная история. Мне кажется, для первого показа хватит этого.'],
    bug: ['fix', 'Давай починим. Я сама злюсь, когда всё собранное исчезает. Очень хочется сказать «там пара строк», но потом ещё перезапуск проверять. Ладно, закладывай два часа, а не мои оптимистичные пять минут.'],
  },
  saga: {
    scope: ['focus', 'А щит от одного камня спасает или от всех? Если его взять на последнем ходу, что случится? У нас пока даже ответов нет. Я бы не тащила новую механику в завтрашний показ.'],
    review: ['review-pair', 'Камень — только половина истории. Что будет, если улететь за карту? Я за совместный разбор обоих случаев. Он длиннее, зато не придётся говорить игроку «туда, пожалуйста, не нажимай».'],
    bug: ['fix', 'Проверка в той же вкладке ничего не доказывает. Нужно собрать энергию, закрыть игру и открыть заново. Я за исправление: иначе человек решит, что сам что-то сделал не так.'],
  },
  echo: {
    scope: ['focus', 'Клуб просил собрать батареи и долететь до станции. Про щит договорились только что. Я бы сказал им: идея хорошая, вернёмся после фестиваля. Сейчас давайте выполним то, ради чего нас позвали.'],
    review: ['review-fix', 'Главное правило сейчас — камни нельзя пролетать насквозь. Предлагаю исправить именно это за час. Норд прав про край карты, но ещё час тоже откуда-то надо взять. Что для показа важнее?'],
    bug: ['cut', 'Можно позвонить клубу и договориться об одной короткой попытке без сохранений. Это хуже обещанного, зато честно и без задержки. Я бы выбрал так, если исправление съест последние деньги.'],
  },
};

export const DECISION_EVIDENCE = {
  scope: 'Разложили идею: щиту нужны новые правила и ещё два часа объёма кода. Вариант с упрощением оформления добавляет один час, но отнимает 12 пунктов визуала. В исходном заказе щита нет. Игрок сможет закончить маршрут и без него.',
  review: 'Разобрали два хода: в клетку с астероидом и за край карты. Перестановка проверки закрывает первый случай за час. Совместный разбор занимает два часа и добавляет защиту границы. Облёт камня на показе ошибку не исправляет.',
  bug: 'Сверили сценарии: открытая вкладка хранит энергию, но после перезапуска она теряется. Исправление стоит два часа и 1 500 ₽. Честный отказ от сохранения убирает обещание продолжить; игнорирование оставляет сломанную функцию.',
};

export function discussionSpeakers(s) {
  if (!Object.hasOwn(DECISION_EVIDENCE,s.currentEvent)) return [];
  const event = s.currentEvent;
  const primary = s.assignments[event === 'bug' ? 'qa' : event === 'review' ? 'code' : 'brief'];
  const available = s.team.filter(id => OPINIONS[id]?.[event] && !s.life?.members[id]?.restTrip && !s.life?.members[id]?.breaks);
  const first = available.includes(primary) ? primary : available[0];
  if (!first) return [];
  const second = available.find(id => id !== first && OPINIONS[id][event][0] !== OPINIONS[first][event][0]) || available.find(id => id !== first);
  return [first, second].filter(Boolean).map(id => ({id, kind:event, option:OPINIONS[id][event][0]}));
}

export function studyDecision(s) {
  if (s.stage !== 'event' || !Object.hasOwn(DECISION_EVIDENCE,s.currentEvent)) return 'Сейчас нечего разбирать.';
  s.discussions ??= {};
  if (s.discussions[s.currentEvent]?.checked) return 'Этот случай уже разобрали.';
  s.discussions[s.currentEvent] = {checked:true};
  s.time += 1;
  s.log.push(`Разбор с командой (+1 ч): ${DECISION_EVIDENCE[s.currentEvent]}`);
  return null;
}

const clamp = value => Math.max(0, Math.min(100, value));
export function recordDiscussion(s, event, option, before) {
  const checked = Boolean(s.discussions?.[event]?.checked);
  const speakers = discussionSpeakers(s);
  const responses = speakers.map(({id, option:proposal}) => {
    const agreed = proposal === option;
    // Disagreement after an explanation feels different from being brushed off.
    const morale = agreed ? 3 : checked ? 1 : -2;
    const stress = agreed || checked ? -2 : 2;
    const member = s.life.members[id];
    const old = {morale:member.morale, stress:member.stress};
    member.morale = clamp(member.morale + morale); member.stress = clamp(member.stress + stress);
    return {id, kind:agreed?'agree':checked?'reconsider':'disagree', option:proposal, morale:member.morale-old.morale, stress:member.stress-old.stress};
  });
  const effects = {time:s.time-before.time, budget:s.budget-before.budget, trust:s.trust-before.trust};
  s.discussions ??= {};
  s.discussions[event] = {checked, option, responses, effects, outcome:s.log.at(-1)};
  for (const r of responses) s.log.push(`${AGENTS.find(a=>a.id===r.id).name}: ${r.kind==='agree'?'поддерживает решение':r.kind==='reconsider'?'принимает доводы после разбора':'возражает против решения'} (настроение ${r.morale>=0?'+':''}${r.morale}, напряжение ${r.stress>=0?'+':''}${r.stress}).`);
}

export function validDiscussions(s) {
  if (s.discussions === undefined) return true; // Saves made before discussions.
  const value=s.discussions;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([event,row]) => {
    if (!Object.hasOwn(DECISION_EVIDENCE,event) || !row || typeof row.checked !== 'boolean') return false;
    if (row.option === undefined) return row.checked && s.currentEvent === event;
    const options = new Set(Object.values(OPINIONS).map(voice=>voice[event][0]));
    // The scope compromise is a player proposal, rather than a developer preference.
    if (event === 'scope') options.add('swap');
    return options.has(row.option) && s.choices?.[event] === row.option && Array.isArray(row.responses) && row.responses.length <= 2
      && row.responses.every(r=>r && s.team.includes(r.id) && ['agree','disagree','reconsider'].includes(r.kind) && OPINIONS[r.id]?.[event]?.[0] === r.option && r.kind === (r.option === row.option?'agree':row.checked?'reconsider':'disagree') && Number.isInteger(r.morale) && Math.abs(r.morale)<=3 && Number.isInteger(r.stress) && Math.abs(r.stress)<=2)
      && new Set(row.responses.map(r=>r.id)).size === row.responses.length
      && (row.outcome===undefined || typeof row.outcome==='string' && row.outcome.length<1000)
      && row.effects && Number.isInteger(row.effects.time) && row.effects.time>=0 && row.effects.time<=2
      && Number.isInteger(row.effects.budget) && row.effects.budget>=-2000 && row.effects.budget<=0
      && Number.isFinite(row.effects.trust) && row.effects.trust>=-24 && row.effects.trust<=7;
  });
}
