/* ──────────────────────────────────────────────────────────────────────────
   Checkers — game logic
   BoardVerse project — plain vanilla JS, no dependencies
   ────────────────────────────────────────────────────────────────────────── */

'use strict';

// ── Configuration from URL params ────────────────────────────────────────
const params = new URLSearchParams(location.search);
const CONFIG = {
  players:    params.get('players')    || 'pvp',   // 'pvp' | 'ai'
  difficulty: params.get('difficulty') || 'medium', // 'easy' | 'medium' | 'hard'
  theme:      params.get('theme')      || 'classic' // 'classic' | 'neon' | 'retro'
};

// Apply theme class to body
if (CONFIG.theme !== 'classic') {
  document.body.className = `theme-${CONFIG.theme}`;
}

// ── Board representation ─────────────────────────────────────────────────
//  board[row][col]:  null  or  { color: 'red'|'white', king: boolean }
//  row 0 = top of board (white's back rank / red's promotion rank)
//  row 7 = bottom of board (red's back rank / white's promotion rank)
//  Playable dark squares: (row + col) % 2 === 1

// ── Game state ───────────────────────────────────────────────────────────
let state = {
  board:          [],
  turn:           'red',   // 'red' | 'white'
  selected:       null,    // [row, col] or null
  validMoves:     [],      // moves for the currently selected piece
  capturedRed:    0,
  capturedWhite:  0,
  gameOver:       false
};

// ── AI depth table ───────────────────────────────────────────────────────
const AI_DEPTH = { easy: 2, medium: 4, hard: 6 };

// ────────────────────────────────────────────────────────────────────────
//  BOARD INITIALISATION
// ────────────────────────────────────────────────────────────────────────
function initBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));

  // White pieces — top 3 rows on dark squares
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { color: 'white', king: false };
    }
  }

  // Red pieces — bottom 3 rows on dark squares
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { color: 'red', king: false };
    }
  }

  return board;
}

// ────────────────────────────────────────────────────────────────────────
//  MOVE GENERATION
// ────────────────────────────────────────────────────────────────────────

/**
 * Returns all jump-move sequences available for the piece at (row, col).
 * Each returned move is a full sequence ending at its final square:
 *   { fr, fc, tr, tc, captures: [{r, c}, ...] }
 *
 * `visited` is a Set of "r,c" strings of enemy squares already captured
 * in the current sequence (prevents jumping the same piece twice).
 */
function getJumps(board, row, col, piece, visited = new Set()) {
  const jumps = [];

  const dirs = piece.king
    ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
    : piece.color === 'red'
      ? [[-1, -1], [-1, 1]]  // red moves up (decreasing row index)
      : [[1, -1],  [1, 1]];  // white moves down (increasing row index)

  for (const [dr, dc] of dirs) {
    const midR = row + dr,  midC = col + dc;
    const toR  = row + 2 * dr, toC = col + 2 * dc;

    if (toR < 0 || toR > 7 || toC < 0 || toC > 7) continue;

    const mid  = board[midR][midC];
    const dest = board[toR][toC];
    const midKey = `${midR},${midC}`;

    // Must jump over an enemy that hasn't been captured yet in this chain,
    // and land on an empty square
    if (mid && mid.color !== piece.color && !dest && !visited.has(midKey)) {
      const newVisited = new Set(visited);
      newVisited.add(midKey);

      // Build a temporary board to recurse for multi-jumps
      const b2 = board.map(r => r.map(c => (c ? { ...c } : null)));
      b2[toR][toC]   = piece;
      b2[row][col]   = null;
      b2[midR][midC] = null;

      // Check for king promotion mid-sequence — per standard rules the
      // turn ends if a king is made during a jump, so we do NOT recurse
      // further in that case (promotion flag handled in executeMove).
      const becomesKing = !piece.king &&
        ((piece.color === 'red'   && toR === 0) ||
         (piece.color === 'white' && toR === 7));

      let further = [];
      if (!becomesKing) {
        further = getJumps(b2, toR, toC, piece, newVisited);
      }

      if (further.length === 0) {
        // Terminal jump
        jumps.push({ fr: row, fc: col, tr: toR, tc: toC, captures: [{ r: midR, c: midC }] });
      } else {
        // Extend each further jump with this capture prepended
        for (const j of further) {
          jumps.push({
            fr: row,
            fc: col,
            tr: j.tr,
            tc: j.tc,
            captures: [{ r: midR, c: midC }, ...j.captures]
          });
        }
      }
    }
  }

  return jumps;
}

/**
 * Returns all simple (non-capture) diagonal moves for the piece at (row, col).
 */
