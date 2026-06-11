"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { splitTaskAction } from "../actions";

type ChildSize = "M" | "S";

interface ChildRow {
  id: string;
  title: string;
  size: ChildSize;
  estimateMin: string;
  deadline: string;
}

function emptyRow(size: ChildSize = "S"): ChildRow {
  return {
    id: crypto.randomUUID(),
    title: "",
    size,
    estimateMin: "",
    deadline: ""
  };
}

export function TaskSplit({ parentId, onDone }: { parentId: string; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<ChildRow[]>(() => [emptyRow()]);
  const [bulkText, setBulkText] = useState("");
  const [bulkSize, setBulkSize] = useState<ChildSize>("S");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateRow(id: string, patch: Partial<ChildRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      return next.length === 0 ? [emptyRow(bulkSize)] : next;
    });
  }

  function appendFromBulk() {
    const titles = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");

    if (titles.length === 0) {
      return;
    }

    const added = titles.map((title) => ({ ...emptyRow(bulkSize), title }));

    setRows((current) => {
      const meaningful = current.filter((row) => row.title.trim() !== "");
      return [...meaningful, ...added];
    });
    setBulkText("");
  }

  async function submit() {
    setError(null);

    const children = rows
      .filter((row) => row.title.trim() !== "")
      .map((row) => ({
        title: row.title.trim(),
        size: row.size,
        estimateMin: row.estimateMin.trim() === "" ? null : row.estimateMin.trim(),
        deadline: row.deadline.trim() === "" ? null : row.deadline.trim()
      }));

    if (children.length === 0) {
      setError("少なくとも1件、タイトルを入力してください。");
      return;
    }

    setSubmitting(true);

    try {
      await splitTaskAction(parentId, children);
      setRows([emptyRow()]);
      setBulkText("");
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
      <h3 className="text-sm font-semibold">Split</h3>

      <div className="grid gap-2 rounded-md border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">一括入力(1行1子)</p>
        <textarea
          className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onChange={(event) => setBulkText(event.target.value)}
          placeholder={"資料収集\nドラフト執筆\n推敲"}
          value={bulkText}
        />
        <div className="flex items-center gap-2">
          <Select onValueChange={(value) => setBulkSize(value as ChildSize)} value={bulkSize}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">M</SelectItem>
              <SelectItem value="S">S</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={appendFromBulk} type="button" variant="outline">
            行に追加
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        {rows.map((row) => (
          <div className="grid grid-cols-[1fr_4rem_5rem_auto_auto] items-center gap-2" key={row.id}>
            <Input
              onChange={(event) => updateRow(row.id, { title: event.target.value })}
              placeholder="子タスク"
              value={row.title}
            />
            <Select
              onValueChange={(value) => updateRow(row.id, { size: value as ChildSize })}
              value={row.size}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="M">M</SelectItem>
                <SelectItem value="S">S</SelectItem>
              </SelectContent>
            </Select>
            <Input
              min="1"
              onChange={(event) => updateRow(row.id, { estimateMin: event.target.value })}
              placeholder="min"
              type="number"
              value={row.estimateMin}
            />
            <Input
              className="w-[8.5rem]"
              onChange={(event) => updateRow(row.id, { deadline: event.target.value })}
              type="date"
              value={row.deadline}
            />
            <Button
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

      <div className="flex items-center gap-2">
        <Button onClick={() => setRows((current) => [...current, emptyRow(bulkSize)])} type="button" variant="outline">
          <Plus className="h-4 w-4" />
          行を追加
        </Button>
        <Button disabled={busy} onClick={() => void submit()} type="button">
          一括作成
        </Button>
      </div>
    </section>
  );
}
