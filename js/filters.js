// Фильтры и состояние вида. Всё состояние живёт в URL, чтобы ссылку
// «тирлист только по RPG» можно было просто скинуть.
//
// Фасет восемь, и показывать их все развёрнутыми — полотно, в котором
// ничего не найти. Поэтому четыре главных вынесены в кнопки-выпадашки,
// остальные спрятаны под «Ещё», а выбранное всегда видно отдельной строкой.

import { icon } from './icons.js';

export const AXES = [
  { id: 'quality', label: 'Качество', hint: '0–900' },
  { id: 'fun', label: 'Кайф', hint: '0–100' },
];

export const FACETS = [
  {
    id: 'profile',
    label: 'Жанр',
    primary: true,
    valuesOf: (game) => game.profiles.map((profile) => profile.id),
    labelOf: (value, index) => index.profiles.get(value)?.label ?? value,
  },
  {
    id: 'decade',
    label: 'Годы',
    primary: true,
    valuesOf: (game) => (game.year ? [`${Math.floor(game.year / 10) * 10}`] : []),
    labelOf: (value) => `${value}-е`,
    sort: (a, b) => Number(b) - Number(a),
  },
  {
    id: 'status',
    label: 'Статус',
    primary: true,
    valuesOf: (game) => (game.status ? [game.status] : []),
    labelOf: (value, index) => index.statuses.get(value)?.label ?? value,
  },
  {
    id: 'depth',
    label: 'Разбор',
    primary: true,
    // Неоценённые игры в фасету не попадают: они не «быстрые», они никакие.
    valuesOf: (game) => (game.quality !== null ? ['full'] : game.quick ? ['quick'] : []),
    labelOf: (value) => (value === 'quick' ? 'Только быстрые' : 'Только разобранные'),
    sort: (a, b) => a.localeCompare(b),
  },
  {
    id: 'tag',
    label: 'Тег',
    valuesOf: (game) => game.tags ?? [],
    labelOf: (value) => value,
  },
  {
    id: 'platform',
    label: 'Платформа',
    valuesOf: (game) => game.platforms ?? [],
    labelOf: (value) => value,
  },
  {
    id: 'badge',
    label: 'Награда',
    valuesOf: (game) => game.badges ?? [],
    labelOf: (value, index) => index.badges.get(value)?.label ?? value,
  },
  {
    id: 'rec',
    label: 'Рекомендация',
    valuesOf: (game) => (game.recommendation ? [game.recommendation] : []),
    labelOf: (value, index) => index.recommendations.get(value)?.label ?? value,
  },
];

const FACET_BY_ID = new Map(FACETS.map((facet) => [facet.id, facet]));

export function readState() {
  const params = new URLSearchParams(location.search);
  const axis = AXES.some((a) => a.id === params.get('axis')) ? params.get('axis') : 'quality';
  const selected = new Map();
  for (const facet of FACETS) {
    const raw = params.get(facet.id);
    if (!raw) continue;
    const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
    if (values.length) selected.set(facet.id, new Set(values));
  }
  return { axis, selected, query: params.get('q') ?? '' };
}

