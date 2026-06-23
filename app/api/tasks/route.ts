import { NextResponse } from "next/server";
import { listTasks } from "@/lib/repository";

export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json({ ok: true, tasks });
}
