# Antigravity + Claude Code ワークフロー 使い方ガイド

## 概要

このワークフローは3つのフェーズで動きます：

```
① Antigravity（司令塔）がタスクを計画 → TASKS.md に書き出す
② Claude Code（実行部隊）がタスクを実行 → run.ps1 が自動で動かす
③ Antigravity（レビュアー）がコードを精査 → REVIEW.md に結果を書く
④ 問題があれば Claude Code が修正 → ③ に戻る
```

---

## このテンプレートとの関係

このテンプレートには2つの運用モードがある。

- **Claude Code 単体の自律ループ**: `.claude/skills/feature`（`/feature`）や `.claude/skills/work-issues`（`/work-issues`）で、Claude Code が対話セッション内で計画→実装→verifierサブエージェントによる検証→コミットまで完走する。外部ツール不要。
- **Antigravity 連携ワークフロー（このフォルダ）**: Antigravity（別AIツール）が司令塔・レビュアーとなり、`run.ps1` が `claude --print` でClaude Codeをヘッドレス実行する。複数タスクをバッチで流したい・外部レビュアーを挟みたいときに使う。

両方とも `.claude/CLAUDE.md` と `.claude/settings.json` の権限モデル（allow/deny）を共有する。`run.ps1` は `--permission-mode acceptEdits` で動くため、ファイル編集は自動許可されるが、Bash コマンドは `settings.json` の `permissions.allow` に無いものは非対話実行では拒否される。**`settings.json` の `Bash(【test】:*)` 等のプレースホルダを、`CLAUDE.md` の「コマンド」セクションと同じ実コマンドに書き換えておくこと**（例: `Bash(npm test:*)`）。書き換えないと `run.ps1` 経由のタスクは検証コマンドを実行できない。

## セットアップ

`workflow/` はこのテンプレートに同梱済みなので、コピー作業は不要。プロジェクトディレクトリで直接実行する。

```powershell
cd C:\path\to\your-project
.\workflow\run.ps1
```

`.mcp.json`（プロジェクトルート）の `antigravity` サーバーの `args` パスは各自の環境に合わせて書き換えること。

---

## 使い方（ステップバイステップ）

### Step 1: Antigravity に計画を立てさせる

Antigravity に以下のように話しかける：

```
「〇〇機能を実装したい。workflow/TASKS.md にタスクを書き出して」
```

Antigravity が `TASKS.md` を埋めてくれます。

---

### Step 2: ワークフローを起動する

```powershell
# 基本的な使い方
.\workflow\run.ps1 -ProjectDir "C:\path\to\project"

# レビューなしで実行のみ
.\workflow\run.ps1 -SkipReview

# レビューサイクルの上限を変更（デフォルト: 5）
.\workflow\run.ps1 -MaxReviewCycles 3
```

スクリプトが Claude Code を自動で呼び出してタスクを実行します。

---

### Step 3: Antigravity にコードをレビューさせる

実行が終わると、スクリプトが一時停止します。

その間に Antigravity に：

```
「変更されたファイルを読んでコードレビューして。
結果を workflow/REVIEW.md に書き出して。
問題なければ STATUS: APPROVED、あれば NEEDS_REVISION で」
```

と話しかけてレビューを依頼します。

---

### Step 4: Enter を押して続行

`REVIEW.md` が書き終わったら Enter を押すと：
- **APPROVED** → ワークフロー完了 🎉
- **NEEDS_REVISION** → 修正指示を Claude Code に渡して自動修正 → Step 3 に戻る

---

## TASKS.md の書き方

```markdown
### TASK-001 [sonnet]
**目的**: JWT リフレッシュトークンを実装する
**対象ファイル**: src/auth.ts, src/types.ts
**詳細**:
- refreshToken 関数を追加
- 有効期限チェックを含める
- エラーハンドリングも追加
**完了条件**: TypeScript のコンパイルが通ること
ステータス: [ ]

### TASK-002 [opus]
**目的**: 複雑なデータ変換ロジックを最適化する
...
ステータス: [ ]
```

### モデル指定

| 指定 | 使用モデル | 用途 |
|------|-----------|------|
| `[sonnet]` | Claude Sonnet | 通常の実装（デフォルト） |
| `[opus]` | Claude Opus | 複雑な設計・難しいロジック |
| `[haiku]` | Claude Haiku | 単純な修正・フォーマット |

---

## Antigravity へのプロンプト例

### 計画フェーズ
```
「src/payment.ts に Stripe 決済を追加したい。
必要なタスクを分析して workflow/TASKS.md に書き出して。
複雑な部分は opus、単純な実装は sonnet を指定して」
```

### レビューフェーズ
```
「src/payment.ts と src/types.ts の変更をレビューして。
セキュリティ、エラーハンドリング、型安全性を重点的に確認して。
結果を workflow/REVIEW.md に書いて」
```

---

## ファイル構成

```
.mcp.json             # プロジェクトルート。antigravity MCP サーバー定義
workflow/
├── run.ps1           # オーケストレーター（これを実行する）
├── TASKS.md          # タスクリスト（Antigravity が書く）
├── REVIEW.md         # レビュー結果（Antigravity が書く）
└── WORKFLOW_GUIDE.md # このガイド
```

---

## トラブルシューティング

### Claude Code が見つからないエラー
```powershell
npm install -g @anthropic-ai/claude-code
```

### スクリプトが実行できない
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### タスクが読み込めない
- `TASKS.md` の `### TASK-001 [sonnet]` の書式を確認
- `ステータス: [ ]` が含まれているか確認
