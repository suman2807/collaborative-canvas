/**
 * WebSocketClient - Coordinates connection handshakes, network events, and status updates.
 */
class WebSocketClient {
  constructor(statusIndicatorId, statusTextSelector) {
    this.statusDot = document.getElementById(statusIndicatorId);
    this.statusText = document.querySelector(statusTextSelector);
    this.socket = null;
    
    // Observer Callbacks for canvas synchronization
    this.listeners = {
      drawBatch: []
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
      console.log(`[Socket Client] Connected. Client Session ID: ${this.socket.id}`);
      this.updateStatus(true);
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
}
