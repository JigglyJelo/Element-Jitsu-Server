// server/src/types.ts

export type MoveElement = 'fire' | 'water' | 'grass';

export interface Move {
  element: MoveElement,
  power: number
}

export interface LobbySettings {
  startingElementPoints: number;
  duplicatesToWin: number;
  uniqueElementsToWin: number;
  needUniquePowersToWin: boolean;
  maxElementalPower: number;
  maxStoredPower: number;
  overchargeBonus: number;
}

export interface PlayerStats {
  fireWinPowers: number[];
  waterWinPowers: number[];
  grassWinPowers: number[];
  firePoints: number;
  waterPoints: number;
  grassPoints: number;
}

export interface Lobby {
  id: number;
  host: string;
  members: Set<string>;
  lobbySettings: LobbySettings;
  ready: Set<string>;
  gameInProgress: boolean;
  moves: Record<string, { element: MoveElement; power: number }>;
  playerOneStats: PlayerStats;
  playerTwoStats: PlayerStats;
}

export interface RoundStatsPayload {
  roundWinner: string | 'draw';
  moves: Record<string, { element: MoveElement; power: number }>;
  stats: Record<string, PlayerStats>;
}

export interface GameOverPayload {
  winner: string | 'draw';
  stats: Record<string, PlayerStats>;
}

export interface LobbyUpdatePayload {
  members: string[];
  host: string;
  lobbySettings: LobbySettings;
}