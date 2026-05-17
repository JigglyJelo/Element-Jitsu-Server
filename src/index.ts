// dist/src/index.js

// 1) ENTRY FILE LOADED
console.log("🔍 ENTRY FILE LOADED at " + new Date().toISOString());

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { registerSocketHandlers } from './socketHandlers';

const app = express();

// 2) Health-check route at “/”
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>✔️ Server Is Live</title>
</head>
<body>
  <h1 style="font-family: sans-serif; text-align: center; margin-top: 2rem;">
    ✔️ Server is running
  </h1>
  <p style="font-family: sans-serif; text-align: center;">
    If you see this page, your Node.js/Express app is successfully hosted on Azure.
  </p>
</body>
</html>`);
});

// 3) (Optional) If you have any other HTTP routes or JSON parsing, add them here.
//    e.g. app.use(express.json()); app.post('/api/foo', (req, res) => { … });

// 4) Create the HTTP server (Azure will handle TLS on 443)
const server = http.createServer(app);

// 5) Attach Socket.IO with CORS enabled (so external front-ends can connect).
//    Make sure these origins match your front-end URLs exactly.
const io = new SocketIOServer(server, {
  transports: ['websocket', 'polling'],
  cors: {
    origin: [
      'https://white-ocean-0a2476e10.6.azurestaticapps.net',
      'http://localhost:5173',
      'http://localhost:3000',
      'https://jitsu-server-awcze6evethtahdf.canadacentral-01.azurewebsites.net'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// 6) Register your socket handlers
registerSocketHandlers(io);

// 7) Start listening on Azure’s provided port (or 3000 locally)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);

  // 8) Heartbeat every 10 seconds
  setInterval(() => {
    console.log(`💓 Heartbeat: ${new Date().toISOString()}`);
  }, 10_000);
});
