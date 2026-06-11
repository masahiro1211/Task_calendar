"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/db/client";
import {
  createTaskService,
  type CreateBlockInput,
  type CreateTaskWithBlockInput,
  type SplitTaskChildInput,
  type TaskSize,
  type UpdateBlockInput,
  type UpdateTaskInput
} from "@/services/tasks";
import { listTaskBlocks } from "@/services/queries";

function taskService() {
  return createTaskService({
    sql: getSql(),
    now: () => new Date()
  });
}

export async function createTaskAction(formData: FormData) {
  const parentId = optionalString(formData.get("parentId"));

  await taskService().createTask({
    parentId,
    title: requiredString(formData.get("title"), "title"),
    bodyMd: optionalString(formData.get("bodyMd")) ?? "",
    deadline: optionalString(formData.get("deadline")),
    estimateMin: optionalNumber(formData.get("estimateMin")),
    size: taskSize(formData.get("size"))
  });

  revalidatePlannerPaths();
}

interface SplitChildPayload {
  title: string;
  size: string;
  estimateMin?: number | string | null;
  deadline?: string | null;
}

export async function splitTaskAction(parentId: string, children: SplitChildPayload[]) {
  if (!parentId) {
    throw new Error("parentId is required.");
  }

  const sanitized: SplitTaskChildInput[] = [];

  for (const child of children) {
    const title = typeof child.title === "string" ? child.title.trim() : "";

    if (title === "") {
      continue;
    }

    sanitized.push({
      title,
      size: childSize(child.size),
      estimateMin: coerceOptionalNumber(child.estimateMin),
      deadline: emptyToNull(child.deadline)
    });
  }

  if (sanitized.length === 0) {
    throw new Error("At least one child with a title is required.");
  }

  const created = await taskService().splitTask(parentId, sanitized);
  revalidatePlannerPaths();
  return created;
}

export async function updateTaskAction(formData: FormData) {
  const input: UpdateTaskInput = {
    title: requiredString(formData.get("title"), "title"),
    bodyMd: optionalString(formData.get("bodyMd")) ?? "",
    deadline: optionalString(formData.get("deadline")),
    estimateMin: optionalNumber(formData.get("estimateMin")),
    size: taskSize(formData.get("size"))
  };

  await taskService().updateTask(requiredString(formData.get("taskId"), "taskId"), input);

  revalidatePlannerPaths();
}

export async function markTaskDoneAction(formData: FormData) {
  await taskService().markTaskDone(requiredString(formData.get("taskId"), "taskId"));
  revalidatePlannerPaths();
}

export async function updateTaskDeadlineAction(taskId: string, deadline: string) {
  if (!taskId) {
    throw new Error("taskId is required.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    throw new Error("Invalid deadline date.");
  }

  await taskService().updateTaskDeadline(taskId, deadline);
  revalidatePlannerPaths();
}

export async function completeTaskTreeAction(formData: FormData) {
  await taskService().completeSubtree(requiredString(formData.get("taskId"), "taskId"));
  revalidatePlannerPaths();
}

export async function reopenTaskAction(formData: FormData) {
  await taskService().reopenTask(requiredString(formData.get("taskId"), "taskId"));
  revalidatePlannerPaths();
}

export async function cancelTaskAction(formData: FormData) {
  await taskService().cancelTask(requiredString(formData.get("taskId"), "taskId"));
  revalidatePlannerPaths();
}

export async function createBlockAction(input: CreateBlockInput) {
  const block = await taskService().createBlock(input);
  revalidatePlannerPaths();
  return block;
}

export async function createTaskWithBlockAction(input: CreateTaskWithBlockInput) {
  const created = await taskService().createTaskWithBlock(input);
  revalidatePlannerPaths();
  return created;
}

export async function updateBlockAction(blockId: string, input: UpdateBlockInput) {
  const block = await taskService().updateBlock(blockId, input);
  revalidatePlannerPaths();
  return block;
}

export async function deleteBlockAction(blockId: string) {
  const deleted = await taskService().deleteBlock(blockId);
  revalidatePlannerPaths();
  return deleted;
}

export async function listTaskBlocksAction(taskId: string) {
  return listTaskBlocks(taskId);
}

function requiredString(value: FormDataEntryValue | null, name: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function optionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function optionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error("Expected a numeric value.");
  }

  return parsed;
}

function taskSize(value: FormDataEntryValue | null): TaskSize {
  if (value === "L" || value === "M" || value === "S") {
    return value;
  }

  throw new Error("Invalid task size.");
}

function childSize(value: string): "M" | "S" {
  if (value === "M" || value === "S") {
    return value;
  }

  throw new Error("Child size must be M or S.");
}

function coerceOptionalNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error("Expected a numeric value.");
  }

  return parsed;
}

function emptyToNull(value: string | null | undefined) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function revalidatePlannerPaths() {
  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath("/tasks");
}
