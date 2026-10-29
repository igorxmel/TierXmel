// Админка: поиск в RAWG, заполнение карточки, расчёт на лету, коммит в репозиторий.

import {
  buildIndex, computeGame, criteriaFor, resolveProfiles, resolveBudget, tierFor,
} from './score.js';
import * as rawg from './rawg.js';
import * as gh from './github.js';
import { asset, routes, gamePageStub, renderChrome } from './site.js';

const RAWG_STORAGE = 'ratingsite.rawg';
const $ = (id) => document.getElementById(id);

let meta;
let index;
let rawGames = [];

const draft = {
  slug: '', title: '', year: null, developer: null, platforms: [], tags: [],
  profile: [], status: 'played', hours: null, finishedAt: null,
  fun: 50, verdict: '', badges: [], recommendation: null,
  tierOverride: null, draft: false, rawgId: null, cover: null,
};

let values = {};          // { blockId: { critId: number|null } }
let touched = new Set();  // 'block.crit'
let detailed = false;
let coverBlob = null;
let editingSlug = null;
let reviewText = '';
let sourceNote = '';

// ---------------------------------------------------------------- загрузка

async function boot() {
  renderChrome('admin', { subtitle: 'админка', footer: false });
  restoreSettings();
  const metaRes = await fetch(asset('data/meta.json'), { cache: 'no-cache' });
  meta = await metaRes.json();
  rawGames = await loadGames();
  index = buildIndex(meta);

  fillSelects();
  bindEvents();
  fillExistingList();
  $('results').innerHTML = `<span class="note">${sourceNote}</span>`;
}

/**
 * Список игр. С токеном читаем прямо из ветки репозитория: опубликованный сайт
 * обновляется через минуту после коммита, и правка с другого устройства
 * или после перезагрузки взяла бы старый список и затёрла предыдущую.
 */
async function loadGames() {
  const config = gh.loadConfig();
  if (config.token && config.repo) {
    try {
      const text = await gh.readFile(config, 'data/games.json');
      if (text !== null) {
        sourceNote = 'Список игр загружен из репозитория: самая свежая версия.';
        return JSON.parse(text);
      }
    } catch (error) {
      sourceNote = `Из репозитория прочитать не вышло (${error.message}), список взят с сайта и может отставать на минуту.`;
    }
  } else {
    sourceNote = 'Без токена список взят с сайта и может отставать от последнего коммита на минуту.';
  }
  const response = await fetch(asset('data/games.json'), { cache: 'no-cache' });
  return response.json();
}

function restoreSettings() {
  $('rawgKey').value = localStorage.getItem(RAWG_STORAGE) ?? '';
  const config = gh.loadConfig();
  $('ghRepo').value = config.repo ?? '';
  $('ghBranch').value = config.branch ?? 'main';
  $('ghToken').value = config.token ?? '';
  $('ghRemember').checked = config.remember !== false;
  if (!$('rawgKey').value || !config.token) $('settings').open = true;
}

function persistSettings() {
  localStorage.setItem(RAWG_STORAGE, $('rawgKey').value.trim());
  gh.saveConfig({
    repo: $('ghRepo').value.trim(),
    branch: $('ghBranch').value.trim() || 'main',
    token: $('ghToken').value.trim(),
    remember: $('ghRemember').checked,
  });
}

function fillSelects() {
  const option = (item) => `<option value="${item.id}">${item.label}</option>`;
  $('f-status').innerHTML = meta.statuses.map(option).join('');
  $('f-rec').innerHTML = '<option value="">Не выбрано</option>' + meta.recommendations.map(option).join('');

  $('f-profiles').innerHTML = '';
  for (const profile of meta.profiles) {
    $('f-profiles').append(chip(profile.label, () => {
      toggleArray(draft.profile, profile.id);
      renderProfiles();
      renderBlocks();
      update();
    }, () => draft.profile.includes(profile.id)));
  }

  $('f-badges').innerHTML = '';
  for (const badge of meta.badges) {
    const label = `${badge.icon} ${badge.label}${badge.unique ? ' · уник.' : ''}`;
    $('f-badges').append(chip(label, () => {
      toggleBadge(badge);
      renderBadges();
    }, () => draft.badges.includes(badge.id), badge.negative ? 'chip--neg' : ''));
  }
}

