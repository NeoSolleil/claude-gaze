import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { addOurs, removeOurs, snippet } from '../scripts/install-hooks.mjs';

test('snippet: 8 イベント、ポートが command に入る', () => {
  const s = snippet(4821);
  assert.equal(Object.keys(s.hooks).length, 8);
  assert.match(s.hooks.PostToolUse[0].hooks[0].command, /127\.0\.0\.1:4821\/hook/);
});

test('add/remove: 他人の hooks を壊さず、自分の分だけ出し入れする', () => {
  const other = { type: 'command', command: 'echo other' };
  const settings = { model: 'x', hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [other] }] } };
  addOurs(settings, 4820);
  assert.equal(settings.hooks.PostToolUse.length, 2);
  assert.equal(settings.hooks.Stop.length, 1);
  assert.equal(removeOurs(settings), 8);
  assert.deepEqual(settings, { model: 'x', hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [other] }] } });
  assert.equal(removeOurs(settings), 0);
});

test('CLI: HOME 配下の settings.json に書き、.bak を残し、--remove で元に戻す', () => {
  const home = mkdtempSync(join(tmpdir(), 'gaze-home-'));
  mkdirSync(join(home, '.claude'));
  const file = join(home, '.claude', 'settings.json');
  writeFileSync(file, JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }));
  const run = (...a) => execFileSync(process.execPath, ['scripts/install-hooks.mjs', ...a], { env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: 'utf8' });
  run('--port', '4999');
  const after = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(after.permissions, { allow: ['Bash(ls)'] });
  assert.match(after.hooks.SessionStart[0].hooks[0].command, /:4999\/hook/);
  assert.ok(existsSync(file + '.bak'));
  run();   // 2 回目は置き換え（増えない）
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).hooks.PostToolUse.length, 1);
  run('--remove');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { permissions: { allow: ['Bash(ls)'] } });
});
