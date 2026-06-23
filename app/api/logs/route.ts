import { NextResponse } from "next/server";
import { listDailyLogs } from "@/lib/repository";

export async function GET() {
  const logs = await listDailyLogs();
  return NextResponse.json({ ok: true, logs });
}
