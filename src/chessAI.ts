// Pure local Minimax + Alpha-Beta + Quiescence + Opening Book Chess AI
// Zero external API keys or backend calls — runs 100% in the browser.

export type PieceColor = 'w' | 'b';
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type AIDifficulty = 'novice' | 'tactician' | 'grandmaster';

export interface SimplePiece {
  type: PieceType;
  color: PieceColor;
  hasMoved?: boolean;
}

export interface EnPassantTarget {
  r: number;
  c: number;
  pawnR: number;
  pawnC: number;
}

export interface SearchMove {
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  capture: boolean;
  castle?: 'k' | 'q';
  rookFromC?: number;
  rookToC?: number;
  enPassant?: boolean;
  captureR?: number;
  captureC?: number;
  promotion?: PieceType;
}

const PIECE_VALUES: Record<PieceType, number> = {
  pawn: 100,
  knight: 320,
  bishop: 335,
  rook: 500,
  queen: 900,
  king: 20000
};

// Piece-square tables from White's perspective (row 0 = rank 8, row 7 = rank 1)
const PST_PAWN = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [12, 14, 22, 30, 30, 22, 14, 12],
  [6, 8, 14, 28, 28, 14, 8, 6],
  [2, 4, 12, 24, 24, 10, 4, 2],
  [4, -4, -8, 4, 4, -8, -4, 4],
  [6, 10, 10, -22, -22, 10, 10, 6],
  [0, 0, 0, 0, 0, 0, 0, 0]
];

const PST_KNIGHT = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 4, 4, 0, -20, -40],
  [-30, 4, 14, 18, 18, 14, 4, -30],
  [-30, 6, 18, 24, 24, 18, 6, -30],
  [-30, 4, 18, 24, 24, 18, 4, -30],
  [-30, 8, 14, 18, 18, 14, 8, -30],
  [-40, -20, 0, 6, 6, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50]
];

const PST_BISHOP = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 4, 0, 0, 0, 0, 4, -10],
  [-10, 8, 10, 12, 12, 10, 8, -10],
  [-10, 2, 12, 14, 14, 12, 2, -10],
  [-10, 6, 8, 14, 14, 8, 6, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 8, 0, 0, 0, 0, 8, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20]
];

const PST_ROOK = [
  [0, 0, 2, 6, 6, 2, 0, 0],
  [8, 14, 14, 14, 14, 14, 14, 8],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 2, 8, 8, 2, 0, 0]
];

const PST_QUEEN = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 6, 6, 6, 6, 0, -10],
  [-5, 0, 6, 8, 8, 6, 0, -5],
  [0, 0, 6, 8, 8, 6, 0, -5],
  [-10, 4, 6, 6, 6, 6, 0, -10],
  [-10, 0, 4, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20]
];

const PST_KING_MID = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -25, -25, -20, -20, -10],
  [16, 18, 0, -4, -4, 0, 18, 16],
  [20, 32, 12, 0, 0, 12, 32, 20]
];

const PST_KING_END = [
  [-50, -30, -20, -20, -20, -20, -30, -50],
  [-30, -15, 0, 5, 5, 0, -15, -30],
  [-20, 0, 16, 22, 22, 16, 0, -20],
  [-20, 5, 22, 30, 30, 22, 5, -20],
  [-20, 5, 22, 30, 30, 22, 5, -20],
  [-20, 0, 16, 22, 22, 16, 0, -20],
  [-30, -15, 0, 5, 5, 0, -15, -30],
  [-50, -30, -20, -20, -20, -20, -30, -50]
];

function cloneSimBoard(board: (SimplePiece | null)[][]): (SimplePiece | null)[][] {
  return board.map((row) =>
    row.map((cell) => (cell ? { type: cell.type, color: cell.color, hasMoved: Boolean(cell.hasMoved) } : null))
  );
}

