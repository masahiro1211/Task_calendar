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

  it("rejects done for non-leaves and permits done for leaves", async () => {
    const parent = await service.createTask({ title: "parent", size: "L" });
    const child = await service.createTask({ parentId: parent.id, title: "child", size: "S" });

    await expect(service.markTaskDone(parent.id)).rejects.toThrow(TaskServiceError);

    const doneChild = await service.markTaskDone(child.id);

    expect(doneChild.state).toBe("done");
    expect(doneChild.doneAt?.toISOString()).toBe(fixedNow.toISOString());
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
});
