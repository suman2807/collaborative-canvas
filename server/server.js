const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const roomManager = require('./rooms');
const drawingStateManager = require('./drawing-state');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

const PORT = process.env.PORT || 3000;
const clientPath = path.join(__dirname, '../client');

app.use(express.static(clientPath));

app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

io.on('connection', (socket) => {
  console.log(`[Socket Server] Client connected: ${socket.id}`);

  socket.on('joinRoom', ({ room, username }) => {
    roomManager.joinRoom(socket, room, username, io);
    console.log(`[Socket Server] Client ${socket.id} (${socket.username}) joined room: ${room}`);

    // Update and broadcast room statistics
    const count = roomManager.getRoomCount(io, room);
    io.to(room).emit('roomCountUpdate', { count });
    roomManager.broadcastRoomUsers(io, room);

    // Send saved drawing history to the joining client
    const history = drawingStateManager.getRoomHistory(room);
    socket.emit('roomHistory', history);
  });

  socket.on('drawBatch', (batchData) => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('drawBatch', batchData);
      drawingStateManager.appendStrokeBatch(socket.currentRoom, batchData);
    }
  });

  socket.on('strokeEnd', () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('strokeEnd');
      drawingStateManager.commitActiveStroke(socket.currentRoom);
    }
  });

  socket.on('undo', () => {
    if (socket.currentRoom) {
      const success = drawingStateManager.undoStroke(socket.currentRoom);
      if (success) {
        socket.to(socket.currentRoom).emit('undo');
      }
    }
  });

  socket.on('redo', () => {
    if (socket.currentRoom) {
      const success = drawingStateManager.redoStroke(socket.currentRoom);
      if (success) {
        socket.to(socket.currentRoom).emit('redo');
      }
    }
  });

  socket.on('clear', () => {
    if (socket.currentRoom) {
      drawingStateManager.clearHistory(socket.currentRoom);
      socket.to(socket.currentRoom).emit('clear');
    }
  });

  socket.on('cursorMove', (coords) => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('cursorMove', {
        id: socket.id,
        username: socket.username,
        x: coords.x,
        y: coords.y
      });
    }
  });

  socket.on('changeUsername', ({ username }) => {
    const sanitized = String(username).trim().substring(0, 15);
    if (sanitized && socket.currentRoom) {
      socket.username = sanitized;
      roomManager.broadcastRoomUsers(io, socket.currentRoom);
    }
  });

  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback();
    }
  });

  socket.on('disconnecting', () => {
    roomManager.handleUserLeave(socket, io);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket Server] Client disconnected: ${socket.id}. Reason: ${reason}`);
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Running at http://localhost:${PORT}`);
  console.log(`[Server] Serving static files from: ${clientPath}`);
});
