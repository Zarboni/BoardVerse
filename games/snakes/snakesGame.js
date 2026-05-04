/**
 * Snakes & Ladders — BoardVerse
 *
 * Supports 2–4 players made up of any mix of humans and AI.
 * URL parameters:
 *   humans=N   — number of human players (1–4, default 1)
 *   ai=N       — number of AI players    (0–3, default 1)
 *   theme=X    — visual theme (classic / neon / retro, default classic)
 *
 * Player order: all humans first, then all AI players.
 * Human turns: Roll Dice button is enabled.
 * AI turns:    auto-roll after a short delay; button is disabled.
 */

// ── Board data: snakes and ladders ──────────────────────────────────────────

// Ladders: key = square you land on, value = square you jump UP to
const LADDERS = {
   4: 14,
   9: 31,
  20: 38,
  28: 84,
  40: 59,
  51: 67,
  63: 81,
  71: 91,
};

// Snakes: key = square you land on (snake head), value = square you fall DOWN to
const SNAKES = {
  17:  7,
  54: 34,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  99: 78,
};

// ── Theme application ────────────────────────────────────────────────────────
// Read ?theme= from the URL and add a body class so CSS variables kick in.
(function applyTheme() {
  const theme = new URLSearchParams(location.search).get('theme');
  if (theme && theme !== 'classic') {
    document.body.classList.add('theme-' + theme);
  }
})();

// ── Player colours (index 0–3 → p1–p4 CSS classes) ──────────────────────────
// These must match the --p1-color … --p4-color CSS variables in snakesGame.css.
// Used to colour the "Current Turn" name in the sidebar.
const PLAYER_COLORS = ['#ffb347', '#48d6ff', '#a78bfa', '#f472b6'];

// ── Parse URL parameters ─────────────────────────────────────────────────────

/** Clamp a value between min and max (inclusive). */
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

const urlParams = new URLSearchParams(location.search);

// How many human and AI players were chosen in the menu.
// Fallback: 1 human + 1 AI so the game always starts in a valid state.
let numHumans = clamp(parseInt(urlParams.get('humans') || '1', 10), 1, 4);
let numAI     = clamp(parseInt(urlParams.get('ai')     || '1', 10), 0, 3);
const total   = clamp(numHumans + numAI, 2, 4);

// If the total somehow ended up out of range, trim the excess AI players.
if (numHumans + numAI > 4) numAI = 4 - numHumans;
if (numHumans + numAI < 2 && numAI < 3) numAI++;

// ── Build the players array ──────────────────────────────────────────────────
// Each entry: { name: string, isAI: boolean }
// Humans come first so player index 0 is always a human (who starts the game).

const players = [];
for (let i = 0; i < numHumans; i++) {
  players.push({ name: `Player ${i + 1}`, isAI: false });
}
for (let i = 0; i < numAI; i++) {
  players.push({ name: `AI ${i + 1}`, isAI: true });
}

// ── Game state ───────────────────────────────────────────────────────────────

let positions     = new Array(players.length).fill(0); // 0 = not yet on board
let currentPlayer = 0;   // index into players[]
let gameOver      = false;

// Incremented on each restart so any pending AI setTimeout is silently discarded.
let gameId = 0;

// ── DOM element references ───────────────────────────────────────────────────

const boardEl      = document.getElementById('board');
const turnNameEl   = document.getElementById('turn-name');
const statusMsgEl  = document.getElementById('status-msg');
const diceEl       = document.getElementById('dice');
const rollBtn      = document.getElementById('roll-btn');
const restartBtn   = document.getElementById('restart-btn');
const playAgainBtn = document.getElementById('play-again-btn');
const winOverlay   = document.getElementById('win-overlay');
const winMsgEl     = document.getElementById('win-message');

// ── SVG overlay — snakes & ladders drawn as shapes ──────────────────────────
// These constants mirror the CSS grid values so SVG coordinates match cells.
const CELL     = 64;  // px per cell (matches CSS grid-template)
const GAP      = 2;   // px gap between cells
const PAD      = 10;  // px padding inside the .board div
const BOARD_PX = PAD * 2 + CELL * 10 + GAP * 9; // 678 — SVG viewBox size

/**
 * Return the pixel centre of board square n in the fixed SVG coordinate space.
 * The SVG uses viewBox="0 0 678 678" and scales to fit the board, so these
 * coordinates remain correct even when CSS media-queries change the cell size.
 */
