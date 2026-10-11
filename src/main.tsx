import { createRoot } from 'react-dom/client';
import { Game } from './game/Game';
import { GameContext } from './ui/useGame';
import { App } from './ui/App';
import './ui/styles.css';

interface HotHook {
  ready?: (start: () => void) => void;
  snapshot?: (fn: () => unknown) => void;
}
// present only when the page runs as a published Claude artifact
const hot = (window as unknown as { claude?: { hot?: HotHook } }).claude?.hot;

function start() {
  const game = new Game(document.getElementById('viewport')!);
  game.start();
  try {
    // flush the save before the page is swapped for a newer version
    hot?.snapshot?.(() => {
      game.save();
      return {};
    });
  } catch {
    /* hook unavailable */
  }
  createRoot(document.getElementById('ui')!).render(
    <GameContext.Provider value={game}>
      <App />
    </GameContext.Provider>,
  );
}

if (hot?.ready) hot.ready(start);
else start();
