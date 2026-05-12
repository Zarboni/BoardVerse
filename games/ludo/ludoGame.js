// ─────────────────────────────────────────────────────────────────────────────
// Ludo — complete game engine
// ─────────────────────────────────────────────────────────────────────────────

const params = new URLSearchParams(location.search);
const CONFIG = {
  humans: Math.max(1, parseInt(params.get('humans')) || 2),
  ai:     Math.max(0, parseInt(params.get('ai'))     || 0),
  theme:  params.get('theme') || 'classic',
};
const totalPlayers = Math.min(4, Math.max(2, CONFIG.humans + CONFIG.ai));
if (CONFIG.theme !== 'classic') document.body.classList.add('theme-' + CONFIG.theme);

// ── Player definitions (use only first `totalPlayers`) ─────────────────────
const PLAYER_DEFS = [
  { name: 'Red',    cssClass: 'red',    color: '#e53935' }, // player 0 — top-left corner
  { name: 'Blue',   cssClass: 'blue',   color: '#1e88e5' }, // player 1 — top-right corner
  { name: 'Yellow', cssClass: 'yellow', color: '#f57c00' }, // player 2 — bottom-right corner
  { name: 'Green',  cssClass: 'green',  color: '#43a047' }, // player 3 — bottom-left corner
];
// customName starts as the colour name; human players can change it via the sidebar input
PLAYER_DEFS.forEach(pd => { pd.customName = pd.name; });
const PLAYERS = PLAYER_DEFS.slice(0, totalPlayers);

function isAI(idx) { return idx >= CONFIG.humans; }

// ── Board geometry ─────────────────────────────────────────────────────────

// 52-square main path (clockwise). Row 0 = top, col 0 = left.
const MAIN_PATH = [
  [6,1],[6,2],[6,3],[6,4],[6,5],          // 0–4   Red's entry segment
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],    // 5–10  Up col 6 (left of vertical bar)
  [0,7],                                   // 11    Top-centre crossing
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],    // 12–17 Down col 8 (right of vertical bar)
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],// 18–23 Right on row 6
  [7,14],[8,14],                           // 24–25 Down right edge
  [8,13],[8,12],[8,11],[8,10],[8,9],      // 26–30 Left on row 8
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],// 31–36 Down col 8 (bottom arm)
  [14,7],[14,6],                           // 37–38 Bottom crossing
  [13,6],[12,6],[11,6],[10,6],[9,6],      // 39–43 Up col 6 (bottom arm)
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],   // 44–49 Left on row 8
  [7,0],[6,0],                             // 50–51 Up left edge
];

// Index in MAIN_PATH where each player's token enters the board
const ENTRY_POINTS = [0, 13, 26, 39];  // Red, Blue, Yellow, Green

// Path indices that are safe from capture (entry squares + star squares)
const SAFE_INDICES = new Set([0, 8, 13, 18, 26, 30, 39, 43]);

// Home-stretch: 5 coloured squares per player leading toward centre.
// pos 52 = stretch[0], pos 56 = stretch[4], pos 57 = finished (centre).
const HOME_STRETCHES = [
  [[7,1],[7,2],[7,3],[7,4],[7,5]],       // Red   — row 7 going right
  [[1,7],[2,7],[3,7],[4,7],[5,7]],       // Blue  — col 7 going down
  [[7,13],[7,12],[7,11],[7,10],[7,9]],   // Yellow — row 7 going left
  [[13,7],[12,7],[11,7],[10,7],[9,7]],   // Green — col 7 going up
];

// Visual slot positions for tokens waiting at home base (pos === -1)
const HOME_SLOTS = [
  [[2,2],[2,4],[4,2],[4,4]],             // Red    → top-left inner
  [[2,10],[2,12],[4,10],[4,12]],         // Blue   → top-right inner
  [[10,10],[10,12],[12,10],[12,12]],     // Yellow → bottom-right inner
  [[10,2],[10,4],[12,2],[12,4]],         // Green  → bottom-left inner
];

// ── 15×15 cell-type grid ──────────────────────────────────────────────────

