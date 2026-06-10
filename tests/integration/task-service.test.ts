import type postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskService, TaskServiceError } from "../../src/services/tasks";
import {
  closeIsolatedTestSql,
  createIsolatedTestSql,
  testDatabaseUrl
} from "./helpers/db";

type Sql = ReturnType<typeof postgres>;

const maybeDescribe = testDatabaseUrl ? describe : describe.skip;
const fixedNow = new Date("2026-06-10T00:00:00Z");

maybeDescribe("task service", () => {
  let sql: Sql;
  let service: ReturnType<typeof createTaskService>;

  beforeEach(async () => {
    sql = await createIsolatedTestSql();
    service = createTaskService({
      sql,
      now: () => fixedNow
    });
  });

  afterEach(async () => {
    await closeIsolatedTestSql(sql);
  });

  it("creates blocks only for open M/S leaf tasks", async () => {
    const mTask = await service.createTask({ title: "open m", size: "M" });
    const sTask = await service.createTask({ title: "open s", size: "S" });

    await expect(
      service.createBlock({
        taskId: mTask.id,
        startAt: "2026-06-10T09:00:00Z",
        endAt: "2026-06-10T10:00:00Z"
      })
    ).resolves.toMatchObject({ taskId: mTask.id });

    await expect(
      service.createBlock({
        taskId: sTask.id,
        startAt: "2026-06-10T11:00:00Z",
        endAt: "2026-06-10T11:30:00Z"
      })
    ).resolves.toMatchObject({ taskId: sTask.id });
  });

  it("rejects block creation for L leaves, non-leaves, done tasks, and cancelled tasks", async () => {
    const lLeaf = await service.createTask({ title: "l leaf", size: "L" });
    const parent = await service.createTask({ title: "parent", size: "M" });
    await service.createTask({ parentId: parent.id, title: "child", size: "S" });
    const doneTask = await service.createTask({ title: "done", size: "M" });
    await service.markTaskDone(doneTask.id);

    const [cancelled] = await sql<{ id: string }[]>`
      insert into tasks (title, size, state)
      values ('cancelled', 'M', 'cancelled')
      returning id
    `;

    for (const taskId of [lLeaf.id, parent.id, doneTask.id, cancelled.id]) {
      await expect(
        service.createBlock({
          taskId,
          startAt: "2026-06-10T09:00:00Z",
          endAt: "2026-06-10T10:00:00Z"
        })
      ).rejects.toThrow(TaskServiceError);
    }
  });

  it("rejects child additions to tasks with future blocks but allows past-only blocks", async () => {
    const futureBlocked = await service.createTask({ title: "future blocked", size: "M" });
    await service.createBlock({
      taskId: futureBlocked.id,
      startAt: "2026-06-10T09:00:00Z",
      endAt: "2026-06-10T10:00:00Z"
    });

    await expect(
      service.splitTask(futureBlocked.id, [{ title: "child", size: "S" }])
    ).rejects.toThrow(TaskServiceError);

    const pastBlocked = await service.createTask({ title: "past blocked", size: "M" });
    await service.createBlock({
      taskId: pastBlocked.id,
      startAt: "2026-06-09T09:00:00Z",
      endAt: "2026-06-09T10:00:00Z"
    });

    await expect(
      service.splitTask(pastBlocked.id, [
        { title: "first child", size: "S" },
        { title: "second child", size: "S" }
      ])
    ).resolves.toHaveLength(2);
  });

  it("rejects child additions to done and cancelled parents", async () => {
    const doneParent = await service.createTask({ title: "done parent", size: "L" });
    await service.markTaskDone(doneParent.id);

    const cancelledParent = await service.createTask({ title: "cancelled parent", size: "L" });
    await service.cancelTask(cancelledParent.id);

    for (const parentId of [doneParent.id, cancelledParent.id]) {
      await expect(
        service.createTask({ parentId, title: "child", size: "S" })
      ).rejects.toThrow(TaskServiceError);

      await expect(
        service.splitTask(parentId, [{ title: "child", size: "S" }])
      ).rejects.toThrow(TaskServiceError);
    }
  });

  it("rejects done for non-leaves and permits done for leaves", async () => {
    const parent = await service.createTask({ title: "parent", size: "L" });
    const child = await service.createTask({ parentId: parent.id, title: "child", size: "S" });

    await expect(service.markTaskDone(parent.id)).rejects.toThrow(TaskServiceError);

    const doneChild = await service.markTaskDone(child.id);

    expect(doneChild.state).toBe("done");
    expect(doneChild.doneAt?.toISOString()).toBe(fixedNow.toISOString());
  });

  it("rejects done for non-open leaves", async () => {
    const doneTask = await service.createTask({ title: "done", size: "S" });
    await service.markTaskDone(doneTask.id);

    const cancelledTask = await service.createTask({ title: "cancelled", size: "S" });
    await service.cancelTask(cancelledTask.id);

    await expect(service.markTaskDone(doneTask.id)).rejects.toThrow(TaskServiceError);
    await expect(service.markTaskDone(cancelledTask.id)).rejects.toThrow(TaskServiceError);
  });

  it("rejects block creation and updates with end_at <= start_at", async () => {
    const task = await service.createTask({ title: "task", size: "M" });

    await expect(
      service.createBlock({
        taskId: task.id,
        startAt: "2026-06-10T10:00:00Z",
        endAt: "2026-06-10T10:00:00Z"
      })
    ).rejects.toThrow(TaskServiceError);

    const block = await service.createBlock({
      taskId: task.id,
      startAt: "2026-06-10T09:00:00Z",
      endAt: "2026-06-10T10:00:00Z"
    });

    await expect(
      service.updateBlock(block.id, {
        endAt: "2026-06-10T08:59:00Z"
      })
    ).rejects.toThrow(TaskServiceError);
  });

  it("increments rescheduled_count on block moves but not resizes", async () => {
    const task = await service.createTask({ title: "task", size: "M" });
    const block = await service.createBlock({
      taskId: task.id,
      startAt: "2026-06-10T09:00:00Z",
      endAt: "2026-06-10T10:00:00Z"
    });

    const resized = await service.updateBlock(block.id, {
      endAt: "2026-06-10T10:30:00Z"
    });

    expect(resized.rescheduledCount).toBe(0);

    const moved = await service.updateBlock(block.id, {
      startAt: "2026-06-10T09:30:00Z",
      endAt: "2026-06-10T11:00:00Z"
    });

    expect(moved.rescheduledCount).toBe(1);
  });

  it("updates only editable task fields", async () => {
    const task = await service.createTask({
      title: "original",
      bodyMd: "body",
      deadline: "2026-07-01",
      estimateMin: 30,
      size: "M"
    });
    await service.markTaskDone(task.id);

    const updated = await service.updateTask(task.id, {
      title: "updated",
      bodyMd: "new body",
      deadline: null,
      estimateMin: 45,
      size: "S"
    });

    expect(updated).toMatchObject({
      id: task.id,
      parentId: null,
      title: "updated",
      bodyMd: "new body",
      deadline: null,
      estimateMin: 45,
      size: "S",
      state: "done",
      sortOrder: 0
    });
    expect(updated.doneAt?.toISOString()).toBe(fixedNow.toISOString());
  });

  it("rejects size changes to L for future-blocked tasks but allows past-only blocks", async () => {
    const futureBlocked = await service.createTask({ title: "future blocked", size: "M" });
    await service.createBlock({
      taskId: futureBlocked.id,
      startAt: "2026-06-10T09:00:00Z",
      endAt: "2026-06-10T10:00:00Z"
    });

    await expect(service.updateTask(futureBlocked.id, { size: "L" })).rejects.toThrow(
      TaskServiceError
    );

    const pastBlocked = await service.createTask({ title: "past blocked", size: "M" });
    await service.createBlock({
      taskId: pastBlocked.id,
      startAt: "2026-06-09T09:00:00Z",
      endAt: "2026-06-09T10:00:00Z"
    });

    await expect(service.updateTask(pastBlocked.id, { size: "L" })).resolves.toMatchObject({
      id: pastBlocked.id,
      size: "L"
    });
  });

  it("reopens done tasks and rejects open or cancelled tasks", async () => {
    const doneTask = await service.createTask({ title: "done", size: "S" });
    await service.markTaskDone(doneTask.id);

    await expect(service.reopenTask(doneTask.id)).resolves.toMatchObject({
      id: doneTask.id,
      state: "open",
      doneAt: null
    });

    await expect(service.reopenTask(doneTask.id)).rejects.toThrow(TaskServiceError);

    const cancelledTask = await service.createTask({ title: "cancelled", size: "S" });
    await service.cancelTask(cancelledTask.id);

    await expect(service.reopenTask(cancelledTask.id)).rejects.toThrow(TaskServiceError);
  });

  it("cancels only open subtree tasks while preserving done descendants", async () => {
    const parent = await service.createTask({ title: "parent", size: "L" });
    const openChild = await service.createTask({
      parentId: parent.id,
      title: "open child",
      size: "M"
    });
    const doneChild = await service.createTask({
      parentId: parent.id,
      title: "done child",
      size: "S"
    });
    await service.markTaskDone(doneChild.id);

    const result = await service.cancelTask(parent.id);

    expect(result.cancelledCount).toBe(2);

    const rows = await sql<{ id: string; state: string; done_at: Date | null }[]>`
      select id, state::text as state, done_at
      from tasks
      where id in (${parent.id}, ${openChild.id}, ${doneChild.id})
      order by title
    `;

    expect(rows).toEqual([
      { id: doneChild.id, state: "done", done_at: fixedNow },
      { id: openChild.id, state: "cancelled", done_at: null },
      { id: parent.id, state: "cancelled", done_at: null }
    ]);
  });

  it("deletes only future blocks when cancelling a subtree", async () => {
    const parent = await service.createTask({ title: "parent", size: "L" });
    const child = await service.createTask({ parentId: parent.id, title: "child", size: "M" });
    const pastBlock = await service.createBlock({
      taskId: child.id,
      startAt: "2026-06-09T09:00:00Z",
      endAt: "2026-06-09T10:00:00Z"
    });
    const futureBlock = await service.createBlock({
      taskId: child.id,
      startAt: "2026-06-10T09:00:00Z",
      endAt: "2026-06-10T10:00:00Z"
    });

    const result = await service.cancelTask(parent.id);

    expect(result.deletedFutureBlockCount).toBe(1);

    const blocks = await sql<{ id: string }[]>`
      select id from blocks order by start_at
    `;

    expect(blocks.map((block) => block.id)).toEqual([pastBlock.id]);
    expect(blocks.map((block) => block.id)).not.toContain(futureBlock.id);
  });
});
