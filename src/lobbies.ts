// server/src/lobbies.ts
import { Lobby, LobbySettings, PlayerStats, MoveElement } from './types';

export const lobbies: Record<number, Lobby> = {};

export function generateLobbyId(): number {
  let id: number;
  let attempts: number = 0;
  do {
    id = Math.floor(1000 + Math.random() * 9000);
    attempts++;
    if (attempts > 100) {
      if (Object.keys(lobbies).length >= 9000) return -1;
    }else if(attempts > 500) {
      return -1;
    }
  } while (lobbies[id]);
  return id;
}

export function createDefaultLobbySettings(): LobbySettings {
  return {
    startingElementPoints: 10,
    duplicatesToWin: 3,
    uniqueElementsToWin: 1,
    needUniquePowersToWin: false,
    maxElementalPower: 5,
    maxStoredPower: 20,
    overchargeBonus: 5,
  };
}

// Called when host clicks “startGame”:
export function startNewLobbyGame(lobby: Lobby): void {
  lobby.moves = {};
  lobby.ready.clear();
  lobby.playerOneStats = {
    fireWinPowers: [],
    waterWinPowers: [],
    grassWinPowers: [],
    firePoints: lobby.lobbySettings.startingElementPoints,
    waterPoints: lobby.lobbySettings.startingElementPoints,
    grassPoints: lobby.lobbySettings.startingElementPoints,
  };
  lobby.playerTwoStats = {
    fireWinPowers: [],
    waterWinPowers: [],
    grassWinPowers: [],
    firePoints: lobby.lobbySettings.startingElementPoints,
    waterPoints: lobby.lobbySettings.startingElementPoints,
    grassPoints: lobby.lobbySettings.startingElementPoints,
  };
  lobby.gameInProgress = true;
}

// Clamp any numeric setting into [1..99]:
export function clamp1to99(n: number): number {
  return Math.max(1, Math.min(99, Math.round(n)));
}