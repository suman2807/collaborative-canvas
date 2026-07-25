document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('canvas');
  if (!canvas) {
    console.error('[App] Canvas element was not found in the DOM.');
    return;
  }

  // Initialize CanvasEngine
  const canvasEngine = new CanvasEngine(canvas);
  console.log('[App] Canvas Engine Initialized successfully.');

  // Initialize WebSocket Client
  const socketClient = new WebSocketClient('connection-status', '.status-indicator .status-text');
  console.log('[App] WebSocket Client Initialized successfully.');

  // DOM Elements binding definitions
  const toolBrush = document.getElementById('tool-brush');
  const toolEraser = document.getElementById('tool-eraser');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const colorPicker = document.getElementById('color-picker');
  const strokeSlider = document.getElementById('stroke-width');
  const strokeValLabel = document.getElementById('width-val');
  const clearBtn = document.getElementById('btn-clear');

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

  // Expose engine and socket globally for debugging / upcoming module integrations
  window.app = {
    canvasEngine,
    socketClient
  };
});