function buildCellTypeGrid() {
  const g = Array.from({ length: 15 }, () => Array(15).fill('blank'));

  // Corner home areas (solid color, no separate inner zone — home box is an overlay)
  for (let r = 0; r < 6;  r++) for (let c = 0; c < 6;  c++) g[r][c] = 'home-red';
  for (let r = 0; r < 6;  r++) for (let c = 9; c < 15; c++) g[r][c] = 'home-blue';
  for (let r = 9; r < 15; r++) for (let c = 9; c < 15; c++) g[r][c] = 'home-yellow';
  for (let r = 9; r < 15; r++) for (let c = 0; c < 6;  c++) g[r][c] = 'home-green';

  // Cross arms → path squares (3 wide)
  for (let r = 0; r < 15; r++) { g[r][6] = 'path'; g[r][7] = 'path'; g[r][8] = 'path'; }
  for (let c = 0; c < 15; c++) { g[6][c] = 'path'; g[7][c] = 'path'; g[8][c] = 'path'; }

  // Coloured home-stretch lanes (center column/row of each arm)
  for (let c = 1;  c <= 5;  c++) g[7][c] = 'stretch-red';    // Red   — left arm
  for (let r = 1;  r <= 5;  r++) g[r][7] = 'stretch-blue';   // Blue  — top arm
  for (let c = 9;  c <= 13; c++) g[7][c] = 'stretch-yellow'; // Yellow — right arm
  for (let r = 9;  r <= 13; r++) g[r][7] = 'stretch-green';  // Green — bottom arm

  // Mark safe squares on the main path
  SAFE_INDICES.forEach(idx => {
    const [r, c] = MAIN_PATH[idx];
    if (g[r][c] === 'path') g[r][c] = 'safe';
  });

  return g;
}

const CELL_TYPES = buildCellTypeGrid();

// ── Game state ─────────────────────────────────────────────────────────────

let state = {
  tokens: [],          // { player, id, pos }  pos: -1=home | 0-51=path | 52-56=stretch | 57=done
  currentPlayer: 0,
  phase: 'waiting',    // 'waiting' | 'moving'
  diceValue: null,
  moveableTokens: [],  // token ids the current player can move
  consecutiveSixes: 0,
  gameOver: false,
  winner: null,
};

// ── Position arithmetic ────────────────────────────────────────────────────

/**
 * Returns the new pos value after rolling `roll` for the given token,
 * or null if the move is illegal.
 */
function calculateNewPos(token, playerIdx, roll) {
  const { pos } = token;
  const entry = ENTRY_POINTS[playerIdx];

  if (pos === -1)  return roll === 6 ? entry : null; // only 6 releases from home
  if (pos === 57)  return null;                        // already finished

  if (pos >= 52) {
    // Already in home stretch (pos 52–56 → stretch index 0–4)
    const s = (pos - 52) + roll;
    if (s > 5)  return null; // overshoots centre
    if (s === 5) return 57;  // exact entry to centre → finished
    return 52 + s;
  }

  // On main path (pos 0–51)
  const rel    = (pos - entry + 52) % 52; // squares travelled since entry
  const newRel = rel + roll;

  if (newRel >= 52) {
    const s = newRel - 52; // steps into home stretch
    if (s > 5)  return null;
    if (s === 5) return 57;
    return 52 + s;
  }
  return (entry + newRel) % 52;
}

/** Maps token position to a [row, col] on the 15×15 board grid, or null if not on track. */
function getTokenGridPos(token) {
  const { pos, player } = token;
  if (pos === -1)  return null; // home tokens rendered inside home-box overlay
  if (pos === 57)  return null;
  if (pos >= 52)   return HOME_STRETCHES[player][pos - 52];
  return MAIN_PATH[pos];
}

// ── Dice ──────────────────────────────────────────────────────────────────

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function animateDice(finalValue, callback) {
  const el = document.getElementById('diceDisplay');
  el.classList.add('rolling');
  let i = 0;
  const iv = setInterval(() => {
    el.textContent = DICE_FACES[Math.floor(Math.random() * 6) + 1];
    if (++i >= 10) {
      clearInterval(iv);
      el.textContent = DICE_FACES[finalValue];
      el.classList.remove('rolling');
      document.getElementById('diceResult').textContent = 'Rolled: ' + finalValue;
      callback();
    }
  }, 55);
}

