"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/db/client";
import {
  createTaskService,
  type CreateBlockInput,
  type TaskSize,
  type UpdateBlockInput,
  type UpdateTaskInput
} from "@/services/tasks";

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

  revalidatePath("/");
}

export async function splitTaskAction(formData: FormData) {
  await taskService().splitTask(requiredString(formData.get("parentId"), "parentId"), [
    {
      title: requiredString(formData.get("title"), "title"),
      bodyMd: optionalString(formData.get("bodyMd")) ?? "",
      deadline: optionalString(formData.get("deadline")),
      estimateMin: optionalNumber(formData.get("estimateMin")),
      size: taskSize(formData.get("size"))
    }
  ]);

  revalidatePath("/");
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

  revalidatePath("/");
}

export async function markTaskDoneAction(formData: FormData) {
  await taskService().markTaskDone(requiredString(formData.get("taskId"), "taskId"));
  revalidatePath("/");
}

export async function reopenTaskAction(formData: FormData) {
  await taskService().reopenTask(requiredString(formData.get("taskId"), "taskId"));
  revalidatePath("/");
}

export async function cancelTaskAction(formData: FormData) {
  await taskService().cancelTask(requiredString(formData.get("taskId"), "taskId"));
  revalidatePath("/");
}

export async function createBlockAction(input: CreateBlockInput) {
  const block = await taskService().createBlock(input);
  revalidatePath("/");
  return block;
}

export async function updateBlockAction(blockId: string, input: UpdateBlockInput) {
  const block = await taskService().updateBlock(blockId, input);
  revalidatePath("/");
  return block;
}

export async function deleteBlockAction(blockId: string) {
  const deleted = await taskService().deleteBlock(blockId);
  revalidatePath("/");
  return deleted;
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
