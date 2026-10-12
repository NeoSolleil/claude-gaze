// 3D 描画（3d-force-graph + three.js）。ops を受けて nodes/links を更新する。見せる用途のモード。
import { colors, esc } from './model.js';

const SIZE = { agent: 5, file: 2.2, url: 2.2, result: 1.6, query: 2.6, mcp: 1.9, cmd: 2.2, group: 1.3 };

export function createGraph3D({ model, ui, container }) {
  const C = colors();
  const nodes = [], links = [], byId = {}; let filters = ui.filters(); let tabSel = 'all'; let lastUserAt = -1e9;
  const G = ForceGraph3D({ controlType: 'orbit' })(container)
    .backgroundColor(C.bg).showNavInfo(false).enableNodeDrag(false)
    .nodeThreeObject(makeObj).nodeThreeObjectExtend(false)
    .nodeVisibility(n => !n.hidden).linkVisibility(l => !l.hidden)
    .nodeLabel(n => '<div style="font: 12px IBM Plex Mono, monospace; background: ' + C.bg + '; color: ' + C.fg + '; padding: 4px 6px; border: 1px solid ' + C.line + '; border-radius: 4px">' + esc(n.full || n.label) + '</div>')
    .linkColor(l => l.dim ? C.muted : (l.guess || l.failed ? C.muted : l.color))
    .linkOpacity(0.9)
    .linkWidth(l => l.kind === 'member' ? 0.25 : (l.hot ? 1.8 : 0.7))
    .linkDirectionalParticles(l => (l.hot && l.kind !== 'member' && !l.dim) ? 3 : 0)
    .linkDirectionalParticleWidth(1.8).linkDirectionalParticleSpeed(0.012).linkDirectionalParticleColor(l => l.color)
    .onNodeClick(onNodeClick)
    .onBackgroundClick(() => { clearFocus(); ui.detail(''); });
  G.d3Force('charge').strength(-70); G.d3Force('link').distance(l => l.kind === 'member' ? 10 : 30);
  G.width(container.clientWidth).height(container.clientHeight);
  new ResizeObserver(() => G.width(container.clientWidth).height(container.clientHeight)).observe(container);
  ['pointerdown', 'wheel'].forEach(t => container.addEventListener(t, () => { lastUserAt = performance.now(); }, { passive: true }));

  function geom(kind) {
    const s = SIZE[kind] || 2;
    if (kind === 'query') return new THREE.OctahedronGeometry(s);
    if (kind === 'mcp') return new THREE.BoxGeometry(s * 1.9, s * 1.9, s * 1.9);
    if (kind === 'cmd') return new THREE.ConeGeometry(s, s * 2, 12);
    if (kind === 'agent') return new THREE.IcosahedronGeometry(s, 1);
    return new THREE.SphereGeometry(s, 16, 12);
  }
  function makeObj(n) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: n.color, emissive: new THREE.Color(n.color), emissiveIntensity: 0, transparent: true, opacity: n.kind === 'group' ? 0.5 : 1 });
    const mesh = new THREE.Mesh(geom(n.kind), mat); grp.add(mesh);
    const label = new SpriteText(n.label, n.kind === 'agent' ? 4.5 : n.kind === 'group' ? 2.8 : 3.4, n.kind === 'group' ? C.muted : C.fg);
    label.fontFace = 'IBM Plex Mono, monospace'; label.fontWeight = n.kind === 'agent' ? '600' : '400';
    label.backgroundColor = C.bg + 'cc'; label.padding = 0.6; label.borderRadius = 1;
    label.position.set(0, (SIZE[n.kind] || 2) + 3.2, 0); label.raycast = () => {}; grp.add(label);
    n.__mesh = mesh; n.__label = label; return grp;
  }
  function push() { G.graphData({ nodes, links }); }
  function addNode(id, data, near) {
    const n = Object.assign({ id, hidden: false, dim: false, count: 0 }, data);
    if (near && near.x != null) { n.x = near.x + (Math.random() - .5) * 12; n.y = near.y + (Math.random() - .5) * 12; n.z = near.z + (Math.random() - .5) * 12; }
    nodes.push(n); byId[id] = n; return n;
  }
  function addLink(id, s, t, data) { const l = Object.assign({ id, source: s, target: t, hidden: false, dim: false, hot: false, count: 0, tools: [] }, data); links.push(l); byId[id] = l; return l; }
  const src = (l) => (l.source.id || l.source), tgt = (l) => (l.target.id || l.target);
  function ensureGroup(g, near) { return byId[g.gid] || addNode(g.gid, { kind: 'group', label: g.label, base: g.label, color: C.muted, full: g.label }, near); }
  function paint(n) {
    const ags = [...new Set(links.filter(l => l.kind === 'access' && tgt(l) === n.id).map(src))];
    n.agents = ags; n.color = ags.length ? model.agents[ags[0]].color : C.muted;
    const cmds = n.cmds || [];
    n.label = n.base + (cmds.length ? '  (' + cmds.join(', ') + ')' : '') + (ags.length > 1 ? '  ◈' + ags.length : ''); if (n.__label) n.__label.text = n.label;
  }
  const H = {
    agent({ id, type, main }) { if (byId[id]) return; const A = model.addAgent(id, type, main); addNode(id, { kind: 'agent', label: main ? 'main' : type, base: main ? 'main' : type, color: A.color, full: (main ? 'main' : type) + ' (' + id + ')' }, main ? { x: 0, y: 0, z: 0 } : byId['main']); if (!main) addLink('spawn|' + id, 'main', id, { kind: 'spawn', color: A.color }); },
    agentEnd({ id }) { model.agents[id].ended = true; if (byId[id]) byId[id].ended = true; },
    touch(t) {
      let n = byId[t.res];
      if (!n) { const g = ensureGroup(t.group, byId[t.agent]); n = addNode(t.res, { kind: t.kind, label: t.label, base: t.label, color: model.agents[t.agent].color, full: t.full, results: t.results || null, expanded: false, group: g.id }, byId[t.agent]); addLink('m|' + t.res, t.res, g.id, { kind: 'member', color: C.line }); }
      if (t.results && t.results.length) { n.results = t.results; n.base = t.label; }
      n.count += 1; const g = byId[n.group]; if (g) g.count += 1;
      if (t.cmd) { n.cmds = n.cmds || []; if (!n.cmds.includes(t.cmd)) n.cmds.push(t.cmd); }
      const eid = 'e|' + t.agent + '|' + t.res; let e = byId[eid]; if (!e) e = addLink(eid, t.agent, t.res, { kind: 'access', color: model.agents[t.agent].color, guess: !!t.guess, failed: !!t.failed });
      if (!t.failed) e.failed = false; e.count += 1; e.tools.push((t.tool || t.kind) + (t.failed ? ' (失敗)' : '')); byId[t.agent].count += 1; paint(n);
    },
    dir(d) {
      const g = ensureGroup({ gid: d.gid, label: d.label }, byId[d.agent]); g.count += 1;
      const eid = 'e|' + d.agent + '|' + g.id; let e = byId[eid]; if (!e) e = addLink(eid, d.agent, g.id, { kind: 'access', color: model.agents[d.agent].color, guess: false });
      e.count += 1; e.tools.push(d.tool + ' ' + d.pattern); byId[d.agent].count += 1;
    },
    now({ agent: a, targets, text }) {
      nodes.forEach(n => { if (n.now === a) n.now = null; }); links.forEach(l => { if (src(l) === a) l.now = false; });
      if (text) byId[a].now = a; targets.forEach(r => { const n = byId[r]; if (!n) return; n.now = a; const e = byId['e|' + a + '|' + r]; if (e) e.now = true; });
      byId[a].label = byId[a].base + (text ? '\n' + text : ''); if (byId[a].__label) byId[a].__label.text = byId[a].label;
    },
  };
  function applyOps(ops) { ops.forEach(o => H[o.op] && H[o.op](o)); applyFilters(); applyFocus(); push(); if (filters.follow && performance.now() - lastUserAt > 6000 && !nodes.some(n => n.sel) && container.offsetParent !== null) G.zoomToFit(600, 30); }
  function counts() { const c = {}; model.order.forEach(id => { c[id] = byId[id] ? byId[id].count : 0; }); return c; }
  function reset() { nodes.length = 0; links.length = 0; for (const k in byId) delete byId[k]; push(); }
  function fit() { G.width(container.clientWidth).height(container.clientHeight); setTimeout(() => G.zoomToFit(400, 30), 600); }
  window.gaze = Object.assign(window.gaze || {}, { g3d: G });

  // ---- 毎フレーム: 選択・いま・絞り込みを three のオブジェクトへ ----
  let hotSig = '';
  function tick() {
    nodes.forEach(n => {
      if (!n.__mesh) return; const pulse = !!n.sel, now = !!n.now;
      n.__mesh.scale.setScalar(pulse ? 2.1 : now ? 1.6 : 1);
      const col = n.dim ? C.muted : n.color; n.__mesh.material.color.set(col); n.__mesh.material.emissive.set(pulse ? C.hot : col); n.__mesh.material.emissiveIntensity = pulse ? 0.5 : now ? 0.4 : 0;
      n.__mesh.material.opacity = n.kind === 'group' ? 0.5 : (n.ended ? 0.45 : 1);
      if (n.__label) n.__label.color = n.dim ? C.muted : (n.kind === 'group' ? C.muted : C.fg);
    });
    let sig = ''; links.forEach(l => { l.hot = (!!l.now || !!l.sel) && l.kind !== 'member'; sig += l.hot ? '1' : '0'; });
    if (sig !== hotSig) { hotSig = sig; G.linkWidth(G.linkWidth()); G.linkDirectionalParticles(G.linkDirectionalParticles()); }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function applyFilters() {
    const on = filters; const show = { file: on.file, url: on.url, query: on.query, mcp: on.mcp, cmd: on.cmd, result: on.url };
    nodes.forEach(n => { n.hidden = n.kind !== 'agent' && n.kind !== 'group' && !show[n.kind]; });
    nodes.filter(n => n.kind === 'file').forEach(n => { if (!n.hidden && !on.guess && links.filter(l => l.kind === 'access' && tgt(l) === n.id).every(l => l.guess)) n.hidden = true; });
    nodes.filter(n => n.kind === 'group').forEach(g => { const mem = links.filter(l => l.kind === 'member' && tgt(l) === g.id).map(l => byId[src(l)]); g.hidden = mem.length > 0 && mem.every(m => m.hidden); });
    links.forEach(l => { l.hidden = byId[src(l)].hidden || byId[tgt(l)].hidden || (l.guess && !on.guess); });
    G.nodeVisibility(G.nodeVisibility()); G.linkVisibility(G.linkVisibility());
    G.controls().autoRotate = !!on.spin; G.controls().autoRotateSpeed = 1.2;
  }
  function applyFocus() {
    if (tabSel === 'all') { nodes.forEach(n => n.dim = false); links.forEach(l => l.dim = false); }
    else { links.forEach(l => l.dim = l.kind === 'access' ? src(l) !== tabSel : l.kind === 'spawn'); nodes.forEach(n => { n.dim = n.kind === 'agent' ? n.id !== tabSel : n.kind === 'group' ? false : !links.some(l => l.kind === 'access' && tgt(l) === n.id && src(l) === tabSel); }); }
    G.linkColor(G.linkColor());
  }
  function setFilters(f) { filters = f; applyFilters(); }
  function setFocus(t) { tabSel = t; applyFocus(); if (t !== 'all' && byId[t]) lookAt(byId[t], 110); }
  function lookAt(n, dist) { if (n.x == null) return; const len = Math.hypot(n.x, n.y, n.z) || 1; const r = (dist || 90) / len; G.cameraPosition({ x: n.x * (1 + r), y: n.y * (1 + r), z: n.z * (1 + r) }, n, 700); }
  function clearFocus() { nodes.forEach(n => n.sel = false); links.forEach(l => l.sel = false); ui.clearFeedSel(); }
  function expandQuery(n) {
    if (n.expanded) return; n.expanded = true;
    (n.results || []).forEach(u => { const res = 'url:' + u; if (!byId[res]) { const host = u.replace(/^https?:\/\//, '').split('/')[0]; const g = ensureGroup({ gid: 'dom:' + host, label: host }, n); const lab = u.replace(/^https?:\/\/[^/]+/, '') || '/'; addNode(res, { kind: 'result', label: lab, base: lab, color: C.query, full: u, group: g.id }, n); addLink('m|' + res, res, g.id, { kind: 'member', color: C.line }); } byId[res].sel = true; });
    n.base = n.full; paint(n); applyFilters(); push();
  }
  function onNodeClick(n) {
    lastUserAt = performance.now(); clearFocus();
    if (n.kind === 'query') expandQuery(n);
    const key = n.kind === 'agent' ? 'agent:' + n.id : n.id; const hits = model.related(key); ui.focusFeed(hits);
    const co = [...new Set(hits.flatMap(i => model.refs[i]).filter(r => r !== key && !r.startsWith('agent:')))];
    co.forEach(r => { if (byId[r]) byId[r].sel = true; }); n.sel = true; links.forEach(l => { if (l.kind === 'access' && tgt(l) === n.id) l.sel = true; });
    const acc = links.filter(l => l.kind === 'access' && tgt(l) === n.id);
    const seen = acc.map(l => { const a = src(l); return '<span style="color:' + model.agents[a].color + '">' + esc(model.agentLabel(a)) + '</span> ×' + l.count + ' (' + esc([...new Set(l.tools)].join(', ')) + ')'; });
    ui.detail('<div class="kind">' + esc(n.kind === 'group' ? 'ディレクトリ / ドメイン' : n.kind) + (n.kind === 'query' ? ' · クリックで結果を展開' : '') + '</div><div class="label">' + esc(n.full || n.label) + '</div>'
      + (n.group && byId[n.group] ? '<div class="row"><span>場所</span><b>' + esc(byId[n.group].label) + '</b></div>' : '')
      + '<div class="row"><span>アクセス回数</span><b>' + (n.count || 0) + '</b></div>'
      + (seen.length ? '<div class="row"><span>見た主体</span><b>' + seen.join(' / ') + '</b></div>' : '')
      + (co.length ? '<div class="row"><span>同時に触れた対象</span><b>' + esc(co.map(r => byId[r] ? byId[r].base : r).join(', ')) + '</b></div>' : '')
      + (hits.length ? '<div class="row" style="margin-top:6px"><span>関連イベント</span><b>' + hits.length + ' 件（右下で強調）</b></div><ul class="list">' + hits.slice(-8).map(ui.evLine).join('') + '</ul>' : ''));
  }
  function selectEvent(i) {
    clearFocus(); ui.markEvent(i);
    const ev = model.events[i]; const aid = ev.agent_id || 'main'; const ns = model.refs[i].filter(r => !r.startsWith('agent:')).map(r => byId[r]).filter(Boolean);
    ns.forEach(n => n.sel = true); if (byId[aid]) byId[aid].sel = true; links.forEach(l => { if (src(l) === aid && ns.some(n => n.id === tgt(l))) l.sel = true; });
    if (ns[0]) lookAt(ns[0], 70);
    ui.detail('<div class="kind">イベント · ' + esc(ev.hook_event_name) + (ev.tool_name ? ' · ' + esc(ev.tool_name) : '') + ' · <span style="color:' + (model.agents[aid] ? model.agents[aid].color : 'inherit') + '">' + esc(model.agentLabel(aid)) + '</span></div>'
      + (ns.length ? '<div class="row"><span>対象</span><b>' + esc(ns.map(n => (n.group && byId[n.group] ? byId[n.group].label : '') + (n.base || n.label)).join(' / ')) + '</b></div>' : '')
      + '<pre>' + esc(JSON.stringify(ev, null, 2)) + '</pre>');
  }
  return { applyOps, reset, fit, setFilters, setFocus, selectEvent, counts, clearFocus };
}
