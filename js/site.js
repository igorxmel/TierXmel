// Адреса и общая шапка сайта.
//
// Страницы лежат в папках (stats/, awards/, admin/, game/<slug>/), а сайт
// на GitHub Pages живёт не в корне домена, а в /TierXmel/. Поэтому ни одна
// ссылка не пишется руками: корень вычисляется от расположения этого файла,
// и адреса одинаково работают локально и на Pages.

const ROOT = new URL('../', import.meta.url);

/** Полный адрес файла сайта — для fetch и src картинок. */
export function asset(path) {
  return new URL(path, ROOT).href;
}

/** Адрес страницы для ссылок: путь без домена, со слешем в конце. */
export function link(path = '') {
  const target = new URL(path, ROOT);
  return target.pathname + target.search + target.hash;
}

export const routes = {
  home: (query = '') => link(query ? `?${query}` : ''),
  stats: () => link('stats/'),
  awards: () => link('awards/'),
  admin: () => link('admin/'),
  game: (slug) => link(`game/${encodeURIComponent(slug)}/`),
};

/** Slug игры из адреса вида …/game/<slug>/. */
export function slugFromPath() {
  const parts = location.pathname.split('/').filter(Boolean);
  const at = parts.lastIndexOf('game');
  return at !== -1 && parts[at + 1] ? decodeURIComponent(parts[at + 1]) : null;
}

const NAV = [
  { id: 'home', label: 'Тирлист', href: () => routes.home() },
  { id: 'stats', label: 'Статистика', href: () => routes.stats() },
  { id: 'awards', label: 'Награды', href: () => routes.awards() },
];

/**
 * Шапка и подвал одной разметкой для всех страниц. Шапка — сетка из трёх
 * колонок, и навигация стоит в средней, поэтому она не прыгает между страницами
 * независимо от того, есть ли справа переключатель осей.
 */
export function renderChrome(active, { subtitle = 'личные оценки игр', footer = true } = {}) {
  const header = document.querySelector('.topbar');
  if (header) {
    const items = NAV.map((item) => {
      const on = item.id === active ? ' nav__link--on' : '';
      const current = item.id === active ? ' aria-current="page"' : '';
      return `<a class="nav__link${on}" href="${item.href()}"${current}>${item.label}</a>`;
    }).join('');

    header.innerHTML = `
      <a class="brand" href="${routes.home()}">Тирлист<small>${subtitle}</small></a>
      <nav class="nav" aria-label="Разделы">${items}</nav>
      <div class="topbar__aside" id="topbar-aside"></div>`;
  }

  const foot = document.querySelector('.footer');
  if (foot && footer && !foot.childElementCount) {
    foot.innerHTML = `
      <span>Личные оценки, не претендующие на объективность.</span>
      <span>Данные об играх: <a href="https://rawg.io/" target="_blank" rel="noopener">RAWG</a>.</span>`;
  }

  return document.getElementById('topbar-aside');
}

/** Разметка страницы игры. Админка кладёт её в game/<slug>/index.html при сохранении. */
export function gamePageStub() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Личные оценки игр: тирлист, разбор по критериям и награды.">
  <title>Игра</title>
  <link rel="icon" href="../../favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Unbounded:wght@300;600;900&display=swap">
  <link rel="stylesheet" href="../../css/style.css">
</head>
<body>
  <header class="topbar"></header>
  <main class="page page--narrow" id="root"></main>
  <footer class="footer"></footer>
  <script type="module" src="../../js/pages/game.js"></script>
</body>
</html>
`;
}
