import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createTaskAction } from "../actions";

const selectClass = cn(
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
);

export function QuickAddForm() {
  return (
    <form action={createTaskAction} className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        aria-label="タスクを追加"
        className="min-w-0 max-w-xl flex-1"
        name="title"
        placeholder="タスクを追加(例: レポート提出)"
        required
      />
      <select aria-label="サイズ" className={selectClass} defaultValue="L" name="size">
        <option value="L">大:分割して進める</option>
        <option value="M">中</option>
        <option value="S">小</option>
      </select>
      <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        〆切
        <Input aria-label="〆切" className="w-[9.5rem]" name="deadline" type="date" />
      </label>
      <Button type="submit">
        <Plus className="h-4 w-4" />
        追加
      </Button>
    </form>
  );
}