function cellCenter(n) {
  const boardRow = Math.floor((n - 1) / 10); // 0 = bottom row of the board
  const domRow   = 9 - boardRow;             // 0 = top row in DOM order
  const col      = boardRow % 2 === 0
    ? (n - 1) % 10          // even board rows: left → right
    : 9 - (n - 1) % 10;    // odd board rows:  right → left
  return {
    x: PAD + col * (CELL + GAP) + CELL / 2,
    y: PAD + domRow * (CELL + GAP) + CELL / 2,
  };
}

/** Shorthand for creating SVG elements. */
function svgEl(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

/**
 * Draw a ladder between two squares as two parallel rails with cross-rungs.
 */
function drawLadder(svg, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const px = (-dy / len) * 6, py = (dx / len) * 6; // perpendicular half-width

  const g = svgEl('g');

  // Two rails running along the length of the ladder
  [[x1 - px, y1 - py, x2 - px, y2 - py],
   [x1 + px, y1 + py, x2 + px, y2 + py]].forEach(([ax, ay, bx, by]) => {
    const rail = svgEl('line');
    rail.setAttribute('x1', ax); rail.setAttribute('y1', ay);
    rail.setAttribute('x2', bx); rail.setAttribute('y2', by);
    rail.setAttribute('stroke-width', '3');
    rail.setAttribute('class', 'ladder-rail');
    g.appendChild(rail);
  });

  // Cross-rungs spaced evenly between the two ends
  const numRungs = Math.max(3, Math.floor(len / 36));
  for (let i = 1; i < numRungs; i++) {
    const t = i / numRungs;
    const rx = x1 + dx * t, ry = y1 + dy * t;
    const rung = svgEl('line');
    rung.setAttribute('x1', rx - px); rung.setAttribute('y1', ry - py);
    rung.setAttribute('x2', rx + px); rung.setAttribute('y2', ry + py);
    rung.setAttribute('stroke-width', '2');
    rung.setAttribute('class', 'ladder-rung');
    g.appendChild(rung);
  }

  svg.appendChild(g);
}

/**
 * Draw a snake as a thick S-curve from its head (x1,y1) to its tail (x2,y2).
 */
function drawSnake(svg, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const px = -dy / len, py = dx / len;      // perpendicular unit vector
  const amp = Math.min(len * 0.32, 52);     // S-bend amplitude

  // Control points offset in opposite directions → creates the S-shape
  const cp1x = x1 + dx / 3 + px * amp, cp1y = y1 + dy / 3 + py * amp;
  const cp2x = x2 - dx / 3 - px * amp, cp2y = y2 - dy / 3 - py * amp;
  const d = `M ${x1} ${y1} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x2} ${y2}`;

  const g = svgEl('g');

  // Outer body — thick, coloured stroke
  const outer = svgEl('path');
  outer.setAttribute('d', d);
  outer.setAttribute('stroke-width', '10');
  outer.setAttribute('class', 'snake-body-outer');
  g.appendChild(outer);

  // Inner highlight — thinner, lighter stripe for a 3-D tubular effect
  const inner = svgEl('path');
  inner.setAttribute('d', d);
  inner.setAttribute('stroke-width', '4');
  inner.setAttribute('class', 'snake-body-inner');
  g.appendChild(inner);

  // Head — filled circle at the starting square
  const head = svgEl('circle');
  head.setAttribute('cx', x1); head.setAttribute('cy', y1);
  head.setAttribute('r', '9');
  head.setAttribute('class', 'snake-head');
  g.appendChild(head);

  // Small eye offset slightly in the direction of body travel
  const eye = svgEl('circle');
  eye.setAttribute('cx', x1 + (dx / len) * 3 + (-dy / len) * 3);
  eye.setAttribute('cy', y1 + (dy / len) * 3 + (dx / len) * 3);
  eye.setAttribute('r', '2.5');
  eye.setAttribute('class', 'snake-eye');
  g.appendChild(eye);

  svg.appendChild(g);
}

/**
 * Inject an SVG layer over the board that draws all snakes and ladders.
 * Called at the end of buildBoard() so it's refreshed on every restart.
 */
function drawOverlays() {
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', `0 0 ${BOARD_PX} ${BOARD_PX}`);
  svg.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;' +
    'pointer-events:none;z-index:1;overflow:hidden';

  // Draw ladders first so snake bodies render on top where paths cross
  Object.entries(LADDERS).forEach(([from, to]) => {
    const a = cellCenter(+from), b = cellCenter(+to);
    drawLadder(svg, a.x, a.y, b.x, b.y);
  });

  Object.entries(SNAKES).forEach(([from, to]) => {
    const a = cellCenter(+from), b = cellCenter(+to);
    drawSnake(svg, a.x, a.y, b.x, b.y);
  });

  boardEl.appendChild(svg);
}

// ── Board building ───────────────────────────────────────────────────────────

// cells[n] holds the <div> element for board square n (1–100)
const cells = {};

/**
 * Work out which board square number sits at a given DOM grid position.
 *
 * The board is numbered 1–100 starting from the bottom-left corner.
 * Even rows (from the bottom, 0-indexed) run left → right.
 * Odd rows run right → left (the classic snaking pattern).
 */
function squareAt(domRow, col) {
  const boardRow = 9 - domRow;
  if (boardRow % 2 === 0) {
    return boardRow * 10 + col + 1;
  } else {
    return boardRow * 10 + (9 - col) + 1;
  }
}

/** Create all 100 cell <div> elements and append them to the board. */
function buildBoard() {
  boardEl.innerHTML = '';

  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const n = squareAt(row, col);

      const cell = document.createElement('div');
      cell.className = 'cell';

      // Checkerboard shading
      if ((row + col) % 2 === 0) cell.classList.add('dark');

      // Colour-code ladder starts (green) and snake heads (red)
      if (LADDERS[n]) cell.classList.add('ladder-start');
      if (SNAKES[n])  cell.classList.add('snake-start');

      // Square number shown in small text
      const numLabel = document.createElement('span');
      numLabel.className = 'cell-num';
      numLabel.textContent = n;
      cell.appendChild(numLabel);

      // Token container — players' dots are inserted here dynamically
      const tokenWrap = document.createElement('div');
      tokenWrap.className = 'cell-tokens';
      cell.appendChild(tokenWrap);

      // Tiny destination hint (e.g. ▲84 on a ladder, ▼24 on a snake)
      if (LADDERS[n]) {
        const hint = document.createElement('span');
        hint.className = 'cell-hint ladder-hint';
        hint.textContent = '▲' + LADDERS[n];
        cell.appendChild(hint);
      } else if (SNAKES[n]) {
        const hint = document.createElement('span');
        hint.className = 'cell-hint snake-hint';
        hint.textContent = '▼' + SNAKES[n];
        cell.appendChild(hint);
      }

      cells[n] = cell;
      boardEl.appendChild(cell);
    }
  }

  // Draw snake and ladder SVG shapes on top of the completed cell grid
  drawOverlays();
}

