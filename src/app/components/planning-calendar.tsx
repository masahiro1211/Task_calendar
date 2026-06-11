"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import FullCalendar from "@fullcalendar/react";
import type {
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
  DateSelectArg
} from "@fullcalendar/core";
import jaLocale from "@fullcalendar/core/locales/ja";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, {
  Draggable,
  type EventReceiveArg,
  type EventResizeDoneArg
} from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import { Check, GripVertical, Scissors } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDateLabel, sizeLabel } from "@/lib/labels";
import {
  completeTaskTreeAction,
  createBlockAction,
  createTaskAction,
  markTaskDoneAction,
  reopenTaskAction,
  updateBlockAction,
  updateTaskDeadlineAction
} from "../actions";
import { TaskDetailSheet, type TaskDetailClient } from "./task-detail-sheet";
import { TaskSplit } from "./task-split";

export interface PoolTaskClient {
  id: string;
  title: string;
  size: "M" | "S";
  estimateMin: number | null;
  effectiveDeadline: string | null;
}

export interface NeedsSplitTaskClient {
  id: string;
  title: string;
  effectiveDeadline: string | null;
}

export interface CalendarBlockClient {
  id: string;
  taskId: string;
  title: string;
  taskState: "open" | "done" | "cancelled";
  startAt: string;
  endAt: string;
  rescheduledCount: number;
}

export interface DeadlineLaneTaskClient {
  id: string;
  title: string;
  size: string;
  state: "open" | "done" | "cancelled";
  isLeaf: boolean;
  estimateMin: number | null;
  effectiveDeadline: string;
}

