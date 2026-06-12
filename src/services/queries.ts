import { getSql } from "../db/client";
import type { TaskSize, TaskState } from "./tasks";
import type postgres from "postgres";

type Sql = postgres.Sql | postgres.TransactionSql;

export interface TaskTreeItem {
  id: string;
  parentId: string | null;
  title: string;
  bodyMd: string;
  size: TaskSize;
  estimateMin: number | null;
  deadline: string | null;
  effectiveDeadline: string | null;
  state: TaskState;
  doneAt: Date | null;
  sortOrder: number;
  depth: number;
  isLeaf: boolean;
  doneChildren: number;
  totalChildren: number;
  derivedDoneAt: Date | null;
  cancelCandidateCount: number;
  futureBlockCount: number;
}

export interface PoolTask {
  id: string;
  title: string;
  size: TaskSize;
  estimateMin: number | null;
  effectiveDeadline: string | null;
}

export interface CalendarBlock {
  id: string;
  taskId: string;
  title: string;
  taskState: TaskState;
  startAt: Date;
  endAt: Date;
  rescheduledCount: number;
}

export interface TaskBlock {
  id: string;
  taskId: string;
  startAt: Date;
  endAt: Date;
  rescheduledCount: number;
}

export interface DeadlineLaneTask {
  id: string;
  title: string;
  size: TaskSize;
  state: TaskState;
  isLeaf: boolean;
  estimateMin: number | null;
  effectiveDeadline: string;
}

interface TaskTreeRow {
  id: string;
  parent_id: string | null;
  title: string;
  body_md: string;
  size: TaskSize;
  estimate_min: number | null;
  deadline: string | null;
  effective_deadline: string | null;
  state: TaskState;
  done_at: Date | null;
  sort_order: number;
  depth: number;
  is_leaf: boolean;
  done_children: string | null;
  total_children: string | null;
  derived_done_at: Date | null;
  cancel_candidate_count: string;
  future_block_count: string;
  path: string[];
}

interface PoolTaskRow {
  id: string;
  title: string;
  size: TaskSize;
  estimate_min: number | null;
  effective_deadline: string | null;
}

interface CalendarBlockRow {
  id: string;
  task_id: string;
  title: string;
  task_state: TaskState;
  start_at: Date;
  end_at: Date;
  rescheduled_count: number;
}

interface TaskBlockRow {
  id: string;
  task_id: string;
  start_at: Date;
  end_at: Date;
  rescheduled_count: number;
}

interface DeadlineLaneTaskRow {
  id: string;
  title: string;
  size: TaskSize;
  state: TaskState;
  is_leaf: boolean;
  estimate_min: number | null;
  effective_deadline: string;
}

export async function listTaskTree({
  includeCancelled = false
}: {
  includeCancelled?: boolean;
} = {}) {
  const sql = getSql();
  const rows = await sql<TaskTreeRow[]>`
    select
      l.id,
      l.parent_id,
      l.title,
      l.body_md,
      l.size::text as size,
      l.estimate_min,
      l.deadline::text as deadline,
      l.effective_deadline::text as effective_deadline,
      l.state::text as state,
      l.done_at,
      l.sort_order,
      l.depth,
      l.is_leaf,
      l.path,
      p.done_children,
      p.total_children,
      p.derived_done_at,
      impact.cancel_candidate_count,
      impact.future_block_count
    from v_leaves l
    left join v_progress p on p.id = l.id
    left join lateral (
      with recursive target as (
        select id, state
        from tasks
        where id = l.id
        union all
        select child.id, child.state
        from tasks child
        join target on child.parent_id = target.id
      )
      select
        count(distinct target.id) filter (where target.state = 'open') as cancel_candidate_count,
        count(b.id) filter (where b.end_at > now()) as future_block_count
      from target
      left join blocks b on b.task_id = target.id
    ) impact on true
    where (${includeCancelled} or l.state <> 'cancelled')
    order by l.path
  `;

  return rows.map(mapTaskTreeItem);
}

