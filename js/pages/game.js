import { loadData, loadReview, bySlug } from '../data.js';
import { renderCard } from '../render-card.js';
import { renderChrome, slugFromPath, routes } from '../site.js';

renderChrome('game');

const root = document.getElementById('root');
const slug = slugFromPath();
const { index, games } = await loadData();
const game = slug ? bySlug(games, slug) : null;

if (!game) {
  root.innerHTML = `<p class="note">Игра не найдена. <a href="${routes.home()}">Вернуться к тирлисту</a>.</p>`;
} else {
  document.title = `${game.title}: оценка`;
  const review = await loadReview(game);
  renderCard(root, game, index, review);
}
