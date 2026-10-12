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

async function getRenderer(v) {
  if (v === '3d') {
    if (!views['3d']) {
      for (const src of ['/vendor/three.min.js', '/vendor/three-spritetext.min.js', '/vendor/3d-force-graph.min.js']) await new Promise((ok, ng) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ng; document.head.appendChild(s); });
      const { createGraph3D } = await import('./graph3d.js');
      views['3d'] = createGraph3D({ model, ui, container: containers['3d'] });
    }
    return views['3d'];
  }
  if (!views.map) { views.map = createGraph2D({ model, ui, container: containers.map }); views.lanes = views.map; fed.lanes = fed.map; }
  return views[v];
}
async function switchView(v) {
  const r = await getRenderer(v);
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
document.getElementById('view').addEventListener('change', e => switchView(e.target.value));
document.getElementById('play').addEventListener('click', e => { paused = !paused; e.target.textContent = paused ? '再生' : '一時停止'; if (!paused) { const q = buffer.splice(0); bufferedEl.textContent = ''; q.forEach(handle); } });
const initialView = new URLSearchParams(location.search).get('view'); if (initialView && initialView in views) { view = initialView; document.getElementById('view').value = view; }
switchView(view);