function isSquareAttacked(
  board: (SimplePiece | null)[][],
  targetR: number,
  targetC: number,
  byColor: PieceColor
): boolean {
  // Pawn attacks
  const pawnDir = byColor === 'w' ? 1 : -1; // Pawns of byColor attack from targetR + pawnDir
  const pr = targetR + pawnDir;
  if (pr >= 0 && pr < 8) {
    for (const dc of [-1, 1]) {
      const pc = targetC + dc;
      if (pc >= 0 && pc < 8) {
        const p = board[pr][pc];
        if (p && p.color === byColor && p.type === 'pawn') return true;
      }
    }
  }

  // Knight attacks
  const knightJumps = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1]
  ];
  for (const [dr, dc] of knightJumps) {
    const nr = targetR + dr;
    const nc = targetC + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr][nc];
      if (p && p.color === byColor && p.type === 'knight') return true;
    }
  }

  // King attacks
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = targetR + dr;
      const nc = targetC + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = board[nr][nc];
        if (p && p.color === byColor && p.type === 'king') return true;
      }
    }
  }

  // Orthogonal rays (rook / queen)
  const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of orthoDirs) {
    for (let step = 1; step < 8; step++) {
      const nr = targetR + dr * step;
      const nc = targetC + dc * step;
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) break;
      const p = board[nr][nc];
      if (p) {
        if (p.color === byColor && (p.type === 'rook' || p.type === 'queen')) return true;
        break;
      }
    }
  }

  // Diagonal rays (bishop / queen)
  const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of diagDirs) {
    for (let step = 1; step < 8; step++) {
      const nr = targetR + dr * step;
      const nc = targetC + dc * step;
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) break;
      const p = board[nr][nc];
      if (p) {
        if (p.color === byColor && (p.type === 'bishop' || p.type === 'queen')) return true;
        break;
      }
    }
  }

  return false;
}

function isColorInCheck(board: (SimplePiece | null)[][], color: PieceColor): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === 'king') {
        return isSquareAttacked(board, r, c, color === 'w' ? 'b' : 'w');
      }
    }
  }
  return true;
}

interface AppliedUndo {
  movedPiece: SimplePiece;
  prevHasMoved: boolean;
  capturedPiece: SimplePiece | null;
  captureR: number;
  captureC: number;
  castleRook?: SimplePiece | null;
  castleRookPrevMoved?: boolean;
  prevType: PieceType;
}

function applyMove(board: (SimplePiece | null)[][], m: SearchMove): {
  undo: AppliedUndo;
  nextEp: EnPassantTarget | null;
} {
  const piece = board[m.fromR][m.fromC]!;
  const prevType = piece.type;
  const prevHasMoved = Boolean(piece.hasMoved);

  let captureR = m.toR;
  let captureC = m.toC;
  if (m.enPassant && m.captureR !== undefined && m.captureC !== undefined) {
    captureR = m.captureR;
    captureC = m.captureC;
  }

  const capturedPiece = board[captureR][captureC];
  if (m.enPassant) {
    board[captureR][captureC] = null;
  }

  board[m.fromR][m.fromC] = null;
  board[m.toR][m.toC] = piece;
  piece.hasMoved = true;

  if (m.promotion) {
    piece.type = m.promotion;
  }

  let castleRook: SimplePiece | null = null;
  let castleRookPrevMoved = false;
  if (m.castle && m.rookFromC !== undefined && m.rookToC !== undefined) {
    castleRook = board[m.fromR][m.rookFromC];
    if (castleRook) {
      castleRookPrevMoved = Boolean(castleRook.hasMoved);
      board[m.fromR][m.rookFromC] = null;
      board[m.fromR][m.rookToC] = castleRook;
      castleRook.hasMoved = true;
    }
  }

  let nextEp: EnPassantTarget | null = null;
  if (prevType === 'pawn' && Math.abs(m.toR - m.fromR) === 2) {
    nextEp = {
      r: (m.fromR + m.toR) / 2,
      c: m.fromC,
      pawnR: m.toR,
      pawnC: m.toC
    };
  }

  return {
    undo: {
      movedPiece: piece,
      prevHasMoved,
      capturedPiece,
      captureR,
      captureC,
      castleRook,
      castleRookPrevMoved,
      prevType
    },
    nextEp
  };
}

function undoMove(board: (SimplePiece | null)[][], m: SearchMove, u: AppliedUndo): void {
  u.movedPiece.type = u.prevType;
  u.movedPiece.hasMoved = u.prevHasMoved;
  board[m.fromR][m.fromC] = u.movedPiece;
  board[m.toR][m.toC] = null;

  if (u.capturedPiece) {
    board[u.captureR][u.captureC] = u.capturedPiece;
  }

  if (m.castle && u.castleRook && m.rookFromC !== undefined && m.rookToC !== undefined) {
    u.castleRook.hasMoved = Boolean(u.castleRookPrevMoved);
    board[m.fromR][m.rookToC] = null;
    board[m.fromR][m.rookFromC] = u.castleRook;
  }
}

