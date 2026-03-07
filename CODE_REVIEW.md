# Code Review (Piri-Discord-Bot)

## 対象
- `index.js`
- `monitor.py`
- `package.json`

## 総評
機能が豊富で、Discord Bot と API サーバーを1つのエントリポイントで実装できています。一方で、**安全性（コマンドインジェクション）** と **安定性（null参照）** に直結する不具合がいくつかあります。優先度順に修正することを推奨します。

## 指摘事項

### 1) [Critical] `encry` / `dcry` のシェルコマンド組み立てがコマンドインジェクション可能
- `text` や `password` をそのままシェル文字列に埋め込み `exec()` しており、入力値次第で任意コマンド実行が可能です。
- 例: `"` や `` ` ``、`$(...)` を含む入力でコマンド境界を破壊できます。

**該当箇所**
- `index.js` 719-721行
- `index.js` 755-757行

**推奨修正**
- `exec` ではなく `spawn` / `execFile` を使い、引数を配列で渡す。
- 可能であれば Node.js の暗号APIで完結させる（OpenSSLコマンドを直接叩かない）。

---

### 2) [High] `/status` API で Bot 未接続時に `client.user.id` 参照でクラッシュ
- `bot` は三項演算子でガードしている一方、`botId` は無条件で `client.user.id` を参照しています。
- Bot起動直後やログイン失敗時に `/status` へアクセスすると `TypeError` になる可能性があります。

**該当箇所**
- `index.js` 44-48行

**推奨修正**
- `botId: client.user ? client.user.id : null` のように同様のガードを入れる。

---

### 3) [High] DM受信時に `message.guild.id` を参照しクラッシュ
- `DirectMessages` intent を有効化しているため DM も `messageCreate` に到達します。
- しかし `message.guild` は DM で `null` のため、`message.guild.id` 参照で例外になります。

**該当箇所**
- `index.js` 26-34行（`DirectMessages` intent）
- `index.js` 289行、295-296行（`message.guild.id` 参照）

**推奨修正**
- `if (!message.guild) return;` をハンドラ冒頭に追加。

---

### 4) [Medium] 未使用import/変数が複数あり保守性低下
- `PresenceUpdateStatus`, `MessageFlags`, `PermissionsBitField`, `response` など未使用が見られます。
- コードリーディング時にノイズになり、将来の変更で誤解を招きます。

**該当箇所（例）**
- `index.js` 1行（未使用の named imports）
- `index.js` 10行（`response`）
- `index.js` 74行（`text` 引数が未使用）

**推奨修正**
- ESLint（`no-unused-vars`）導入、または未使用要素の削除。

---

## 実施した確認
- `node --check index.js` で構文エラーがないことを確認。
