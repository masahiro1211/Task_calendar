import Link from "next/link";
import { hasDatabaseUrl } from "@/db/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listCalendarBlocks,
  listDeadlineLaneTasks,
  listNeedsSplitTasks,
  listPoolTasks,
  listTaskTree
} from "@/services/queries";
import { AppHeader } from "../components/app-header";
import {
  PlanningCalendar,
  type CalendarBlockClient,
  type DeadlineLaneTaskClient,
  type PoolTaskClient
} from "../components/planning-calendar";
import type { TaskDetailClient } from "../components/task-detail-sheet";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  if (!hasDatabaseUrl()) {
    return <MissingDatabase />;
  }

  const range = calendarRange(new Date());
  const [tasks, poolTasks, needsSplit, blocks, deadlineTasks] = await Promise.all([
    listTaskTree(),
    listPoolTasks(),
    listNeedsSplitTasks(),
    listCalendarBlocks({ startAt: range.startAt, endAt: range.endAt }),
    listDeadlineLaneTasks({ startDate: range.startDate, endDate: range.endDate })
  ]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AppHeader active="plan">
        <Button asChild variant="outline">
          <Link href="/tasks">
            Needs split
            <Badge variant={needsSplit.length > 0 ? "destructive" : "outline"}>
              {needsSplit.length}
            </Badge>
          </Link>
        </Button>
      </AppHeader>
      <PlanningCalendar
        blocks={blocks.map(toCalendarBlockClient)}
        deadlineTasks={deadlineTasks.map(toDeadlineLaneTaskClient)}
        poolTasks={poolTasks.filter(isPoolTaskClient)}
        tasks={tasks.map(toTaskDetailClient)}
      />
    </main>
  );
}

function MissingDatabase() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <section className="max-w-xl rounded-md border bg-card p-6">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Task Calendar</p>
        <h1 className="mt-1 text-xl font-semibold">DATABASE_URL is not configured.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set a Postgres connection string to use the task planner.
        </p>
      </section>
    </main>
  );
}

function calendarRange(now: Date) {
  const startAt = new Date(now);
  startAt.setDate(startAt.getDate() - 7);
  startAt.setHours(0, 0, 0, 0);

  const endAt = new Date(now);
  endAt.setDate(endAt.getDate() + 21);
  endAt.setHours(23, 59, 59, 999);

  const deadlineEnd = new Date(endAt);
  deadlineEnd.setDate(deadlineEnd.getDate() + 1);

  return {
    startAt,
    endAt,
    startDate: formatTokyoDate(startAt),
    endDate: formatTokyoDate(deadlineEnd)
  };
}

function formatTokyoDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
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

function toDeadlineLaneTaskClient(task: {
  id: string;
  title: string;
  size: string;
  estimateMin: number | null;
  effectiveDeadline: string;
}): DeadlineLaneTaskClient {
  return {
    id: task.id,
    title: task.title,
    size: task.size,
    estimateMin: task.estimateMin,
    effectiveDeadline: task.effectiveDeadline
  };
}

function toTaskDetailClient(task: {
  id: string;
  parentId: string | null;
  title: string;
  bodyMd: string;
  size: "L" | "M" | "S";
  estimateMin: number | null;
  deadline: string | null;
  effectiveDeadline: string | null;
  state: "open" | "done" | "cancelled";
  doneAt: Date | null;
  sortOrder: number;
  depth: number;
  isLeaf: boolean;
  doneChildren: number;
  totalChildren: number;
  derivedDoneAt: Date | null;
  cancelCandidateCount: number;
  futureBlockCount: number;
}): TaskDetailClient {
  return {
    ...task,
    doneAt: task.doneAt?.toISOString() ?? null,
    derivedDoneAt: task.derivedDoneAt?.toISOString() ?? null
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
