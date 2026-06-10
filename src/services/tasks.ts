import type postgres from "postgres";

type Sql = postgres.Sql | postgres.TransactionSql;

type TimestampInput = Date | string;
type DateInput = Date | string;

export type TaskSize = "L" | "M" | "S";

export interface TaskRecord {
  id: string;
  parentId: string | null;
  title: string;
  bodyMd: string;
  size: TaskSize;
  estimateMin: number | null;
  deadline: string | null;
  state: "open" | "done" | "cancelled";
  doneAt: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BlockRecord {
  id: string;
  taskId: string;
  startAt: Date;
  endAt: Date;
  rescheduledCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  parentId?: string | null;
  title: string;
  bodyMd?: string;
  size: TaskSize;
  estimateMin?: number | null;
  deadline?: DateInput | null;
  sortOrder?: number;
}

export type SplitTaskChildInput = Omit<CreateTaskInput, "parentId">;

export interface CreateBlockInput {
  taskId: string;
  startAt: TimestampInput;
  endAt: TimestampInput;
}

export interface UpdateBlockInput {
  startAt?: TimestampInput;
  endAt?: TimestampInput;
}

export class TaskServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskServiceError";
  }
}

export function createTaskService({
  sql,
  now
}: {
  sql: postgres.Sql;
  now: () => Date;
}) {
  return {
    async createTask(input: CreateTaskInput) {
      if (input.parentId) {
        await assertCanAddChild(sql, input.parentId, now());
      }

      return insertTask(sql, {
        ...input,
        parentId: input.parentId ?? null
      });
    },

    async splitTask(parentId: string, children: SplitTaskChildInput[]) {
      if (children.length === 0) {
        throw new TaskServiceError("splitTask requires at least one child.");
      }

      return sql.begin(async (tx) => {
        await assertCanAddChild(tx, parentId, now());

        const created: TaskRecord[] = [];

        for (const [index, child] of children.entries()) {
          created.push(
            await insertTask(tx, {
              ...child,
              parentId,
              sortOrder: child.sortOrder ?? index
            })
          );
        }

        return created;
      });
    },

    async createBlock(input: CreateBlockInput) {
      const startAt = toDate(input.startAt);
      const endAt = toDate(input.endAt);
      assertValidRange(startAt, endAt);
      await assertCanCreateBlock(sql, input.taskId);

      const [block] = await sql<BlockRow[]>`
        insert into blocks (task_id, start_at, end_at)
        values (${input.taskId}, ${startAt}, ${endAt})
        returning
          id,
          task_id,
          start_at,
          end_at,
          rescheduled_count,
          created_at,
          updated_at
      `;

      return mapBlock(block);
    },

    async updateBlock(blockId: string, input: UpdateBlockInput) {
      const [existing] = await sql<BlockRow[]>`
        select
          id,
          task_id,
          start_at,
          end_at,
          rescheduled_count,
          created_at,
          updated_at
        from blocks
        where id = ${blockId}
      `;

      if (!existing) {
        throw new TaskServiceError("Block not found.");
      }

      const startAt = input.startAt === undefined ? existing.start_at : toDate(input.startAt);
      const endAt = input.endAt === undefined ? existing.end_at : toDate(input.endAt);
      assertValidRange(startAt, endAt);

      const startChanged = startAt.getTime() !== existing.start_at.getTime();

      const [block] = await sql<BlockRow[]>`
        update blocks
        set
          start_at = ${startAt},
          end_at = ${endAt},
          rescheduled_count = rescheduled_count + ${startChanged ? 1 : 0}
        where id = ${blockId}
        returning
          id,
          task_id,
          start_at,
          end_at,
          rescheduled_count,
          created_at,
          updated_at
      `;

      return mapBlock(block);
    },

    async deleteBlock(blockId: string) {
      const deleted = await sql`
        delete from blocks
        where id = ${blockId}
      `;

      return deleted.count === 1;
    },

    async markTaskDone(taskId: string) {
      await assertLeafTask(sql, taskId);

      const [task] = await sql<TaskRow[]>`
        update tasks
        set state = 'done', done_at = ${now()}
        where id = ${taskId}
        returning
          id,
          parent_id,
          title,
          body_md,
          size::text as size,
          estimate_min,
          deadline::text as deadline,
          state::text as state,
          done_at,
          sort_order,
          created_at,
          updated_at
      `;

      if (!task) {
        throw new TaskServiceError("Task not found.");
      }

      return mapTask(task);
    }
  };
}

