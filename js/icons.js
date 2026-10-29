// Иконки вместо эмодзи: эмодзи рисуются шрифтом системы и выглядят
// по-разному везде. SVG наследует currentColor и масштабируется.

const PATHS = {
  // Награды: заполненная звезда — уникальный GOAT, контурная — обычное отличие,
  // перечёркнутый круг — антинаграда.
  starFilled: '<path d="M12 2.6 14.85 9.1 21.9 9.8 16.6 14.55 18.1 21.5 12 17.9 5.9 21.5 7.4 14.55 2.1 9.8 9.15 9.1Z" fill="currentColor"/>',
  starOutline: '<path d="M12 2.6 14.85 9.1 21.9 9.8 16.6 14.55 18.1 21.5 12 17.9 5.9 21.5 7.4 14.55 2.1 9.8 9.15 9.1Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  nope: '<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6.2 17.8 17.8 6.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',

  bolt: '<path d="M13.6 2 4.8 13.4h5.4L9 22l9.2-11.6h-5.4z" fill="currentColor"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.8 15.8 21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  chevron: '<path d="M6 9.5 12 15.5 18 9.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  arrow: '<path d="M5 12h13M12.5 6 19 12l-6.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function icon(name, className = '') {
  const body = PATHS[name];
  if (!body) return '';
  const cls = `ic${className ? ` ${className}` : ''}`;
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Иконка награды по её описанию из meta.json. */
export function badgeIcon(badge, className = '') {
  if (badge.negative) return icon('nope', className);
  return icon(badge.unique ? 'starFilled' : 'starOutline', className);
}
