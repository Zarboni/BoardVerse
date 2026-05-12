/**
 * Chess — BoardVerse
 *
 * Full chess engine in plain vanilla JavaScript.
 * Supports PvP and Player vs AI (minimax + alpha-beta, depth 1/2/3).
 * URL parameters:
 *   players=pvp|ai        (default pvp)
 *   difficulty=easy|medium|hard  (default medium)
 *   theme=classic|neon|retro     (default classic)
 */

'use strict';

// ── Config ───────────────────────────────────────────────────────────────────

const params = new URLSearchParams(location.search);
const CONFIG = {
  players:    params.get('players')    || 'pvp',
  difficulty: params.get('difficulty') || 'medium',
  theme:      params.get('theme')      || 'classic'
};

// Apply theme class
document.body.className = CONFIG.theme !== 'classic' ? 'theme-' + CONFIG.theme : '';

// ── Constants ────────────────────────────────────────────────────────────────

// Unicode chess symbols  [color][type]
const SYMBOLS = {
  w: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
  b: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }
};

// Material values for AI evaluation
const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

// AI search depth per difficulty level
const AI_DEPTH = { easy: 1, medium: 2, hard: 3 };

// Piece-square tables for positional bonuses (white perspective; flip row for black)
const PST = {
  P: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [ 5,  5, 10, 25, 25, 10,  5,  5],
    [ 0,  0,  0, 20, 20,  0,  0,  0],
    [ 5, -5,-10,  0,  0,-10, -5,  5],
    [ 5, 10, 10,-20,-20, 10, 10,  5],
    [ 0,  0,  0,  0,  0,  0,  0,  0]
  ],
  N: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
  ],
  B: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20]
  ],
  R: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [ 5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [ 0,  0,  0,  5,  5,  0,  0,  0]
  ],
  Q: [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20]
  ],
  K: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [ 20, 30, 10,  0,  0, 10, 30, 20]
  ]
};

// ── Game State ───────────────────────────────────────────────────────────────

let state = null; // initialised in startNewGame()

// ── Board Initialisation ─────────────────────────────────────────────────────

/**
 * Build the starting chess position.
 * Row 0 = rank 8 (black back rank), row 7 = rank 1 (white back rank).
 * Col 0 = file a, col 7 = file h.
 */
function initBoard() {
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  const board = Array.from({length: 8}, () => Array(8).fill(null));

  // Black pieces (rows 0–1)
  back.forEach((t, c) => { board[0][c] = { type: t, color: 'b', hasMoved: false }; });
  for (let c = 0; c < 8; c++) board[1][c] = { type: 'P', color: 'b', hasMoved: false };

  // White pieces (rows 6–7)
  for (let c = 0; c < 8; c++) board[6][c] = { type: 'P', color: 'w', hasMoved: false };
  back.forEach((t, c) => { board[7][c] = { type: t, color: 'w', hasMoved: false }; });

  return board;
}

// ── Deep copy helpers ────────────────────────────────────────────────────────

function deepCopyBoard(board) {
  return board.map(row => row.map(cell => cell ? { type: cell.type, color: cell.color, hasMoved: cell.hasMoved } : null));
}

function deepCopyState(st) {
  return {
    enPassant: st.enPassant ? [st.enPassant[0], st.enPassant[1]] : null,
    castling:  { wK: st.castling.wK, wQ: st.castling.wQ, bK: st.castling.bK, bQ: st.castling.bQ }
  };
}

// ── Raw Move Generation ──────────────────────────────────────────────────────

/**
 * Return all squares a piece at (row, col) can potentially reach, ignoring
 * whether the move leaves the king in check. Castling legality (through-check)
 * is handled separately in getLegalMoves.
 *
 * @param {Array}  board  8×8 board array
 * @param {number} row
 * @param {number} col
 * @param {Object} st     minimal state: { enPassant, castling }
 * @returns {Array}  [[row, col], ...]
 */