export async function listPoolTasks() {
  const sql = getSql();
  // v_pool と同じ定義だが、view の版数に依存しないよう条件をここに展開している
  // (配置済み = ブロックを1つでも持つタスクはプールに出さない)
  const rows = await sql<PoolTaskRow[]>`
    select
      t.id,
      t.title,
      t.size::text as size,
      t.estimate_min,
      t.effective_deadline::text as effective_deadline
    from v_leaves t
    where t.is_leaf
      and t.state = 'open'
      and t.size <> 'L'
      and not exists (
        select 1 from blocks b
        where b.task_id = t.id
      )
    order by t.effective_deadline nulls last, t.size, t.sort_order
  `;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    size: row.size,
    estimateMin: row.estimate_min,
    effectiveDeadline: row.effective_deadline
  }));
}

export async function listNeedsSplitTasks() {
  const sql = getSql();
  const rows = await sql<PoolTaskRow[]>`
    select
      id,
      title,
      size::text as size,
      estimate_min,
      effective_deadline::text as effective_deadline
    from v_needs_split
  `;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    size: row.size,
    estimateMin: row.estimate_min,
    effectiveDeadline: row.effective_deadline
  }));
}

export async function listCalendarBlocks({
  startAt,
  endAt
}: {
  startAt: Date;
  endAt: Date;
}) {
  const sql = getSql();
  const rows = await sql<CalendarBlockRow[]>`
    select
      b.id,
      b.task_id,
      t.title,
      t.state::text as task_state,
      b.start_at,
      b.end_at,
      b.rescheduled_count
    from blocks b
    join tasks t on t.id = b.task_id
    where b.start_at < ${endAt}
      and b.end_at > ${startAt}
    order by b.start_at
  `;

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    taskState: row.task_state,
    startAt: row.start_at,
    endAt: row.end_at,
    rescheduledCount: row.rescheduled_count
  }));
}

export async function listTaskBlocks(taskId: string, sqlClient: Sql = getSql()) {
  const rows = await sqlClient<TaskBlockRow[]>`
    select
      id,
      task_id,
      start_at,
      end_at,
      rescheduled_count
    from blocks
    where task_id = ${taskId}
    order by start_at desc
  `;

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    startAt: row.start_at,
    endAt: row.end_at,
    rescheduledCount: row.rescheduled_count
  }));
}

export async function listDeadlineLaneTasks(
  {
    startDate,
    endDate
  }: {
    startDate: string;
    endDate: string;
  },
  sqlClient: Sql = getSql()
) {
  const rows = await sqlClient<DeadlineLaneTaskRow[]>`
    select
      t.id,
      t.title,
      t.size::text as size,
      case
        when t.state = 'done' then 'done'
        when not t.is_leaf
          and not exists (
            select 1 from v_leaves d
            where d.is_leaf
              and d.state = 'open'
              and t.id = any(d.path)
              and d.id <> t.id
          )
          and exists (
            select 1 from v_leaves d
            where d.is_leaf
              and d.state = 'done'
              and t.id = any(d.path)
              and d.id <> t.id
          )
        then 'done'
        else t.state::text
      end as state,
      t.is_leaf,
      t.estimate_min,
      t.effective_deadline::text as effective_deadline
    from v_leaves t
    where t.state in ('open', 'done')
      and t.effective_deadline is not null
      and t.effective_deadline >= ${startDate}::date
      and t.effective_deadline < ${endDate}::date
      -- カレンダーに配置済み(ブロックあり)の葉タスクはレーンに出さない
      and not (
        t.state = 'open'
        and t.is_leaf
        and exists (
          select 1 from blocks b
          where b.task_id = t.id
        )
      )
    order by t.effective_deadline, t.path
  `;

  return rows.map((row): DeadlineLaneTask => ({
    id: row.id,
    title: row.title,
    size: row.size,
    state: row.state,
    isLeaf: row.is_leaf,
    estimateMin: row.estimate_min,
    effectiveDeadline: row.effective_deadline
  }));
}

function mapTaskTreeItem(row: TaskTreeRow): TaskTreeItem {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    bodyMd: row.body_md,
    size: row.size,
    estimateMin: row.estimate_min,
    deadline: row.deadline,
    effectiveDeadline: row.effective_deadline,
    state: row.state,
    doneAt: row.done_at,
    sortOrder: row.sort_order,
    depth: row.depth,
    isLeaf: row.is_leaf,
    doneChildren: Number(row.done_children ?? 0),
    totalChildren: Number(row.total_children ?? 0),
    derivedDoneAt: row.derived_done_at,
    cancelCandidateCount: Number(row.cancel_candidate_count),
    futureBlockCount: Number(row.future_block_count)
  };
}
