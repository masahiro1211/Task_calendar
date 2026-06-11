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
        aria-label="Quick add task"
        className="min-w-0 max-w-xl flex-1"
        name="title"
        placeholder="Quick add"
        required
      />
      <select aria-label="Size" className={selectClass} defaultValue="M" name="size">
        <option value="L">L</option>
        <option value="M">M</option>
        <option value="S">S</option>
      </select>
      <Input
        aria-label="Deadline"
        className="w-[9.5rem] shrink-0"
        name="deadline"
        type="date"
      />
      <Button type="submit">
        <Plus className="h-4 w-4" />
        Add
      </Button>
    </form>
  );
}
