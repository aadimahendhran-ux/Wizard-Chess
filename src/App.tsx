import { useEffect, useMemo, useRef, useState } from 'react';
import { initWizardChess } from './wizardChessEngine.js';

interface SanEntry {
  ply: number;
  color: 'w' | 'b';
  san: string;
  from: string;
  to: string;
  capture: boolean;
}

interface HudSnapshot {
  currentTurn: 'w' | 'b';
  playerColor: 'w' | 'b';
  gameOver: boolean;
  inCheck: boolean;
  aiDifficulty: 'novice' | 'tactician' | 'grandmaster';
  theme: 'astral' | 'crimson' | 'emerald' | 'gilded';
  coordsVisible: boolean;
  fxEnabled: boolean;
  isSoftwareGl: boolean;
  hintActive: boolean;
  soundMuted: boolean;
  canUndo: boolean;
  sanHistory: SanEntry[];
  capturedPieces: { w: string[]; b: string[] };
  materialDiffWhite: number;
  timeControl: 'untimed' | '3+2' | '5+0' | '10+0';
  clocksMs: { w: number; b: number };
  drawReason: string | null;
  timeoutWinner: 'w' | 'b' | null;
}

const DEFAULT_HUD: HudSnapshot = {
  currentTurn: 'w',
  playerColor: 'w',
  gameOver: false,
  inCheck: false,
  aiDifficulty: 'tactician',
  theme: 'astral',
  coordsVisible: true,
  fxEnabled: true,
  isSoftwareGl: false,
  hintActive: false,
  soundMuted: false,
  canUndo: false,
  sanHistory: [],
  capturedPieces: { w: [], b: [] },
  materialDiffWhite: 0,
  timeControl: 'untimed',
  clocksMs: { w: 0, b: 0 },
  drawReason: null,
  timeoutWinner: null
};

const PIECE_GLYPHS_CAPTURED_BY_WHITE: Record<string, string> = {
  pawn: '♟',
  knight: '♞',
  bishop: '♝',
  rook: '♜',
  queen: '♛'
};

const PIECE_GLYPHS_CAPTURED_BY_BLACK: Record<string, string> = {
  pawn: '♙',
  knight: '♘',
  bishop: '♗',
  rook: '♖',
  queen: '♕'
};

const PIECE_ORDER: Record<string, number> = {
  queen: 5,
  rook: 4,
  bishop: 3,
  knight: 2,
  pawn: 1
};

const TIME_CONTROL_OPTIONS: Array<{ id: HudSnapshot['timeControl']; label: string }> = [
  { id: 'untimed', label: 'Untimed' },
  { id: '3+2', label: '3+2' },
  { id: '5+0', label: '5+0' },
  { id: '10+0', label: '10+0' }
];

const THEME_OPTIONS: Array<{
  id: HudSnapshot['theme'];
  label: string;
  shortLabel: string;
  swatchPrimary: string;
  swatchSecondary: string;
}> = [
  { id: 'astral', label: 'Astral Frost', shortLabel: 'Astral', swatchPrimary: '#7dd3fc', swatchSecondary: '#131c2e' },
  { id: 'crimson', label: 'Crimson Eclipse', shortLabel: 'Crimson', swatchPrimary: '#f43f5e', swatchSecondary: '#24171c' },
  { id: 'emerald', label: 'Verdant Arcane', shortLabel: 'Emerald', swatchPrimary: '#34d399', swatchSecondary: '#111e1a' },
  { id: 'gilded', label: 'Gilded Sanctum', shortLabel: 'Gilded', swatchPrimary: '#d4af37', swatchSecondary: '#14171f' }
];

