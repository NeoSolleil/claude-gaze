import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, reduce, searchResultUrls } from '../src/web/events.js';

const CWD = '/home/u/proj';
const post = (tool_name, tool_input, extra) => Object.assign({ hook_event_name: 'PostToolUse', session_id: 's1', cwd: CWD, tool_name, tool_input }, extra || {});
const by = (ops, op) => ops.filter(o => o.op === op);

test('Read → ファイルノード（ディレクトリ枠付き）と「いま」', () => {
  const st = createState();
  const ops = reduce(st, post('Read', { file_path: CWD + '/src/app.ts' }));
  assert.equal(by(ops, 'session')[0].cwd, CWD);
  assert.equal(by(ops, 'agent')[0].id, 'main');
  const t = by(ops, 'touch')[0];
  assert.equal(t.res, 'file:' + CWD + '/src/app.ts'); assert.equal(t.kind, 'file'); assert.equal(t.label, 'app.ts');
  assert.deepEqual(t.group, { gid: 'dir:src', label: 'proj/src/', col: 'right', dir: 1 });
  assert.deepEqual(by(ops, 'now')[0], { op: 'now', agent: 'main', targets: [t.res], text: 'Read src/app.ts' });
  assert.equal(by(ops, 'feed')[0].text, 'src/app.ts');
});

test('WebFetch → URL ノード（ドメイン枠）', () => {
  const st = createState();
  const ops = reduce(st, post('WebFetch', { url: 'https://example.com/docs/a', prompt: 'x' }));
  const t = by(ops, 'touch')[0];
  assert.equal(t.kind, 'url'); assert.equal(t.label, '/docs/a'); assert.equal(t.group.gid, 'dom:example.com'); assert.equal(t.group.col, 'left');
});

test('Bash（実在ファイルあり）→ 破線でファイルへ。コマンドノードは作らない', () => {
  const st = createState();
  const ops = reduce(st, post('Bash', { command: 'cat src/config.ts | head' }, { gaze: { files: [CWD + '/src/config.ts'] } }));
  const ts = by(ops, 'touch');
  assert.equal(ts.length, 1); assert.equal(ts[0].kind, 'file'); assert.equal(ts[0].guess, true); assert.equal(ts[0].cmd, 'cat');
  assert.equal(ts[0].tool, 'Bash(推定): cat src/config.ts | head');
});

test('Bash（ファイルなし）→ コマンドノード', () => {
  const st = createState();
  const ops = reduce(st, post('Bash', { command: 'npm test' }, { gaze: { files: [] } }));
  const t = by(ops, 'touch')[0];
  assert.equal(t.kind, 'cmd'); assert.equal(t.res, 'cmd:npm'); assert.equal(t.group.gid, 'grp:tools');
});

test('サブエージェント: PostToolUse が先に来ても主体を作る。SubagentStop で終了', () => {
  const st = createState();
  const ops1 = reduce(st, post('Grep', { pattern: 'foo', path: CWD + '/src' }, { agent_id: 'ag1', agent_type: 'Explore' }));
  assert.deepEqual(by(ops1, 'agent').map(o => o.id), ['main', 'ag1']);
  assert.equal(by(ops1, 'dir')[0].gid, 'dir:src');
  const ops2 = reduce(st, { hook_event_name: 'SubagentStop', session_id: 's1', cwd: CWD, agent_id: 'ag1', agent_type: 'Explore' });
  assert.equal(by(ops2, 'agentEnd')[0].id, 'ag1'); assert.equal(st.agents.ag1.ended, true);
});

test('Start もツール使用もない主体の SubagentStop（進捗要約の内部エージェント）は主体を作らない', () => {
  const st = createState();
  reduce(st, post('Read', { file_path: CWD + '/a.ts' }));
  const ops = reduce(st, { hook_event_name: 'SubagentStop', session_id: 's1', cwd: CWD, agent_id: 'sum1', agent_type: '', last_assistant_message: 'Inspecting route handlers in voices.py' });
  assert.deepEqual(ops, []);
  assert.equal(st.agents.sum1, undefined); assert.deepEqual(st.order, ['main']);
});

test('Stop → 「いま」を消す。UserPromptSubmit → ターン', () => {
  const st = createState();
  const o1 = reduce(st, { hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd: CWD, prompt: 'やって' });
  assert.deepEqual(by(o1, 'turn')[0], { op: 'turn', n: 1, prompt: 'やって' });
  const o2 = reduce(st, { hook_event_name: 'Stop', session_id: 's1', cwd: CWD });
  assert.deepEqual(by(o2, 'now')[0], { op: 'now', agent: 'main', targets: [], text: '' });
});

test('WebSearch の結果 URL をテキストから抜く。壊れていれば空', () => {
  const resp = 'Web search results for query: "x"\n\nLinks: [{"title":"A","url":"https://a.example/1"},{"title":"B","url":"https://b.example/2"}]\n\nBased on…';
  assert.deepEqual(searchResultUrls(resp), ['https://a.example/1', 'https://b.example/2']);
  assert.deepEqual(searchResultUrls('no links here'), []);
  const st = createState();
  const t = by(reduce(st, post('WebSearch', { query: 'x' }, { tool_response: resp })), 'touch')[0];
  assert.equal(t.kind, 'query'); assert.deepEqual(t.results.length, 2); assert.equal(t.label, '"x"  +2');
});

test('描かないツールは ops を出さない（主体登録を除く）', () => {
  const st = createState();
  const ops = reduce(st, post('AskUserQuestion', { questions: [] }));
  assert.equal(by(ops, 'touch').length + by(ops, 'feed').length + by(ops, 'now').length, 0);
});

test('PostToolUseFailure → failed 印付きで「見に行った」として描く', () => {
  const st = createState();
  const ops = reduce(st, { hook_event_name: 'PostToolUseFailure', session_id: 's1', cwd: CWD, tool_name: 'Read', tool_input: { file_path: CWD + '/missing.md' }, error: 'File does not exist' });
  const t = by(ops, 'touch')[0]; assert.equal(t.failed, true); assert.equal(t.kind, 'file');
  assert.equal(by(ops, 'feed')[0].failed, true);
});

test('WebSearch の結果（Hooks の構造化形式、実機で確認した形）から URL を抜く', () => {
  const resp = { query: 'cytoscape taxi edge style', results: [{ tool_use_id: 'srvtoolu_1', content: [{ title: 'a', url: 'https://blog.js.cytoscape.org/2019/03/06/3.5.0-release/' }, { title: 'b', url: 'https://js.cytoscape.org/' }] }, 'Based on the search…'] };
  assert.deepEqual(searchResultUrls(resp), ['https://blog.js.cytoscape.org/2019/03/06/3.5.0-release/', 'https://js.cytoscape.org/']);
  assert.deepEqual(searchResultUrls({ query: 'x', results: [] }), []);
});

test('Windows のパス（\\ 区切り）も / に揃えてディレクトリ分けする', () => {
  const st = createState();
  const win = 'C:\\Users\\u\\proj';
  const ops = reduce(st, { hook_event_name: 'PostToolUse', session_id: 's1', cwd: win, tool_name: 'Read', tool_input: { file_path: win + '\\src\\app.ts' } });
  const t = by(ops, 'touch')[0];
  assert.equal(t.full, 'C:/Users/u/proj/src/app.ts'); assert.equal(t.label, 'app.ts');
  assert.equal(t.group.gid, 'dir:src'); assert.equal(t.group.label, 'proj/src/');
  assert.equal(by(ops, 'feed')[0].text, 'src/app.ts');
});
