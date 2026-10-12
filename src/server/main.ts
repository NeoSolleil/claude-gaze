import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHookEvent } from './hooks.ts';
import { eventsOf, record, summaries } from './store.ts';
import { broadcast, send, subscribe } from './sse.ts';

const PORT = Number(process.env.GAZE_PORT ?? 4820);
const HOST = '127.0.0.1';
const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
// パッケージの exports 制限に左右されないよう、node_modules 内のパスを直接組み立てる
const NM = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules');
const VENDOR: Record<string, string> = {
  'cytoscape.min.js': join(NM, 'cytoscape/dist/cytoscape.min.js'),
  'three.min.js': join(NM, 'three/build/three.min.js'),
  'three-spritetext.min.js': join(NM, 'three-spritetext/dist/three-spritetext.min.js'),
  '3d-force-graph.min.js': join(NM, '3d-force-graph/dist/3d-force-graph.min.js'),
};
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit = 2_000_000): Promise<string> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > limit) throw new Error('body too large'); chunks.push(c as Buffer); }
  return Buffer.concat(chunks).toString('utf8');
}

async function serveStatic(res: ServerResponse, path: string): Promise<void> {
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  try {
    if (req.method === 'POST' && url.pathname === '/hook') {
      let raw: unknown;
      try { raw = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'invalid json' }); }
      const ev = parseHookEvent(raw);
      if (!ev) return json(res, 422, { error: 'not a supported hook event' });
      const stored = record(ev);
      broadcast(ev.session_id, 'hook', stored);
      broadcast('*', 'sessions', summaries());
      return json(res, 202, { ok: true, seq: stored.gaze.seq });
    }
    if (req.method === 'GET' && url.pathname === '/sessions') return json(res, 200, summaries());
    if (req.method === 'GET' && url.pathname === '/snapshot') return json(res, 200, eventsOf(url.searchParams.get('session') ?? ''));
    if (req.method === 'GET' && url.pathname === '/events') {
      const sid = url.searchParams.get('session');
      subscribe(sid ?? '*', res);
      if (sid) { send(res, 'snapshot', eventsOf(sid)); } else { send(res, 'sessions', summaries()); }
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/vendor/')) { const f = VENDOR[url.pathname.slice(8)]; if (f) return serveStatic(res, f); res.writeHead(404); return res.end(); }
    if (req.method === 'GET') {
      const rel = url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
      const path = join(WEB_DIR, rel);
      if (!path.startsWith(WEB_DIR)) { res.writeHead(403); return res.end(); }
      return serveStatic(res, path);
    }
    res.writeHead(405); res.end();
  } catch (err) {
    json(res, 500, { error: String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`claude-gaze: http://${HOST}:${PORT}/  (POST /hook, GET /events?session=<id>, GET /sessions)`);
});
