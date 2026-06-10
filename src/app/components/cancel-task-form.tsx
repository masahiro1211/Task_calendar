"use client";

import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelTaskAction } from "../actions";

export function CancelTaskForm({
  taskId,
  cancelCandidateCount,
  futureBlockCount
}: {
  taskId: string;
  cancelCandidateCount: number;
  futureBlockCount: number;
}) {
  return (
    <form
      action={cancelTaskAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Cancel ${cancelCandidateCount} open task(s) and delete ${futureBlockCount} future block(s)?`
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input name="taskId" type="hidden" value={taskId} />
      <Button size="icon" type="submit" variant="ghost">
        <Ban className="h-4 w-4 text-destructive" />
        <span className="sr-only">Cancel task</span>
      </Button>
    </form>
  );
}
