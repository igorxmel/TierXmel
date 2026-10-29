// Минимальный markdown для рецензий.
//
// Порядок важен: блочную структуру распознаём на СЫРОЙ строке, а экранируем
// только содержимое. Если экранировать первым, «>» превращается в «&gt;»
// и цитата перестаёт распознаваться вовсе.

import { escapeHtml } from './filters.js';

function inline(raw) {
  return escapeHtml(raw)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|\s)_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[^-])---(?=\s|$)/g, '$1—');
}

export function renderMarkdown(source) {
  const lines = String(source).split(/\r?\n/);
  const html = [];
  let list = null;
  let quote = [];
  let code = null;

  const closeList = () => {
    if (list) { html.push(`</${list}>`); list = null; }
  };

  const closeQuote = () => {
    if (quote.length) {
      html.push(`<blockquote>${quote.map((line) => `<p>${inline(line)}</p>`).join('')}</blockquote>`);
      quote = [];
    }
  };

  const closeAll = () => { closeList(); closeQuote(); };

  for (const line of lines) {
    const text = line.trim();

    // Блок кода отдаётся как есть, без разбора разметки внутри.
    const fence = text.match(/^```(\w*)$/);
    if (fence) {
      if (code === null) { closeAll(); code = []; } else {
        html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = null;
      }
      continue;
    }
    if (code !== null) { code.push(line); continue; }

    if (!text) { closeAll(); continue; }

    if (/^(---|\*\*\*|___)$/.test(text)) {
      closeAll();
      html.push('<hr>');
      continue;
    }

    const heading = text.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeAll();
      const level = Math.min(heading[1].length + 1, 6);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const quoted = text.match(/^>\s?(.*)$/);
    if (quoted) {
      closeList();
      quote.push(quoted[1]);
      continue;
    }
    closeQuote();

    const bullet = text.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      if (list !== 'ul') { closeList(); html.push('<ul>'); list = 'ul'; }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const numbered = text.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (list !== 'ol') { closeList(); html.push('<ol>'); list = 'ol'; }
      html.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inline(text)}</p>`);
  }

  if (code !== null) html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  closeAll();
  return html.join('\n');
}
