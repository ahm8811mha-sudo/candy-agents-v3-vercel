import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { createTask, listTasks } from "@/lib/repository";

export async function GET() {
  try {
    const tasks = await listTasks();
    return NextResponse.json({ ok: true, tasks });
  } catch (error) {
    await logError("TASKS_GET_FAILED", error);
    return NextResponse.json({ ok: false, message: "Failed to load tasks" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const task = await createTask(await req.json());
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    await logError("TASK_CREATE_FAILED", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Failed to create task" }, { status: 400 });
  }
}