function getSimpleMoves(board, row, col, piece) {
  const moves = [];

  const dirs = piece.king
    ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
    : piece.color === 'red'
      ? [[-1, -1], [-1, 1]]
      : [[1, -1],  [1, 1]];

  for (const [dr, dc] of dirs) {
    const tr = row + dr, tc = col + dc;
    if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8 && !board[tr][tc]) {
      moves.push({ fr: row, fc: col, tr, tc, captures: [] });
    }
  }

  return moves;
}

/**
 * Returns ALL legal moves for `color` on the given board.
 * If any jump exists, ONLY jumps are returned (forced capture rule).
 */
function getAllMovesForColor(board, color) {
  const jumps  = [];
  const simple = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;

      const j = getJumps(board, r, c, p);
      const s = getSimpleMoves(board, r, c, p);
      jumps.push(...j);
      simple.push(...s);
    }
  }

  // Forced captures: if any jump exists, player must jump
  return jumps.length > 0 ? jumps : simple;
}

/**
 * Returns the legal moves available for the piece at (row, col).
 * If `mustJumpOnly` is true (forced capture is in effect) and this piece
 * has no jumps, an empty array is returned so the player cannot select it.
 */
function getMovesForPiece(board, row, col, color, mustJumpOnly) {
  const piece = board[row][col];
  if (!piece || piece.color !== color) return [];

  const jumps = getJumps(board, row, col, piece);
  if (mustJumpOnly && jumps.length === 0) return []; // cannot use this piece
  if (jumps.length > 0) return jumps;

  return getSimpleMoves(board, row, col, piece);
}

// ────────────────────────────────────────────────────────────────────────
//  EXECUTING A MOVE
// ────────────────────────────────────────────────────────────────────────
function executeMove(move) {
  const { fr, fc, tr, tc, captures } = move;
  const piece = { ...state.board[fr][fc] };

  // Remove captured pieces and update count
  for (const { r, c } of captures) {
    const captured = state.board[r][c];
    if (captured) {
      if (captured.color === 'red')   state.capturedRed++;
      else                            state.capturedWhite++;
    }
    state.board[r][c] = null;
  }

  // Move piece to destination
  state.board[tr][tc] = piece;
  state.board[fr][fc] = null;

  // King promotion
  if (!piece.king) {
    if ((piece.color === 'red'   && tr === 0) ||
        (piece.color === 'white' && tr === 7)) {
      state.board[tr][tc].king = true;
    }
  }

  // Reset selection
  state.selected   = null;
  state.validMoves = [];

  // Switch turn
  state.turn = state.turn === 'red' ? 'white' : 'red';

  renderBoard();
  renderSidebar();
  checkGameState();

  // Trigger AI if it is now white's turn
  if (!state.gameOver && CONFIG.players === 'ai' && state.turn === 'white') {
    // Disable board interaction during AI thinking
    setTimeout(doAIMove, 500);
  }
}

// ────────────────────────────────────────────────────────────────────────
//  WIN / LOSS DETECTION
// ────────────────────────────────────────────────────────────────────────
function checkGameState() {
  let redCount = 0, whiteCount = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      if (p.color === 'red')   redCount++;
      else                     whiteCount++;
    }
  }

  if (redCount   === 0) { endGame('white'); return; }
  if (whiteCount === 0) { endGame('red');   return; }

  // Check if current player has any moves at all
  const moves = getAllMovesForColor(state.board, state.turn);
  if (moves.length === 0) {
    // Current player cannot move — they lose
    endGame(state.turn === 'red' ? 'white' : 'red');
  }
}

function endGame(winner) {
  state.gameOver = true;

  const titleEl    = document.getElementById('resultTitle');
  const subtitleEl = document.getElementById('resultSubtitle');
  const emojiEl    = document.getElementById('resultEmoji');

  if (winner === 'red') {
    emojiEl.textContent    = '🔴';
    titleEl.textContent    = CONFIG.players === 'ai' ? 'You Win!' : 'Red Wins!';
  } else {
    emojiEl.textContent    = '⚪';
    titleEl.textContent    = CONFIG.players === 'ai' ? 'AI Wins!' : 'White Wins!';
  }

  subtitleEl.textContent = 'The opponent has no moves remaining.';
  document.getElementById('gameOverOverlay').style.display = 'flex';
}

// ────────────────────────────────────────────────────────────────────────
//  AI — MINIMAX WITH ALPHA-BETA PRUNING
// ────────────────────────────────────────────────────────────────────────

/**
 * Static board evaluation.
 * Positive score  → advantage for white (AI)
 * Negative score  → advantage for red  (human)
 */
