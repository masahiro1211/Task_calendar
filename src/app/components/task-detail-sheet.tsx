"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  deleteBlockAction,
  listTaskBlocksAction,
  markTaskDoneAction,
  reopenTaskAction,
  splitTaskAction,
  updateTaskAction
} from "../actions";
import type { TaskSize, TaskState } from "@/services/tasks";

export interface TaskDetailClient {
  id: string;
  parentId: string | null;
  title: string;
  bodyMd: string;
  size: TaskSize;
  estimateMin: number | null;
  deadline: string | null;
  effectiveDeadline: string | null;
  state: TaskState;
  doneAt: string | null;
  sortOrder: number;
  depth: number;
  isLeaf: boolean;
  doneChildren: number;
  totalChildren: number;
  derivedDoneAt: string | null;
  cancelCandidateCount: number;
  futureBlockCount: number;
}

export interface TaskBlockClient {
  id: string;
  taskId: string;
  startAt: string;
  endAt: string;
  rescheduledCount: number;
}

export function TaskDetailSheet({
  task,
  open,
  onOpenChange
}: {
  task: TaskDetailClient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [blocks, setBlocks] = useState<TaskBlockClient[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [size, setSize] = useState<TaskSize>("M");
  const [childSize, setChildSize] = useState<"M" | "S">("S");

  useEffect(() => {
    if (!task || !open) {
      setBlocks([]);
      return;
    }

    setSize(task.size);
    setChildSize("S");
    setLoadingBlocks(true);
    listTaskBlocksAction(task.id)
      .then((rows) =>
        setBlocks(
          rows.map((block) => ({
            id: block.id,
            taskId: block.taskId,
            startAt: block.startAt.toISOString(),
            endAt: block.endAt.toISOString(),
            rescheduledCount: block.rescheduledCount
          }))
        )
      )
      .finally(() => setLoadingBlocks(false));
  }, [open, task]);

  if (!task) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent />
      </Sheet>
    );
  }

  async function refreshBlocks() {
    if (!task) {
      return;
    }

    const rows = await listTaskBlocksAction(task.id);
    setBlocks(
      rows.map((block) => ({
        id: block.id,
        taskId: block.taskId,
        startAt: block.startAt.toISOString(),
        endAt: block.endAt.toISOString(),
        rescheduledCount: block.rescheduledCount
      }))
    );
  }

  async function deleteBlock(blockId: string) {
    await deleteBlockAction(blockId);
    await refreshBlocks();
    startTransition(() => router.refresh());
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{task.title}</SheetTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant={task.state === "done" ? "secondary" : "outline"}>{task.state}</Badge>
            <Badge variant="outline">{task.size}</Badge>
            {task.effectiveDeadline ? (
              <Badge variant="outline">due {task.effectiveDeadline}</Badge>
            ) : null}
          </div>
        </SheetHeader>

        <div className="mt-6 grid gap-6">
          <form action={updateTaskAction} className="grid gap-3">
            <input name="taskId" type="hidden" value={task.id} />
            <input name="size" type="hidden" value={size} />
            <label className="grid gap-1.5 text-sm font-medium">
              Title
              <Input defaultValue={task.title} name="title" required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-sm font-medium">
                Size
                <Select onValueChange={(value) => setSize(value as TaskSize)} value={size}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="M">M</SelectItem>
                    <SelectItem value="S">S</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Estimate
                <Input
                  defaultValue={task.estimateMin ?? ""}
                  min="1"
                  name="estimateMin"
                  placeholder="min"
                  type="number"
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              Deadline
              <Input defaultValue={task.deadline ?? ""} name="deadline" type="date" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Body
              <textarea
                className="min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={task.bodyMd}
                name="bodyMd"
              />
            </label>
            <Button className="justify-self-start" type="submit">
              Save
            </Button>
          </form>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            {task.state === "open" && task.isLeaf ? (
              <form action={markTaskDoneAction}>
                <input name="taskId" type="hidden" value={task.id} />
                <Button type="submit" variant="secondary">
                  Done
                </Button>
              </form>
            ) : null}
            {task.state === "done" ? (
              <form action={reopenTaskAction}>
                <input name="taskId" type="hidden" value={task.id} />
                <Button type="submit" variant="secondary">
                  Reopen
                </Button>
              </form>
            ) : null}
          </div>

          {task.state === "open" ? (
            <form action={splitTaskAction} className="grid gap-3 border-t pt-4">
              <input name="parentId" type="hidden" value={task.id} />
              <input name="size" type="hidden" value={childSize} />
              <h3 className="text-sm font-semibold">Split</h3>
              <Input name="title" placeholder="Child task" required />
              <div className="grid grid-cols-2 gap-3">
                <Select onValueChange={(value) => setChildSize(value as "M" | "S")} value={childSize}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">M</SelectItem>
                    <SelectItem value="S">S</SelectItem>
                  </SelectContent>
                </Select>
                <Input min="1" name="estimateMin" placeholder="min" type="number" />
              </div>
              <Input name="deadline" type="date" />
              <Button className="justify-self-start" type="submit" variant="outline">
                Add child
              </Button>
            </form>
          ) : null}

          <section className="grid gap-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Blocks</h3>
              <Badge variant="outline">{blocks.length}</Badge>
            </div>
            {loadingBlocks ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
            {!loadingBlocks && blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blocks.</p>
            ) : null}
            <div className="grid gap-2">
              {blocks.map((block) => (
                <div
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border bg-background p-3"
                  key={block.id}
                >
                  <div>
                    <p className="text-sm font-medium">{formatBlockRange(block)}</p>
                    <p className="text-xs text-muted-foreground">
                      rescheduled {block.rescheduledCount}
                    </p>
                  </div>
                  <Button
                    disabled={isPending}
                    onClick={() => void deleteBlock(block.id)}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete block</span>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function formatBlockRange(block: TaskBlockClient) {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tokyo"
  });

  return `${formatter.format(new Date(block.startAt))} - ${formatter.format(new Date(block.endAt))}`;
}
