# Task Calendar

Next.js、PostgreSQL、raw SQL で作る個人用タスクスケジューラです。

タスクの保存状態は `open` / `done` / `cancelled` の3つだけに絞り、未配置プールや要分割、親の進捗などは `v_pool`、`v_needs_split`、`v_progress` などの DB view から導出します。

## 現在の実装範囲

- `/plan`: 左に `v_pool` ベースの Pool、右に FullCalendar を置くデイリープランニング画面
- `/tasks`: タスクツリーの作成、編集、分割、done、reopen、cancel
- タスク編集はインライン展開ではなく Sheet に集約
- FullCalendar の日/週ビュー、now indicator、Asia/Tokyo 表示
- Pool からカレンダーへの external drag/drop 配置
- カレンダーブロックのドラッグ移動、リサイズ、Sheet 内からの削除
- 空きスロット選択から task + block を 1 transaction で作成
- `v_tasks_resolved.effective_deadline` に基づく all-day 締切レーン
- service 層の不変条件と integration test

まだ未実装: Google Calendar 連携、認証、PWA、分析機能、Obsidian 移行スクリプト。

## アーキテクチャ

- `docs/schema.sql` がスキーマの正本です。
- `migrations/0001_initial.sql` は `docs/schema.sql` と byte-for-byte で一致させます。
- DB access は `postgres` の raw SQL に統一しています。Drizzle/ORM は使いません。
- DB 書き込みは [src/services/tasks.ts](src/services/tasks.ts) の service 層に集約します。
- UI からの書き込みは [src/app/actions.ts](src/app/actions.ts) の Server Actions 経由です。
- 読み取りは DB view と [src/services/queries.ts](src/services/queries.ts) の query helper を使います。
- UI は Tailwind CSS と shadcn/ui 相当のローカル component で構成しています。
- FullCalendar は client component として [src/app/components/planning-calendar.tsx](src/app/components/planning-calendar.tsx) に隔離しています。

重要な service 不変条件:

- block 作成は open な M/S の葉タスクのみ許可します。
- 空きスロット選択からの `createTaskWithBlock` は task と block を同一 transaction で作成します。
- 子追加は open かつ未来 block を持たない task にのみ許可します。
- done にできるのは open な葉タスクのみです。
- cancel は open な子孫だけを cancelled にします。done 子孫は done のまま保持します。
- cancel は対象 subtree の未来 block だけを削除し、過去 block は履歴として残します。
- `v_progress` は cancelled 子を total から除外します。

## セットアップ

依存をインストールします。

```powershell
npm install
```

ローカル env を作成します。

```powershell
Copy-Item .env.example .env.local
```

Docker Postgres を使う場合は、`.env.local` を以下にします。

```env
DATABASE_URL="postgres://postgres:postgres@localhost:54329/task_calendar_dev"
DIRECT_DATABASE_URL="postgres://postgres:postgres@localhost:54329/task_calendar_dev"
TEST_DATABASE_URL="postgres://postgres:postgres@localhost:54329/task_calendar_test"
```

`task_calendar_dev` は手で入れた dogfooding 用データを置く DB です。`task_calendar_test` は integration test が毎回 reset する DB なので、日常利用データを入れないでください。

Postgres を起動します。

```powershell
docker compose up -d postgres
```

compose の init script は、初回起動時に `task_calendar_dev` も作成します。すでに古い compose 設定でコンテナを起動済みの場合は、dev DB を一度だけ手動作成します。

```powershell
docker compose exec postgres createdb -U postgres task_calendar_dev
```

スキーマを適用します。

```powershell
npm run db:migrate
```

アプリを起動します。

```powershell
npm run dev
```

ブラウザで `http://localhost:3000/plan` を開きます。`/` は `/plan` に redirect します。

## よく使うコマンド

```powershell
npm run db:check-schema
npm run test
npm run test:integration
npm run lint
npm run build
npx tsc --noEmit
```

integration test には local Postgres を指す `TEST_DATABASE_URL` が必要です。test helper は local 以外の DB を拒否し、各 test ごとに DB を reset します。Vitest の並列実行で reset が衝突しないよう、Postgres advisory lock も使っています。

PowerShell 例:

```powershell
$env:TEST_DATABASE_URL='postgres://postgres:postgres@localhost:54329/task_calendar_test'
npm run test:integration
```

dogfooding 用 dev server を明示的に dev DB へ向ける場合:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:54329/task_calendar_dev'
npm run dev
```

## DB 運用メモ

プレリリース中は schema 変更時に以下の2ファイルを両方更新します。

- `docs/schema.sql`
- `migrations/0001_initial.sql`

更新後は必ず確認します。

```powershell
npm run db:check-schema
```

初回デプロイ後、実データが入ったら `0001_initial.sql` の書き換えはやめて、差分 migration を追加する運用に切り替えます。

## Supabase メモ

Vercel など serverless runtime では、app runtime の `DATABASE_URL` は pooler 経由を使います。

migration 用の `DIRECT_DATABASE_URL` は port `5432` の direct connection を使います。migration runner は Supabase pooler URL を拒否します。

## npm audit メモ

本番依存だけの確認は以下で行います。

```powershell
npm audit --omit=dev
```

依存追加後は結果が変わり得るため、公開デプロイ前に改めて確認します。