// ── Token rendering ──────────────────────────────────────────────────────────

/**
 * Remove all player tokens from the board, then re-draw them at their
 * current positions. Players at position 0 are not yet on the board.
 */
function renderTokens() {
  // Clear every token container first
  document.querySelectorAll('.cell-tokens').forEach(wrap => {
    wrap.innerHTML = '';
  });

  // Place each player's coloured dot on their square
  positions.forEach((pos, i) => {
    if (pos >= 1 && cells[pos]) {
      const token = document.createElement('div');
      token.className = `token p${i + 1}`;
      token.title = players[i].name;
      cells[pos].querySelector('.cell-tokens').appendChild(token);
    }
  });
}

// ── Dynamic sidebar builders ─────────────────────────────────────────────────
// Called once on page load. On restart only positions reset — the structure
// (cards, inputs, legend) stays the same so these don't need to run again.

/**
 * Build one player card per player inside #player-list.
 * Cards get id="card-pN" so updateUI() can toggle the active highlight.
 */
function buildPlayerCards() {
  const listEl = document.getElementById('player-list');
  listEl.innerHTML = '';

  players.forEach((player, i) => {
    const card = document.createElement('div');
    card.className = 'player-card' + (i === 0 ? ' active-player' : '');
    card.id = `card-p${i + 1}`;

    // Coloured dot on the left
    const dot = document.createElement('div');
    dot.className = `player-dot p${i + 1}`;

    // Name + position text on the right
    const info = document.createElement('div');

    const nameEl = document.createElement('div');
    nameEl.className = 'player-name';
    nameEl.id = `player-name-p${i + 1}`;
    nameEl.textContent = player.name;

    const posEl = document.createElement('div');
    posEl.className = 'player-pos';
    posEl.id = `pos-p${i + 1}`;
    posEl.textContent = 'Start (waiting)';

    info.appendChild(nameEl);
    info.appendChild(posEl);
    card.appendChild(dot);
    card.appendChild(info);
    listEl.appendChild(card);
  });
}

