// dist/src/index.js

console.log("ENTRY FILE LOADED at " + new Date().toISOString());

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { registerSocketHandlers } from './socketHandlers';

const app = express();

// Health Check Route
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
    If you see this page, your Node.js/Express app is successfully running.
  </p>
</body>
</html>`);
});

// Create the HTTP server
const server = http.createServer(app);

// Attach Socket.IO with CORS enabled
const io = new SocketIOServer(server, {
  transports: ['websocket', 'polling'],
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://jigglyjelo.github.io/Element-Jitsu-Client/',
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Register your socket handlers
registerSocketHandlers(io);

// Start listening on Azure’s provided port (or 3000 locally)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
