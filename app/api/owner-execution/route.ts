import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, requireAuth } from "@/lib/auth";
import { runSafeExecution } from "@/lib/safeExecution";

export async function POST(req: NextRequest) {
  try {
    const actor = await authenticateRequest(req);
    const denied = requireAuth(actor, "OWNER");
    if (denied) return denied;
    const body = await req.json();
    const idempotencyKey = String(req.headers.get("idempotency-key") || body?.idempotencyKey || "").slice(0, 256) || undefined;
    const result = await runSafeExecution(String(body?.request || ""), actor!, idempotencyKey);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed";
    const status = message.includes("وضع القراءة فقط") ? 503 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
