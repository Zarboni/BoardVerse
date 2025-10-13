import { games } from './data/games.js';

const DEFAULT_OPTIONS = {
  players: [
    { id: 'pvp', label: 'Player vs Player' },
    { id: 'ai', label: 'Player vs AI' },
  ],
  difficulty: [
    { id: 'easy', label: 'Easy' },
    { id: 'medium', label: 'Medium' },
    { id: 'hard', label: 'Hard' },
  ],
  themes: [
    { id: 'classic', label: 'Classic' },
    { id: 'neon', label: 'Neon' },
    { id: 'retro', label: 'Retro' },
  ],
};

function findGame(gameId) {
  return games.find((entry) => entry.id === gameId);
}

function updateHeader(game) {
  const title = document.querySelector('[data-game-title]');
  const subtitle = document.querySelector('[data-game-subtitle]');

  if (title) {
    title.textContent = game.name;
  }

  if (subtitle) {
    subtitle.textContent = game.tagline;
  }
}

function renderChips(groupEl, options) {
  groupEl.innerHTML = '';
  const fragment = document.createDocumentFragment();

  options.forEach((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-chip';
    button.dataset.value = option.id;
    button.textContent = option.label;
    button.dataset.active = index === 0 ? 'true' : 'false';
    fragment.appendChild(button);
  });

  groupEl.appendChild(fragment);
}

function initialiseChipGroups(container) {
  container.querySelectorAll('[data-option-group]').forEach((group) => {
    group.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.classList.contains('menu-chip')) {
        return;
      }

      const chips = group.querySelectorAll('.menu-chip');
      chips.forEach((chip) => {
        chip.dataset.active = chip === target ? 'true' : 'false';
      });

      if (group.dataset.optionGroup === 'themes') {
        const swatch = document.querySelector('[data-theme-swatch]');
        const label = document.querySelector('[data-theme-label]');
        if (swatch) {
          swatch.dataset.theme = target.dataset.value ?? '';
        }
        if (label) {
          label.textContent = target.textContent ?? '';
        }
      }
    });
  });
}

function applyInitialTheme() {
  const activeTheme = document.querySelector('[data-option-group="themes"] [data-active="true"]');
  const swatch = document.querySelector('[data-theme-swatch]');
  const label = document.querySelector('[data-theme-label]');

  if (activeTheme && swatch) {
    swatch.dataset.theme = activeTheme.dataset.value ?? '';
  }

  if (activeTheme && label) {
    label.textContent = activeTheme.textContent ?? '';
  }
}

function wireStartButton(game) {
  const startButton = document.querySelector('[data-start-button]');
  if (!startButton) {
    return;
  }

  startButton.addEventListener('click', () => {
    const selections = {};
    document.querySelectorAll('[data-option-group]').forEach((group) => {
      const active = group.querySelector('[data-active="true"]');
      const groupId = group.dataset.optionGroup;
      if (groupId && active) {
        selections[groupId] = active.dataset.value;
      }
    });

    const params = new URLSearchParams({
      players: selections.players ?? '',
      difficulty: selections.difficulty ?? '',
      theme: selections.themes ?? '',
    });

    const targetUrl = new URL(game.playPage ?? '#', window.location.href);
    if (params.toString()) {
      targetUrl.search = params.toString();
    }
    window.location.href = targetUrl.href;
  });
}

function initialiseMenuPage() {
  const { gameId } = document.body.dataset;
  if (!gameId) {
    console.warn('No gameId provided for this menu page.');
    return;
  }

  const game = findGame(gameId);
  if (!game) {
    console.warn(`Unable to locate game configuration for "${gameId}".`);
    return;
  }

  updateHeader(game);

  const playersGroup = document.querySelector('[data-option-group="players"]');
  const difficultyGroup = document.querySelector('[data-option-group="difficulty"]');
  const themeGroup = document.querySelector('[data-option-group="themes"]');

  if (playersGroup) {
    renderChips(playersGroup, DEFAULT_OPTIONS.players);
  }
  if (difficultyGroup) {
    renderChips(difficultyGroup, DEFAULT_OPTIONS.difficulty);
  }
  if (themeGroup) {
    renderChips(themeGroup, DEFAULT_OPTIONS.themes);
  }

  initialiseChipGroups(document);
  applyInitialTheme();
  wireStartButton(game);
}

document.addEventListener('DOMContentLoaded', initialiseMenuPage);
