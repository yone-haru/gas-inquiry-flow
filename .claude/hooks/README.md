# hooks レシピ集

hooks は「Claude にお願いする」のではなく**ハーネスが機械的に実行する**自動化。
「編集したら必ず lint」のような決定的な動作は CLAUDE.md に書くより hooks にする方が確実。

使いたいレシピを `.claude/settings.json` の `"hooks"` キーにコピペして、
コマンドをプロジェクトに合わせて書き換える。フックスクリプト本体はこのディレクトリに置く。

> 参考: https://code.claude.com/docs/en/hooks

## 1. ファイル編集後に自動で Lint / フォーマット

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "【npx prettier --write $CLAUDE_FILE_PATHS】",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

## 2. 危険な Bash コマンドをブロック(PreToolUse)

settings.json の `permissions.deny` で足りない複雑な条件のとき用。
終了コード 2 でブロックされ、stderr が Claude へのメッセージになる。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/block-dangerous.js\""
          }
        ]
      }
    ]
  }
}
```

`block-dangerous.js` の例(stdin に JSON でツール入力が来る):

```js
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  const input = JSON.parse(raw);
  const cmd = input.tool_input?.command ?? "";
  if (/git\s+reset\s+--hard|drop\s+table/i.test(cmd)) {
    console.error("破壊的コマンドはブロックされました: " + cmd);
    process.exit(2); // 2 = ブロック
  }
  process.exit(0); // 0 = 許可
});
```

## 3. セッション開始時にコンテキストを注入(SessionStart)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "git log --oneline -5"
          }
        ]
      }
    ]
  }
}
```

## 4. Claude の応答完了時に通知(Stop)

長時間タスクを放置するとき用(Windows の例):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell -c \"[console]::beep(800,300)\""
          }
        ]
      }
    ]
  }
}
```

## 注意

- hooks はフルの shell 権限で動く。コマンドの中身は自分で責任を持つこと。
- `timeout`(秒)を付けないと重いコマンドでターンが遅くなる。
- 個人的な hooks は `settings.local.json` に、チーム共有は `settings.json` に書く。
