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
    this.tool = 'brush'; // 'brush', 'eraser', 'line', 'rect', 'circle', 'text', 'image'
    
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
   * Subscribe to internal canvas engine events
   */
  on(eventName, callback) {
    if (this.listeners[eventName]) {
      this.listeners[eventName].push(callback);
    }
  }

  /**
   * Emit internal canvas engine events to subscribers
   */
  emit(eventName, payload) {
    if (this.listeners[eventName]) {
      this.listeners[eventName].forEach(cb => cb(payload));
    }
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
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
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
    if (this.tool !== 'brush' && this.tool !== 'eraser' && this.tool !== 'text' && this.tool !== 'image') {
      this.previewSnapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Draw a line segment or render shape previews locally
   */
  draw(x, y) {
    if (!this.isDrawing) return;
    if (this.tool === 'text' || this.tool === 'image') return; // Skip drag movement operations

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
   * Render an image onto the canvas 2D context
   */
  drawImage(dataUrl, x, y, w, h, callback) {
    const img = new Image();
    img.onload = () => {
      this.ctx.drawImage(img, x, y, w, h);
      if (typeof callback === 'function') callback();
    };
    img.src = dataUrl;
  }

  /**
   * Reads, compresses (max 400px limit, JPEG 0.7), centers, and draws an image locally
   * and broadcasts the result to peers.
   */
  compressAndInsertImage(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Calculate proportional scale constraints
        let w = img.width;
        let h = img.height;
        const maxDim = 400;
        
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        // Create an in-memory helper canvas for downscaling & compression
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0, w, h);

        // Get compressed Base64 data URL string
        const compressedDataUrl = tempCanvas.toDataURL('image/jpeg', 0.7);

        // Compute local viewport center coordinates
        const rect = this.canvas.getBoundingClientRect();
        const cx = Math.round(rect.width / 2);
        const cy = Math.round(rect.height / 2);
        const x = cx - w / 2;
        const y = cy - h / 2;

        // Draw image onto the active context
        this.drawImage(compressedDataUrl, x, y, w, h, () => {
          this.saveHistoryState();

          // Compile image shape batch payload
          const imagePayload = {
            shapeType: 'image',
            dataUrl: compressedDataUrl,
            x: x,
            y: y,
            w: w,
            h: h
          };

          // Emit batch payload & trigger end boundaries
          this.emit('drawBatch', imagePayload);
          this.emit('strokeEnd');

          if (typeof callback === 'function') callback();
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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
    if (this.tool === 'text' || this.tool === 'image') return; // Skip mouseup handlers for text/image tools
    
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
    // Unified Pointer Event Handlers
    this.canvas.addEventListener('pointerdown', (e) => {
      // Support left-click, active touch, or active stylus tips (button 0 or -1 for touches)
      if (e.button !== 0 && e.button !== -1) return;
      if (this.tool === 'image') return; // Skip drag triggers for image insertion

      // Capture the pointer ID to receive pointer movements outside the canvas container boundaries
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        console.warn('[CanvasEngine] setPointerCapture failed:', err);
      }

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

    this.canvas.addEventListener('pointermove', (e) => {
      const { x, y } = this.getCanvasCoordinates(e);
      this.draw(x, y);
    });

    const stopDrawingHandler = (e) => {
      if (this.isDrawing) {
        try {
          this.canvas.releasePointerCapture(e.pointerId);
        } catch (err) {
          // Ignore failures if capture was already released
        }
        this.stopDrawing();
      }
    };

    this.canvas.addEventListener('pointerup', stopDrawingHandler);
    this.canvas.addEventListener('pointercancel', stopDrawingHandler);
    this.canvas.addEventListener('pointerleave', stopDrawingHandler);
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
