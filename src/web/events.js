// Hooks の JSON を、グラフ操作（ops）に変換する純関数。DOM・Cytoscape に依存しない（node:test で検証）。

export function createState() {
  return { root: '', rootName: '', agents: {}, order: [], turn: 0 };
}

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Windows の区切り（\\）を / に揃える。表示・グループ分けはすべて / 前提 */
export function norm(p) { return String(p).replace(/\\/g, '/'); }

export function short(state, p) {
  if (!p) return '';
  p = norm(p);
  if (state.root && p.startsWith(state.root + '/')) return p.slice(state.root.length + 1);
  if (state.root && p === state.root) return '.';
  return p.replace(/^https?:\/\//, '');
}
/** ルート外のディレクトリは末尾 2 段だけ見せる */
export function abbrevDir(dir) { const parts = dir.split('/').filter(Boolean); return parts.length > 2 ? '…/' + parts.slice(-2).join('/') + '/' : dir + '/'; }
export function base(p) { return String(p).replace(/\/$/, '').split('/').pop() || p; }
function hostOf(u) { return u.replace(/^https?:\/\//, '').split('/')[0]; }
function pathOf(u) { return u.replace(/^https?:\/\/[^/]+/, '') || '/'; }

export function groupOf(state, kind, full) {
  if (kind === 'file') {
    const rel = short(state, full); const i = rel.lastIndexOf('/'); const dir = i < 0 ? '' : rel.slice(0, i);
    const inside = !dir.startsWith('/');
    const label = inside ? state.rootName + '/' + (dir ? dir + '/' : '') : abbrevDir(dir);
    return { gid: 'dir:' + dir, label, col: 'right', dir: 1 };
  }
  if (kind === 'url' || kind === 'result') return { gid: 'dom:' + hostOf(full), label: hostOf(full), col: 'left', dir: 0 };
  if (kind === 'query') return { gid: 'grp:search', label: '検索', col: 'left', dir: 0 };
  return { gid: 'grp:tools', label: 'コマンド / MCP / Skill', col: 'left', dir: 0 };
}

/** WebSearch の tool_response から結果 URL を抜く。
 *  Hooks では構造化 { query, results: [{ content: [{ title, url }] }] }（実機で確認）、
 *  セッションログではテキスト「Links: [...]」。どちらも受け、形式変更で壊れたら空配列 */
export function searchResultUrls(resp) {
  if (resp && typeof resp === 'object' && !Array.isArray(resp) && Array.isArray(resp.results)) {
    const urls = [];
    for (const r of resp.results) { const items = Array.isArray(r && r.content) ? r.content : Array.isArray(r) ? r : []; for (const c of items) if (c && typeof c.url === 'string') urls.push(c.url); }
    return [...new Set(urls)];
  }
  const text = typeof resp === 'string' ? resp : Array.isArray(resp) ? resp.map(b => (b && b.text) || '').join('\n') : '';
  const m = /Links:\s*(\[[\s\S]*?\])\s*(?:\n|$)/.exec(text);
  if (!m) return [];
  try { const arr = JSON.parse(m[1]); return arr.map(x => x && x.url).filter(u => typeof u === 'string'); } catch { return []; }
}

function ensureAgent(state, ops, id, type, main) {
  if (state.agents[id]) return;
  state.agents[id] = { type, main: !!main, ended: false };
  state.order.push(id);
  ops.push({ op: 'agent', id, type, main: !!main });
}

/** 1 件の Hooks イベントを ops に変換する。state は更新される */
export function reduce(state, ev) {
  const ops = [];
  if (!state.root && ev.cwd) { state.root = norm(ev.cwd).replace(/\/$/, ''); state.rootName = base(state.root); ops.push({ op: 'session', cwd: state.root }); }
  ensureAgent(state, ops, 'main', 'main', true);
  const a = ev.agent_id || 'main';
  const name = ev.hook_event_name;
  // 進捗要約などの内部エージェントは、Start もツール使用もなく agent_type 空の SubagentStop だけが約 30 秒ごとに届く（実機で確認）。
  // 見たことのない主体の終了だけでは主体を作らない
  if (a !== 'main' && !state.agents[a] && (name === 'SubagentStop' || name === 'Stop')) return ops;
  if (a !== 'main') ensureAgent(state, ops, a, ev.agent_type || 'subagent', false);

  if (name === 'UserPromptSubmit') {
    state.turn += 1;
    ops.push({ op: 'turn', n: state.turn, prompt: String(ev.prompt || '') });
    ops.push({ op: 'feed', agent: 'main', agentLabel: 'user', tool: 'prompt', text: String(ev.prompt || ''), kind: 'muted', targets: [] });
    return ops;
  }
  if (name === 'SubagentStart') {
    ops.push({ op: 'feed', agent: 'main', agentLabel: 'main', tool: 'Agent', text: (ev.agent_type || a) + ' を起動', kind: 'agent', targets: [{ agent: a }] });
    return ops;
  }
  if (name === 'SubagentStop') {
    state.agents[a].ended = true;
    ops.push({ op: 'agentEnd', id: a }, { op: 'now', agent: a, targets: [], text: '' });
    ops.push({ op: 'feed', agent: a, agentLabel: state.agents[a].type, tool: 'Stop', text: '完了', kind: 'agent', targets: [{ agent: a }] });
    return ops;
  }
  if (name === 'Stop') {
    ops.push({ op: 'now', agent: a, targets: [], text: '' });
    ops.push({ op: 'feed', agent: a, agentLabel: a === 'main' ? 'main' : state.agents[a].type, tool: 'Stop', text: 'ターン終了', kind: 'muted', targets: [{ agent: a }] });
    return ops;
  }
  if (name === 'SessionStart' || name === 'SessionEnd') {
    ops.push({ op: 'feed', agent: 'main', agentLabel: 'session', tool: name, text: ev.cwd || '', kind: 'muted', targets: [] });
    return ops;
  }
  if (name !== 'PostToolUse' && name !== 'PostToolUseFailure') return ops;
  const failed = name === 'PostToolUseFailure';

  const tool = ev.tool_name, inp = ev.tool_input || {};
  const targets = [];
  const touch = (res, kind, label, full, extra) => { const t = Object.assign({ res, kind, label, full, group: groupOf(state, kind, full), failed }, extra || {}); ops.push(Object.assign({ op: 'touch', agent: a }, t)); targets.push({ res }); };
  let feedText = '', feedKind = 'file', nowText = tool;

  if (FILE_TOOLS.has(tool) && typeof inp.file_path === 'string') {
    const fp = norm(inp.file_path);
    touch('file:' + fp, 'file', base(fp), fp, { tool });
    feedText = short(state, fp); nowText = tool + ' ' + feedText;
  } else if ((tool === 'Glob' || tool === 'Grep')) {
    const dir = norm(typeof inp.path === 'string' ? inp.path : (ev.cwd || state.root));
    const rel = short(state, dir).replace(/\/$/, ''); const d = rel === '.' ? '' : rel;
    ops.push({ op: 'dir', agent: a, gid: 'dir:' + d, label: state.rootName + '/' + (d ? d + '/' : ''), tool, pattern: String(inp.pattern || '') });
    targets.push({ gid: 'dir:' + d });
    feedText = (inp.pattern || '') + '  in ' + (d || '.'); nowText = tool + ' ' + (inp.pattern || '');
  } else if (tool === 'Bash') {
    const cmd = String(inp.command || ''); const cmdName = cmd.trim().split(/\s+/)[0] || 'sh';
    const files = (ev.gaze && Array.isArray(ev.gaze.files)) ? ev.gaze.files.map(norm) : [];
    if (files.length) files.forEach(f => touch('file:' + f, 'file', base(f), f, { tool: 'Bash(推定): ' + cmd, guess: true, cmd: cmdName }));
    else touch('cmd:' + cmdName, 'cmd', cmdName, cmd, { tool: 'Bash: ' + cmd });
    feedText = cmd; feedKind = 'cmd'; nowText = 'Bash ' + cmd.slice(0, 40);
  } else if (tool === 'WebFetch' && typeof inp.url === 'string') {
    touch('url:' + inp.url, 'url', pathOf(inp.url), inp.url, { tool });
    feedText = short(state, inp.url); feedKind = 'url'; nowText = 'WebFetch ' + feedText.slice(0, 40);
  } else if (tool === 'WebSearch' && typeof inp.query === 'string') {
    const results = searchResultUrls(ev.tool_response);
    touch('q:' + inp.query, 'query', '"' + inp.query + '"' + (results.length ? '  +' + results.length : ''), '"' + inp.query + '"', { tool, results });
    feedText = inp.query + (results.length ? '  (+' + results.length + ')' : ''); feedKind = 'query'; nowText = 'WebSearch "' + inp.query.slice(0, 32) + '"';
  } else if (tool.startsWith('mcp__')) {
    const server = (ev.mcp_server && ev.mcp_server.name) || tool.split('__')[1] || 'mcp';
    touch('mcp:' + server, 'mcp', 'mcp:' + server, tool, { tool });
    feedText = JSON.stringify(inp).slice(0, 80); feedKind = 'mcp'; nowText = tool.split('__').slice(2).join('__') || tool;
  } else if (tool === 'Skill' && typeof inp.skill === 'string') {
    touch('skill:' + inp.skill, 'mcp', '/' + inp.skill, 'Skill ' + inp.skill, { tool });
    feedText = '/' + inp.skill; feedKind = 'mcp';
  } else {
    return ops;   // ToolSearch / AskUserQuestion / Agent 等は描かない
  }
  ops.push({ op: 'now', agent: a, targets: targets.map(t => t.res || t.gid), text: nowText });
  ops.push({ op: 'feed', agent: a, agentLabel: a === 'main' ? 'main' : state.agents[a].type, tool, text: feedText, kind: feedKind, targets, failed });
  return ops;
}
