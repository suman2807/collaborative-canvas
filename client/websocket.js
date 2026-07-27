/**
 * WebSocketClient - Coordinates connection handshakes, network events, and status updates.
 */
class WebSocketClient {
  constructor(statusIndicatorId, statusTextSelector, roomName, username) {
    this.statusDot = document.getElementById(statusIndicatorId);
    this.statusText = document.querySelector(statusTextSelector);
    this.room = roomName;
    this.username = username;
    this.socket = null;
    
    // Observer Callbacks for canvas synchronization
    this.listeners = {
      drawBatch: [],
      cursorMove: [],
      userLeft: [],
      strokeEnd: [],
      undo: [],
      redo: [],
      roomHistory: [],
      roomCountUpdate: [],
      roomUsersUpdate: []
    };

    this.init();
  }

  /**
   * Connect to host origin and configure socket event observers
   */
  init() {
    // Establish connection matching current origin (http/https protocols map to ws/wss automatically)
    this.socket = io({
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    this.attachEvents();
  }

  /**
   * Bind event listeners to WebSocket events
   */
  attachEvents() {
    this.socket.on('connect', () => {
      console.log(`[Socket Client] Connected. Session ID: ${this.socket.id}`);
      this.updateStatus(true);
      
      // Join the assigned room channel
      this.socket.emit('joinRoom', { room: this.room, username: this.username });
    });

    this.socket.on('disconnect', (reason) => {
      console.warn(`[Socket Client] Disconnected. Reason: ${reason}`);
      this.updateStatus(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error(`[Socket Client] Connection error: ${error.message}`);
      this.updateStatus(false);
    });

    // Listen for remote drawing batch broadcasts from the server
    this.socket.on('drawBatch', (batchData) => {
      this.emit('drawBatch', batchData);
    });

    // Listen for remote peer cursor movements
    this.socket.on('cursorMove', (cursorData) => {
      this.emit('cursorMove', cursorData);
    });

    // Listen for peer disconnection notices
    this.socket.on('userLeft', (userId) => {
      this.emit('userLeft', userId);
    });

    // Listen for stroke completion notices
    this.socket.on('strokeEnd', () => {
      this.emit('strokeEnd');
    });

    // Listen for remote undo events
    this.socket.on('undo', () => {
      this.emit('undo');
    });

    // Listen for remote redo events
    this.socket.on('redo', () => {
      this.emit('redo');
    });

    // Listen for room drawing history dump (Session Persistence)
    this.socket.on('roomHistory', (historyData) => {
      this.emit('roomHistory', historyData);
    });

    // Listen for room client count updates
    this.socket.on('roomCountUpdate', (data) => {
      this.emit('roomCountUpdate', data);
    });

    // Listen for remote shape updates
    this.socket.on('updateShape', (data) => {
      this.emit('updateShape', data);
    });

    // Listen for active users updates
    this.socket.on('roomUsersUpdate', (data) => {
      this.emit('roomUsersUpdate', data);
    });
  }

  /**
   * Update header indicator styles based on network connection state
   */
  updateStatus(isConnected) {
    if (!this.statusDot || !this.statusText) return;

    if (isConnected) {
      this.statusDot.classList.remove('disconnected');
      this.statusDot.classList.add('connected');
      this.statusText.textContent = 'Connected';
      this.statusText.style.color = 'var(--text-primary)';
    } else {
      this.statusDot.classList.remove('connected');
      this.statusDot.classList.add('disconnected');
      this.statusText.textContent = 'Disconnected';
      this.statusText.style.color = 'var(--text-secondary)';
      
      // Emit clear updates on local disconnect
      this.emit('roomCountUpdate', { count: 0 });
    }
  }

  /**
   * Subscribes observer functions to network events
   */
  on(eventName, callback) {
    if (this.listeners[eventName]) {
      this.listeners[eventName].push(callback);
    }
  }

  /**
   * Triggers registered callbacks with event payload arguments
   */
  emit(eventName, payload) {
    if (this.listeners[eventName]) {
      this.listeners[eventName].forEach(cb => cb(payload));
    }
  }

  /**
   * Emit drawing batch events to server
   */
  sendDrawingBatch(batchData) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('drawBatch', batchData);
    }
  }

  /**
   * Emit cursor coordinates to server
   */
  sendCursor(coords) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('cursorMove', coords);
    }
  }

  /**
   * Emit stroke completion signals
   */
  sendStrokeEnd() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('strokeEnd');
    }
  }

  /**
   * Emit undo action notifications
   */
  sendUndo() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('undo');
    }
  }

  /**
   * Emit redo action notifications
   */
  sendRedo() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('redo');
    }
  }

  /**
   * Emit clear canvas notifications
   */
  sendClear() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('clear');
    }
  }

  /**
   * Emit shape coordinate translation updates
   */
  sendShapeUpdate(strokeIndex, newCoords) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('updateShape', { strokeIndex, newCoords });
    }
  }

  /**
   * Emit connection test ping
   */
  sendPing(callback) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('ping', callback);
    }
  }

  /**
   * Notify server that this user updated their display name
   */
  changeUsername(newName) {
    this.username = newName;
    sessionStorage.setItem('codraw_username', newName);
    if (this.socket && this.socket.connected) {
      this.socket.emit('changeUsername', { username: newName });
    }
  }
}