function generateLegalMoves(
  board: (SimplePiece | null)[][],
  color: PieceColor,
  ep: EnPassantTarget | null,
  capturesOnly = false
): SearchMove[] {
  const moves: SearchMove[] = [];
  const opp: PieceColor = color === 'w' ? 'b' : 'w';
  const dir = color === 'w' ? -1 : 1;
  const promoRank = color === 'w' ? 0 : 7;
  const startRank = color === 'w' ? 6 : 1;

  const pushValidated = (m: SearchMove) => {
    const { undo } = applyMove(board, m);
    const inCheck = isColorInCheck(board, color);
    undoMove(board, m, undo);
    if (!inCheck) moves.push(m);
  };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== color) continue;

      if (piece.type === 'pawn') {
        const nr = r + dir;
        if (nr >= 0 && nr < 8) {
          // Captures (including promotions)
          for (const dc of [-1, 1]) {
            const nc = c + dc;
            if (nc < 0 || nc >= 8) continue;
            const target = board[nr][nc];
            if (target && target.color === opp) {
              if (nr === promoRank) {
                pushValidated({ fromR: r, fromC: c, toR: nr, toC: nc, capture: true, promotion: 'queen' });
                if (!capturesOnly) {
                  pushValidated({ fromR: r, fromC: c, toR: nr, toC: nc, capture: true, promotion: 'knight' });
                }
              } else {
                pushValidated({ fromR: r, fromC: c, toR: nr, toC: nc, capture: true });
              }
            } else if (
              ep &&
              nr === ep.r &&
              nc === ep.c &&
              board[ep.pawnR][ep.pawnC]?.color === opp &&
              board[ep.pawnR][ep.pawnC]?.type === 'pawn'
            ) {
              pushValidated({
                fromR: r,
                fromC: c,
                toR: nr,
                toC: nc,
                capture: true,
                enPassant: true,
                captureR: ep.pawnR,
                captureC: ep.pawnC
              });
            }
          }

          // Quiet pawn advances + push promotions
          if (!board[nr][c]) {
            if (nr === promoRank) {
              pushValidated({ fromR: r, fromC: c, toR: nr, toC: c, capture: false, promotion: 'queen' });
              if (!capturesOnly) {
                pushValidated({ fromR: r, fromC: c, toR: nr, toC: c, capture: false, promotion: 'knight' });
              }
            } else if (!capturesOnly) {
              pushValidated({ fromR: r, fromC: c, toR: nr, toC: c, capture: false });
              if (r === startRank && !board[r + dir * 2][c]) {
                pushValidated({ fromR: r, fromC: c, toR: r + dir * 2, toC: c, capture: false });
              }
            }
          }
        }
      } else if (piece.type === 'knight') {
        const jumps = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        for (const [dr, dc] of jumps) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
          const target = board[nr][nc];
          if (!target && !capturesOnly) {
            pushValidated({ fromR: r, fromC: c, toR: nr, toC: nc, capture: false });
          } else if (target && target.color === opp) {
            pushValidated({ fromR: r, fromC: c, toR: nr, toC: nc, capture: true });
          }
        }
      } else if (piece.type === 'king') {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
            const target = board[nr][nc];
            if (!target && !capturesOnly) {
              pushValidated({ fromR: r, fromC: c, toR: nr, toC: nc, capture: false });
            } else if (target && target.color === opp) {
              pushValidated({ fromR: r, fromC: c, toR: nr, toC: nc, capture: true });
            }
          }
        }

        // Castling
        if (!capturesOnly && !piece.hasMoved) {
          const homeRow = color === 'w' ? 7 : 0;
          if (r === homeRow && c === 4 && !isSquareAttacked(board, homeRow, 4, opp)) {
            const kRook = board[homeRow][7];
            if (
              kRook &&
              kRook.type === 'rook' &&
              kRook.color === color &&
              !kRook.hasMoved &&
              !board[homeRow][5] &&
              !board[homeRow][6] &&
              !isSquareAttacked(board, homeRow, 5, opp) &&
              !isSquareAttacked(board, homeRow, 6, opp)
            ) {
              moves.push({
                fromR: homeRow,
                fromC: 4,
                toR: homeRow,
                toC: 6,
                capture: false,
                castle: 'k',
                rookFromC: 7,
                rookToC: 5
              });
            }

            const qRook = board[homeRow][0];
            if (
              qRook &&
              qRook.type === 'rook' &&
              qRook.color === color &&
              !qRook.hasMoved &&
              !board[homeRow][1] &&
              !board[homeRow][2] &&
              !board[homeRow][3] &&
              !isSquareAttacked(board, homeRow, 3, opp) &&
              !isSquareAttacked(board, homeRow, 2, opp)
            ) {
              moves.push({
                fromR: homeRow,
                fromC: 4,
                toR: homeRow,
                toC: 2,
                capture: false,
                castle: 'q',
                rookFromC: 0,
                rookToC: 3
              });
            }
          }
        }
      } else {
        const dirs: [number, number][] = [];
        if (piece.type === 'rook' || piece.type === 'queen') {
          dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
        }
        if (piece.type === 'bishop' || piece.type === 'queen') {
          dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
        }
        for (const [dr, dc] of dirs) {
          for (let step = 1; step < 8; step++) {
            const nr = r + dr * step;
            const nc = c + dc * step;
            if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) break;
            const target = board[nr][nc];
            if (!target) {
              if (!capturesOnly) {
                pushValidated({ fromR: r, fromC: c, toR: nr, toC: nc, capture: false });
              }
            } else {
              if (target.color === opp) {
                pushValidated({ fromR: r, fromC: c, toR: nr, toC: nc, capture: true });
              }
              break;
            }
          }
        }
      }
    }
  }

  return moves;
}

