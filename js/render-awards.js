// Доска почёта. Уникальные бейджи — личная премия: место одно, его надо отбирать.

import { escapeHtml } from './filters.js';
import { badgeIcon } from './icons.js';
import { gameTile } from './render-tier.js';

function section(title, note, badges, holders, axis) {
  if (!badges.length) return '';

  const rows = badges.map((badge) => {
    const owners = holders.get(badge.id) ?? [];
    const tone = badge.negative ? '#b9a9a2' : badge.unique ? '#ece4cf' : '#9b9289';
    const body = owners.length
      ? owners.map((game) => gameTile(game, axis).outerHTML).join('')
      : '<span class="row__empty">никому не вручён</span>';

    return `<section class="row" style="--tier:${tone}">
      <div class="row__head">
        <span class="row__label row__label--word">${badgeIcon(badge)}${escapeHtml(badge.label)}</span>
        <span class="row__desc">${badge.unique ? 'место одно' : 'без ограничений'}</span>
        <span class="row__count">${owners.length}</span>
      </div>
      <div class="row__body">${body}</div>
    </section>`;
  }).join('');

  return `<section class="awards-section">
    <div class="awards-section__intro">
      <h2 class="page-title" style="font-size:clamp(22px,3vw,30px)">${escapeHtml(title)}</h2>
      <p class="note">${escapeHtml(note)}</p>
    </div>
    <div class="grid">${rows}</div>
  </section>`;
}

export function renderAwards(container, games, index, axis = 'quality') {
  const holders = new Map();
  for (const game of games) {
    for (const badgeId of game.badges ?? []) {
      if (!holders.has(badgeId)) holders.set(badgeId, []);
      holders.get(badgeId).push(game);
    }
  }
  for (const list of holders.values()) {
    list.sort((a, b) => (b.quality ?? b.fun ?? 0) - (a.quality ?? a.fun ?? 0));
  }

  const all = index.meta.badges;
  container.innerHTML = [
    section('GOAT', 'Уникальные награды: держатель ровно один. Чтобы вручить новой игре, приходится отобрать у прежней — поэтому они и стоят чего-то.',
      all.filter((badge) => badge.unique && !badge.negative), holders, axis),
    section('Отличия', 'Неуникальные: вручаются всем, кто заслужил.',
      all.filter((badge) => !badge.unique && !badge.negative), holders, axis),
    section('Антинаграды', 'За то, чем игра обидела лично меня. Низкая оценка говорит «плохо», антинаграда говорит «чем именно».',
      all.filter((badge) => badge.negative), holders, axis),
  ].join('');
}
