import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { listEmployees } from "@/lib/repository";

export async function GET() {
  try {
    const employees = await listEmployees();
    return NextResponse.json({ ok: true, employees });
  } catch (error) {
    await logError("EMPLOYEES_LIST_FAILED", error);
    return NextResponse.json({ ok: false, message: "Failed to load employees" }, { status: 500 });
  }
}
