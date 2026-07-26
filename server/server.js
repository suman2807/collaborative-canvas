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

    // Update and broadcast room count update
    const roomClients = io.sockets.adapter.rooms.get(room);
    const count = roomClients ? roomClients.size : 0;
    io.to(room).emit('roomCountUpdate', { count });

    // P2P State Bootstrapping: Check if there are other clients in the room
    if (roomClients && roomClients.size > 1) {
      let hostId = null;
      for (const clientId of roomClients) {
        if (clientId !== socket.id) {
          hostId = clientId;
          break;
        }
      }
      if (hostId) {
        console.log(`[Socket Server] Requesting state from host ${hostId} for new client ${socket.id}`);
        io.to(hostId).emit('requestCanvasState', { requesterId: socket.id });
      }
    }
  });

  // Capture real-time drawing coordinate batches from a client
  socket.on('drawBatch', (batchData) => {
    if (socket.currentRoom) {
      // Relay only to other sockets in the same room channel
      socket.to(socket.currentRoom).emit('drawBatch', batchData);
    }
  });

  // Relay strokeEnd trigger notifications
  socket.on('strokeEnd', () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('strokeEnd');
    }
  });

  // Relay undo command events
  socket.on('undo', () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('undo');
    }
  });

  // Relay redo command events
  socket.on('redo', () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('redo');
    }
  });

  // Forward captured canvas state from host to requester
  socket.on('sendCanvasState', ({ requesterId, stateUrl }) => {
    io.to(requesterId).emit('receiveCanvasState', { stateUrl });
  });

  // Relay pointer cursor updates
  socket.on('cursorMove', (coords) => {
    if (socket.currentRoom) {
      // Send cursor coordinates with sender's ID to other room members
      socket.to(socket.currentRoom).emit('cursorMove', {
        id: socket.id,
        x: coords.x,
        y: coords.y
      });
    }
  });

  // Disconnecting handler (called before socket leaves rooms)
  socket.on('disconnecting', () => {
    socket.rooms.forEach(currentRoom => {
      if (currentRoom !== socket.id) {
        const roomClients = io.sockets.adapter.rooms.get(currentRoom);
        let count = roomClients ? roomClients.size : 0;
        if (roomClients && roomClients.has(socket.id)) {
          count = roomClients.size - 1;
        }
        
        // Notify other clients about count and user departure
        socket.to(currentRoom).emit('roomCountUpdate', { count });
        socket.to(currentRoom).emit('userLeft', socket.id);
      }
    });
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