function evaluateBoard(board) {
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;

      let val = p.king ? 250 : 100;

      // Positional bonus — reward advancement toward promotion
      if (!p.king) {
        if (p.color === 'white') val += r * 6;        // white advances toward row 7
        else                     val += (7 - r) * 6;  // red advances toward row 0
      }

      // Small center-control bonus for kings
      if (p.king) {
        const distCenter = Math.abs(r - 3.5) + Math.abs(c - 3.5);
        val += Math.round((7 - distCenter) * 4);
      }

      if (p.color === 'white') score += val;
      else                     score -= val;
    }
  }

  return score;
}

/**
 * Apply a move to a board copy and return the new board.
 * Does NOT mutate the original board.
 */
function applyMoveToBoard(board, move) {
  const b2    = board.map(r => r.map(c => (c ? { ...c } : null)));
  const piece = { ...b2[move.fr][move.fc] };

  for (const { r, c } of move.captures) b2[r][c] = null;
  b2[move.tr][move.tc] = piece;
  b2[move.fr][move.fc] = null;

  // King promotion
  if (!piece.king) {
    if ((piece.color === 'red'   && move.tr === 0) ||
        (piece.color === 'white' && move.tr === 7)) {
      b2[move.tr][move.tc].king = true;
    }
  }

  return b2;
}

/**
 * Minimax with alpha-beta pruning.
 * `maximizing` = true means it is white's (AI's) turn to move.
 */
function minimaxCheckers(board, depth, alpha, beta, maximizing) {
  const color = maximizing ? 'white' : 'red';
  const moves = getAllMovesForColor(board, color);

  // Terminal conditions
  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0) {
      // Current colour has no moves → they lose
      return maximizing ? -20000 : 20000;
    }
    return evaluateBoard(board);
  }

  if (maximizing) {
    let best = -Infinity;
    for (const mv of moves) {
      const b2    = applyMoveToBoard(board, mv);
      const score = minimaxCheckers(b2, depth - 1, alpha, beta, false);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break; // beta cutoff
    }
    return best;
  } else {
    let best = Infinity;
    for (const mv of moves) {
      const b2    = applyMoveToBoard(board, mv);
      const score = minimaxCheckers(b2, depth - 1, alpha, beta, true);
      if (score < best) best = score;
      if (best < beta)  beta = best;
      if (beta <= alpha) break; // alpha cutoff
    }
    return best;
  }
}

/**
 * Select and execute the best move for the AI (white).
 */
function doAIMove() {
  if (state.gameOver || state.turn !== 'white') return;

  const depth = AI_DEPTH[CONFIG.difficulty] ?? 4;
  const moves = getAllMovesForColor(state.board, 'white');
  if (moves.length === 0) return;

  // For easy difficulty add deliberate randomness
  if (CONFIG.difficulty === 'easy' && Math.random() < 0.35) {
    const randMove = moves[Math.floor(Math.random() * moves.length)];
    executeMove(randMove);
    return;
  }

  let bestScore = -Infinity;
  let bestMove  = moves[0];

  for (const mv of moves) {
    const b2    = applyMoveToBoard(state.board, mv);
    const score = minimaxCheckers(b2, depth - 1, -Infinity, Infinity, false);
    if (score > bestScore) {
      bestScore = score;
      bestMove  = mv;
    }
  }

  executeMove(bestMove);
}

// ────────────────────────────────────────────────────────────────────────
//  INTERACTION — PIECE SELECTION
// ────────────────────────────────────────────────────────────────────────
function selectPiece(row, col) {
  if (state.gameOver) return;

  // In AI mode, prevent the human from moving white pieces
  if (CONFIG.players === 'ai' && state.turn === 'white') return;

  const allMoves  = getAllMovesForColor(state.board, state.turn);
  const mustJump  = allMoves.some(m => m.captures.length > 0);
  const pieceMoves = getMovesForPiece(state.board, row, col, state.turn, mustJump);

  // If piece has no legal moves (e.g. forced to jump elsewhere), ignore click
  if (pieceMoves.length === 0) return;

  state.selected   = [row, col];
  state.validMoves = pieceMoves;
  renderBoard();
}