export function writeState(state) {
  const params = new URLSearchParams();
  if (state.axis !== 'quality') params.set('axis', state.axis);
  if (state.query) params.set('q', state.query);
  for (const [facetId, values] of state.selected) {
    if (values.size) params.set(facetId, [...values].join(','));
  }
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

export function toggleValue(state, facetId, value) {
  const values = state.selected.get(facetId) ?? new Set();
  if (values.has(value)) values.delete(value);
  else values.add(value);
  if (values.size) state.selected.set(facetId, values);
  else state.selected.delete(facetId);
  return state;
}

export function clearFilters(state) {
  state.selected.clear();
  state.query = '';
  return state;
}

export function isActive(state) {
  return state.selected.size > 0 || !!state.query;
}

/** Игра проходит, если по каждой активной фасете совпало хотя бы одно значение. */
export function applyFilters(games, state) {
  const query = state.query.trim().toLowerCase();
  if (!state.selected.size && !query) return games;

  return games.filter((game) => {
    if (query) {
      const haystack = [game.title, game.developer, ...(game.tags ?? [])].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    for (const [facetId, wanted] of state.selected) {
      const facet = FACET_BY_ID.get(facetId);
      if (!facet) continue;
      if (!facet.valuesOf(game).some((value) => wanted.has(value))) return false;
    }
    return true;
  });
}

function facetOptions(games, facet, index) {
  const counts = new Map();
  for (const game of games) {
    for (const value of facet.valuesOf(game)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const options = [...counts.entries()].map(([value, count]) => ({
    value, count, label: facet.labelOf(value, index),
  }));
  options.sort(facet.sort
    ? (a, b) => facet.sort(a.value, b.value)
    : (a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return options;
}

function chipButton(option, selected, onClick) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = selected ? 'chip chip--on' : 'chip';
  chip.innerHTML = `${escapeHtml(option.label)}<span class="chip__count">${option.count}</span>`;
  chip.addEventListener('click', onClick);
  return chip;
}

function facetDropdown(facet, options, state, onChange, { grouped = null } = {}) {
  const wrap = document.createElement('details');
  wrap.className = 'facet';

  const chosen = state.selected.get(facet.id)?.size ?? 0;
  const tally = grouped
    ? grouped.reduce((sum, item) => sum + (state.selected.get(item.facet.id)?.size ?? 0), 0)
    : chosen;

  const summary = document.createElement('summary');
  summary.className = 'facet__btn';
  summary.innerHTML = `${escapeHtml(facet.label)}${tally ? `<span class="facet__tally">${tally}</span>` : ''}${icon('chevron')}`;
  wrap.append(summary);

  const menu = document.createElement('div');
  menu.className = 'facet__menu';

  if (grouped) {
    for (const item of grouped) {
      const group = document.createElement('div');
      group.className = 'facet__group';
      group.innerHTML = `<span class="facet__group-title">${escapeHtml(item.facet.label)}</span>`;
      const chips = document.createElement('div');
      chips.className = 'chips';
      for (const option of item.options) {
        chips.append(chipButton(option, state.selected.get(item.facet.id)?.has(option.value) ?? false, () => {
          toggleValue(state, item.facet.id, option.value);
          onChange();
        }));
      }
      group.append(chips);
      menu.append(group);
    }
  } else {
    for (const option of options) {
      menu.append(chipButton(option, state.selected.get(facet.id)?.has(option.value) ?? false, () => {
        toggleValue(state, facet.id, option.value);
        onChange();
      }));
    }
  }

  wrap.append(menu);
  return wrap;
}

/** Строка выбранного — чтобы фильтр никогда не действовал незаметно. */
function renderActive(container, state, index, onChange) {
  container.innerHTML = '';
  if (!isActive(state)) return;

  const label = document.createElement('span');
  label.className = 'active__label';
  label.textContent = 'Отфильтровано';
  container.append(label);

  if (state.query) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pill';
    pill.innerHTML = `«${escapeHtml(state.query)}»${icon('close')}`;
    pill.addEventListener('click', () => { state.query = ''; onChange(); });
    container.append(pill);
  }

  for (const [facetId, values] of state.selected) {
    const facet = FACET_BY_ID.get(facetId);
    if (!facet) continue;
    for (const value of values) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pill';
      pill.innerHTML = `${escapeHtml(facet.labelOf(value, index))}${icon('close')}`;
      pill.addEventListener('click', () => { toggleValue(state, facetId, value); onChange(); });
      container.append(pill);
    }
  }

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'link-reset';
  reset.textContent = 'сбросить всё';
  reset.addEventListener('click', () => { clearFilters(state); onChange(); });
  container.append(reset);
}

export function renderToolbar(toolbar, active, games, state, index, onChange) {
  // Открытая выпадашка не должна пережить перерисовку незаметно — запоминаем.
  const wasOpen = [...toolbar.querySelectorAll('.facet[open]')].map((node) => node.dataset.facet);
  const hadFocus = toolbar.querySelector('.search input') === document.activeElement;
  const caret = hadFocus ? toolbar.querySelector('.search input').selectionStart : null;

  toolbar.innerHTML = '';

  const search = document.createElement('div');
  search.className = 'search';
  search.innerHTML = icon('search');
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Поиск по названию, разработчику, тегу';
  input.value = state.query;
  input.addEventListener('input', () => { state.query = input.value; onChange(); });
  search.append(input);
  toolbar.append(search);

  const secondary = [];
  for (const facet of FACETS) {
    const options = facetOptions(games, facet, index);
    if (options.length < 2) continue;
    if (facet.primary) {
      const node = facetDropdown(facet, options, state, onChange);
      node.dataset.facet = facet.id;
      toolbar.append(node);
    } else {
      secondary.push({ facet, options });
    }
  }

  if (secondary.length) {
    const node = facetDropdown({ id: '__more', label: 'Ещё' }, [], state, onChange, { grouped: secondary });
    node.dataset.facet = '__more';
    toolbar.append(node);
  }

  for (const node of toolbar.querySelectorAll('.facet')) {
    if (wasOpen.includes(node.dataset.facet)) node.open = true;
    // Одна открытая выпадашка за раз — иначе они перекрывают друг друга.
    node.addEventListener('toggle', () => {
      if (!node.open) return;
      for (const other of toolbar.querySelectorAll('.facet[open]')) {
        if (other !== node) other.open = false;
      }
    });
  }

  if (hadFocus) {
    input.focus();
    if (caret !== null) input.setSelectionRange(caret, caret);
  }

  renderActive(active, state, index, onChange);
}

/** Закрывает выпадашки по клику мимо и по Escape. */
export function bindDismiss(toolbar) {
  document.addEventListener('click', (event) => {
    if (toolbar.contains(event.target)) return;
    for (const node of toolbar.querySelectorAll('.facet[open]')) node.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    for (const node of toolbar.querySelectorAll('.facet[open]')) node.open = false;
  });
}

/** Русские числительные: 1 игра, 2 игры, 5 игр. */
export function plural(count, one, few, many) {
  const tail = count % 10;
  const hundred = count % 100;
  if (tail === 1 && hundred !== 11) return one;
  if (tail >= 2 && tail <= 4 && (hundred < 10 || hundred >= 20)) return few;
  return many;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}
