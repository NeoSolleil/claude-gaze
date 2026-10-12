// Claude Code Hooks の stdin JSON（公式 docs の契約）のうち、本ツールが使う部分の型と検査

export const HOOK_EVENTS = [
  'PostToolUse', 'PostToolUseFailure', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit', 'Stop', 'SessionStart', 'SessionEnd',
] as const;
export type HookEventName = (typeof HOOK_EVENTS)[number];

export interface HookBase {
  hook_event_name: HookEventName;
  session_id: string;
  cwd?: string;
  transcript_path?: string;
  agent_id?: string;
  agent_type?: string;
  prompt_id?: string;
}

export interface PostToolUseEvent extends HookBase {
  hook_event_name: 'PostToolUse' | 'PostToolUseFailure';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: unknown;
  tool_use_id?: string;
  duration_ms?: number;
  mcp_server?: { name: string; source?: string };
}

export type HookEvent = HookBase | PostToolUseEvent;

/** サーバが付与する付帯情報 */
export interface GazeMeta {
  received_at: number;      // サーバ受信時刻 (ms)
  seq: number;              // セッション内の通番
  files?: string[];         // Bash コマンド中のトークンのうち cwd 基準で実在するファイル（推定）
}

export type StoredEvent = HookEvent & { gaze: GazeMeta };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 必須項目だけを検査する。未知の項目は通す（将来の追加に壊されないため） */
export function parseHookEvent(raw: unknown): HookEvent | null {
  if (!isObject(raw)) return null;
  const name = raw.hook_event_name;
  if (typeof name !== 'string' || !(HOOK_EVENTS as readonly string[]).includes(name)) return null;
  if (typeof raw.session_id !== 'string' || raw.session_id === '') return null;
  if (name === 'PostToolUse' || name === 'PostToolUseFailure') {
    if (typeof raw.tool_name !== 'string' || !isObject(raw.tool_input)) return null;
  }
  return raw as unknown as HookEvent;
}

export function isPostToolUse(e: HookEvent): e is PostToolUseEvent {
  return e.hook_event_name === 'PostToolUse' || e.hook_event_name === 'PostToolUseFailure';
}