function formatClock(ms: number): string {
  const totalTenths = Math.max(0, Math.ceil(ms / 100));
  const totalSecs = Math.floor(totalTenths / 10);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (totalSecs < 20 && ms > 0) {
    const tenths = totalTenths % 10;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function App() {
  const initializedRef = useRef(false);
  const moveLogEndRef = useRef<HTMLDivElement | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(DEFAULT_HUD);
  const [pgnCopied, setPgnCopied] = useState(false);
  const [webglLost, setWebglLost] = useState(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    initWizardChess();
  }, []);

  useEffect(() => {
    const onHud = (e: Event) => {
      const detail = (e as CustomEvent<HudSnapshot>).detail;
      if (detail) setHud(detail);
    };
    const onToggleDrawer = () => {
      setDrawerOpen((prev) => !prev);
      setMobileSheetOpen(false);
    };
    const onWebgl = (e: Event) => {
      const detail = (e as CustomEvent<{ lost: boolean }>).detail;
      if (detail) setWebglLost(Boolean(detail.lost));
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileSheetOpen(false);
        setDrawerOpen(false);
      }
    };
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileSheetOpen(false);
      }
    };

    window.addEventListener('wizardchess:hud', onHud);
    window.addEventListener('wizardchess:toggle-drawer', onToggleDrawer);
    window.addEventListener('wizardchess:webgl', onWebgl);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('wizardchess:hud', onHud);
      window.removeEventListener('wizardchess:toggle-drawer', onToggleDrawer);
      window.removeEventListener('wizardchess:webgl', onWebgl);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (drawerOpen && moveLogEndRef.current) {
      moveLogEndRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [hud.sanHistory.length, drawerOpen]);

  const movePairs = useMemo(() => {
    const pairs: Array<{ moveNo: number; white?: SanEntry; black?: SanEntry }> = [];
    for (let i = 0; i < hud.sanHistory.length; i += 2) {
      pairs.push({
        moveNo: Math.floor(i / 2) + 1,
        white: hud.sanHistory[i],
        black: hud.sanHistory[i + 1]
      });
    }
    return pairs;
  }, [hud.sanHistory]);

  const sortedCapturedW = useMemo(
    () => [...hud.capturedPieces.w].sort((a, b) => (PIECE_ORDER[b] || 0) - (PIECE_ORDER[a] || 0)),
    [hud.capturedPieces.w]
  );
  const sortedCapturedB = useMemo(
    () => [...hud.capturedPieces.b].sort((a, b) => (PIECE_ORDER[b] || 0) - (PIECE_ORDER[a] || 0)),
    [hud.capturedPieces.b]
  );

  const handleRestoreUI = () => {
    const win = window as unknown as { wizardChess?: { toggleUI?: (force?: boolean) => void } };
    if (win.wizardChess?.toggleUI) {
      win.wizardChess.toggleUI(false);
    } else {
      document.body.classList.remove('cinematic-ui-hidden');
      const btnHide = document.getElementById('btn-hide-ui');
      if (btnHide) btnHide.textContent = 'Hide UI [H]';
    }
  };

  const handleTimeControlSelect = (tc: HudSnapshot['timeControl']) => {
    const win = window as unknown as { wizardChess?: { setTimeControl?: (tc: string) => void } };
    win.wizardChess?.setTimeControl?.(tc);
  };

  const handleThemeSelect = (themeId: HudSnapshot['theme']) => {
    const win = window as unknown as { wizardChess?: { setTheme?: (id: string) => void } };
    win.wizardChess?.setTheme?.(themeId);
  };

  const handleCopyPGN = async () => {
    const win = window as unknown as { wizardChess?: { getSanHistory?: () => SanEntry[] } };
    const moves = win.wizardChess?.getSanHistory?.() || hud.sanHistory;
    const whiteName = hud.playerColor === 'w' ? 'Player' : `Sanctum AI (${hud.aiDifficulty})`;
    const blackName = hud.playerColor === 'b' ? 'Player' : `Sanctum AI (${hud.aiDifficulty})`;
    let result = '*';
    if (hud.gameOver) {
      if (hud.drawReason) result = '1/2-1/2';
      else if (hud.timeoutWinner === 'w') result = '1-0';
      else if (hud.timeoutWinner === 'b') result = '0-1';
      else result = hud.currentTurn === 'w' ? '0-1' : '1-0';
    }
    const tokens: string[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      const no = Math.floor(i / 2) + 1;
      const wSan = moves[i]?.san || '';
      const bSan = moves[i + 1]?.san;
      tokens.push(bSan ? `${no}. ${wSan} ${bSan}` : `${no}. ${wSan}`);
    }
    const pgn = [
      `[Event "Wizard Chess — Gothic Sanctum"]`,
      `[Site "Cathedral Altar"]`,
      `[White "${whiteName}"]`,
      `[Black "${blackName}"]`,
      `[Result "${result}"]`,
      '',
      `${tokens.join(' ')} ${result}`.trim()
    ].join('\n');

    try {
      await navigator.clipboard.writeText(pgn);
      setPgnCopied(true);
      window.setTimeout(() => setPgnCopied(false), 2000);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const materialFillPct = Math.max(12, Math.min(88, 50 + hud.materialDiffWhite * 3.5));
  const materialLabel =
    hud.materialDiffWhite === 0
      ? 'Even'
      : hud.materialDiffWhite > 0
        ? `White +${hud.materialDiffWhite}`
        : `Black +${Math.abs(hud.materialDiffWhite)}`;

  return (
    <>
      <div id="loading-overlay">
        <div className="loader-ornament">Gothic Sanctum Edition</div>
        <div className="loader-title">Wizard Chess</div>
        <div className="loader-bar-wrap">
          <div className="loader-bar" id="loader-bar"></div>
        </div>
        <div id="loader-text">Summoning Sanctum Architecture &amp; Sculpted Pieces...</div>
      </div>

      <div id="canvas-container"></div>
      <div
        id="cinematic-vignette"
        data-in-check={hud.inCheck && !hud.gameOver ? 'true' : 'false'}
        aria-hidden="true"
      ></div>

      {webglLost && (
        <div id="webgl-fallback" role="alert">
          <div className="webgl-card">
            <div className="checkmate-ornament">✦ &nbsp; Sanctum Graphics Interrupted &nbsp; ✦</div>
            <div className="promotion-title">WebGL Context Lost</div>
            <p className="promotion-subtitle">
              Your graphics context was reclaimed by the browser. Reload to restore the Cathedral altar.
            </p>
            <button
              type="button"
              className="checkmate-btn"
              onClick={() => window.location.reload()}
            >
              Restore Sanctum
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="hud-btn mobile-only-restore-ui"
        id="btn-mobile-show-ui"
        onClick={handleRestoreUI}
        title="Show HUD Controls"
      >
        Show UI
      </button>

      <header id="hud-top">
        <div className="hud-surface hud-left-bar" id="hud-left">
          <div className="brand-block">
            <span className="brand-title">Wizard Chess</span>
          </div>
          <div className="hud-sep" aria-hidden="true"></div>
          <div className="status-readout" id="status-pill">
            <span className="turn-dot" id="turn-dot" aria-hidden="true"></span>
            <span id="turn-text">White to Move</span>
            <span className="meta-dot" aria-hidden="true">·</span>
            <span className="mode-badge" id="mode-badge">Playing as White</span>
          </div>
          {hud.timeControl !== 'untimed' && (
            <>
              <div className="hud-sep hud-clock-sep" aria-hidden="true"></div>
              <div className="hud-clocks" id="hud-clocks" aria-label="Match Clocks">
                <span
                  className={`clock-chip ${hud.currentTurn === 'w' && !hud.gameOver ? 'active' : ''} ${hud.clocksMs.w > 0 && hud.clocksMs.w < 20000 ? 'low' : ''}`}
                >
                  <span className="clock-side">W</span>
                  <span>{formatClock(hud.clocksMs.w)}</span>
                </span>
                <span className="meta-dot" aria-hidden="true">·</span>
                <span
                  className={`clock-chip ${hud.currentTurn === 'b' && !hud.gameOver ? 'active' : ''} ${hud.clocksMs.b > 0 && hud.clocksMs.b < 20000 ? 'low' : ''}`}
                >
                  <span className="clock-side">B</span>
                  <span>{formatClock(hud.clocksMs.b)}</span>
                </span>
              </div>
            </>
          )}
        </div>

        <div className="mobile-top-actions">
          <button
            type="button"
            className={`hud-btn mobile-drawer-trigger ${drawerOpen ? 'active' : ''}`}
            onClick={() => {
              setMobileSheetOpen(false);
              setDrawerOpen((prev) => !prev);
            }}
            aria-expanded={drawerOpen}
            aria-controls="match-drawer"
          >
            Log
          </button>
          <button
            type="button"
            className={`hud-btn mobile-controls-trigger ${mobileSheetOpen ? 'active' : ''}`}
            id="btn-mobile-controls"
            aria-expanded={mobileSheetOpen}
            aria-controls="hud-right"
            onClick={() => {
              setDrawerOpen(false);
              setMobileSheetOpen((prev) => !prev);
            }}
          >
            {mobileSheetOpen ? 'Close' : 'Controls'}
          </button>
        </div>

        <div
          className={`mobile-sheet-backdrop ${mobileSheetOpen ? 'open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setMobileSheetOpen(false);
          }}
          aria-hidden="true"
        ></div>

        <nav
          className={`hud-surface hud-right-bar ${mobileSheetOpen ? 'mobile-sheet-open' : ''}`}
          id="hud-right"
          aria-label="Game and Camera Controls"
        >
          <div
            className="mobile-sheet-handle-wrap"
            onClick={(e) => {
              e.stopPropagation();
              setMobileSheetOpen(false);
            }}
            aria-hidden="true"
          >
            <div className="mobile-sheet-handle"></div>
          </div>

          <div className="mobile-sheet-header">
            <span className="mobile-sheet-title">Sanctum Controls</span>
            <button
              type="button"
              className="mobile-sheet-close"
              id="btn-mobile-sheet-close"
              onClick={(e) => {
                e.stopPropagation();
                setMobileSheetOpen(false);
              }}
              aria-label="Close Controls"
            >
              Close ✕
            </button>
          </div>

          <div className="mobile-sheet-section-label">Match Controls</div>

          <button
            type="button"
            className="hud-btn"
            id="btn-side-toggle"
            title="Switch between Playing as White and Playing as Black"
            onClick={() => setMobileSheetOpen(false)}
          >
            Play as Black
          </button>
          <button
            type="button"
            className="hud-btn"
            id="btn-ai-level"
            title="Cycle Local AI Strength: Novice, Tactician, Grandmaster"
          >
            AI: Tactician
          </button>
          <button
            type="button"
            className={`hud-btn ${hud.hintActive ? 'active' : ''}`}
            id="btn-hint"
            title="Highlight a tactical move suggestion on the board (Shortcut: G)"
            onClick={() => setMobileSheetOpen(false)}
          >
            Hint [G]
          </button>
          <button
            type="button"
            className="hud-btn"
            id="btn-undo"
            title="Undo your last move (Shortcut: Z)"
            onClick={() => setMobileSheetOpen(false)}
          >
            Undo [Z]
          </button>
          <button
            type="button"
            className="hud-btn"
            id="btn-ai-move"
            title="Let the AI make the next move immediately"
            onClick={() => setMobileSheetOpen(false)}
          >
            AI Move
          </button>
          <button
            type="button"
            className="hud-btn"
            id="btn-reset"
            title="Start a fresh game on the altar"
            onClick={() => setMobileSheetOpen(false)}
          >
            New Game
          </button>

          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">
            <span>Camera Views</span>
            <span className="mobile-sheet-section-sub">Tap active view to flip</span>
          </div>

          <button
            type="button"
            className="hud-btn active"
            id="btn-cam-player"
            title="Player Camera (Click again to flip White / Black view)"
          >
            Player
          </button>
          <button
            type="button"
            className="hud-btn"
            id="btn-cam-top"
            title="Overhead Board View (Click again to flip White / Black orientation)"
          >
            Overhead
          </button>
          <button
            type="button"
            className="hud-btn"
            id="btn-cam-side"
            title="Side Profile View (Click again to switch East / West side)"
          >
            Side
          </button>
          <button
            type="button"
            className="hud-btn"
            id="btn-cam-wide"
            title="Wide Cathedral View (Click again to switch North Rose / South Narthex)"
          >
            Cathedral
          </button>

          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">Sanctum Display</div>

          <button
            type="button"
            className={`hud-btn ${drawerOpen ? 'active' : ''}`}
            id="btn-drawer-toggle"
            title="Toggle Match Log, Clocks & Material Drawer (Shortcut: L)"
            aria-expanded={drawerOpen}
            aria-controls="match-drawer"
            onClick={() => {
              setMobileSheetOpen(false);
              setDrawerOpen((prev) => !prev);
            }}
          >
            Match Log [L]
          </button>

          <button
            type="button"
            className="hud-btn"
            id="btn-theme"
            title="Switch Sanctum Theme: Astral Frost, Crimson Eclipse, Verdant Arcane, Gilded Sanctum (Shortcut: T)"
          >
            Theme: Astral [T]
          </button>

          <button
            type="button"
            className={`hud-btn ${hud.fxEnabled && !hud.isSoftwareGl ? 'active' : ''}`}
            id="btn-fx"
            title="Toggle Atmospheric Bloom & Visual FX (Shortcut: V)"
          >
            FX: On [V]
          </button>

          <button
            type="button"
            className="hud-btn active"
            id="btn-coords"
            title="Toggle 3D Engraved Board Coordinates (Shortcut: C)"
          >
            Coords: On [C]
          </button>

          <button
            type="button"
            className="hud-btn active"
            id="btn-sound-toggle"
            title="Toggle Cathedral Audio & Sound Effects (Shortcut: M)"
          >
            Sound: On [M]
          </button>

          <button
            type="button"
            className="hud-btn"
            id="btn-hide-ui"
            title="Toggle HUD visibility (Shortcut: H)"
            onClick={() => setMobileSheetOpen(false)}
          >
            Hide UI [H]
          </button>

          <div className="mobile-sheet-hint">
            <strong>Touch:</strong> Tap Piece to Move &nbsp;·&nbsp; 1-Finger Drag: Orbit &nbsp;·&nbsp; 2-Finger Drag: Pan &nbsp;·&nbsp; Pinch: Zoom
          </div>
        </nav>
      </header>

      <aside
        id="match-drawer"
        className={`hud-surface ${drawerOpen ? 'open' : ''}`}
        aria-label="Match Log and Options"
        aria-hidden={!drawerOpen}
      >
        <div className="drawer-header">
          <div className="drawer-title-group">
            <h2 className="drawer-title">Sanctum Chronicle</h2>
            <span className="drawer-subtitle">
              {hud.sanHistory.length} {hud.sanHistory.length === 1 ? 'ply' : 'plies'} · {hud.aiDifficulty}
            </span>
          </div>
          <button
            type="button"
            className="hud-btn drawer-close-btn"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close Match Log"
          >
            Close [L]
          </button>
        </div>

        <section className="drawer-section">
          <div className="drawer-section-head">
            <span className="drawer-label">Material Balance</span>
            <span className="drawer-mono-val">{materialLabel}</span>
          </div>
          <div className="material-meter" aria-hidden="true">
            <div className="material-fill-white" style={{ width: `${materialFillPct}%` }}></div>
          </div>
          <div className="captured-rows">
            <div className="captured-row">
              <span className="captured-side-tag">White</span>
              <span className="captured-glyphs">
                {sortedCapturedW.length > 0
                  ? sortedCapturedW.map((t, idx) => (
                      <span key={`w-${idx}`}>{PIECE_GLYPHS_CAPTURED_BY_WHITE[t] || ''}</span>
                    ))
                  : <span className="captured-empty">—</span>}
              </span>
            </div>
            <div className="captured-row">
              <span className="captured-side-tag">Black</span>
              <span className="captured-glyphs">
                {sortedCapturedB.length > 0
                  ? sortedCapturedB.map((t, idx) => (
                      <span key={`b-${idx}`}>{PIECE_GLYPHS_CAPTURED_BY_BLACK[t] || ''}</span>
                    ))
                  : <span className="captured-empty">—</span>}
              </span>
            </div>
          </div>
        </section>

        <section className="drawer-section">
          <div className="drawer-section-head">
            <span className="drawer-label">Sanctum Theme</span>
            <span className="drawer-mono-val">
              {THEME_OPTIONS.find((t) => t.id === hud.theme)?.label || 'Astral Frost'}
            </span>
          </div>
          <div className="theme-grid" role="group" aria-label="Sanctum Visual Themes">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`theme-swatch-btn ${hud.theme === opt.id ? 'active' : ''}`}
                onClick={() => handleThemeSelect(opt.id)}
              >
                <span
                  className="theme-swatch-chip"
                  data-swatch={opt.id}
                  aria-hidden="true"
                ></span>
                <span className="theme-swatch-name">{opt.shortLabel}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="drawer-section">
          <div className="drawer-section-head">
            <span className="drawer-label">Time Control</span>
            <span className="drawer-mono-val">
              {hud.timeControl === 'untimed' ? 'No Clock' : hud.timeControl}
            </span>
          </div>
          <div className="tc-grid" role="group" aria-label="Time Control Presets">
            {TIME_CONTROL_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`tc-btn ${hud.timeControl === opt.id ? 'active' : ''}`}
                onClick={() => handleTimeControlSelect(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {hud.timeControl !== 'untimed' && (
            <div className="drawer-clock-pair">
              <div className={`drawer-clock-box ${hud.currentTurn === 'w' && !hud.gameOver ? 'active' : ''}`}>
                <span className="drawer-clock-label">White</span>
                <span className="drawer-clock-time">{formatClock(hud.clocksMs.w)}</span>
              </div>
              <div className={`drawer-clock-box ${hud.currentTurn === 'b' && !hud.gameOver ? 'active' : ''}`}>
                <span className="drawer-clock-label">Black</span>
                <span className="drawer-clock-time">{formatClock(hud.clocksMs.b)}</span>
              </div>
            </div>
          )}
        </section>

        <section className="drawer-section drawer-log-section">
          <div className="drawer-section-head">
            <span className="drawer-label">Algebraic Notation</span>
            <span className="drawer-mono-val">{movePairs.length} moves</span>
          </div>
          <div className="move-log-scroll">
            {movePairs.length === 0 ? (
              <div className="move-log-empty">
                Select a sculpted piece on the obsidian altar to begin recording moves.
              </div>
            ) : (
              <div className="move-log-table" role="table" aria-label="Chess Move History">
                {movePairs.map((pair) => {
                  const isLastWhite =
                    pair.white && pair.white.ply === hud.sanHistory[hud.sanHistory.length - 1]?.ply;
                  const isLastBlack =
                    pair.black && pair.black.ply === hud.sanHistory[hud.sanHistory.length - 1]?.ply;
                  return (
                    <div className="move-log-row" role="row" key={pair.moveNo}>
                      <span className="move-no" role="cell">{pair.moveNo}.</span>
                      <span className={`move-san ${isLastWhite ? 'latest' : ''}`} role="cell">
                        {pair.white?.san || ''}
                      </span>
                      <span className={`move-san ${isLastBlack ? 'latest' : ''}`} role="cell">
                        {pair.black?.san || ''}
                      </span>
                    </div>
                  );
                })}
                <div ref={moveLogEndRef}></div>
              </div>
            )}
          </div>
        </section>

        <div className="drawer-footer">
          <button
            type="button"
            className={`hud-btn drawer-pgn-btn ${pgnCopied ? 'active' : ''}`}
            id="btn-copy-pgn"
            disabled={hud.sanHistory.length === 0}
            onClick={handleCopyPGN}
          >
            {pgnCopied ? 'Copied PGN ✓' : 'Copy PGN'}
          </button>
        </div>
      </aside>

      <footer id="hud-bottom">
        <div className="hud-surface hint-strip" id="controls-hint">
          <strong>Sanctum</strong> · Drag: Orbit · Right-Drag: Pan · Scroll: Zoom · WASD: Fly · <kbd>T</kbd> Theme · <kbd>V</kbd> FX · <kbd>G</kbd> Hint · <kbd>Z</kbd> Undo · <kbd>L</kbd> Log · <kbd>C</kbd> Coords · <kbd>M</kbd> Sound · <kbd>H</kbd> Hide
        </div>
        <div className="hud-surface captured-strip" id="captured-tray"></div>
      </footer>

      <div id="checkmate-overlay" role="status" aria-live="polite">
        <div className="checkmate-banner">
          <div className="checkmate-ornament">✦ &nbsp; Sanctum Judgment &nbsp; ✦</div>
          <div className="checkmate-crown" id="checkmate-crown">♔</div>
          <div className="checkmate-title" id="checkmate-title">Checkmate</div>
          <div className="checkmate-rule"></div>
          <div className="checkmate-subtitle" id="checkmate-subtitle">
            White Triumphs • The Black King Has Fallen
          </div>
          <div className="checkmate-actions">
            <button type="button" className="checkmate-btn" id="btn-checkmate-replay">
              Replay King Fall
            </button>
            <button type="button" className="checkmate-btn" id="btn-checkmate-newgame">
              New Game
            </button>
            <button type="button" className="checkmate-btn secondary" id="btn-checkmate-dismiss">
              Dismiss
            </button>
          </div>
        </div>
      </div>

      <div id="promotion-modal" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
        <div className="promotion-card">
          <div className="checkmate-ornament">✦ &nbsp; Sanctum Ascension &nbsp; ✦</div>
          <div className="promotion-title" id="promotion-title">Choose Promotion</div>
          <div className="promotion-subtitle">Select the carved form for your ascending pawn</div>
          <div className="promotion-choices">
            <button type="button" className="promotion-choice" id="btn-promo-queen" data-piece="queen">
              <span className="promo-glyph" data-white="♕" data-black="♛">♕</span>
              <span className="promo-name">Queen</span>
              <span className="promo-key">[Q]</span>
            </button>
            <button type="button" className="promotion-choice" id="btn-promo-rook" data-piece="rook">
              <span className="promo-glyph" data-white="♖" data-black="♜">♖</span>
              <span className="promo-name">Rook</span>
              <span className="promo-key">[R]</span>
            </button>
            <button type="button" className="promotion-choice" id="btn-promo-bishop" data-piece="bishop">
              <span className="promo-glyph" data-white="♗" data-black="♝">♗</span>
              <span className="promo-name">Bishop</span>
              <span className="promo-key">[B]</span>
            </button>
            <button type="button" className="promotion-choice" id="btn-promo-knight" data-piece="knight">
              <span className="promo-glyph" data-white="♘" data-black="♞">♘</span>
              <span className="promo-name">Knight</span>
              <span className="promo-key">[N]</span>
            </button>
          </div>
          <button type="button" className="checkmate-btn secondary" id="btn-promo-cancel">
            Cancel Move [Esc]
          </button>
        </div>
      </div>
    </>
  );
}
