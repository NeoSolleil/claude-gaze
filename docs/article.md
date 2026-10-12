<!--
Qiita 用の原稿。画像は push 後に raw.githubusercontent.com から読める。
タグ案: ClaudeCode, Claude, 可視化, Nodejs, Hooks
-->

# Claude Code が「いま何を見ているか」をリアルタイムで地図にする claude-gaze を作った

![ライブで描かれる様子](https://raw.githubusercontent.com/NeoSolleil/claude-gaze/main/docs/images/live.gif)

Claude Code がツールを呼ぶたびに、触ったファイル・URL・検索・コマンドをブラウザ上の地図に描き足していくローカルツールを作りました。メインとサブエージェントは色で分けます。Claude Code の Hooks だけで動き、外部にデータは送りません。

リポジトリ: https://github.com/NeoSolleil/claude-gaze

## 1. 動機

私は Claude Code を CLI で使っていて、仕様駆動開発（SDD）の流れで AI に実装を進めさせることが多いです。この使い方だと、ターミナルは長い時間ひたすら動き続けます。終わったあとに「結局どこを見て、何をしたのか」を知ろうとすると、ターミナルを延々と遡って `Read` や `Grep` の行を拾い直すしかありません。これが面倒で、文字の列ではなく絵で把握したいと思っていました。

もう 1 つ困っていたのがサブエージェントです。サブエージェントの名前は人それぞれで、私の環境では Explore と general-purpose という 2 体を作って使っています。サブエージェントに作業を任せると、その中でのファイル読み取りはメインのターミナルにはほとんど出てきません。「何か調べているらしい」ことは分かっても、実際にどのファイルを読んで回ったのかは見えないままでした。

この 2 つを解消したくて、「いま何を見ているか」を地図として描き続けるツールを作ってみました。デバッグ用の精密なトレーサではなく、作業中に横に置いて眺めるためのものです。

## 2. できたもの

### 1 枚の地図

![2D 地図](https://raw.githubusercontent.com/NeoSolleil/claude-gaze/main/docs/images/map.png)

左に Web ドメインと検索クエリ、中央に主体（メインとサブエージェント）、右にディレクトリごとのファイルが並びます。主体ノードの 2 行目には最新の動作（`Read src/app.ts` など）が出て、各主体の最新 1 件だけ線を太く描きます。古い線は細くなるだけで消えません。

### 誰が何回触ったか

![ノードを選択したところ](https://raw.githubusercontent.com/NeoSolleil/claude-gaze/main/docs/images/select-node.png)

ファイルをクリックすると、どの主体が何回、どのツールで触ったかが右上に出ます。複数の主体が同じファイルを触るとノードがパイ状に塗り分けられます。上の画像では `orders.ts` をサブエージェントの Explore とメインの両方が読んでいます。

### 検索結果のどれを実際に読んだか

![検索結果を展開したところ](https://raw.githubusercontent.com/NeoSolleil/claude-gaze/main/docs/images/search-expand.png)

WebSearch のクエリは菱形で、クリックすると結果の URL がドメインごとの枠に展開されます。主体から線が引かれている丸は WebFetch で実際に読んだ URL、線の無い薄い丸は検索で出ただけのものです。

### 失敗した呼び出しも残す

![失敗した呼び出し](https://raw.githubusercontent.com/NeoSolleil/claude-gaze/main/docs/images/failed.png)

存在しないファイルを Read しようとした呼び出しは灰色の点線で残します。「見に行ったが無かった」も、どこを探していたかの情報だからです。同じディレクトリに点線が続いていたら、無いファイルを当てずっぽうで読もうとしています。

### サブエージェントだけに絞る

![主体タブで絞ったところ](https://raw.githubusercontent.com/NeoSolleil/claude-gaze/main/docs/images/agent-tab.png)

主体タブを押すと、イベント列はその主体だけになり、地図では他の主体が灰色になります。動機に書いた「サブエージェントが何を読んだか」はここで分かります。

### 主体別の帯

![主体別の表示](https://raw.githubusercontent.com/NeoSolleil/claude-gaze/main/docs/images/lanes.png)

表示を「2D 主体別」に切り替えると、主体ごとの帯に分かれます。同じファイルは帯ごとに出て、`◈2` のように共有している主体の数を示します。

### 枠を畳む・3D

![枠を畳んだところ](https://raw.githubusercontent.com/NeoSolleil/claude-gaze/main/docs/images/collapse.png)

ディレクトリやドメインの枠はクリックで畳めます。要素が増えて縦に長くなったときに使います。

![3D 表示](https://raw.githubusercontent.com/NeoSolleil/claude-gaze/main/docs/images/3d.png)

3D 表示も入れました。ディレクトリが灰色のハブになり、ファイルがぶら下がって塊になります。見せる用途向けで、ライブラリは 3D を選んだときだけ読み込みます。

このほか、`cat` や `grep` などシェル経由で触ったファイルも Bash のコマンド文字列から推定して破線で描きます。MCP ツールと Skill の呼び出しもノードになります。

## 3. 仕組み

```
Claude Code ──(Hooks 8 イベント)──▶ curl ──▶ Node サーバ 127.0.0.1:4820 ──(SSE)──▶ ブラウザ（Cytoscape）
```

Claude Code はツールを使うたびに、Hooks に登録したコマンドへ JSON を標準入力で渡します。`PostToolUse` なら `tool_name`、`tool_input`、`tool_response`、`agent_id` などが入っています。claude-gaze が Hooks に登録するのは、どのイベントでも同じこの 1 行です。

```sh
curl -s -m 1 -X POST http://127.0.0.1:4820/hook -H 'content-type: application/json' --data-binary @- >/dev/null 2>&1 || true
```

`async: true` で登録し、`-m 1` で 1 秒で諦めるので、サーバが動いていなくても Claude Code は止まりません。サーバは受け取った JSON をセッション別にメモリへ置き、Server-Sent Events でブラウザへ流します。ブラウザ側では純関数の `events.js` が Hooks の JSON を「ノードを足す」「線を引く」といったグラフ操作に変換し、Cytoscape（2D）か 3d-force-graph（3D）で描きます。

フレームワークは使わず素の ES Modules で、依存は Cytoscape と three 系だけです。サーバは Node.js 23.6 以降の TypeScript 直接実行で動かしています。データはメモリにしか持たないので、サーバを止めると消えます。

## 4. Hooks で分かったこと

作っている間に Hooks について確認できた事実です。自分で Hooks を使う人の参考になると思うので、ここが記事の本題です。計測は 2026-10-12、Claude Code 2.1.296、Linux で行いました。

1. **失敗したツール呼び出しは `PostToolUse` に来ません。** 公式ドキュメントどおりですが、存在しないファイルの Read を実機で試して、`PostToolUse` には何も届かないことを確認しました。失敗を拾うには `PostToolUseFailure` を別に購読する必要があります。
2. **サブエージェント内の呼び出しには `agent_id` と `agent_type` が付きます。** メインの呼び出しにはこれが無いので、有無で主体を分け、`agent_type`（サブエージェントの名前。この記事の例では Explore や general-purpose）を表示名に使えます。出現と終了は `SubagentStart` / `SubagentStop` で取れます。
3. **WebSearch の `tool_response` は構造化 JSON です。** `{ query, results: [{ content: [{ title, url }] }] }` の形で届きます。一方、セッションログの JSONL には `Links: [...]` というテキスト形式で残っています。同じ結果でも経路によって形が違うので、両方に対応しました。
4. **`async: true` の Hook は Claude Code の進行を止めません。** セッションログに記録された `tool_result` の時刻とサーバの受信時刻の差を測ると、Read・Bash で 4 ms、WebFetch で 5 ms でした。
5. **ツール呼び出しの過半は Bash です。** 手元の実セッションログ（3.2 MB）では Bash 45 回に対して Read は 14 回でした。ファイルアクセスを追うなら、Bash のコマンド文字列を読まないと大半を取りこぼします。
6. **Hooks の JSON 形式は内部仕様です。** 公式ドキュメントはセッションログの JSONL について「どのリリースでも壊れうる」と明言しています。Hooks の `tool_response` も同じ扱いにして、形式が変わって結果 URL を取り出せなくなってもクエリノードだけは残る、という壊れ方になるようにしました。

## 5. 設計で迷ったところ

**1 枚の地図か、主体別か。** 両方入れました。既定は 1 枚の地図で、パイ塗りで「同じファイルを誰と誰が見たか」が分かります。主体別の帯は「この主体は何を見たか」を追うときに使います。

**「いま」をどう見せるか。** 最初は時間窓のスライダを考えましたが捨てました。主体ごとの最新 1 件を太く描くだけにし、古いものは消さずに細くします。眺める用途なら、どこが動いているかが分かれば十分で、消えると「さっき何を見ていたか」が追えなくなるからです。

**Bash からの推定。** コマンド文字列をトークンに分け、cwd 基準で実在するファイルだけを拾います。過去のセッションログ 45 件の Bash で試すと 15 件でファイルを検出しました。未検出の 30 件の大半は `npm run dev` や `curl` のようにファイルを読まないコマンドです。誤検出は起こりえるので、推定による破線はチェック 1 つで隠せるようにしました。

**3D を入れるか。** 実用性より見せる用途です。入れる代わりに、ライブラリは 3D を選んだときだけ読み込みます。2D だけなら 0.4 MB、3D を選ぶと 1.3 MB が追加で読まれます。

## 6. 既存ツールとの違い

| | claude-gaze | mindwalk | 会話ログビューア系 |
|---|---|---|---|
| ライブ | ○（Hooks） | ×（再生専用） | △（ログ監視） |
| 対象 | ファイル・URL・検索・MCP・コマンド | ファイル | 会話ログ |
| 主体の同時表示 | ○ | × | × |
| 触っていない場所の俯瞰 | × | ○ | × |

mindwalk はプロジェクト全体を描いた上で AI の動きを再生する作りで、俯瞰と完成度では上です。claude-gaze は「触ったものだけ」を描く設計で、プロジェクト全体の地図ではありません。作業中に横に置いて眺めるなら claude-gaze、終わったあとに全体像の中で振り返るなら mindwalk、という住み分けだと思っています。

## 7. 限界

- 色で区別できる主体は 6 体までで、7 体目からは色が循環します
- Bash からの推定は文字列ベースなので、取りこぼしも誤検出もあります
- データはメモリのみで、サーバを再起動すると消えます。動機に書いた「終わったあとに振り返る」は、サーバを止めるまでの間だけできます
- Hooks の JSON 形式が変わると、結果 URL の抽出などが動かなくなる部分があります
- `Agent` ツールの呼び出し自体は行に出ません。サブエージェントの起動は `SubagentStart` で描きます
- Windows は未検証です。Hooks のコマンドが `sh` 構文なので WSL を想定しています

## 8. 導入

要件は Node.js 23.6 以上、`curl`、Claude Code です。

```sh
git clone https://github.com/NeoSolleil/claude-gaze.git && cd claude-gaze
npm install
npm run hooks:install   # ~/.claude/settings.json に Hooks を追加（元のファイルは settings.json.bak に残す）
npm start               # http://127.0.0.1:4820/ を開く
```

このあと **新しく** Claude Code を起動して作業させると、ブラウザの左にセッションが現れます。Hooks は起動時に読まれるので、すでに開いているセッションには効きません。やめるときは `npm run hooks:remove` で、claude-gaze 由来の Hooks だけを外します。

設定ファイルを自分で管理したい人は `npm run hooks:print` で追記する JSON を表示できます。プロジェクト単位で入れる `--project`、別ポートで受ける `--port` もあります。

## 9. まとめと今後

Hooks だけで「いま何を見ているか」は十分に取れました。ターミナルを遡らなくても、作業が終わった時点の地図を見れば、どのディレクトリを回り、何を検索し、サブエージェントが裏で何を読んだかが分かります。

今後は、`claude plugin install` で入れられるようにするプラグイン化と、過去セッションの JSONL を読み込んで再生する機能を考えています。

このツール自体も Claude Code と一緒に作りました。Hooks の挙動を実機で確かめながら進めたので、第 4 節の内容はそのときの記録でもあります。

リポジトリ: https://github.com/NeoSolleil/claude-gaze
