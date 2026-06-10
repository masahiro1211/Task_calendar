import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTaskAction } from "../actions";

export function QuickAddForm() {
  return (
    <form action={createTaskAction} className="flex min-w-0 flex-1 items-center gap-2">
      <input name="size" type="hidden" value="M" />
      <Input
        aria-label="Quick add task"
        className="max-w-xl"
        name="title"
        placeholder="Quick add"
        required
      />
      <Button type="submit">
        <Plus className="h-4 w-4" />
        Add
      </Button>
    </form>
  );
}
