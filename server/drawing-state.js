const fs = require('fs');
const path = require('path');

const dataDirPath = path.join(__dirname, 'data');
if (!fs.existsSync(dataDirPath)) {
  fs.mkdirSync(dataDirPath, { recursive: true });
}

// In-memory caches
const roomHistories = {}; // roomID -> Array of completed strokes
const roomRedoHistories = {}; // roomID -> Array of undone strokes
const activeStrokes = {}; // roomID -> Array of coordinate batches in progress

function getRoomHistory(room) {
  if (!roomHistories[room]) {
    const filePath = path.join(dataDirPath, `${room}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const fileData = fs.readFileSync(filePath, 'utf8');
        roomHistories[room] = JSON.parse(fileData);
      } catch (err) {
        console.error(`[Drawing State] Failed to parse history file for room ${room}:`, err);
        roomHistories[room] = [];
      }
    } else {
      roomHistories[room] = [];
    }
  }
  return roomHistories[room];
}

function saveRoomHistoryToDisk(room) {
  const filePath = path.join(dataDirPath, `${room}.json`);
  const data = JSON.stringify(roomHistories[room] || []);
  fs.writeFile(filePath, data, 'utf8', (err) => {
    if (err) {
      console.error(`[Drawing State] Failed to write history file for room ${room}:`, err);
    }
  });
}

function appendStrokeBatch(room, batchData, socketId) {
  if (!activeStrokes[room]) {
    activeStrokes[room] = [];
  }
  batchData.owner = socketId;
  activeStrokes[room].push(batchData);
}

function commitActiveStroke(room, socketId) {
  const stroke = activeStrokes[room];
  if (stroke && stroke.length > 0) {
    stroke.owner = socketId;
    stroke.forEach(batch => batch.owner = socketId);
    
    if (!roomHistories[room]) {
      roomHistories[room] = [];
    }
    roomHistories[room].push(stroke);
    activeStrokes[room] = []; // Reset active stroke
    roomRedoHistories[room] = []; // Clear redo stack on new stroke
    saveRoomHistoryToDisk(room);
    return true;
  }
  return false;
}

function undoStroke(room, socketId) {
  if (roomHistories[room] && roomHistories[room].length > 0) {
    // Find the last stroke matching this socketId
    for (let i = roomHistories[room].length - 1; i >= 0; i--) {
      if (roomHistories[room][i].owner === socketId) {
        const undoneStroke = roomHistories[room].splice(i, 1)[0];
        if (!roomRedoHistories[room]) {
          roomRedoHistories[room] = [];
        }
        roomRedoHistories[room].push(undoneStroke);
        saveRoomHistoryToDisk(room);
        return true;
      }
    }
  }
  return false;
}

function redoStroke(room, socketId) {
  if (roomRedoHistories[room] && roomRedoHistories[room].length > 0) {
    // Find the last undone stroke matching this socketId
    for (let i = roomRedoHistories[room].length - 1; i >= 0; i--) {
      if (roomRedoHistories[room][i].owner === socketId) {
        const redoneStroke = roomRedoHistories[room].splice(i, 1)[0];
        if (!roomHistories[room]) {
          roomHistories[room] = [];
        }
        roomHistories[room].push(redoneStroke);
        saveRoomHistoryToDisk(room);
        return true;
      }
    }
  }
  return false;
}

function updateShapeCoords(room, strokeIndex, newCoords) {
  if (roomHistories[room] && roomHistories[room][strokeIndex]) {
    const stroke = roomHistories[room][strokeIndex];
    if (stroke.length === 1) {
      const batch = stroke[0];
      Object.assign(batch, newCoords);
      saveRoomHistoryToDisk(room);
      return true;
    }
  }
  return false;
}

function clearHistory(room) {
  roomHistories[room] = [];
  activeStrokes[room] = [];
  roomRedoHistories[room] = [];
  
  const filePath = path.join(dataDirPath, `${room}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) console.error(`[Drawing State] Failed to delete history file for room ${room}:`, err);
    });
  }
}

module.exports = {
  getRoomHistory,
  appendStrokeBatch,
  commitActiveStroke,
  undoStroke,
  redoStroke,
  updateShapeCoords,
  clearHistory
};
