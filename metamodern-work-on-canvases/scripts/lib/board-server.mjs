// A minimal board server for the package's checks (tests and the compatibility check). It serves
// /<canvas>/project/<path> through board-resolve.mjs on 127.0.0.1 only, and /_harness, a page that
// embeds one board in an iframe and records the board's messages. The viewer (MM-02) is separate.
//
// A board's kit choice comes from its own URL (?canvas-kit=pinned|live:<name>); requests the board
// makes carry it through their Referer. Without one, the board's ws.kit in canvas.json applies.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { boardKit } from '../canvas-format.mjs';
import { resolveBoardRequest } from '../board-resolve.mjs';

export const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ts': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

const HARNESS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Board harness</title>
<style>html,body{margin:0}iframe{border:0;display:block}</style></head><body>
<script>
window.__messages = [];
var q = new URLSearchParams(location.search);
var frame = document.createElement('iframe');
frame.width = q.get('w') || '1280'; frame.height = q.get('h') || '800';
frame.src = q.get('board');
window.addEventListener('message', function (e) {
  if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
  window.__messages.push(e.data);
});
window.send = function (message) { frame.contentWindow.postMessage(message, location.origin); };
document.body.appendChild(frame);
</script></body></html>`;

function readCanvasJson(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8')); } catch { return null; }
}

/**
 * @param {{projectRoot: string, config: object, canvases: Record<string, string>, liveKits?: Record<string, string>}} options
 *   canvases maps a canvas id to its project/ folder.
 */
export function startBoardServer({ projectRoot, config, canvases, liveKits = {}, port = 0 }) {
  const server = http.createServer((req, res) => {
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    };
    let url;
    try { url = new URL(req.url ?? '/', 'http://127.0.0.1'); } catch { return send(400, 'Bad request'); }
    if (url.pathname === '/_harness') return send(200, HARNESS, TYPES['.html']);
    const parts = url.pathname.split('/');
    const canvasId = parts[1] ? decodeURIComponent(parts[1]) : '';
    if (parts[2] !== 'project' || !canvases[canvasId]) return send(404, 'Not found');
    const requestPath = parts.slice(3).join('/');
    const projectDir = canvases[canvasId];
    let choice = url.searchParams.get('canvas-kit');
    let boardFile = requestPath.endsWith('.dc.html') ? decodeURIComponent(requestPath) : null;
    if (!choice && req.headers.referer) {
      try {
        const ref = new URL(req.headers.referer);
        choice = ref.searchParams.get('canvas-kit');
        if (!boardFile) boardFile = decodeURIComponent(ref.pathname.split('/').pop() ?? '');
      } catch { /* no referer kit */ }
    }
    const kit = boardKit(readCanvasJson(projectDir), boardFile, choice ?? undefined);
    const result = resolveBoardRequest({ projectRoot, config, canvasProjectDir: projectDir, requestPath, kit, liveKits });
    if (result.kind === 'error') return send(result.status, result.message);
    if (result.kind === 'json') return send(200, JSON.stringify(result.body), TYPES['.json']);
    if (result.kind === 'empty') return send(204, '');
    fs.stat(result.file, (error, stat) => {
      if (error || !stat.isFile()) return send(404, 'Not found');
      res.writeHead(200, { 'content-type': TYPES[path.extname(result.file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(result.file).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${actual}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
