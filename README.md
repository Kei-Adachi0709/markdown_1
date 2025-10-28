# Local Markdown Executor

Electron + TypeScript 製のローカル Markdown エディタです。コードブロックに実行ツールバーを追加し、実行結果を原文へ自動で挿入します。外部ネットワークへアクセスせず、ローカル環境のみで動作します。

## 特長
- Markdown エディタ + プレビューの 2 ペイン UI
- 各コードブロックに [Run ▶] / [Copy] ボタンと実行中スピナーを表示
- 実行結果を `<!-- exec-output:start id=... -->` コメントで囲み、再実行時は置換
- Python / JavaScript / bash(sh) をローカルで実行（bash は `/bin/bash` のみ）
- タイムアウト (10 秒)・未サポート・エラーを明示し、標準出力/標準エラーをそのまま貼り付け
- `markdown-it` は HTML 無効化設定で XSS を抑止

## セットアップ
1. 依存関係をインストールします。
   ```cmd
   npm install
   ```
2. 開発モードで起動します。
   ```cmd
   npm run dev
   ```
   - TypeScript を esbuild がウォッチし、静的アセットも自動コピーされます。
   - Electron は main/preload の再ビルド時に再起動します。
3. プロダクションビルドを作成する場合は以下を実行してください。
   ```cmd
   npm run build
   npm start
   ```

## スクリプト
| コマンド | 説明 |
| --- | --- |
| `npm run dev` | ウォッチ付きビルド + Electron 起動|
| `npm run build` | 単発ビルド（dist/）|
| `npm start` | ビルド後のアプリを Electron で起動|
| `npm run lint` | ESLint (strict + Prettier 連携) |
| `npm run clean` | dist ディレクトリの削除 |

## 実行仕様
- IPC チャネル: `execute-code`
- タイムアウト: 10,000 ms。タイムアウト時はプロセスツリーを強制終了
- Python: `python3` → `python` の順で検索、テンポラリ `.py` を `execFile`
- JavaScript: `process.execPath` (Node.js) でテンポラリ `.js`
- bash/sh: `/bin/bash` が存在する場合のみ実行、それ以外は未サポート通知
- 未サポート言語・ランタイム不在・エラー時は `status` と `message` をそのまま出力
- 実行結果は Markdown 原文のコードブロック直後に以下の形式で挿入/置換します。
   ````
   ```text
   <!-- exec-output:start id=<SHA-1> -->
   ```text
   exitCode: <code> status: <status>
   ...stdout/stderr...
   ```
   <!-- exec-output:end -->
   ```
   ````
  フェンス文字数は出力に含まれるバッククォート数 + 1 で自動調整します。

## フォルダ構成
```
assets/               ... 共通スタイル
scripts/              ... ビルド・開発スクリプト
src/common/           ... IPC 共有型・crypto
src/main/             ... Electron main & preload
src/renderer/         ... UI ロジック
```

## テスト
- 重要ロジック（実行出力の挿入/置換）は `src/renderer/execOutput.ts` に集約しています。
- 必要に応じて `ts-node` や `vitest` などを追加し、関数単位のユニットテストを作成してください。

## 制約・メモ
- 外部ネットワークへのアクセスは行いません。
- bash 実行は UNIX 系 OS の `/bin/bash` のみ対応。Windows の場合は未サポートメッセージが表示されます。
- 実行中プロセスのキャンセル UI は未実装（README TODO）。今後追加する場合は IPC で kill を呼び出す仕組みを検討してください。
- Markdown エディタは textarea ベースです。高度なエディタが必要な場合は Monaco などを同梱し、外部 CDN へ依存しない形で組み込んでください。

## TODO
- [ ] 実行中プロセスの Cancel ボタン追加
- [ ] ユニットテストの拡充（特に execOutput 周辺）
- [ ] 複数ファイル管理・保存機能
```
