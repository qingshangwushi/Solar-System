#!/usr/bin/env node

/**
 * 离线静态服务器（任务 P0-21）。
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '../apps/web/dist');

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'font/eot',
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

function handleRangeRequest(req: http.IncomingMessage, fileSize: number): { start: number; end: number; valid: boolean } {
  const range = req.headers.range;
  if (!range) {
    return { start: 0, end: fileSize - 1, valid: false };
  }

  const match = range.match(/bytes=(\d+)-(\d*)/);
  if (!match) {
    return { start: 0, end: fileSize - 1, valid: false };
  }

  const start = parseInt(match[1] || '0', 10);
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

  if (start >= fileSize || end >= fileSize || start > end) {
    return { start: 0, end: fileSize - 1, valid: false };
  }

  return { start, end, valid: true };
}

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url || '/index.html';
  filePath = path.join(STATIC_DIR, filePath);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        filePath = path.join(STATIC_DIR, '/index.html');
        fs.stat(filePath, (fallbackErr, fallbackStats) => {
          if (fallbackErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
          }
          serveFile(filePath, fallbackStats, req, res);
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
      return;
    }

    serveFile(filePath, stats, req, res);
  });
});

function serveFile(filePath: string, stats: fs.Stats, req: http.IncomingMessage, res: http.ServerResponse) {
  const fileSize = stats.size;
  const { start, end, valid } = handleRangeRequest(req, fileSize);

  const headers: Record<string, string> = {
    'Content-Type': getMimeType(filePath),
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
  };

  if (valid) {
    const chunkSize = end - start + 1;
    headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
    headers['Content-Length'] = chunkSize.toString();
    res.writeHead(206, headers);

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    headers['Content-Length'] = fileSize.toString();
    res.writeHead(200, headers);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
}

server.listen(parseInt(PORT as string, 10), HOST, () => {
  console.log(`Static server running at http://${HOST}:${PORT}`);
  console.log(`Serving files from: ${STATIC_DIR}`);
  console.log('Press Ctrl+C to stop');
});
