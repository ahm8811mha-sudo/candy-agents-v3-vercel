import { NextResponse } from "next/server";
import { createTask, listTasks } from "@/lib/repository";

export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json({ ok: true, tasks });
}

export async function POST(req: Request) {
  const task = await createTask(await req.json());
  return NextResponse.json({ ok: true, task });
}
