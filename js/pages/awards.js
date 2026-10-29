import { loadData } from '../data.js';
import { renderAwards } from '../render-awards.js';
import { renderChrome } from '../site.js';

renderChrome('awards');
const { index, games } = await loadData();
renderAwards(document.getElementById('root'), games, index);
