# claude-linear-sync

Claude CodeのHooks + Daemonのハイブリッド方式で、セッション内容をLinearに自動同期するツール。

## 特徴

- **非ブロッキング**: Hookは軽量なキュー書き込みのみ（< 10ms）
- **信頼性**: キューで永続化、失敗時リトライ可能
- **Fuzzy Matching**: ブランチ名にIssue IDがなくても自動マッチング
- **Linear GraphQL API**: シンプルなAPIキー認証でLinear連携
- **自動Issue作成**: マッチするIssueがない場合は自動で新規作成
- **自動Assign**: 指定ユーザーに自動アサイン
- **自動Label**: ディレクトリパスから自動ラベル付け

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                               │
│                                                                  │
│  [stop hook] ──→ Queue Write (< 10ms, non-blocking)              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Queue File (JSONL)                            │
│           ~/.local/share/claude-linear-sync/queue.jsonl          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ (chokidar watch)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Daemon                                   │
│                                                                  │
│  1. Read transcript  ──→  Extract content                        │
│  2. Find/Create issue ──→  Branch pattern / Auto-create          │
│  3. Summarize        ──→  claude -p                              │
│  4. Post to Linear   ──→  Linear GraphQL API                     │
└─────────────────────────────────────────────────────────────────┘
```

## セットアップ

### 1. Linear APIキーの取得

1. [Linear API Settings](https://linear.app/settings/api) にアクセス
2. 「Create Key」で新しいAPIキーを作成
3. 環境変数に設定:

```bash
# ~/.bashrc or ~/.zshrc に追加
export LINEAR_API_KEY=lin_api_xxxxxx
```

### 2. Hooksの設定

プロジェクトの`.claude/settings.json`:

```json
{
  "hooks": {
    "stop": [
      {
        "command": "npx tsx .claude/hooks/stop.ts",
        "timeout": 5000
      }
    ],
    "post_tool_use": [
      {
        "matcher": "Bash",
        "command": "npx tsx .claude/hooks/post-tool-use.ts",
        "timeout": 5000
      }
    ]
  }
}
```

### 3. 依存関係のインストール

```bash
npm install
npm run build
```

### 4. Daemon起動

```bash
# グローバルインストール
npm link

# Daemon起動
claude-linear-sync start

# ステータス確認
claude-linear-sync status

# Daemon停止
claude-linear-sync stop
```

## CLI Commands

```bash
# Daemon管理
claude-linear-sync start      # Daemon起動
claude-linear-sync stop       # Daemon停止
claude-linear-sync status     # ステータス確認

# キュー管理
claude-linear-sync queue list          # キュー一覧
claude-linear-sync queue retry <id>    # リトライ
claude-linear-sync queue clear         # クリア
```

## 処理フロー

### Session Stop → Linear Sync

```
1. [Hook] Claude応答完了
   └─→ キューに session_stop を追加 (< 10ms)

2. [Daemon] バックグラウンド処理
   ├─→ transcript読み込み
   ├─→ ノイズ除去
   ├─→ Issue検出/作成
   │   ├─→ ブランチパターンマッチ
   │   └─→ なければ新規Issue作成
   ├─→ Issue設定
   │   ├─→ Assignee設定 (hibiki.tatsuno)
   │   ├─→ Status更新 (In Progress)
   │   └─→ Label追加 (ディレクトリベース)
   ├─→ 要約生成 (claude -p)
   └─→ Linearにコメント (GraphQL API)
```

### PR Created → Linear Link

```
1. [Hook] gh pr create 検知
   └─→ キューに pr_created を追加

2. [Daemon] バックグラウンド処理
   └─→ LinearにPRリンク追加
```

## Issue検出方法

### 方法1: ブランチ名パターン

```
feature/ENG-123-add-login  → ENG-123
fix/PROJ-456-bug-fix       → PROJ-456
```

### 方法2: Fuzzy Matching

1. セッション内容からキーワード抽出
2. Linear MCP経由で候補Issue検索
3. LLM(`claude -p`)で関連性評価
4. 信頼度 ≥ 0.7 で採用

## 設定ファイル

```yaml
# ~/.config/claude-linear-sync/config.yaml

queue:
  path: ~/.local/share/claude-linear-sync/queue.jsonl
  max_retries: 3

linear:
  api_key: ${LINEAR_API_KEY}     # 環境変数から取得
  default_assignee: "hibiki.tatsuno"
  branch_pattern: "([A-Z]+-\\d+)"

labeling:
  enabled: true
  patterns:
    frontend: [frontend, web, react, vue, next]
    backend: [backend, api, server, node]
    mobile: [mobile, ios, android, react-native]
    infrastructure: [infra, devops, terraform, k8s]

summarization:
  enabled: true
  max_length: 500

logging:
  level: info
```

## ディレクトリ構成

```
claude-linear-sync/
├── .claude/
│   ├── settings.json           # Hooks設定
│   └── hooks/
│       ├── stop.ts             # Session stop → Queue
│       ├── post-tool-use.ts    # PR検知 → Queue
│       └── lib/
│           └── queue.ts        # Queue writer
│
├── src/
│   ├── cli.ts                  # CLI commands
│   ├── daemon/
│   │   ├── processor.ts        # Queue processor
│   │   └── manager.ts          # Daemon lifecycle
│   ├── queue/
│   │   └── types.ts            # Queue types
│   ├── linear/
│   │   └── client.ts           # Linear GraphQL API client
│   ├── matching/
│   │   └── ...                 # Issue matching
│   └── transcript/
│       └── ...                 # Transcript processing
│
└── package.json
```

## 方式比較

| 観点 | Pure Hooks | Pure Daemon | Hybrid (本ツール) |
|------|-----------|-------------|-------------------|
| 遅延 | 高 | なし | なし |
| 精度 | 高 | 中 | 高 |
| 信頼性 | 低 | 中 | 高 |
| リソース | オンデマンド | 常駐 | 常駐 |

## 参考

- [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
- [Zenn: Claude × Obsidian](https://zenn.dev/pepabo/articles/ffb79b5279f6ee)

## ライセンス

MIT
