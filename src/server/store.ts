import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { isPostToolUse, type HookEvent, type StoredEvent } from './hooks.ts';

const MAX_EVENTS_PER_SESSION = 5000;

export interface SessionSummary {
  id: string;
  cwd: string;
  started_at: number;
  last_at: number;
  events: number;
  agents: string[];
  ended: boolean;
}

interface Session {
  id: string;
  cwd: string;
  startedAt: number;
  lastAt: number;
  seq: number;
  ended: boolean;
  agents: Set<string>;
  events: StoredEvent[];
}

const sessions = new Map<string, Session>();

/** Bash コマンドの語のうち、cwd 基準で実在する通常ファイルを拾う（推定。取りこぼし前提） */
export function guessFiles(command: string, cwd: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tok of command.split(/[\s|&;()<>'"`]+/)) {
    if (!tok || tok.startsWith('-') || tok.length > 300 || seen.has(tok)) continue;
    if (!/[\/.]/.test(tok)) continue;             // パスらしさの最低条件: '/' か '.' を含む
    seen.add(tok);
    const abs = resolve(cwd, tok);
    try { if (existsSync(abs) && statSync(abs).isFile()) out.push(abs); } catch { /* 権限等は無視 */ }
    if (out.length >= 20) break;
  }
  return out;
}

export function record(e: HookEvent): StoredEvent {
  let s = sessions.get(e.session_id);
  const now = Date.now();
  if (!s) {
    s = { id: e.session_id, cwd: e.cwd ?? '', startedAt: now, lastAt: now, seq: 0, ended: false, agents: new Set(), events: [] };
    sessions.set(s.id, s);
  }
  if (!s.cwd && e.cwd) s.cwd = e.cwd;
  s.lastAt = now;
  // 終了イベントだけでは主体に数えない（進捗要約の内部エージェント対策。src/web/events.js の reduce と同じ判定）
  if (e.agent_id && e.hook_event_name !== 'SubagentStop' && e.hook_event_name !== 'Stop') s.agents.add(e.agent_id);
  if (e.hook_event_name === 'SessionEnd') s.ended = true;
  if (e.hook_event_name === 'SessionStart') s.ended = false;

  const stored: StoredEvent = { ...e, gaze: { received_at: now, seq: ++s.seq } };
  if (isPostToolUse(e) && e.tool_name === 'Bash' && typeof e.tool_input.command === 'string') {
    stored.gaze.files = guessFiles(e.tool_input.command, e.cwd ?? s.cwd ?? process.cwd());
  }
  s.events.push(stored);
  if (s.events.length > MAX_EVENTS_PER_SESSION) s.events.splice(0, s.events.length - MAX_EVENTS_PER_SESSION);
  return stored;
}

export function eventsOf(sessionId: string): StoredEvent[] {
  return sessions.get(sessionId)?.events ?? [];
}

export function summaries(): SessionSummary[] {
  return [...sessions.values()]
    .sort((a, b) => b.lastAt - a.lastAt)
    .map(s => ({ id: s.id, cwd: s.cwd, started_at: s.startedAt, last_at: s.lastAt, events: s.events.length, agents: [...s.agents], ended: s.ended }));
}
