"use client";

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
      <button className="text-button danger" type="submit">
        Cancel
      </button>
    </form>
  );
}
