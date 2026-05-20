// server/src/socketHandlers.ts

import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  Lobby,
  LobbySettings,
  PlayerStats,
  RoundStatsPayload,
  GameOverPayload,
  LobbyUpdatePayload,
  MoveElement,
} from './types';
import {
  lobbies,
  generateLobbyId,
  createDefaultLobbySettings,
  startNewLobbyGame,
  clamp1to99,
} from './lobbies';

export function registerSocketHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Initialize per‐socket data
    socket.data.username = null as string | null;
    socket.data.lobbyId  = null as number | null;

    // ────────────────────────────────────────────────────────────────
    // 0) Send current LobbySettings when requested
    // ────────────────────────────────────────────────────────────────
    socket.on(
      'getLobbySettings',
      (callback: (settings: LobbySettings | null) => void) => {
        const lid = socket.data.lobbyId as number | null;
        if (lid === null) {
          return callback(null);
        }
        const lobby = lobbies[lid];
        if (!lobby) {
          return callback(null);
        }
        callback(lobby.lobbySettings);
      }
    );

    // ────────────────────────────────────────────────────────────────
    // 00) Allow host to bump a single setting field up/down
    // ────────────────────────────────────────────────────────────────
    type ChangeRequest = {
      field: keyof LobbySettings;
      delta: number;
    };
    socket.on(
      'changeLobbySetting',
      (
        data: ChangeRequest,
        callback: (resp: { success: boolean; error?: string }) => void
      ) => {
        const lid   = socket.data.lobbyId as number | null;
        const uname = socket.data.username as string | null;
        if (lid === null || !uname) {
          return callback({ success: false, error: 'Not in a lobby' });
        }
        const lobby = lobbies[lid];
        if (!lobby) {
          return callback({ success: false, error: 'Lobby not found' });
        }
        if (lobby.host !== uname) {
          return callback({ success: false, error: 'Only host can change settings' });
        }
        const { field, delta } = data;
        if (typeof delta !== 'number' || isNaN(delta)) {
          return callback({ success: false, error: 'Invalid delta' });
        }

        const allowedFields = [
          'startingElementPoints',
          'duplicatesToWin',
          'uniqueElementsToWin',
          'needUniquePowersToWin',
          'maxElementalPower',
          'maxStoredPower',
          'overchargeBonus'
        ];

        if (!allowedFields.includes(field as string)) {
          return callback({ success: false, error: 'Invalid setting field' });
        }
        
        if (field === 'needUniquePowersToWin') {
          // Toggle boolean: delta === 1 means true, else false
          lobby.lobbySettings.needUniquePowersToWin = delta === 1;
        } else {
          // Numeric fields: clamp to [1..99]
          const oldVal = (lobby.lobbySettings[field] as unknown) as number;
          const newVal = clamp1to99(oldVal + delta);
          lobby.lobbySettings[field] = (newVal as unknown) as LobbySettings[typeof field];
        }

        console.log(
          `Lobby ${lid}: host ${uname} changed ${field} to ${lobby.lobbySettings[field]}`
        );

        const payload: LobbyUpdatePayload = {
          members: Array.from(lobby.members),
          host: lobby.host,
          lobbySettings: lobby.lobbySettings,
        };
        io.to(String(lid)).emit('lobbyUpdate', payload);

        callback({ success: true });
      }
    );

    // ────────────────────────────────────────────────────────────────
    // 1) CREATE LOBBY
    // ────────────────────────────────────────────────────────────────
    socket.on(
      'createLobby',
      (
        username: string,
        callback: (resp: { success: boolean; lobbyId?: number; error?: string }) => void
      ) => {
        if (typeof username !== 'string' || !username.trim()) {
          return callback({ success: false, error: 'Invalid username' });
        }
        if (username.length > 20) {
          return callback({ success: false, error: 'Username too long' });
        }
        if (socket.data.lobbyId !== null) {
          // If double-fired, the server already made the lobby moments ago
          // Just return the ID of the lobby we just made for them
          if (socket.data.username === username) {
            return callback({ success: true, lobbyId: socket.data.lobbyId });
          }
          return callback({ success: false, error: 'You are already in a lobby. Leave it first.' });
        }
        const lobbyId = generateLobbyId();
        if (lobbyId === -1) {
          return callback({ success: false, error: 'Server is full, cannot create lobby' });
        }
        const defaultSettings = createDefaultLobbySettings();

        // Build empty PlayerStats with starting points
        const initialStats: PlayerStats = {
          fireWinPowers: [],
          waterWinPowers: [],
          grassWinPowers: [],
          firePoints: defaultSettings.startingElementPoints,
          waterPoints: defaultSettings.startingElementPoints,
          grassPoints: defaultSettings.startingElementPoints,
        };

        lobbies[lobbyId] = {
          id: lobbyId,
          host: username,
          members: new Set([username]),
          lobbySettings: defaultSettings,
          moves: {},
          ready: new Set([username]),
          gameInProgress: false,              // ← starts false until the host calls startGame
          playerOneStats: { ...initialStats },
          playerTwoStats: { ...initialStats },
        };

        socket.data.username = username;
        socket.data.lobbyId  = lobbyId;
        socket.join(String(lobbyId));

        console.log(`Lobby ${lobbyId} created by ${username}`);
        callback({ success: true, lobbyId });

        const payload: LobbyUpdatePayload = {
          members: Array.from(lobbies[lobbyId].members),
          host: lobbies[lobbyId].host,
          lobbySettings: lobbies[lobbyId].lobbySettings,
        };
        io.to(String(lobbyId)).emit('lobbyUpdate', payload);
      }
    );

    // ────────────────────────────────────────────────────────────────
    // 2) JOIN LOBBY
    // ────────────────────────────────────────────────────────────────
    socket.on(
      'joinLobby',
      (
        data: { lobbyId: number; username: string },
        callback: (resp: { success: boolean; error?: string }) => void
      ) => {
        const { lobbyId, username } = data;
        
        if (socket.data.lobbyId !== null) {
          // React Strict Mode bypass
          if (socket.data.lobbyId === lobbyId && socket.data.username === username) {
            // Emitting settings back to fix the blank screen bug
            const currentLobby = lobbies[lobbyId];
            if (currentLobby) {
              socket.emit('lobbyUpdate', {
                members: Array.from(currentLobby.members),
                host: currentLobby.host,
                lobbySettings: currentLobby.lobbySettings,
              });
              socket.emit('lobbyReadyUpdate', {
                ready: Array.from(currentLobby.ready),
              });
            }
            return callback({ success: true });
          }
          return callback({ success: false, error: 'You are already in a lobby. Leave it first.' });
        }
        
        const lobby = lobbies[lobbyId];
        if (!lobby) {
          return callback({ success: false, error: 'Lobby does not exist' });
        }
        if (!username || typeof username !== 'string' || !username.trim()) {
          return callback({ success: false, error: 'Invalid username' });
        }
        if (username.length > 20) {
          return callback({ success: false, error: 'Username too long' });
        }
        if (lobby.members.size >= 2) {
          return callback({ success: false, error: 'Lobby is full' });
        }
        if (lobby.members.has(username)) {
          return callback({ success: false, error: 'Username is already taken in this lobby' });
        }

        lobby.members.add(username);
        socket.data.username = username;
        socket.data.lobbyId  = lobbyId;
        socket.join(String(lobbyId));

        console.log(`${username} joined lobby ${lobbyId}`);
        callback({ success: true });

        const payload: LobbyUpdatePayload = {
          members: Array.from(lobby.members),
          host: lobby.host,
          lobbySettings: lobby.lobbySettings,
        };
        io.to(String(lobbyId)).emit('lobbyUpdate', payload);
      }
    );

    // ────────────────────────────────────────────────────────────────
    // 3) PLAYER SIGNALS “READY”
    // ────────────────────────────────────────────────────────────────
    socket.on(
      'playerReady',
      (callback: (resp: { success: boolean; error?: string }) => void) => {
        const lid   = socket.data.lobbyId as number | null;
        const uname = socket.data.username as string | null;
        if (lid === null || !uname) {
          return callback({ success: false, error: 'Not currently in a lobby' });
        }
        const lobby = lobbies[lid];
        if (!lobby) {
          return callback({ success: false, error: 'Lobby not found' });
        }
        if (!lobby.members.has(uname)) {
          return callback({ success: false, error: 'Player not in lobby' });
        }

        if (!lobby.ready.has(uname)) {
          lobby.ready.add(uname);
          console.log(`Lobby ${lid}: ${uname} is ready`);

          io.to(String(lid)).emit('lobbyReadyUpdate', {
            ready: Array.from(lobby.ready),
          });
        }
        callback({ success: true });
      }
    );

    // ────────────────────────────────────────────────────────────────
    // 4) LEAVE LOBBY (manual)
    // ────────────────────────────────────────────────────────────────
    socket.on('leaveLobby', () => {
      const lid   = socket.data.lobbyId as number | null;
      const uname = socket.data.username as string | null;
      
      if (lid !== null && uname) {
        const lobby = lobbies[lid];
        
        // 1. MUST check if lobby exists first!
        if (lobby) {
          
          // 2. NOW check if a game was in progress
          if (lobby.gameInProgress) {
            const allPlayers = Array.from(lobby.members);
            const survivors = allPlayers.filter((u) => u !== uname);
            
            if (survivors.length === 1) {
              const other = survivors[0];
              const p1 = allPlayers[0];
              const p2 = allPlayers[1];
              
              const payload: GameOverPayload = {
                winner: other,
                stats: {
                  [p1]: lobby.playerOneStats,
                  [p2]: lobby.playerTwoStats,
                },
              };
              
              io.to(String(lid)).emit('opponentDisconnected', { 
                disconnected: uname, 
                gameOver: payload 
              });
              
              lobby.gameInProgress = false;
            }
          }

          // 3. Proceed with the normal removal logic
          lobby.members.delete(uname);
          lobby.ready.delete(uname);
          delete lobby.moves[uname];
          socket.leave(String(lid));

          if (lobby.host === uname) {
            if (lobby.members.size > 0) {
              const nextHost = Array.from(lobby.members)[0];
              lobby.host = nextHost;
              console.log(`Host ${uname} left lobby ${lid}, new host is ${nextHost}`);
            } else {
              delete lobbies[lid];
              console.log(`Lobby ${lid} is now empty and has been deleted.`);
            }
          }

          const payload: LobbyUpdatePayload = {
            members: Array.from(lobby.members),
            host: lobby.host,
            lobbySettings: lobby.lobbySettings,
          };
          io.to(String(lid)).emit('lobbyUpdate', payload);
          io.to(String(lid)).emit('lobbyReadyUpdate', {
            ready: Array.from(lobby.ready),
          });

          console.log(`${uname} left lobby ${lid}`);
        }
      }
      socket.data.lobbyId  = null;
      socket.data.username = null;
    });

    // ────────────────────────────────────────────────────────────────
    // 5) START GAME
    // ────────────────────────────────────────────────────────────────
    socket.on(
      'startGame',
      (callback: (resp: { success: boolean; error?: string }) => void) => {
        const lid   = socket.data.lobbyId as number | null;
        const uname = socket.data.username as string | null;
        if (lid === null || !uname) {
          return callback({ success: false, error: 'Not in a lobby' });
        }
        const lobby = lobbies[lid];
        if (!lobby) {
          return callback({ success: false, error: 'Lobby not found' });
        }
        if (lobby.host !== uname) {
          return callback({ success: false, error: 'Only host can start' });
        }
        if (lobby.gameInProgress) {
          return callback({ success: false, error: 'A game is already in progress' });
        }
        if (lobby.members.size < 2) {
          return callback({ success: false, error: 'Need two players to start' });
        }
        if (lobby.ready.size < lobby.members.size) {
          return callback({ success: false, error: 'Waiting for opponents to return' });
        }

        // This helper resets both players’ stats (win arrays and starting points)
        startNewLobbyGame(lobby);

        // ← Fix: mark the game as in progress so that a mid-game disconnect can trigger gameOver
        lobby.gameInProgress = true;

        console.log(`Lobby ${lid} game started by host ${uname}`);

        const playersArr = Array.from(lobby.members);
        io.to(String(lid)).emit('gameStarted', {
          lobbyId: lid,
          stats: {
            [playersArr[0]]: lobby.playerOneStats,
            [playersArr[1]]: lobby.playerTwoStats,
          },
          players: playersArr,
        });
        callback({ success: true });
      }
    );

    // ────────────────────────────────────────────────────────────────
    // 6) PLAYER SUBMITS MOVE
    // ────────────────────────────────────────────────────────────────
    socket.on(
      'playerMove',
      (
        data: { lobbyId: number; username: string; move: { element: MoveElement; power: number } },
        callback: (resp: { success: boolean; error?: string }) => void
      ) => {
        const { move } = data;
        const lobbyId = socket.data.lobbyId as number | null;
        const username = socket.data.username as string | null;
        // Error and exploit checks
        if (lobbyId === null || !username) {
          return callback({ success: false, error: 'Not authenticated in a lobby' });
        }
        const lobby = lobbies[lobbyId];
        
        if (!move || typeof move !== 'object') {
          return callback({ success: false, error: 'Invalid move data' });
        }
        if (!lobby) {
          return callback({ success: false, error: 'Lobby does not exist' });
        }
        if (!lobby.gameInProgress) {
          return callback({ success: false, error: 'Game is not currently in progress' });
        }
        if (!lobby.members.has(username)) {
          return callback({ success: false, error: 'Player not in lobby' });
        }
        if (lobby.moves[username]) {
          return callback({ success: false, error: 'You have already locked in your move for this round' });
        }
        if (typeof move.power !== 'number' || isNaN(move.power)) {
          return callback({ success: false, error: 'Power must be a number' });
        }
        move.power = Math.floor(move.power);
        if(move.power < 0) {
          return callback({ success: false, error: 'Can\'t have negative power' });
        }
        if (!['fire', 'water', 'grass'].includes(move.element)) {
          return callback({ success: false, error: 'Invalid element' });
        }
        if (move.power > lobby.lobbySettings.maxElementalPower) {
          return callback({ success: false, error: `Power cannot exceed ${lobby.lobbySettings.maxElementalPower}` });
        }
        // Deduct points and record the move
        const isHost = username === lobby.host;
        const currentStats = isHost ? lobby.playerOneStats : lobby.playerTwoStats;
        const elementKey =
          (move.element + 'Points') as 'firePoints' | 'waterPoints' | 'grassPoints';

        if (move.power > currentStats[elementKey]) {
          return callback({ success: false, error: 'Not enough points' });
        }
        currentStats[elementKey] -= move.power;
        lobby.moves[username] = { element: move.element, power: move.power };

        console.log(`Lobby ${lobbyId}: ${username} played ${move.element} (${move.power})`);
        callback({ success: true });

        // ────────────────────────────────────────────────────────────────
        // BROADCAST “playerPicked” WITHOUT revealing move details
        io.to(String(lobbyId)).emit('playerPicked', {
          username,
          // NO move field here! Clients only learn “someone picked.”
        });

        // ────────────────────────────────────────────────────────────────
        // If both have now played, compute round winner, broadcast roundStats, check gameOver
        if (Object.keys(lobby.moves).length === 2) {
          const [p1, p2] = Array.from(lobby.members);
          const m1 = lobby.moves[p1]!;
          const m2 = lobby.moves[p2]!;

          let winner: string | 'draw' = 'draw';
          if (m1.element === m2.element) {
            if (m1.power === m2.power) {
              winner = 'draw';
            } else {
              winner = m1.power > m2.power ? p1 : p2;
            }
          } else if (
            (m1.element === 'fire' && m2.element === 'grass') ||
            (m1.element === 'grass' && m2.element === 'water') ||
            (m1.element === 'water' && m2.element === 'fire')
          ) {
            winner = p1;
          } else {
            winner = p2;
          }

          // Update the correct “win‐powers” array, but only if power > 0
          if (winner !== 'draw') {
            const winningStats = winner === p1 ? lobby.playerOneStats : lobby.playerTwoStats;
            const winElement = winner === p1 ? m1.element : m2.element;
            const winPower = winner === p1 ? m1.power : m2.power;

            if (winPower > 0) {
              switch (winElement) {
                case 'fire':
                  winningStats.fireWinPowers.push(winPower);
                  break;
                case 'water':
                  winningStats.waterWinPowers.push(winPower);
                  break;
                case 'grass':
                  winningStats.grassWinPowers.push(winPower);
                  break;
              }
            }
          }

          // Broadcast round result + updated stats (NOW including both moves)
          const payload: RoundStatsPayload = {
            roundWinner: winner,
            moves: {
              [p1]: m1,
              [p2]: m2,
            },
            stats: {
              [p1]: lobby.playerOneStats,
              [p2]: lobby.playerTwoStats,
            },
          };
          io.to(String(lobbyId)).emit('roundStats', payload);

          // Check win conditions based on duplicatesToWin or needUniquePowersToWin
          const settings = lobby.lobbySettings;
          const checkWin = (ps: PlayerStats): boolean => {
            const { duplicatesToWin, uniqueElementsToWin, needUniquePowersToWin } = settings;

            const fireCount = ps.fireWinPowers.length;
            const waterCount = ps.waterWinPowers.length;
            const grassCount = ps.grassWinPowers.length;

            if (!needUniquePowersToWin) {
              if (fireCount >= duplicatesToWin) return true;
              if (waterCount >= duplicatesToWin) return true;
              if (grassCount >= duplicatesToWin) return true;
            } else {
              const fireUnique = new Set(ps.fireWinPowers).size;
              const waterUnique = new Set(ps.waterWinPowers).size;
              const grassUnique = new Set(ps.grassWinPowers).size;
              if (fireUnique >= duplicatesToWin) return true;
              if (waterUnique >= duplicatesToWin) return true;
              if (grassUnique >= duplicatesToWin) return true;
            }

            if (
              ps.fireWinPowers.length > 0 &&
              ps.waterWinPowers.length > 0 &&
              ps.grassWinPowers.length > 0 &&
              uniqueElementsToWin <= 3
            ) {
              return true;
            }

            return false;
          };

          const p1Wins = checkWin(lobby.playerOneStats);
          const p2Wins = checkWin(lobby.playerTwoStats);

          if (p1Wins || p2Wins) {
            const gameWinner = p1Wins && p2Wins ? 'draw' : p1Wins ? p1 : p2;
            const gameOverPayload: GameOverPayload = {
              winner: gameWinner,
              stats: {
                [p1]: lobby.playerOneStats,
                [p2]: lobby.playerTwoStats,
              },
            };
            lobby.gameInProgress = false;
            io.to(String(lobbyId)).emit('gameOver', gameOverPayload);
          } else {
            lobby.moves = {};
          }
        }
      }
    );

    // ────────────────────────────────────────────────────────────────
    // 7) DISCONNECT
    // ────────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const lid   = socket.data.lobbyId as number | null;
      const uname = socket.data.username as string | null;
        
      if (lid !== null && uname) {
        const lobby = lobbies[lid];
        if (lobby) {
          // If a game was in progress, award it to the survivor
          if (lobby.gameInProgress) {
            const allPlayers = Array.from(lobby.members);
            const survivors = allPlayers.filter((u) => u !== uname);
          
            if (survivors.length === 1) {
              const other = survivors[0];
              console.log(
                `Lobby ${lid}: ${uname} disconnected mid-game → awarding win to ${other}`
              );
            
              const p1 = allPlayers[0];
              const p2 = allPlayers[1];
              const statsForP1 = lobby.playerOneStats;
              const statsForP2 = lobby.playerTwoStats;
            
              // Build a payload exactly like GameOver, but tag it as “disconnect”
              const payload: GameOverPayload = {
                winner: other,
                stats: {
                  [p1]: statsForP1,
                  [p2]: statsForP2,
                },
              };
            
              // 1) Emit a dedicated “opponentDisconnected” event
              io.to(String(lid)).emit('opponentDisconnected', { 
                disconnected: uname, 
                gameOver: payload 
              });
            
              // 2) (Optionally) still emit the normal “gameOver” if you need backwards compatibility:
              //    io.to(String(lid)).emit('gameOver', payload);
            
              lobby.gameInProgress = false;
            }
          
            // … rest of your removal logic …
          }
        
          // Remove player from lobby, reassign host, etc.
          lobby.members.delete(uname);
          lobby.ready.delete(uname);
          delete lobby.moves[uname];
        
          if (lobby.host === uname) {
            if (lobby.members.size > 0) {
              const nextHost = Array.from(lobby.members)[0];
              lobby.host = nextHost;
              console.log(`Host ${uname} disconnected; new host for lobby ${lid} is ${nextHost}`);
            } else {
              delete lobbies[lid];
              console.log(`Lobby ${lid} is now empty and has been deleted.`);
              return;
            }
          }
        
          const payload: LobbyUpdatePayload = {
            members: Array.from(lobby.members),
            host: lobby.host,
            lobbySettings: lobby.lobbySettings,
          };
          io.to(String(lid)).emit('lobbyUpdate', payload);
          io.to(String(lid)).emit('lobbyReadyUpdate', {
            ready: Array.from(lobby.ready),
          });
        
          console.log(`(disconnect) ${uname} removed from lobby ${lid}`);
        }
      }
    
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}