// ── Core turn flow ─────────────────────────────────────────────────────────

function rollDice() {
  if (state.phase !== 'waiting' || state.gameOver) return;
  state.phase = 'rolling'; // prevent double-clicks
  const roll = Math.floor(Math.random() * 6) + 1;
  state.diceValue = roll;
  renderSidebar(); // disable button immediately
  animateDice(roll, () => computeMoveableTokens(roll));
}

function computeMoveableTokens(roll) {
  const p = state.currentPlayer;
  const moveable = [];

  for (const t of state.tokens) {
    if (t.player !== p || t.pos === 57) continue;
    if (calculateNewPos(t, p, roll) !== null) moveable.push(t.id);
  }

  if (moveable.length === 0) {
    addLog(PLAYERS[p].customName + ' rolled ' + roll + ' — no moves available');
    state.moveableTokens = [];
    state.phase = 'waiting';
    setTimeout(endTurn, 900);
    return;
  }

  state.moveableTokens = moveable;
  state.phase = 'moving';
  renderBoard();
  renderSidebar();

  if (isAI(p)) {
    // AI picks best token automatically
    const chosen = chooseAIToken(moveable, p, roll);
    setTimeout(() => moveToken(chosen), 650);
  } else if (moveable.length === 1) {
    // Only one choice — auto-move for human too
    moveToken(moveable[0]);
  }
  // Otherwise human clicks a highlighted token
}

function moveToken(tokenId) {
  const p = state.currentPlayer;
  if (state.phase !== 'moving') return;
  if (!state.moveableTokens.includes(tokenId)) return;

  const token = state.tokens.find(t => t.player === p && t.id === tokenId);
  if (!token) return;

  const oldPos  = token.pos;
  const newPos  = calculateNewPos(token, p, state.diceValue);
  if (newPos === null) return;

  const roll    = state.diceValue;
  token.pos     = newPos;
  const pname   = PLAYERS[p].customName;

  // Capture: landing on an opponent on main path at non-safe square
  if (newPos >= 0 && newPos < 52 && !SAFE_INDICES.has(newPos)) {
    for (const t of state.tokens) {
      if (t.player !== p && t.pos === newPos) {
        t.pos = -1;
        addLog(pname + ' captured ' + PLAYERS[t.player].customName + '\'s token!');
      }
    }
  }

  // Log the move
  if (newPos === 57) {
    addLog(pname + ' token ' + (tokenId + 1) + ' reached home! 🏠');
  } else if (oldPos === -1) {
    addLog(pname + ' token ' + (tokenId + 1) + ' entered the board (rolled 6)');
  } else {
    addLog(pname + ' token ' + (tokenId + 1) + ' moved ' + roll + ' steps');
  }

  // Win check: all 4 tokens finished
  if (state.tokens.filter(t => t.player === p).every(t => t.pos === 57)) {
    state.gameOver = true;
    state.winner   = p;
    state.moveableTokens = [];
    state.phase = 'done';
    renderBoard();
    renderSidebar();
    setTimeout(showWinScreen, 700);
    return;
  }

  state.moveableTokens = [];

  // Rolling a 6 earns a bonus turn
  if (roll === 6) {
    state.consecutiveSixes++;
    if (state.consecutiveSixes >= 3) {
      // Three 6s in a row: penalty — send the just-moved token back home (if not done)
      addLog('Three 6s! ' + pname + '\'s token is sent back home.');
      if (token.pos !== 57 && token.pos !== -1) token.pos = -1;
      state.consecutiveSixes = 0;
      renderBoard();
      renderSidebar();
      setTimeout(endTurn, 900);
    } else {
      addLog(pname + ' rolled 6 — bonus roll!');
      state.phase     = 'waiting';
      state.diceValue = null;
      document.getElementById('diceResult').textContent = '';
      renderBoard();
      renderSidebar();
      if (isAI(p)) setTimeout(rollDice, 750);
    }
  } else {
    state.consecutiveSixes = 0;
    renderBoard();
    renderSidebar();
    setTimeout(endTurn, 450);
  }
}

