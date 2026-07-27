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

function appendStrokeBatch(room, batchData) {
  if (!activeStrokes[room]) {
    activeStrokes[room] = [];
  }
  activeStrokes[room].push(batchData);
}

function commitActiveStroke(room) {
  const stroke = activeStrokes[room];
  if (stroke && stroke.length > 0) {
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

function undoStroke(room) {
  if (roomHistories[room] && roomHistories[room].length > 0) {
    const undoneStroke = roomHistories[room].pop();
    if (!roomRedoHistories[room]) {
      roomRedoHistories[room] = [];
    }
    roomRedoHistories[room].push(undoneStroke);
    saveRoomHistoryToDisk(room);
    return true;
  }
  return false;
}

function redoStroke(room) {
  if (roomRedoHistories[room] && roomRedoHistories[room].length > 0) {
    const redoneStroke = roomRedoHistories[room].pop();
    if (!roomHistories[room]) {
      roomHistories[room] = [];
    }
    roomHistories[room].push(redoneStroke);
    saveRoomHistoryToDisk(room);
    return true;
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
  clearHistory
};
