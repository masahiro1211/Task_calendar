# タスクスケジューラ 設計ドキュメント v1.0

Obsidian + Full Calendar + Google Calendar の現行運用を置き換える自作タスク管理アプリ。
本ドキュメントは設計議論の確定事項をまとめたもの。スキーマ実体は `schema.sql` を参照。

## 1. 背景と目的

- 現行: 予定 = Google Calendar、タスク = Obsidian Full Calendar(GCalを読み取り投影)
- 課題: クラウド/マルチデバイス非対応、プラグインのバグ、細部のカスタマイズ不能
- 目的: 同じ運用構造(下記ワークフロー)をクラウドネイティブに移植し、自分の運用ルールをUIで担保する

### ユーザーのワークフロー(仕様の源泉)

1. タスクをサイズ分類する: L(3日〜1週間) / M(1〜3時間) / S(〜1時間)
2. 元タスクは締切日を持つ。必ず M or S まで分割してから配置する
3. 当日、プールを確認して M/S タスクをカレンダーに時間ブロックとして配置する
4. 無理があれば適宜再配置する

## 2. アーキテクチャ

**自前DBが唯一の正本。GCalは入力(overlay)と出力(mirror)に分離し、双方向同期はしない。**

- タスクツリー・ブロック → 自前DB(Postgres)
- 固定予定(授業等) → 既存GCalカレンダーから **読み取り専用** で取得し、自作UIにオーバーレイ表示
- 配置ブロック → GCal上の **専用カレンダー「Tasks」へ書き込み専用ミラー**(M3)
  - GCal側での編集は読み戻さない(ユーザーはGCalアプリでは閲覧のみ)
  - リマインダー通知はTasksカレンダーのデフォルトリマインダーに委譲(通知インフラ自作なし)
  - 夜間の整合性チェックでDB→GCal方向に修復(DBが常に勝つ)
  - 同期が壊れたらTasksカレンダーごと削除して全ブロック再書き込みで復旧可能

webhookチャンネルは使わない。overlayはアプリ起動時+定期に syncToken で差分取得。

## 3. データモデル設計原則

**導出可能な状態はDBに保存しない。**

- 保存する状態: `open / done / cancelled` のみ
- 「未分割」「未配置(プール)」「配置済み」「期限超過」「親の完了・進捗」はすべてビューで導出
- これによりステータス不整合というバグカテゴリを構造的に排除する

### 確定した設計判断

1. **親の完了は完全導出**。全子がdoneなら親はdone扱い(`v_progress`)。親にdone_atは書かない。
   完了日時が必要なら `max(子のdone_at)` で代用。cancelled の子は進捗の分母から除外する。
2. **1タスク : Nブロックを許可**。Mタスクを複数セッションに分けて配置できる。
   完了判定はタスク単位。ブロックは時間の予約に徹する。
3. **未来ブロック(`end_at > now()`)を持つタスクへの子追加(分割)は禁止**。
   分割したい場合は先にブロックを削除させる(明示的操作)。過去ブロックは履歴として残してよい。
4. **締切は子にコピーせず、読み取り時に継承解決**(`v_tasks_resolved`)。
   子のdeadlineがnullなら最近接祖先の値が実効締切。任意ノードにdeadlineを明示設定すると
   そのサブツリーだけ上書きされ、中間マイルストーンとして機能する。
5. **サイズ順序の強制はしない**。sizeは純粋な見積もりラベル。
   ただし「Lの葉は配置不可(分割を強制)」のルールは別途維持する(ワークフロー由来)。

### アプリ層(service層)で守る不変条件

DBの宣言的制約では表現できないため、書き込み経路をservice層1本に絞ってそこで検証する。

1. ブロック作成は「openな葉」かつ size ∈ {M, S} のみ
2. 未来ブロックを持つタスクへの子追加は禁止
3. done にできるのは葉のみ
4. 循環参照防止(UIのツリー操作のみ許可で実質担保)

## 4. 機能要件

### M1: コア(GCal連携なしで日常使用開始可能にする)

- タスクCRUD + ツリー分割UI(L→M/S)。本文はMarkdown
- デイリープランニング画面: 左に未配置プール(実効締切順、`v_pool`)、
  右に日/週カレンダー、ドラッグで配置=ブロック生成
- ブロックのドラッグ移動・リサイズ・削除。再配置時に `rescheduled_count` をインクリメント
- 「要分割」警告: `v_needs_split`(openなLの葉)が空でないとき表示
- 完了操作(葉のみ)。親の進捗表示は導出
- Obsidian vault からの移行スクリプト(frontmatterパーサ → tasks/blocks 投入、ワンショット)

### M2: 固定予定オーバーレイ

- Google OAuth(自分のアカウントのみallowlist)
- overlay対象カレンダーの選択
- syncToken による差分取得 → `gcal_events_cache` 更新。UIはキャッシュのみ読む
- syncToken が 410 GONE を返したら full sync でキャッシュ再構築

### M3: Tasksカレンダーへのミラー

- 専用カレンダー作成(role='mirror')
- ブロック変更時に `sync='pending'` → ミラーワーカーが insert/patch/delete を実行、
  `gcal_event_id` / `gcal_etag` を保存、成功で `sync='synced'`、失敗は `sync='error'` + リトライ(指数バックオフ)
- イベントの extendedProperties に `taskId` / `blockId` を埋めて紐付け
- 夜間整合性チェック(cron): DBのblocksとGCalイベントを突合、差分はDB側の値でGCalを上書き
- GCPプロジェクトは本番公開する(テストモードのままだとrefresh tokenが7日で失効)

### M4: 仕上げ

- PWA化(manifest + service worker。push通知は実装しない=GCalに委譲)
- 見積もり精度ダッシュボード: size/estimate_min vs 実績(actual_start/end)、
  rescheduled_count、first_planned_on からのスリップ分析

## 5. 技術スタック

- Next.js (App Router) + TypeScript、Vercelデプロイ
- Postgres(Supabase または Neon)+ `postgres` raw SQL
- カレンダーUI: FullCalendar(JSライブラリ本体、無料版の週/日ビュー)
- プール→カレンダーのドラッグ: FullCalendarの external draggable + dnd-kit(ツリー内)
- Markdown: 保存はプレーンテキスト、表示は react-markdown
- Google連携: googleapis、refresh tokenは `google_auth` テーブルに保存
- 定期ジョブ: Vercel Cron(M3の夜間突合のみ)

## 6. 非要件(明示的にやらないこと)

- GCal→DBの書き戻し(ブロックの双方向同期)
- 自前push通知
- マルチユーザー対応・共有機能
- リアルタイム同期(複数デバイス同時編集の競合解決)。last-write-wins で十分
