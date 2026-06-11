import Link from "next/link";
import { hasDatabaseUrl } from "@/db/client";
import { Button } from "@/components/ui/button";
import { listTaskTree } from "@/services/queries";
import { AppHeader } from "../components/app-header";
import { TaskTree } from "../components/task-tree";
import type { TaskDetailClient } from "../components/task-detail-sheet";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams
}: {
  searchParams?: Promise<{ cancelled?: string }>;
}) {
  if (!hasDatabaseUrl()) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <section className="max-w-xl rounded-md border bg-card p-6">
          <h1 className="text-xl font-semibold">DATABASE_URL が設定されていません。</h1>
        </section>
      </main>
    );
  }

  const params = await searchParams;
  const includeCancelled = params?.cancelled === "1";
  const tasks = await listTaskTree({ includeCancelled });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AppHeader active="tasks">
        <Button asChild variant={includeCancelled ? "secondary" : "outline"}>
          <Link href={includeCancelled ? "/tasks" : "/tasks?cancelled=1"}>
            {includeCancelled ? "中止を隠す" : "中止も表示"}
          </Link>
        </Button>
      </AppHeader>
      <section className="mx-auto max-w-5xl p-5">
        <TaskTree tasks={tasks.map(toTaskDetailClient)} />
      </section>
    </main>
  );
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
