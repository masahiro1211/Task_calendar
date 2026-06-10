# CLAUDE.md

個人用タスクスケジューラ。仕様は `docs/design-doc.md`、スキーマは `docs/schema.sql` が正本。
設計議論は完了済み。以下は実装時に守ること。

## 譲れない設計原則(変更前に必ずユーザーに確認)

1. **導出可能な状態をカラムとして追加しない。** 「未配置」「配置済み」「親の完了」等を
   保存したくなったら、それはビュー(`v_pool` 等)の仕事。statusカラムの追加提案は禁止。
2. **schema.sql は生SQLのまま正本とする。** ビュー・トリガ・partial indexを含むため、
   Drizzleスキーマ定義に翻訳して二重管理しない。drizzle-kitのカスタムSQLマイグレーション
   として適用し、Drizzle側は型生成・クエリ用途に留める。
3. **DBへの書き込みはservice層1本に集約。** 不変条件(design-doc.md §3)はここで検証する。
   APIルートやUIから直接Drizzleでinsert/updateしない。
4. **非要件(design-doc.md §6)を実装しない。** 双方向同期・自前push通知・リアルタイム
   競合解決は明示的にスコープ外。提案も不要。

## 実装順序(M1)

1. マイグレーション適用 + Drizzle設定
2. service層 + **4つの不変条件のユニットテストを先に書く**
   (Lの葉は配置不可 / 未来ブロック保有タスクへの子追加禁止 / doneは葉のみ / 範囲整合)
3. APIルート
4. UI(ツリー → プール → カレンダー配置の順)

## 既知の罠

- FullCalendar は client component 必須(`'use client'`)。Next.js App Routerでの
  CSS importの作法に注意。プールからのドラッグは FullCalendar の external draggable
  (`Draggable` from @fullcalendar/interaction)を使う。dnd-kitはツリー内並べ替え専用。
- 時刻は全て timestamptz で保存し、表示は Asia/Tokyo 固定でよい(シングルユーザー)。
  `deadline` だけは date 型(時刻を持たない締切)。混ぜない。
- Supabase + Vercel serverless は接続プーリング必須(pooler経由の接続文字列 or
  serverless driver)。直結するとコネクション枯渇する。
- 認証は自分のGoogleアカウントのemail一致のみ許可する最小実装でよい。
  認証ライブラリの多機能化に時間を使わない。
- GCal連携(M2以降)に着手する際は、GCPプロジェクトを本番公開すること
  (テストモードのままだと refresh token が7日で失効する)。

## ユーザーの好み

- 社交辞令不要。設計上の問題があれば率直に指摘する。
- 不明点は推測で進めず確認する。ただし些末な実装詳細は自分で判断してよい。