function chip(label, onClick, isOn, extraClass = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `chip ${extraClass}`.trim();
  button.textContent = label;
  button.dataset.on = String(isOn());
  if (isOn()) button.classList.add('chip--on');
  button.addEventListener('click', onClick);
  button._isOn = isOn;
  return button;
}

function refreshChips(container) {
  for (const button of container.querySelectorAll('.chip')) {
    button.classList.toggle('chip--on', button._isOn());
  }
}

const renderProfiles = () => refreshChips($('f-profiles'));
const renderBadges = () => refreshChips($('f-badges'));

function toggleArray(array, value) {
  const at = array.indexOf(value);
  if (at === -1) array.push(value);
  else array.splice(at, 1);
}

/** Уникальный бейдж — один держатель. Передача спрашивается явно. */
function toggleBadge(badge) {
  if (draft.badges.includes(badge.id)) {
    toggleArray(draft.badges, badge.id);
    return;
  }
  if (badge.unique) {
    const holder = rawGames.find((game) => game.slug !== draft.slug && (game.badges ?? []).includes(badge.id));
    if (holder && !confirm(`«${badge.label}» сейчас у «${holder.title}». Передать?`)) return;
    if (holder) holder.badges = holder.badges.filter((id) => id !== badge.id);
  }
  draft.badges.push(badge.id);
}

// ---------------------------------------------------------------- поиск

async function runSearch() {
  const query = $('search').value.trim();
  const results = $('results');
  results.innerHTML = '<span class="note">Ищу…</span>';
  try {
    const found = await rawg.searchGames(query, $('rawgKey').value.trim());
    if (!found.length) {
      results.innerHTML = '<span class="note">Ничего не нашлось</span>';
      return;
    }
    results.innerHTML = '';
    for (const item of found) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'result';
      card.innerHTML = `
        ${item.coverUrl ? `<img src="${item.coverUrl}" alt="" loading="lazy">` : '<span class="result__noart"></span>'}
        <span class="result__title">${item.title}</span>
        <span class="result__meta">${item.year ?? '—'}</span>`;
      card.addEventListener('click', () => pickResult(item));
      results.append(card);
    }
  } catch (error) {
    results.innerHTML = `<span class="status status--err">${error.message}</span>`;
  }
}

async function pickResult(item) {
  $('results').innerHTML = '<span class="note">Тяну детали и обложку…</span>';
  let details = item;
  try {
    details = await rawg.fetchDetails(item.rawgId, $('rawgKey').value.trim());
  } catch { /* останемся на кратких данных из поиска */ }

  resetDraft();
  Object.assign(draft, {
    title: details.title,
    slug: rawg.slugify(details.title),
    year: details.year,
    developer: details.developer ?? null,
    platforms: details.platforms ?? [],
    tags: details.tags ?? [],
    rawgId: details.rawgId,
  });

  if (details.coverUrl) {
    try {
      coverBlob = await rawg.coverFromUrl(details.coverUrl);
      showCover(coverBlob);
      $('coverNote').textContent = 'Обложка из RAWG готова: 300×450 webp.';
    } catch (error) {
      $('coverNote').textContent = `Обложку не удалось обработать: ${error.message}. Подложи свою.`;
    }
  }

  $('results').innerHTML = '';
  openForm(`Новая игра: ${draft.title}`);
}

// ---------------------------------------------------------------- форма

function resetDraft() {
  Object.assign(draft, {
    slug: '', title: '', year: null, developer: null, platforms: [], tags: [],
    profile: [], status: 'played', hours: null, finishedAt: null,
    fun: 50, verdict: '', badges: [], recommendation: null,
    tierOverride: null, draft: false, rawgId: null, cover: null,
  });
  values = {};
  touched = new Set();
  detailed = false;
  coverBlob = null;
  editingSlug = null;
  reviewText = '';
  $('coverPreview').hidden = true;
  $('f-review').value = '';
  $('coverNote').textContent = 'Берётся из RAWG, квадратный кроп 300×450 в webp. Можно подложить свою.';
}

function openForm(title) {
  $('deleteBtn').hidden = !editingSlug;
  $('formTitle').textContent = title;
  $('form').hidden = false;
  syncFormFields();
  renderProfiles();
  renderBadges();
  renderBlocks();
  setDetailed(detailed);
  update();
}