interface TaskRow {
  id: string;
  parent_id: string | null;
  title: string;
  body_md: string;
  size: TaskSize;
  estimate_min: number | null;
  deadline: string | null;
  state: "open" | "done" | "cancelled";
  done_at: Date | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

interface BlockRow {
  id: string;
  task_id: string;
  start_at: Date;
  end_at: Date;
  rescheduled_count: number;
  created_at: Date;
  updated_at: Date;
}

interface TaskWriteInput extends CreateTaskInput {
  parentId: string | null;
}

async function insertTask(sql: Sql, input: TaskWriteInput) {
  const [task] = await sql<TaskRow[]>`
    insert into tasks (
      parent_id,
      title,
      body_md,
      size,
      estimate_min,
      deadline,
      sort_order
    )
    values (
      ${input.parentId},
      ${input.title},
      ${input.bodyMd ?? ""},
      ${input.size},
      ${input.estimateMin ?? null},
      ${input.deadline ?? null},
      ${input.sortOrder ?? 0}
    )
    returning
      id,
      parent_id,
      title,
      body_md,
      size::text as size,
      estimate_min,
      deadline::text as deadline,
      state::text as state,
      done_at,
      sort_order,
      created_at,
      updated_at
  `;

  return mapTask(task);
}

async function assertCanCreateBlock(sql: Sql, taskId: string) {
  const [task] = await sql<{ size: TaskSize; state: string; is_leaf: boolean }[]>`
    select
      t.size::text as size,
      t.state::text as state,
      not exists (select 1 from tasks child where child.parent_id = t.id) as is_leaf
    from tasks t
    where t.id = ${taskId}
  `;

  if (!task) {
    throw new TaskServiceError("Task not found.");
  }

  if (task.state !== "open" || !task.is_leaf || task.size === "L") {
    throw new TaskServiceError("Blocks can only be created for open M/S leaf tasks.");
  }
}

async function assertCanAddChild(sql: Sql, parentId: string, currentTime: Date) {
  const [task] = await sql<{ id: string }[]>`
    select id from tasks where id = ${parentId}
  `;

  if (!task) {
    throw new TaskServiceError("Parent task not found.");
  }

  const [futureBlock] = await sql<{ exists: boolean }[]>`
    select exists(
      select 1
      from blocks
      where task_id = ${parentId}
        and end_at > ${currentTime}
    ) as exists
  `;

  if (futureBlock.exists) {
    throw new TaskServiceError("Cannot add children to a task with a future block.");
  }
}

async function assertLeafTask(sql: Sql, taskId: string) {
  const [task] = await sql<{ is_leaf: boolean }[]>`
    select not exists (
      select 1 from tasks child where child.parent_id = tasks.id
    ) as is_leaf
    from tasks
    where id = ${taskId}
  `;

  if (!task) {
    throw new TaskServiceError("Task not found.");
  }

  if (!task.is_leaf) {
    throw new TaskServiceError("Only leaf tasks can be marked done.");
  }
}

function assertValidRange(startAt: Date, endAt: Date) {
  if (endAt.getTime() <= startAt.getTime()) {
    throw new TaskServiceError("Block end_at must be after start_at.");
  }
}

function toDate(value: TimestampInput) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TaskServiceError("Invalid timestamp.");
  }

  return date;
}

function mapTask(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    bodyMd: row.body_md,
    size: row.size,
    estimateMin: row.estimate_min,
    deadline: row.deadline,
    state: row.state,
    doneAt: row.done_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapBlock(row: BlockRow): BlockRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    startAt: row.start_at,
    endAt: row.end_at,
    rescheduledCount: row.rescheduled_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
