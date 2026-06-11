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
import { formatDateLabel, sizeLabel, stateLabel } from "@/lib/labels";
import {
  deleteBlockAction,
  listTaskBlocksAction,
  markTaskDoneAction,
  reopenTaskAction,
  updateTaskAction
} from "../actions";
import { TaskSplit } from "./task-split";
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

  useEffect(() => {
    if (!task || !open) {
      setBlocks([]);
      return;
    }

    setSize(task.size);
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
            <Badge variant={task.state === "done" ? "secondary" : "outline"}>
              {stateLabel(task.state)}
            </Badge>
            <Badge variant="outline">{sizeLabel(task.size)}</Badge>
            {task.effectiveDeadline ? (
              <Badge variant="outline">〆切 {formatDateLabel(task.effectiveDeadline)}</Badge>
            ) : null}
          </div>
        </SheetHeader>

        <div className="mt-6 grid gap-6">
          {task.state === "open" ? (
            <div className="grid gap-3 border-b pb-6">
              <div>
                <h3 className="text-sm font-semibold">子タスクへ分割</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  分割した中・小タスクは「未配置」からカレンダーへドラッグできます。
                </p>
              </div>
              <TaskSplit onDone={() => onOpenChange(false)} parentId={task.id} />
            </div>
          ) : null}

          <form action={updateTaskAction} className="grid gap-3">
            <input name="taskId" type="hidden" value={task.id} />
            <input name="size" type="hidden" value={size} />
            <label className="grid gap-1.5 text-sm font-medium">
              タイトル
              <Input defaultValue={task.title} name="title" required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-sm font-medium">
                サイズ
                <Select onValueChange={(value) => setSize(value as TaskSize)} value={size}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L">大</SelectItem>
                    <SelectItem value="M">中</SelectItem>
                    <SelectItem value="S">小</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                見積(分)
                <Input
                  defaultValue={task.estimateMin ?? ""}
                  min="1"
                  name="estimateMin"
                  placeholder="分"
                  type="number"
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              〆切
              <Input defaultValue={task.deadline ?? ""} name="deadline" type="date" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              メモ
              <textarea
                className="min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={task.bodyMd}
                name="bodyMd"
              />
            </label>
            <Button className="justify-self-start" type="submit">
              保存
            </Button>
          </form>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            {task.state === "open" && task.isLeaf ? (
              <form action={markTaskDoneAction}>
                <input name="taskId" type="hidden" value={task.id} />
                <Button type="submit" variant="secondary">
                  完了にする
                </Button>
              </form>
            ) : null}
            {task.state === "done" ? (
              <form action={reopenTaskAction}>
                <input name="taskId" type="hidden" value={task.id} />
                <Button type="submit" variant="secondary">
                  再開する
                </Button>
              </form>
            ) : null}
          </div>

          <section className="grid gap-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">カレンダーの予定</h3>
              <Badge variant="outline">{blocks.length}</Badge>
            </div>
            {loadingBlocks ? <p className="text-sm text-muted-foreground">読み込み中…</p> : null}
            {!loadingBlocks && blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだ配置されていません。</p>
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
                      リスケ {block.rescheduledCount} 回
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
                    <span className="sr-only">予定を削除</span>
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
