// Карточка игры: обе оси, разбор по блокам с раскладкой бюджетов, бейджи, рецензия.
// Раскладка бюджетов показывается всегда — должно быть видно, из чего собрался балл.

import { criteriaFor } from './score.js';
import { escapeHtml } from './filters.js';
import { badgeIcon } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { asset, routes } from './site.js';

function scoreBox(label, value, max, tier, note) {
  if (value === null) {
    return `<div class="score score--empty">
      <span class="score__label">${escapeHtml(label)}</span>
      <span class="score__none">${escapeHtml(note ?? 'нет оценки')}</span>
    </div>`;
  }
  return `<div class="score" style="--tier:${tier?.color ?? 'var(--line)'}">
    <span class="score__label">${escapeHtml(label)}</span>
    <span class="score__value">${value}<small>/${max}</small></span>
    ${tier ? `<span class="score__tier">${escapeHtml(tier.label)} · ${escapeHtml(tier.desc)}</span>` : ''}
  </div>`;
}

function metaRow(game, index) {
  const items = [];
  if (game.year) items.push(String(game.year));
  if (game.developer) items.push(game.developer);
  if (game.statusMeta) items.push(game.statusMeta.label);
  if (game.hours) items.push(`${game.hours} ч`);
  if (game.finishedAt) items.push(game.finishedAt);
  items.push(game.profiles.map((profile) => profile.label).join(' + '));
  return items.map((item) => `<span>${escapeHtml(item)}</span>`).join('');
}

/**
 * Округление слагаемых так, чтобы их сумма сходилась с итогом.
 * Иначе независимое округление даёт «577» в столбце при итоге 578 — выглядит как ошибка.
 */
function roundedPoints(parts, total) {
  const active = parts.filter((part) => part.active);
  const floors = active.map((part) => Math.floor(part.points));
  let left = total - floors.reduce((a, b) => a + b, 0);

  const order = active
    .map((part, at) => ({ at, rest: part.points - Math.floor(part.points) }))
    .sort((a, b) => b.rest - a.rest);

  for (const item of order) {
    if (left <= 0) break;
    floors[item.at] += 1;
    left -= 1;
  }

  const result = new Map();
  active.forEach((part, at) => result.set(part.blockId, floors[at]));
  return result;
}

function breakdownTable(game, index) {
  if (game.quality === null) return '';

  const points = roundedPoints(game.breakdown, game.quality);

  const rows = game.breakdown.map((part) => {
    const block = index.blocks.get(part.blockId);
    if (!part.active) {
      return `<tr class="off">
        <th>${escapeHtml(block.label)}</th>
        <td colspan="4">блок отключён — его ${Math.round(part.budget)} баллов ушли остальным</td>
      </tr>`;
    }
    const share = (part.fraction * 10).toFixed(1);
    return `<tr>
      <th>${escapeHtml(block.label)}</th>
      <td class="num">${share}<small>/10</small></td>
      <td class="bar"><span style="width:${(part.fraction * 100).toFixed(1)}%"></span></td>
      <td class="num">${Math.round(part.effectiveBudget)}<small> макс.</small></td>
      <td class="num strong">${points.get(part.blockId)}</td>
    </tr>`;
  }).join('');

  return `<table class="breakdown">
    <thead><tr><th>Блок</th><th>Оценка</th><th></th><th>Бюджет</th><th>Баллы</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><th>Итого</th><td colspan="3"></td><td class="num strong">${game.quality}</td></tr></tfoot>
  </table>`;
}

function criteriaList(game, index) {
  if (!game.blocks) return '';

  return index.blockOrder.map((blockId) => {
    const data = game.blocks[blockId];
    if (!data) return '';
    const block = index.blocks.get(blockId);
    const criteria = criteriaFor(blockId, game.profiles, index);
    const items = criteria.map((crit) => {
      const value = data[crit.id];
      if (value === undefined) return '';
      if (value === null) {
        return `<li class="crit-item crit-item--na"><span>${escapeHtml(crit.label)}</span><em>н/д</em></li>`;
      }
      return `<li class="crit-item" title="${escapeHtml(crit.hint ?? '')}">
        <span>${escapeHtml(crit.label)}</span>
        <span class="crit-item__bar"><span style="width:${value * 10}%"></span></span>
        <b>${value}</b>
      </li>`;
    }).join('');
    if (!items) return '';
    return `<section class="crit-group"><h3>${escapeHtml(block.label)}</h3><ul>${items}</ul></section>`;
  }).join('');
}

export function renderCard(container, game, index, review) {
  const { qualityMax, funMax } = index.meta.scale;

  const badges = game.badgeList.map((badge) => `
    <span class="award${badge.negative ? ' award--neg' : ''}${badge.unique ? ' award--uniq' : ''}">
      ${badgeIcon(badge)}${escapeHtml(badge.label)}
    </span>`).join('');

  const quickNote = game.quick
    ? '<p class="banner banner--quick">⚡ Быстрая оценка: только кайф и вердикт. Подробный разбор впереди.</p>'
    : '';

  const incompleteNote = game.incomplete
    ? `<p class="banner banner--warn">Разбор неполный: покрытие ${(game.coverage * 100).toFixed(0)}% ниже порога ${(index.meta.scale.minCoverage * 100).toFixed(0)}%. В тирлист по качеству игра не попадает.</p>`
    : '';

  container.innerHTML = `
    <article class="card">
      <header class="card__head">
        <div class="card__art">
          ${game.cover
            ? `<img src="${escapeHtml(asset(game.cover))}" alt="">`
            : `<span class="card__noart">${escapeHtml(game.title)}</span>`}
        </div>
        <div class="card__intro">
          <h1 class="card__title">${escapeHtml(game.title)}</h1>
          <div class="card__meta">${metaRow(game, index)}</div>
          ${game.verdict ? `<p class="verdict">«${escapeHtml(game.verdict)}»</p>` : ''}
          ${game.recommendationMeta
            ? `<p class="rec" style="--tier:${game.recommendationMeta.color}">${escapeHtml(game.recommendationMeta.label)}</p>`
            : ''}
          ${badges ? `<div class="awards">${badges}</div>` : ''}
          <div class="tags">${(game.tags ?? []).map((tag) => `<a class="chip" href="${routes.home(`tag=${encodeURIComponent(tag)}`)}">${escapeHtml(tag)}</a>`).join('')}</div>
        </div>
      </header>

      ${quickNote}${incompleteNote}

      <div class="scores">
        ${scoreBox('Качество', game.quality, qualityMax, game.qualityTier, game.quick ? 'ждёт разбора' : 'неполный разбор')}
        ${scoreBox('Кайф', game.fun, funMax, game.funTier)}
      </div>

      ${game.qualityTierOverridden ? '<p class="banner banner--warn">Тир выставлен вручную и не совпадает с расчётным.</p>' : ''}

      ${game.quality === null ? '' : `<section>
        <h2 class="section-title">Из чего собрался балл</h2>
        ${breakdownTable(game, index)}
      </section>`}

      ${game.blocks ? `<section>
        <h2 class="section-title">Разбор по критериям</h2>
        <div class="crit-groups">${criteriaList(game, index)}</div>
      </section>` : ''}

      ${review ? `<section class="review">${renderMarkdown(review)}</section>` : ''}
    </article>`;
}