function getMovesForPiece(board, row, col, st) {
  const piece = board[row][col];
  if (!piece) return [];

  const { type, color } = piece;
  const enemy = color === 'w' ? 'b' : 'w';
  const moves = [];

  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function isEmpty(r, c)  { return inBounds(r, c) && board[r][c] === null; }
  function isEnemy(r, c)  { return inBounds(r, c) && board[r][c] !== null && board[r][c].color === enemy; }
  function notOwn(r, c)   { return inBounds(r, c) && (board[r][c] === null || board[r][c].color === enemy); }

  // Slide in a direction until blocked
  function slide(dr, dc) {
    let r = row + dr, c = col + dc;
    while (inBounds(r, c)) {
      if (board[r][c] === null) {
        moves.push([r, c]);
      } else {
        if (board[r][c].color === enemy) moves.push([r, c]);
        break;
      }
      r += dr;
      c += dc;
    }
  }

  switch (type) {

    case 'P': {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;

      // Forward 1
      if (isEmpty(row + dir, col)) {
        moves.push([row + dir, col]);
        // Forward 2 from starting rank
        if (row === startRow && isEmpty(row + 2 * dir, col)) {
          moves.push([row + 2 * dir, col]);
        }
      }

      // Diagonal captures
      for (const dc of [-1, 1]) {
        const nr = row + dir, nc = col + dc;
        if (isEnemy(nr, nc)) {
          moves.push([nr, nc]);
        }
        // En passant
        if (st.enPassant && nr === st.enPassant[0] && nc === st.enPassant[1]) {
          moves.push([nr, nc]);
        }
      }
      break;
    }

    case 'N': {
      const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of offsets) {
        if (notOwn(row + dr, col + dc)) moves.push([row + dr, col + dc]);
      }
      break;
    }

    case 'B':
      slide(-1, -1); slide(-1, 1); slide(1, -1); slide(1, 1);
      break;

    case 'R':
      slide(-1, 0); slide(1, 0); slide(0, -1); slide(0, 1);
      break;

    case 'Q':
      slide(-1, -1); slide(-1, 1); slide(1, -1); slide(1, 1);
      slide(-1, 0);  slide(1, 0);  slide(0, -1); slide(0, 1);
      break;

    case 'K': {
      // Normal king moves
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        if (notOwn(row + dr, col + dc)) moves.push([row + dr, col + dc]);
      }

      // Castling — only add destination squares; through-check filtering in getLegalMoves
      if (!piece.hasMoved) {
        // Kingside
        const ksRight = color === 'w' ? st.castling.wK : st.castling.bK;
        if (ksRight) {
          const rook = board[row][7];
          if (rook && rook.type === 'R' && rook.color === color && !rook.hasMoved &&
              board[row][5] === null && board[row][6] === null) {
            moves.push([row, col + 2]);
          }
        }
        // Queenside
        const qsRight = color === 'w' ? st.castling.wQ : st.castling.bQ;
        if (qsRight) {
          const rook = board[row][0];
          if (rook && rook.type === 'R' && rook.color === color && !rook.hasMoved &&
              board[row][1] === null && board[row][2] === null && board[row][3] === null) {
            moves.push([row, col - 2]);
          }
        }
      }
      break;
    }
  }

  return moves;
}

// ── Check Detection ──────────────────────────────────────────────────────────

/**
 * Return true if `color`'s king is currently attacked by any enemy piece.
 * Uses raw moves (no castling) to avoid infinite recursion.
 */
function isInCheck(board, color) {
  let kr = -1, kc = -1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'K' && p.color === color) { kr = r; kc = c; }
    }
  }
  if (kr === -1) return false; // no king (shouldn't happen in real game)

  const noSpecial = { enPassant: null, castling: { wK: false, wQ: false, bK: false, bQ: false } };
  const enemy = color === 'w' ? 'b' : 'w';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === enemy) {
        const rawMoves = getMovesForPiece(board, r, c, noSpecial);
        if (rawMoves.some(([mr, mc]) => mr === kr && mc === kc)) return true;
      }
    }
  }
  return false;
}

// ── Legal Move Filtering ─────────────────────────────────────────────────────

/**
 * Return all truly legal moves for a piece (raw moves filtered to those that
 * don't leave own king in check). Castling is additionally verified to not
 * pass through an attacked square.
 */
