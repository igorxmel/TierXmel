// Статистика. Не украшение, а диагностика собственной системы оценок:
// корреляция осей, инфляция шкалы, долг по разбору.
//
// Числа-вердикты вынесены в плитки, а не в графики: одно значение — это
// не график. Графики остались там, где есть распределение или связь.

import { escapeHtml, plural } from './filters.js';
import { routes } from './site.js';

// Ниже этого числа игр корреляция — шум, и показывать её вредно:
// на трёх точках легко получить «−0.09» и сделать из этого вывод.
const MIN_PAIRS = 12;

const SURFACE = '#0c0b0a';
const INK_MARK = '#9b9289';

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

function pearson(pairs) {
  if (pairs.length < MIN_PAIRS) return null;
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : null;
}

function correlationVerdict(r, count) {
  if (r === null) {
    return `Игр с обеими оценками пока ${count}. Корреляция станет осмысленной от ${MIN_PAIRS}, надёжной — ближе к тридцати.`;
  }
  const abs = Math.abs(r);
  if (abs > 0.9) return 'Оси почти дублируют друг друга: разбор по критериям не добавляет ничего к одному слайдеру кайфа. Систему можно упрощать.';
  if (abs > 0.75) return 'Оси связаны сильно, но не слепо. Разбор пока оправдан — но если связь дойдёт до 0.9, он перестанет окупаться.';
  return 'Оси несут разное: качество и личный кайф расходятся. Разбор по критериям работает.';
}

function kpi(value, label, note) {
  return `<div class="kpi">
    <span class="kpi__value">${value}</span>
    <span class="kpi__label">${escapeHtml(label)}</span>
    ${note ? `<span class="kpi__note">${escapeHtml(note)}</span>` : ''}
  </div>`;
}

/**
 * Связь двух оценок. Точки окрашены по тиру качества — цвет следует за игрой,
 * а не за её местом в выборке, поэтому фильтр не перекрашивает выживших.
 */
