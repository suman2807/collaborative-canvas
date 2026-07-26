/**
 * CanvasEngine - Manages drawing context, interactions, coordinate mapping, and retina scaling.
 */
class CanvasEngine {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    
    // Core Engine State
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;
    this.lastX = 0;
    this.lastY = 0;
    
    // Current Drawing Config Defaults
    this.color = '#a855f7'; // Purple accent
    this.lineWidth = 4;
    this.tool = 'brush'; // 'brush', 'eraser', 'line', 'rect', 'circle', 'text'
    
    // Performance Buffering States
    this.batchBuffer = [];
    this.flushInterval = null;

    // Undo/Redo States
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 30; // Max stored canvas snapshots to control memory allocation
    
    // Interactive Shape Preview Snapshot
    this.previewSnapshot = null;

    // Observer Callbacks for network broadcasts
    this.listeners = {
      drawStep: [],
      drawBatch: [],
      strokeEnd: []
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

    // Store baseline blank state if history stack is empty
    if (this.history.length === 0) {
      this.saveHistoryState();
    }
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
    this.startX = x;
    this.startY = y;
    this.lastX = x;
    this.lastY = y;

    // Save full canvas snapshot for preview rendering if drawing a shape
    if (this.tool !== 'brush' && this.tool !== 'eraser' && this.tool !== 'text') {
      this.previewSnapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Draw a line segment or render shape previews locally
   */
  draw(x, y) {
    if (!this.isDrawing) return;
    if (this.tool === 'text') return; // Skip drag movement operations for text mode

    this.lastX = x;
    this.lastY = y;

    const strokeColor = this.tool === 'eraser' ? '#0e1117' : this.color;

    if (this.tool === 'brush' || this.tool === 'eraser') {
      // Render segment immediately for zero latency feedback
      this.drawSegment(this.startX, this.startY, x, y, strokeColor, this.lineWidth);

      // Push coordinates to the batch buffer
      this.batchBuffer.push({
        x0: this.startX,
        y0: this.startY,
        x1: x,
        y1: y
      });

      // Notify observers that listen to individual steps (like debugging trackers)
      this.emit('drawStep', {
        x0: this.startX,
        y0: this.startY,
        x1: x,
        y1: y,
        color: strokeColor,
        lineWidth: this.lineWidth,
        tool: this.tool
      });

      // Shift coordinates for freehand drawing
      this.startX = x;
      this.startY = y;
    } else {
      // Render shape preview by first restoring canvas back to starting snapshot
      this.ctx.putImageData(this.previewSnapshot, 0, 0);

      // Render shape outline
      this.drawShapeOutline(this.tool, this.startX, this.startY, x, y, strokeColor, this.lineWidth);
    }
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
   * Render a specific shape outline to the 2D context
   */
  drawShapeOutline(shapeType, x0, y0, x1, y1, color, width) {
    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;

    if (shapeType === 'line') {
      this.ctx.moveTo(x0, y0);
      this.ctx.lineTo(x1, y1);
    } else if (shapeType === 'rect') {
      this.ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    } else if (shapeType === 'circle') {
      const radius = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
      this.ctx.arc(x0, y0, radius, 0, 2 * Math.PI);
    }

    this.ctx.stroke();
  }

  /**
   * Render a text block directly to the 2D context
   */
  drawText(text, x, y, color, fontSize) {
    this.ctx.font = fontSize || '600 16px "Plus Jakarta Sans", sans-serif';
    this.ctx.fillStyle = color;
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(text, x, y);
  }

  /**
   * Commits any active input box on the screen onto the Canvas context
   */
  commitActiveTextInput() {
    const activeInput = document.getElementById('active-canvas-text-input');
    if (activeInput) {
      const text = activeInput.value.trim();
      const canvasX = parseFloat(activeInput.getAttribute('data-canvas-x'));
      const canvasY = parseFloat(activeInput.getAttribute('data-canvas-y'));
      
      if (text) {
        this.drawText(text, canvasX, canvasY, this.color);
        
        // Compile coordinates for text shape batch payload
        const textPayload = {
          shapeType: 'text',
          text: text,
          x: canvasX,
          y: canvasY,
          color: this.color,
          fontSize: '600 16px "Plus Jakarta Sans", sans-serif'
        };

        // Emit text payload
        this.emit('drawBatch', textPayload);
        this.saveHistoryState();
        this.emit('strokeEnd');
      }
      activeInput.remove();
    }
  }

  /**
   * Captures and stores the current canvas state onto our history stack
   */
  saveHistoryState() {
    // Truncate any redo states if we drew a new stroke after undoing
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Capture context state
    const snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.history.push(snapshot);

    // Keep history stack within boundaries
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    this.historyIndex = this.history.length - 1;
  }

  /**
   * Reverts canvas state back one step
   */
  undo() {
    this.commitActiveTextInput(); // Commit any typing text before undoing
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const snapshot = this.history[this.historyIndex];
      this.ctx.putImageData(snapshot, 0, 0);
      return true;
    }
    return false;
  }

  /**
   * Advances canvas state forward one step
   */
  redo() {
    this.commitActiveTextInput(); // Commit any typing text before redoing
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const snapshot = this.history[this.historyIndex];
      this.ctx.putImageData(snapshot, 0, 0);
      return true;
    }
    return false;
  }

  /**
   * Periodic flusher timer that bundles drawing segments and transmits them
   */
  startBufferFlushTimer() {
    // Check and flush coordinates at 60Hz (~16ms)
    this.flushInterval = setInterval(() => {
      if (this.batchBuffer.length === 0) return;

      const batchPayload = {
        shapeType: 'path',
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
   * Stop the drawing sequence and commit shape states
   */
  stopDrawing() {
    if (this.tool === 'text') return; // Skip mouseup handlers for text tool
    
    if (this.isDrawing) {
      this.isDrawing = false;

      // Handle final shapes commit & broadcast
      if (this.tool !== 'brush' && this.tool !== 'eraser') {
        const strokeColor = this.color;
        
        // Paint shape permanently
        this.ctx.putImageData(this.previewSnapshot, 0, 0);
        this.drawShapeOutline(this.tool, this.startX, this.startY, this.lastX, this.lastY, strokeColor, this.lineWidth);

        // Compile coordinates for shape batch payload
        let shapePayload = {
          shapeType: this.tool,
          color: strokeColor,
          lineWidth: this.lineWidth
        };

        if (this.tool === 'line') {
          shapePayload.x0 = this.startX;
          shapePayload.y0 = this.startY;
          shapePayload.x1 = this.lastX;
          shapePayload.y1 = this.lastY;
        } else if (this.tool === 'rect') {
          shapePayload.x = this.startX;
          shapePayload.y = this.startY;
          shapePayload.w = this.lastX - this.startX;
          shapePayload.h = this.lastY - this.startY;
        } else if (this.tool === 'circle') {
          shapePayload.cx = this.startX;
          shapePayload.cy = this.startY;
          shapePayload.r = Math.sqrt((this.lastX - this.startX) ** 2 + (this.lastY - this.startY) ** 2);
        }

        // Emit shape payload
        this.emit('drawBatch', shapePayload);
      }

      this.saveHistoryState();
      this.emit('strokeEnd');
    }
  }

  /**
   * Setup DOM listeners for Mouse and Touch interaction vectors
   */
  attachEventListeners() {
    // Mouse Event Handlers
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Support left-click only
      
      const { x, y } = this.getCanvasCoordinates(e);

      // Handle text input creation
      if (this.tool === 'text') {
        this.commitActiveTextInput();
        
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'active-canvas-text-input';
        input.className = 'canvas-text-input';
        input.style.left = `${clientX}px`;
        input.style.top = `${clientY}px`;
        input.style.setProperty('--accent-color', this.color);
        input.setAttribute('data-canvas-x', x);
        input.setAttribute('data-canvas-y', y);
        
        const wrapper = document.getElementById('canvas-wrapper') || this.canvas.parentElement;
        wrapper.appendChild(input);
        
        setTimeout(() => input.focus(), 10);
        
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            this.commitActiveTextInput();
          }
        });
        input.addEventListener('blur', () => {
          this.commitActiveTextInput();
        });
        return;
      }

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

      // Handle text input on mobile
      if (this.tool === 'text') {
        this.commitActiveTextInput();
        
        const rect = this.canvas.getBoundingClientRect();
        let touchX = x;
        let touchY = y;
        if (e.touches && e.touches.length > 0) {
          touchX = e.touches[0].clientX - rect.left;
          touchY = e.touches[0].clientY - rect.top;
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'active-canvas-text-input';
        input.className = 'canvas-text-input';
        input.style.left = `${touchX}px`;
        input.style.top = `${touchY}px`;
        input.style.setProperty('--accent-color', this.color);
        input.setAttribute('data-canvas-x', x);
        input.setAttribute('data-canvas-y', y);
        
        const wrapper = document.getElementById('canvas-wrapper') || this.canvas.parentElement;
        wrapper.appendChild(input);
        
        setTimeout(() => input.focus(), 10);
        
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            this.commitActiveTextInput();
          }
        });
        input.addEventListener('blur', () => {
          this.commitActiveTextInput();
        });
        return;
      }

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
    this.commitActiveTextInput(); // Clean input if clearing
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
  }
}