function getLegalMoves(board, row, col, st) {
  const piece = board[row][col];
  if (!piece) return [];

  const raw = getMovesForPiece(board, row, col, st);

  return raw.filter(([tr, tc]) => {
    // Castling: king must not be in check currently, and must not pass through
    // an attacked square.
    if (piece.type === 'K' && Math.abs(tc - col) === 2) {
      // Already in check? Can't castle.
      if (isInCheck(board, piece.color)) return false;

      // King must not pass through an attacked square
      const passCol = tc > col ? col + 1 : col - 1;
      const b2 = deepCopyBoard(board);
      b2[tr][passCol] = { ...piece, hasMoved: true };
      b2[row][col] = null;
      if (isInCheck(b2, piece.color)) return false;
    }

    // General: apply move, check king safety
    const b2 = deepCopyBoard(board);
    applyMove(b2, row, col, tr, tc, st, 'Q');
    return !isInCheck(b2, piece.color);
  });
}

// ── Applying Moves (board mutation) ─────────────────────────────────────────

/**
 * Mutate `board` to reflect the move from (fr,fc) to (tr,tc).
 * Handles castling, en passant capture, and pawn promotion.
 * Does NOT update `st` (that is the caller's job for the real state).
 *
 * @param {Array}  board
 * @param {number} fr, fc  from square
 * @param {number} tr, tc  to square
 * @param {Object} st      { enPassant, castling }
 * @param {string} promoteTo   piece type to promote to ('Q','R','B','N')
 */
function applyMove(board, fr, fc, tr, tc, st, promoteTo) {
  const piece = board[fr][fc];

  // Castling: move the rook
  if (piece.type === 'K' && Math.abs(tc - fc) === 2) {
    const rookCol    = tc > fc ? 7 : 0;
    const newRookCol = tc > fc ? tc - 1 : tc + 1;
    board[tr][newRookCol] = { ...board[tr][rookCol], hasMoved: true };
    board[tr][rookCol]    = null;
  }

  // En passant: remove the captured pawn (it sits on the same rank as the mover)
  if (piece.type === 'P' && fc !== tc && board[tr][tc] === null) {
    board[fr][tc] = null;
  }

  // Move the piece
  board[tr][tc] = { ...piece, hasMoved: true };
  board[fr][fc] = null;

  // Pawn promotion
  if (piece.type === 'P' && (tr === 0 || tr === 7)) {
    board[tr][tc] = { type: promoteTo || 'Q', color: piece.color, hasMoved: true };
  }
}

// ── SAN (Algebraic Notation) Generation ─────────────────────────────────────

/**
 * Generate simplified Standard Algebraic Notation for a move BEFORE it is
 * applied to the real state.
 */
function generateSAN(fr, fc, tr, tc, promoteTo) {
  const piece    = state.board[fr][fc];
  const captured = state.board[tr][tc];
  const files    = 'abcdefgh';
  const toFile   = files[tc];
  const toRank   = 8 - tr;

  // Castling
  if (piece.type === 'K') {
    if (tc - fc === 2)  return 'O-O';
    if (fc - tc === 2)  return 'O-O-O';
  }

  // En passant: pawn moves diagonally to empty square
  const isEP = piece.type === 'P' && fc !== tc && !captured;

  let san = '';

  if (piece.type === 'P') {
    if (captured || isEP) {
      san = files[fc] + 'x' + toFile + toRank;
    } else {
      san = toFile + toRank;
    }
    if (promoteTo) san += '=' + promoteTo;
  } else {
    // Disambiguation: check if another same-type piece can reach the same square
    let ambigFile = false, ambigRank = false;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === fr && c === fc) continue;
        const other = state.board[r][c];
        if (!other || other.type !== piece.type || other.color !== piece.color) continue;
        const otherMoves = getLegalMoves(state.board, r, c, state);
        if (otherMoves.some(([mr, mc]) => mr === tr && mc === tc)) {
          if (c === fc) ambigRank = true;
          else          ambigFile = true;
        }
      }
    }

    san = piece.type;
    if (ambigFile) san += files[fc];
    if (ambigRank) san += (8 - fr);
    if (captured)  san += 'x';
    san += toFile + toRank;
  }

  // Check / checkmate annotation
  const b2 = deepCopyBoard(state.board);
  applyMove(b2, fr, fc, tr, tc, state, promoteTo || 'Q');
  const oppColor = piece.color === 'w' ? 'b' : 'w';
  if (isInCheck(b2, oppColor)) {
    // Check if it's checkmate
    const noMoves = !hasAnyLegalMoves(b2, oppColor, deepCopyState(state));
    san += noMoves ? '#' : '+';
  }

  return san;
}

