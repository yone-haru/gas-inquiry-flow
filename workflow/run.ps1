#!/usr/bin/env pwsh
# run.ps1 — Antigravity + Claude Code ワークフロー オーケストレーター
# 使い方: .\workflow\run.ps1 [-ProjectDir "C:\path\to\project"] [-MaxReviewCycles 3]

param(
    [string]$ProjectDir = (Get-Location).Path,
    [int]$MaxReviewCycles = 5,
    [switch]$SkipReview  # レビューをスキップして実行のみ行う
)

$WorkflowDir = $PSScriptRoot
$TasksFile   = Join-Path $WorkflowDir "TASKS.md"
$ReviewFile  = Join-Path $WorkflowDir "REVIEW.md"

# ── カラー出力ヘルパー ──────────────────────────────
function Write-Step  { param($msg) Write-Host "`n🔷 $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "  ✅ $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  ⚠️  $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  ❌ $msg" -ForegroundColor Red }
function Write-Info  { param($msg) Write-Host "  ℹ️  $msg" -ForegroundColor Gray }

# ── Claude Code が使えるか確認 ──────────────────────
function Test-ClaudeInstalled {
    try { $null = & claude --version 2>&1; return $true }
    catch { return $false }
}

# ── TASKS.md からタスクを抽出 ───────────────────────
function Get-Tasks {
    $content = Get-Content $TasksFile -Raw -Encoding UTF8
    $tasks = @()
    
    # ### TASK-XXX [model] のブロックを抽出
    $pattern = '### (TASK-\d+)\s*\[(\w+)\]\s*\n([\s\S]*?)(?=### TASK-|\z)'
    $matches = [regex]::Matches($content, $pattern)
    
    foreach ($m in $matches) {
        $taskId  = $m.Groups[1].Value
        $model   = $m.Groups[2].Value
        $body    = $m.Groups[3].Value.Trim()
        
        # ステータス行を取得
        $statusMatch = [regex]::Match($body, 'ステータス:\s*\[(.)\]')
        $status = if ($statusMatch.Success) { $statusMatch.Groups[1].Value } else { ' ' }
        
        # 目的を取得
        $purposeMatch = [regex]::Match($body, '\*\*目的\*\*:\s*(.+)')
        $purpose = if ($purposeMatch.Success) { $purposeMatch.Groups[1].Value.Trim() } else { "（目的未記載）" }
        
        $tasks += @{
            Id      = $taskId
            Model   = $model
            Body    = $body
            Status  = $status
            Purpose = $purpose
        }
    }
    return $tasks
}

# ── タスクを Claude Code で実行 ──────────────────────
function Invoke-Task {
    param($Task, $ProjectDir)
    
    $model = switch ($Task.Model.ToLower()) {
        "opus"   { "claude-opus-5" }
        "sonnet" { "claude-sonnet-5" }
        "haiku"  { "claude-haiku-4-5-20251001" }
        default  { "claude-sonnet-5" }
    }

    $prompt = @"
あなたはコード実装の専門家です。以下のタスクを実行してください。

プロジェクトディレクトリ: $ProjectDir

$($Task.Body)

このタスクは workflow/TASKS.md で管理されています。CLAUDE.md の「GitHub Issue運用」にある
「コード変更依頼を受けたら gh issue create する」ルールは、このタスクには適用しないでください
(TASKS.md 自体が進捗管理台帳のため、Issue の二重作成になります)。

実装が完了したら、変更したファイルの一覧と変更内容の要約を出力してください。
"@

    Write-Info "モデル: $model"
    Write-Info "タスク: $($Task.Purpose)"

    $output = & claude --print --permission-mode acceptEdits --model $model $prompt 2>&1
    return $output
}

# ── REVIEW.md のステータスを確認 ───────────────────
function Get-ReviewStatus {
    if (-not (Test-Path $ReviewFile)) { return "NEEDS_REVISION" }
    $content = Get-Content $ReviewFile -Raw -Encoding UTF8
    if ($content -match '\*\*STATUS\*\*:\s*(APPROVED|NEEDS_REVISION)') {
        return $Matches[1]
    }
    return "NEEDS_REVISION"
}

# ── REVIEW.md から修正指示を取得 ───────────────────
function Get-RevisionInstructions {
    $content = Get-Content $ReviewFile -Raw -Encoding UTF8
    $match = [regex]::Match($content, '```\s*\n([\s\S]*?)\n```', 'Multiline')
    if ($match.Success) { return $match.Groups[1].Value.Trim() }
    return ""
}

# ── 修正ループ実行 ──────────────────────────────────
function Invoke-Revision {
    param($Instructions, $ProjectDir)
    
    $prompt = @"
あなたはコード修正の専門家です。以下のレビューフィードバックに基づいてコードを修正してください。

プロジェクトディレクトリ: $ProjectDir

【修正指示】
$Instructions

このタスクは workflow/TASKS.md・workflow/REVIEW.md で管理されています。CLAUDE.md の
「GitHub Issue運用」にある「コード変更依頼を受けたら gh issue create する」ルールは、
このタスクには適用しないでください(Issue の二重作成になります)。

修正が完了したら、変更内容の要約を出力してください。
"@

    $output = & claude --print --permission-mode acceptEdits --model "claude-sonnet-5" $prompt 2>&1
    return $output
}

# ── TASKS.md のステータスを更新 ────────────────────
function Update-TaskStatus {
    param($TaskId, $NewStatus)
    $content = Get-Content $TasksFile -Raw -Encoding UTF8
    $content = $content -replace "($TaskId\s*\[.*?\][\s\S]*?ステータス:\s*)\[.\]", "`$1[$NewStatus]"
    Set-Content $TasksFile -Value $content -Encoding UTF8
}

# ══════════════════════════════════════════════════
#  メイン処理
# ══════════════════════════════════════════════════

Write-Host "`n╔══════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║   Antigravity + Claude Code Workflow     ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════╝`n" -ForegroundColor Magenta

# 事前チェック
if (-not (Test-ClaudeInstalled)) {
    Write-Fail "Claude Code がインストールされていません。'npm install -g @anthropic-ai/claude-code' でインストールしてください。"
    exit 1
}
if (-not (Test-Path $TasksFile)) {
    Write-Fail "TASKS.md が見つかりません: $TasksFile"
    exit 1
}

Write-OK "Claude Code: インストール済み"
Write-Warn "--permission-mode acceptEdits で実行します（ファイル編集は自動許可、Bash は settings.json の allow/deny に従います）"
Write-OK "プロジェクトディレクトリ: $ProjectDir"
Write-OK "最大レビューサイクル: $MaxReviewCycles"

# タスク読み込み
Write-Step "TASKS.md を読み込み中..."
$tasks = Get-Tasks

if ($tasks.Count -eq 0) {
    Write-Warn "実行可能なタスクが TASKS.md に見つかりませんでした。TASKS.md を確認してください。"
    exit 0
}

$pendingTasks = $tasks | Where-Object { $_.Status -eq ' ' -or $_.Status -eq '/' }
Write-OK "$($pendingTasks.Count) 件のタスクを実行します"

# ── フェーズ1: タスク実行 ──
Write-Step "フェーズ1: Claude Code でタスクを実行中..."

foreach ($task in $pendingTasks) {
    Write-Host "`n  ▶ $($task.Id): $($task.Purpose)" -ForegroundColor White
    Update-TaskStatus -TaskId $task.Id -NewStatus "/"
    
    $output = Invoke-Task -Task $task -ProjectDir $ProjectDir
    
    Write-Host "`n  【出力】" -ForegroundColor DarkGray
    $output | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    
    Update-TaskStatus -TaskId $task.Id -NewStatus "x"
    Write-OK "$($task.Id) 完了"
}

if ($SkipReview) {
    Write-OK "全タスク完了（レビュースキップ）"
    exit 0
}

# ── フェーズ2: レビューループ ──
Write-Step "フェーズ2: Antigravity によるコードレビュー"

for ($cycle = 1; $cycle -le $MaxReviewCycles; $cycle++) {
    Write-Host "`n  📋 レビューサイクル $cycle / $MaxReviewCycles" -ForegroundColor Yellow
    
    # REVIEW.md をリセット
    $reviewTemplate = Get-Content $ReviewFile -Raw -Encoding UTF8
    $reviewTemplate = $reviewTemplate -replace '\*\*STATUS\*\*:.*', "**STATUS**: NEEDS_REVISION"
    Set-Content $ReviewFile -Value $reviewTemplate -Encoding UTF8
    
    Write-Host @"

  ┌─────────────────────────────────────────────┐
  │  Antigravity でコードをレビューしてください  │
  │                                             │
  │  1. 変更されたファイルを確認する             │
  │  2. REVIEW.md にレビュー結果を書き込む      │
  │     - STATUS: APPROVED または NEEDS_REVISION │
  │     - 修正指示はコードブロック内に書く      │
  │  3. REVIEW.md を保存して Enter を押す       │
  └─────────────────────────────────────────────┘
"@ -ForegroundColor Cyan
    
    Write-Host "  REVIEW.md の場所: $ReviewFile" -ForegroundColor Gray
    Read-Host "`n  レビュー完了後、Enter を押してください"
    
    $status = Get-ReviewStatus
    
    if ($status -eq "APPROVED") {
        Write-OK "レビュー承認！ワークフロー完了 🎉"
        break
    }
    
    if ($cycle -eq $MaxReviewCycles) {
        Write-Warn "最大レビューサイクル数に達しました。手動で確認してください。"
        break
    }
    
    # 修正実行
    Write-Step "修正指示を Claude Code に送信中..."
    $instructions = Get-RevisionInstructions
    
    if ([string]::IsNullOrWhiteSpace($instructions)) {
        Write-Warn "REVIEW.md に修正指示が見つかりません。ファイルを確認してください。"
        continue
    }
    
    $revOutput = Invoke-Revision -Instructions $instructions -ProjectDir $ProjectDir
    Write-Host "`n  【修正出力】" -ForegroundColor DarkGray
    $revOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    Write-OK "修正完了。再レビューへ..."
}

Write-Host "`n╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║            ワークフロー終了              ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝`n" -ForegroundColor Green
