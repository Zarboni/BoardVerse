import { games } from './data/games.js';

const gameGrid = document.getElementById('gameGrid');

const iconMarkup = `
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M5.5 3.5v9l7-4.5-7-4.5z" />
  </svg>
`;

function createBadge(text) {
  const span = document.createElement('span');
  span.className = 'pill';
  span.textContent = text;
  return span;
}

function createCard(game) {
  const article = document.createElement('article');
  article.className = 'game-card';
  article.dataset.gameId = game.id;

  const figure = document.createElement('figure');
  const img = document.createElement('img');
  img.src = game.image;
  img.alt = `${game.name} illustration`;
  img.width = 220;
  img.height = 220;
  figure.appendChild(img);

  const title = document.createElement('h2');
  title.textContent = game.name;

  const tagline = document.createElement('p');
  tagline.textContent = game.tagline;

  const actions = document.createElement('div');
  actions.className = 'actions';

  const badgeWrap = document.createElement('div');
  badgeWrap.className = 'badge-wrap';
  game.badges.forEach((badge) => badgeWrap.appendChild(createBadge(badge)));

  const button = document.createElement('a');
  button.className = 'play-button';
  button.href = game.menuPage;
  button.innerHTML = `${iconMarkup}<span>Play</span>`;
  button.setAttribute('aria-label', `Play ${game.name}`);

  actions.appendChild(badgeWrap);
  actions.appendChild(button);

  article.append(figure, title, tagline, actions);
  return article;
}

function populateGrid() {
  if (!gameGrid) {
    return;
  }

  const fragment = document.createDocumentFragment();
  games.forEach((game) => fragment.appendChild(createCard(game)));
  gameGrid.appendChild(fragment);
}

document.addEventListener('DOMContentLoaded', populateGrid);