/**
 * Return true if `color` has at least one legal move on `board`.
 * Used for checkmate/stalemate detection and SAN annotation.
 */
function hasAnyLegalMoves(board, color, st) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color) {
        if (getLegalMoves(board, r, c, st).length > 0) return true;
      }
    }
  }
  return false;
}

// ── Full Move Execution ──────────────────────────────────────────────────────

/**
 * Apply a complete move to the real game state, update all derived data,
 * re-render, and check for game-over conditions.
 */
function makeMove(fr, fc, tr, tc, promoteTo) {
  if (state.gameOver) return;

  const piece    = state.board[fr][fc];
  const captured = state.board[tr][tc];

  // Pawn promotion — ask the human if we don't have a choice yet
  if (piece.type === 'P' && (tr === 0 || tr === 7) && !promoteTo) {
    if (CONFIG.players === 'ai' && piece.color === 'b') {
      // AI always promotes to queen
      promoteTo = 'Q';
    } else {
      // Show dialog; execution resumes when user picks a piece
      state.pendingPromotion = { fr, fc, tr, tc };
      showPromotionDialog(piece.color);
      return;
    }
  }

  // En passant: the captured pawn is on the same rank as the moving pawn
  let enPassantCapturedPiece = null;
  if (piece.type === 'P' && fc !== tc && !captured) {
    enPassantCapturedPiece = state.board[fr][tc];
  }

  // Generate SAN before modifying the board
  const san = generateSAN(fr, fc, tr, tc, promoteTo);

  // Apply the move
  applyMove(state.board, fr, fc, tr, tc, state, promoteTo);

  // Track captured material
  if (captured) {
    if (piece.color === 'w') state.capturedByWhite.push(captured);
    else                     state.capturedByBlack.push(captured);
  }
  if (enPassantCapturedPiece) {
    if (piece.color === 'w') state.capturedByWhite.push(enPassantCapturedPiece);
    else                     state.capturedByBlack.push(enPassantCapturedPiece);
  }

  // Update castling rights
  if (piece.type === 'K') {
    state.castling[piece.color + 'K'] = false;
    state.castling[piece.color + 'Q'] = false;
  }
  if (piece.type === 'R' || captured?.type === 'R') {
    if (fr === 7 && fc === 7) state.castling.wK = false;
    if (fr === 7 && fc === 0) state.castling.wQ = false;
    if (fr === 0 && fc === 7) state.castling.bK = false;
    if (fr === 0 && fc === 0) state.castling.bQ = false;
    // Also revoke if the rook's target square is a corner (capturing a rook)
    if (tr === 7 && tc === 7) state.castling.wK = false;
    if (tr === 7 && tc === 0) state.castling.wQ = false;
    if (tr === 0 && tc === 7) state.castling.bK = false;
    if (tr === 0 && tc === 0) state.castling.bQ = false;
  }

  // Update en passant target square
  if (piece.type === 'P' && Math.abs(tr - fr) === 2) {
    state.enPassant = [(fr + tr) / 2, fc];
  } else {
    state.enPassant = null;
  }

  // Half-move clock (50-move rule)
  state.halfMoves = (piece.type === 'P' || captured || enPassantCapturedPiece) ? 0 : state.halfMoves + 1;

  // Record in move history
  if (piece.color === 'w') {
    state.moveHistory.push({ white: san, black: '' });
  } else {
    if (state.moveHistory.length > 0) {
      state.moveHistory[state.moveHistory.length - 1].black = san;
    } else {
      // Black moved first (shouldn't happen in standard chess, but handle gracefully)
      state.moveHistory.push({ white: '...', black: san });
    }
  }

  state.lastMove = { from: [fr, fc], to: [tr, tc] };
  state.selected  = null;
  state.validMoves = [];

  // Switch turn
  state.turn = state.turn === 'w' ? 'b' : 'w';

  // Re-render
  renderBoard();
  renderSidebar();

  // Check for game-over conditions; if game continues and it's AI's turn, schedule AI
  if (!checkGameState()) {
    if (CONFIG.players === 'ai' && state.turn === 'b' && !state.gameOver) {
      setTimeout(doAIMove, 400);
    }
  }
}

