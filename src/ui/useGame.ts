import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Game } from '../game/Game';

export const GameContext = createContext<Game | null>(null);

/** Returns the game and re-renders whenever the game marks its state dirty. */
export function useGame() {
  const game = useContext(GameContext);
  if (!game) throw new Error('GameContext missing');
  useSyncExternalStore(game.subscribe, game.getVersion);
  return game;
}
