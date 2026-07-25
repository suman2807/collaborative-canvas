document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('canvas');
  if (!canvas) {
    console.error('[App] Canvas element was not found in the DOM.');
    return;
  }

  // Initialize CanvasEngine
  const canvasEngine = new CanvasEngine(canvas);
  console.log('[App] Canvas Engine Initialized successfully.');
  
  // Debug listener to log coordinates locally
  canvasEngine.on('drawStep', (data) => {
    // console.log(`Drawing step: (${data.x0}, ${data.y0}) -> (${data.x1}, ${data.y1})`);
  });
});