// ────────────────────────────────────────────────────────────────────────
//  RENDERING — BOARD
// ────────────────────────────────────────────────────────────────────────
function renderBoard() {
  const boardEl = document.getElementById('checkersBoard');
  boardEl.innerHTML = '';

  // Determine which pieces MUST capture (for visual hint)
  const allMoves  = getAllMovesForColor(state.board, state.turn);
  const mustJump  = allMoves.some(m => m.captures.length > 0);
  const mustPieces = new Set(
    mustJump
      ? allMoves.filter(m => m.captures.length > 0).map(m => `${m.fr},${m.fc}`)
      : []
  );

  const isAITurn = CONFIG.players === 'ai' && state.turn === 'white';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq     = document.createElement('div');
      const isDark = (r + c) % 2 === 1;
      sq.className = `square ${isDark ? 'dark-sq' : 'light-sq'}`;

      const piece       = state.board[r][c];
      const isSelected  = state.selected && state.selected[0] === r && state.selected[1] === c;
      const isValidDest = state.validMoves.some(m => m.tr === r && m.tc === c);
      const isMustSrc   = isDark && !state.selected && mustPieces.has(`${r},${c}`) && !isAITurn;

      if (isSelected)  sq.classList.add('selected');
      if (isValidDest) sq.classList.add('valid-move');
      if (isMustSrc)   sq.classList.add('must-capture');

      // Make the square clickable for move destination
      if (isDark && isValidDest && !isAITurn) {
        sq.classList.add('clickable');
        sq.addEventListener('click', () => {
          const mv = state.validMoves.find(m => m.tr === r && m.tc === c);
          if (mv) executeMove(mv);
        });
      }

      // Render piece if present
      if (piece) {
        const pieceEl    = document.createElement('div');
        const colorClass = piece.color === 'red' ? 'red' : 'white-p';
        const kingClass  = piece.king ? ' king' : '';
        const selClass   = isSelected ? ' selected-piece' : '';
        pieceEl.className = `piece ${colorClass}${kingClass}${selClass}`;

        // Allow selection only when it's that colour's turn and not mid-AI-turn
        if (isDark && piece.color === state.turn && !isAITurn) {
          pieceEl.addEventListener('click', e => {
            e.stopPropagation();
            selectPiece(r, c);
          });
        }

        sq.appendChild(pieceEl);
      }

      boardEl.appendChild(sq);
    }
  }

  // Keep coordinate label column widths in sync with actual square sizes
  syncCoordWidths();
}

/** Sync the column-label widths to match the rendered square size. */
function syncCoordWidths() {
  const board = document.getElementById('checkersBoard');
  const first = board.querySelector('.square');
  if (!first) return;
  const sqSize = first.getBoundingClientRect().width;
  document.querySelectorAll('.col-labels span').forEach(el => {
    el.style.width = `${sqSize}px`;
  });
}

// ────────────────────────────────────────────────────────────────────────
//  RENDERING — SIDEBAR
// ────────────────────────────────────────────────────────────────────────
function renderSidebar() {
  // Piece counts
  let redCount = 0, whiteCount = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      if (p.color === 'red')   redCount++;
      else                     whiteCount++;
    }
  }
  document.getElementById('redCount').textContent   = redCount;
  document.getElementById('whiteCount').textContent = whiteCount;

  // Turn indicator
  const turnEl = document.getElementById('playerTurn');
  if (state.turn === 'red') {
    turnEl.textContent = CONFIG.players === 'ai' ? 'Your Turn (Red)' : "Red's Turn";
    turnEl.className   = 'player-turn red-turn';
  } else {
    turnEl.textContent = CONFIG.players === 'ai' ? 'AI Thinking…' : "White's Turn";
    turnEl.className   = 'player-turn white-turn';
  }

  // Captured pieces display
  const capEl = document.getElementById('capturesDisplay');
  capEl.innerHTML = '';

  for (let i = 0; i < state.capturedRed; i++) {
    const dot = document.createElement('div');
    dot.className = 'cap-piece cap-red';
    dot.title = 'Red captured';
    capEl.appendChild(dot);
  }
  for (let i = 0; i < state.capturedWhite; i++) {
    const dot = document.createElement('div');
    dot.className = 'cap-piece cap-white';
    dot.title = 'White captured';
    capEl.appendChild(dot);
  }

  // Mode info
  const modeEl = document.getElementById('modeInfo');
  if (CONFIG.players === 'ai') {
    const diff = CONFIG.difficulty.charAt(0).toUpperCase() + CONFIG.difficulty.slice(1);
    modeEl.textContent = `vs AI — ${diff}`;
  } else {
    modeEl.textContent = 'Player vs Player';
  }
}

// ────────────────────────────────────────────────────────────────────────
//  NEW GAME
// ────────────────────────────────────────────────────────────────────────
function startNewGame() {
  state = {
    board:         initBoard(),
    turn:          'red',
    selected:      null,
    validMoves:    [],
    capturedRed:   0,
    capturedWhite: 0,
    gameOver:      false
  };

  document.getElementById('gameOverOverlay').style.display = 'none';
  renderBoard();
  renderSidebar();
}

// ────────────────────────────────────────────────────────────────────────
//  BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  startNewGame();

  document.getElementById('newGameBtn').addEventListener('click', startNewGame);
  document.getElementById('playAgainBtn').addEventListener('click', startNewGame);
  document.getElementById('menuBtn').addEventListener('click', () => {
    location.href = 'checkersMenu.html';
  });

  // Keep column labels aligned when the window is resized
  window.addEventListener('resize', syncCoordWidths);
});
