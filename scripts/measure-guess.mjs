// 使い方: node scripts/measure-guess.mjs <session.jsonl> <cwd>  — 過去の実ログの Bash コマンドに対する実在ファイル検出率を測る
// 過去の実ログ（JSONL）の Bash コマンドに guessFiles を当て、検出率を測る
import { guessFiles } from '../src/server/store.ts';
import { readFileSync } from 'node:fs';
const [,, file, cwd] = process.argv;
const cmds = [];
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue; let o; try { o = JSON.parse(line); } catch { continue; }
  if (o.type !== 'assistant') continue;
  for (const b of o.message?.content || []) if (b?.type === 'tool_use' && b.name === 'Bash') cmds.push(b.input.command || '');
}
const fileish = /(^|[\s'"])(\.{0,2}\/)?[\w.-]+(\/[\w.-]+)+\.[A-Za-z0-9]+|\b[\w.-]+\.(py|ts|tsx|js|md|json|toml|yaml|yml|txt|feature|html|css)\b/;
let withFiles = 0, looksFileish = 0, both = 0; const samples = [];
for (const c of cmds) {
  const f = guessFiles(c, cwd); const lf = fileish.test(c);
  if (f.length) withFiles++; if (lf) looksFileish++; if (f.length && lf) both++;
  if (samples.length < 12 && (lf || f.length)) samples.push({ cmd: c.replace(/\s+/g, ' ').slice(0, 90), files: f.map(x => x.replace(cwd + '/', '')).slice(0, 4), fileish: lf });
}
console.log(JSON.stringify({ commands: cmds.length, detected: withFiles, looksFileish, both }, null, 0));
for (const s of samples) console.log((s.files.length ? 'HIT ' : 'MISS') + (s.fileish ? ' f ' : '   ') + s.cmd + '  => ' + JSON.stringify(s.files));
