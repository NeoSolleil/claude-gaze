// 司令塔: サーバ（SSE）との接続、セッション一覧、一時停止、描画方式（2D 地図 / 主体別 / 3D）の切替
import { createState, reduce } from './events.js';
import { createModel, esc } from './model.js';
import { createUI } from './ui.js';
import { createGraph2D } from './graph2d.js';

const model = createModel(); const ui = createUI(model);
const STATIC = new URLSearchParams(location.search).get('static') === '1';
const statusEl = document.getElementById('status'), sessionsEl = document.getElementById('sessions'), bufferedEl = document.getElementById('buffered');
let state = createState(), current = null, es = null, paused = false; const buffer = [];
const views = { map: null, lanes: null, '3d': null }; let view = 'map'; let renderer = null; const fed = { map: 0, lanes: 0, '3d': 0 };
const containers = { map: document.getElementById('cy'), lanes: document.getElementById('cy'), '3d': document.getElementById('g3d') };

const viewEl = document.getElementById('view'), noticeEl = document.getElementById('notice');
const NOGL = '3D 表示に必要な WebGL が、このブラウザでは使えません。GPU のないリモートデスクトップ（xrdp など）で起こります。<br>2D 表示を使うか、GPU のある PC のブラウザで開いてください（WebGL の状態は <code>chrome://gpu</code> で確認できます）。';
/** 空文字で隠す。html は固定文言か esc 済みのものだけを渡す */
function notice(html) { noticeEl.hidden = !html; noticeEl.querySelector('span').innerHTML = html; }
noticeEl.querySelector('button').addEventListener('click', () => notice(''));
/** GPU のない環境では Chrome が WebGL を出さない（--enable-unsafe-swiftshader なしでは CPU 描画に落ちない。Chrome 147 で確認） */
function hasWebGL() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

async function getRenderer(v) {
  if (v === '3d') {
    if (!views['3d']) {
      if (!hasWebGL()) throw new Error('nogl');
      for (const src of ['/vendor/three.min.js', '/vendor/three-spritetext.min.js', '/vendor/3d-force-graph.min.js']) await new Promise((ok, ng) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ng(new Error(src + ' を読めません')); document.head.appendChild(s); });
      const { createGraph3D } = await import('./graph3d.js');
      views['3d'] = createGraph3D({ model, ui, container: containers['3d'] });
    }
    return views['3d'];
  }
  if (!views.map) { views.map = createGraph2D({ model, ui, container: containers.map }); views.lanes = views.map; fed.lanes = fed.map; }
  return views[v];
}
async function switchView(v) {
  let r;
  // 描けないときは元の表示に戻し、理由を出す（黙って真っ黒にしない）
  try { r = await getRenderer(v); } catch (e) { viewEl.value = view; notice(e.message === 'nogl' ? NOGL : '3D 表示を開けませんでした: ' + esc(e.message) + '<br>2D 表示を使ってください。'); return; }
  notice('');
  containers['3d'].hidden = v !== '3d'; containers.map.hidden = v === '3d';
  if (renderer && renderer !== r) renderer.clearFocus();
  if (v !== '3d' && r.mode !== v) { r.setMode(v); r.reset(); fed.map = 0; fed.lanes = 0; }
  view = v; renderer = r;
  const key = v === 'lanes' ? 'map' : v;   // map と lanes は同じ描画器
  for (let i = fed[key]; i < model.events.length; i++) r.applyOps(model.ops[i]);
  fed[key] = model.events.length; if (v === 'lanes') fed.lanes = fed.map;
  r.setFilters(ui.filters()); r.setFocus(ui.tab); ui.renderAgents(r.counts()); r.fit();
  document.getElementById('f-spin').closest('label').hidden = v !== '3d';
}

function handle(ev) {
  const ops = reduce(state, ev); const i = model.push(ev, ops);
  ops.forEach(o => { if (o.op === 'agent') model.addAgent(o.id, o.type, o.main); if (o.op === 'agentEnd') model.agents[o.id].ended = true; if (o.op === 'turn') document.getElementById('turn').innerHTML = '<b>turn ' + o.n + '</b><br>' + esc(o.prompt.length > 120 ? o.prompt.slice(0, 120) + '…' : o.prompt); if (o.op === 'feed') ui.feed(o, ev, i); });
  if (renderer) { renderer.applyOps(ops); const key = view === 'lanes' ? 'map' : view; fed[key] = model.events.length; ui.renderAgents(renderer.counts()); }
  if (ops.some(o => o.op === 'agent' || o.op === 'agentEnd')) ui.renderTabs();
  document.getElementById('clock').textContent = new Date(ev.gaze ? ev.gaze.received_at : Date.now()).toLocaleTimeString('ja-JP', { hour12: false });
}
function onHook(ev) { if (paused) { buffer.push(ev); bufferedEl.textContent = '+' + buffer.length + ' 件 保留'; } else handle(ev); }

