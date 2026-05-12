import { useAntiSquirrelGame } from './game/useAntiSquirrelGame.js';

function ColdBrewScore({ score }) {
  return (
    <div className="cold-brew-score" aria-label={`Final score ${score}`}>
      <div className="milk-pitcher" />
      <div className="milk-stream" />
      <div className="brew-glass">
        <div className="coffee-score">{score.toLocaleString()}</div>
      </div>
    </div>
  );
}

function Hearts({ count }) {
  return (
    <div className="hearts" aria-label={`${count} stump hearts remaining`}>
      {Array.from({ length: 4 }).map((_, index) => (
        <span className={`heart ${index < count ? 'is-live' : ''}`} key={index} />
      ))}
    </div>
  );
}

function Ammo({ ammo, magazine, reloading, reloadPct }) {
  return (
    <div className="ammo" aria-label={`${ammo} D-projectiles loaded`}>
      <div className="ammo-rail">
        {Array.from({ length: magazine }).map((_, index) => (
          <span className={`round ${index < ammo ? 'is-loaded' : ''}`} key={index}>
            D
          </span>
        ))}
      </div>
      <div className="reload-track">
        <span style={{ transform: `scaleX(${reloading ? reloadPct : 1})` }} />
      </div>
    </div>
  );
}

function Bombs({ count }) {
  return (
    <div className="bombs" aria-label={`${count} peanut bombs available`}>
      {Array.from({ length: 3 }).map((_, index) => (
        <span className={`bomb-slot ${index < count ? 'is-ready' : ''}`} key={index}>
          <span />
        </span>
      ))}
    </div>
  );
}

function Overlay({ hud, actions }) {
  if (!hud.ready) {
    return (
      <div className="state-overlay">
        <div className="state-panel">
          <h1>DEEZ DEEZ</h1>
          <p>Loading forest defense...</p>
        </div>
      </div>
    );
  }

  if (hud.mode === 'playing') return null;

  const isGameOver = hud.mode === 'gameover';
  const isPaused = hud.mode === 'paused';

  return (
    <div className="state-overlay">
      <div className="state-panel">
        <h1>{isGameOver ? 'DEEZ DEEZ' : 'DEEZ DEEZ'}</h1>
        {isGameOver && <ColdBrewScore score={hud.score} />}
        <div className="state-stats">
          {!isGameOver && <span>Score {hud.score.toLocaleString()}</span>}
          <span>Best {hud.highScore.toLocaleString()}</span>
          <span>Wave {hud.level}</span>
        </div>
        <div className="state-actions">
          <button type="button" onClick={isPaused ? actions.pause : actions.start}>
            {isPaused ? 'Resume' : isGameOver ? 'Replay' : 'Play'}
          </button>
          {isPaused && (
            <button type="button" className="secondary" onClick={actions.start}>
              Restart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Hud({ hud, actions }) {
  if (!hud.ready || hud.mode !== 'playing') return null;

  return (
    <>
      <div className="hud top-hud">
        <div className="hud-panel score-panel">
          <span className="hud-label">Score</span>
          <strong>{hud.score.toLocaleString()}</strong>
        </div>
        <div className="hud-panel compact">
          <span className="hud-label">Wave</span>
          <strong>{hud.level}</strong>
        </div>
        <div className="hud-panel hearts-panel">
          <span className="hud-label">Stump</span>
          <Hearts count={hud.hearts} />
        </div>
        <div className="hud-panel bombs-panel">
          <span className="hud-label">Peanut Bomb</span>
          <Bombs count={hud.bombs} />
        </div>
      </div>

      <div className="hud bottom-hud">
        <div className="hud-panel ammo-panel">
          <div className="ammo-copy">
            <span className="hud-label">{hud.reloading ? 'Reloading' : 'D-Launcher'}</span>
            <strong>
              {hud.ammo}/{hud.magazine}
            </strong>
          </div>
          <Ammo ammo={hud.ammo} magazine={hud.magazine} reloading={hud.reloading} reloadPct={hud.reloadPct} />
        </div>
        <div className="hud-panel compact">
          <span className="hud-label">Streak</span>
          <strong>{hud.streak}</strong>
        </div>
        <div className="hud-panel compact">
          <span className="hud-label">Aim</span>
          <strong>{hud.accuracy}%</strong>
        </div>
      </div>

      <div className="touch-controls" aria-label="Touch controls">
        <button type="button" className="fire-control" onPointerDown={actions.fire}>
          Fire
        </button>
        <button type="button" onClick={actions.reload}>
          Reload
        </button>
        <button type="button" onClick={actions.bomb} disabled={hud.bombs <= 0}>
          Bomb
        </button>
      </div>
    </>
  );
}

export default function App() {
  const { canvasRef, hud, actions } = useAntiSquirrelGame();

  return (
    <main className="app-shell">
      <section className="game-frame" aria-label="Deez Deez game">
        <canvas ref={canvasRef} width="1280" height="720" />
        <Hud hud={hud} actions={actions} />
        <Overlay hud={hud} actions={actions} />
      </section>
      <div className="rotate-phone" role="status">
        <strong>Turn phone sideways</strong>
        <span>The D shots stay big in landscape.</span>
      </div>
    </main>
  );
}
