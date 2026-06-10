"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CancelTaskForm } from "./cancel-task-form";
import { TaskDetailSheet, type TaskDetailClient } from "./task-detail-sheet";

export function TaskTree({ tasks }: { tasks: TaskDetailClient[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const visibleTasks = useMemo(() => {
    const hiddenDepths: number[] = [];

    return tasks.filter((task) => {
      while (hiddenDepths.length > 0 && task.depth <= hiddenDepths[hiddenDepths.length - 1]) {
        hiddenDepths.pop();
      }

      const hidden = hiddenDepths.length > 0;

      if (collapsed.has(task.id)) {
        hiddenDepths.push(task.depth);
      }

      return !hidden;
    });
  }, [collapsed, tasks]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  function toggle(taskId: string) {
    setCollapsed((current) => {
      const next = new Set(current);

      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }

      return next;
    });
  }

  return (
    <>
      <div className="divide-y rounded-md border bg-card">
        {visibleTasks.map((task) => {
          const hasChildren = !task.isLeaf;
          const progress =
            task.totalChildren > 0 ? `${task.doneChildren}/${task.totalChildren}` : null;

          return (
            <article
              className={cn(
                "grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5",
                task.state === "done" && "bg-muted/40 text-muted-foreground",
                task.state === "cancelled" && "bg-muted/60 text-muted-foreground"
              )}
              key={task.id}
              style={{ paddingLeft: 12 + (task.depth - 1) * 20 }}
            >
              <div className="flex min-w-0 items-start gap-2">
                <button
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-accent disabled:opacity-20"
                  disabled={!hasChildren}
                  onClick={() => toggle(task.id)}
                  type="button"
                >
                  {hasChildren ? (
                    collapsed.has(task.id) ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )
                  ) : (
                    <span className="h-4 w-4" />
                  )}
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className={cn(
                        "min-w-0 truncate text-left text-sm font-medium hover:underline",
                        task.state === "done" && "line-through"
                      )}
                      onClick={() => setSelectedTaskId(task.id)}
                      type="button"
                    >
                      {task.title}
                    </button>
                    <Badge variant="outline">{task.size}</Badge>
                    {progress ? <Badge variant="secondary">{progress}</Badge> : null}
                    {task.state !== "open" ? <Badge variant="outline">{task.state}</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.effectiveDeadline ? `due ${task.effectiveDeadline}` : "no deadline"}
                    {task.estimateMin ? ` / ${task.estimateMin}m` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => setSelectedTaskId(task.id)} size="icon" type="button" variant="ghost">
                  <Pencil className="h-4 w-4" />
                  <span className="sr-only">Edit task</span>
                </Button>
                {task.state === "open" ? (
                  <CancelTaskForm
                    cancelCandidateCount={task.cancelCandidateCount}
                    futureBlockCount={task.futureBlockCount}
                    taskId={task.id}
                  />
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      <TaskDetailSheet
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTaskId(null);
          }
        }}
        open={selectedTask !== null}
        task={selectedTask}
      />
    </>
  );
}
