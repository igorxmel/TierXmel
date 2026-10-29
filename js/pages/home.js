import { loadData, tierlistGames, awaitingReview, unrated } from '../data.js';
import { AXES, readState, writeState, applyFilters, renderToolbar, bindDismiss } from '../filters.js';
import { renderTierGrid } from '../render-tier.js';
import { renderChrome } from '../site.js';

const aside = renderChrome('home');
const axisSwitch = document.createElement('div');
axisSwitch.className = 'axis';
aside.append(axisSwitch);

const nodes = {
  toolbar: document.getElementById('toolbar'),
  active: document.getElementById('active'),
  grid: document.getElementById('grid'),
  intro: document.getElementById('intro'),
  title: document.getElementById('title'),
};

const { index, games } = await loadData();
const state = readState();
bindDismiss(nodes.toolbar);

function renderAxisSwitch() {
  axisSwitch.innerHTML = '';
  for (const axis of AXES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'axis__btn' + (state.axis === axis.id ? ' axis__btn--on' : '');
    button.innerHTML = `${axis.label}<small>${axis.hint}</small>`;
    button.addEventListener('click', () => { state.axis = axis.id; render(); });
    axisSwitch.append(button);
  }
}

function render() {
  writeState(state);
  renderAxisSwitch();

  const visible = applyFilters(games, state);
  const ranked = tierlistGames(visible, state.axis);

  renderToolbar(nodes.toolbar, nodes.active, games, state, index, render);
  renderTierGrid(nodes.grid, ranked, state.axis, index, {
    awaiting: state.axis === 'quality' ? awaitingReview(visible) : [],
    unrated: unrated(visible),
  });

  nodes.title.textContent = state.axis === 'quality' ? 'По качеству' : 'По кайфу';
  nodes.intro.textContent = state.axis === 'quality'
    ? `Разбор по критериям, 0–900: насколько хорошо игра делает то, чем является. В рядах ${ranked.length} из ${games.length}.`
    : `Чистая субъективка, 0–100: насколько зашло мне. В рядах ${ranked.length} из ${games.length}.`;
}

render();