// ── Game State Check ─────────────────────────────────────────────────────────

/**
 * Determine whether the game is over (checkmate, stalemate, 50-move rule).
 * Updates state.gameOver and state.gameResult, then shows the overlay.
 * Returns true if the game is over.
 */
function checkGameState() {
  const color = state.turn;

  // Collect all legal moves for the side to move
  const allMoves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p && p.color === color) {
        const legal = getLegalMoves(state.board, r, c, state);
        legal.forEach(m => allMoves.push({ from: [r, c], to: m }));
      }
    }
  }

  if (allMoves.length === 0) {
    state.gameOver = true;
    if (isInCheck(state.board, color)) {
      state.gameResult = { type: 'checkmate', winner: color === 'w' ? 'black' : 'white' };
    } else {
      state.gameResult = { type: 'stalemate' };
    }
    setTimeout(showGameOver, 600);
    return true;
  }

  // 50-move rule
  if (state.halfMoves >= 100) {
    state.gameOver = true;
    state.gameResult = { type: 'fifty-move' };
    setTimeout(showGameOver, 600);
    return true;
  }

  return false;
}

// ── AI: Evaluation & Minimax ─────────────────────────────────────────────────

/** Static board evaluation from white's perspective (positive = white better). */
function evaluateBoard(board) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val    = PIECE_VALUES[p.type] || 0;
      const pstRow = p.color === 'w' ? r : 7 - r;
      const pst    = PST[p.type] ? PST[p.type][pstRow][c] : 0;
      score += p.color === 'w' ? (val + pst) : -(val + pst);
    }
  }
  return score;
}

/**
 * Minimax search with alpha-beta pruning.
 * @param {Array}   board
 * @param {number}  depth     remaining plies
 * @param {number}  alpha
 * @param {number}  beta
 * @param {boolean} maximizing   true = white's turn
 * @param {Object}  st           mini state for move generation
 * @returns {{score: number, move: Object|null}}
 */
function minimax(board, depth, alpha, beta, maximizing, st) {
  if (depth === 0) {
    return { score: evaluateBoard(board), move: null };
  }

  const color = maximizing ? 'w' : 'b';
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color) {
        getLegalMoves(board, r, c, st).forEach(([tr, tc]) => {
          moves.push({ fr: r, fc: c, tr, tc });
        });
      }
    }
  }

  if (moves.length === 0) {
    // Terminal node: checkmate or stalemate
    if (isInCheck(board, color)) {
      return { score: maximizing ? -25000 - depth : 25000 + depth, move: null };
    }
    return { score: 0, move: null };
  }

  // Light move ordering: captures first (improves alpha-beta cut-offs)
  moves.sort((a, b) => {
    const aCapture = board[a.tr][a.tc] !== null ? 1 : 0;
    const bCapture = board[b.tr][b.tc] !== null ? 1 : 0;
    return bCapture - aCapture;
  });

  let best = { score: maximizing ? -Infinity : Infinity, move: null };

  for (const mv of moves) {
    const b2  = deepCopyBoard(board);
    const st2 = deepCopyState(st);

    // Determine en passant for child node
    const movingPiece = board[mv.fr][mv.fc];
    applyMove(b2, mv.fr, mv.fc, mv.tr, mv.tc, st2, 'Q');
    st2.enPassant = (movingPiece.type === 'P' && Math.abs(mv.tr - mv.fr) === 2)
      ? [(mv.fr + mv.tr) / 2, mv.fc]
      : null;

    // Update castling rights for child node
    if (movingPiece.type === 'K') {
      st2.castling[movingPiece.color + 'K'] = false;
      st2.castling[movingPiece.color + 'Q'] = false;
    }
    if (movingPiece.type === 'R') {
      if (mv.fr === 7 && mv.fc === 7) st2.castling.wK = false;
      if (mv.fr === 7 && mv.fc === 0) st2.castling.wQ = false;
      if (mv.fr === 0 && mv.fc === 7) st2.castling.bK = false;
      if (mv.fr === 0 && mv.fc === 0) st2.castling.bQ = false;
    }

    const result = minimax(b2, depth - 1, alpha, beta, !maximizing, st2);

    if (maximizing) {
      if (result.score > best.score) best = { score: result.score, move: mv };
      alpha = Math.max(alpha, result.score);
    } else {
      if (result.score < best.score) best = { score: result.score, move: mv };
      beta = Math.min(beta, result.score);
    }

    if (beta <= alpha) break; // alpha-beta cut-off
  }

  return best;
}