export function PlanningCalendar({
  poolTasks,
  needsSplitTasks,
  blocks,
  deadlineTasks,
  tasks
}: {
  poolTasks: PoolTaskClient[];
  needsSplitTasks: NeedsSplitTaskClient[];
  blocks: CalendarBlockClient[];
  deadlineTasks: DeadlineLaneTaskClient[];
  tasks: TaskDetailClient[];
}) {
  const poolRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [splitTaskId, setSplitTaskId] = useState<string | null>(null);
  const [pendingDeadline, setPendingDeadline] = useState<string | null>(null);
  const [deadlineTaskSize, setDeadlineTaskSize] = useState<"L" | "M" | "S">("L");

  useEffect(() => {
    if (!poolRef.current) {
      return undefined;
    }

    const draggable = new Draggable(poolRef.current, {
      itemSelector: ".pool-item",
      eventData: (element) => ({
        title: element.dataset.title ?? "",
        duration: minutesToDuration(Number(element.dataset.estimateMin || 60))
      })
    });

    return () => draggable.destroy();
  }, [poolTasks]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const splitTask = needsSplitTasks.find((task) => task.id === splitTaskId) ?? null;

  const events = useMemo<EventInput[]>(
    () => [
      ...deadlineTasks.map((task) => {
        const movable = task.state === "open";

        return {
          id: `deadline:${task.id}`,
          title: task.title,
          start: task.effectiveDeadline,
          allDay: true,
          editable: movable,
          startEditable: movable,
          durationEditable: false,
          classNames:
            task.state === "done" ? ["deadline-event", "event-done"] : ["deadline-event"],
          extendedProps: {
            kind: "deadline",
            taskId: task.id,
            size: task.size,
            state: task.state,
            isLeaf: task.isLeaf,
            estimateMin: task.estimateMin
          }
        };
      }),
      ...blocks.map((block) => ({
        id: block.id,
        title: block.title,
        start: block.startAt,
        end: block.endAt,
        editable: true,
        classNames:
          block.taskState === "done" ? ["block-event", "event-done"] : ["block-event"],
        extendedProps: {
          kind: "block",
          taskId: block.taskId,
          state: block.taskState,
          rescheduledCount: block.rescheduledCount
        }
      }))
    ],
    [blocks, deadlineTasks]
  );

  async function receiveEvent(arg: EventReceiveArg) {
    const taskId = arg.draggedEl.dataset.taskId;
    const estimateMin = Number(arg.draggedEl.dataset.estimateMin || 60);
    const startAt = arg.event.start;

    if (!taskId || !startAt) {
      arg.revert();
      return;
    }

    const endAt = arg.event.end ?? new Date(startAt.getTime() + estimateMin * 60_000);

    try {
      await createBlockAction({
        taskId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString()
      });
      arg.event.remove();
      startTransition(() => router.refresh());
    } catch {
      arg.revert();
    }
  }

  async function moveEvent(arg: EventDropArg) {
    if (arg.event.extendedProps.kind === "deadline") {
      await placeDeadlineTask(arg);
      return;
    }

    if (arg.event.extendedProps.kind !== "block") {
      arg.revert();
      return;
    }

    const startAt = arg.event.start;
    const endAt = arg.event.end;

    if (!startAt || !endAt) {
      arg.revert();
      return;
    }

    try {
      await updateBlockAction(arg.event.id, {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString()
      });
      startTransition(() => router.refresh());
    } catch {
      arg.revert();
    }
  }

  // 終日レーンのドラッグ:
  // - 別の日の終日レーンへ → 〆切日を変更
  // - 時間グリッドへ(中・小の葉のみ) → その時刻にブロックを作成、〆切マーカーは残す
  async function placeDeadlineTask(arg: EventDropArg) {
    const startAt = arg.event.start;
    const taskId = arg.event.extendedProps.taskId;

    if (!startAt || typeof taskId !== "string") {
      arg.revert();
      return;
    }

    if (arg.event.allDay) {
      try {
        await updateTaskDeadlineAction(taskId, arg.event.startStr.slice(0, 10));
        startTransition(() => router.refresh());
      } catch {
        arg.revert();
      }
      return;
    }

    const isLeaf = arg.event.extendedProps.isLeaf !== false;
    const size = arg.event.extendedProps.size;

    if (!isLeaf || size === "L") {
      arg.revert();
      return;
    }

    const estimateMin =
      Number(arg.event.extendedProps.estimateMin) || defaultEstimate(size === "S" ? "S" : "M");
    const endAt = new Date(startAt.getTime() + estimateMin * 60_000);

    try {
      await createBlockAction({
        taskId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString()
      });
    } catch {
      // ブロックを作れない場合もマーカーは元に戻すだけでよい
    }

    arg.revert();
    startTransition(() => router.refresh());
  }

  async function resizeEvent(arg: EventResizeDoneArg) {
    if (arg.event.extendedProps.kind !== "block") {
      arg.revert();
      return;
    }

    const startAt = arg.event.start;
    const endAt = arg.event.end;

    if (!startAt || !endAt) {
      arg.revert();
      return;
    }

    try {
      await updateBlockAction(arg.event.id, {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString()
      });
      startTransition(() => router.refresh());
    } catch {
      arg.revert();
    }
  }

  function clickEvent(arg: EventClickArg) {
    const taskId = arg.event.extendedProps.taskId;

    if (typeof taskId === "string") {
      setSelectedTaskId(taskId);
    }
  }

  function selectSlot(arg: DateSelectArg) {
    arg.view.calendar.unselect();

    if (!arg.allDay) {
      return;
    }

    setDeadlineTaskSize("L");
    setPendingDeadline(arg.startStr.slice(0, 10));
  }

  async function createTaskForDeadline(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!pendingDeadline) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();

    if (!title) {
      return;
    }

    const payload = new FormData();
    payload.set("title", title);
    payload.set("size", deadlineTaskSize);
    payload.set("deadline", pendingDeadline);
    await createTaskAction(payload);
    setPendingDeadline(null);
    startTransition(() => router.refresh());
  }

  async function toggleDeadlineDone(
    event: React.MouseEvent,
    taskId: string,
    state: string,
    isLeaf: boolean
  ) {
    event.preventDefault();
    event.stopPropagation();

    const formData = new FormData();
    formData.set("taskId", taskId);

    try {
      if (!isLeaf) {
        if (state === "done") {
          return;
        }

        if (!window.confirm("残っている子タスクをすべて完了にしますか?")) {
          return;
        }

        await completeTaskTreeAction(formData);
      } else if (state === "done") {
        await reopenTaskAction(formData);
      } else {
        await markTaskDoneAction(formData);
      }
    } catch {
      return;
    }

    startTransition(() => router.refresh());
  }

  function renderEventContent(arg: EventContentArg) {
    if (arg.event.extendedProps.kind === "deadline") {
      const taskId = arg.event.extendedProps.taskId as string;
      const state = arg.event.extendedProps.state as string;
      const isLeaf = arg.event.extendedProps.isLeaf !== false;
      const done = state === "done";

      return (
        <div className="deadline-event-content">
          <button
            aria-label={done ? (isLeaf ? "再開する" : "完了済み") : "完了にする"}
            className={cn("deadline-check", done && "deadline-check-done")}
            onClick={(event) => void toggleDeadlineDone(event, taskId, state, isLeaf)}
            onMouseDown={(event) => event.stopPropagation()}
            type="button"
          >
            {done ? <Check className="h-3 w-3" /> : null}
          </button>
          <span className="event-strike truncate">{arg.event.title}</span>
        </div>
      );
    }

    return (
      <div className="block-event-content">
        {arg.timeText ? <span className="block-event-time">{arg.timeText}</span> : null}
        <span className="block-event-title event-strike truncate">{arg.event.title}</span>
      </div>
    );
  }

  return (
    <>
      <section className="grid h-[calc(100vh-3.5rem)] min-h-[640px] grid-cols-[300px_minmax(0,1fr)] overflow-hidden max-lg:h-auto max-lg:grid-cols-1">
        <aside className="flex min-h-0 flex-col border-r bg-muted/50 max-lg:border-b max-lg:border-r-0">
          {needsSplitTasks.length > 0 ? (
            <div className="shrink-0 border-b">
              <div className="flex h-10 items-center justify-between px-3">
                <h2 className="text-xs font-semibold text-muted-foreground">
                  分割待ちの元タスク
                </h2>
                <Badge variant="outline">{needsSplitTasks.length}</Badge>
              </div>
              <div className="grid max-h-56 gap-2 overflow-y-auto px-3 pb-3">
                {needsSplitTasks.map((task) => (
                  <div className="rounded-lg border bg-card p-3 shadow-sm" key={task.id}>
                    <button
                      className="block w-full truncate text-left text-sm font-medium hover:underline"
                      onClick={() => setSelectedTaskId(task.id)}
                      type="button"
                    >
                      {task.title}
                    </button>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "text-xs text-muted-foreground",
                          task.effectiveDeadline ? urgencyText(task.effectiveDeadline) : undefined
                        )}
                      >
                        {task.effectiveDeadline
                          ? `〆切 ${formatDateLabel(task.effectiveDeadline)}`
                          : "〆切なし"}
                      </span>
                      <Button onClick={() => setSplitTaskId(task.id)} size="sm" variant="outline">
                        <Scissors className="h-3.5 w-3.5" />
                        分割する
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
            <h2 className="text-xs font-semibold text-muted-foreground">
              未配置(ドラッグで配置)
            </h2>
            <Badge variant="outline">{poolTasks.length}</Badge>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3" ref={poolRef}>
            {poolTasks.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-muted-foreground">
                未配置のタスクはありません
              </p>
            ) : null}
            <div className="grid gap-2">
              {poolTasks.map((task) => (
                <div
                  className={cn(
                    "pool-item grid cursor-grab gap-1.5 rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
                    urgencyBorder(task.effectiveDeadline)
                  )}
                  data-estimate-min={task.estimateMin ?? defaultEstimate(task.size)}
                  data-task-id={task.id}
                  data-title={task.title}
                  key={task.id}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <span className="truncate text-sm font-medium">{task.title}</span>
                  </div>
                  <div className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
                    <Badge className="px-1.5 py-0 font-semibold" variant="outline">
                      {sizeLabel(task.size)}
                    </Badge>
                    {task.estimateMin ? <span>{task.estimateMin}分</span> : null}
                    {task.effectiveDeadline ? (
                      <span className={urgencyText(task.effectiveDeadline)}>
                        〆切 {formatDateLabel(task.effectiveDeadline)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
        <div className="min-w-0 overflow-hidden p-4">
          <FullCalendar
            allDaySlot
            editable
            eventClick={clickEvent}
            eventContent={renderEventContent}
            eventDrop={moveEvent}
            eventReceive={receiveEvent}
            eventResize={resizeEvent}
            events={events}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "timeGridDay,timeGridWeek,dayGridMonth"
            }}
            height="100%"
            initialView="timeGridDay"
            locale={jaLocale}
            nowIndicator
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            scrollTime={initialScrollTime()}
            selectable
            select={selectSlot}
            slotDuration="00:30:00"
            slotMaxTime="24:00:00"
            slotMinTime="00:00:00"
            timeZone="Asia/Tokyo"
          />
        </div>
      </section>

      <Dialog onOpenChange={(open) => !open && setSplitTaskId(null)} open={splitTask !== null}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>「{splitTask?.title}」を分割</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            中・小タスクに分割すると「未配置」に入り、カレンダーへドラッグして配置できます。
          </p>
          {splitTask ? (
            <TaskSplit onDone={() => setSplitTaskId(null)} parentId={splitTask.id} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && setPendingDeadline(null)} open={pendingDeadline !== null}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              〆切 {pendingDeadline ? formatDateLabel(pendingDeadline) : ""} のタスクを作成
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            この日が〆切のタスクとして登録します。「大」はあとで分割してから配置します。
          </p>
          <form className="grid gap-3" onSubmit={(event) => void createTaskForDeadline(event)}>
            <Input autoFocus name="title" placeholder="タスク名" required />
            <Select
              onValueChange={(value) => setDeadlineTaskSize(value as "L" | "M" | "S")}
              value={deadlineTaskSize}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="L">大:分割して進める</SelectItem>
                <SelectItem value="M">中</SelectItem>
                <SelectItem value="S">小</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit">作成</Button>
          </form>
        </DialogContent>
      </Dialog>

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

function defaultEstimate(size: "M" | "S") {
  return size === "M" ? 120 : 45;
}

function minutesToDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}:00`;
}

function initialScrollTime() {
  const now = new Date();
  now.setHours(now.getHours() - 1);

  return `${String(now.getHours()).padStart(2, "0")}:00:00`;
}

function urgencyBorder(deadline: string | null) {
  if (!deadline) {
    return "border-l-4 border-l-stone-300";
  }

  const today = tokyoDateString(new Date());
  const tomorrow = tokyoDateString(addDays(new Date(), 1));
  const threeDays = tokyoDateString(addDays(new Date(), 3));

  if (deadline <= tomorrow || deadline < today) {
    return "border-l-4 border-l-red-500";
  }

  if (deadline <= threeDays) {
    return "border-l-4 border-l-amber-500";
  }

  return "border-l-4 border-l-stone-300";
}

function urgencyText(deadline: string) {
  const today = tokyoDateString(new Date());
  const tomorrow = tokyoDateString(addDays(new Date(), 1));
  const threeDays = tokyoDateString(addDays(new Date(), 3));

  if (deadline <= tomorrow || deadline < today) {
    return "font-semibold text-red-600";
  }

  if (deadline <= threeDays) {
    return "font-medium text-amber-600";
  }

  return "";
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function tokyoDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}
