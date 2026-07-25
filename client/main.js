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

  // Wire local canvas clear triggers
  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the entire whiteboard?')) {
      canvasEngine.clear();
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