function endTurn() {
  if (state.gameOver) return;
  state.currentPlayer = (state.currentPlayer + 1) % totalPlayers;
  state.phase         = 'waiting';
  state.diceValue     = null;
  state.moveableTokens = [];
  document.getElementById('diceResult').textContent = '';
  renderBoard();
  renderSidebar();
  if (isAI(state.currentPlayer)) setTimeout(rollDice, 750);
}

// ── AI ─────────────────────────────────────────────────────────────────────

function chooseAIToken(moveableIds, playerIdx, roll) {
  let bestId = moveableIds[0], bestScore = -Infinity;

  for (const id of moveableIds) {
    const token  = state.tokens.find(t => t.player === playerIdx && t.id === id);
    const newPos = calculateNewPos(token, playerIdx, roll);
    let score = 0;

    if (newPos === 57) {
      score = 100000; // always finish if possible
    } else if (newPos >= 52) {
      score = 5000 + (newPos - 52) * 200; // deep in home stretch
    } else if (newPos >= 0) {
      // Check if we land on an opponent (capture)
      const captures = state.tokens.filter(t => t.player !== playerIdx && t.pos === newPos);
      score += captures.length * 3000;

      // Prefer safe landing squares
      if (SAFE_INDICES.has(newPos)) score += 500;

      // Progress bonus: how far along the path
      const entry = ENTRY_POINTS[playerIdx];
      const rel   = (newPos - entry + 52) % 52;
      score += rel * 10;
    }

    // Bringing a new token onto the board is generally good
    if (token.pos === -1) score = Math.max(score, 300);

    if (score > bestScore) { bestScore = score; bestId = id; }
  }
  return bestId;
}

// ── Rendering ──────────────────────────────────────────────────────────────

// Home box absolute positions (as % of board) for each player's inner zone
const HOME_BOX_POS = [
  { left: '6.667%', top: '6.667%'  },  // Red    — top-left
  { left: '66.667%', top: '6.667%' },  // Blue   — top-right
  { left: '66.667%', top: '66.667%' }, // Yellow — bottom-right
  { left: '6.667%', top: '66.667%' },  // Green  — bottom-left
];

// [top%, left%] positions for 1–4 tokens sharing a track cell
const CELL_STACK = [
  [[50, 50]],
  [[34, 50], [66, 50]],
  [[34, 34], [34, 66], [66, 50]],
  [[34, 34], [34, 66], [66, 34], [66, 66]],
];

