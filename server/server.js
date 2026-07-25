const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io'); // Import Socket.io Server API

const app = express();
const server = http.createServer(app);

// Attach Socket.io Server instance to HTTP server
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for dev simplicity
  }
});

// Use environment port or default to 3000
const PORT = process.env.PORT || 3000;

// Resolve client static folder path
const clientPath = path.join(__dirname, '../client');

// Middleware to serve static files from the client directory
app.use(express.static(clientPath));

// Health check API endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Fallback: Serve index.html for any unmatched routes (SPA fallback behavior)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Socket.io Connection lifecycle event handlers
io.on('connection', (socket) => {
  console.log(`[Socket Server] Client connected: ${socket.id}`);

  // Handle room joining requests
  socket.on('joinRoom', ({ room }) => {
    // Leave all previous rooms (except the socket's default individual room)
    socket.rooms.forEach(currentRoom => {
      if (currentRoom !== socket.id) {
        socket.leave(currentRoom);
      }
    });

    socket.join(room);
    socket.currentRoom = room; // Store room reference on the socket object
    console.log(`[Socket Server] Client ${socket.id} joined room: ${room}`);
  });

  // Capture real-time drawing coordinate batches from a client
  socket.on('drawBatch', (batchData) => {
    if (socket.currentRoom) {
      // Relay only to other sockets in the same room channel
      socket.to(socket.currentRoom).emit('drawBatch', batchData);
    }
  });

  // Disconnection handler
  socket.on('disconnect', (reason) => {
    console.log(`[Socket Server] Client disconnected: ${socket.id}. Reason: ${reason}`);
  });
});

// Start the unified HTTP + WS server
server.listen(PORT, () => {
  console.log(`[Server] Running at http://localhost:${PORT}`);
  console.log(`[Server] Serving static files from: ${clientPath}`);
});
