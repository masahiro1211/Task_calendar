"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { sizeLabel } from "@/lib/labels";
import { splitTaskAction } from "../actions";

type ChildSize = "M" | "S";

interface ChildRow {
  id: string;
  title: string;
  size: ChildSize;
  estimateMin: string;
}

function emptyRow(size: ChildSize = "M"): ChildRow {
  return {
    id: crypto.randomUUID(),
    title: "",
    size,
    estimateMin: ""
  };
}

export function TaskSplit({ parentId, onDone }: { parentId: string; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<ChildRow[]>(() => [emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateRow(id: string, patch: Partial<ChildRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      return next.length === 0 ? [emptyRow()] : next;
    });
  }

  function addRow() {
    setRows((current) => [...current, emptyRow(current[current.length - 1]?.size ?? "M")]);
  }

  const filledCount = rows.filter((row) => row.title.trim() !== "").length;

  async function submit() {
    setError(null);

    const children = rows
      .filter((row) => row.title.trim() !== "")
      .map((row) => ({
        title: row.title.trim(),
        size: row.size,
        estimateMin: row.estimateMin.trim() === "" ? null : row.estimateMin.trim(),
        deadline: null
      }));

    if (children.length === 0) {
      setError("少なくとも1件、タイトルを入力してください。");
      return;
    }

    setSubmitting(true);

    try {
      await splitTaskAction(parentId, children);
      setRows([emptyRow()]);
      startTransition(() => router.refresh());
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "分割に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || isPending;

  return (
    <section className="grid gap-3">
      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div className="grid grid-cols-[1fr_auto_4.5rem_auto] items-center gap-2" key={row.id}>
            <Input
              autoFocus={index === rows.length - 1 && rows.length > 1}
              onChange={(event) => updateRow(row.id, { title: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (index === rows.length - 1 && row.title.trim() !== "") {
                    addRow();
                  }
                }
              }}
              placeholder={index === 0 ? "例: 資料を集める" : "次の子タスク"}
              value={row.title}
            />
            <div className="flex rounded-md border p-0.5">
              {(["M", "S"] as const).map((size) => (
                <button
                  className={cn(
                    "rounded px-2.5 py-1 text-xs transition-colors",
                    row.size === size
                      ? "bg-foreground font-medium text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  key={size}
                  onClick={() => updateRow(row.id, { size })}
                  type="button"
                >
                  {sizeLabel(size)}
                </button>
              ))}
            </div>
            <Input
              aria-label="見積(分)"
              min="1"
              onChange={(event) => updateRow(row.id, { estimateMin: event.target.value })}
              placeholder="分"
              type="number"
              value={row.estimateMin}
            />
            <Button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => removeRow(row.id)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">行を削除</span>
            </Button>
          </div>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center justify-between gap-2">
        <Button onClick={addRow} type="button" variant="ghost">
          <Plus className="h-4 w-4" />
          行を追加
        </Button>
        <Button disabled={busy || filledCount === 0} onClick={() => void submit()} type="button">
          {filledCount > 0 ? `${filledCount}件に分割する` : "分割する"}
        </Button>
      </div>
    </section>
  );
}