function scatter(games, index) {
  const { qualityMax, funMax } = index.meta.scale;
  const points = games.filter((game) => game.quality !== null && game.fun !== null);
  if (!points.length) return '<p class="note">Нет игр, у которых есть обе оценки.</p>';

  const W = 820;
  const H = 460;
  const pad = { l: 46, r: 20, t: 34, b: 46 };
  const px = (q) => pad.l + (q / qualityMax) * (W - pad.l - pad.r);
  const py = (f) => H - pad.b - (f / funMax) * (H - pad.t - pad.b);

  // Полосы тиров по оси качества заодно работают легендой цвета точек.
  const bands = index.meta.tiers
    .filter((tier) => tier.threshold > 0)
    .map((tier, at, list) => {
      const from = px((tier.threshold / 100) * qualityMax);
      const to = at === 0 ? px(qualityMax) : px((list[at - 1].threshold / 100) * qualityMax);
      return { tier, from, to };
    })
    .filter((band) => band.to - band.from > 1);

  const bandMarks = bands.map(({ tier, from, to }) => `
    <line x1="${from.toFixed(1)}" y1="${pad.t}" x2="${from.toFixed(1)}" y2="${H - pad.b}" class="grid"></line>
    <text x="${((from + to) / 2).toFixed(1)}" y="${H - pad.b + 17}" class="tick tick--strong" text-anchor="middle">${escapeHtml(tier.label)}</text>`).join('');

  const gridY = [0, 25, 50, 75, 100].map((value) => {
    const y = py(value);
    return `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" class="grid"></line>
      <text x="${pad.l - 10}" y="${(y + 4).toFixed(1)}" class="tick" text-anchor="end">${value}</text>`;
  }).join('');

  // 2px кольцо цветом подложки: точки накладываются, без него они слипаются в пятно.
  const dots = points.map((game) => `
    <a href="${routes.game(game.slug)}"
       data-title="${escapeHtml(game.title)}"
       data-q="${game.quality}" data-f="${game.fun}">
      <circle cx="${px(game.quality).toFixed(1)}" cy="${py(game.fun).toFixed(1)}" r="8"
              fill="${game.qualityTier?.color ?? INK_MARK}" stroke="${SURFACE}" stroke-width="2" class="dot"></circle>
    </a>`).join('');

  // Прямые подписи только у крайних случаев — подпись у каждой точки превращается в кашу.
  const notable = [...points]
    .map((game) => ({ game, gap: Math.abs(game.fun - (game.quality / qualityMax) * funMax) }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .map(({ game }) => {
      const x = px(game.quality);
      const anchor = x > W * 0.62 ? 'end' : 'start';
      const dx = anchor === 'end' ? -11 : 11;
      return `<text x="${(x + dx).toFixed(1)}" y="${(py(game.fun) + 4).toFixed(1)}" class="tick" text-anchor="${anchor}">${escapeHtml(game.title)}</text>`;
    }).join('');

  return `<div class="chart-wrap">
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img"
         aria-label="Точечный график: качество по горизонтали, кайф по вертикали">
      ${bandMarks}${gridY}
      <line x1="${pad.l}" y1="${H - pad.b}" x2="${W - pad.r}" y2="${H - pad.b}" class="axis-line"></line>
      <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${H - pad.b}" class="axis-line"></line>
      <text x="${W - pad.r}" y="${H - 8}" class="tick" text-anchor="end">качество, 0–${qualityMax}</text>
      <text x="${pad.l}" y="14" class="tick">кайф ↑</text>
      ${notable}
      ${dots}
    </svg>
    <div class="tip" id="tip" hidden></div>
  </div>`;
}

// Параметр намеренно не называется valueOf: он наследуется от Object.prototype,
// поэтому значение по умолчанию при деструктуризации никогда бы не сработало.
function bars(buckets, { labelOf, colorOf, countOf = (bucket) => bucket.count }) {
  const max = Math.max(1, ...buckets.map((bucket) => countOf(bucket)));
  const rows = buckets.map((bucket) => `
    <div class="hbar">
      <span class="hbar__label">${escapeHtml(labelOf(bucket))}</span>
      <span class="hbar__track"><span style="width:${(countOf(bucket) / max) * 100}%;background:${colorOf(bucket)}"></span></span>
      <span class="hbar__count">${countOf(bucket)}</span>
    </div>`).join('');
  return `<div class="hbars">${rows}</div>`;
}

function criterionValues(games, index) {
  const values = [];
  for (const game of games) {
    for (const [blockId, criteria] of Object.entries(game.blocks ?? {})) {
      if (!index.blocks.has(blockId)) continue;
      for (const value of Object.values(criteria)) {
        if (typeof value === 'number') values.push(value);
      }
    }
  }
  return values;
}

function profileTable(games) {
  const groups = new Map();
  for (const game of games) {
    for (const profile of game.profiles) {
      if (!groups.has(profile.id)) groups.set(profile.id, { profile, games: [] });
      groups.get(profile.id).games.push(game);
    }
  }

  const rows = [...groups.values()]
    .sort((a, b) => b.games.length - a.games.length)
    .map(({ profile, games: list }) => {
      const rated = list.filter((game) => game.quality !== null);
      const q = mean(rated.map((game) => game.quality));
      const f = mean(list.map((game) => game.fun).filter((value) => value !== null));
      return `<tr>
        <th>${escapeHtml(profile.label)}</th>
        <td class="num">${list.length}</td>
        <td class="num">${rated.length}</td>
        <td class="num">${q === null ? '—' : Math.round(q)}</td>
        <td class="num">${f === null ? '—' : Math.round(f)}</td>
      </tr>`;
    }).join('');

  return `<table class="breakdown">
    <thead><tr><th>Профиль</th><th class="num">Игр</th><th class="num">Разобрано</th><th class="num">Ср. качество</th><th class="num">Ср. кайф</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function inflationNote(avg) {
  if (avg === null) return 'Ни одна игра пока не разобрана по критериям.';
  if (avg > 7) return `Низ шкалы почти не используется. Это классическая инфляция: напомни себе, что 5 означает «ровно норма жанра», а не «плохо».`;
  if (avg < 4) return 'Ты строг заметно сильнее собственной нормы. Проверь, не считаешь ли «нормой жанра» что-то ниже пятёрки.';
  return 'Шкала используется в рабочем диапазоне.';
}

export function renderStats(container, games, index) {
  const { criterionMax, qualityMax } = index.meta.scale;
  const pairs = games
    .filter((game) => game.quality !== null && game.fun !== null)
    .map((game) => [game.quality, game.fun]);
  const r = pearson(pairs);

  const awaiting = games.filter((game) => game.quick);
  const values = criterionValues(games, index);
  const avg = mean(values);
  const rated = games.filter((game) => game.quality !== null);

  const tierBuckets = index.meta.tiers.map((tier) => ({
    tier,
    count: games.filter((game) => game.qualityTier?.id === tier.id).length,
  }));

  const valueBuckets = Array.from({ length: criterionMax + 1 }, (_, value) => ({
    value,
    count: values.filter((item) => item === value).length,
  }));

  container.innerHTML = `
    <div class="kpis">
      ${kpi(rated.length, 'разобрано подробно', `${games.length} ${plural(games.length, 'игра', 'игры', 'игр')} всего`)}
      ${kpi(r === null ? '—' : r.toFixed(2), 'корреляция осей', r === null ? `нужно от ${MIN_PAIRS} игр` : 'качество против кайфа')}
      ${kpi(avg === null ? '—' : avg.toFixed(1), 'средний критерий', `из ${criterionMax}, норма жанра — 5`)}
      ${kpi(awaiting.length, 'ждут разбора', awaiting.length ? 'оценены только кайфом' : 'долгов нет')}
    </div>

    <section class="stat">
      <div class="stat__head">
        <h2>Качество против кайфа</h2>
        <p class="note">
          Левый верх — «кривое, но любимое». Правый низ — «сделано хорошо, но не моё».
          ${escapeHtml(correlationVerdict(r, pairs.length))}
        </p>
      </div>
      <div class="figure">${scatter(games, index)}</div>
    </section>

    <section class="stat">
      <div class="stat__head">
        <h2>Распределение по тирам</h2>
        <p class="note">Если всё скучилось в двух рядах — пороги в <code>data/meta.json</code> пора двигать.</p>
      </div>
      ${bars(tierBuckets, {
        labelOf: (bucket) => `${bucket.tier.label} · ${bucket.tier.desc}`,
        colorOf: (bucket) => bucket.tier.color,
      })}
    </section>

    <section class="stat">
      <div class="stat__head">
        <h2>Как используется шкала критерия</h2>
        <p class="note">${avg === null ? '' : `Средняя оценка критерия — <b>${avg.toFixed(2)}</b>. `}${escapeHtml(inflationNote(avg))}</p>
      </div>
      ${bars(valueBuckets, {
        labelOf: (bucket) => `${bucket.value} — ${index.meta.scaleAnchors[String(bucket.value)]}`,
        colorOf: () => INK_MARK,
      })}
    </section>

    <section class="stat">
      <div class="stat__head">
        <h2>Долг по разбору</h2>
        <p class="note">${awaiting.length
          ? `${awaiting.length} ${plural(awaiting.length, 'игра оценена', 'игры оценены', 'игр оценены')} быстро и ${plural(awaiting.length, 'ждёт', 'ждут', 'ждут')} подробного разбора.`
          : 'Все оценённые игры разобраны подробно.'}</p>
      </div>
      <div class="awaiting">${awaiting
        .map((game) => `<a class="chip" href="${routes.game(game.slug)}">${escapeHtml(game.title)}</a>`)
        .join('')}</div>
    </section>

    <section class="stat">
      <div class="stat__head">
        <h2>По жанровым профилям</h2>
        <p class="note">Баллы собраны по разным весам, поэтому средние между строками сравнимы лишь приблизительно — это срез «чего я вообще играю», а не рейтинг жанров.</p>
      </div>
      ${profileTable(games)}
    </section>`;

  bindScatterTooltip(container, qualityMax);
}

/** Наведение на точку: подпись у каждой точки нечитаема, всплывающая — читается. */
function bindScatterTooltip(container, qualityMax) {
  const wrap = container.querySelector('.chart-wrap');
  const tip = container.querySelector('#tip');
  if (!wrap || !tip) return;

  for (const link of wrap.querySelectorAll('svg a')) {
    link.addEventListener('mouseenter', () => {
      tip.hidden = false;
      tip.innerHTML = `<b>${link.dataset.title}</b><span>качество ${link.dataset.q} из ${qualityMax} · кайф ${link.dataset.f} из 100</span>`;
    });
    link.addEventListener('mouseleave', () => { tip.hidden = true; });
  }

  wrap.addEventListener('mousemove', (event) => {
    const box = wrap.getBoundingClientRect();
    tip.style.left = `${event.clientX - box.left}px`;
    tip.style.top = `${event.clientY - box.top}px`;
  });
}