function syncFormFields() {
  $('f-title').value = draft.title;
  $('f-slug').value = draft.slug;
  $('f-year').value = draft.year ?? '';
  $('f-developer').value = draft.developer ?? '';
  $('f-platforms').value = (draft.platforms ?? []).join(', ');
  $('f-tags').value = (draft.tags ?? []).join(', ');
  $('f-status').value = draft.status ?? 'played';
  $('f-hours').value = draft.hours ?? '';
  $('f-finished').value = draft.finishedAt ?? '';
  $('f-rec').value = draft.recommendation ?? '';
  $('f-hidden').checked = !!draft.draft;
  $('f-fun').value = draft.fun ?? 50;
  $('f-verdict').value = draft.verdict ?? '';
  $('f-review').value = reviewText;
}

function readFormFields() {
  const list = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);
  draft.title = $('f-title').value.trim();
  draft.slug = $('f-slug').value.trim();
  draft.year = $('f-year').value ? Number($('f-year').value) : null;
  draft.developer = $('f-developer').value.trim() || null;
  draft.platforms = list($('f-platforms').value);
  draft.tags = list($('f-tags').value);
  draft.status = $('f-status').value;
  draft.hours = $('f-hours').value ? Number($('f-hours').value) : null;
  draft.finishedAt = $('f-finished').value.trim() || null;
  draft.recommendation = $('f-rec').value || null;
  draft.draft = $('f-hidden').checked;
  draft.fun = Number($('f-fun').value);
  draft.verdict = $('f-verdict').value.trim();
  reviewText = $('f-review').value;
}

function selectedProfiles() {
  return resolveProfiles({ profile: draft.profile }, index);
}

/** Блоки перестраиваются при смене профиля: у профилей бывают свои критерии. */
function renderBlocks() {
  const host = $('blocks');
  host.innerHTML = '';
  const profiles = selectedProfiles();

  for (const blockId of index.formOrder) {
    const block = index.blocks.get(blockId);
    const criteria = criteriaFor(blockId, profiles, index);
    values[blockId] ??= {};

    const section = document.createElement('details');
    section.className = 'crit-block';
    section.open = blockId === index.formOrder[0];

    const summary = document.createElement('summary');
    summary.innerHTML = `<span>${block.label}</span><span class="crit-block__state" data-block="${blockId}"></span>`;
    section.append(summary);

    for (const crit of criteria) {
      if (!(crit.id in values[blockId])) values[blockId][crit.id] = 5;
      section.append(criterionRow(blockId, crit));
    }
    host.append(section);
  }
}

function criterionRow(blockId, crit) {
  const key = `${blockId}.${crit.id}`;
  const row = document.createElement('div');
  row.className = 'crit';
  row.dataset.key = key;

  row.innerHTML = `
    <span class="crit__name" title="${crit.hint ?? ''}">${crit.label}</span>
    <input type="range" min="0" max="10" step="1" value="${values[blockId][crit.id] ?? 5}">
    <output class="crit__out"></output>
    <button type="button" class="btn btn--tiny">н/д</button>
    <p class="crit__hint">${crit.hint ?? ''}</p>`;

  const range = row.querySelector('input');
  const out = row.querySelector('.crit__out');
  const na = row.querySelector('button');

  const paint = () => {
    const value = values[blockId][crit.id];
    const isNa = value === null;
    row.classList.toggle('crit--na', isNa);
    row.classList.toggle('crit--untouched', !touched.has(key) && !isNa);
    range.disabled = isNa;
    out.textContent = isNa ? 'н/д' : `${value} — ${meta.scaleAnchors[String(value)]}`;
    na.classList.toggle('btn--on', isNa);
  };

  range.addEventListener('input', () => {
    values[blockId][crit.id] = Number(range.value);
    touched.add(key);
    paint();
    update();
  });

  range.addEventListener('keydown', (event) => {
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      values[blockId][crit.id] = Number(event.key);
      range.value = String(values[blockId][crit.id]);
      touched.add(key);
      paint();
      update();
    } else if (event.key === '/') {
      event.preventDefault();
      na.click();
    }
  });

  na.addEventListener('click', () => {
    values[blockId][crit.id] = values[blockId][crit.id] === null ? Number(range.value) : null;
    touched.add(key);
    paint();
    update();
  });

  paint();
  return row;
}

function setDetailed(on) {
  detailed = on;
  $('detailed').hidden = !on;
  $('toDetailed').textContent = on ? 'Свернуть разбор (сохранится как быстрая оценка)' : 'Разобрать подробно по критериям';
}

// ---------------------------------------------------------------- расчёт