/**
 * Build one name input row per human player inside #name-inputs-panel.
 * AI players are not shown here — their names are fixed.
 */
function buildNameInputs() {
  const panel = document.getElementById('name-inputs-panel');
  const humanPlayers = players.filter(p => !p.isAI);

  // If somehow there are no human players, hide the panel entirely
  if (humanPlayers.length === 0) {
    panel.style.display = 'none';
    return;
  }

  // Section title
  const title = document.createElement('div');
  title.className = 'legend-title';
  title.textContent = humanPlayers.length === 1 ? 'Your Name' : 'Player Names';
  panel.appendChild(title);

  // One row per human player
  players.forEach((player, playerIndex) => {
    if (player.isAI) return;

    const row = document.createElement('div');
    row.className = 'name-row';

    // Show "P1:" label only when multiple human players are present
    if (humanPlayers.length > 1) {
      const lbl = document.createElement('span');
      lbl.className = 'name-row-label';
      lbl.textContent = `P${playerIndex + 1}:`;
      row.appendChild(lbl);
    }

    const input = document.createElement('input');
    input.className = 'name-input';
    input.id = `name-input-p${playerIndex + 1}`;
    input.type = 'text';
    input.maxLength = 20;
    input.placeholder = player.name;
    input.value = player.name;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'name-save-btn';
    saveBtn.textContent = 'Save';

    // Save the new name when the button is clicked
    saveBtn.addEventListener('click', () => {
      const newName = input.value.trim();
      if (newName) {
        players[playerIndex].name = newName;
        updateUI(); // refresh cards, legend, and turn label
      }
    });

    // Also save on Enter key
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveBtn.click();
    });

    row.appendChild(input);
    row.appendChild(saveBtn);
    panel.appendChild(row);
  });
}

/**
 * Build the player colour legend inside #legend-players.
 * Each entry gets id="legend-name-pN" so updateUI() can keep names in sync.
 */
function buildLegend() {
  const legendEl = document.getElementById('legend-players');
  legendEl.innerHTML = '';

  players.forEach((player, i) => {
    const item = document.createElement('div');
    item.className = 'legend-item';

    const swatch = document.createElement('span');
    swatch.className = `legend-token p${i + 1}`;

    const nameSpan = document.createElement('span');
    nameSpan.id = `legend-name-p${i + 1}`;
    nameSpan.textContent = player.name;

    item.appendChild(swatch);
    item.appendChild(document.createTextNode(' '));
    item.appendChild(nameSpan);
    legendEl.appendChild(item);
  });
}

// ── UI helpers ───────────────────────────────────────────────────────────────

/**
 * Refresh all sidebar elements to match the current game state.
 * Called after every move and after a name is saved.
 */
function updateUI() {
  const name  = players[currentPlayer].name;
  const color = PLAYER_COLORS[currentPlayer];

  // Current turn heading
  turnNameEl.textContent = name;
  turnNameEl.style.color = color;

  // Update every player card
  players.forEach((player, i) => {
    const card   = document.getElementById(`card-p${i + 1}`);
    const nameEl = document.getElementById(`player-name-p${i + 1}`);
    const posEl  = document.getElementById(`pos-p${i + 1}`);

    if (card)   card.classList.toggle('active-player', i === currentPlayer);
    if (nameEl) nameEl.textContent = player.name;
    if (posEl)  posEl.textContent  = positions[i] === 0 ? 'Start (waiting)' : `Square ${positions[i]}`;
  });

  // Keep legend names in sync with any name changes
  players.forEach((player, i) => {
    const legendName = document.getElementById(`legend-name-p${i + 1}`);
    if (legendName) legendName.textContent = player.name;
  });

  renderTokens();
}

/** Update the status message beneath the turn indicator. */
function setStatus(msg) {
  statusMsgEl.textContent = msg;
}

