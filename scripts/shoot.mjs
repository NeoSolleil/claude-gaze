#!/usr/bin/env node
// README / 記事用のスクリーンショットと GIF を撮る。
//   node scripts/shoot.mjs --proj <架空プロジェクトの実在パス> [--out docs/images] [--url http://127.0.0.1:4820] [--chrome google-chrome]
// サーバが起動している前提。架空のセッションを 1 件ずつ投入しながら Chrome（DevTools プロトコル）で撮影し、
// 最後に各表示・各操作状態の静止画を撮る。GIF は ffmpeg があれば作る。追加の npm 依存はなし（Node 22 以上の WebSocket を使う）。

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PROJ = resolve(arg('--proj', '')); if (!arg('--proj')) { console.error('--proj <path> が必要です'); process.exit(2); }
const OUT = resolve(arg('--out', 'docs/images'));
const URL_ = arg('--url', 'http://127.0.0.1:4820');
const CHROME = arg('--chrome', 'google-chrome');
const PORT = 9333;
const SID = 'shot-' + Date.now().toString(36);
const FRAMES = join(tmpdir(), 'gaze-frames-' + process.pid);
mkdirSync(OUT, { recursive: true }); mkdirSync(FRAMES, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const post = (ev) => fetch(URL_ + '/hook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: SID, cwd: PROJ, ...ev }) });

// ---- 架空セッション（注文 API にレート制限を追加する作業） ----
const E1 = 'agent-' + SID + '-e1', W1 = 'agent-' + SID + '-w1';
const sub = (id, type) => ({ agent_id: id, agent_type: type });
const T = (n, tool, tool_input, extra = {}) => ({ hook_event_name: 'PostToolUse', tool_name: tool, tool_input, tool_use_id: 't' + n, ...extra });
const search = { query: 'express rate limit middleware', results: [{ tool_use_id: 'srv1', content: [
  { title: 'express-rate-limit', url: 'https://github.com/express-rate-limit/express-rate-limit' },
  { title: 'Express middleware', url: 'https://expressjs.com/en/resources/middleware.html' },
  { title: 'Rate limiting - MDN', url: 'https://developer.mozilla.org/en-US/docs/Glossary/Rate_limit' },
  { title: 'npm: rate-limiter-flexible', url: 'https://www.npmjs.com/package/rate-limiter-flexible' },
] }, 'Based on the results…'] };
const SCENARIO = [
  { hook_event_name: 'SessionStart' },
  { hook_event_name: 'UserPromptSubmit', prompt: '注文 API にレート制限を追加して。既存のミドルウェアの作法に合わせること' },
  T(1, 'Read', { file_path: PROJ + '/CLAUDE.md' }),
  T(2, 'Glob', { pattern: 'src/**/*.ts', path: PROJ }),
  T(3, 'Read', { file_path: PROJ + '/src/app.ts' }),
  { hook_event_name: 'SubagentStart', ...sub(E1, 'Explore') },
  { hook_event_name: 'SubagentStart', ...sub(W1, 'general-purpose') },
  T(4, 'Grep', { pattern: 'app\\.use\\(', path: PROJ + '/src' }, sub(E1, 'Explore')),
  T(5, 'WebSearch', { query: 'express rate limit middleware' }, { tool_response: search, ...sub(W1, 'general-purpose') }),
  T(6, 'Read', { file_path: PROJ + '/src/middleware/auth.ts' }, sub(E1, 'Explore')),
  T(7, 'Read', { file_path: PROJ + '/src/middleware/logger.ts' }, sub(E1, 'Explore')),
  T(8, 'WebFetch', { url: 'https://github.com/express-rate-limit/express-rate-limit', prompt: 'usage' }, sub(W1, 'general-purpose')),
  T(9, 'Read', { file_path: PROJ + '/src/routes/orders.ts' }, sub(E1, 'Explore')),
  T(10, 'Bash', { command: 'cat src/config.ts' }, sub(E1, 'Explore')),
  T(11, 'WebFetch', { url: 'https://expressjs.com/en/resources/middleware.html', prompt: 'list' }, sub(W1, 'general-purpose')),
  { hook_event_name: 'SubagentStop', ...sub(E1, 'Explore') },
  T(12, 'Read', { file_path: PROJ + '/src/routes/orders.ts' }),
  { hook_event_name: 'PostToolUseFailure', tool_name: 'Read', tool_input: { file_path: PROJ + '/docs/RATE_LIMITS.md' }, error: 'File does not exist.', tool_use_id: 't13' },
  T(14, 'Read', { file_path: PROJ + '/docs/api.md' }),
  { hook_event_name: 'SubagentStop', ...sub(W1, 'general-purpose') },
  T(15, 'Write', { file_path: PROJ + '/src/middleware/rateLimit.ts', content: '…' }),
  T(16, 'Edit', { file_path: PROJ + '/src/app.ts', old_string: 'a', new_string: 'b' }),
  T(17, 'mcp__github__search_issues', { q: 'rate limit 429 repo:shop/api' }, { mcp_server: { name: 'github' } }),
  T(18, 'Bash', { command: 'grep -n rateLimit src/app.ts src/routes/orders.ts' }),
  T(19, 'Write', { file_path: PROJ + '/tests/rateLimit.test.ts', content: '…' }),
  T(20, 'Bash', { command: 'npm test' }),
  T(21, 'Edit', { file_path: PROJ + '/README.md', old_string: 'a', new_string: 'b' }),
  T(22, 'Skill', { skill: 'commit' }),
  T(23, 'Bash', { command: 'git diff --stat' }),
  { hook_event_name: 'Stop' },
];

// ---- Chrome DevTools プロトコルの最小クライアント ----
const udd = join(tmpdir(), 'gaze-chrome-' + process.pid);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`, '--no-first-run', '--hide-scrollbars',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
let wsUrl = '';
for (let i = 0; i < 50 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(200); } }
if (!wsUrl) { console.error('Chrome に接続できません'); chrome.kill(); process.exit(1); }
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 1; const pending = new Map(); const listeners = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); } else if (d.method) listeners.forEach(fn => fn(d)); };
const cdp = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await cdp('Target.attachToTarget', { targetId, flatten: true });
await cdp('Page.enable', {}, S); await cdp('Runtime.enable', {}, S);
await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, S);
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${expr}; })().then(() => true)`, awaitPromise: true, returnByValue: true }, S); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '')); return r.result.value; };
const shot = async (file, scale = 1) => {
  if (scale !== 1) await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: scale, mobile: false }, S);
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' }, S);
  writeFileSync(file, Buffer.from(data, 'base64'));
  if (scale !== 1) await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, S);
};
const navigate = async (url) => { const loaded = new Promise(r => listeners.push(d => d.method === 'Page.loadEventFired' && r())); await cdp('Page.navigate', { url }, S); await loaded; await sleep(600); };

