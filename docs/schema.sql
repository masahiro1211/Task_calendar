-- ============================================================
-- task scheduler schema v0.1  (PostgreSQL 15+)
-- 設計原則: 導出可能な状態はDBに保存しない。
--   保存する状態は open / done / cancelled の3つのみ。
--   未分割 / 未配置 / 配置済み はビューで導出する。
-- ============================================================

create extension if not exists pgcrypto;

create type size_class  as enum ('L', 'M', 'S');           -- 大 / 中 / 小
create type task_state  as enum ('open', 'done', 'cancelled');
create type sync_status as enum ('local', 'pending', 'synced', 'error');

-- ------------------------------------------------------------
-- tasks: タスクツリー(正本)
-- ------------------------------------------------------------
create table tasks (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references tasks(id) on delete cascade,
  title        text not null check (length(title) between 1 and 300),
  body_md      text not null default '',
  size         size_class not null,
  estimate_min integer check (estimate_min > 0),
  deadline     date,                       -- null = 祖先から継承(v_tasks_resolvedで解決)
  state        task_state not null default 'open',
  done_at      timestamptz,
  sort_order   integer not null default 0, -- 兄弟間の表示順
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint done_iff_done_at check ((state = 'done') = (done_at is not null))
);

create index idx_tasks_parent        on tasks (parent_id);
create index idx_tasks_open_deadline on tasks (deadline) where state = 'open';

-- ------------------------------------------------------------
-- blocks: カレンダー上の時間ブロック(配置)
--   1タスク : Nブロック を許可。完了判定はタスク側。
-- ------------------------------------------------------------
create table blocks (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references tasks(id) on delete cascade,
  start_at          timestamptz not null,
  end_at            timestamptz not null,
  first_planned_on  date not null default current_date,  -- 初回配置日(スリップ分析用)
  rescheduled_count integer not null default 0,          -- 再配置回数(見積もり精度分析用)
  actual_start      timestamptz,                         -- 実績(任意記録)
  actual_end        timestamptz,
  -- ---- GCalミラー用(M3まで sync='local' のまま) ----
  gcal_event_id     text,
  gcal_etag         text,
  sync              sync_status not null default 'local',
  sync_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint valid_range  check (end_at > start_at),
  constraint valid_actual check (actual_end is null or actual_start is not null)
);

create index idx_blocks_start on blocks (start_at);
create index idx_blocks_task  on blocks (task_id);
create unique index uq_blocks_gcal on blocks (gcal_event_id)
  where gcal_event_id is not null;
create index idx_blocks_sync_pending on blocks (sync) where sync = 'pending';

-- ------------------------------------------------------------
-- GCal連携
-- ------------------------------------------------------------
create table gcal_calendars (
  id             text primary key,             -- GCalのcalendarId
  role           text not null check (role in ('overlay', 'mirror')),
  summary        text not null default '',
  sync_token     text,                         -- incremental sync用
  last_synced_at timestamptz
);

-- overlay用 読み取りキャッシュ。UIは常にここを読む(GCal直読みしない)
create table gcal_events_cache (
  id           text primary key,               -- GCalのeventId
  calendar_id  text not null references gcal_calendars(id) on delete cascade,
  title        text not null default '',
  start_at     timestamptz,
  end_at       timestamptz,
  all_day      boolean not null default false,
  gcal_status  text not null default 'confirmed',
  gcal_updated timestamptz,
  raw          jsonb
);

create index idx_gcal_cache_start on gcal_events_cache (start_at);

-- OAuthリフレッシュトークン(シングルユーザー前提のシングルトン)
create table google_auth (
  id            integer primary key default 1 check (id = 1),
  refresh_token text not null,
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 導出ビュー
-- ------------------------------------------------------------

-- 実効締切(自分がnullなら最近接祖先の値)・深さ・パス
create view v_tasks_resolved as
with recursive r as (
  select t.*,
         t.deadline   as effective_deadline,
         1            as depth,
         array[t.id]  as path
  from tasks t
  where t.parent_id is null
  union all
  select t.*,
         coalesce(t.deadline, r.effective_deadline),
         r.depth + 1,
         r.path || t.id
  from tasks t
  join r on t.parent_id = r.id
)
select * from r;

-- 葉判定つき
create view v_leaves as
select t.*,
       not exists (select 1 from tasks c where c.parent_id = t.id) as is_leaf
from v_tasks_resolved t;

-- 配置プール: open・葉・M/S・未来のブロックを持たない
create view v_pool as
select l.*
from v_leaves l
where l.is_leaf
  and l.state = 'open'
  and l.size <> 'L'
  and not exists (
    select 1 from blocks b
    where b.task_id = l.id and b.end_at > now()
  )
order by l.effective_deadline nulls last, l.size, l.sort_order;

-- 要分割: openなLの葉(「必ず小or中まで分類」ルールの監視対象)
create view v_needs_split as
select l.*
from v_leaves l
where l.is_leaf and l.state = 'open' and l.size = 'L'
order by l.effective_deadline nulls last;

-- 親の進捗(導出。親のdoneは done_children = total_children で判定)
create view v_progress as
select p.id,
       count(c.id) filter (where c.state = 'done') as done_children,
       count(c.id)                                  as total_children,
       max(c.done_at)                               as derived_done_at
from tasks p
join tasks c on c.parent_id = p.id
group by p.id;

-- ------------------------------------------------------------
-- updated_at 自動更新
-- ------------------------------------------------------------
create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_tasks_touch  before update on tasks
  for each row execute function touch_updated_at();
create trigger trg_blocks_touch before update on blocks
  for each row execute function touch_updated_at();

-- ============================================================
-- アプリ層(service層)で守る不変条件 ※DBの宣言的制約では表現不能
--   1. ブロック作成は「openな葉」かつ size in ('M','S') のみ
--   2. 未来のブロックを持つタスクへの子追加(分割)は禁止
--   3. done にできるのは葉のみ。親の完了は v_progress で導出
--   4. 循環参照防止・深さ上限(運用上は3程度)
--   5. 子のsizeは親より小さい(警告に留めるか強制かは運用判断)
-- ============================================================