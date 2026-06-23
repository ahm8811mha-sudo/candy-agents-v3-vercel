import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { createDailyLog, listDailyLogs } from "@/lib/repository";

export async function GET() {
  try {
    const logs = await listDailyLogs();
    return NextResponse.json({ ok: true, logs });
  } catch (error) {
    await logError("LOGS_GET_FAILED", error);
    return NextResponse.json({ ok: false, message: "Failed to load daily logs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const log = await createDailyLog(await req.json());
    return NextResponse.json({ ok: true, log });
  } catch (error) {
    await logError("LOG_CREATE_FAILED", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Failed to submit report" }, { status: 400 });
  }
}
