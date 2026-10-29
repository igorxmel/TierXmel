// Запись в репозиторий через Git Data API.
//
// Contents API умеет только по одному файлу за коммит, а нам нужно положить
// games.json, обложку и рецензию ОДНИМ коммитом — иначе при обрыве получится
// запись в данных без картинки. Поэтому blob → tree → commit → ref.

const API = 'https://api.github.com';
const STORAGE_KEY = 'ratingsite.github';
const TOKEN_KEY = 'ratingsite.github.token';

// Репозиторий и ветка живут в localStorage всегда. Токен — только если
// включено «запомнить»: иначе он в sessionStorage и исчезает с закрытием вкладки.
export function loadConfig() {
  let config = { repo: '', branch: 'main', remember: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) config = { ...config, ...JSON.parse(raw) };
  } catch { /* битая запись — начинаем с пустой */ }

  // Старый формат хранил токен прямо в общей записи — переносим.
  if (config.token) {
    localStorage.setItem(TOKEN_KEY, config.token);
    delete config.token;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  config.token = localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY) ?? '';
  return config;
}

export function saveConfig({ token = '', remember = true, ...rest }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, remember }));
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

function headers(config) {
  if (!config.token) throw new Error('Не задан GitHub-токен');
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo)) throw new Error('Репозиторий указывается как owner/name');
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function call(config, path, options = {}) {
  const response = await fetch(`${API}/repos/${config.repo}${path}`, {
    ...options,
    headers: { ...headers(config), ...(options.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`GitHub ${response.status}: ${detail.slice(0, 200)}`);
  }
  return response.json();
}

/** Проверка доступа до первой записи — чтобы не узнать о неверном токене в момент сохранения. */
export async function checkAccess(config) {
  const repo = await call(config, '');
  const branch = config.branch || repo.default_branch;
  await call(config, `/git/ref/heads/${encodeURIComponent(branch)}`);
  return { repo: repo.full_name, branch, canPush: repo.permissions?.push !== false };
}

const encodeUtf8 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/**
 * Один коммит на несколько файлов.
 * files: [{ path, text }] или [{ path, base64 }]
 */
export async function commitFiles(config, files, message) {
  const branch = config.branch || 'main';
  const ref = await call(config, `/git/ref/heads/${encodeURIComponent(branch)}`);
  const headSha = ref.object.sha;
  const headCommit = await call(config, `/git/commits/${headSha}`);

  const tree = [];
  for (const file of files) {
    // sha: null в дереве удаляет файл в том же коммите.
    if (file.delete) {
      tree.push({ path: file.path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const blob = await call(config, '/git/blobs', {
      method: 'POST',
      body: JSON.stringify(
        'base64' in file
          ? { content: file.base64, encoding: 'base64' }
          : { content: encodeUtf8(file.text), encoding: 'base64' },
      ),
    });
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const newTree = await call(config, '/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
  });

  const commit = await call(config, '/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha] }),
  });

  await call(config, `/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });

  return commit;
}

/** Текущее содержимое файла из ветки (не из кеша Pages). null, если файла нет. */
export async function readFile(config, path) {
  const branch = config.branch || 'main';
  const url = `${API}/repos/${config.repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers: headers(config) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub ${response.status} при чтении ${path}`);
  const data = await response.json();
  const binary = atob(data.content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Есть ли файл в ветке. Удалять несуществующий путь GitHub не даёт. */
export async function fileExists(config, path) {
  const branch = config.branch || 'main';
  const url = `${API}/repos/${config.repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { method: 'GET', headers: headers(config) });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`GitHub ${response.status} при проверке ${path}`);
  return true;
}
