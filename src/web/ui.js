// 右ペイン（詳細・イベント列・主体タブ）、左ペインの主体一覧、下部のフィルタ。描画方式に依存しない。
import { esc, clock } from './model.js';

export function createUI(model) {
  const feedEl = document.getElementById('feed'), detailEl = document.getElementById('detail'), tabsEl = document.getElementById('tabs'), agentsEl = document.getElementById('agents');
  const EMPTY = '<div class="kind">ノードかイベントを選択すると詳細が出ます</div>';
  let tabSel = 'all'; const listeners = { event: [], tab: [], filters: [] };
  const ui = {
    get tab() { return tabSel; },
    on(type, fn) { listeners[type].push(fn); },
    detail(html) { detailEl.innerHTML = html || EMPTY; },
    clearFeedSel() { feedEl.querySelectorAll('.ev.sel, .ev.rel').forEach(x => x.classList.remove('sel', 'rel')); },
    focusFeed(hits) {
      hits.forEach(i => { const row = feedEl.querySelector('.ev[data-i="' + i + '"]'); if (row) row.classList.add('rel'); });
      const last = hits.length ? feedEl.querySelector('.ev[data-i="' + hits[hits.length - 1] + '"]') : null; if (last) last.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    markEvent(i) { const row = feedEl.querySelector('.ev[data-i="' + i + '"]'); if (row) row.classList.add('sel'); },
    feed(f, ev, i) {
      const div = document.createElement('div'); div.className = 'ev new'; div.tabIndex = 0; div.dataset.i = i; div.dataset.agent = f.agent;
      const col = f.kind === 'agent' ? 'var(--accent)' : f.kind === 'muted' ? 'var(--muted)' : 'var(--c-' + f.kind + ')';
      const sw = model.agents[f.agent] ? model.agents[f.agent].color : 'var(--muted)';
      div.innerHTML = '<div class="t">' + clock(ev) + '</div><div><div class="who" style="color:' + sw + '">' + esc(f.agentLabel) + (f.failed ? ' <span style="color:var(--muted)">失敗</span>' : '') + '</div><div class="what" style="--dot:' + col + '"><i>' + esc(f.tool) + '</i> ' + esc(f.text) + '</div></div>';
      div.addEventListener('click', () => { ui.clearFeedSel(); div.classList.add('sel'); listeners.event.forEach(fn => fn(i)); });
      div.addEventListener('keydown', e => { if (e.key === 'Enter') div.click(); });
      if (tabSel !== 'all' && tabSel !== f.agent) div.classList.add('hide');
      feedEl.prepend(div); while (feedEl.children.length > 300) feedEl.lastChild.remove();
    },
    evLine(i) {
      const ev = model.events[i]; const inp = ev.tool_input || {}; const tool = ev.tool_name || ev.hook_event_name;
      const what = tool === 'Bash' ? inp.command : tool === 'WebFetch' ? inp.url : tool === 'WebSearch' ? '"' + inp.query + '"' : inp.file_path ? inp.file_path : inp.pattern ? inp.pattern : inp.skill ? '/' + inp.skill : '';
      return '<li><span>' + clock(ev) + '</span><b>' + esc(tool + '  ' + what) + '</b></li>';
    },
    renderAgents(counts) {
      agentsEl.innerHTML = model.order.map(id => { const A = model.agents[id]; return '<div class="agent"><span class="sw" style="--sw:' + A.color + ';opacity:' + (A.ended ? .35 : 1) + '"></span>' + esc(model.agentLabel(id)) + '<span class="st">' + (A.ended ? 'done' : 'live') + ' · ' + ((counts && counts[id]) || 0) + '</span></div>'; }).join('');
    },
    renderTabs() {
      const keys = ['all', ...model.order];
      tabsEl.innerHTML = keys.map(k => '<button class="tab' + (tabSel === k ? ' on' : '') + '" data-k="' + k + '"' + (k !== 'all' && tabSel === k ? ' style="color:' + model.agents[k].color + ';border-color:' + model.agents[k].color + '"' : '') + '>' + (k === 'all' ? 'すべて' : esc(model.agentLabel(k))) + '</button>').join('');
      tabsEl.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { tabSel = b.dataset.k; ui.renderTabs(); feedEl.querySelectorAll('.ev').forEach(x => x.classList.toggle('hide', tabSel !== 'all' && x.dataset.agent !== tabSel)); listeners.tab.forEach(fn => fn(tabSel)); }));
    },
    filters() {
      const g = (id) => document.getElementById(id).checked;
      return { file: g('f-file'), url: g('f-url'), query: g('f-query'), mcp: g('f-mcp'), cmd: g('f-cmd'), guess: g('f-guess'), follow: g('f-follow'), spin: g('f-spin') };
    },
    reset() { feedEl.innerHTML = ''; tabSel = 'all'; ui.detail(''); ui.renderAgents({}); ui.renderTabs(); document.getElementById('turn').innerHTML = ''; },
  };
  document.querySelectorAll('footer input[type="checkbox"]').forEach(el => el.addEventListener('change', () => {
    const f = ui.filters(); document.getElementById('f-guess').disabled = !f.file; document.getElementById('l-guess').classList.toggle('off', !f.file);
    listeners.filters.forEach(fn => fn(f));
  }));
  return ui;
}
