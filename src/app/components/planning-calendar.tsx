"use client";

import { useEffect, useMemo, useRef, useTransition } from "react";
import FullCalendar from "@fullcalendar/react";
import type { EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core";
import interactionPlugin, {
  Draggable,
  type EventReceiveArg,
  type EventResizeDoneArg
} from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useRouter } from "next/navigation";
import {
  createBlockAction,
  deleteBlockAction,
  updateBlockAction
} from "../actions";

export interface PoolTaskClient {
  id: string;
  title: string;
  size: "M" | "S";
  estimateMin: number | null;
  effectiveDeadline: string | null;
}

export interface CalendarBlockClient {
  id: string;
  taskId: string;
  title: string;
  startAt: string;
  endAt: string;
  rescheduledCount: number;
}

export function PlanningCalendar({
  poolTasks,
  blocks
}: {
  poolTasks: PoolTaskClient[];
  blocks: CalendarBlockClient[];
}) {
  const poolRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

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

  const events = useMemo<EventInput[]>(
    () =>
      blocks.map((block) => ({
        id: block.id,
        title: block.title,
        start: block.startAt,
        end: block.endAt,
        extendedProps: {
          taskId: block.taskId,
          rescheduledCount: block.rescheduledCount
        }
      })),
    [blocks]
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

  async function resizeEvent(arg: EventResizeDoneArg) {
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

  async function clickEvent(arg: EventClickArg) {
    if (!window.confirm(`Delete "${arg.event.title}"?`)) {
      return;
    }

    await deleteBlockAction(arg.event.id);
    arg.event.remove();
    startTransition(() => router.refresh());
  }

  return (
    <section className="planning-grid">
      <aside className="pool-panel">
        <div className="panel-heading">
          <h2>Pool</h2>
          <span>{poolTasks.length}</span>
        </div>
        <div ref={poolRef} className="pool-list">
          {poolTasks.map((task) => (
            <div
              key={task.id}
              className="pool-item"
              data-estimate-min={task.estimateMin ?? defaultEstimate(task.size)}
              data-task-id={task.id}
              data-title={task.title}
            >
              <strong>{task.title}</strong>
              <span>
                {task.size}
                {task.effectiveDeadline ? ` / ${task.effectiveDeadline}` : ""}
              </span>
            </div>
          ))}
        </div>
      </aside>
      <div className="calendar-panel">
        <FullCalendar
          allDaySlot={false}
          editable
          eventClick={clickEvent}
          eventDrop={moveEvent}
          eventReceive={receiveEvent}
          eventResize={resizeEvent}
          events={events}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridWeek,timeGridDay"
          }}
          height="auto"
          initialView="timeGridWeek"
          locale="ja"
          nowIndicator
          plugins={[timeGridPlugin, interactionPlugin]}
          slotDuration="00:30:00"
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          timeZone="Asia/Tokyo"
        />
      </div>
    </section>
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
