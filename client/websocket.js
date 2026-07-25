/**
 * WebSocketClient - Coordinates connection handshakes, network events, and status updates.
 */
class WebSocketClient {
  constructor(statusIndicatorId, statusTextSelector) {
    this.statusDot = document.getElementById(statusIndicatorId);
    this.statusText = document.querySelector(statusTextSelector);
    this.socket = null;
    
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
      
      // If the disconnect was initiated by the server, it will auto-reconnect.
      // If client-initiated, we would call socket.connect() manually.
    });

    this.socket.on('connect_error', (error) => {
      console.error(`[Socket Client] Connection error: ${error.message}`);
      this.updateStatus(false);
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
}
