'use strict';

const express = require('express');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const API_URL = process.env.API_URL || 'http://localhost:8080';

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'todo-frontend' }));

app.get('/config.js', (req, res) => {
  res.type('application/javascript').send(
    `window.__API_URL__ = ${JSON.stringify(API_URL)};`,
  );
});

const fs = require('fs');
const indexHtml = fs
  .readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf-8')
  .replace('<script src="app.js"></script>', '<script src="/config.js"></script>\n  <script src="app.js"></script>');

app.get(['/', '/index.html'], (req, res) => {
  res.type('text/html').send(indexHtml);
});

app.use(express.static(PUBLIC_DIR));

app.listen(PORT, HOST, () => {
  console.log(`todo-frontend listening on http://${HOST}:${PORT}, API_URL=${API_URL}`);
});
