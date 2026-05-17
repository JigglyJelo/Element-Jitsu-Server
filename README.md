\# Element-Jitsu (Server)



This is the authoritative backend for \*\*Element-Jitsu\*\*, a multiplayer web game. It handles WebSocket connections, lobby management, game state, point calculations, and win-condition logic.



This repository contains the backend server. The React frontend repository can be found here: https://github.com/JigglyJelo/Element-Jitsu-Client



\## Tech Stack

\* \*\*Runtime:\*\* Node.js + TypeScript

\* \*\*Web Framework:\*\* Express

\* \*\*Real-Time Communication:\*\* Socket.IO

\* \*\*Deployment:\*\* Render



\## Game Logic Handled

\* \*\*Lobby System:\*\* Dynamic lobby generation, host controls, and custom game settings.

\* \*\*Matchmaking:\*\* Player ready-up signaling and disconnect handling.

\* \*\*Round Resolution:\*\* Calculating element advantages and broadcasting round/match results.



\## Local Development



To spin up the server locally, install dependencies and run your dev script:

```bash

npm install

npm run dev 

```

The server will start and listen for WebSocket connections on `http://localhost:3000`.



\## Deployment



This server is deployed via \*\*Render\*\*. 

\* \*\*Live URL:\*\* `https://element-jitsu-server.onrender.com`

\* \*\*Note on Render Free Tier:\*\* The server will spin down after 15 minutes of inactivity. When a new player connects, the server will take roughly \~50 seconds to spin back up before establishing the WebSocket connection.



\## License



This project is licensed under the \*\*GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)\*\*. See the LICENSE file for details.