function scoreMoveOrder(
  board: (SimplePiece | null)[][],
  m: SearchMove,
  bestPrev: SearchMove | null
): number {
  if (
    bestPrev &&
    bestPrev.fromR === m.fromR &&
    bestPrev.fromC === m.fromC &&
    bestPrev.toR === m.toR &&
    bestPrev.toC === m.toC &&
    bestPrev.promotion === m.promotion
  ) {
    return 100000;
  }
  let score = 0;
  const attacker = board[m.fromR][m.fromC];
  if (m.capture) {
    const victim = m.enPassant ? { type: 'pawn' as PieceType } : board[m.toR][m.toC];
    const victimVal = victim ? PIECE_VALUES[victim.type] : 100;
    const attackerVal = attacker ? PIECE_VALUES[attacker.type] : 100;
    score += 10000 + victimVal * 10 - attackerVal;
  }
  if (m.promotion) {
    score += 9000 + PIECE_VALUES[m.promotion];
  }
  if (m.castle) {
    score += 650;
  }
  // Prefer central squares slightly
  const centerBonus = 7 - (Math.abs(3.5 - m.toR) + Math.abs(3.5 - m.toC));
  score += centerBonus * 10;
  return score;
}

function evaluateBoard(board: (SimplePiece | null)[][], perspectiveColor: PieceColor): number {
  let nonKingMaterial = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  let whiteScore = 0;
  let blackScore = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (p.type !== 'king') {
        nonKingMaterial += PIECE_VALUES[p.type];
      }
      if (p.type === 'bishop') {
        if (p.color === 'w') whiteBishops++;
        else blackBishops++;
      }
    }
  }

  const isEndgame = nonKingMaterial <= 2600;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const pstR = p.color === 'w' ? r : 7 - r;
      let val = PIECE_VALUES[p.type];
      if (p.type === 'pawn') val += PST_PAWN[pstR][c];
      else if (p.type === 'knight') val += PST_KNIGHT[pstR][c];
      else if (p.type === 'bishop') val += PST_BISHOP[pstR][c];
      else if (p.type === 'rook') val += PST_ROOK[pstR][c];
      else if (p.type === 'queen') val += PST_QUEEN[pstR][c];
      else if (p.type === 'king') val += isEndgame ? PST_KING_END[pstR][c] : PST_KING_MID[pstR][c];

      if (p.color === 'w') whiteScore += val;
      else blackScore += val;
    }
  }

  // Bishop pair bonus
  if (whiteBishops >= 2) whiteScore += 32;
  if (blackBishops >= 2) blackScore += 32;

  const raw = whiteScore - blackScore;
  return perspectiveColor === 'w' ? raw : -raw;
}

