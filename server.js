#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');
const JsonDB = require('auto-json-db');
const { generateThemeCSS} = require('./themes');

const PORT = process.env.PORT || 8766;
const DATA_DIR = process.env.DATA_DIR || './data';
const THEME = process.env.THEME || 'default';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database
const db = new JsonDB(path.join(DATA_DIR, 'paste.json'));

// Initialize db structure if needed
if (!db.data.passwordHash) {
  db.data.passwordHash = null;
}
if (!db.data.content) {
  db.data.content = '';
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password) {
  if (!db.data.passwordHash) return false;
  return hashPassword(password) === db.data.passwordHash;
}

function serveFile(filePath, contentType, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
}

function checkAuth(req) {
  if (!db.data.passwordHash) return true;
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7);
  return verifyPassword(token);
}

function requireAuth(req, res) {
  if (!checkAuth(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }
  return true;
}

// HTTP server
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Serve static files
  if (url.pathname === '/' && req.method === 'GET') {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const themeVars = generateThemeCSS(THEME);
    const injectedHtml = html.replace('<style id="theme-vars"></style>', `<style id="theme-vars">${themeVars}</style>`);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(injectedHtml);
    return;
  }
  
  if (url.pathname === '/styles.css' && req.method === 'GET') {
    serveFile('styles.css', 'text/css', res);
    return;
  }
  
  if (url.pathname === '/client.js' && req.method === 'GET') {
    serveFile('client.js', 'application/javascript', res);
    return;
  }
  
  // API: Check auth status
  if (url.pathname === '/api/auth' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      needsSetup: !db.data.passwordHash,
      requiresAuth: !!db.data.passwordHash,
      authenticated: checkAuth(req)
    }));
    return;
  }
  
  // API: Setup password
  if (url.pathname === '/api/setup' && req.method === 'POST') {
    if (db.data.passwordHash) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Password already set' }));
      return;
    }
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body);
        
        if (!password || password.length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Password must be at least 4 characters' }));
          return;
        }
        
        db.data.passwordHash = hashPassword(password);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }
  
  // API: Get paste content
  if (url.pathname === '/api/paste' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content: db.data.content }));
    return;
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  console.log('Client connected');
  
  // Send current content immediately
  ws.send(JSON.stringify({ type: 'content', content: db.data.content }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'auth') {
        // Store auth token for this connection
        ws.authenticated = !db.data.passwordHash || verifyPassword(data.token);
        ws.send(JSON.stringify({ type: 'auth', authenticated: ws.authenticated }));
      }
      
      if (data.type === 'update') {
        if (db.data.passwordHash && !ws.authenticated) {
          ws.send(JSON.stringify({ type: 'error', error: 'Unauthorized' }));
          return;
        }
        
        db.data.content = data.content;
        
        // Broadcast to all OTHER clients (exclude sender)
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'content', content: db.data.content }));
          }
        });
      }
    } catch (e) {
      console.error('WebSocket error:', e);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`📝 paste running on http://localhost:${PORT}`);
  console.log(`📁 Data stored in ${path.resolve(DATA_DIR)}`);
  if (db.data.passwordHash) {
    console.log(`🔒 Password required`);
  } else {
    console.log(`⚠️  No password set - first visitor will set password`);
  }
});

