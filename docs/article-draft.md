# Qiita 記事の骨子（下書き）

本文は docs/article.md にある。これはその骨子。各節に「入れる画像」「根拠にする事実」「書かないこと」を添える。
数値はすべてこのリポジトリで計測した値（2026-10-12、Claude Code 2.1.296、Linux）。

## タイトル案

- Claude Code が「いま何を見ているか」をリアルタイムで地図にする claude-gaze を作った
- Hooks だけで Claude Code のファイルアクセスをライブ可視化する
- サブエージェントが裏で何を読んでいるか、見えるようにした

推奨は 1 番目。検索されやすい語（Claude Code、リアルタイム、可視化）を含み、何が得られるかが読める。

## 1. 動機（150〜250 字）

- Claude Code を CLI で使い、SDD の流れで AI に実装を進めさせている。ターミナルは動き続けるが、終わったあとに「結局どこを見て何をしたか」を知るにはターミナルを遡るしかなく、面倒。文字の列でなく絵で把握したい
- サブエージェント（名前は人による。例では Explore と general-purpose の 2 体）の中でのファイル読み取りは、メインのターミナルにはほぼ出ない。何を調べたのか見えない
- 「デバッグ」ではなく「いま何をしているかを眺めたい」が出発点

画像: `docs/images/live.gif`（冒頭に置く。最初の 3 秒で何のツールか伝わる）

## 2. できたもの（画像中心）

| 画像 | 見せたいこと |
|---|---|
| `map.png` | 1 枚の地図。左に Web と検索、中央に主体、右にディレクトリごとのファイル |
| `select-node.png` | ノードを押すと、誰が何回どのツールで触ったか。`orders.ts` が Explore と main のパイ塗り |
| `search-expand.png` | WebSearch のクエリを押すと結果 URL が展開され、ドメインごとの枠に入る |
| `failed.png` | 存在しないファイルの Read が灰色の点線で残る（「見に行ったが無かった」も情報） |
| `collapse.png` | ディレクトリ枠を畳む |
| `agent-tab.png` | 主体タブで Explore だけに絞る。地図側は他の主体が灰色になる |
| `lanes.png` | 主体別の帯。同じ対象は帯ごとに出て `◈2` で共有を示す |
| `3d.png` | 3D（見せる用途。ライブラリは選んだときだけ読む） |

- 主体ごとの色: メイン、Explore、general-purpose が同時に見える
- Bash 経由のファイル参照（`cat` `grep` など）も破線で描く
- ライブ性: Hooks → サーバ受信の遅延は 4〜5 ms（セッションログの tool_result 時刻との差）

## 3. 仕組み（図 1 枚＋300 字）

```
Claude Code ──(Hooks 8 イベント)──▶ curl ──▶ Node サーバ 127.0.0.1:4820 ──(SSE)──▶ ブラウザ（Cytoscape）
```

- Hooks の `PostToolUse` が JSON（tool_name, tool_input, tool_response, agent_id …）を標準入力で渡す
- `curl -s -m 1 … || true` を `async: true` で登録。サーバが居なくても 1 秒で諦めるので Claude Code は遅くならない
- サーバはメモリに持つだけ。ブラウザ側の純関数 `events.js` が JSON をグラフ操作に変換（node:test で 14 件）
- フレームワーク無し（素の ES Modules）。依存は Cytoscape と three 系のみ

書かないこと: SSE の実装詳細、Cytoscape のスタイル指定。リンクで済ます。

## 4. Hooks で分かったこと（記事の中で一番価値がある節）

事実として確認したもの。読者が自分で Hooks を使うときに役立つ。

1. **失敗したツール呼び出しは `PostToolUse` に来ない**。公式 docs どおりで、`PostToolUseFailure` を別に購読する必要がある。存在しないファイルの Read はこちらに来る
2. **サブエージェント内のツール呼び出しには `agent_id` と `agent_type` が付く**。これで主体を色分けできる。`SubagentStart` / `SubagentStop` で出現と終了が取れる
3. **WebSearch の `tool_response` は構造化 JSON**（`{ query, results: [{ content: [{ title, url }] }] }`）。セッションログに残るテキスト形式「Links: [...]」と違う。両方に対応した
4. **`async: true` の Hook は Claude Code の進行を止めない**。遅延 4〜5 ms は計測値
5. **Bash がツール呼び出しの過半**（実ログ 3.2 MB で Bash 45 / Read 14）。ファイルアクセスを追うなら Bash のコマンド文字列を読むしかない
6. **Hooks の JSON 形式は内部仕様**。公式 docs がセッションログ JSONL について「どのリリースでも壊れうる」と明言しており、Hooks の `tool_response` も同様に扱う設計にした（壊れたらクエリノードだけ残す）

## 5. 設計で迷ったところ（各 100 字程度）

- **1 枚地図か主体別か**: 両方入れた。既定は 1 枚地図（パイ塗りで共有が見える）、主体別は「誰が何を」を追うとき
- **「いま」をどう見せるか**: 時間窓スライダは捨てた。主体ごとの最新 1 件を太く描くだけにした。古いものは消さない
- **Bash 推定**: コマンド文字列中の、cwd 基準で実在するファイルだけを拾う。過去ログ 45 件で検出 15 件。未検出 30 件の大半は `npm run dev` や `curl` などファイルを読まないコマンド。誤検出はチェック 1 つで隠せる
- **3D を入れるか**: 見せる用途として入れた。ライブラリは選択時だけ読む（2D だけなら 0.4 MB、3D で +1.3 MB）

## 6. 既存ツールとの違い（表 1 枚）

| | claude-gaze | mindwalk | claude-code-viewer 系 |
|---|---|---|---|
| ライブ | ○（Hooks） | ×（再生専用） | △（ログ監視） |
| 対象 | ファイル＋URL＋検索＋MCP＋コマンド | ファイルのみ | 会話ログ |
| 主体の同時表示 | ○ | × | × |
| 俯瞰（触っていない場所） | × | ○ | × |

mindwalk の長所（俯瞰・再生・完成度）は素直に書く。claude-gaze は「触ったものだけ」を描く設計で、プロジェクト全体の地図ではない。

## 7. 限界（正直に）

- 色で区別できる主体は 6 体まで
- Bash 推定は文字列ベース
- データはメモリのみ。サーバ再起動で消える
- Hooks 形式がリリースで変わると壊れる部分がある
- Windows は未検証（Hooks のコマンドが sh 構文）

## 8. 導入（README の「導入」節をそのまま短く）

```sh
git clone https://github.com/NeoSolleil/claude-gaze.git && cd claude-gaze
npm install
npm run hooks:install   # ~/.claude/settings.json に Hooks を追加（.bak を残す）
npm start               # http://127.0.0.1:4820/
```

新しく Claude Code を起動して作業させると現れる。やめるときは `npm run hooks:remove`。

## 9. まとめと今後

- Hooks だけで「いま何を見ているか」は十分に取れる
- 今後: プラグイン化（`claude plugin install` で入るようにする）、過去セッションの JSONL 再生
- リポジトリ: https://github.com/NeoSolleil/claude-gaze

## 書くときの注意

- 画像は実セッションのものに差し替えると説得力が上がる。`scripts/shoot.mjs` の画像は架空プロジェクト（shop-api）
- 自分の環境の実セッションを撮るときは、セッション一覧に他プロジェクトのパスが出るので、別ポートのサーバ（`GAZE_PORT=4830`）で撮る
- 数値は測った条件（日付・バージョン・OS）を添える