// Small classical opening book (ply 0..3) using coordinate keys "fromR,fromC->toR,toC"
function pickOpeningBookMove(
  board: (SimplePiece | null)[][],
  color: PieceColor,
  moveHistoryPairs: string[],
  legalMoves: SearchMove[]
): SearchMove | null {
  const key = moveHistoryPairs.join(' ');
  const candidatesMap: Record<string, string[]> = {
    '': ['6,4->4,4', '6,3->4,3', '7,6->5,5', '6,2->4,2'], // 1. e4, d4, Nf3, c4
    '6,4->4,4': ['1,4->3,4', '1,2->3,2', '1,4->2,4', '1,2->2,2'], // 1. e4 e5 / c5 / e6 / c6
    '6,3->4,3': ['1,3->3,3', '0,6->2,5', '1,4->2,4'], // 1. d4 d5 / Nf6 / e6
    '6,4->4,4 1,4->3,4': ['7,6->5,5', '7,5->4,2'], // 2. Nf3 / Bc4
    '6,4->4,4 1,4->3,4 7,6->5,5': ['0,1->2,2', '0,6->2,5'], // 2... Nc6 / Nf6
    '6,4->4,4 1,2->3,2': ['7,6->5,5', '6,3->4,3'], // Sicilian: 2. Nf3 / d4
    '6,3->4,3 1,3->3,3': ['6,2->4,2', '7,6->5,5'], // Queen's Gambit / Nf3
    '6,3->4,3 0,6->2,5': ['6,2->4,2', '7,6->5,5']
  };

  const options = candidatesMap[key];
  if (!options || options.length === 0) return null;

  // Pick a random valid option that exists in legalMoves
  const shuffled = [...options].sort(() => Math.random() - 0.5);
  for (const code of shuffled) {
    const [fromStr, toStr] = code.split('->');
    const [fromR, fromC] = fromStr.split(',').map(Number);
    const [toR, toC] = toStr.split(',').map(Number);
    const match = legalMoves.find(
      (m) => m.fromR === fromR && m.fromC === fromC && m.toR === toR && m.toC === toC
    );
    if (match && board[fromR][fromC]?.color === color) {
      return match;
    }
  }
  return null;
}

