import { NextResponse } from "next/server";
import { listApprovals } from "@/lib/repository";

export async function GET() {
  const approvals = await listApprovals();
  return NextResponse.json({ ok: true, approvals });
}
