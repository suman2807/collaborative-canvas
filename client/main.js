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

  // Generate a random fun nickname if none persists
  const generateRandomName = () => {
    const adjectives = ['Creative', 'Artistic', 'Swift', 'Bright', 'Clever', 'Happy', 'Neon', 'Bold', 'Pixel', 'Sketchy'];
    const animals = ['Cheetah', 'Owl', 'Sloth', 'Fox', 'Koala', 'Panda', 'Tiger', 'Dolphin', 'Falcon', 'Rabbit'];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${animals[Math.floor(Math.random() * animals.length)]}`;
  };
  const savedUsername = localStorage.getItem('codraw_username') || generateRandomName();
  localStorage.setItem('codraw_username', savedUsername);

  // Initialize WebSocket Client with Room and Username parameters
  const socketClient = new WebSocketClient('connection-status', '.status-indicator .status-text', room, savedUsername);
  console.log(`[App] WebSocket Client Initialized for room: ${room} as ${savedUsername}`);

  // DOM Elements binding definitions
  const toolBrush = document.getElementById('tool-brush');
  const toolEraser = document.getElementById('tool-eraser');
  const toolLine = document.getElementById('tool-line');
  const toolRect = document.getElementById('tool-rect');
  const toolCircle = document.getElementById('tool-circle');
  const toolText = document.getElementById('tool-text');
  const toolImage = document.getElementById('tool-image');
  const imageLoader = document.getElementById('image-loader');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const colorPicker = document.getElementById('color-picker');
  const strokeSlider = document.getElementById('stroke-width');
  const strokeValLabel = document.getElementById('width-val');
  const clearBtn = document.getElementById('btn-clear');
  const shareBtn = document.getElementById('btn-share');
  const exportBtn = document.getElementById('btn-export');
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  const cursorsContainer = document.getElementById('cursors-container');
  const userCountBadge = document.getElementById('user-count');
  const userListDropdown = document.getElementById('user-list-dropdown');
  
  // Toggle user list dropdown on click (essential for mobile/tablet touch users)
  const userListContainer = document.querySelector('.user-list-container');
  if (userListContainer) {
    userListContainer.addEventListener('click', (e) => {
      if (e.target.closest('#user-list-dropdown')) return;
      userListContainer.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!userListContainer.contains(e.target)) {
        userListContainer.classList.remove('active');
      }
    });
  }
  
  // Performance HUD Elements
  const fpsLabel = document.getElementById('fps-val');
  const pingLabel = document.getElementById('ping-val');

  // ==========================================
  // COLLABORATIVE MEDIATOR BINDINGS
  // ==========================================

  // 1. Send local drawing coordinate batches to peers
  canvasEngine.on('drawBatch', (batchData) => {
    socketClient.sendDrawingBatch(batchData);
  });

  // 2. Receive and render remote drawing batches from peers (freehand, shapes, or images)
  socketClient.on('drawBatch', (remoteBatch) => {
    const { shapeType, color, lineWidth } = remoteBatch;
    
    if (!shapeType || shapeType === 'path') {
      const { segments } = remoteBatch;
      if (segments) {
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
      }
    } else {
      if (shapeType === 'line') {
        canvasEngine.drawShapeOutline('line', remoteBatch.x0, remoteBatch.y0, remoteBatch.x1, remoteBatch.y1, color, lineWidth);
      } else if (shapeType === 'rect') {
        canvasEngine.drawShapeOutline('rect', remoteBatch.x, remoteBatch.y, remoteBatch.x + remoteBatch.w, remoteBatch.y + remoteBatch.h, color, lineWidth);
      } else if (shapeType === 'circle') {
        // Compute end coordinates representing radius distance
        const x1 = remoteBatch.cx + remoteBatch.r;
        const y1 = remoteBatch.cy;
        canvasEngine.drawShapeOutline('circle', remoteBatch.cx, remoteBatch.cy, x1, y1, color, lineWidth);
      } else if (shapeType === 'text') {
        canvasEngine.drawText(remoteBatch.text, remoteBatch.x, remoteBatch.y, color, remoteBatch.fontSize);
      } else if (shapeType === 'image') {
        canvasEngine.drawImage(remoteBatch.dataUrl, remoteBatch.x, remoteBatch.y, remoteBatch.w, remoteBatch.h);
      }
    }
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

  // 7. Handle active room user count updates
  socketClient.on('roomCountUpdate', ({ count }) => {
    if (count > 0) {
      userCountBadge.style.display = 'inline-block';
      userCountBadge.textContent = `${count} ${count === 1 ? 'User' : 'Users'} Online`;
    } else {
      userCountBadge.style.display = 'none';
    }
  });

  // 7.1. Handle active room user list updates
  socketClient.on('roomUsersUpdate', ({ users }) => {
    userListDropdown.innerHTML = '';
    
    // Sort so the current client is always at the top of the list
    const sortedUsers = [...users].sort((a, b) => {
      if (a.id === socketClient.socket.id) return -1;
      if (b.id === socketClient.socket.id) return 1;
      return 0;
    });

    sortedUsers.forEach(u => {
      const isYou = u.id === socketClient.socket.id;
      const userColor = getDeterministicColor(u.id);
      
      const item = document.createElement('div');
      item.className = 'user-item';
      if (isYou) item.classList.add('you-item');
      
      const dot = document.createElement('span');
      dot.className = 'user-item-dot';
      dot.style.color = userColor;
      dot.style.backgroundColor = userColor;
      item.appendChild(dot);
      
      if (isYou) {
        // Editable display name input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'username-input';
        input.value = u.username || socketClient.username;
        input.maxLength = 15;
        input.title = "Click to change display name";
        
        input.addEventListener('change', (e) => {
          const val = e.target.value.trim();
          if (val) {
            socketClient.changeUsername(val);
          }
        });
        
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            input.blur();
          }
        });
        
        item.appendChild(input);
        
        const youBadge = document.createElement('span');
        youBadge.className = 'user-item-you';
        youBadge.textContent = 'YOU';
        item.appendChild(youBadge);
      } else {
        const label = document.createElement('span');
        label.className = 'user-item-label';
        label.textContent = u.username || `User-${u.id.substring(0, 4)}`;
        item.appendChild(label);
      }
      
      userListDropdown.appendChild(item);
    });

    // Update existing cursor labels on name changes
    users.forEach(u => {
      const cursorLabel = document.querySelector(`#cursor-${u.id} .cursor-label`);
      if (cursorLabel) {
        cursorLabel.textContent = u.username || `User-${u.id.substring(0, 4)}`;
      }
    });
  });

  // 8. Load persistent room history from server on join
  socketClient.on('roomHistory', (strokes) => {
    console.log(`[App] Loading ${strokes.length} historical strokes from server persistence...`);
    canvasEngine.clear();
    
    // Draw historical strokes sequentially and populate local history stack
    strokes.forEach(stroke => {
      stroke.forEach(batch => {
        const { shapeType, color, lineWidth } = batch;
        if (!shapeType || shapeType === 'path') {
          if (batch.segments) {
            batch.segments.forEach(segment => {
              canvasEngine.drawSegment(
                segment.x0,
                segment.y0,
                segment.x1,
                segment.y1,
                color,
                lineWidth
              );
            });
          }
        } else {
          if (shapeType === 'line') {
            canvasEngine.drawShapeOutline('line', batch.x0, batch.y0, batch.x1, batch.y1, color, lineWidth);
          } else if (shapeType === 'rect') {
            canvasEngine.drawShapeOutline('rect', batch.x, batch.y, batch.x + batch.w, batch.y + batch.h, color, lineWidth);
          } else if (shapeType === 'circle') {
            canvasEngine.drawShapeOutline('circle', batch.cx, batch.cy, batch.cx + batch.r, batch.cy, color, lineWidth);
          } else if (shapeType === 'text') {
            canvasEngine.drawText(batch.text, batch.x, batch.y, color, batch.fontSize);
          } else if (shapeType === 'image') {
            canvasEngine.drawImage(batch.dataUrl, batch.x, batch.y, batch.w, batch.h);
          }
        }
      });
      // Snapshots state change in local history buffers
      canvasEngine.saveHistoryState();
    });
  });

  // 9. Listen for remote clear canvas commands
  socketClient.on('clear', () => {
    console.log('[App] Remote clear command received.');
    canvasEngine.clear();
    canvasEngine.saveHistoryState();
  });

  // ==========================================
  // PERFORMANCE METRICS HUD LOOPS
  // ==========================================

  // A. FPS counter loop
  let frameCount = 0;
  let lastFpsUpdate = performance.now();

  const calculateFps = () => {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsUpdate >= 1000) {
      const fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
      fpsLabel.textContent = `${fps} FPS`;
      frameCount = 0;
      lastFpsUpdate = now;
    }
    requestAnimationFrame(calculateFps);
  };
  requestAnimationFrame(calculateFps);

  // B. Latency (Ping) heartbeat ticker
  setInterval(() => {
    if (socketClient.socket && socketClient.socket.connected) {
      const start = performance.now();
      socketClient.sendPing(() => {
        const rtt = Math.round(performance.now() - start);
        pingLabel.textContent = `${rtt} ms`;
      });
    } else {
      pingLabel.textContent = '-- ms';
    }
  }, 2000);

  // ==========================================
  // PEER CURSOR TRACKING LOGIC
  // ==========================================

  let lastCursorSend = 0;

  // Track local cursor coordinates and transmit to peers
  canvas.addEventListener('pointermove', (e) => {
    const now = Date.now();
    // Throttle cursor updates to once every 30ms (~33 FPS) to conserve bandwidth
    if (now - lastCursorSend > 30) {
      const { x, y } = canvasEngine.getCanvasCoordinates(e);
      socketClient.sendCursor({ x, y });
      lastCursorSend = now;
    }
  });

  // Handle local cursor leaving the canvas area
  canvas.addEventListener('pointerleave', () => {
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
  socketClient.on('cursorMove', ({ id, username, x, y }) => {
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
      label.textContent = username || `User-${id.substring(0, 4)}`;

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
    toolLine.classList.remove('active');
    toolRect.classList.remove('active');
    toolCircle.classList.remove('active');
    toolText.classList.remove('active');
    toolImage.classList.remove('active');
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
    canvasEngine.commitActiveTextInput();
    canvasEngine.tool = 'brush';
    setActiveTool(toolBrush);
  });

  toolEraser.addEventListener('click', () => {
    canvasEngine.commitActiveTextInput();
    canvasEngine.tool = 'eraser';
    setActiveTool(toolEraser);
  });

  toolLine.addEventListener('click', () => {
    canvasEngine.commitActiveTextInput();
    canvasEngine.tool = 'line';
    setActiveTool(toolLine);
  });

  toolRect.addEventListener('click', () => {
    canvasEngine.commitActiveTextInput();
    canvasEngine.tool = 'rect';
    setActiveTool(toolRect);
  });

  toolCircle.addEventListener('click', () => {
    canvasEngine.commitActiveTextInput();
    canvasEngine.tool = 'circle';
    setActiveTool(toolCircle);
  });

  toolText.addEventListener('click', () => {
    canvasEngine.tool = 'text';
    setActiveTool(toolText);
  });

  // Trigger file selection for image insertions
  toolImage.addEventListener('click', () => {
    canvasEngine.commitActiveTextInput();
    imageLoader.click();
  });

  // Handle image loading, resizing and compression on file selection
  imageLoader.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      canvasEngine.compressAndInsertImage(file, () => {
        // Reset loader value so same file can be re-uploaded
        imageLoader.value = '';
      });
    }
  });

  // Wire preset color palette swatches
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', (e) => {
      const selectedColor = e.target.getAttribute('data-color');
      canvasEngine.color = selectedColor;
      // Selecting color resets to brush mode if in eraser mode, but preserves shape/text tools
      if (canvasEngine.tool === 'eraser') {
        canvasEngine.tool = 'brush';
        setActiveTool(toolBrush);
      }
      setActiveSwatch(selectedColor);
      colorPicker.value = selectedColor; // Sync picker element
    });
  });

  // Wire custom color picker
  colorPicker.addEventListener('input', (e) => {
    const selectedColor = e.target.value;
    canvasEngine.color = selectedColor;
    if (canvasEngine.tool === 'eraser') {
      canvasEngine.tool = 'brush';
      setActiveTool(toolBrush);
    }
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

  // Wire local and global canvas clear triggers
  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the entire whiteboard?')) {
      canvasEngine.clear();
      // Snapshots state change in local history buffers
      canvasEngine.saveHistoryState();
      socketClient.sendClear();
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

  // Wire Export PNG button click listener
  exportBtn.addEventListener('click', () => {
    canvasEngine.commitActiveTextInput();
    
    // Create a temporary compositing canvas to paint a solid background
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext('2d');
    
    // Fill background with theme color matching style.css #0e1117 background
    exportCtx.fillStyle = '#0e1117';
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    // Draw active drawing layer
    exportCtx.drawImage(canvas, 0, 0);
    
    // Trigger download sequence
    const link = document.createElement('a');
    link.download = `codraw-room-${room}-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  });

  // Expose engine and socket globally for debugging
  window.app = {
    canvasEngine,
    socketClient
  };
});
