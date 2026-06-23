import { NextResponse } from "next/server";
import { createDailyLog, listDailyLogs } from "@/lib/repository";

export async function GET() {
  const logs = await listDailyLogs();
  return NextResponse.json({ ok: true, logs });
}

export async function POST(req: Request) {
  const log = await createDailyLog(await req.json());
  return NextResponse.json({ ok: true, log });
}