function buildGame({ withBlocks = detailed } = {}) {
  const game = {
    slug: draft.slug,
    title: draft.title,
    year: draft.year,
    developer: draft.developer,
    platforms: draft.platforms,
    profile: draft.profile.length === 1 ? draft.profile[0] : [...draft.profile],
    tags: draft.tags,
    status: draft.status,
    hours: draft.hours,
    finishedAt: draft.finishedAt,
    fun: draft.fun,
    verdict: draft.verdict,
    badges: [...draft.badges],
    recommendation: draft.recommendation,
    tierOverride: draft.tierOverride,
    draft: draft.draft,
    // Флаг нужен, чтобы карточки без рецензии не стучались в несуществующий файл.
    review: !!reviewText.trim(),
    rawgId: draft.rawgId,
    cover: draft.cover,
  };
  if (withBlocks) {
    game.blocks = {};
    for (const [blockId, criteria] of Object.entries(values)) {
      const kept = Object.entries(criteria).filter(([, value]) => value !== undefined);
      if (kept.length) game.blocks[blockId] = Object.fromEntries(kept);
    }
  }
  if (!game.profile || (Array.isArray(game.profile) && !game.profile.length)) delete game.profile;
  return game;
}

function untouchedCount() {
  let count = 0;
  for (const [blockId, criteria] of Object.entries(values)) {
    for (const critId of Object.keys(criteria)) {
      if (!touched.has(`${blockId}.${critId}`)) count += 1;
    }
  }
  return count;
}

function totalCriteria() {
  return Object.values(values).reduce((sum, criteria) => sum + Object.keys(criteria).length, 0);
}

function update() {
  readFormFields();

  const funTier = tierFor(draft.fun, meta.scale.funMax, index);
  $('funOut').textContent = String(draft.fun);
  $('funTier').textContent = funTier ? `${funTier.label} · ${funTier.desc}` : '';
  $('funTier').style.setProperty('--tier', funTier?.color ?? 'transparent');

  renderBudget();
  renderBlockStates();

  const computed = computeGame(buildGame(), index);
  const lines = [];

  if (!detailed) {
    lines.push('<b>Быстрая оценка.</b> Качество не считается, игра ляжет на полку «Ждут разбора» и получит молнию.');
  } else if (computed.quality === null) {
    lines.push(`<b class="bad">Качество не считается:</b> покрытие ${(computed.coverage * 100).toFixed(0)}% ниже порога ${(meta.scale.minCoverage * 100).toFixed(0)}%. Включено слишком мало блоков.`);
  } else {
    const tier = computed.qualityTier;
    lines.push(`<b class="big" style="color:${tier.color}">${computed.quality}</b> из ${meta.scale.qualityMax} → тир <b style="color:${tier.color}">${tier.label}</b> (${tier.desc}), покрытие ${(computed.coverage * 100).toFixed(0)}%`);
  }

  if (detailed) {
    const left = untouchedCount();
    lines.push(left
      ? `<span class="bad">Заполнено ${totalCriteria() - left} из ${totalCriteria()}</span> — пока не тронуты все критерии, подробную оценку сохранить нельзя.`
      : `Заполнено ${totalCriteria()} из ${totalCriteria()} — можно сохранять.`);
  }

  $('summary').innerHTML = lines.join('<br>');
}

function renderBudget() {
  const budget = resolveBudget({ profile: draft.profile }, index);
  const profiles = selectedProfiles().map((p) => p.label).join(' + ');
  const cells = index.blockOrder
    .map((id) => `<td><b>${Math.round(budget[id])}</b><span>${index.blocks.get(id).label}</span></td>`)
    .join('');
  $('budgetTable').innerHTML = `<tr><th>${profiles}</th>${cells}</tr>`;
}

function renderBlockStates() {
  for (const node of document.querySelectorAll('.crit-block__state')) {
    const blockId = node.dataset.block;
    const criteria = values[blockId] ?? {};
    const ids = Object.keys(criteria);
    const left = ids.filter((id) => !touched.has(`${blockId}.${id}`)).length;
    const na = ids.filter((id) => criteria[id] === null).length;
    node.textContent = left ? `${ids.length - left} из ${ids.length}` : na ? `готово · н/д ${na}` : 'готово';
    node.classList.toggle('crit-block__state--todo', left > 0);
  }
}

// ---------------------------------------------------------------- сохранение

function showCover(blob) {
  const preview = $('coverPreview');
  preview.src = URL.createObjectURL(blob);
  preview.hidden = false;
}

