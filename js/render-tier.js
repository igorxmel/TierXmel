// Сетка тиров. Пустые ряды не скрываются — пустой SSS это обещание, а не баг.
//
// Ряд построен не как цветная коробка, а как типографская полка: крупная буква
// тира слева, тонкая линия сверху, плитки справа. Цвет есть только у буквы,
// поэтому девять рядов читаются как шкала, а не как гирлянда.

import { axisValue, axisTier } from './score.js';
import { escapeHtml } from './filters.js';
import { icon, badgeIcon } from './icons.js';

export function gameTile(game, axis) {
  const value = axisValue(game, axis);
  const tile = document.createElement('a');
  tile.className = 'tile';
  tile.href = `game.html?g=${encodeURIComponent(game.slug)}`;
  if (game.quick) tile.classList.add('tile--quick');

  // Без обложки название печатается прямо на плитке — подпись снизу тогда не нужна.
  const art = game.cover
    ? `<img class="tile__cover" src="${escapeHtml(game.cover)}" alt="" loading="lazy">`
    : `<span class="tile__fallback">${escapeHtml(game.title)}</span>`;

  const badges = game.badgeList
    .map((badge) => {
      const kind = badge.negative ? 'tile__badge--neg' : badge.unique ? 'tile__badge--uniq' : '';
      return `<span class="tile__badge ${kind}" title="${escapeHtml(badge.label)}">${badgeIcon(badge)}</span>`;
    })
    .join('');

  tile.innerHTML = `
    <span class="tile__art">
      ${art}
      ${badges ? `<span class="tile__badges">${badges}</span>` : ''}
      ${value !== null ? `<span class="tile__value">${value}</span>` : ''}
      ${game.quick ? `<span class="tile__bolt" title="Быстрая оценка, ждёт подробного разбора">${icon('bolt')}</span>` : ''}
    </span>
    ${game.cover ? `<span class="tile__title">${escapeHtml(game.title)}</span>` : ''}
  `;

  tile.title = [game.title, game.year, game.verdict].filter(Boolean).join(' · ');
  return tile;
}

function shelf({ label, desc, count, games, axis, modifier = '', longLabel = false }) {
  const row = document.createElement('section');
  row.className = `row ${modifier}`.trim();

  const head = document.createElement('div');
  head.className = 'row__head';
  head.innerHTML = `
    <span class="row__label${longLabel ? ' row__label--word' : ''}">${escapeHtml(label)}</span>
    ${desc ? `<span class="row__desc">${escapeHtml(desc)}</span>` : ''}
    <span class="row__count">${count}</span>
  `;

  const body = document.createElement('div');
  body.className = 'row__body';
  for (const game of games) body.append(gameTile(game, axis));

  row.append(head, body);
  return { row, body };
}

export function renderTierGrid(container, games, axis, index, extras = {}) {
  container.innerHTML = '';

  const buckets = new Map(index.meta.tiers.map((tier) => [tier.id, []]));
  for (const game of games) {
    const tier = axisTier(game, axis);
    if (tier) buckets.get(tier.id)?.push(game);
  }

  for (const tier of index.meta.tiers) {
    const bucket = buckets.get(tier.id) ?? [];
    bucket.sort((a, b) => (axisValue(b, axis) ?? 0) - (axisValue(a, axis) ?? 0));

    const { row, body } = shelf({
      label: tier.label,
      desc: tier.desc,
      count: bucket.length,
      games: bucket,
      axis,
      longLabel: tier.label.length > 4,
    });
    row.style.setProperty('--tier', tier.color);

    if (!bucket.length) {
      const note = document.createElement('span');
      note.className = 'row__empty';
      note.textContent = tier.emptyNote ?? 'пусто';
      body.append(note);
    }
    container.append(row);
  }

  if (extras.awaiting?.length) {
    const { row } = shelf({
      label: 'Ждут разбора',
      desc: 'оценены быстро, подробный разбор впереди',
      count: extras.awaiting.length,
      games: extras.awaiting,
      axis: 'fun',
      modifier: 'row--aside',
      longLabel: true,
    });
    container.append(row);
  }

  if (extras.unrated?.length) {
    const { row } = shelf({
      label: 'Без оценки',
      desc: 'дропы, бэклог и то, что оценивать не стал',
      count: extras.unrated.length,
      games: extras.unrated,
      axis,
      modifier: 'row--aside',
      longLabel: true,
    });
    container.append(row);
  }
}