/** Trigger the AI to find and play its move. */
function doAIMove() {
  if (state.gameOver || state.turn !== 'b') return;

  const depth  = AI_DEPTH[CONFIG.difficulty] || 2;
  const result = minimax(
    deepCopyBoard(state.board),
    depth,
    -Infinity,
    Infinity,
    false, // AI is black = minimising
    deepCopyState(state)
  );

  if (result.move) {
    makeMove(result.move.fr, result.move.fc, result.move.tr, result.move.tc, 'Q');
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

/** Render the full board, applying all visual highlights. */
function renderBoard() {
  const boardEl = document.getElementById('chessBoard');
  boardEl.innerHTML = '';

  // Pre-compute in-check king square for current side
  let checkKingRow = -1, checkKingCol = -1;
  if (isInCheck(state.board, state.turn)) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (p && p.type === 'K' && p.color === state.turn) {
          checkKingRow = r;
          checkKingCol = c;
        }
      }
    }
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      sq.dataset.row = r;
      sq.dataset.col = c;

      // Selection highlight
      if (state.selected && state.selected[0] === r && state.selected[1] === c) {
        sq.classList.add('selected');
      }

      // Valid move / capture highlights
      const isValid = state.validMoves.some(([vr, vc]) => vr === r && vc === c);
      if (isValid) {
        sq.classList.add(state.board[r][c] ? 'valid-capture' : 'valid-move');
      }

      // Last move highlight
      if (state.lastMove) {
        const [lmfr, lmfc] = state.lastMove.from;
        const [lmtr, lmtc] = state.lastMove.to;
        if ((r === lmfr && c === lmfc) || (r === lmtr && c === lmtc)) {
          sq.classList.add('last-move');
        }
      }

      // King-in-check highlight
      if (r === checkKingRow && c === checkKingCol) {
        sq.classList.add('in-check');
      }

      // Piece
      const piece = state.board[r][c];
      if (piece) {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'piece ' + (piece.color === 'w' ? 'white' : 'black');
        pieceEl.textContent = SYMBOLS[piece.color][piece.type];
        sq.appendChild(pieceEl);
      }

      sq.addEventListener('click', () => onSquareClick(r, c));
      boardEl.appendChild(sq);
    }
  }
}

/** Handle a square being clicked. */
function onSquareClick(r, c) {
  if (state.gameOver || state.pendingPromotion) return;
  if (CONFIG.players === 'ai' && state.turn === 'b') return; // AI's turn

  const piece = state.board[r][c];

  if (state.selected) {
    const [sr, sc] = state.selected;
    const isValid  = state.validMoves.some(([vr, vc]) => vr === r && vc === c);

    if (isValid) {
      makeMove(sr, sc, r, c);
    } else if (piece && piece.color === state.turn) {
      // Select a different piece of the same colour
      state.selected   = [r, c];
      state.validMoves = getLegalMoves(state.board, r, c, state);
      renderBoard();
    } else {
      // Deselect
      state.selected   = null;
      state.validMoves = [];
      renderBoard();
    }
  } else {
    if (piece && piece.color === state.turn) {
      state.selected   = [r, c];
      state.validMoves = getLegalMoves(state.board, r, c, state);
      renderBoard();
    }
  }
}