function validateBeforeSave() {
  const problems = [];
  if (!draft.title) problems.push('нет названия');
  if (!draft.slug) problems.push('нет slug');
  if (rawGames.some((game) => game.slug === draft.slug && game.slug !== editingSlug)) {
    problems.push(`slug «${draft.slug}» уже занят`);
  }
  if (detailed && untouchedCount()) problems.push(`не тронуто критериев: ${untouchedCount()}`);
  return problems;
}

function upsert(game) {
  const at = rawGames.findIndex((item) => item.slug === (editingSlug ?? game.slug));
  if (at === -1) rawGames.push(game);
  else rawGames[at] = game;
}

async function save() {
  const status = $('saveStatus');
  readFormFields(); // поля могли измениться без события input (автозаполнение, вставка)
  const problems = validateBeforeSave();
  if (problems.length) {
    status.className = 'status status--err';
    status.textContent = `Не сохраняю: ${problems.join('; ')}`;
    return;
  }

  const game = buildGame();
  if (coverBlob) game.cover = `covers/${game.slug}.webp`;
  upsert(game);

  const files = [{ path: 'data/games.json', text: `${JSON.stringify(rawGames, null, 2)}\n` }];
  if (coverBlob) files.push({ path: `covers/${game.slug}.webp`, base64: await rawg.blobToBase64(coverBlob) });
  if (reviewText.trim()) files.push({ path: `data/reviews/${game.slug}.md`, text: reviewText.trim() + '\n' });
  // Своя папка у каждой игры даёт адрес вида /game/undertale/ без ?g= в ссылке.
  files.push({ path: `game/${game.slug}/index.html`, text: gamePageStub() });

  status.className = 'status';
  status.textContent = 'Коммичу…';
  try {
    const config = gh.loadConfig();
    const commit = await gh.commitFiles(config, files, `${editingSlug ? 'Правка' : 'Добавлена игра'}: ${game.title}`);
    status.className = 'status status--ok';
    status.innerHTML = `Готово: ${commit.sha.slice(0, 7)}. Через полминуты игра будет на <a href="${routes.game(game.slug)}">своей странице</a>.`;
    editingSlug = game.slug;
    $('deleteBtn').hidden = false;
    coverBlob = null;
    fillExistingList();
  } catch (error) {
    status.className = 'status status--err';
    status.textContent = error.message;
  }
}

