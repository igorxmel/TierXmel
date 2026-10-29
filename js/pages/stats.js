import { loadData } from '../data.js';
import { renderStats } from '../render-stats.js';
import { renderChrome } from '../site.js';

renderChrome('stats');
const { index, games } = await loadData();
renderStats(document.getElementById('root'), games, index);