/** Update sidebar: turn indicator, captured pieces, move history. */
function renderSidebar() {
  // Turn indicator
  const turnEl = document.getElementById('playerTurn');
  if (state.gameOver) {
    turnEl.textContent = 'Game Over';
    turnEl.className   = 'player-turn';
  } else if (CONFIG.players === 'ai' && state.turn === 'b') {
    turnEl.textContent = 'AI Thinking…';
    turnEl.className   = 'player-turn black-turn';
  } else {
    turnEl.textContent = state.turn === 'w' ? "White's Turn" : "Black's Turn";
    turnEl.className   = 'player-turn ' + (state.turn === 'w' ? 'white-turn' : 'black-turn');
  }

  // Captured pieces — white captured black pieces, black captured white pieces
  document.getElementById('capturedByWhite').textContent =
    state.capturedByWhite.map(p => SYMBOLS.b[p.type]).join('');
  document.getElementById('capturedByBlack').textContent =
    state.capturedByBlack.map(p => SYMBOLS.w[p.type]).join('');

  // Move history
  const histEl = document.getElementById('moveHistory');
  histEl.innerHTML = '';
  state.moveHistory.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'move-entry';
    row.innerHTML =
      '<span class="move-num">' + (i + 1) + '.</span>' +
      '<span class="move-san">' + (entry.white || '') + '</span>' +
      '<span class="move-san">' + (entry.black || '') + '</span>';
    histEl.appendChild(row);
  });
  histEl.scrollTop = histEl.scrollHeight;
}

/** Render rank (1–8) and file (a–h) coordinate labels. */
function renderLabels() {
  const rankEl  = document.getElementById('rankLabels');
  const fileEl  = document.getElementById('fileLabels');
  const filesEl = document.getElementById('fileLabels');

  rankEl.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    const span = document.createElement('span');
    span.textContent = 8 - r;
    rankEl.appendChild(span);
  }

  filesEl.innerHTML = '';
  const files = 'abcdefgh';
  for (let c = 0; c < 8; c++) {
    const span = document.createElement('span');
    span.textContent = files[c];
    filesEl.appendChild(span);
  }

  // Grid placement handles alignment — no manual margin needed
  fileEl.style.marginLeft = '0';
}

// ── Promotion Dialog ─────────────────────────────────────────────────────────

function showPromotionDialog(color) {
  const overlay   = document.getElementById('promotionOverlay');
  const piecesEl  = document.getElementById('promoPieces');
  piecesEl.innerHTML = '';

  ['Q', 'R', 'B', 'N'].forEach(type => {
    const btn = document.createElement('button');
    btn.className   = 'promo-piece-btn';
    btn.textContent = SYMBOLS[color][type];
    btn.title       = { Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' }[type];
    btn.onclick = () => {
      overlay.style.display = 'none';
      const { fr, fc, tr, tc } = state.pendingPromotion;
      state.pendingPromotion   = null;
      makeMove(fr, fc, tr, tc, type);
    };
    piecesEl.appendChild(btn);
  });

  overlay.style.display = 'flex';
}

// ── Game Over Overlay ────────────────────────────────────────────────────────

function showGameOver() {
  const overlay  = document.getElementById('gameOverOverlay');
  const titleEl  = document.getElementById('resultTitle');
  const subtitleEl = document.getElementById('resultSubtitle');

  const result = state.gameResult;

  if (result.type === 'checkmate') {
    const winnerName = result.winner === 'white' ? 'White' : 'Black';
    titleEl.textContent   = winnerName + ' Wins!';
    subtitleEl.textContent = 'By checkmate';
  } else if (result.type === 'stalemate') {
    titleEl.textContent   = "It's a Draw!";
    subtitleEl.textContent = 'Stalemate — no legal moves';
  } else {
    titleEl.textContent   = "It's a Draw!";
    subtitleEl.textContent = '50-move rule';
  }

  overlay.style.display = 'flex';
}

// ── New Game ─────────────────────────────────────────────────────────────────

function startNewGame() {
  state = {
    board:            initBoard(),
    turn:             'w',
    selected:         null,
    validMoves:       [],
    enPassant:        null,
    castling:         { wK: true, wQ: true, bK: true, bQ: true },
    lastMove:         null,
    halfMoves:        0,
    moveHistory:      [],
    capturedByWhite:  [],
    capturedByBlack:  [],
    gameOver:         false,
    gameResult:       null,
    pendingPromotion: null
  };

  document.getElementById('gameOverOverlay').style.display    = 'none';
  document.getElementById('promotionOverlay').style.display   = 'none';

  renderBoard();
  renderSidebar();
  renderLabels();
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  startNewGame();

  document.getElementById('newGameBtn').onclick  = startNewGame;
  document.getElementById('playAgainBtn').onclick = startNewGame;
  document.getElementById('menuBtn').onclick      = () => { location.href = 'chessMenu.html'; };
});
