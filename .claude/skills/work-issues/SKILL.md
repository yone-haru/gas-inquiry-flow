---
name: work-issues
description: open な GitHub Issue を順に確認し、実行が必要なものだけ計画→実装→検証→コミット→push→Issueへの報告までを自律的にこなす。CLAUDE.md の「GitHub Issue運用」「エージェントの動き方」に従う。
disable-model-invocation: true
argument-hint: "[任意の絞り込み条件]"
allowed-tools: Bash, Read, Grep, Glob, Agent
---

open な GitHub Issue をバッチで処理してください。絞り込み条件（任意）: $ARGUMENTS

CLAUDE.md の「GitHub Issue運用」「エージェントの動き方」「検証ループ」を厳守すること。特に: 途中で確認を求めない・エラーで止まらない・証拠なしに成功を主張しない。1件のIssueで詰まっても他のIssueの処理は止めない。

## 手順

### 1. 対象Issueの一覧化

!`gh issue list --state open --json number,title,body,labels,url`

- `blocked` ラベルが付いているIssueは今回スキップする（過去に試行上限まで失敗したもの）。
- 番号の小さい順（古い順）に処理する。

### 2. 各Issueについてループ

Issueごとに以下を行う。

1. **要否判断**: タイトル・本文を読み、コード変更が必要な実行対象かを判断する。質問・議論・すでに解決済みなど実行不要なものはスキップし、次のIssueへ進む（コメントもクローズもしない）。
2. **計画**: 複数ファイルにまたがる変更なら `.claude/plan.md` にゴール/変更ファイル/手順/完了条件を書く。仮定が必要なら「仮定:」と明記する。
3. **実装**: スコープ外の大規模リファクタはしない。作業中に別の問題を見つけたら `gh issue create` で新規Issue化するだけに留め、今のIssueの作業は続ける。
4. **検証**: `verifier` サブエージェント（Agent tool）に検証を依頼する。渡す情報はIssueの内容と完了条件。FAILなら [must]/[should] を修正して再検証、PASSになるまで繰り返す。
5. **試行上限**: 明らかに前進していない場合（同じ指摘の繰り返し・根本原因が特定できない等）、`gh issue edit <番号> --add-label blocked` を付け、`gh issue comment <番号>` に原因と試したことを書いて、このIssueは打ち切り次へ進む。
6. **コミット**: `【test】`・`【lint】` が通っている前提で、論理的な単位でコミットする（`.claude/skills/commit/SKILL.md` と同じ基準）。秘密情報が含まれていないか必ず確認する。
7. **push**: `git push` する。
8. **報告してクローズ**: `gh issue comment <番号>` に何をしたか・検証結果（コマンドと出力の要点）を書き、`gh issue close <番号>` でクローズする。
9. 知見・進捗は `.claude/loop-result.md` に追記する。プロジェクト固有の罠を見つけたら CLAUDE.md の「ハマりどころ」に追記する。

### 3. 完了報告

全Issue処理後、以下を一覧で報告する。
- クローズしたIssue（番号・タイトル）
- `blocked` にしたIssue（番号・理由）
- スキップしたIssue（番号・理由）
