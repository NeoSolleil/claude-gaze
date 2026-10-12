#!/usr/bin/env node
// claude-gaze の Hooks を Claude Code の settings.json に書き足す／外す。
//
//   node scripts/install-hooks.mjs            ~/.claude/settings.json に追加（全プロジェクトで有効）
//   node scripts/install-hooks.mjs --project  ./.claude/settings.json に追加（このディレクトリだけ）
//   node scripts/install-hooks.mjs --remove   claude-gaze 由来の項目だけを外す
//   node scripts/install-hooks.mjs --port 4821  ポートを変える（サーバ側は GAZE_PORT=4821 npm start）
//   node scripts/install-hooks.mjs --print    追記する JSON を表示するだけ（手で写す人向け）
//   node scripts/install-hooks.mjs --dry-run  書き込まずに結果を表示
//
// 既存の hooks は触らない。claude-gaze の項目は command 中の「127.0.0.1:<port>/hook」で識別する。
// 書き込む前に settings.json.bak を残す。

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const EVENTS = ['PostToolUse', 'PostToolUseFailure', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit', 'Stop', 'SessionStart', 'SessionEnd'];
const OURS = /https?:\/\/127\.0\.0\.1:\d+\/hook\b/;

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const portArg = args[args.indexOf('--port') + 1];
const port = args.includes('--port') ? Number(portArg) : 4820;
if (!Number.isInteger(port) || port <= 0) { console.error('--port には整数を指定してください'); process.exit(2); }
if (has('--help') || has('-h')) { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }

const target = has('--project') ? join(process.cwd(), '.claude', 'settings.json') : join(homedir(), '.claude', 'settings.json');

export function hookEntry(p) {
  return {
    type: 'command', async: true, timeout: 2,
    command: `curl -s -m 1 -X POST http://127.0.0.1:${p}/hook -H 'content-type: application/json' --data-binary @- >/dev/null 2>&1 || true`,
  };
}
export function snippet(p) {
  const hooks = {};
  for (const ev of EVENTS) hooks[ev] = [{ hooks: [hookEntry(p)] }];
  return { hooks };
}
/** settings から claude-gaze 由来の項目を外す。外した数を返す */
export function removeOurs(settings) {
  let n = 0;
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== 'object') return 0;
  for (const ev of Object.keys(hooks)) {
    if (!Array.isArray(hooks[ev])) continue;
    hooks[ev] = hooks[ev].map(m => {
      if (!m || !Array.isArray(m.hooks)) return m;
      const kept = m.hooks.filter(h => !(h && typeof h.command === 'string' && OURS.test(h.command)));
      n += m.hooks.length - kept.length;
      return { ...m, hooks: kept };
    }).filter(m => !m || !Array.isArray(m.hooks) || m.hooks.length > 0);
    if (hooks[ev].length === 0) delete hooks[ev];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  return n;
}
export function addOurs(settings, p) {
  settings.hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};
  for (const ev of EVENTS) {
    if (!Array.isArray(settings.hooks[ev])) settings.hooks[ev] = [];
    settings.hooks[ev].push({ hooks: [hookEntry(p)] });
  }
}

function main() {
  if (has('--print')) { console.log(JSON.stringify(snippet(port), null, 2)); return; }

  let settings = {};
  if (existsSync(target)) {
    const raw = readFileSync(target, 'utf8');
    try { settings = raw.trim() ? JSON.parse(raw) : {}; }
    catch (e) { console.error(`${target} を JSON として読めません: ${e.message}\n手で直してから再実行してください。`); process.exit(1); }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) { console.error(`${target} の最上位がオブジェクトではありません`); process.exit(1); }
  }

  const removed = removeOurs(settings);
  if (!has('--remove')) addOurs(settings, port);
  const out = JSON.stringify(settings, null, 2) + '\n';

  if (has('--dry-run')) { console.log(`[dry-run] ${target}\n` + out); return; }
  mkdirSync(join(target, '..'), { recursive: true });
  if (existsSync(target)) copyFileSync(target, target + '.bak');
  writeFileSync(target, out);

  if (has('--remove')) console.log(`外しました: ${removed} 件  (${target})`);
  else console.log(`${removed ? '更新' : '追加'}しました: ${EVENTS.length} イベント → http://127.0.0.1:${port}/hook  (${target})\n既に開いている Claude Code のセッションには反映されません。新しく起動してください。`);
  if (existsSync(target + '.bak')) console.log(`元のファイル: ${target}.bak`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
