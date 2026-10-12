import type { ServerResponse } from 'node:http';

const subscribers = new Map<string, Set<ServerResponse>>();   // キー: session_id または '*'

export function subscribe(key: string, res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    'access-control-allow-origin': '*',
  });
  res.write(': connected\n\n');
  let set = subscribers.get(key);
  if (!set) { set = new Set(); subscribers.set(key, set); }
  set.add(res);
  const ping = setInterval(() => { res.write(': ping\n\n'); }, 15000);
  res.on('close', () => { clearInterval(ping); set!.delete(res); });
}

export function send(res: ServerResponse, type: string, data: unknown): void {
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function broadcast(key: string, type: string, data: unknown): void {
  for (const k of [key, '*']) {
    const set = subscribers.get(k);
    if (!set) continue;
    for (const res of set) send(res, type, data);
  }
}
