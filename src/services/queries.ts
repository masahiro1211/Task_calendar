import { getSql } from "@/db/client";
import type { TaskSize, TaskState } from "./tasks";

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
  startAt: Date;
  endAt: Date;
  rescheduledCount: number;
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
  start_at: Date;
  end_at: Date;
  rescheduled_count: number;
}

export async function listTaskTree() {
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
    order by l.path
  `;

  return rows.map(mapTaskTreeItem);
}

export async function listPoolTasks() {
  const sql = getSql();
  const rows = await sql<PoolTaskRow[]>`
    select
      id,
      title,
      size::text as size,
      estimate_min,
      effective_deadline::text as effective_deadline
    from v_pool
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
    startAt: row.start_at,
    endAt: row.end_at,
    rescheduledCount: row.rescheduled_count
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