function exportJson() {
  readFormFields();
  const problems = validateBeforeSave();
  if (!problems.length) {
    const game = buildGame();
    if (coverBlob) game.cover = `covers/${game.slug}.webp`;
    upsert(game);
    editingSlug = game.slug;
  }
  const blob = new Blob([`${JSON.stringify(rawGames, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'games.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Удаление: запись из games.json и все файлы игры одним коммитом.
 * Уникальные награды освобождаются сами — они жили в записи игры.
 */
async function removeGame() {
  const slug = editingSlug;
  const game = rawGames.find((item) => item.slug === slug);
  if (!game) return;
  if (!confirm(`Удалить «${game.title}» насовсем? Оценки, рецензия, обложка и страница игры пропадут из репозитория. Скрыть её можно галочкой «Скрыть с сайта».`)) return;

  const status = $('saveStatus');
  status.className = 'status';
  status.textContent = 'Удаляю…';

  try {
    const config = gh.loadConfig();
    const rest = rawGames.filter((item) => item.slug !== slug);
    const files = [{ path: 'data/games.json', text: `${JSON.stringify(rest, null, 2)}
` }];

    // GitHub не даёт удалить путь, которого нет, поэтому проверяем каждый.
    const candidates = [`game/${slug}/index.html`, `data/reviews/${slug}.md`];
    if (game.cover && !rest.some((item) => item.cover === game.cover)) candidates.push(game.cover);
    for (const path of candidates) {
      if (await gh.fileExists(config, path)) files.push({ path, delete: true });
    }

    const commit = await gh.commitFiles(config, files, `Удалена игра: ${game.title}`);
    rawGames = rest;
    resetDraft();
    $('form').hidden = true;
    $('editExisting').value = '';
    fillExistingList();
    status.className = 'status status--ok';
    status.textContent = `Удалено: ${commit.sha.slice(0, 7)}.`;
    $('results').innerHTML = `<span class="status status--ok">«${game.title}» удалена: ${commit.sha.slice(0, 7)}. С сайта пропадёт через минуту.</span>`;
  } catch (error) {
    status.className = 'status status--err';
    status.textContent = error.message;
  }
}

// ---------------------------------------------------------------- редактирование

function fillExistingList() {
  const select = $('editExisting');
  const current = select.value;
  select.innerHTML = '<option value="">Редактировать существующую</option>'
    + [...rawGames]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((game) => `<option value="${game.slug}">${game.title}${game.draft ? ' (скрыта)' : ''}</option>`)
      .join('');
  select.value = current;
}

async function loadExisting(slug) {
  const game = rawGames.find((item) => item.slug === slug);
  if (!game) return;

  resetDraft();
  Object.assign(draft, {
    slug: game.slug,
    title: game.title,
    year: game.year ?? null,
    developer: game.developer ?? null,
    platforms: game.platforms ?? [],
    tags: game.tags ?? [],
    profile: Array.isArray(game.profile) ? [...game.profile] : game.profile ? [game.profile] : [],
    status: game.status ?? 'played',
    hours: game.hours ?? null,
    finishedAt: game.finishedAt ?? null,
    fun: typeof game.fun === 'number' ? game.fun : 50,
    verdict: game.verdict ?? '',
    badges: [...(game.badges ?? [])],
    recommendation: game.recommendation ?? null,
    tierOverride: game.tierOverride ?? null,
    draft: !!game.draft,
    rawgId: game.rawgId ?? null,
    cover: game.cover ?? null,
  });
  editingSlug = slug;

  if (game.blocks) {
    detailed = true;
    for (const [blockId, criteria] of Object.entries(game.blocks)) {
      values[blockId] = { ...criteria };
      for (const critId of Object.keys(criteria)) touched.add(`${blockId}.${critId}`);
    }
  }

  if (game.review) {
    const config = gh.loadConfig();
    let text = null;
    if (config.token) {
      try { text = await gh.readFile(config, `data/reviews/${slug}.md`); } catch { /* возьмём с сайта */ }
    }
    if (text === null) {
      const response = await fetch(asset(`data/reviews/${slug}.md`), { cache: 'no-cache' });
      text = response.ok ? await response.text() : '';
    }
    reviewText = text;
  }

  openForm(`Правка: ${draft.title}`);
}

// ---------------------------------------------------------------- события

function bindEvents() {
  for (const id of ['rawgKey', 'ghRepo', 'ghBranch', 'ghToken', 'ghRemember']) {
    $(id).addEventListener('change', persistSettings);
  }

  $('checkAccess').addEventListener('click', async () => {
    persistSettings();
    const status = $('accessStatus');
    status.className = 'status';
    status.textContent = 'Проверяю…';
    try {
      const info = await gh.checkAccess(gh.loadConfig());
      status.className = info.canPush ? 'status status--ok' : 'status status--err';
      status.textContent = info.canPush
        ? `${info.repo}, ветка ${info.branch} — запись доступна`
        : `${info.repo}: токен без права записи`;
    } catch (error) {
      status.className = 'status status--err';
      status.textContent = error.message;
    }
  });

  $('searchBtn').addEventListener('click', runSearch);
  $('search').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); runSearch(); }
  });

  $('newBtn').addEventListener('click', () => {
    resetDraft();
    openForm('Новая игра');
  });

  $('editExisting').addEventListener('change', (event) => {
    if (event.target.value) loadExisting(event.target.value);
  });

  $('toDetailed').addEventListener('click', () => { setDetailed(!detailed); update(); });

  $('f-title').addEventListener('input', () => {
    if (!editingSlug && !$('f-slug').value) $('f-slug').value = rawg.slugify($('f-title').value);
    update();
  });

  for (const id of ['f-slug', 'f-year', 'f-developer', 'f-platforms', 'f-tags', 'f-status',
    'f-hours', 'f-finished', 'f-rec', 'f-fun', 'f-verdict', 'f-review']) {
    $(id).addEventListener('input', update);
  }

  $('coverFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      coverBlob = await rawg.coverFromFile(file);
      showCover(coverBlob);
      $('coverNote').textContent = 'Своя обложка готова: 300×450 webp.';
    } catch (error) {
      $('coverNote').textContent = `Не вышло: ${error.message}`;
    }
  });

  $('saveBtn').addEventListener('click', save);
  $('deleteBtn').addEventListener('click', removeGame);
  $('f-hidden').addEventListener('change', update);
  $('exportBtn').addEventListener('click', exportJson);
}

boot();
