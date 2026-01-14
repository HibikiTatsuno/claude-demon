# l-daemon

Claude Codeのセッションログを監視し、Linearのタスク管理と自動連携するデーモン。

## 機能

- Claude Codeセッションログのリアルタイム監視
- gitブランチ名からLinear Issue IDを自動抽出
- セッションログをLinearのコメントとして追加
- PRが作成されたらLinear Issueにリンクを追加
- **自動Issue検出**: ブランチ名にIssue IDがなくても、セッション内容からLinear Issueを自動マッチング

## 必要条件

- Node.js 18以上
- [Claude Code](https://claude.ai/claude-code)
- Linear MCP (SSE接続)

## インストール

```bash
cd ~/Desktop/claude-task-daemon
npm install
npm run build
npm link
```

## 設定

### 1. Linear MCPの設定

`~/.claude.json`にLinear MCPサーバーを追加:

```json
{
  "mcpServers": {
    "linear-server": {
      "type": "sse",
      "url": "https://mcp.linear.app/sse"
    }
  }
}
```

初回接続時にLinearの認証が求められます。Claude Codeで`/mcp`コマンドを実行して認証を完了してください。

### 2. 設定ファイル (オプション)

初回起動時に`~/.config/l-daemon/config.yaml`が自動生成されます:

```yaml
# Linear integration uses MCP (no API key required)

watch:
  claude_projects_path: ~/.claude/projects/

branch_pattern: "([A-Z]+-\\d+)"

logging:
  level: info

matching:
  enabled: true
  confidence_threshold: 0.7
  keyword_weight: 0.6
  semantic_weight: 0.4
  enable_semantic: true
  max_api_calls_per_minute: 30
```

## 使い方

### デーモンの起動

```bash
l-daemon start
```

フォアグラウンドで実行する場合:

```bash
l-daemon start -f
```

### デーモンの停止

```bash
l-daemon stop
```

### ステータス確認

```bash
l-daemon status
```

## Issue検出の仕組み

### 方法1: ブランチ名パターン

ブランチ名にLinear Issue IDが含まれている場合、自動で検出:

```
feature/ENG-123-add-login    → ENG-123
fix/PROJ-456-bug-fix         → PROJ-456
chore/ABC-789-update-deps    → ABC-789
```

### 方法2: 自動マッチング (Fuzzy Matching)

ブランチ名にIssue IDがない場合、セッション内容から自動でIssueを検出:

1. **キーワード検索**: ユーザーリクエストからキーワードを抽出し、Linear MCP経由で検索
2. **セマンティック検索**: `claude -p`を使用して候補Issueの関連性をAIで評価
3. **信頼度判定**: スコアが閾値(デフォルト0.7)以上なら採用

```
セッション内容                    → Linear Issue検索
────────────────────────────────────────────────────
"認証バグを修正して"              → キーワード検索 (MCP経由)
                                ↓
候補Issue一覧                    → セマンティック検索 (claude -p)
                                ↓
信頼度スコア                     → 閾値以上なら採用
```

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                      l-daemon                               │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │ File Watcher│───▶│ Log Parser  │───▶│ Issue Matcher   │ │
│  │  (chokidar) │    │   (JSONL)   │    │ (Fuzzy Search)  │ │
│  └─────────────┘    └─────────────┘    └────────┬────────┘ │
│                                                  │          │
└──────────────────────────────────────────────────┼──────────┘
                                                   │
                                         ┌─────────▼─────────┐
                                         │    claude -p      │
                                         │  (MCP経由でLinear)│
                                         └─────────┬─────────┘
                                                   │
                                         ┌─────────▼─────────┐
                                         │   Linear MCP      │
                                         │ (mcp.linear.app)  │
                                         └───────────────────┘
```

## 設定オプション

| 設定 | 説明 | デフォルト |
|------|------|-----------|
| `matching.enabled` | 自動マッチング機能を有効化 | `true` |
| `matching.confidence_threshold` | マッチング採用の閾値 (0.0-1.0) | `0.7` |
| `matching.keyword_weight` | キーワード検索の重み | `0.6` |
| `matching.semantic_weight` | セマンティック検索の重み | `0.4` |
| `matching.enable_semantic` | セマンティック検索を有効化 | `true` |
| `matching.max_api_calls_per_minute` | API呼び出しレート制限 | `30` |

## Claude Code Skill

`/linear-issue`スキルでLinear Issueを検索できます。

```
/linear-issue ENG-123
/linear-issue "search query"
```

## トラブルシューティング

### デーモンが起動しない

```bash
# PIDファイルを確認
cat /tmp/l-daemon.pid

# プロセスを強制終了
kill $(cat /tmp/l-daemon.pid)
rm /tmp/l-daemon.pid
```

### Linear MCPに接続できない

1. Claude Codeで`/mcp`を実行してMCP接続を確認
2. `~/.claude.json`にLinear MCPの設定があるか確認
3. Linear MCPの認証が完了しているか確認

### セマンティック検索が動作しない

- `claude`コマンドが使用可能か確認: `claude --version`
- Claude Codeにログインしているか確認: `claude`

## 開発

```bash
# 開発モードで実行
npm run dev start -f

# ビルド
npm run build
```

## ライセンス

MIT
