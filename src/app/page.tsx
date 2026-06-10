import { hasDatabaseUrl } from "@/db/client";
import {
  listCalendarBlocks,
  listNeedsSplitTasks,
  listPoolTasks,
  listTaskTree,
  type TaskTreeItem
} from "@/services/queries";
import {
  createTaskAction,
  markTaskDoneAction,
  reopenTaskAction,
  splitTaskAction,
  updateTaskAction
} from "./actions";
import { CancelTaskForm } from "./components/cancel-task-form";
import {
  PlanningCalendar,
  type CalendarBlockClient,
  type PoolTaskClient
} from "./components/planning-calendar";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!hasDatabaseUrl()) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <p className="eyebrow">Task Calendar</p>
          <h1>DATABASE_URL is not configured.</h1>
          <p>Set a Postgres connection string to use the task planner.</p>
        </section>
      </main>
    );
  }

  const range = calendarRange(new Date());

  const [tasks, poolTasks, needsSplit, blocks] = await Promise.all([
    listTaskTree(),
    listPoolTasks(),
    listNeedsSplitTasks(),
    listCalendarBlocks(range)
  ]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Task Calendar</p>
          <h1>Planner</h1>
        </div>
        <CreateTaskForm />
      </header>

      {needsSplit.length > 0 ? (
        <section className="warning-band">
          <strong>Needs split</strong>
          <span>{needsSplit.map((task) => task.title).join(", ")}</span>
        </section>
      ) : null}

      <section className="task-section">
        <div className="section-heading">
          <h2>Tasks</h2>
          <span>{tasks.length}</span>
        </div>
        <div className="task-list">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      </section>

      <PlanningCalendar
        blocks={blocks.map(toCalendarBlockClient)}
        poolTasks={poolTasks.filter(isPoolTaskClient)}
      />
    </main>
  );
}

function CreateTaskForm() {
  return (
    <form action={createTaskAction} className="quick-form">
      <input name="title" placeholder="New task" required />
      <select defaultValue="M" name="size">
        <option value="L">L</option>
        <option value="M">M</option>
        <option value="S">S</option>
      </select>
      <input name="deadline" type="date" />
      <input min="1" name="estimateMin" placeholder="min" type="number" />
      <button type="submit">Add</button>
    </form>
  );
}

function TaskRow({ task }: { task: TaskTreeItem }) {
  const progress =
    task.totalChildren > 0 ? `${task.doneChildren}/${task.totalChildren}` : task.isLeaf ? "leaf" : "";

  return (
    <article className={`task-row state-${task.state}`} style={{ marginLeft: (task.depth - 1) * 20 }}>
      <div className="task-main">
        <div>
          <div className="task-title">
            <strong>{task.title}</strong>
            <span>{task.size}</span>
            <span>{task.state}</span>
            {progress ? <span>{progress}</span> : null}
          </div>
          <p>
            {task.effectiveDeadline ? `due ${task.effectiveDeadline}` : "no deadline"}
            {task.estimateMin ? ` / ${task.estimateMin}m` : ""}
          </p>
        </div>
        <div className="task-actions">
          {task.state === "open" && task.isLeaf ? (
            <form action={markTaskDoneAction}>
              <input name="taskId" type="hidden" value={task.id} />
              <button className="text-button" type="submit">
                Done
              </button>
            </form>
          ) : null}
          {task.state === "done" ? (
            <form action={reopenTaskAction}>
              <input name="taskId" type="hidden" value={task.id} />
              <button className="text-button" type="submit">
                Reopen
              </button>
            </form>
          ) : null}
          {task.state === "open" ? (
            <CancelTaskForm
              cancelCandidateCount={task.cancelCandidateCount}
              futureBlockCount={task.futureBlockCount}
              taskId={task.id}
            />
          ) : null}
        </div>
      </div>

      {task.state !== "cancelled" ? (
        <details className="task-details">
          <summary>Edit</summary>
          <form action={updateTaskAction} className="edit-grid">
            <input name="taskId" type="hidden" value={task.id} />
            <input defaultValue={task.title} name="title" required />
            <select defaultValue={task.size} name="size">
              <option value="L">L</option>
              <option value="M">M</option>
              <option value="S">S</option>
            </select>
            <input defaultValue={task.deadline ?? ""} name="deadline" type="date" />
            <input
              defaultValue={task.estimateMin ?? ""}
              min="1"
              name="estimateMin"
              placeholder="min"
              type="number"
            />
            <textarea defaultValue={task.bodyMd} name="bodyMd" rows={2} />
            <button type="submit">Save</button>
          </form>
          {task.state === "open" ? (
            <form action={splitTaskAction} className="split-grid">
              <input name="parentId" type="hidden" value={task.id} />
              <input name="title" placeholder="Child task" required />
              <select defaultValue="S" name="size">
                <option value="M">M</option>
                <option value="S">S</option>
              </select>
              <input name="deadline" type="date" />
              <input min="1" name="estimateMin" placeholder="min" type="number" />
              <button type="submit">Split</button>
            </form>
          ) : null}
        </details>
      ) : null}
    </article>
  );
}

function calendarRange(now: Date) {
  const startAt = new Date(now);
  startAt.setDate(startAt.getDate() - 7);
  startAt.setHours(0, 0, 0, 0);

  const endAt = new Date(now);
  endAt.setDate(endAt.getDate() + 21);
  endAt.setHours(23, 59, 59, 999);

  return { startAt, endAt };
}

function toCalendarBlockClient(block: {
  id: string;
  taskId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  rescheduledCount: number;
}): CalendarBlockClient {
  return {
    id: block.id,
    taskId: block.taskId,
    title: block.title,
    startAt: block.startAt.toISOString(),
    endAt: block.endAt.toISOString(),
    rescheduledCount: block.rescheduledCount
  };
}

function isPoolTaskClient(task: {
  id: string;
  title: string;
  size: string;
  estimateMin: number | null;
  effectiveDeadline: string | null;
}): task is PoolTaskClient {
  return task.size === "M" || task.size === "S";
}
