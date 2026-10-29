// Загрузка и нормализация данных. Производные поля считает score.js.

import { buildIndex, computeGame, validateMeta, validateGames } from './score.js';
import { asset } from './site.js';

const PATHS = {
  meta: asset('data/meta.json'),
  games: asset('data/games.json'),
  review: (slug) => asset(`data/reviews/${slug}.md`),
};

let cache = null;

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

/**
 * Грузит meta + games, валидирует, считает производные поля.
 * Результат кешируется на время жизни страницы.
 */
export async function loadData({ includeDrafts = false } = {}) {
  if (cache) return cache;

  const [meta, rawGames] = await Promise.all([fetchJson(PATHS.meta), fetchJson(PATHS.games)]);
  const index = buildIndex(meta);

  const issues = [...validateMeta(meta), ...validateGames(rawGames, index)];
  reportIssues(issues);

  const all = rawGames.map((game) => computeGame(game, index));
  const games = includeDrafts ? all : all.filter((game) => !game.draft);

  cache = { meta, index, games, all, issues };
  return cache;
}

function reportIssues(issues) {
  for (const issue of issues) {
    const text = `[RatingSite] ${issue.message}`;
    if (issue.level === 'error') console.error(text);
    else console.warn(text);
  }
}

/**
 * Markdown-рецензия по требованию.
 * Наличие файла отмечено флагом в games.json: иначе каждая карточка без
 * рецензии стучалась бы в несуществующий файл и сыпала 404 в консоль.
 */
export async function loadReview(game) {
  const slug = typeof game === 'string' ? game : game?.slug;
  if (!slug) return null;
  if (typeof game === 'object' && !game.review) return null;

  const response = await fetch(PATHS.review(slug), { cache: 'no-cache' });
  if (!response.ok) return null;
  return response.text();
}

/** Игры, участвующие в тирлисте по выбранной оси. */
export function tierlistGames(games, axis) {
  return games.filter((game) => {
    if (!game.inTierlist) return false;
    return axis === 'fun' ? game.fun !== null : game.quality !== null;
  });
}

/** Игры, ждущие подробного разбора: кайф есть, качества нет. */
export function awaitingReview(games) {
  return games.filter((game) => game.inTierlist && game.fun !== null && game.quality === null);
}

/** Игры вообще без оценок, а также дропы и бэклог. */
export function unrated(games) {
  return games.filter((game) => !game.inTierlist || (game.fun === null && game.quality === null));
}

export function bySlug(games, slug) {
  return games.find((game) => game.slug === slug) ?? null;
}