function renderBoard() {
  const boardEl = document.getElementById('ludoBoard');
  boardEl.innerHTML = '';

  // ── 15×15 cell grid ──────────────────────────────────────────────────────
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const type = CELL_TYPES[r][c];
      const cell = document.createElement('div');
      cell.className = 'cell cell-' + type;
      if (type === 'safe') {
        const star = document.createElement('span');
        star.className = 'cell-star';
        star.textContent = '★';
        cell.appendChild(star);
      }
      boardEl.appendChild(cell);
    }
  }

  // ── Home box overlays + home tokens ──────────────────────────────────────
  for (let p = 0; p < totalPlayers; p++) {
    const box = document.createElement('div');
    box.className = 'home-box home-box-' + PLAYER_DEFS[p].cssClass;
    box.style.left = HOME_BOX_POS[p].left;
    box.style.top  = HOME_BOX_POS[p].top;

    // Tokens waiting at home sit inside the overlay at fixed 2×2 positions
    for (const token of state.tokens) {
      if (token.player !== p || token.pos !== -1) continue;
      const tokenEl = document.createElement('div');
      tokenEl.className = 'token token-' + PLAYER_DEFS[p].cssClass + ' home-slot-' + token.id;

      const canClick = state.phase === 'moving'
        && state.currentPlayer === p
        && state.moveableTokens.includes(token.id)
        && !isAI(p);
      if (canClick) {
        tokenEl.classList.add('moveable');
        tokenEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (state.phase === 'moving' && state.moveableTokens.includes(token.id)) {
            moveToken(token.id);
          }
        });
      }

      box.appendChild(tokenEl);
    }

    boardEl.appendChild(box);
  }

  // ── Large center diamond overlay ──────────────────────────────────────────
  const diamond = document.createElement('div');
  diamond.className = 'center-diamond';
  diamond.innerHTML =
    '<div class="center-tri tri-left"></div>'  +
    '<div class="center-tri tri-top"></div>'   +
    '<div class="center-tri tri-right"></div>' +
    '<div class="center-tri tri-bottom"></div>';
  boardEl.appendChild(diamond);

  // ── Track tokens (grouped by cell for stacking) ───────────────────────────
  const cells = boardEl.querySelectorAll('.cell');
  const cellGroups = {};

  for (const token of state.tokens) {
    if (token.player >= totalPlayers || token.pos === -1 || token.pos === 57) continue;
    const gpos = getTokenGridPos(token);
    if (!gpos) continue;
    const key = gpos[0] + '_' + gpos[1];
    (cellGroups[key] = cellGroups[key] || []).push(token);
  }

  for (const [key, tokens] of Object.entries(cellGroups)) {
    const [row, col] = key.split('_').map(Number);
    const targetCell = cells[row * 15 + col];
    if (!targetCell) continue;

    const n = Math.min(tokens.length, 4);
    const positions = CELL_STACK[n - 1];

    tokens.slice(0, 4).forEach((token, i) => {
      const [top, left] = positions[i];
      const tokenEl = document.createElement('div');
      tokenEl.className = 'token token-' + PLAYER_DEFS[token.player].cssClass;
      tokenEl.style.top       = top  + '%';
      tokenEl.style.left      = left + '%';
      tokenEl.style.transform = 'translate(-50%, -50%)';

      const canClick = state.phase === 'moving'
        && state.currentPlayer === token.player
        && state.moveableTokens.includes(token.id)
        && !isAI(token.player);
      if (canClick) {
        tokenEl.classList.add('moveable');
        tokenEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (state.phase === 'moving' && state.moveableTokens.includes(token.id)) {
            moveToken(token.id);
          }
        });
      }

      targetCell.appendChild(tokenEl);
    });
  }
}

function renderSidebar() {
  // Player status cards
  const statusEl = document.getElementById('playersStatus');
  statusEl.innerHTML = '';

  PLAYERS.forEach((pl, idx) => {
    const myTokens = state.tokens.filter(t => t.player === idx);
    const atHome  = myTokens.filter(t => t.pos === -1).length;
    const onBoard = myTokens.filter(t => t.pos >= 0 && t.pos < 57).length;
    const done    = myTokens.filter(t => t.pos === 57).length;
    const active  = idx === state.currentPlayer && !state.gameOver;

    const div = document.createElement('div');
    div.className = 'player-indicator' + (active ? ' active' : '');
    div.style.borderLeftColor = pl.color;

    const label = isAI(idx) ? pl.customName + ' (AI)' : pl.customName;
    div.innerHTML =
      '<div class="p-name" style="color:' + pl.color + '">' +
        label + (active ? ' ▶' : '') +
      '</div>' +
      '<div class="p-tokens">' +
        '<span title="At home">🏠 ' + atHome + '</span>' +
        '<span title="On board">🎮 ' + onBoard + '</span>' +
        '<span title="Finished">✅ ' + done + '</span>' +
      '</div>';

    statusEl.appendChild(div);
  });

  // Roll button state
  const rollBtn = document.getElementById('rollBtn');
  const canRoll = !state.gameOver
    && state.phase === 'waiting'
    && !isAI(state.currentPlayer);

  rollBtn.disabled = !canRoll;

  if (state.gameOver) {
    rollBtn.textContent = 'Game Over';
  } else if (state.phase === 'rolling') {
    rollBtn.textContent = 'Rolling…';
  } else if (isAI(state.currentPlayer)) {
    rollBtn.textContent = 'AI is playing…';
  } else if (state.phase === 'moving') {
    rollBtn.textContent = 'Select a token ↑';
  } else {
    rollBtn.textContent = 'Roll Dice';
  }
}

