#!/usr/bin/env node
/**
 * Web UI server for Polymarket Screener
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';

const PORT = process.env.PORT || 3456;
const DATA_DIR = './data';
const PUBLIC_DIR = './public';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function loadJSON(filename) {
  const path = `${DATA_DIR}/${filename}`;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function serveStatic(res, filepath) {
  const fullPath = join(PUBLIC_DIR, filepath === '/' ? 'index.html' : filepath);
  
  if (!existsSync(fullPath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  
  const ext = extname(fullPath);
  const contentType = MIME_TYPES[ext] || 'text/plain';
  
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(readFileSync(fullPath));
}

function handleAPI(res, pathname) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    if (pathname === '/api/leaderboard') {
      const data = loadJSON('leaderboard.json');
      if (!data) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'No data. Run npm run fetch first.' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(data));
      
    } else if (pathname === '/api/traders') {
      const data = loadJSON('traders.json');
      res.writeHead(200);
      res.end(JSON.stringify(data || []));
      
    } else if (pathname === '/api/top-detailed') {
      const data = loadJSON('top-traders-detailed.json');
      res.writeHead(200);
      res.end(JSON.stringify(data || []));
      
    } else if (pathname === '/api/signals') {
      const data = loadJSON('signals.json');
      res.writeHead(200);
      res.end(JSON.stringify(data || []));
      
    } else if (pathname === '/api/whale-activity') {
      const data = loadJSON('whale-activity.json');
      res.writeHead(200);
      res.end(JSON.stringify(data || []));
      
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Unknown endpoint' }));
    }
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  
  if (pathname.startsWith('/api/')) {
    handleAPI(res, pathname);
  } else {
    serveStatic(res, pathname);
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Polymarket Screener running at http://localhost:${PORT}\n`);
});