function renderSessions(list) {
  if (!list.length) { sessionsEl.innerHTML = '<div class="empty">まだイベントが届いていません。<br>Hooks が有効な Claude Code でツールを使うと、ここにセッションが現れます。</div>'; return; }
  sessionsEl.innerHTML = list.map(s => {
    const name = (s.cwd || '').split('/').filter(Boolean).pop() || s.id.slice(0, 8);
    const t = new Date(s.started_at).toLocaleTimeString('ja-JP', { hour12: false, hour: '2-digit', minute: '2-digit' });
    return '<div class="session' + (s.id === current ? ' active' : '') + '" tabindex="0" data-id="' + s.id + '"><div class="name"><span class="' + (s.ended ? 'ended' : 'live') + '"></span>' + esc(name) + ' <span class="badge">' + esc(s.id.slice(0, 8)) + '</span></div><div class="meta">' + esc(s.cwd || s.id) + '</div><div class="meta">' + t + ' 開始 · <b>' + s.events + '</b> events · ' + (1 + s.agents.length) + ' agents</div></div>';
  }).join('');
  sessionsEl.querySelectorAll('.session').forEach(el => { el.addEventListener('click', () => select(el.dataset.id)); el.addEventListener('keydown', e => { if (e.key === 'Enter') el.click(); }); });
  if (!current && list.length) { const want = location.hash.replace(/^#/, ''); const hit = want ? list.find(s => s.id.startsWith(want)) : null; select((hit || list[0]).id); }
}
async function select(id) {
  if (id === current) return;
  current = id; history.replaceState(null, '', '#' + id.slice(0, 8));
  state = createState(); model.reset(); buffer.length = 0; bufferedEl.textContent = ''; ui.reset();
  for (const k in fed) fed[k] = 0; for (const k in views) if (views[k]) views[k].reset();
  sessionsEl.querySelectorAll('.session').forEach(el => el.classList.toggle('active', el.dataset.id === id));
  if (!renderer) await switchView(view);
  if (es) es.close();
  if (STATIC) { const evs = await (await fetch('/snapshot?session=' + encodeURIComponent(id))).json(); evs.forEach(handle); setTimeout(() => renderer.fit(), 350); statusEl.textContent = '静止表示 · ' + id.slice(0, 8); return; }
  es = new EventSource('/events?session=' + encodeURIComponent(id));
  es.addEventListener('snapshot', e => { JSON.parse(e.data).forEach(handle); setTimeout(() => renderer.fit(), 350); });
  es.addEventListener('hook', e => onHook(JSON.parse(e.data)));
  es.onopen = () => { statusEl.textContent = '接続中 · ' + id.slice(0, 8); statusEl.classList.add('on'); };
  es.onerror = () => { statusEl.textContent = 'サーバ未接続（再接続中）'; statusEl.classList.remove('on'); };
}

if (STATIC) fetch('/sessions').then(r => r.json()).then(renderSessions);
else {
  const list = new EventSource('/events');
  list.addEventListener('sessions', e => renderSessions(JSON.parse(e.data)));
  list.onopen = () => { if (!current) { statusEl.textContent = '接続中 · セッション待ち'; statusEl.classList.add('on'); } };
  list.onerror = () => { statusEl.textContent = 'サーバ未接続（再接続中）'; statusEl.classList.remove('on'); };
}
ui.on('event', i => renderer && renderer.selectEvent(i));
ui.on('tab', t => renderer && renderer.setFocus(t));
ui.on('filters', f => renderer && renderer.setFilters(f));
viewEl.addEventListener('change', e => switchView(e.target.value));
document.getElementById('play').addEventListener('click', e => { paused = !paused; e.target.textContent = paused ? '再生' : '一時停止'; if (!paused) { const q = buffer.splice(0); bufferedEl.textContent = ''; q.forEach(handle); } });
const initialView = new URLSearchParams(location.search).get('view'); if (initialView && initialView in views) { view = initialView; document.getElementById('view').value = view; }
switchView(view);

// ---- ペイン幅のドラッグ変更（左右の仕切り。幅は localStorage に残す。ダブルクリックで既定に戻す）----
(function () {
  const app = document.querySelector('.app'); const DEF = { left: 220, right: 320 };
  const store = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* 無効なら覚えないだけ */ } };
  const load = (k) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
  const apply = (side, w) => app.style.setProperty('--' + side + '-w', w + 'px');
  for (const side of ['left', 'right']) { const w = load('gaze.' + side + 'W'); if (w) apply(side, w); }
  document.querySelectorAll('.resizer').forEach(h => {
    const side = h.dataset.side; h.title = 'ドラッグで幅を変える。ダブルクリックで元に戻す';
    h.addEventListener('pointerdown', e => {
      e.preventDefault(); try { h.setPointerCapture(e.pointerId); } catch { /* 合成イベント */ }
      h.classList.add('on'); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
      const move = ev => { const raw = side === 'left' ? ev.clientX : window.innerWidth - ev.clientX; const w = Math.min(Math.floor(window.innerWidth * 0.6), Math.max(160, Math.round(raw))); apply(side, w); store('gaze.' + side + 'W', w); if (renderer) renderer.resize(); };
      const up = () => { h.removeEventListener('pointermove', move); h.classList.remove('on'); document.body.style.cursor = ''; document.body.style.userSelect = ''; if (renderer) renderer.resize(); };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up, { once: true }); h.addEventListener('pointercancel', up, { once: true });
    });
    h.addEventListener('dblclick', () => { apply(side, DEF[side]); store('gaze.' + side + 'W', ''); if (renderer) renderer.resize(); });
  });
  window.addEventListener('resize', () => { if (renderer) renderer.resize(); });
})();
