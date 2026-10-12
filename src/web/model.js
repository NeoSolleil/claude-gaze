// 描画方式（2D 地図・主体別・3D）で共有する状態: 主体と色、受信済みイベントとその ops、ノード→イベントの逆引き

export const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const clock = (ev) => new Date(ev && ev.gaze ? ev.gaze.received_at : Date.now()).toLocaleTimeString('ja-JP', { hour12: false });

export function colors() {
  return { agent: css('--accent'), file: css('--c-file'), url: css('--c-url'), query: css('--c-query'), mcp: css('--c-mcp'), cmd: css('--c-cmd'), result: css('--c-url'), hot: css('--hot'), fg: css('--fg'), muted: css('--muted'), line: css('--line'), group: css('--group'), bg: css('--bg') };
}
const AGC = () => [0, 1, 2, 3, 4, 5].map(i => css('--a' + i));

export function createModel() {
  const m = {
    agents: {}, order: [],          // id -> { type, main, color, ended }
    events: [], ops: [], refs: [],  // i -> 受信イベント / その ops / 対象キー（res, gid, 'agent:<id>'）
    agentLabel(id) { const a = m.agents[id]; return !a ? id : a.main ? 'main' : a.type; },
    addAgent(id, type, main) {
      if (m.agents[id]) return m.agents[id];
      const color = AGC()[m.order.length % 6]; m.agents[id] = { type, main: !!main, color, ended: false }; m.order.push(id); return m.agents[id];
    },
    push(ev, ops) { const i = m.events.length; m.events.push(ev); m.ops.push(ops); const f = ops.find(o => o.op === 'feed'); m.refs.push(f ? f.targets.map(t => t.agent ? 'agent:' + t.agent : (t.res || t.gid)) : []); return i; },
    /** ノード（res / gid）または主体（agent:<id>）に関係するイベント番号 */
    related(key) {
      const hits = [];
      for (let i = 0; i < m.events.length; i++) { const own = key.startsWith('agent:') ? (m.events[i].agent_id || 'main') === key.slice(6) : m.refs[i].includes(key); if (own) hits.push(i); }
      return hits;
    },
    reset() { m.agents = {}; m.order = []; m.events = []; m.ops = []; m.refs = []; },
  };
  return m;
}
