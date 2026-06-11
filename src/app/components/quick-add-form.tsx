import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTaskAction } from "../actions";

export function QuickAddForm() {
  return (
    <form action={createTaskAction} className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        aria-label="タスクを追加"
        className="min-w-0 max-w-xl flex-1"
        name="title"
        placeholder="タスクを追加(〆切はカレンダーの日付クリックでも設定できます)"
        required
      />
      <input name="size" type="hidden" value="L" />
      <Button type="submit">
        <Plus className="h-4 w-4" />
        追加
      </Button>
    </form>
  );
}