try {
  // 1) ライブ画面を開き、イベントを 1 件ずつ投入しながらフレームを撮る（GIF 用）
  await post(SCENARIO[0]); await sleep(300);
  await navigate(`${URL_}/#${SID.slice(0, 8)}`);
  await evalJs(`await new Promise(r => { const t = setInterval(() => { if (document.getElementById('status').textContent.includes('接続')) { clearInterval(t); r(); } }, 100); setTimeout(r, 4000); })`);
  let frame = 0;
  const pad = (n) => String(n).padStart(3, '0');
  await shot(join(FRAMES, `f${pad(frame++)}.png`));
  for (const ev of SCENARIO.slice(1)) { await post(ev); await sleep(900); await shot(join(FRAMES, `f${pad(frame++)}.png`)); }
  for (let i = 0; i < 3; i++) await shot(join(FRAMES, `f${pad(frame++)}.png`));   // 最後の状態を少し長く見せる
  console.log(`frames: ${frame}`);

  // 2) 静止画（各表示・各操作状態）
  // 操作後は全体が収まるように fit してから撮る（操作でズームが変わるため）
  const still = async (name, setup, fit = true) => { if (setup) { await evalJs(setup); await sleep(700); } if (fit) { await evalJs(`gaze.cy.stop(true); gaze.cy.fit(undefined, 24)`); await sleep(200); } await shot(join(OUT, name + '.png'), 2); console.log('still:', name); };
  const tapNode = (pred) => `(() => { const n = gaze.cy.nodes().filter(n => ${pred}); if (!n.length) throw new Error('node not found'); n[0].emit('tap'); })()`;
  await evalJs(`document.getElementById('f-follow').checked = true; gaze.cy.fit(undefined, 24)`); await sleep(500);
  await still('map');
  await still('select-node', tapNode(`n.data('res') === 'file:${PROJ}/src/routes/orders.ts'`));
  await still('select-event', `(() => { const rows = [...document.querySelectorAll('#feed .ev')]; const r = rows.find(x => x.textContent.includes('WebSearch')) || rows[5]; r.click(); })()`);
  await still('search-expand', tapNode(`n.data('kind') === 'query'`));
  await still('failed', tapNode(`n.data('res') === 'file:${PROJ}/docs/RATE_LIMITS.md'`));
  await still('collapse', `gaze.cy.emit('tap'); ` + tapNode(`n.data('kind') === 'group' && n.data('label') === 'shop-api/src/middleware/'`));
  await still('agent-tab', `gaze.cy.emit('tap'); document.querySelector('#tabs .tab[data-k="${E1}"]').click()`);
  await evalJs(`document.querySelector('#tabs .tab[data-k="all"]').click()`);
  await still('lanes', `const v = document.getElementById('view'); v.value = 'lanes'; v.dispatchEvent(new Event('change'))`);
  await evalJs(`const v = document.getElementById('view'); v.value = '3d'; v.dispatchEvent(new Event('change'))`); await sleep(4500);
  await evalJs(`gaze.g3d.zoomToFit(0, 10)`); await sleep(500);
  await still('3d', null, false);
  await evalJs(`const v = document.getElementById('view'); v.value = 'map'; v.dispatchEvent(new Event('change'))`);

  // 3) GIF
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1.2', '-i', join(FRAMES, 'f%03d.png'), '-vf', 'scale=1080:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5', '-loop', '0', join(OUT, 'live.gif')]);
    console.log('gif: live.gif');
  } catch (e) { console.error('ffmpeg が無いか失敗しました。フレームは', FRAMES, 'に残します:', e.message); }
} catch (e) {
  console.error('撮影に失敗:', e.message); process.exitCode = 1;
} finally {
  ws.close(); chrome.kill(); await sleep(800);
  if (existsSync(join(OUT, 'live.gif'))) rmSync(FRAMES, { recursive: true, force: true });
  try { rmSync(udd, { recursive: true, force: true }); } catch { /* Chrome の終了待ちで残ることがある */ }
}