// ── Core game logic ──────────────────────────────────────────────────────────

/**
 * Return a random integer strictly between 1 and 6 inclusive.
 * This is all that a standard six-sided die can produce.
 */
function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * Flash random numbers on the dice for a short animation, then settle on
 * `finalValue` and call `callback`.
 */
function animateDice(finalValue, callback) {
  let ticks = 0;
  const totalTicks = 8;
  const timer = setInterval(() => {
    // Show a random 1–6 while "rolling" — never outside that range
    diceEl.textContent = Math.floor(Math.random() * 6) + 1;
    ticks++;
    if (ticks >= totalTicks) {
      clearInterval(timer);
      diceEl.textContent = finalValue; // settle on the real result
      callback();
    }
  }, 60);
}

/** Handle a dice roll for the current player (human or AI). */
function handleRoll() {
  if (gameOver) return;

  // Disable the button for the duration of this turn's animation
  rollBtn.disabled = true;

  const roll   = rollDice(); // strictly 1–6
  const player = currentPlayer;

  animateDice(roll, () => {
    const oldPos = positions[player];
    const rawNew = oldPos + roll;
    const name   = players[player].name;

    let msg = `${name} rolled a ${roll}.`;

    // Can't overshoot square 100 — must land exactly on it to win
    if (rawNew > 100) {
      msg += ` Needs exactly ${100 - oldPos} to finish — no move.`;
      setStatus(msg);
      switchPlayer();
      return;
    }

    // Move the player to the new square
    positions[player] = rawNew;
    msg += ` Moved to square ${rawNew}.`;

    // Check for a ladder (climb up)
    if (LADDERS[rawNew]) {
      positions[player] = LADDERS[rawNew];
      msg += ` 🪜 Ladder! Climbed up to square ${LADDERS[rawNew]}!`;
    }
    // Check for a snake head (slide down)
    else if (SNAKES[rawNew]) {
      positions[player] = SNAKES[rawNew];
      msg += ` 🐍 Snake! Slid down to square ${SNAKES[rawNew]}.`;
    }

    setStatus(msg);
    updateUI();

    // Win condition: landed exactly on 100
    if (positions[player] === 100) {
      showWin(player);
      return;
    }

    switchPlayer();
  });
}

/**
 * Advance to the next player in turn order (wraps around).
 * If the next player is AI, schedule an auto-roll after a short delay.
 */
function switchPlayer() {
  currentPlayer = (currentPlayer + 1) % players.length;
  updateUI();

  if (players[currentPlayer].isAI) {
    // Keep button disabled and auto-roll after a short thinking pause
    rollBtn.disabled = true;
    setStatus(`${players[currentPlayer].name} is thinking…`);

    // Capture the current gameId so a restart can cancel this timeout
    const capturedId = gameId;
    setTimeout(() => {
      if (gameId === capturedId) handleRoll();
    }, 1200);
  } else {
    // Human's turn — let them press the button
    rollBtn.disabled = false;
  }
}

/** Show the win overlay for the given player. */
function showWin(player) {
  gameOver = true;
  rollBtn.disabled = true;
  winMsgEl.textContent = `${players[player].name} Wins!`;
  winOverlay.classList.remove('hidden');
}

/**
 * Reset positions and turn order back to the starting state.
 * Incrementing gameId silently cancels any pending AI setTimeout.
 */
function restartGame() {
  gameId++;  // cancel any in-flight AI timeout
  positions     = new Array(players.length).fill(0);
  currentPlayer = 0;
  gameOver      = false;
  diceEl.textContent = '?';
  winOverlay.classList.add('hidden');
  rollBtn.disabled = false;
  setStatus('Press "Roll Dice" to start!');
  updateUI();
}

// ── Event listeners ──────────────────────────────────────────────────────────

rollBtn.addEventListener('click', handleRoll);
restartBtn.addEventListener('click', restartGame);
playAgainBtn.addEventListener('click', restartGame);

// ── Initialise ───────────────────────────────────────────────────────────────

buildBoard();       // draw the 10×10 grid + SVG overlays
buildPlayerCards(); // populate the player list panel
buildNameInputs();  // populate the name-input panel for human players
buildLegend();      // populate the player colour legend
updateUI();         // set initial sidebar state (turn name, positions, tokens)
