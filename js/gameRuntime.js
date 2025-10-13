import { games } from './data/games.js';

function resolveGame(gameId) {
  return games.find((entry) => entry.id === gameId);
}

function renderSelections(container, params) {
  const list = document.createElement('ul');
  list.style.listStyle = 'none';
  list.style.padding = '0';
  list.style.margin = '0';
  list.setAttribute('data-selections-list', '');

  const entries = [
    ['Players', params.get('players') || 'pvp'],
    ['Difficulty', params.get('difficulty') || 'medium'],
    ['Theme', params.get('theme') || 'classic'],
  ];

  entries.forEach(([label, value]) => {
    const item = document.createElement('li');
    item.style.marginBottom = '0.35rem';
    item.innerHTML = `<strong>${label}:</strong> ${value}`;
    list.appendChild(item);
  });

  container.appendChild(list);
}

export function initGamePlaceholder(gameId) {
  const panel = document.querySelector('[data-placeholder-panel]');
  if (!panel) {
    return;
  }

  const game = resolveGame(gameId);
  const params = new URLSearchParams(window.location.search);

  const heading = panel.querySelector('[data-placeholder-title]');
  const description = panel.querySelector('[data-placeholder-description]');
  const config = panel.querySelector('[data-placeholder-config]');

  if (heading) {
    heading.textContent = game?.name ?? 'Game';
  }

  if (description) {
    description.textContent =
      game?.tagline ?? 'This is a staging area for future interactive gameplay.';
  }

  if (config) {
    renderSelections(config, params);
  }

  // Placeholder hook for future game initialisation logic.
  console.info(`Initialising placeholder for ${gameId}`, Object.fromEntries(params.entries()));
}
