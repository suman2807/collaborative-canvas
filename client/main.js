document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('canvas');
  if (!canvas) {
    console.error('[App] Canvas element was not found in the DOM.');
    return;
  }

  // ==========================================
  // ROOM ID PARSER & URL INITIALIZER
  // ==========================================
  const urlParams = new URLSearchParams(window.location.search);
  let room = urlParams.get('room');
  
  if (!room) {
    // Generate a unique 8-character room identifier
    room = Math.random().toString(36).substring(2, 10);
    // Replace address bar state dynamically without refreshing
    const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?room=${room}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
  }

  // Initialize CanvasEngine
  const canvasEngine = new CanvasEngine(canvas);
  console.log('[App] Canvas Engine Initialized successfully.');

  // Initialize WebSocket Client with Room parameter
  const socketClient = new WebSocketClient('connection-status', '.status-indicator .status-text', room);
  console.log(`[App] WebSocket Client Initialized for room: ${room}`);

  // DOM Elements binding definitions
  const toolBrush = document.getElementById('tool-brush');
  const toolEraser = document.getElementById('tool-eraser');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const colorPicker = document.getElementById('color-picker');
  const strokeSlider = document.getElementById('stroke-width');
  const strokeValLabel = document.getElementById('width-val');
  const clearBtn = document.getElementById('btn-clear');
  const shareBtn = document.getElementById('btn-share');
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  const cursorsContainer = document.getElementById('cursors-container');

  // ==========================================
  // COLLABORATIVE MEDIATOR BINDINGS
  // ==========================================

  // 1. Send local drawing coordinate batches to peers
  canvasEngine.on('drawBatch', (batchData) => {
    socketClient.sendDrawingBatch(batchData);
  });

  // 2. Receive and render remote drawing batches from peers
  socketClient.on('drawBatch', (remoteBatch) => {
    const { segments, color, lineWidth } = remoteBatch;
    
    // Draw each segment in the batch sequentially
    segments.forEach(segment => {
      canvasEngine.drawSegment(
        segment.x0,
        segment.y0,
        segment.x1,
        segment.y1,
        color,
        lineWidth
      );
    });
  });

  // 3. Emit local stroke completion signals
  canvasEngine.on('strokeEnd', () => {
    socketClient.sendStrokeEnd();
  });

  // 4. Listen for remote peer stroke completion signals to snapshot canvas
  socketClient.on('strokeEnd', () => {
    canvasEngine.saveHistoryState();
  });

  // 5. Relaying undo actions
  socketClient.on('undo', () => {
    canvasEngine.undo();
  });

  // 6. Relaying redo actions
  socketClient.on('redo', () => {
    canvasEngine.redo();
  });

  // ==========================================
  // P2P STATE SYNCHRONIZATION BINDINGS
  // ==========================================

  // Host listener: captures and sends state to requester
  socketClient.on('requestCanvasState', ({ requesterId }) => {
    console.log(`[App] Host: Capturing canvas state snapshot for client ${requesterId}`);
    const stateUrl = canvas.toDataURL();
    socketClient.sendCanvasState(requesterId, stateUrl);
  });

  // Requester listener: paints received state onto blank canvas
  socketClient.on('receiveCanvasState', ({ stateUrl }) => {
    console.log('[App] Requester: Received canvas state snapshot. Painting canvas...');
    const img = new Image();
    img.onload = () => {
      canvasEngine.ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dpr = window.devicePixelRatio || 1;
      // Draw correctly scaled high-DPI image representation
      canvasEngine.ctx.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr);
      
      // Seed history stack using current loaded bitmap
      canvasEngine.history = [canvasEngine.ctx.getImageData(0, 0, canvas.width, canvas.height)];
      canvasEngine.historyIndex = 0;
      console.log('[App] Canvas state successfully synchronized from peer.');
    };
    img.src = stateUrl;
  });

  // ==========================================
  // PEER CURSOR TRACKING LOGIC
  // ==========================================

  let lastCursorSend = 0;

  // Track local cursor coordinates and transmit to peers
  canvas.addEventListener('mousemove', (e) => {
    const now = Date.now();
    // Throttle cursor updates to once every 30ms (~33 FPS) to conserve bandwidth
    if (now - lastCursorSend > 30) {
      const { x, y } = canvasEngine.getCanvasCoordinates(e);
      socketClient.sendCursor({ x, y });
      lastCursorSend = now;
    }
  });

  // Handle local cursor leaving the canvas area
  canvas.addEventListener('mouseleave', () => {
    // Hide our local cursor position on other clients by sending out-of-bounds coordinates
    socketClient.sendCursor({ x: -100, y: -100 });
  });

  /**
   * Deterministically generates HSL color from socket string ID seed
   */
  const getDeterministicColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 85%, 65%)`; // curation: vibrant, highly visible HSL values
  };

  // Render peer cursors in the DOM overlay
  socketClient.on('cursorMove', ({ id, x, y }) => {
    let cursorEl = document.getElementById(`cursor-${id}`);
    
    // Create cursor DOM elements dynamically if not already present
    if (!cursorEl) {
      cursorEl = document.createElement('div');
      cursorEl.id = `cursor-${id}`;
      cursorEl.className = 'peer-cursor';

      // Create cursor pointer dot
      const pointer = document.createElement('div');
      pointer.className = 'cursor-pointer';
      const color = getDeterministicColor(id);
      pointer.style.setProperty('--cursor-color', color);

      // Create label tag
      const label = document.createElement('span');
      label.className = 'cursor-label';
      label.textContent = `User-${id.substring(0, 4)}`;

      cursorEl.appendChild(pointer);
      cursorEl.appendChild(label);
      cursorsContainer.appendChild(cursorEl);
    }

    // Hide cursor if out-of-bounds coordinate packet is received
    if (x < 0 || y < 0) {
      cursorEl.style.display = 'none';
    } else {
      cursorEl.style.display = 'flex';
      // Shift coordinates using transform parameters (highly hardware accelerated)
      cursorEl.style.transform = `translate(${x}px, ${y}px)`;
    }
  });

  // Clean up peer cursors on disconnect
  socketClient.on('userLeft', (userId) => {
    const cursorEl = document.getElementById(`cursor-${userId}`);
    if (cursorEl) {
      cursorEl.remove();
    }
  });

  // ==========================================
  // TOOLBAR & ACTIONS INTERACTIONS
  // ==========================================

  /**
   * Update active status styling on tool selection buttons
   */
  const setActiveTool = (activeBtn) => {
    toolBrush.classList.remove('active');
    toolEraser.classList.remove('active');
    activeBtn.classList.add('active');
  };

  /**
   * Update color swatch selections
   */
  const setActiveSwatch = (targetColor) => {
    colorSwatches.forEach(swatch => {
      if (swatch.getAttribute('data-color') === targetColor) {
        swatch.classList.add('active');
      } else {
        swatch.classList.remove('active');
      }
    });
  };

  // Wire tool selector triggers
  toolBrush.addEventListener('click', () => {
    canvasEngine.tool = 'brush';
    setActiveTool(toolBrush);
  });

  toolEraser.addEventListener('click', () => {
    canvasEngine.tool = 'eraser';
    setActiveTool(toolEraser);
  });

  // Wire preset color palette swatches
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', (e) => {
      const selectedColor = e.target.getAttribute('data-color');
      canvasEngine.color = selectedColor;
      canvasEngine.tool = 'brush'; // Selecting color resets to brush mode
      setActiveTool(toolBrush);
      setActiveSwatch(selectedColor);
      colorPicker.value = selectedColor; // Sync picker element
    });
  });

  // Wire custom color picker
  colorPicker.addEventListener('input', (e) => {
    const selectedColor = e.target.value;
    canvasEngine.color = selectedColor;
    canvasEngine.tool = 'brush';
    setActiveTool(toolBrush);
    setActiveSwatch(selectedColor); // Removes selection if picker deviates from preset swatches
  });

  // Wire stroke range input slider
  strokeSlider.addEventListener('input', (e) => {
    const selectedWidth = parseInt(e.target.value, 10);
    canvasEngine.lineWidth = selectedWidth;
    strokeValLabel.textContent = `${selectedWidth}px`;
  });

  // Wire local and global Undo buttons
  undoBtn.addEventListener('click', () => {
    if (canvasEngine.undo()) {
      socketClient.sendUndo();
    }
  });

  // Wire local and global Redo buttons
  redoBtn.addEventListener('click', () => {
    if (canvasEngine.redo()) {
      socketClient.sendRedo();
    }
  });

  // Wire local canvas clear triggers
  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the entire whiteboard?')) {
      canvasEngine.clear();
      // Snapshots state change in local history buffers
      canvasEngine.saveHistoryState();
      socketClient.sendStrokeEnd();
    }
  });

  // Wire Invite Sharing link copier
  shareBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => {
        shareBtn.classList.add('copied');
        const originalText = shareBtn.querySelector('span').textContent;
        shareBtn.querySelector('span').textContent = 'Link Copied!';
        
        // Revert UI state after 2 seconds
        setTimeout(() => {
          shareBtn.classList.remove('copied');
          shareBtn.querySelector('span').textContent = originalText;
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy room link to clipboard:', err);
        alert('Could not copy link automatically. Please copy the URL from your address bar.');
      });
  });

  // Expose engine and socket globally for debugging
  window.app = {
    canvasEngine,
    socketClient
  };
});
