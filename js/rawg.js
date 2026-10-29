// RAWG: поиск игры, метаданные и обложка.
// Ключ живёт только в localStorage админки — публичные страницы сюда не ходят.

const API = 'https://api.rawg.io/api';
export const COVER_W = 300;
export const COVER_H = 450;

function requireKey(key) {
  if (!key) throw new Error('Не задан ключ RAWG. Получить: rawg.io/apidocs');
}

async function get(path, params, key) {
  requireKey(key);
  const query = new URLSearchParams({ ...params, key });
  const response = await fetch(`${API}${path}?${query}`);
  if (response.status === 401) throw new Error('RAWG: ключ не принят (401)');
  if (!response.ok) throw new Error(`RAWG: HTTP ${response.status}`);
  return response.json();
}

function yearOf(released) {
  const year = Number((released ?? '').slice(0, 4));
  return Number.isFinite(year) && year > 1950 ? year : null;
}

/** Короткий список для выбора. Детали подтягиваем только для выбранной игры. */
export async function searchGames(query, key) {
  if (!query.trim()) return [];
  const data = await get('/games', { search: query, page_size: '8' }, key);
  return (data.results ?? []).map((item) => ({
    rawgId: item.id,
    title: item.name,
    year: yearOf(item.released),
    coverUrl: item.background_image ?? null,
    platforms: [...new Set((item.parent_platforms ?? []).map((p) => p.platform.name))],
    tags: (item.genres ?? []).map((g) => g.name),
    metacritic: item.metacritic ?? null,
  }));
}

/** Разработчик есть только в детальном ответе, поэтому отдельный запрос. */
export async function fetchDetails(rawgId, key) {
  const data = await get(`/games/${rawgId}`, {}, key);
  return {
    rawgId: data.id,
    title: data.name,
    year: yearOf(data.released),
    developer: data.developers?.[0]?.name ?? null,
    coverUrl: data.background_image ?? null,
    platforms: [...new Set((data.parent_platforms ?? []).map((p) => p.platform.name))],
    tags: (data.genres ?? []).map((g) => g.name),
    metacritic: data.metacritic ?? null,
  };
}

function drawPortrait(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = COVER_W;
  canvas.height = COVER_H;
  const ctx = canvas.getContext('2d');

  // Центральный кроп в 2:3, как у боксарта. Кадры RAWG широкие, так что из них
  // вырезается середина; для точного результата можно подложить свою картинку.
  const ratio = COVER_W / COVER_H;
  let sw = width;
  let sh = width / ratio;
  if (sh > height) { sh = height; sw = height * ratio; }
  ctx.drawImage(source, (width - sw) / 2, (height - sh) / 2, sw, sh, 0, 0, COVER_W, COVER_H);
  return canvas;
}

function toWebp(canvas, quality = 0.85) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось сжать обложку в webp'))),
      'image/webp',
      quality,
    );
  });
}

/** Обложка по URL → квадратный webp. media.rawg.io отдаёт CORS, поэтому canvas не портится. */
export async function coverFromUrl(url) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  return toWebp(drawPortrait(image, image.naturalWidth, image.naturalHeight));
}

/** Своя картинка с диска — на случай, когда кадр из RAWG не годится. */
export async function coverFromFile(file) {
  const bitmap = await createImageBitmap(file);
  const blob = await toWebp(drawPortrait(bitmap, bitmap.width, bitmap.height));
  bitmap.close();
  return blob;
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.readAsDataURL(blob);
  });
}

export function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