export function chooseBestLocalAIMove(params: {
  boardState: (SimplePiece | null)[][];
  color: PieceColor;
  enPassantTarget: EnPassantTarget | null;
  difficulty: AIDifficulty;
  moveHistoryCoords?: string[];
}): SearchMove | null {
  const { boardState, color, enPassantTarget, difficulty, moveHistoryCoords = [] } = params;
  const board = cloneSimBoard(boardState);
  const legalRoot = generateLegalMoves(board, color, enPassantTarget, false);
  if (legalRoot.length === 0) return null;
  if (legalRoot.length === 1) return legalRoot[0];

  // Use classical opening book for Tactician & Grandmaster in first 3 half-moves
  if (difficulty !== 'novice' && moveHistoryCoords.length <= 3) {
    const bookMove = pickOpeningBookMove(board, color, moveHistoryCoords, legalRoot);
    if (bookMove) return bookMove;
  }

  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const maxTimeMs = difficulty === 'grandmaster' ? 1100 : difficulty === 'tactician' ? 450 : 120;
  const maxDepth = difficulty === 'grandmaster' ? 3 : difficulty === 'tactician' ? 2 : 1;
  const maxQDepth = difficulty === 'grandmaster' ? 3 : difficulty === 'tactician' ? 2 : 0;

  let timedOut = false;
  let nodes = 0;

  function checkTimeout(): boolean {
    nodes++;
    if ((nodes & 255) === 0) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - startMs > maxTimeMs) {
        timedOut = true;
      }
    }
    return timedOut;
  }

  function quiescence(
    side: PieceColor,
    ep: EnPassantTarget | null,
    ply: number,
    alpha: number,
    beta: number,
    qDepth: number
  ): number {
    if (checkTimeout()) return evaluateBoard(board, side);

    const inCheck = isColorInCheck(board, side);
    if (inCheck) {
      const evasions = generateLegalMoves(board, side, ep, false);
      if (evasions.length === 0) {
        return -100000 + ply * 10;
      }
      if (qDepth <= 0) {
        return evaluateBoard(board, side) - 35;
      }
      evasions.sort((a, b) => scoreMoveOrder(board, b, null) - scoreMoveOrder(board, a, null));
      const opp: PieceColor = side === 'w' ? 'b' : 'w';
      for (const m of evasions) {
        const { undo, nextEp } = applyMove(board, m);
        const score = -quiescence(opp, nextEp, ply + 1, -beta, -alpha, qDepth - 1);
        undoMove(board, m, undo);
        if (timedOut) return alpha;
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    const standPat = evaluateBoard(board, side);
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;
    if (qDepth <= 0) return alpha;

    const captures = generateLegalMoves(board, side, ep, true);
    captures.sort((a, b) => scoreMoveOrder(board, b, null) - scoreMoveOrder(board, a, null));
    const opp: PieceColor = side === 'w' ? 'b' : 'w';

    for (const m of captures) {
      const { undo, nextEp } = applyMove(board, m);
      const score = -quiescence(opp, nextEp, ply + 1, -beta, -alpha, qDepth - 1);
      undoMove(board, m, undo);
      if (timedOut) return alpha;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function negamax(
    side: PieceColor,
    ep: EnPassantTarget | null,
    depth: number,
    ply: number,
    alpha: number,
    beta: number
  ): number {
    if (checkTimeout()) return evaluateBoard(board, side);

    if (depth <= 0) {
      if (maxQDepth > 0) {
        return quiescence(side, ep, ply, alpha, beta, maxQDepth);
      }
      if (isColorInCheck(board, side)) {
        const evasions = generateLegalMoves(board, side, ep, false);
        if (evasions.length === 0) return -100000 + ply * 10;
      }
      return evaluateBoard(board, side);
    }

    const moves = generateLegalMoves(board, side, ep, false);
    if (moves.length === 0) {
      if (isColorInCheck(board, side)) {
        return -100000 + ply * 10; // Prefer faster mates, delay getting mated
      }
      return 0; // Stalemate
    }

    moves.sort((a, b) => scoreMoveOrder(board, b, null) - scoreMoveOrder(board, a, null));
    const opp: PieceColor = side === 'w' ? 'b' : 'w';

    let best = -Infinity;
    for (const m of moves) {
      const { undo, nextEp } = applyMove(board, m);
      const score = -negamax(opp, nextEp, depth - 1, ply + 1, -beta, -alpha);
      undoMove(board, m, undo);

      if (timedOut) return best === -Infinity ? alpha : best;
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  let bestMove = legalRoot[0];
  let bestScore = -Infinity;

  // Iterative deepening up to maxDepth
  for (let depth = 1; depth <= maxDepth; depth++) {
    const orderedRoot = [...legalRoot].sort(
      (a, b) => scoreMoveOrder(board, b, depth > 1 ? bestMove : null) - scoreMoveOrder(board, a, depth > 1 ? bestMove : null)
    );

    let iterBestMove = orderedRoot[0];
    let iterBestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;
    const opp: PieceColor = color === 'w' ? 'b' : 'w';
    const rootScored: { move: SearchMove; score: number }[] = [];

    for (const m of orderedRoot) {
      const { undo, nextEp } = applyMove(board, m);
      // For novice (depth 1), evaluate full window so we can pick with human-like variety;
      // for tactician/grandmaster, use exact alpha-beta window and only update on strict > alpha improvements.
      const searchAlpha = difficulty === 'novice' ? -Infinity : alpha;
      const score = -negamax(opp, nextEp, depth - 1, 1, -beta, -searchAlpha);
      undoMove(board, m, undo);

      if (timedOut) break;

      if (difficulty === 'novice') {
        rootScored.push({ move: m, score });
      }
      if (score > iterBestScore) {
        iterBestScore = score;
        iterBestMove = m;
      }
      if (score > alpha) {
        alpha = score;
      }
    }

    if (!timedOut) {
      if (difficulty === 'novice' && rootScored.length > 1 && iterBestScore < 50000) {
        const threshold = iterBestScore - 35;
        const pool = rootScored.filter((r) => r.score >= threshold);
        bestMove = pool[Math.floor(Math.random() * pool.length)]?.move || iterBestMove;
      } else {
        bestMove = iterBestMove;
      }
      bestScore = iterBestScore;
      // Stop searching deeper if a forced mate is already found
      if (bestScore > 90000) break;
    } else {
      break;
    }
  }

  return bestMove;
}
