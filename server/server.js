const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Use environment port or default to 3000
const PORT = process.env.PORT || 3000;

// Resolve client static folder path
const clientPath = path.join(__dirname, '../client');

// Middleware to serve static files from the client directory
app.use(express.static(clientPath));

// Health check API endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Fallback: Serve index.html for any unmatched routes (SPA fallback behavior)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Start the unified HTTP server
server.listen(PORT, () => {
  console.log(`[Server] Running at http://localhost:${PORT}`);
  console.log(`[Server] Serving static files from: ${clientPath}`);
});
