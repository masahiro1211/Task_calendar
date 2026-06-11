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
          `未完了のタスク ${cancelCandidateCount} 件を中止し、今後の予定 ${futureBlockCount} 件を削除します。よろしいですか?`
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input name="taskId" type="hidden" value={taskId} />
      <Button
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        size="icon"
        type="submit"
        variant="ghost"
      >
        <Ban className="h-4 w-4" />
        <span className="sr-only">中止</span>
      </Button>
    </form>
  );
}
