const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
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

// Resolve client static folder and data persistence folder paths
const clientPath = path.join(__dirname, '../client');
const dataDirPath = path.join(__dirname, 'data');

// Create data persistence directory if it does not exist
if (!fs.existsSync(dataDirPath)) {
  fs.mkdirSync(dataDirPath, { recursive: true });
}

// In-memory caches for room drawing histories
const roomHistories = {}; // roomID -> Array of completed strokes (each stroke is an array of coordinate batches)
const activeStrokes = {}; // roomID -> Array of batches in the currently active stroke

// Helper: Async write room history to disk
const saveRoomHistoryToDisk = (room) => {
  const filePath = path.join(dataDirPath, `${room}.json`);
  const data = JSON.stringify(roomHistories[room] || []);
  fs.writeFile(filePath, data, 'utf8', (err) => {
    if (err) {
      console.error(`[Server] Failed to write history file for room ${room}:`, err);
    }
  });
};

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

    // Load room history from disk if not present in memory cache
    if (!roomHistories[room]) {
      const filePath = path.join(dataDirPath, `${room}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const fileData = fs.readFileSync(filePath, 'utf8');
          roomHistories[room] = JSON.parse(fileData);
        } catch (err) {
          console.error(`[Server] Failed to parse history file for room ${room}:`, err);
          roomHistories[room] = [];
        }
      } else {
        roomHistories[room] = [];
      }
    }

    // Send saved drawing history to the joining client
    socket.emit('roomHistory', roomHistories[room]);
  });

  // Capture real-time drawing coordinate batches from a client
  socket.on('drawBatch', (batchData) => {
    if (socket.currentRoom) {
      // Relay only to other sockets in the same room channel
      socket.to(socket.currentRoom).emit('drawBatch', batchData);

      // Append batch data to the currently active stroke sequence
      if (!activeStrokes[socket.currentRoom]) {
        activeStrokes[socket.currentRoom] = [];
      }
      activeStrokes[socket.currentRoom].push(batchData);
    }
  });

  // Relay strokeEnd trigger notifications and commit active stroke to history
  socket.on('strokeEnd', () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('strokeEnd');

      const stroke = activeStrokes[socket.currentRoom];
      if (stroke && stroke.length > 0) {
        if (!roomHistories[socket.currentRoom]) {
          roomHistories[socket.currentRoom] = [];
        }
        roomHistories[socket.currentRoom].push(stroke);
        activeStrokes[socket.currentRoom] = []; // Clear active stroke accumulator

        // Save committed changes to disk
        saveRoomHistoryToDisk(socket.currentRoom);
      }
    }
  });

  // Relay undo command events and adjust history index
  socket.on('undo', () => {
    if (socket.currentRoom) {
      if (roomHistories[socket.currentRoom] && roomHistories[socket.currentRoom].length > 0) {
        roomHistories[socket.currentRoom].pop(); // Pop last completed stroke
        saveRoomHistoryToDisk(socket.currentRoom);
      }
      socket.to(socket.currentRoom).emit('undo');
    }
  });

  // Relay redo command events
  socket.on('redo', () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('redo');
    }
  });

  // Handle client canvas clear commands
  socket.on('clear', () => {
    if (socket.currentRoom) {
      roomHistories[socket.currentRoom] = [];
      activeStrokes[socket.currentRoom] = [];
      
      // Delete persistence file if it exists
      const filePath = path.join(dataDirPath, `${socket.currentRoom}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
          if (err) console.error(`[Server] Failed to delete history file for room ${socket.currentRoom}:`, err);
        });
      }

      socket.to(socket.currentRoom).emit('clear');
    }
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

  // Respond to connection latency pings
  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback();
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
