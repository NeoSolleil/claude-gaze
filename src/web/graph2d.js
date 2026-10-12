// 2D 描画（Cytoscape）。mode = 'map'（1 枚地図、対象は 1 ノード）/ 'lanes'（主体ごとの帯）。
import { colors, esc } from './model.js';

const ROW = 24, HEAD = 18, PAD = 10, GAP = 26, COL_X = 300, AG_GAP = 105, LANE_HEAD = 30, LANE_GAP = 56, ANCHOR_X = 560;

export function createGraph2D({ model, ui, container }) {
  const C = colors();
  const pie = {}; for (let i = 1; i <= 6; i++) { pie['pie-' + i + '-background-color'] = 'data(c' + i + ')'; pie['pie-' + i + '-background-size'] = 'data(s' + i + ')'; }
  const cy = cytoscape({
    container, wheelSensitivity: 0.2, boxSelectionEnabled: false, maxZoom: 1.6, minZoom: 0.1,
    style: [
      { selector: 'node', style: { 'label': 'data(label)', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 10, 'color': C.fg, 'text-valign': 'center', 'text-halign': 'right', 'text-margin-x': 6, 'background-color': 'data(color)', 'width': 13, 'height': 13, 'border-width': 0, 'border-color': C.hot } },
      { selector: 'node[side="left"]', style: { 'text-halign': 'left', 'text-margin-x': -6 } },
      { selector: 'node[res]', style: Object.assign({ 'pie-size': '100%', 'border-width': 1.5, 'border-color': 'data(color)' }, pie) },
      { selector: 'node[kind="agent"]', style: { 'shape': 'round-hexagon', 'width': 30, 'height': 30, 'background-color': 'data(acolor)', 'font-family': 'IBM Plex Sans JP, sans-serif', 'font-size': 11, 'font-weight': 500, 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-x': 0, 'text-margin-y': 5, 'text-wrap': 'wrap', 'text-max-width': 260, 'text-justification': 'center' } },
      { selector: 'node[kind="agent"][main]', style: { 'width': 40, 'height': 40 } },
      { selector: 'node[kind="query"]', style: { 'shape': 'diamond', 'width': 16, 'height': 16 } },
      { selector: 'node[kind="mcp"]', style: { 'shape': 'round-rectangle', 'width': 14, 'height': 14 } },
      { selector: 'node[kind="cmd"]', style: { 'shape': 'round-tag', 'width': 14, 'height': 12 } },
      { selector: 'node[kind="result"]', style: { 'width': 9, 'height': 9, 'font-size': 9, 'pie-size': '0%', 'background-color': C.query, 'background-opacity': 0.35, 'border-width': 1.5, 'border-color': C.query } },
      { selector: 'node[kind="group"]', style: { 'shape': 'round-rectangle', 'background-color': C.group, 'background-opacity': 0.55, 'border-width': 1, 'border-color': C.line, 'padding': '10px', 'text-valign': 'top', 'text-halign': 'center', 'text-margin-x': 0, 'text-margin-y': -3, 'font-size': 10, 'color': C.muted, 'font-weight': 500 } },
      { selector: 'node[kind="group"][dir]', style: { 'text-halign': 'left' } },
      { selector: 'node[kind="group"].folded', style: { 'width': 26, 'height': 16, 'background-opacity': 0.9, 'border-style': 'double', 'border-width': 3 } },
      { selector: 'node[kind="lane"]', style: { 'shape': 'round-rectangle', 'background-color': C.group, 'background-opacity': 0.18, 'border-width': 1, 'border-color': 'data(acolor)', 'padding': '18px', 'text-valign': 'top', 'text-halign': 'center', 'text-margin-x': 0, 'text-margin-y': -6, 'font-family': 'IBM Plex Sans JP, sans-serif', 'font-size': 12, 'font-weight': 600, 'color': 'data(acolor)' } },
      { selector: 'node[kind="anchor"]', style: { 'width': 1, 'height': 1, 'opacity': 0, 'label': '', 'events': 'no' } },
      { selector: 'node.ended', style: { 'background-opacity': 0.35, 'border-width': 1, 'border-color': 'data(acolor)', 'border-style': 'dashed' } },
      { selector: 'node[kind="lane"].ended', style: { 'border-style': 'dashed' } },
      { selector: 'node.hidden, edge.hidden', style: { 'display': 'none' } },
      { selector: 'edge', style: { 'width': 1.2, 'line-color': 'data(color)', 'curve-style': 'taxi', 'taxi-direction': 'horizontal', 'taxi-turn': '50%', 'taxi-turn-min-distance': 24, 'target-arrow-shape': 'none' } },
      { selector: 'edge[guess = 1]', style: { 'line-style': 'dashed', 'line-dash-pattern': [4, 3] } },
      { selector: 'edge[failed = 1]', style: { 'line-style': 'dotted', 'line-color': C.muted } },
      { selector: 'edge.dim', style: { 'line-color': C.muted, 'width': 0.8, 'line-style': 'solid' } },
      { selector: 'node[res].dim', style: { 'pie-size': '0%', 'background-color': C.muted, 'background-opacity': 0.5 } },
      { selector: 'node[kind="agent"].dim', style: { 'background-color': C.muted } },
      { selector: 'node.now', style: { 'border-width': 4, 'border-color': 'data(nowColor)', 'width': 20, 'height': 20, 'z-index': 98 } },
      { selector: 'edge.now', style: { 'width': 3.2, 'z-index': 98 } },
      { selector: 'node[kind="agent"].now', style: { 'width': 44, 'height': 44 } },
      { selector: '.pulse', style: { 'border-width': 5, 'border-color': C.hot, 'width': 3.2, 'z-index': 99 } },
      { selector: 'node.pulse', style: { 'width': 22, 'height': 22 } },
      { selector: 'node.twin', style: { 'border-width': 4, 'border-color': C.query, 'width': 18, 'height': 18 } },
      { selector: 'node:selected', style: { 'border-width': 3, 'border-color': C.hot } },
    ],
    layout: { name: 'preset' },
  });
  new ResizeObserver(() => cy.resize()).observe(container);

  let mode = 'map'; const cols = { left: [], right: [] }; const lanes = {};   // lanes: agentId -> { left:[], right:[] }
  let filters = ui.filters(); let tabSel = 'all'; let lastUserAt = -1e9; let followTimer = null;
  cy.on('tap dragfree', () => { lastUserAt = performance.now(); });
  cy.on('zoom pan', e => { if (e.originalEvent) lastUserAt = performance.now(); });
  const laneId = (a) => 'lane|' + a;
  const nk = (a, res) => (mode === 'lanes' ? a + '|' + res : res);
  const gk = (a, gid) => (mode === 'lanes' ? a + '|' + gid : gid);
  const colsOf = (a) => (mode === 'lanes' ? lanes[a] : cols);

  // ---- 配置（決定的）----
  function relayout(animate) {
    const pos = {};
    const rows = (id) => { const g = cy.getElementById(id); return g.hasClass('folded') ? 1 : Math.max(1, g.data('members').length); };
    const colH = (ids) => ids.reduce((h, id) => h + HEAD + PAD * 2 + rows(id) * ROW + GAP, 0) - (ids.length ? GAP : 0);
    const stack = (ids, x, side, y0) => { let y = y0; ids.forEach(id => { const g = cy.getElementById(id); const m = g.data('members'); y += HEAD + PAD; if (m.length === 0 || g.hasClass('folded')) pos[id] = { x, y: y + ROW / 2 }; else m.forEach((mid, i) => { pos[mid] = { x, y: y + i * ROW + ROW / 2 }; cy.getElementById(mid).data('side', side); }); y += rows(id) * ROW + PAD + GAP; }); };
    if (mode === 'map') {
      const hL = colH(cols.left), hR = colH(cols.right);
      stack(cols.left, -COL_X, 'left', -hL / 2); stack(cols.right, COL_X, 'right', -hR / 2);
      const ah = (model.order.length - 1) * AG_GAP; model.order.forEach((id, i) => { pos[id] = { x: 0, y: -ah / 2 + i * AG_GAP }; });
    } else {
      let yTop = 0;
      model.order.forEach(a => {
        const L = lanes[a]; if (!L) return; const hL = colH(L.left), hR = colH(L.right); const h = Math.max(hL, hR, 110); const y0 = yTop + LANE_HEAD;
        stack(L.left, -COL_X, 'left', y0 + (h - hL) / 2); stack(L.right, COL_X, 'right', y0 + (h - hR) / 2);
        pos[a] = { x: 0, y: y0 + h / 2 - 8 }; pos['anchorL|' + a] = { x: -ANCHOR_X, y: y0 + h / 2 }; pos['anchorR|' + a] = { x: ANCHOR_X, y: y0 + h / 2 };
        yTop += LANE_HEAD + h + LANE_GAP;
      });
    }
    // 空だった枠に子が入ると、枠に残っていた古い移動アニメが子を引きずる。配置前に全ノードのアニメを止める
    cy.batch(() => { cy.nodes().stop(true); for (const id in pos) { const n = cy.getElementById(id); if (n.empty()) continue; if (n.hasClass('folded') && n.children().length) continue; if (animate) n.animate({ position: pos[id] }, { duration: 260, easing: 'ease-out' }); else n.position(pos[id]); } });
  }
  function ensureGroup(a, g) {
    const id = gk(a, g.gid); let n = cy.getElementById(id);
    if (n.empty()) {
      const data = { id, kind: 'group', label: g.label, base: g.label, color: C.group, dir: g.dir, col: g.col, lane: a, count: 0, full: g.label, members: [] };
      if (mode === 'lanes') data.parent = laneId(a);
      n = cy.add({ group: 'nodes', data }); colsOf(a)[g.col].push(id);
    }
    return n;
  }
  function laneLabel(a) { const A = model.agents[a]; return (A.main ? 'main' : A.type) + (A.ended ? '  (done)' : ''); }
  function sameRes(res) { return cy.nodes().filter(n => n.data('res') === res); }
  function agentsOf(n) { return [...new Set(n.connectedEdges('[kind="access"]').map(e => e.source().id()))]; }
  function paint(n) {
    const ags = mode === 'map' ? agentsOf(n) : [...new Set(sameRes(n.data('res')).flatMap(agentsOf))];
    const own = mode === 'map' ? ags : agentsOf(n);
    for (let i = 1; i <= 6; i++) { const a = own[i - 1]; n.data('c' + i, a ? model.agents[a].color : C.muted); n.data('s' + i, a ? 100 / own.length : 0); }
    const cmds = n.data('cmds') || [];
    n.data('label', n.data('base') + (cmds.length ? '  (' + cmds.join(', ') + ')' : '') + (ags.length > 1 ? '  ◈' + ags.length : ''));
  }
  function groupLabel(g) { const n = g.data('members').length; g.data('label', g.data('base') + (g.hasClass('folded') ? '  (' + n + ')' : '')); }

  // ---- ops ----
  const H = {
    agent({ id, type, main }) {
      if (cy.getElementById(id).nonempty()) return;
      const A = model.addAgent(id, type, main);
      if (mode === 'lanes') {
        lanes[id] = { left: [], right: [] };
        cy.add({ group: 'nodes', data: { id: laneId(id), kind: 'lane', label: laneLabel(id), color: C.group, acolor: A.color } });
        cy.add([{ group: 'nodes', data: { id: 'anchorL|' + id, kind: 'anchor', label: '', color: C.group, parent: laneId(id) }, position: { x: -ANCHOR_X, y: 0 } }, { group: 'nodes', data: { id: 'anchorR|' + id, kind: 'anchor', label: '', color: C.group, parent: laneId(id) }, position: { x: ANCHOR_X, y: 0 } }]);
      }
      const data = { id, kind: 'agent', label: main ? 'main' : type, base: main ? 'main' : type, color: A.color, acolor: A.color, main: main ? 1 : 0, count: 0, full: (main ? 'main' : type) + ' (' + id + ')' };
      if (mode === 'lanes') data.parent = laneId(id);
      cy.add({ group: 'nodes', data, position: { x: 0, y: 0 } });
    },
    agentEnd({ id }) { model.agents[id].ended = true; cy.getElementById(id).addClass('ended'); if (mode === 'lanes') cy.getElementById(laneId(id)).addClass('ended').data('label', laneLabel(id)); },
    touch(t) {
      const a = t.agent, id = nk(a, t.res); let n = cy.getElementById(id);
      if (n.empty()) {
        const g = ensureGroup(a, t.group);
        const data = { id, res: t.res, lane: a, kind: t.kind, label: t.label, base: t.label, color: C[t.kind], count: 0, full: t.full, results: t.results || null, expanded: 0, parent: g.id(), side: 'right', cmds: [] };
        for (let i = 1; i <= 6; i++) { data['c' + i] = C.muted; data['s' + i] = 0; }
        n = cy.add({ group: 'nodes', data, position: { x: g.position('x'), y: g.position('y') } }); g.data('members').push(id); groupLabel(g);
        if (g.hasClass('folded')) n.addClass('hidden');
      }
      if (t.results && t.results.length) { n.data('results', t.results); n.data('base', t.label); }
      n.parent().data('count', n.parent().data('count') + 1); n.data('count', n.data('count') + 1);
      if (t.cmd && !n.data('cmds').includes(t.cmd)) n.data('cmds').push(t.cmd);
      const eid = 'e|' + a + '|' + id; let e = cy.getElementById(eid);
      if (e.empty()) e = cy.add({ group: 'edges', data: { id: eid, source: a, target: id, kind: 'access', color: model.agents[a].color, count: 0, guess: t.guess ? 1 : 0, failed: t.failed ? 1 : 0, tools: [] } });
      if (!t.failed) e.data('failed', 0);
      e.data('count', e.data('count') + 1); e.data('tools').push((t.tool || t.kind) + (t.failed ? ' (失敗)' : ''));
      cy.getElementById(a).data('count', cy.getElementById(a).data('count') + 1);
      sameRes(t.res).forEach(paint);
    },
    dir(d) {
      const g = ensureGroup(d.agent, { gid: d.gid, label: d.label, col: 'right', dir: 1 }); g.data('count', g.data('count') + 1);
      const eid = 'e|' + d.agent + '|' + g.id(); let e = cy.getElementById(eid);
      if (e.empty()) e = cy.add({ group: 'edges', data: { id: eid, source: d.agent, target: g.id(), kind: 'access', color: model.agents[d.agent].color, count: 0, guess: 0, failed: 0, tools: [] } });
      e.data('count', e.data('count') + 1); e.data('tools').push(d.tool + ' ' + d.pattern);
      cy.getElementById(d.agent).data('count', cy.getElementById(d.agent).data('count') + 1);
    },
    now({ agent: a, targets, text }) {
      cy.batch(() => {
        cy.elements('.now').filter(el => (el.isNode() ? (el.data('kind') === 'agent' ? el.id() === a : el.data('nowBy') === a) : el.source().id() === a)).removeClass('now');
        const ag = cy.getElementById(a); if (text) ag.addClass('now');
        targets.forEach(r => { const n = cy.getElementById(nk(a, r)); if (n.empty()) return; n.data('nowColor', model.agents[a].color); n.data('nowBy', a); n.addClass('now'); const e = cy.getElementById('e|' + a + '|' + n.id()); if (e.nonempty()) e.addClass('now'); });
        ag.data('label', ag.data('base') + (text ? '\n' + text : ''));
      });
    },
  };
  function applyOps(ops) {
    ops.forEach(o => H[o.op] && H[o.op](o));
    applyFilters(); applyFocus(); relayout(true);
    clearTimeout(followTimer); followTimer = setTimeout(followIfNeeded, 320);
  }
  function counts() { const c = {}; model.order.forEach(id => { c[id] = cy.getElementById(id).data('count') || 0; }); return c; }
  function reset() { cy.elements().remove(); cols.left = []; cols.right = []; for (const k in lanes) delete lanes[k]; }
  function fit() { relayout(false); cy.resize(); cy.stop(true); cy.fit(undefined, 30); }
  function setMode(m) { mode = m; }

  // ---- フィルタ・絞り込み・追従 ----
  function applyFilters() {
    const on = filters; const show = { file: on.file, url: on.url, query: on.query, mcp: on.mcp, cmd: on.cmd, result: on.url };
    cy.batch(() => {
      cy.nodes().forEach(n => { const k = n.data('kind'); if (k !== 'agent' && k !== 'group' && k !== 'lane' && k !== 'anchor') n.toggleClass('hidden', !show[k] || n.parent().hasClass('folded')); });
      cy.nodes('[kind="file"]').forEach(n => { if (show.file && !on.guess && n.connectedEdges('[kind="access"]').every(e => e.data('guess'))) n.addClass('hidden'); });
      cy.nodes('[kind="group"]').forEach(g => g.toggleClass('hidden', !g.hasClass('folded') && g.children().length > 0 && g.children().every(c => c.hasClass('hidden'))));
      cy.edges().forEach(e => { e.toggleClass('hidden', e.source().hasClass('hidden') || e.target().hasClass('hidden') || (e.data('guess') && !on.guess)); });
    });
  }
  function applyFocus() {
    cy.batch(() => {
      if (tabSel === 'all') { cy.elements().removeClass('dim'); return; }
      cy.edges().forEach(e => e.toggleClass('dim', e.source().id() !== tabSel));
      cy.nodes('[res]').forEach(n => n.toggleClass('dim', !n.connectedEdges('[kind="access"]').some(e => e.source().id() === tabSel)));
      cy.nodes('[kind="agent"]').forEach(n => n.toggleClass('dim', n.id() !== tabSel));
    });
  }
  function followIfNeeded() {
    if (!filters.follow || container.offsetParent === null) return;
    if (performance.now() - lastUserAt < 6000 || cy.elements('.pulse').nonempty()) return;
    cy.resize(); const bb = cy.elements().boundingBox(), ex = cy.extent();
    if (bb.x1 < ex.x1 || bb.x2 > ex.x2 || bb.y1 < ex.y1 || bb.y2 > ex.y2) { cy.stop(true); cy.animate({ fit: { eles: cy.elements(), padding: 30 } }, { duration: 300 }); }
  }
  function setFilters(f) { filters = f; applyFilters(); }
  function setFocus(t) { tabSel = t; applyFocus(); if (t !== 'all' && mode === 'lanes') cy.animate({ fit: { eles: cy.getElementById(laneId(t)), padding: 20 } }, { duration: 350 }); }

  // ---- 選択（時間で消えない。別クリックで移り、空白クリックで消える）----
  function clearFocus() { cy.elements().removeClass('pulse twin'); ui.clearFeedSel(); }
  cy.on('tap', e => { if (e.target === cy) { clearFocus(); ui.detail(''); } });
  function expandQuery(n) {
    if (n.data('expanded')) return; n.data('expanded', 1); const a = n.data('lane');
    (n.data('results') || []).forEach(u => {
      const res = 'url:' + u, id = nk(a, res); let m = cy.getElementById(id);
      if (m.empty()) { const host = u.replace(/^https?:\/\//, '').split('/')[0]; const g = ensureGroup(a, { gid: 'dom:' + host, label: host, col: 'left', dir: 0 }); const lab = u.replace(/^https?:\/\/[^/]+/, '') || '/'; const data = { id, res, lane: a, kind: 'result', label: lab, base: lab, color: C.result, count: 0, full: u, parent: g.id(), side: 'left', cmds: [] }; for (let i = 1; i <= 6; i++) { data['c' + i] = C.muted; data['s' + i] = 0; } m = cy.add({ group: 'nodes', data, position: { x: g.position('x'), y: g.position('y') } }); g.data('members').push(id); groupLabel(g); }
      m.addClass('twin');
    });
    n.data('label', n.data('full')); applyFilters(); relayout(true);
  }
  cy.on('tap', 'edge', e => {
    const ed = e.target; const d = ed.data(); if (d.kind !== 'access') return;
    clearFocus(); ed.addClass('pulse'); ed.target().addClass('pulse');
    const a = ed.source().id(); const tg = ed.target();
    ui.detail('<div class="kind">アクセス · <span style="color:' + model.agents[a].color + '">' + esc(model.agentLabel(a)) + '</span> → ' + esc(tg.data('base') || tg.data('label')) + (d.guess ? ' · 破線 = Bash からの推定' : '') + '</div><div class="row"><span>回数</span><b>' + d.count + '</b></div><ul class="list">' + d.tools.map(t => '<li><span></span><b>' + esc(t) + '</b></li>').join('') + '</ul>');
  });
  cy.on('tap', 'node', e => {
    const n = e.target; const d = n.data(); if (d.kind === 'anchor' || d.kind === 'lane') return;
    if (d.kind === 'query') expandQuery(n);
    if (d.kind === 'group' && d.members.length) { n.toggleClass('folded'); groupLabel(n); n.children().forEach(c => c.toggleClass('hidden', n.hasClass('folded'))); applyFilters(); relayout(true); }
    clearFocus(); n.addClass('pulse');
    const key = d.kind === 'agent' ? 'agent:' + n.id() : d.kind === 'group' ? (d.id.includes('|') ? d.id.split('|')[1] : d.id) : d.res;
    const hits = model.related(key); ui.focusFeed(hits);
    const same = d.res ? sameRes(d.res) : cy.collection(n); same.filter(x => x.id() !== n.id()).addClass('twin');
    const co = [...new Set(hits.flatMap(i => model.refs[i]).filter(r => r !== key && !r.startsWith('agent:')))];
    co.forEach(r => { const m = d.res ? cy.getElementById(nk(d.lane || 'main', r)) : cy.getElementById(gk(d.lane || 'main', r)); (m.nonempty() ? m : sameRes(r)).addClass('twin'); });
    const edges = same.connectedEdges('[kind="access"]');
    const seen = edges.map(ed => { const a = ed.source().id(); return '<span style="color:' + model.agents[a].color + '">' + esc(model.agentLabel(a)) + '</span> ×' + ed.data('count') + ' (' + esc([...new Set(ed.data('tools'))].join(', ')) + ')'; });
    const coLabel = co.map(r => { const m = sameRes(r)[0] || cy.getElementById(r); return m && m.nonempty() ? (m.data('base') || m.data('label')) : r; });
    const g = n.parent();
    ui.detail('<div class="kind">' + esc(d.kind === 'group' ? (d.dir ? 'ディレクトリ' : 'グループ') + (n.hasClass('folded') ? ' · 畳み中（クリックで展開）' : d.members.length ? ' · クリックで畳む' : '') : d.kind) + (d.kind === 'query' ? ' · クリックで結果を展開' : '') + '</div><div class="label">' + esc(d.full || d.label) + '</div>'
      + (g.nonempty() && g.data('kind') === 'group' ? '<div class="row"><span>場所</span><b>' + esc(g.data('base')) + '</b></div>' : '')
      + (d.kind === 'group' ? '<div class="row"><span>要素数</span><b>' + d.members.length + '</b></div>' : '')
      + '<div class="row"><span>アクセス回数</span><b>' + (d.count || 0) + '</b></div>'
      + (seen.length ? '<div class="row"><span>見た主体</span><b>' + seen.join(' / ') + '</b></div>' : '')
      + (coLabel.length ? '<div class="row"><span>' + (d.kind === 'cmd' ? '参照先（推定）' : '同時に触れた対象') + '</span><b>' + esc(coLabel.join(', ')) + '</b></div>' : '')
      + (hits.length ? '<div class="row" style="margin-top:6px"><span>関連イベント</span><b>' + hits.length + ' 件（右下で強調）</b></div><ul class="list">' + hits.slice(-8).map(ui.evLine).join('') + '</ul>' : ''));
  });
  function selectEvent(i) {
    clearFocus(); ui.markEvent(i);
    const ev = model.events[i]; const aid = ev.agent_id || 'main'; const agentNode = cy.getElementById(aid);
    const nodes = cy.collection(model.refs[i].filter(r => !r.startsWith('agent:')).map(r => { const n = cy.getElementById(nk(aid, r)); return n.nonempty() ? n : cy.getElementById(gk(aid, r)); }).filter(n => n.nonempty()));
    nodes.addClass('pulse'); nodes.connectedEdges().filter(e => e.source().id() === aid).addClass('pulse'); agentNode.addClass('pulse');
    cy.animate({ fit: { eles: nodes.union(agentNode), padding: 120 } }, { duration: 350 });
    const where = nodes.map(n => { const g = n.parent(); return (g.nonempty() && g.data('kind') === 'group' ? g.data('base') : '') + (n.data('base') || n.data('label')); });
    ui.detail('<div class="kind">イベント · ' + esc(ev.hook_event_name) + (ev.tool_name ? ' · ' + esc(ev.tool_name) : '') + ' · <span style="color:' + (model.agents[aid] ? model.agents[aid].color : 'inherit') + '">' + esc(model.agentLabel(aid)) + '</span></div>'
      + (where.length ? '<div class="row"><span>対象</span><b>' + esc(where.join(' / ')) + '</b></div>' : '')
      + '<pre>' + esc(JSON.stringify(ev, null, 2)) + '</pre>');
  }
  window.gaze = Object.assign(window.gaze || {}, { cy });
  function resize() { cy.resize(); }
  return { applyOps, reset, fit, resize, setMode, get mode() { return mode; }, setFilters, setFocus, selectEvent, counts, clearFocus };
}
