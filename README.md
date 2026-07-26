# CoDraw 🎨

CoDraw is a high-performance, real-time collaborative drawing canvas built from the ground up using **Vanilla JavaScript** (HTML5 Canvas 2D API) and **Node.js with Socket.io**. 

Designed with a premium dark-mode glassmorphism theme, it supports dynamic room partitioning, real-time cursor tracking, distributed undo/redo, auto-save session persistence, and a live performance metrics HUD.

---

## ✨ Features

- **🚀 Collaborative Drawing Engine**: Freehand drawing with brush/eraser, custom colors, size selection, and `devicePixelRatio` scaling to prevent blurry rendering on high-DPI/Retina screens.
- **⚡ Bandwidth-Optimized Networking**: Queue-based drawing segment batching flushed at 60Hz (~16ms) to minimize packet overhead while maintaining smooth path curves.
- **📍 Real-Time Peer Cursor Tracking**: Throttled pointer tracking (30ms limits) rendering styled DOM cursor tags with custom colors deterministically hashed from socket IDs.
- **🚪 Isolated Rooms & Instant Share**: Dynamic room partitioning via URL parameters (`?room=unique-id`) and a one-click invite-link sharing action.
- **👥 Active User List Dropdown**: Hover over the online users count badge to reveal a detailed dropdown list of active participants, complete with their color indicators and user labels.
- **↩️ Distributed Undo/Redo**: Global history stacks synchronized in real time using `getImageData` and `putImageData` snapshots.
- **📥 Whiteboard PNG Exporter**: Click "Export PNG" in the header to download a high-resolution composition matching the canvas view, rendered on a solid dark-mode background matching the application theme.
- **💾 Disk-Backed Session Persistence**: Auto-saves room strokes to the server's disk (`/server/data/<room-id>.json`) on stroke completions. Reloads and reconstructs all drawings and history stacks automatically on page refresh.
- **📊 Live Performance HUD**: Floating glassmorphism card rendering real-time **FPS** (via `requestAnimationFrame`) and WebSocket **Ping Latency RTT** (via heartbeat events).
- **📐 Shape Drawing Tools**: Draw straight lines, rectangles, and circles with interactive outline drag previews.
- **📝 Collaborative Text Tool**: Click anywhere on the board to overlay text input, type characters, and press Enter to render and sync text fields.
- **🖼️ Image Insertion Tool**: Insert local images, automatically compressed and centered, and synced dynamically to all room users.
- **📱 Touch & Stylus Support**: Fully mobile-responsive and handles touch vectors natively.

---

## 🛠️ Codebase Architecture

```
├── client/
│   ├── index.html       # Markup and HUD layouts
│   ├── style.css        # Glassmorphism styling rules
│   ├── canvas.js        # Drawing context & history stacks
│   ├── websocket.js     # WebSocket client events
│   └── main.js          # Client-side mediator wiring
├── server/
│   ├── server.js        # Node.js + Socket.io server
│   └── data/            # Persistent room JSON archives
├── package.json         # Node.js project configs
└── .gitignore
```

---

## 🚀 Getting Started

### 📋 Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- npm (Node Package Manager)

### 💻 Installation & Startup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/suman2807/collaborative-canvas.git
   cd collaborative-canvas
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the application:**
   ```bash
   npm start
   ```

4. **Access the application:**
   Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 Testing Collaboration Locally
1. Navigate to `http://localhost:3000` in your web browser.
2. Click **Share Room** in the top header to copy the invite URL to your clipboard.
3. Open a second browser tab (or an incognito window) and paste the copied link.
4. Draw on either tab—your strokes, shapes, and undo/redo operations will sync in real time!
