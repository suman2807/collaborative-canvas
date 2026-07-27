const activeUsers = {}; // socket.id -> { username, roomId }

function joinRoom(socket, room, username, io) {
  // Leave previous rooms
  socket.rooms.forEach(currentRoom => {
    if (currentRoom !== socket.id) {
      socket.leave(currentRoom);
    }
  });

  socket.join(room);
  socket.currentRoom = room;
  socket.username = username ? String(username).trim().substring(0, 15) : `User (${socket.id.substring(0, 4)})`;
  activeUsers[socket.id] = { username: socket.username, roomId: room };
}

function getRoomClients(io, room) {
  return io.sockets.adapter.rooms.get(room);
}

function getRoomCount(io, room) {
  const clients = getRoomClients(io, room);
  return clients ? clients.size : 0;
}

function getRoomUsers(io, room) {
  const clients = getRoomClients(io, room);
  const users = [];
  if (clients) {
    for (const clientId of clients) {
      const clientSocket = io.sockets.sockets.get(clientId);
      users.push({
        id: clientId,
        username: clientSocket?.username || `User (${clientId.substring(0, 4)})`
      });
    }
  }
  return users;
}

function broadcastRoomUsers(io, room) {
  const users = getRoomUsers(io, room);
  io.to(room).emit('roomUsersUpdate', { users });
}

function handleUserLeave(socket, io) {
  delete activeUsers[socket.id];
  socket.rooms.forEach(currentRoom => {
    if (currentRoom !== socket.id) {
      const count = getRoomCount(io, currentRoom);
      socket.to(currentRoom).emit('roomCountUpdate', { count });
      socket.to(currentRoom).emit('userLeft', socket.id);
      
      const users = getRoomUsers(io, currentRoom).filter(u => u.id !== socket.id);
      socket.to(currentRoom).emit('roomUsersUpdate', { users });
    }
  });
}

module.exports = {
  joinRoom,
  getRoomCount,
  getRoomUsers,
  broadcastRoomUsers,
  handleUserLeave
};
