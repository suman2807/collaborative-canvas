/**
 * CanvasEngine - Manages drawing context, interactions, coordinate mapping, and retina scaling.
 */
class CanvasEngine {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    
    // Core Engine State
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;
    
    // Current Drawing Config Defaults
    this.color = '#a855f7'; // Purple accent
    this.lineWidth = 4;
    this.tool = 'brush'; // 'brush' or 'eraser'
    
    // Performance Buffering States
    this.batchBuffer = [];
    this.flushInterval = null;
    
    // Observer Callbacks for network broadcasts
    this.listeners = {
      drawStep: [],
      drawBatch: []
    };

    this.init();
  }

  /**
   * Initialize canvas parameters and attach listeners
   */
  init() {
    this.setupScaling();
    this.attachEventListeners();
    this.startBufferFlushTimer();
    
    // Listen to resize events and adjust canvas backing scale
    window.addEventListener('resize', () => this.handleResize());
  }

  /**
   * Scales the canvas backing store to match the display's physical resolution
   * preventing blurry lines on Retina/High-DPI displays.
   */
  setupScaling() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Set backing store dimensions
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    // Reset transform scale to handle coordinate mapping transparently
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
    
    // Configure default brush styles for smooth joins
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  /**
   * Handle canvas resize while attempting to keep standard dimensions mapped correctly
   */
  handleResize() {
    // Save canvas contents before resizing
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(this.canvas, 0, 0);

    const rect = this.canvas.getBoundingClientRect();
    this.setupScaling();

    // Redraw previous contents onto the resized canvas
    const dpr = window.devicePixelRatio || 1;
    this.ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width / dpr, tempCanvas.height / dpr);
  }

  /**
   * Maps mouse/touch client coordinates to canvas coordinate system space
   */
  getCanvasCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    let clientX, clientY;

    // Handle touch events
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  /**
   * Start a drawing path locally
   */
  startDrawing(x, y) {
    this.isDrawing = true;
    this.lastX = x;
    this.lastY = y;
  }

  /**
   * Draw a line segment locally, buffer coordinate positions, and trigger local paints
   */
  draw(x, y) {
    if (!this.isDrawing) return;

    const strokeColor = this.tool === 'eraser' ? '#0e1117' : this.color;

    // Render segment immediately for zero latency feedback
    this.drawSegment(this.lastX, this.lastY, x, y, strokeColor, this.lineWidth);

    // Push coordinates to the batch buffer
    this.batchBuffer.push({
      x0: this.lastX,
      y0: this.lastY,
      x1: x,
      y1: y
    });

    // Notify observers that listen to individual steps (like debugging trackers)
    this.emit('drawStep', {
      x0: this.lastX,
      y0: this.lastY,
      x1: x,
      y1: y,
      color: strokeColor,
      lineWidth: this.lineWidth,
      tool: this.tool
    });

    // Shift coordinates
    this.lastX = x;
    this.lastY = y;
  }

  /**
   * Render a specific line segment to the 2D context
   */
  drawSegment(x0, y0, x1, y1, color, width) {
    this.ctx.beginPath();
    this.ctx.moveTo(x0, y0);
    this.ctx.lineTo(x1, y1);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.stroke();
  }

  /**
   * Periodic flusher timer that bundles drawing segments and transmits them
   */
  startBufferFlushTimer() {
    // Check and flush coordinates at 60Hz (~16ms)
    this.flushInterval = setInterval(() => {
      if (this.batchBuffer.length === 0) return;

      const batchPayload = {
        segments: [...this.batchBuffer],
        color: this.tool === 'eraser' ? '#0e1117' : this.color,
        lineWidth: this.lineWidth,
        tool: this.tool
      };

      // Emit batch payload to mediator listeners
      this.emit('drawBatch', batchPayload);

      // Reset local batch buffer
      this.batchBuffer = [];
    }, 16);
  }

  /**
   * Stop the drawing sequence
   */
  stopDrawing() {
    this.isDrawing = false;
  }

  /**
   * Setup DOM listeners for Mouse and Touch interaction vectors
   */
  attachEventListeners() {
    // Mouse Event Handlers
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Support left-click only
      const { x, y } = this.getCanvasCoordinates(e);
      this.startDrawing(x, y);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const { x, y } = this.getCanvasCoordinates(e);
      this.draw(x, y);
    });

    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseleave', () => this.stopDrawing());

    // Mobile Touch Event Handlers
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault(); // Stop mobile scroll animations
      const { x, y } = this.getCanvasCoordinates(e);
      this.startDrawing(x, y);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const { x, y } = this.getCanvasCoordinates(e);
      this.draw(x, y);
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => this.stopDrawing());
  }

  /**
   * Subscribes observer functions to Engine events
   */
  on(eventName, callback) {
    if (this.listeners[eventName]) {
      this.listeners[eventName].push(callback);
    }
  }

  /**
   * Triggers callbacks with argument payloads
   */
  emit(eventName, payload) {
    if (this.listeners[eventName]) {
      this.listeners[eventName].forEach(cb => cb(payload));
    }
  }

  /**
   * Clear the entire canvas context and cancel intervals on teardown
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
  }
}