function addLog(msg) {
  const el = document.getElementById('logEntries');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = msg;
  el.appendChild(entry);
  el.scrollTop = el.scrollHeight;
  // Keep only the latest 30 entries
  while (el.children.length > 30) el.removeChild(el.firstChild);
}

function showWinScreen() {
  const pl = PLAYERS[state.winner];
  const titleEl = document.getElementById('winTitle');
  titleEl.textContent = isAI(state.winner)
    ? pl.customName + ' (AI) Wins!'
    : pl.customName + ' Wins!';
  titleEl.style.color = pl.color;
  document.getElementById('winOverlay').classList.add('visible');
}

// ── Initialise game ────────────────────────────────────────────────────────

function initGame() {
  state = {
    tokens: [],
    currentPlayer: 0,
    phase: 'waiting',
    diceValue: null,
    moveableTokens: [],
    consecutiveSixes: 0,
    gameOver: false,
    winner: null,
  };

  for (let p = 0; p < totalPlayers; p++) {
    for (let id = 0; id < 4; id++) {
      state.tokens.push({ player: p, id, pos: -1 });
    }
  }

  document.getElementById('diceDisplay').textContent = '🎲';
  document.getElementById('diceResult').textContent  = '';
  document.getElementById('logEntries').innerHTML    = '';
  document.getElementById('winOverlay').classList.remove('visible');
}

// ── Player name inputs ─────────────────────────────────────────────────────

function buildNameInputs() {
  const panel = document.getElementById('nameInputsPanel');
  if (!panel || CONFIG.humans === 0) {
    if (panel) panel.style.display = 'none';
    return;
  }

  const title = document.createElement('div');
  title.className = 'names-label';
  title.textContent = CONFIG.humans === 1 ? 'Your Name' : 'Player Names';
  panel.appendChild(title);

  for (let idx = 0; idx < CONFIG.humans; idx++) {
    const pd  = PLAYER_DEFS[idx];
    const row = document.createElement('div');
    row.className = 'name-row';

    // Colour label so the player knows which tokens they control
    const lbl = document.createElement('span');
    lbl.className   = 'name-row-label';
    lbl.textContent = pd.name + ':';
    lbl.style.color = pd.color;
    row.appendChild(lbl);

    const input = document.createElement('input');
    input.className   = 'name-input';
    input.type        = 'text';
    input.maxLength   = 20;
    input.placeholder = pd.name;
    input.value       = pd.customName;

    const saveBtn = document.createElement('button');
    saveBtn.className   = 'name-save-btn';
    saveBtn.textContent = 'Save';

    saveBtn.addEventListener('click', () => {
      const newName = input.value.trim();
      if (newName) {
        pd.customName = newName;
        renderSidebar();
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveBtn.click();
    });

    row.appendChild(input);
    row.appendChild(saveBtn);
    panel.appendChild(row);
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initGame();
  buildNameInputs();
  renderBoard();
  renderSidebar();

  const modeDesc = CONFIG.humans + ' Human' + (CONFIG.humans !== 1 ? 's' : '')
    + (CONFIG.ai > 0 ? ' · ' + CONFIG.ai + ' AI' : '');
  addLog('Game started! ' + modeDesc + ' · Roll the dice to begin.');

  document.getElementById('rollBtn').addEventListener('click', rollDice);

  document.getElementById('newGameBtn').addEventListener('click', () => {
    initGame();
    renderBoard();
    renderSidebar();
    addLog('New game! Roll the dice to begin.');
    if (isAI(state.currentPlayer)) setTimeout(rollDice, 750);
  });

  document.getElementById('playAgainBtn').addEventListener('click', () => {
    initGame();
    renderBoard();
    renderSidebar();
    addLog('New game! Roll the dice to begin.');
    if (isAI(state.currentPlayer)) setTimeout(rollDice, 750);
  });

  document.getElementById('menuBtn').addEventListener('click', () => {
    window.location.href = 'ludoMenu.html';
  });

  // If first player is AI, start their turn automatically
  if (isAI(state.currentPlayer)) setTimeout(rollDice, 850);
});
